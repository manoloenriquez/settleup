import { Alert, StyleSheet, TouchableOpacity, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { formatAmount } from "@template/shared";
import { CategoryPill } from "@/components/groups/CategoryPicker";
import { colors, fontSize, fontWeight, spacing, borderRadius } from "@/theme";
import { Badge, EmptyState } from "@/components/ui";
import type { ExpenseWithDetails } from "@/services/expenses";
import type { PendingExpenseRow } from "@/hooks/useOutbox";
import { expenseStake } from "@/lib/expense-stake";

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
  /** Your member id in this group, for "You paid · you lent ₱X". */
  currentMemberId?: string | null;
  /** Member names by id. */
  memberNames?: ReadonlyMap<string, string>;
};

/** Parse YYYY-MM-DD as a local date; new Date("YYYY-MM-DD") is UTC midnight (a day off in PH). */
function expenseDayLabel(exp: ExpenseWithDetails): string {
  const day = exp.expense_date ?? exp.created_at;
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(day);
  const date = match
    ? new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
    : new Date(day);
  return date.toLocaleDateString(undefined);
}

export function ExpenseList({
  expenses,
  pendingExpenses = [],
  onDelete,
  onEdit,
  onComments,
  hasMore,
  loadingMore,
  onLoadMore,
  currentMemberId = null,
  memberNames,
}: ExpenseListProps) {
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
            <Text style={styles.amount}>{formatAmount(pending.amount_cents, pending.currency_code)}</Text>
            <Badge
              label={pending.status === "failed" ? "Failed" : "Pending"}
              variant={pending.status === "failed" ? "danger" : "warning"}
            />
          </View>
        </View>
      ))}
      {expenses.map((exp) => {
        const stake = expenseStake(exp.payers, exp.participants, currentMemberId, (id) => memberNames?.get(id) ?? "Someone");
        const stakeText =
          stake.tone === "lent"
            ? `you lent ${formatAmount(stake.amountMinor, exp.currency_code)}`
            : stake.tone === "share"
              ? `your share ${formatAmount(stake.amountMinor, exp.currency_code)}`
              : null;
        // Credits (negative amounts) can't be edited here; they keep a delete button.
        const editable = !!onEdit && exp.amount_cents >= 0;
        const body = (
          <>
            <View style={styles.rowInfo}>
              <Text style={styles.name} numberOfLines={1}>{exp.item_name}</Text>
              <Text style={styles.stake} numberOfLines={1}>
                {stake.paidBy}
                {stakeText ? " · " : ""}
                {stakeText ? (
                  <Text style={stake.tone === "lent" ? styles.stakeLent : styles.stakeShare}>{stakeText}</Text>
                ) : null}
              </Text>
              <View style={styles.metaRow}>
                <Text style={styles.date}>{expenseDayLabel(exp)}</Text>
                <CategoryPill category={exp.category} />
              </View>
            </View>
            <Text style={styles.amount}>{formatAmount(exp.amount_cents, exp.currency_code)}</Text>
          </>
        );
        return (
          <View key={exp.id} style={styles.row}>
            {editable ? (
              <TouchableOpacity
                style={styles.rowMain}
                onPress={() => onEdit(exp)}
                accessibilityRole="button"
                accessibilityLabel={`${exp.item_name}, ${formatAmount(exp.amount_cents, exp.currency_code)}, ${stake.paidBy}${stakeText ? `, ${stakeText}` : ""}, ${expenseDayLabel(exp)}${exp.category ? `, ${exp.category.name}` : ""}`}
                accessibilityHint="Opens the expense to change or delete it"
              >
                {body}
              </TouchableOpacity>
            ) : (
              <View style={styles.rowMain}>{body}</View>
            )}
            {onComments && (
              <TouchableOpacity
                onPress={() => onComments(exp)}
                style={styles.iconBtn}
                accessibilityRole="button"
                accessibilityLabel={`Comments on ${exp.item_name}`}
              >
                <Ionicons name="chatbubble-outline" size={18} color={colors.gray500} />
              </TouchableOpacity>
            )}
            {!editable && onDelete && (
              <TouchableOpacity
                onPress={() => confirmDelete(exp.id)}
                style={styles.iconBtn}
                accessibilityRole="button"
                accessibilityLabel={`Delete ${exp.item_name}`}
              >
                <Ionicons name="trash-outline" size={18} color={colors.gray500} />
              </TouchableOpacity>
            )}
          </View>
        );
      })}
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
  rowMain: { flex: 1, flexDirection: "row", alignItems: "center", gap: spacing.sm, minHeight: 44 },
  rowInfo: { flex: 1, gap: 2 },
  stake: { fontSize: fontSize.sm, color: colors.gray600 },
  stakeLent: { color: colors.successDark, fontWeight: fontWeight.semibold },
  stakeShare: { color: colors.gray800, fontWeight: fontWeight.semibold },
  iconBtn: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  name: { fontSize: fontSize.md, fontWeight: fontWeight.medium, color: colors.gray900 },
  metaRow: { flexDirection: "row", alignItems: "center", gap: spacing.xs, flexWrap: "wrap" },
  date: { fontSize: fontSize.xs, color: colors.gray500 },
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
    backgroundColor: colors.surface,
  },
  loadMoreText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
    color: colors.gray600,
  },

});
