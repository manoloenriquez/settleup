import { Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { formatCents } from "@template/shared";
import type { OutboxEntry } from "@template/shared";
import { useOutbox } from "@/context/OutboxContext";
import { Badge } from "@/components/ui";
import { borderRadius, colors, fontSize, fontWeight, spacing } from "@/theme";

type PendingChangesSheetProps = {
  visible: boolean;
  onClose: () => void;
};

const KIND_LABELS: Record<OutboxEntry["kind"], string> = {
  "expense.create": "Add expense",
  "expense.create_itemized": "Add itemized expense",
  "expense.update": "Edit expense",
  "expense.update_itemized": "Edit itemized expense",
  "expense.delete": "Delete expense",
  "payment.record": "Record payment",
  "comment.create": "Add comment",
};

function statusBadge(entry: OutboxEntry): { label: string; variant: "warning" | "danger" } {
  switch (entry.status) {
    case "failed":
      return { label: "Failed", variant: "danger" };
    case "failed_retryable":
      return { label: "Retrying", variant: "warning" };
    case "inflight":
      return { label: "Syncing", variant: "warning" };
    default:
      return { label: "Pending", variant: "warning" };
  }
}

/**
 * Every queued offline change with its status; failed entries expose the
 * error and Retry / Discard actions. Retry on a conflict is an explicit
 * "reapply my change on top of the latest server state".
 */
export function PendingChangesSheet({ visible, onClose }: PendingChangesSheetProps) {
  const { entries, retry, discard } = useOutbox();

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <View style={styles.header}>
            <Text style={styles.title}>Pending changes</Text>
            <TouchableOpacity onPress={onClose} hitSlop={8} accessibilityLabel="Close">
              <Ionicons name="close" size={22} color={colors.gray500} />
            </TouchableOpacity>
          </View>

          {entries.length === 0 ? (
            <Text style={styles.empty}>Everything is synced.</Text>
          ) : (
            <ScrollView style={styles.list} contentContainerStyle={styles.listContent}>
              {entries.map((entry) => {
                const badge = statusBadge(entry);
                return (
                  <View key={entry.id} style={styles.row}>
                    <View style={styles.rowInfo}>
                      <Text style={styles.rowKind}>{KIND_LABELS[entry.kind]}</Text>
                      <Text style={styles.rowTitle} numberOfLines={1}>
                        {entry.summary.title}
                        {entry.summary.amountCents > 0
                          ? ` · ${formatCents(entry.summary.amountCents)}`
                          : ""}
                      </Text>
                      {entry.status === "failed" && entry.lastError && (
                        <Text style={styles.rowError} numberOfLines={2}>
                          {entry.lastError.class === "conflict"
                            ? "Changed by someone else since you edited it."
                            : entry.lastError.class === "not_found"
                              ? "It was deleted by someone else."
                              : entry.lastError.message}
                        </Text>
                      )}
                    </View>
                    <View style={styles.rowRight}>
                      <Badge label={badge.label} variant={badge.variant} />
                      {entry.status === "failed" && (
                        <View style={styles.actions}>
                          <TouchableOpacity
                            onPress={() => void retry(entry.id)}
                            style={styles.actionBtn}
                            accessibilityRole="button"
                            accessibilityLabel={`Retry ${entry.summary.title}`}
                          >
                            <Text style={styles.actionText}>Retry</Text>
                          </TouchableOpacity>
                          <TouchableOpacity
                            onPress={() => void discard(entry.id)}
                            style={styles.actionBtn}
                            accessibilityRole="button"
                            accessibilityLabel={`Discard ${entry.summary.title}`}
                          >
                            <Text style={[styles.actionText, { color: colors.danger }]}>Discard</Text>
                          </TouchableOpacity>
                        </View>
                      )}
                    </View>
                  </View>
                );
              })}
            </ScrollView>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: borderRadius.xl,
    borderTopRightRadius: borderRadius.xl,
    paddingTop: spacing.base,
    paddingBottom: spacing["2xl"],
    maxHeight: "70%",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.base,
    marginBottom: spacing.sm,
  },
  title: { fontSize: fontSize.lg, fontWeight: fontWeight.bold, color: colors.gray900 },
  empty: {
    padding: spacing.xl,
    textAlign: "center",
    color: colors.gray400,
    fontSize: fontSize.md,
  },
  list: { paddingHorizontal: spacing.base },
  listContent: { gap: spacing.sm, paddingBottom: spacing.base },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.md,
    padding: spacing.md,
  },
  rowInfo: { flex: 1, gap: 2 },
  rowKind: { fontSize: fontSize.xs, color: colors.gray400, textTransform: "uppercase" },
  rowTitle: { fontSize: fontSize.md, fontWeight: fontWeight.medium, color: colors.gray900 },
  rowError: { fontSize: fontSize.sm, color: colors.danger },
  rowRight: { alignItems: "flex-end", gap: spacing.xs },
  actions: { flexDirection: "row", gap: spacing.sm },
  actionBtn: { paddingVertical: spacing.xs, paddingHorizontal: spacing.sm },
  actionText: { fontSize: fontSize.sm, fontWeight: fontWeight.semibold, color: colors.primary },
});
