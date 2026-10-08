import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Linking,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Stack, useRouter } from "expo-router";
import { useAuth } from "@/context/AuthContext";
import { useProfile } from "@/hooks/useProfile";
import { useAiAvailability } from "@/hooks/useAiAvailability";
import { usePendingCounts } from "@/hooks/useOutbox";
import { useOutbox } from "@/context/OutboxContext";
import { AppButton, Avatar, Badge, Card, ListItem, SkeletonCard, useToast } from "@/components/ui";
import { deleteAccount } from "@/services/account";
import { removeAllMyQRImages } from "@/services/payment-profiles";
import {
  getPushRegistration,
  NOTIFICATIONS_BLOCKED,
  registerForPush,
  unregisterFromPush,
} from "@/services/push";
import { colors, fontSize, fontWeight, spacing, borderRadius } from "@/theme";
import { currencyName } from "@template/shared";
import { CurrencyPicker } from "@/components/CurrencyPicker";
import { usePreferences } from "@/context/PreferencesContext";
import { usePersonalLedger } from "@/context/PersonalLedgerContext";
import { largeTitleOptions } from "@/lib/navigation";
import { ROUTES } from "@/lib/routes";
const SUPPORT_EMAIL = process.env.EXPO_PUBLIC_SUPPORT_EMAIL;

export default function AccountTab() {
  const { session } = useAuth();
  return session ? <AccountScreen /> : <GuestAccountScreen />;
}

/** Default currency and what runs on this iPhone — shown to everyone. */
function PreferencesSection() {
  const { preferences, setDefaultCurrency } = usePreferences();
  const aiAvailability = useAiAvailability();
  const toast = useToast();
  const [pickerOpen, setPickerOpen] = useState(false);
  return (
    <>
      <Text style={styles.sectionLabel}>PREFERENCES</Text>
      <Card padding={0}>
        <ListItem
          title="Main Currency"
          subtitle={`${currencyName(preferences.defaultCurrency)} (${preferences.defaultCurrency}) · new expenses start in it`}
          left={<Ionicons name="cash-outline" size={20} color={colors.primary} />}
          showChevron
          onPress={() => setPickerOpen(true)}
        />
        <View style={styles.divider} />
        <ListItem
          title="On-device intelligence"
          subtitle={
            aiAvailability.state === "ready"
              ? "Receipt scanning and “Describe it” run on this iPhone with Apple Intelligence. Photos and expenses never leave the device for this."
              : aiAvailability.state === "checking"
                ? "Checking Apple Intelligence…"
                : (aiAvailability.reason ?? "Apple Intelligence isn't available on this device.")
          }
          left={<Ionicons name="shield-checkmark-outline" size={20} color={colors.primary} />}
        />
      </Card>
      <CurrencyPicker
        visible={pickerOpen}
        selected={preferences.defaultCurrency}
        onSelect={(code) => {
          void setDefaultCurrency(code).then(
            () => toast.success(`New expenses will use ${code}`),
            () => toast.error("The currency couldn’t be saved."),
          );
        }}
        onClose={() => setPickerOpen(false)}
      />
    </>
  );
}

function GuestAccountScreen() {
  const router = useRouter();
  const { expenses } = usePersonalLedger();
  return (
    <>
      <Stack.Screen options={{ ...largeTitleOptions, title: "Account" }} />
      <ScrollView keyboardShouldPersistTaps="handled" style={styles.scroll} contentContainerStyle={styles.content} contentInsetAdjustmentBehavior="automatic">
        <Card style={styles.profileCard}>
          <Text style={styles.profileName}>You’re using Talli without an account</Text>
          <Text style={styles.guestBody}>
            {expenses.length > 0
              ? `Your ${expenses.length} ${expenses.length === 1 ? "expense is" : "expenses are"} saved on this iPhone only. `
              : "Everything you add is saved on this iPhone only. "}
            Create a free account to back them up, use them on other devices, and share expenses with
            friends.
          </Text>
          <View style={styles.guestActions}>
            <AppButton title="Create Account" onPress={() => router.push(ROUTES.register)} />
            <AppButton title="Sign In" variant="secondary" onPress={() => router.push(ROUTES.login)} />
          </View>
        </Card>
        <PreferencesSection />
      </ScrollView>
    </>
  );
}

function AccountScreen() {
  const toast = useToast();
  const router = useRouter();
  const { session, signOut } = useAuth();
  const { data: profile, isLoading } = useProfile();
  const [deleting, setDeleting] = useState(false);
  const [pushEnabled, setPushEnabled] = useState(false);
  const [pushBusy, setPushBusy] = useState(false);
  const { pending: outboxPending } = usePendingCounts();
  const { drain } = useOutbox();
  const personal = usePersonalLedger();
  const pending = outboxPending + personal.pendingCount;

  const userId = session?.user.id;
  useEffect(() => {
    if (!userId) return;
    let active = true;
    void getPushRegistration(userId).then((res) => {
      if (active && res.data !== null) setPushEnabled(res.data);
    });
    return () => {
      active = false;
    };
  }, [userId]);

  async function handleTogglePush(next: boolean) {
    const userId = session?.user.id;
    if (!userId || pushBusy) return;
    setPushBusy(true);
    if (next) {
      const res = await registerForPush(userId);
      if (res.error === NOTIFICATIONS_BLOCKED) {
        Alert.alert("Notifications are off", NOTIFICATIONS_BLOCKED, [
          { text: "Not Now", style: "cancel" },
          { text: "Open Settings", onPress: () => void Linking.openSettings() },
        ]);
      } else if (res.error) {
        toast.error(res.error);
      } else {
        setPushEnabled(true);
        toast.success("Push notifications on");
      }
    } else {
      const res = await unregisterFromPush(userId);
      if (res.error) {
        toast.error(res.error);
      } else {
        setPushEnabled(false);
        toast.success("Push notifications off");
      }
    }
    setPushBusy(false);
  }

  function confirmSignOut() {
    Alert.alert("Sign out?", "You can sign back in at any time.", [
      { text: "Cancel", style: "cancel" },
      { text: "Sign Out", style: "destructive", onPress: () => void signOut() },
    ]);
  }

  function handleSignOut() {
    if (pending === 0) {
      confirmSignOut();
      return;
    }
    const noun = pending === 1 ? "1 change hasn't" : `${pending} changes haven't`;
    Alert.alert(
      `${noun} synced yet`,
      "They stay saved on this iPhone and upload the next time you sign in to this account. Signing in to a different account will not upload them.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Try to Sync Now",
          onPress: () => {
            void Promise.all([drain(), personal.syncNow()]).then(() =>
              toast.success("Sync finished. Anything still waiting shows in the banner at the top."),
            );
          },
        },
        { text: "Sign Out Anyway", style: "destructive", onPress: () => void signOut() },
      ],
    );
  }

  function handleDeleteAccount() {
    Alert.alert(
      "Delete Account",
      "This removes your identity and payment settings from this app. Shared records remain under Former member. Transfer ownership first to keep your groups editable; otherwise they become read-only. Other apps and logins are preserved. This cannot be undone.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            const accessToken = session?.access_token;
            if (!accessToken) {
              toast.error("Please sign in again before deleting your account.");
              return;
            }
            setDeleting(true);
            await removeAllMyQRImages(session?.user.id ?? "").catch(() => undefined);
            const res = await deleteAccount(accessToken);
            setDeleting(false);
            if (res.error) {
              toast.error(res.error);
              return;
            }
            await signOut();
          },
        },
      ],
    );
  }

  async function handleBetaFeedback() {
    if (!SUPPORT_EMAIL) {
      Alert.alert(
        "Preview support",
        "Please contact the person who shared this preview. The support mailbox is not configured yet.",
      );
      return;
    }
    const subject = encodeURIComponent("Talli feedback");
    const url = `mailto:${SUPPORT_EMAIL}?subject=${subject}`;
    const supported = await Linking.canOpenURL(url);
    if (!supported) {
      Alert.alert("Email unavailable", `Send feedback to ${SUPPORT_EMAIL}.`);
      return;
    }
    await Linking.openURL(url);
  }

  const displayName = profile?.full_name ?? session?.user.email ?? "User";
  const email = session?.user.email ?? "";
  const role = profile?.role ?? "user";
  const memberSince = profile?.created_at
    ? new Date(profile.created_at).toLocaleDateString(undefined, { year: "numeric", month: "long" })
    : "";

  return (
    <>
      <Stack.Screen options={{ ...largeTitleOptions, title: "Account" }} />
      <ScrollView keyboardShouldPersistTaps="handled" style={styles.scroll} contentContainerStyle={styles.content} contentInsetAdjustmentBehavior="automatic">
        {isLoading ? (
          <SkeletonCard />
        ) : (
          <Card style={styles.profileCard}>
            <View style={styles.profileTop}>
              <Avatar name={displayName} size={56} />
              <View style={styles.profileInfo}>
                <Text style={styles.profileName}>{displayName}</Text>
                <Text style={styles.profileEmail}>{email}</Text>
                <View style={styles.badgeRow}>
                  {role === "admin" && <Badge label="Admin" variant="primary" />}
                  {memberSince && <Text style={styles.memberSince}>Since {memberSince}</Text>}
                </View>
              </View>
            </View>
          </Card>
        )}

        <PreferencesSection />

        <Text style={styles.sectionLabel}>YOUR EXPENSES</Text>
        <Card padding={0}>
          <ListItem
            title="Backup and sync"
            subtitle={
              personal.syncStatus === "syncing"
                ? "Syncing…"
                : personal.pendingCount > 0
                  ? `${personal.pendingCount} ${personal.pendingCount === 1 ? "change is" : "changes are"} waiting to upload${personal.syncStatus === "offline" ? " — you’re offline" : ""}.`
                  : personal.syncStatus === "error"
                    ? `Couldn’t sync: ${personal.syncError ?? "try again"}`
                    : "Your personal expenses are backed up to your account."
            }
            left={<Ionicons name="cloud-done-outline" size={20} color={colors.primary} />}
            onPress={() => void personal.syncNow()}
          />
          {personal.guestExpenseCount > 0 && (
            <>
              <View style={styles.divider} />
              <ListItem
                title={`Add ${personal.guestExpenseCount} ${personal.guestExpenseCount === 1 ? "expense" : "expenses"} from this iPhone`}
                subtitle="Saved before you signed in. They stay on this iPhone until you add them."
                left={<Ionicons name="phone-portrait-outline" size={20} color={colors.primary} />}
                showChevron
                onPress={() =>
                  void personal.importGuestExpenses().then(
                    () => toast.success("Added to your account"),
                    () => toast.error("They’re still on this iPhone. Try again in a moment."),
                  )
                }
              />
            </>
          )}
        </Card>

        <Text style={styles.sectionLabel}>SETTINGS</Text>
        <Card padding={0}>
          <ListItem
            title="Payment Details"
            subtitle="GCash, bank account and QR code people use to pay you"
            left={<Ionicons name="card-outline" size={20} color={colors.primary} />}
            showChevron
            onPress={() => router.push("/(protected)/(tabs)/account/payment")}
          />
          <View style={styles.divider} />
          <ListItem
            title="Edit Profile"
            subtitle="Update your name"
            left={
              <Ionicons name="pencil-outline" size={20} color={colors.gray600 ?? colors.gray400} />
            }
            showChevron
            onPress={() => router.push("/(protected)/(tabs)/account/edit-profile")}
          />
          <View style={styles.divider} />
          <ListItem
            title="Push Notifications"
            subtitle="New expenses and payment confirmations"
            left={<Ionicons name="notifications-outline" size={20} color={colors.warning} />}
            right={
              <Switch
                value={pushEnabled}
                onValueChange={(v) => void handleTogglePush(v)}
                disabled={pushBusy}
                trackColor={{ true: colors.primary }}
                accessibilityLabel="Push notifications"
              />
            }
          />
          <View style={styles.divider} />
          <ListItem
            title="Beta Feedback"
            subtitle="Report bugs or confusing trip flows"
            left={
              <Ionicons
                name="chatbubble-ellipses-outline"
                size={20}
                color={colors.success ?? colors.primary}
              />
            }
            showChevron
            onPress={handleBetaFeedback}
          />
        </Card>

        <TouchableOpacity accessibilityRole="button" style={styles.signOutBtn} onPress={handleSignOut} activeOpacity={0.7}>
          <Text style={styles.signOutText}>Sign Out</Text>
        </TouchableOpacity>

        <Text style={styles.dangerLabel}>DANGER ZONE</Text>
        <TouchableOpacity
          accessibilityRole="button"
          style={[styles.deleteBtn, deleting && styles.deleteBtnDisabled]}
          onPress={handleDeleteAccount}
          activeOpacity={0.7}
          disabled={deleting}
        >
          {deleting ? (
            <ActivityIndicator color={colors.danger} />
          ) : (
            <Text style={styles.deleteText}>Delete Account</Text>
          )}
        </TouchableOpacity>
        <Text style={styles.dangerHint}>
          Removes your app identity and payment details. Shared expense records remain.
        </Text>
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.base, paddingBottom: spacing["2xl"] },

  profileCard: { marginBottom: spacing.base },
  guestBody: { fontSize: fontSize.base, lineHeight: 21, color: colors.gray600, marginTop: spacing.sm },
  guestActions: { gap: spacing.sm, marginTop: spacing.base },
  profileTop: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  profileInfo: { flex: 1 },
  profileName: { fontSize: fontSize.lg, fontWeight: fontWeight.bold, color: colors.gray900 },
  profileEmail: { fontSize: fontSize.sm, color: colors.gray500, marginTop: 2 },
  badgeRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginTop: spacing.xs },
  memberSince: { fontSize: fontSize.xs, color: colors.gray400 },

  sectionLabel: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.bold,
    color: colors.gray400,
    letterSpacing: 0.8,
    marginBottom: spacing.sm,
    marginTop: spacing.base,
  },

  divider: { height: 1, backgroundColor: colors.border, marginLeft: spacing.base },

  signOutBtn: {
    marginTop: spacing.xl,
    backgroundColor: colors.gray100,
    borderRadius: borderRadius.lg,
    padding: spacing.base,
    alignItems: "center",
  },
  signOutText: { color: colors.gray700, fontWeight: fontWeight.semibold, fontSize: fontSize.md },

  dangerLabel: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.bold,
    color: colors.danger,
    letterSpacing: 0.8,
    marginTop: spacing.xl,
    marginBottom: spacing.sm,
  },
  deleteBtn: {
    backgroundColor: colors.dangerLight,
    borderRadius: borderRadius.lg,
    padding: spacing.base,
    alignItems: "center",
    borderWidth: 1,
    borderColor: colors.danger,
  },
  deleteBtnDisabled: { opacity: 0.6 },
  deleteText: { color: colors.danger, fontWeight: fontWeight.semibold, fontSize: fontSize.md },
  dangerHint: {
    fontSize: fontSize.xs,
    color: colors.gray500,
    marginTop: spacing.sm,
    lineHeight: 16,
  },
});
