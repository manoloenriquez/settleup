import { Alert, StyleSheet, TouchableOpacity, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { formatCents } from "@template/shared";
import { CategoryPill } from "@/components/groups/CategoryPicker";
import { colors, fontSize, fontWeight, spacing, borderRadius } from "@/theme";
import { Badge, EmptyState } from "@/components/ui";
import type { ExpenseWithDetails } from "@/services/expenses";
import type { PendingExpenseRow } from "@/hooks/useOutbox";

type ExpenseListProps = {
  expenses: ExpenseWithDetails[];
  /** Offline-queued creates rendered above the server rows with a status badge. */
  pendingExpenses?: PendingExpenseRow[];
  onDelete?: (id: string) => void;
  onEdit?: (expense: ExpenseWithDetails) => void;
  onComments?: (expense: ExpenseWithDetails) => void;
  hasMore?: boolean;
  loadingMore?: boolean;
  onLoadMore?: () => void;
};

/** Parse YYYY-MM-DD as a local date; new Date("YYYY-MM-DD") is UTC midnight (a day off in PH). */
function expenseDayLabel(exp: ExpenseWithDetails): string {
  const day = exp.expense_date ?? exp.created_at;
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(day);
  const date = match
    ? new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
    : new Date(day);
  return date.toLocaleDateString("en-PH");
}

export function ExpenseList({ expenses, pendingExpenses = [], onDelete, onEdit, onComments, hasMore, loadingMore, onLoadMore }: ExpenseListProps) {
  if (expenses.length === 0 && pendingExpenses.length === 0) {
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
      {pendingExpenses.map((pending) => (
        <View key={pending.id} style={[styles.row, styles.pendingRow]}>
          <View style={styles.rowInfo}>
            <Text style={styles.name} numberOfLines={1}>{pending.item_name}</Text>
            <View style={styles.metaRow}>
              <Ionicons name="time-outline" size={12} color={colors.gray400} />
              <Text style={styles.date}>
                {pending.status === "failed" ? "Sync failed — see banner" : "Waiting to sync"}
              </Text>
            </View>
          </View>
          <View style={styles.rowRight}>
            <Text style={styles.amount}>{formatCents(pending.amount_cents)}</Text>
            <Badge
              label={pending.status === "failed" ? "Failed" : "Pending"}
              variant={pending.status === "failed" ? "danger" : "warning"}
            />
          </View>
        </View>
      ))}
      {expenses.map((exp) => (
        <View key={exp.id} style={styles.row}>
          <View style={styles.rowInfo}>
            <Text style={styles.name} numberOfLines={1}>{exp.item_name}</Text>
            <View style={styles.metaRow}>
              <Text style={styles.date}>{expenseDayLabel(exp)}</Text>
              <CategoryPill category={exp.category} />
            </View>
          </View>
          <View style={styles.rowRight}>
            <Text style={styles.amount}>{formatCents(exp.amount_cents)}</Text>
            {onComments && (
              <TouchableOpacity onPress={() => onComments(exp)} hitSlop={8} accessibilityRole="button" accessibilityLabel={`Comments on ${exp.item_name}`}>
                <Ionicons name="chatbubble-outline" size={16} color={colors.gray400} />
              </TouchableOpacity>
            )}
            {onEdit && (
              <TouchableOpacity onPress={() => onEdit(exp)} hitSlop={8} accessibilityRole="button" accessibilityLabel={`Edit ${exp.item_name}`}>
                <Ionicons name="pencil" size={16} color={colors.gray400} />
              </TouchableOpacity>
            )}
            {onDelete && (
              <TouchableOpacity onPress={() => confirmDelete(exp.id)} hitSlop={8} accessibilityRole="button" accessibilityLabel={`Delete ${exp.item_name}`}>
                <Ionicons name="close" size={16} color={colors.gray400} />
              </TouchableOpacity>
            )}
          </View>
        </View>
      ))}
      {hasMore && onLoadMore && (
        <TouchableOpacity
          onPress={onLoadMore}
          disabled={loadingMore}
          style={styles.loadMore}
          accessibilityRole="button"
          accessibilityLabel="Load more expenses"
        >
          <Text style={styles.loadMoreText}>{loadingMore ? "Loading…" : "Load more"}</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { gap: spacing.sm },
  row: { flexDirection: "row", alignItems: "center", backgroundColor: colors.surface, borderRadius: borderRadius.md, padding: spacing.md, borderWidth: 1, borderColor: colors.border },
  pendingRow: { borderStyle: "dashed", borderColor: colors.warning, opacity: 0.85 },
  rowInfo: { flex: 1, gap: 2 },
  name: { fontSize: fontSize.md, fontWeight: fontWeight.medium, color: colors.gray900 },
  metaRow: { flexDirection: "row", alignItems: "center", gap: spacing.xs, flexWrap: "wrap" },
  date: { fontSize: fontSize.xs, color: colors.gray400 },
  rowRight: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  amount: { fontSize: fontSize.md, fontWeight: fontWeight.semibold, color: colors.gray900 },
  loadMore: {
    alignSelf: "center",
    marginTop: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.gray200,
    backgroundColor: colors.white,
  },
  loadMoreText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
    color: colors.gray600,
  },

});
