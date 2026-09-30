import { TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "@/theme";

export function HeaderAddButton({ onPress, label = "Add" }: { onPress: () => void; label?: string }) {
  return (
    <TouchableOpacity onPress={onPress} accessibilityRole="button" accessibilityLabel={label} hitSlop={12}>
      <Ionicons name="add" size={28} color={colors.primary} />
    </TouchableOpacity>
  );
}
