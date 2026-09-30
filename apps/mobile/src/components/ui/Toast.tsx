import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AccessibilityInfo, Animated, StyleSheet, Text, TouchableOpacity } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { colors, fontSize, fontWeight, spacing, borderRadius } from "@/theme";

export type ToastType = "success" | "error" | "info";

export type ToastAction = { label: string; onPress: () => void };

type ToastState = { id: number; message: string; type: ToastType; action?: ToastAction };

type ToastContextValue = {
  show: (message: string, type?: ToastType, action?: ToastAction) => void;
  /** A confirmation with one follow-up, e.g. "Expense deleted · Undo". */
  withAction: (message: string, action: ToastAction) => void;
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
  const reduceMotion = useRef(false);
  useEffect(() => {
    void AccessibilityInfo.isReduceMotionEnabled().then((enabled) => {
      reduceMotion.current = enabled;
    });
    const sub = AccessibilityInfo.addEventListener("reduceMotionChanged", (enabled) => {
      reduceMotion.current = enabled;
    });
    return () => sub.remove();
  }, []);

  const hide = useCallback(() => {
    Animated.parallel([
      Animated.timing(opacity, { toValue: 0, duration: 180, useNativeDriver: true }),
      Animated.timing(translateY, { toValue: -16, duration: 180, useNativeDriver: true }),
    ]).start(() => setToast(null));
  }, [opacity, translateY]);

  const show = useCallback(
    (message: string, type: ToastType = "info", action?: ToastAction) => {
      if (hideTimer.current) clearTimeout(hideTimer.current);
      setToast({ id: Date.now(), message, type, action });
      AccessibilityInfo.announceForAccessibility(action ? `${message}. ${action.label} available.` : message);
      opacity.setValue(0);
      // Reduce Motion: fade only, no slide.
      translateY.setValue(reduceMotion.current ? 0 : -16);
      Animated.parallel([
        Animated.timing(opacity, { toValue: 1, duration: 200, useNativeDriver: true }),
        Animated.timing(translateY, { toValue: 0, duration: 200, useNativeDriver: true }),
      ]).start();
      hideTimer.current = setTimeout(hide, action ? 5000 : DISMISS_MS[type]);
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
      withAction: (m: string, action: ToastAction) => show(m, "success", action),
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
          pointerEvents={toast.action ? "box-none" : "none"}
        >
          <Ionicons name={TOAST_ICON[toast.type]} size={18} color={TOAST_COLOR[toast.type]} />
          <Text style={styles.message} numberOfLines={3}>
            {toast.message}
          </Text>
          {toast.action && (
            <TouchableOpacity
              onPress={() => {
                const action = toast.action;
                if (hideTimer.current) clearTimeout(hideTimer.current);
                hide();
                action?.onPress();
              }}
              accessibilityRole="button"
              hitSlop={12}
              style={styles.actionBtn}
            >
              <Text style={styles.actionText}>{toast.action.label}</Text>
            </TouchableOpacity>
          )}
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
  actionBtn: { paddingHorizontal: spacing.sm, paddingVertical: spacing.xs },
  actionText: { color: colors.primary, fontWeight: fontWeight.bold, fontSize: fontSize.base },
  message: {
    flex: 1,
    fontSize: fontSize.base,
    color: colors.gray900,
    fontWeight: fontWeight.medium,
  },
});
