import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
  type TouchableOpacityProps,
  type ViewStyle,
} from "react-native";
import { colors, borderRadius, spacing, fontSize, fontWeight } from "@/theme";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type ButtonSize = "sm" | "md" | "lg";

export interface AppButtonProps extends TouchableOpacityProps {
  title: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  isLoading?: boolean;
  style?: ViewStyle;
}

export function AppButton({
  title,
  variant = "primary",
  size = "md",
  isLoading = false,
  disabled,
  style,
  ...props
}: AppButtonProps) {
  const isDisabled = disabled ?? isLoading;

  return (
    <TouchableOpacity
      accessibilityRole="button"
      accessibilityState={{ disabled: isDisabled, busy: isLoading }}
      activeOpacity={0.75}
      disabled={isDisabled}
      style={[styles.base, sizeStyles[size], variantStyles[variant].container, isDisabled && styles.disabled, style]}
      {...props}
    >
      {isLoading ? (
        <ActivityIndicator
          size="small"
          color={variant === "primary" || variant === "danger" ? colors.white : colors.primary}
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
};

const sizeStyles: Record<ButtonSize, ViewStyle> = {
  sm: { height: 40, paddingHorizontal: spacing.base },
  md: { height: 48 },
  lg: { height: 52, paddingHorizontal: spacing["2xl"] },
};
