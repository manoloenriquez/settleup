import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
  type TouchableOpacityProps,
  type ViewStyle,
} from "react-native";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";

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
      style={[styles.base, variantStyles[variant].container, isDisabled && styles.disabled, style]}
      {...props}
    >
      {isLoading ? (
        <ActivityIndicator
          size="small"
          color={variant === "primary" || variant === "danger" ? "#fff" : "#6366f1"}
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
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 20,
  },
  label: {
    fontSize: 15,
    fontWeight: "600",
  },
  disabled: {
    opacity: 0.5,
  },
});

const variantStyles: Record<ButtonVariant, { container: ViewStyle; label: object }> = {
  primary: {
    container: { backgroundColor: "#6366f1" },
    label: { color: "#fff" },
  },
  secondary: {
    container: { backgroundColor: "#f1f5f9", borderWidth: 1, borderColor: "#e2e8f0" },
    label: { color: "#374151" },
  },
  ghost: {
    container: { backgroundColor: "transparent" },
    label: { color: "#6366f1" },
  },
  danger: {
    container: { backgroundColor: "#ef4444" },
    label: { color: "#fff" },
  },
};
