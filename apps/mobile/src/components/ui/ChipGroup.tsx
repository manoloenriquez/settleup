import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { colors, fontSize, fontWeight, spacing, borderRadius } from "@/theme";

type Chip = { id: string; label: string };

type ChipGroupProps = {
  chips: Chip[];
  selected: Set<string>;
  onToggle: (id: string) => void;
  label?: string;
};

export function ChipGroup({ chips, selected, onToggle, label }: ChipGroupProps) {
  return (
    <View style={styles.wrapper}>
      {label && <Text style={styles.label}>{label}</Text>}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
        {chips.map((chip) => {
          const active = selected.has(chip.id);
          return (
            <TouchableOpacity
              key={chip.id}
              style={[styles.chip, active && styles.chipActive]}
              onPress={() => onToggle(chip.id)}
              activeOpacity={0.7}
            >
              <Text style={[styles.chipText, active && styles.chipTextActive]}>{chip.label}</Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { gap: spacing.xs },
  label: { fontSize: fontSize.sm, fontWeight: fontWeight.semibold, color: colors.gray700 },
  row: { flexDirection: "row", gap: spacing.sm, paddingVertical: spacing.xs },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.full,
    backgroundColor: colors.gray100,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipActive: { backgroundColor: colors.primaryLight, borderColor: colors.primary },
  chipText: { fontSize: fontSize.sm, fontWeight: fontWeight.medium, color: colors.gray600 },
  chipTextActive: { color: colors.primary, fontWeight: fontWeight.semibold },
});
