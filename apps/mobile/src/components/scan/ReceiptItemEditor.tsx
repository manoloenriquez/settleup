import { useState } from "react";
import { ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { ReceiptLineItem } from "@template/shared/types";
import { formatCents, parsePHPAmount } from "@template/shared";
import { colors, fontSize, fontWeight, spacing, borderRadius } from "@/theme";
import { AppButton } from "@/components/ui";

export type EditableLineItem = ReceiptLineItem & { included: boolean };

type ReceiptItemEditorProps = {
  merchant: string | null;
  date: string | null;
  items: EditableLineItem[];
  confidence: number;
  onItemsChange: (items: EditableLineItem[]) => void;
  onContinue: (expenseName: string, totalCents: number, items: EditableLineItem[]) => void;
  onBack: () => void;
};

export function ReceiptItemEditor({
  merchant,
  date,
  items,
  confidence,
  onItemsChange,
  onContinue,
  onBack,
}: ReceiptItemEditorProps): React.ReactElement {
  const [expenseName, setExpenseName] = useState(merchant ?? "Receipt Expense");

  const includedItems = items.filter((i) => i.included);
  const totalCents = includedItems.reduce((sum, i) => sum + i.total_cents, 0);
  const confidencePct = Math.round(confidence * 100);

  function toggleItem(index: number): void {
    const next = items.map((item, i) => (i === index ? { ...item, included: !item.included } : item));
    onItemsChange(next);
  }

  function updateItem(index: number, patch: Partial<EditableLineItem>): void {
    const next = items.map((item, i) => (i === index ? { ...item, ...patch } : item));
    onItemsChange(next);
  }

  function addItem(): void {
    onItemsChange([
      ...items,
      { description: "", quantity: 1, unit_price_cents: 0, total_cents: 0, included: true },
    ]);
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
        <TouchableOpacity onPress={onBack} style={styles.backBtn} activeOpacity={0.7}>
          <Ionicons name="arrow-back" size={20} color={colors.gray700} />
        </TouchableOpacity>
        <Text style={styles.title}>Review Items</Text>
        <View style={styles.confidenceBadge}>
          <Text style={styles.confidenceText}>{confidencePct}%</Text>
        </View>
      </View>

      {/* Expense name */}
      <View style={styles.nameSection}>
        <Text style={styles.label}>Expense Name</Text>
        <TextInput
          style={styles.nameInput}
          value={expenseName}
          onChangeText={setExpenseName}
          placeholder="e.g. Lunch at Jollibee"
          placeholderTextColor={colors.gray400}
        />
        {date && <Text style={styles.date}>{date}</Text>}
      </View>

      {/* Items */}
      <View style={styles.itemsSection}>
        <View style={styles.itemsHeader}>
          <Text style={styles.label}>Items</Text>
          <Text style={styles.itemCount}>{includedItems.length} of {items.length} selected</Text>
        </View>

        <ScrollView style={styles.itemsList} nestedScrollEnabled>
          {items.map((item, i) => (
            <View key={i} style={[styles.itemCard, !item.included && styles.itemCardExcluded]}>
              <TouchableOpacity onPress={() => toggleItem(i)} style={styles.checkbox} activeOpacity={0.7}>
                <Ionicons
                  name={item.included ? "checkbox" : "square-outline"}
                  size={22}
                  color={item.included ? colors.primary : colors.gray400}
                />
              </TouchableOpacity>
              <View style={styles.itemContent}>
                <TextInput
                  style={[styles.itemName, !item.included && styles.itemTextExcluded]}
                  value={item.description}
                  onChangeText={(v) => updateItem(i, { description: v })}
                  placeholder="Item name"
                  placeholderTextColor={colors.gray400}
                />
                <TextInput
                  style={[styles.itemAmount, !item.included && styles.itemTextExcluded]}
                  value={item.total_cents > 0 ? String(item.total_cents / 100) : ""}
                  onChangeText={(v) => {
                    const cents = parsePHPAmount(v) ?? 0;
                    updateItem(i, { total_cents: cents, unit_price_cents: cents });
                  }}
                  placeholder="0.00"
                  placeholderTextColor={colors.gray400}
                  keyboardType="decimal-pad"
                />
              </View>
              <TouchableOpacity onPress={() => removeItem(i)} style={styles.removeBtn} activeOpacity={0.7}>
                <Ionicons name="close-circle" size={18} color={colors.gray400} />
              </TouchableOpacity>
            </View>
          ))}
        </ScrollView>

        <TouchableOpacity style={styles.addItemBtn} onPress={addItem} activeOpacity={0.7}>
          <Ionicons name="add-circle-outline" size={18} color={colors.primary} />
          <Text style={styles.addItemText}>Add Item</Text>
        </TouchableOpacity>
      </View>

      {/* Total */}
      <View style={styles.totalSection}>
        <Text style={styles.totalLabel}>TOTAL</Text>
        <Text style={styles.totalAmount}>{formatCents(totalCents)}</Text>
      </View>

      {/* Continue */}
      <AppButton
        title="Choose Group"
        onPress={handleContinue}
        disabled={totalCents <= 0 || !expenseName.trim()}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, gap: spacing.md },
  header: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  backBtn: { padding: spacing.xs },
  title: { flex: 1, fontSize: fontSize.lg, fontWeight: fontWeight.bold, color: colors.gray900 },
  confidenceBadge: {
    backgroundColor: colors.primaryLight,
    borderRadius: borderRadius.full,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
  },
  confidenceText: { fontSize: fontSize.xs, fontWeight: fontWeight.semibold, color: colors.primary },

  nameSection: { gap: spacing.xs },
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
  date: { fontSize: fontSize.sm, color: colors.gray500 },

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
  checkbox: { padding: 2 },
  itemContent: { flex: 1, flexDirection: "row", gap: spacing.sm, alignItems: "center" },
  itemName: { flex: 1, fontSize: fontSize.sm, color: colors.gray900, padding: 0 },
  itemAmount: {
    width: 80,
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
    color: colors.gray900,
    textAlign: "right",
    padding: 0,
  },
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
  totalAmount: { fontSize: fontSize.xl, fontWeight: fontWeight.bold, color: colors.primary },
});
