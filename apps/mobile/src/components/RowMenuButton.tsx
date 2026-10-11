import { TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { presentChoices, type Choice } from "@/hooks/useAddMenu";
import { colors } from "@/theme";

/**
 * One "…" button per list row instead of several tiny text links: a 44pt
 * target, a VoiceOver label naming the row, and a native action sheet with
 * every action spelled out (destructive ones last and in red).
 */
export function RowMenuButton({ title, choices }: { title: string; choices: Choice[] }) {
  if (choices.length === 0) return null;
  const ordered = [...choices.filter((c) => !c.destructive), ...choices.filter((c) => c.destructive)];
  return (
    <TouchableOpacity
      onPress={() => presentChoices(title, ordered)}
      accessibilityRole="button"
      accessibilityLabel={`More actions for ${title}`}
      hitSlop={10}
      style={{ minWidth: 44, minHeight: 44, alignItems: "center", justifyContent: "center" }}
    >
      <Ionicons name="ellipsis-horizontal-circle-outline" size={24} color={colors.primary} />
    </TouchableOpacity>
  );
}
