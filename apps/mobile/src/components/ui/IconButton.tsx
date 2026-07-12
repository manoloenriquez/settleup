import { ActivityIndicator, StyleSheet, TouchableOpacity, type TouchableOpacityProps } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, borderRadius } from "@/theme";

type IconButtonProps = TouchableOpacityProps & {
  label: string;
  icon: React.ComponentProps<typeof Ionicons>["name"];
  isLoading?: boolean;
  tone?: "neutral" | "danger";
};

export function IconButton({ label, icon, isLoading = false, tone = "neutral", disabled, style, ...props }: IconButtonProps): React.ReactElement {
  return (
    <TouchableOpacity
      accessibilityRole="button"
      accessibilityLabel={label}
      activeOpacity={0.72}
      disabled={disabled ?? isLoading}
      style={[styles.button, tone === "danger" && styles.danger, style]}
      {...props}
    >
      {isLoading ? <ActivityIndicator size="small" color={colors.primary} /> : <Ionicons name={icon} size={20} color={tone === "danger" ? colors.danger : colors.gray600} />}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  button: { width: 44, height: 44, alignItems: "center", justifyContent: "center", borderRadius: borderRadius.md },
  danger: { backgroundColor: colors.dangerLight },
});
