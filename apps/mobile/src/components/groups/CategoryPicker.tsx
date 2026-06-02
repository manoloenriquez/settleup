import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import type { ExpenseCategory } from "@template/supabase";
import { colors, fontSize, fontWeight, spacing, borderRadius } from "@/theme";

type CategoryPickerProps = {
  categories: ExpenseCategory[];
  selectedId: string | null;
  onSelect: (categoryId: string | null) => void;
  label?: string;
};

export function CategoryPicker({ categories, selectedId, onSelect, label = "Category" }: CategoryPickerProps) {
  const sorted = [...categories].sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name));

  return (
    <View>
      <Text style={styles.label}>{label}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
        {sorted.map((category) => {
          const active = selectedId === category.id;
          return (
            <TouchableOpacity
              key={category.id}
              style={[styles.chip, active && styles.chipActive]}
              onPress={() => onSelect(category.id)}
              activeOpacity={0.75}
            >
              <View style={[styles.dot, { backgroundColor: category.color }]} />
              <Text style={[styles.chipText, active && styles.chipTextActive]}>{category.name}</Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
}

export function CategoryPill({ category }: { category?: Pick<ExpenseCategory, "name" | "color"> | null }) {
  return (
    <View style={styles.pill}>
      <View style={[styles.dot, { backgroundColor: category?.color ?? colors.gray500 }]} />
      <Text style={styles.pillText}>{category?.name ?? "Other"}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  label: { fontSize: fontSize.sm, fontWeight: fontWeight.semibold, color: colors.gray700, marginBottom: spacing.xs },
  row: { gap: spacing.sm, paddingVertical: spacing.xs },
  chip: { flexDirection: "row", alignItems: "center", gap: spacing.xs, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: borderRadius.full, backgroundColor: colors.gray100, borderWidth: 1, borderColor: colors.border },
  chipActive: { backgroundColor: colors.primaryLight, borderColor: colors.primary },
  dot: { width: 8, height: 8, borderRadius: 4 },
  chipText: { fontSize: fontSize.sm, fontWeight: fontWeight.medium, color: colors.gray600 },
  chipTextActive: { color: colors.primary, fontWeight: fontWeight.semibold },
  pill: { alignSelf: "flex-start", flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: spacing.sm, paddingVertical: 3, borderRadius: borderRadius.full, backgroundColor: colors.gray100 },
  pillText: { fontSize: fontSize.xs, fontWeight: fontWeight.medium, color: colors.gray600 },
});
