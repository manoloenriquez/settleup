import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import type { ParsedReceipt } from "@template/shared/types";
import { formatCents } from "@template/shared";
import { colors, fontSize, fontWeight, spacing, borderRadius } from "@/theme";

type ReceiptReviewCardProps = {
  receipt: ParsedReceipt;
  onAccept: (itemName: string, amountCents: number) => void;
  onDismiss: () => void;
};

export function ReceiptReviewCard({ receipt, onAccept, onDismiss }: ReceiptReviewCardProps) {
  const merchantName = receipt.merchant ?? "Receipt";
  const totalCents = receipt.total_cents;
  const confidence = Math.round(receipt.confidence * 100);

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <Text style={styles.title}>RECEIPT DETECTED</Text>
        <View style={styles.confidenceBadge}>
          <Text style={styles.confidenceText}>{confidence}% confident</Text>
        </View>
      </View>

      <Text style={styles.merchant}>{merchantName}</Text>
      {receipt.date && <Text style={styles.date}>{receipt.date}</Text>}

      {receipt.line_items.length > 0 && (
        <View style={styles.lineItems}>
          <Text style={styles.lineItemsLabel}>ITEMS</Text>
          <ScrollView style={styles.lineItemsList} nestedScrollEnabled>
            {receipt.line_items.map((item, i) => (
              <View key={i} style={styles.lineItemRow}>
                <Text style={styles.lineItemName} numberOfLines={1}>{item.description}</Text>
                <Text style={styles.lineItemAmount}>{formatCents(item.total_cents)}</Text>
              </View>
            ))}
          </ScrollView>
        </View>
      )}

      <View style={styles.totalRow}>
        <Text style={styles.totalLabel}>TOTAL</Text>
        <Text style={styles.totalAmount}>{formatCents(totalCents)}</Text>
      </View>

      <View style={styles.actions}>
        <TouchableOpacity style={styles.dismissBtn} onPress={onDismiss} activeOpacity={0.7}>
          <Text style={styles.dismissText}>Dismiss</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.acceptBtn}
          onPress={() => onAccept(merchantName, totalCents)}
          activeOpacity={0.7}
        >
          <Text style={styles.acceptText}>Use This Amount</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.sm,
  },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  title: { fontSize: fontSize.xs, fontWeight: fontWeight.bold, color: colors.gray400, letterSpacing: 0.8 },
  confidenceBadge: { backgroundColor: colors.primaryLight, borderRadius: borderRadius.full, paddingHorizontal: spacing.sm, paddingVertical: 2 },
  confidenceText: { fontSize: fontSize.xs, fontWeight: fontWeight.semibold, color: colors.primary },
  merchant: { fontSize: fontSize.lg, fontWeight: fontWeight.bold, color: colors.gray900 },
  date: { fontSize: fontSize.sm, color: colors.gray500 },
  lineItems: { gap: spacing.xs },
  lineItemsLabel: { fontSize: fontSize.xs, fontWeight: fontWeight.bold, color: colors.gray400, letterSpacing: 0.5 },
  lineItemsList: { maxHeight: 120 },
  lineItemRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 2 },
  lineItemName: { fontSize: fontSize.sm, color: colors.gray700, flex: 1 },
  lineItemAmount: { fontSize: fontSize.sm, color: colors.gray700, fontWeight: fontWeight.medium },
  totalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  totalLabel: { fontSize: fontSize.sm, fontWeight: fontWeight.bold, color: colors.gray700 },
  totalAmount: { fontSize: fontSize.md, fontWeight: fontWeight.bold, color: colors.primary },
  actions: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.xs },
  dismissBtn: {
    flex: 1,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
  },
  dismissText: { fontSize: fontSize.sm, color: colors.gray600, fontWeight: fontWeight.medium },
  acceptBtn: {
    flex: 2,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.md,
    backgroundColor: colors.primary,
    alignItems: "center",
  },
  acceptText: { fontSize: fontSize.sm, color: colors.white, fontWeight: fontWeight.semibold },
});
