import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { formatAmount, type PersonalExpense } from "@template/shared";
import { categoryMeta } from "@/lib/categories";
import { friendlyDate } from "@/lib/dates";
import { colors, fontSize, fontWeight, spacing, borderRadius } from "@/theme";

type Props = { expense: PersonalExpense; onPress: () => void; showDate?: boolean };

export function ExpenseRow({ expense, onPress, showDate = true }: Props) {
  const meta = categoryMeta(expense.category);
  const amount = formatAmount(expense.amountMinor, expense.currency);
  const detail = [meta.label, showDate ? friendlyDate(expense.date) : null].filter(Boolean).join(" · ");
  return (
    <TouchableOpacity
      style={styles.row}
      onPress={onPress}
      activeOpacity={0.6}
      accessibilityRole="button"
      accessibilityLabel={`${expense.description}, ${amount}, ${detail}`}
      accessibilityHint="Opens the expense to edit it"
    >
      <View style={[styles.icon, { backgroundColor: `${meta.color}1a` }]}>
        <Ionicons name={meta.icon} size={18} color={meta.color} />
      </View>
      <View style={styles.body}>
        <Text style={styles.title} numberOfLines={1}>
          {expense.description}
        </Text>
        <Text style={styles.detail} numberOfLines={1}>
          {detail}
          {expense.source === "receipt" ? " · Receipt" : ""}
        </Text>
      </View>
      <Text style={styles.amount}>{amount}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingVertical: spacing.md, minHeight: 56 },
  icon: { width: 38, height: 38, borderRadius: borderRadius.md, alignItems: "center", justifyContent: "center" },
  body: { flex: 1, minWidth: 0 },
  title: { fontSize: fontSize.md, fontWeight: fontWeight.semibold, color: colors.gray900 },
  detail: { fontSize: fontSize.sm, color: colors.gray500, marginTop: 1 },
  amount: { fontSize: fontSize.md, fontWeight: fontWeight.semibold, color: colors.gray900, fontVariant: ["tabular-nums"] },
});
