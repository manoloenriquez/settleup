import { useEffect, useState, Component, type ReactNode } from "react";
import { ActivityIndicator, AppState, StyleSheet, Text, View } from "react-native";
import { Stack, useRouter, useSegments } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { QueryProvider } from "@/context/QueryContext";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import * as Notifications from "expo-notifications";
import * as Sentry from "@sentry/react-native";
import { AuthProvider, useAuth } from "@/context/AuthContext";
import { OutboxProvider } from "@/context/OutboxContext";
import { PreferencesProvider, usePreferences } from "@/context/PreferencesContext";
import { PersonalLedgerProvider } from "@/context/PersonalLedgerContext";
import { GuestImportPrompt } from "@/components/GuestImportPrompt";
import { ToastProvider } from "@/components/ui/Toast";
import { OfflineBanner } from "@/components/ui/OfflineBanner";
import { PendingChangesSheet } from "@/components/PendingChangesSheet";
import { usePendingCounts } from "@/hooks/useOutbox";
import { setupReactQueryNetworkWiring } from "@/lib/network";
import { supabase } from "@/lib/supabase";
import { pendingAuthDestination, saveAuthDestination } from "@/lib/auth-links";
import { subscribeToPushTokenRotation } from "@/services/push";
import { notificationGroupRoute } from "@/lib/notifications";
import { isGuestAllowed, ROUTES } from "@/lib/routes";
import { colors } from "@/theme";

// Show push notifications as banners while the app is foregrounded.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

// Initialize Sentry as early as possible. No-op if no DSN is configured.
const sentryDsn = process.env.EXPO_PUBLIC_SENTRY_DSN;
if (sentryDsn) {
  Sentry.init({
    dsn: sentryDsn,
    enabled: !__DEV__,
    environment: process.env.EXPO_PUBLIC_SENTRY_ENV ?? (__DEV__ ? "development" : "production"),
    tracesSampleRate: 0.1,
  });
}

// ---------------------------------------------------------------------------
// ErrorBoundary
// ---------------------------------------------------------------------------

type ErrorBoundaryState = { hasError: boolean; error: Error | null };

class ErrorBoundary extends Component<{ children: ReactNode }, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error): void {
    Sentry.captureException(error);
  }

  render() {
    if (this.state.hasError) {
      return (
        <View style={styles.errorContainer} accessibilityRole="alert">
          <Text style={styles.errorTitle}>Talli ran into a problem</Text>
          <Text style={styles.errorMessage}>
            Your expenses are safe on this iPhone. Try again, and if this keeps happening, close
            and reopen the app.
          </Text>
          <Text
            style={styles.errorRetry}
            accessibilityRole="button"
            onPress={() => this.setState({ hasError: false, error: null })}
          >
            Try Again
          </Text>
        </View>
      );
    }
    return this.props.children;
  }
}

// ---------------------------------------------------------------------------
// RouteGuard
// ---------------------------------------------------------------------------

function RouteGuard() {
  const { session, loading, accountClosed, recovering } = useAuth();
  const { loaded: prefsLoaded, onboarded, preferences, completeOnboarding } = usePreferences();
  const segments = useSegments();
  const router = useRouter();

  // People who already had an account before onboarding existed skip it.
  useEffect(() => {
    if (prefsLoaded && session && !onboarded) {
      void completeOnboarding(preferences.defaultCurrency).catch(() => undefined);
    }
  }, [prefsLoaded, session, onboarded, preferences.defaultCurrency, completeOnboarding]);

  useEffect(() => {
    if (loading || !prefsLoaded) return;

    const inAuthGroup = segments[0] === "(auth)";
    const inProtectedGroup = segments[0] === "(protected)";
    const path = segments.join("/");
    const publicLink = path === "claim" || path === "join" || path === "auth/callback";
    const inOnboarding = path === "onboarding";
    if (session && accountClosed) {
      if (path !== "account-closed") router.replace("/account-closed");
      return;
    }
    if (path === "auth/callback") return;
    if (session && recovering && path !== "(auth)/update-password") {
      router.replace("/(auth)/update-password");
      return;
    }
    if (path === "(auth)/update-password" || publicLink) return;

    if (!session) {
      // Guests: onboarding once, then the parts of the app that need no account.
      if (!onboarded) {
        if (!inOnboarding && !inAuthGroup) router.replace(ROUTES.onboarding);
        return;
      }
      if (inAuthGroup) return;
      if (inProtectedGroup && isGuestAllowed(segments)) return;
      // Account-only screens explain themselves on the Shared tab.
      router.replace(inProtectedGroup ? ROUTES.shared : ROUTES.home);
      return;
    }

    if (!inProtectedGroup) {
      let cancelled = false;
      void pendingAuthDestination()
        .then((destination) => {
          if (!cancelled) router.replace(destination);
        })
        .catch(() => {
          if (!cancelled) router.replace(ROUTES.home);
        });
      return () => {
        cancelled = true;
      };
    }
  }, [session, loading, prefsLoaded, onboarded, accountClosed, recovering, segments, router]);

  return null;
}

// ---------------------------------------------------------------------------
// Offline status area — banner with pending count; tap opens the sheet.
// ---------------------------------------------------------------------------

function OfflineStatusArea() {
  const { pending } = usePendingCounts();
  const [sheetVisible, setSheetVisible] = useState(false);

  return (
    <>
      <OfflineBanner
        pendingCount={pending}
        onPress={pending > 0 ? () => setSheetVisible(true) : undefined}
      />
      <PendingChangesSheet visible={sheetVisible} onClose={() => setSheetVisible(false)} />
    </>
  );
}

// ---------------------------------------------------------------------------
// Root stack
// ---------------------------------------------------------------------------

function PushTokenSync(): null {
  const { session } = useAuth();
  const userId = session?.user.id;
  useEffect(() => {
    if (!userId) return;
    return subscribeToPushTokenRotation(userId);
  }, [userId]);
  return null;
}

function NotificationNavigation(): null {
  const router = useRouter();
  const { session } = useAuth();
  useEffect(() => {
    const handle = (response: Notifications.NotificationResponse): void => {
      const route = notificationGroupRoute(response.notification.request.content.data);
      if (!route) return;
      const groupId = route.slice("/groups/".length);
      void (async () => {
        await saveAuthDestination(route);
        router.push(
          session
            ? { pathname: "/(protected)/groups/[id]", params: { id: groupId } }
            : "/(auth)/login",
        );
        await Notifications.clearLastNotificationResponseAsync();
      })().catch(() => undefined);
    };
    const subscription = Notifications.addNotificationResponseReceivedListener(handle);
    void Notifications.getLastNotificationResponseAsync().then((response) => {
      if (response) handle(response);
    });
    return () => subscription.remove();
  }, [router, session]);
  return null;
}

function RootStack() {
  const { loading } = useAuth();
  const { loaded: prefsLoaded } = usePreferences();

  if (loading || !prefsLoaded) {
    return (
      <View style={styles.splash}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="onboarding" options={{ gestureEnabled: false }} />
      <Stack.Screen name="(auth)" />
      <Stack.Screen name="(protected)" />
    </Stack>
  );
}

// ---------------------------------------------------------------------------
// Root layout
// ---------------------------------------------------------------------------

function RootLayout() {
  // React Query connectivity/foreground wiring (NetInfo + AppState).
  useEffect(() => setupReactQueryNetworkWiring(), []);

  // Supabase's recommended RN pattern: only run the token auto-refresh timer
  // while the app is foregrounded — saves battery and avoids refresh attempts
  // that would fail in a suspended state.
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (status) => {
      if (status === "active") {
        void supabase.auth.startAutoRefresh();
      } else {
        void supabase.auth.stopAutoRefresh();
      }
    });
    void supabase.auth.startAutoRefresh();
    return () => {
      subscription.remove();
      void supabase.auth.stopAutoRefresh();
    };
  }, []);

  return (
    <ErrorBoundary>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <QueryProvider>
          <AuthProvider>
            <PreferencesProvider>
              <PersonalLedgerProvider>
                <ToastProvider>
                  <OutboxProvider>
                    <StatusBar style="auto" />
                    <OfflineStatusArea />
                    <RouteGuard />
                    <NotificationNavigation />
                    <PushTokenSync />
                <GuestImportPrompt />
                    <RootStack />
                  </OutboxProvider>
                </ToastProvider>
              </PersonalLedgerProvider>
            </PreferencesProvider>
          </AuthProvider>
        </QueryProvider>
      </GestureHandlerRootView>
    </ErrorBoundary>
  );
}

export default sentryDsn ? Sentry.wrap(RootLayout) : RootLayout;

const styles = StyleSheet.create({
  splash: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surface,
  },
  errorContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
    backgroundColor: colors.surface,
  },
  errorTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: colors.gray900,
    marginBottom: 8,
  },
  errorMessage: {
    fontSize: 14,
    lineHeight: 20,
    color: colors.gray500,
    textAlign: "center",
  },
  errorRetry: {
    marginTop: 20,
    paddingVertical: 12,
    paddingHorizontal: 24,
    fontSize: 16,
    fontWeight: "600",
    color: colors.primary,
  },
});
