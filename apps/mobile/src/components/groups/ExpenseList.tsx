import { Alert, StyleSheet, TouchableOpacity, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { formatCents } from "@template/shared";
import { colors, fontSize, fontWeight, spacing, borderRadius } from "@/theme";
import { EmptyState } from "@/components/ui";
import type { ExpenseWithDetails } from "@/services/expenses";

type ExpenseListProps = {
  expenses: ExpenseWithDetails[];
  onDelete?: (id: string) => void;
  onEdit?: (expense: ExpenseWithDetails) => void;
};

export function ExpenseList({ expenses, onDelete, onEdit }: ExpenseListProps) {
  if (expenses.length === 0) {
    return (
      <EmptyState
        icon="receipt-outline"
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
            {onEdit && (
              <TouchableOpacity onPress={() => onEdit(exp)} hitSlop={8}>
                <Ionicons name="pencil" size={16} color={colors.gray400} />
              </TouchableOpacity>
            )}
            {onDelete && (
              <TouchableOpacity onPress={() => confirmDelete(exp.id)} hitSlop={8}>
                <Ionicons name="close" size={16} color={colors.gray400} />
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
});
