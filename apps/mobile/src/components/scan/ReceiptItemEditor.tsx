import { useState } from "react";
import { ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { ReceiptLineItem } from "@template/shared/types";
import type { FieldState, ReceiptReview } from "@template/shared";
import type { ReceiptProvider } from "@/lib/ai/receipt";
import { currencyPrecision, formatAmount, parseAmountInput, type CurrencyCode } from "@template/shared";
import { RECEIPT_CHARGES_LABEL as CHARGES_LABEL } from "@/lib/expense-draft";
import { colors, fontSize, fontWeight, spacing, borderRadius } from "@/theme";
import { AppButton } from "@/components/ui";

export type EditableLineItem = ReceiptLineItem & { included: boolean };

type ReceiptItemEditorProps = {
  /** Currency the expense will be saved in (receipt amounts are read as two-decimal cents). */
  currency: CurrencyCode;
  merchant: string | null;
  date: string | null;
  items: EditableLineItem[];
  /** Deterministic review of the scan; null for a manual/legacy draft. */
  review: ReceiptReview | null;
  provider?: ReceiptProvider;
  onItemsChange: (items: EditableLineItem[]) => void;
  onContinue: (expenseName: string, totalCents: number, items: EditableLineItem[]) => void;
  onBack: () => void;
};

const OVERALL_LABEL: Record<ReceiptReview["overall"], string> = {
  verified: "Matches the receipt",
  likely: "Looks right — glance over it",
  needs_review: "Needs your review",
};

/**
 * Review step for a scanned receipt. Every field the scan filled in is
 * editable; fields whose value could not be anchored to the printed text or
 * to the receipt arithmetic are highlighted so a quick glance covers the risky
 * parts. No numeric confidence is shown: the states come from deterministic
 * checks (OCR agreement, arithmetic, missing fields).
 */
export function ReceiptItemEditor({
  currency,
  merchant,
  date,
  items,
  review,
  provider,
  onItemsChange,
  onContinue,
  onBack,
}: ReceiptItemEditorProps): React.ReactElement {
  // Receipt lines are two-decimal cents; show them in the expense currency.
  const formatCents = (cents: number): string =>
    formatAmount(Math.round((cents * 10 ** currencyPrecision(currency)) / 100), currency);
  const [expenseName, setExpenseName] = useState(merchant ?? "Receipt Expense");

  const includedItems = items.filter((i) => i.included);
  const totalCents = includedItems.reduce((sum, i) => sum + i.total_cents, 0);
  const overall = review?.overall ?? (merchant === null || totalCents <= 0 ? "needs_review" : "likely");
  const receiptTotal = review?.total_cents.value ?? null;
  const totalDiffers = receiptTotal !== null && receiptTotal !== totalCents;
  const notes = collectNotes(review, merchant);

  function stateFor(item: EditableLineItem): FieldState | null {
    if (!review) return null;
    if (item.description === CHARGES_LABEL) return "likely";
    const match = review.items.find((r) => r.name === item.description && r.total_cents === item.total_cents);
    return match?.state ?? (item.total_cents > 0 ? "likely" : "needs_review");
  }

  function toggleItem(index: number): void {
    onItemsChange(items.map((item, i) => (i === index ? { ...item, included: !item.included } : item)));
  }

  function updateItem(index: number, patch: Partial<EditableLineItem>): void {
    onItemsChange(items.map((item, i) => (i === index ? { ...item, ...patch } : item)));
  }

  function addItem(): void {
    onItemsChange([...items, { description: "", quantity: 1, unit_price_cents: 0, total_cents: 0, included: true }]);
  }

  function removeItem(index: number): void {
    onItemsChange(items.filter((_, i) => i !== index));
  }

  function handleContinue(): void {
    onContinue(expenseName.trim() || "Receipt Expense", totalCents, items);
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} style={styles.backBtn} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel="Back">
          <Ionicons name="arrow-back" size={20} color={colors.gray700} />
        </TouchableOpacity>
        <Text style={styles.title}>Review receipt</Text>
        <View style={[styles.stateBadge, overall === "verified" && styles.stateBadgeOk, overall === "needs_review" && styles.stateBadgeWarn]}>
          <Ionicons
            name={overall === "verified" ? "checkmark-circle" : overall === "likely" ? "eye-outline" : "alert-circle"}
            size={14}
            color={overall === "needs_review" ? colors.warningDark : colors.primary}
          />
          <Text style={[styles.stateText, overall === "needs_review" && styles.stateTextWarn]}>{OVERALL_LABEL[overall]}</Text>
        </View>
      </View>

      {provider === "apple-intelligence" && (
        <View style={styles.aiBadge}>
          <Ionicons name="phone-portrait-outline" size={12} color={colors.gray600} />
          <Text style={styles.aiBadgeText}>Read on this iPhone with Apple Intelligence · nothing was uploaded</Text>
        </View>
      )}

      {notes.length > 0 && (
        <View style={[styles.notesBox, overall === "needs_review" && styles.notesBoxWarn]}>
          {notes.map((note, i) => (
            <Text key={i} style={[styles.noteText, overall === "needs_review" && styles.noteTextWarn]}>
              • {note}
            </Text>
          ))}
        </View>
      )}

      {/* Expense name */}
      <View style={styles.nameSection}>
        <View style={styles.labelRow}>
          <Text style={styles.label}>Expense name</Text>
          {review && <StatePill state={review.merchant.state} />}
        </View>
        <TextInput
          style={[styles.nameInput, review?.merchant.state === "needs_review" && styles.inputWarn]}
          value={expenseName}
          onChangeText={setExpenseName}
          placeholder="e.g. Lunch at Jollibee"
          placeholderTextColor={colors.gray400}
          accessibilityLabel="Expense name"
        />
        <View style={styles.labelRow}>
          <Text style={styles.date}>{date ? `Receipt date ${date}` : "No date found — today's date will be used"}</Text>
          {review && date && <StatePill state={review.date.state} />}
        </View>
      </View>

      {/* Items */}
      <View style={styles.itemsSection}>
        <View style={styles.itemsHeader}>
          <Text style={styles.label}>Items</Text>
          <Text style={styles.itemCount}>{includedItems.length} of {items.length} selected</Text>
        </View>

        <ScrollView automaticallyAdjustKeyboardInsets keyboardShouldPersistTaps="handled" style={styles.itemsList} nestedScrollEnabled>
          {items.map((item, i) => {
            const state = stateFor(item);
            const flagged = state === "needs_review";
            return (
              <View key={i} style={[styles.itemCard, !item.included && styles.itemCardExcluded, flagged && styles.itemCardWarn]}>
                <TouchableOpacity
                  onPress={() => toggleItem(i)}
                  style={styles.checkbox}
                  activeOpacity={0.7}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: item.included }}
                  accessibilityLabel={`Include ${item.description || `item ${i + 1}`}`}
                >
                  <Ionicons name={item.included ? "checkbox" : "square-outline"} size={22} color={item.included ? colors.primary : colors.gray400} />
                </TouchableOpacity>
                <View style={styles.itemContent}>
                  <TextInput
                    style={[styles.itemName, !item.included && styles.itemTextExcluded]}
                    value={item.description}
                    onChangeText={(v) => updateItem(i, { description: v })}
                    placeholder="Item name"
                    placeholderTextColor={colors.gray400}
                  />
                  {item.quantity > 1 && <Text style={styles.itemQty}>×{item.quantity}</Text>}
                  <TextInput
                    style={[styles.itemAmount, !item.included && styles.itemTextExcluded, flagged && styles.itemAmountWarn]}
                    value={item.total_cents > 0 ? (item.total_cents / 100).toFixed(2) : ""}
                    onChangeText={(v) => {
                      const cents = parseAmountInput(v, "USD") ?? 0; // two-decimal cents, like the receipt
                      updateItem(i, { total_cents: cents, unit_price_cents: item.quantity > 0 ? Math.round(cents / item.quantity) : cents });
                    }}
                    placeholder="0.00"
                    placeholderTextColor={colors.gray400}
                    keyboardType="decimal-pad"
                    accessibilityLabel={`Amount for ${item.description || `item ${i + 1}`}`}
                  />
                </View>
                {flagged && <Ionicons name="alert-circle" size={16} color={colors.warningDark} accessibilityLabel="Check this amount" />}
                <TouchableOpacity onPress={() => removeItem(i)} style={styles.removeBtn} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel="Remove item">
                  <Ionicons name="close-circle" size={18} color={colors.gray400} />
                </TouchableOpacity>
              </View>
            );
          })}
        </ScrollView>

        <TouchableOpacity accessibilityRole="button" style={styles.addItemBtn} onPress={addItem} activeOpacity={0.7}>
          <Ionicons name="add-circle-outline" size={18} color={colors.primary} />
          <Text style={styles.addItemText}>Add item</Text>
        </TouchableOpacity>
      </View>

      {/* Total */}
      <View style={styles.totalSection}>
        <View>
          <Text style={styles.totalLabel}>TOTAL</Text>
          {totalDiffers && (
            <Text style={styles.totalHint}>Receipt says {formatCents(receiptTotal)}</Text>
          )}
        </View>
        <Text style={[styles.totalAmount, totalDiffers && styles.totalAmountWarn]}>{formatCents(totalCents)}</Text>
      </View>

      <AppButton title="Use These Items" onPress={handleContinue} disabled={totalCents <= 0 || !expenseName.trim()} />
    </View>
  );
}

function StatePill({ state }: { state: FieldState }): React.ReactElement | null {
  if (state === "verified") return null;
  const label = state === "likely" ? "check" : state === "needs_review" ? "needs review" : "missing";
  const warn = state !== "likely";
  return (
    <View style={[styles.pill, warn && styles.pillWarn]}>
      <Text style={[styles.pillText, warn && styles.pillTextWarn]}>{label}</Text>
    </View>
  );
}

function collectNotes(review: ReceiptReview | null, merchant: string | null): string[] {
  if (!review) return merchant === null ? ["Type the expense name — none was found on the receipt."] : [];
  const notes: string[] = [];
  if (review.merchant.state === "missing") notes.push("No business name was printed; type the expense name.");
  if (review.date.state === "needs_review" && review.date.note) notes.push(review.date.note);
  if (review.total_cents.note) notes.push(review.total_cents.note);
  for (const issue of review.issues) {
    if (notes.length >= 4) break;
    if (!notes.includes(issue)) notes.push(issue);
  }
  return notes.slice(0, 4);
}

const styles = StyleSheet.create({
  container: { flex: 1, gap: spacing.md },
  header: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  backBtn: { padding: spacing.xs },
  title: { flex: 1, fontSize: fontSize.lg, fontWeight: fontWeight.bold, color: colors.gray900 },
  stateBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: colors.primaryLight,
    borderRadius: borderRadius.full,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
  },
  stateBadgeOk: { backgroundColor: colors.primaryLight },
  stateBadgeWarn: { backgroundColor: colors.warningLight },
  stateText: { fontSize: fontSize.xs, fontWeight: fontWeight.semibold, color: colors.primary },
  stateTextWarn: { color: colors.warningDark },
  aiBadge: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: colors.gray100,
    borderRadius: borderRadius.full,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
  },
  aiBadgeText: { fontSize: fontSize.xs, color: colors.gray600, fontWeight: fontWeight.medium },
  notesBox: { backgroundColor: colors.gray100, borderRadius: borderRadius.md, padding: spacing.sm, gap: 2 },
  notesBoxWarn: { backgroundColor: colors.warningLight },
  noteText: { fontSize: fontSize.xs, color: colors.gray700, lineHeight: 16 },
  noteTextWarn: { color: colors.warningDark },

  nameSection: { gap: spacing.xs },
  labelRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  label: { fontSize: fontSize.sm, fontWeight: fontWeight.semibold, color: colors.gray700 },
  nameInput: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.sm,
    fontSize: fontSize.md,
    color: colors.gray900,
  },
  inputWarn: { borderColor: colors.warningDark },
  date: { fontSize: fontSize.sm, color: colors.gray500 },
  pill: { backgroundColor: colors.gray100, borderRadius: borderRadius.full, paddingHorizontal: spacing.sm, paddingVertical: 1 },
  pillWarn: { backgroundColor: colors.warningLight },
  pillText: { fontSize: fontSize.xs, color: colors.gray600, fontWeight: fontWeight.medium },
  pillTextWarn: { color: colors.warningDark },

  itemsSection: { gap: spacing.sm },
  itemsHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  itemCount: { fontSize: fontSize.xs, color: colors.gray400 },
  itemsList: { maxHeight: 300 },
  itemCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.sm,
    marginBottom: spacing.xs,
  },
  itemCardExcluded: { opacity: 0.5 },
  itemCardWarn: { borderColor: colors.warningDark, backgroundColor: colors.warningLight },
  checkbox: { padding: 2 },
  itemContent: { flex: 1, flexDirection: "row", gap: spacing.sm, alignItems: "center" },
  itemName: { flex: 1, fontSize: fontSize.sm, color: colors.gray900, padding: 0 },
  itemQty: { fontSize: fontSize.xs, color: colors.gray500 },
  itemAmount: {
    width: 80,
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
    color: colors.gray900,
    textAlign: "right",
    padding: 0,
  },
  itemAmountWarn: { color: colors.warningDark, fontWeight: fontWeight.semibold },
  itemTextExcluded: { color: colors.gray400, textDecorationLine: "line-through" },
  removeBtn: { padding: 2 },

  addItemBtn: { flexDirection: "row", alignItems: "center", gap: spacing.xs, paddingVertical: spacing.xs },
  addItemText: { fontSize: fontSize.sm, fontWeight: fontWeight.semibold, color: colors.primary },

  totalSection: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  totalLabel: { fontSize: fontSize.sm, fontWeight: fontWeight.bold, color: colors.gray700 },
  totalHint: { fontSize: fontSize.xs, color: colors.warningDark },
  totalAmount: { fontSize: fontSize.xl, fontWeight: fontWeight.bold, color: colors.primary },
  totalAmountWarn: { color: colors.warningDark },
});
