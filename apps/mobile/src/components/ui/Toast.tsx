import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AccessibilityInfo, Animated, StyleSheet, Text } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { colors, fontSize, fontWeight, spacing, borderRadius } from "@/theme";

export type ToastType = "success" | "error" | "info";

type ToastState = { id: number; message: string; type: ToastType };

type ToastContextValue = {
  show: (message: string, type?: ToastType) => void;
  success: (message: string) => void;
  error: (message: string) => void;
  info: (message: string) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within ToastProvider");
  return ctx;
}

const TOAST_ICON: Record<ToastType, keyof typeof Ionicons.glyphMap> = {
  success: "checkmark-circle",
  error: "alert-circle",
  info: "information-circle",
};

const TOAST_COLOR: Record<ToastType, string> = {
  success: colors.success,
  error: colors.danger,
  info: colors.gray700,
};

const DISMISS_MS: Record<ToastType, number> = {
  success: 2500,
  error: 4000,
  info: 3000,
};

export function ToastProvider({ children }: { children: ReactNode }): React.ReactElement {
  const [toast, setToast] = useState<ToastState | null>(null);
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(-16)).current;
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const insets = useSafeAreaInsets();

  const hide = useCallback(() => {
    Animated.parallel([
      Animated.timing(opacity, { toValue: 0, duration: 180, useNativeDriver: true }),
      Animated.timing(translateY, { toValue: -16, duration: 180, useNativeDriver: true }),
    ]).start(() => setToast(null));
  }, [opacity, translateY]);

  const show = useCallback(
    (message: string, type: ToastType = "info") => {
      if (hideTimer.current) clearTimeout(hideTimer.current);
      setToast({ id: Date.now(), message, type });
      AccessibilityInfo.announceForAccessibility(message);
      opacity.setValue(0);
      translateY.setValue(-16);
      Animated.parallel([
        Animated.timing(opacity, { toValue: 1, duration: 200, useNativeDriver: true }),
        Animated.timing(translateY, { toValue: 0, duration: 200, useNativeDriver: true }),
      ]).start();
      hideTimer.current = setTimeout(hide, DISMISS_MS[type]);
    },
    [hide, opacity, translateY],
  );

  useEffect(() => {
    return () => {
      if (hideTimer.current) clearTimeout(hideTimer.current);
    };
  }, []);

  const value = useMemo<ToastContextValue>(
    () => ({
      show,
      success: (m: string) => show(m, "success"),
      error: (m: string) => show(m, "error"),
      info: (m: string) => show(m, "info"),
    }),
    [show],
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      {toast && (
        <Animated.View
          style={[styles.toast, { top: insets.top + spacing.sm, opacity, transform: [{ translateY }] }]}
          accessibilityLiveRegion="polite"
          pointerEvents="none"
        >
          <Ionicons name={TOAST_ICON[toast.type]} size={18} color={TOAST_COLOR[toast.type]} />
          <Text style={styles.message} numberOfLines={3}>
            {toast.message}
          </Text>
        </Animated.View>
      )}
    </ToastContext.Provider>
  );
}

const styles = StyleSheet.create({
  toast: {
    position: "absolute",
    left: spacing.base,
    right: spacing.base,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.base,
    shadowColor: colors.black,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 6,
    zIndex: 1000,
  },
  message: {
    flex: 1,
    fontSize: fontSize.base,
    color: colors.gray900,
    fontWeight: fontWeight.medium,
  },
});
