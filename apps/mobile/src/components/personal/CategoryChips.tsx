import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import type { CategorySlug } from "@template/shared";
import { CATEGORY_META } from "@/lib/categories";
import { colors, fontSize, fontWeight, spacing, borderRadius } from "@/theme";

type Props = { value: CategorySlug; onChange: (slug: CategorySlug) => void; suggested?: boolean };

export function CategoryChips({ value, onChange, suggested = false }: Props) {
  return (
    <View style={styles.container}>
      <Text style={styles.label}>
        Category{suggested ? <Text style={styles.hint}>  · suggested</Text> : null}
      </Text>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.row}
        accessibilityRole="radiogroup"
      >
        {CATEGORY_META.map((meta) => {
          const active = meta.slug === value;
          return (
            <TouchableOpacity
              key={meta.slug}
              style={[styles.chip, active && { backgroundColor: meta.color, borderColor: meta.color }]}
              onPress={() => {
                if (!active) void Haptics.selectionAsync();
                onChange(meta.slug);
              }}
              accessibilityRole="radio"
              accessibilityState={{ checked: active }}
              accessibilityLabel={meta.label}
            >
              <Ionicons name={meta.icon} size={16} color={active ? colors.white : meta.color} />
              <Text style={[styles.text, active && styles.textActive]}>{meta.label}</Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: spacing.xs },
  label: { fontSize: fontSize.sm, fontWeight: fontWeight.semibold, color: colors.gray700 },
  hint: { fontWeight: fontWeight.normal, color: colors.gray400 },
  row: { gap: spacing.sm, paddingVertical: spacing.xs },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    minHeight: 40,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.full,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  text: { fontSize: fontSize.sm, fontWeight: fontWeight.medium, color: colors.gray700 },
  textActive: { color: colors.white, fontWeight: fontWeight.semibold },
});
