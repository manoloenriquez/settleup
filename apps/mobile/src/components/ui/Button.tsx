import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
  type TouchableOpacityProps,
  type ViewStyle,
} from "react-native";
import { colors, borderRadius, spacing, fontSize, fontWeight } from "@/theme";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "destructive";

export interface AppButtonProps extends TouchableOpacityProps {
  title: string;
  variant?: ButtonVariant;
  isLoading?: boolean;
  style?: ViewStyle;
}

export function AppButton({
  title,
  variant = "primary",
  isLoading = false,
  disabled,
  style,
  ...props
}: AppButtonProps) {
  const isDisabled = disabled ?? isLoading;

  return (
    <TouchableOpacity
      activeOpacity={0.75}
      disabled={isDisabled}
      accessibilityRole="button"
      accessibilityState={{ disabled: !!isDisabled, busy: isLoading }}
      accessibilityLabel={title}
      style={[styles.base, variantStyles[variant].container, isDisabled && styles.disabled, style]}
      {...props}
    >
      {isLoading ? (
        <ActivityIndicator
          size="small"
          color={
            variant === "primary" || variant === "danger"
              ? colors.white
              : variant === "destructive"
                ? colors.danger
                : colors.primary
          }
        />
      ) : (
        <Text style={[styles.label, variantStyles[variant].label]}>{title}</Text>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  base: {
    height: 50,
    borderRadius: borderRadius.md,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.xl,
  },
  label: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.semibold,
  },
  disabled: {
    opacity: 0.5,
  },
});

const variantStyles: Record<ButtonVariant, { container: ViewStyle; label: object }> = {
  primary: {
    container: { backgroundColor: colors.primary },
    label: { color: colors.white },
  },
  secondary: {
    container: { backgroundColor: colors.gray100, borderWidth: 1, borderColor: colors.border },
    label: { color: colors.gray700 },
  },
  ghost: {
    container: { backgroundColor: "transparent" },
    label: { color: colors.primary },
  },
  danger: {
    container: { backgroundColor: colors.danger },
    label: { color: colors.white },
  },
  /** Plain red text, for a destructive row that should not dominate the screen. */
  destructive: {
    container: { backgroundColor: "transparent" },
    label: { color: colors.danger },
  },
};
