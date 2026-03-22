import { Alert, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { formatCents } from "@template/shared";
import type { Expense } from "@template/supabase";
import { colors, fontSize, fontWeight, spacing, borderRadius } from "@/theme";
import { EmptyState } from "@/components/ui";

type ExpenseListProps = {
  expenses: Expense[];
  onDelete?: (id: string) => void;
};

export function ExpenseList({ expenses, onDelete }: ExpenseListProps) {
  if (expenses.length === 0) {
    return (
      <EmptyState
        icon="🧾"
        title="No expenses yet"
        description="Add the first expense to start tracking"
      />
    );
  }

  function confirmDelete(id: string) {
    Alert.alert("Delete Expense", "Are you sure?", [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: () => onDelete?.(id) },
    ]);
  }

  return (
    <View style={styles.list}>
      {expenses.map((exp) => (
        <View key={exp.id} style={styles.row}>
          <View style={styles.rowInfo}>
            <Text style={styles.name} numberOfLines={1}>{exp.item_name}</Text>
            <Text style={styles.date}>{new Date(exp.created_at).toLocaleDateString("en-PH")}</Text>
          </View>
          <View style={styles.rowRight}>
            <Text style={styles.amount}>{formatCents(exp.amount_cents)}</Text>
            {onDelete && (
              <TouchableOpacity onPress={() => confirmDelete(exp.id)} hitSlop={8}>
                <Text style={styles.deleteBtn}>✕</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { gap: spacing.sm },
  row: { flexDirection: "row", alignItems: "center", backgroundColor: colors.surface, borderRadius: borderRadius.md, padding: spacing.md, borderWidth: 1, borderColor: colors.border },
  rowInfo: { flex: 1, gap: 2 },
  name: { fontSize: fontSize.md, fontWeight: fontWeight.medium, color: colors.gray900 },
  date: { fontSize: fontSize.xs, color: colors.gray400 },
  rowRight: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  amount: { fontSize: fontSize.md, fontWeight: fontWeight.semibold, color: colors.gray900 },
  deleteBtn: { fontSize: fontSize.sm, color: colors.gray400 },
});
