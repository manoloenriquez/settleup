import { useState } from "react";
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Stack } from "expo-router";
import * as Haptics from "expo-haptics";
import type { ReceiptLineItem } from "@template/shared/types";
import { formatCents } from "@template/shared";
import { useAuth } from "@/context/AuthContext";
import { useReceiptScan } from "@/hooks/useReceiptScan";
import { useGroups } from "@/hooks/useGroups";
import { useMembers } from "@/hooks/useMembers";
import { useAddExpense, useAddItemizedExpense } from "@/hooks/useExpenses";
import { ReceiptScanner } from "@/components/groups/ReceiptScanner";
import { ReceiptItemEditor, type EditableLineItem } from "@/components/scan/ReceiptItemEditor";
import { GroupPicker } from "@/components/scan/GroupPicker";
import { AppButton, ChipGroup } from "@/components/ui";
import { colors, fontSize, fontWeight, spacing, borderRadius } from "@/theme";

type Step = "scan" | "review" | "group-select" | "configure-split" | "confirm";

export default function ScanScreen(): React.ReactElement {
  const { session } = useAuth();
  const receiptScan = useReceiptScan();
  const { data: groups, isLoading: groupsLoading } = useGroups();

  // Wizard state
  const [step, setStep] = useState<Step>("scan");
  const [editedItems, setEditedItems] = useState<EditableLineItem[]>([]);
  const [expenseName, setExpenseName] = useState("");
  const [totalCents, setTotalCents] = useState(0);
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);

  // Split config state
  const [selectedMembers, setSelectedMembers] = useState<Set<string>>(new Set());
  const [payerMemberId, setPayerMemberId] = useState("");
  const [splitMode, setSplitMode] = useState<"equal" | "itemized">("equal");
  const [lineItemAssignments, setLineItemAssignments] = useState<Record<number, string[]>>({});

  // Group-dependent hooks
  const membersQ = useMembers(selectedGroupId ?? "");
  const members = membersQ.data ?? [];
  const addExpense = useAddExpense(selectedGroupId ?? "");
  const addItemized = useAddItemizedExpense(selectedGroupId ?? "");

  const myMember = members.find((m) => m.user_id === session?.user.id) ?? members[0];
  const effectivePayerId = payerMemberId || myMember?.id || "";
  const selectedGroup = (groups ?? []).find((g) => g.id === selectedGroupId);

  const isSaving = addExpense.isPending || addItemized.isPending;

  // -- Step transitions --

  function handleReceiptParsed(): void {
    if (!receiptScan.receipt) return;
    const r = receiptScan.receipt;
    setEditedItems(
      r.line_items.length > 0
        ? r.line_items.map((li) => ({ ...li, included: true }))
        : [{ description: r.merchant ?? "Total", quantity: 1, unit_price_cents: r.total_cents, total_cents: r.total_cents, included: true }],
    );
    setExpenseName(r.merchant ?? "Receipt Expense");
    setTotalCents(r.total_cents);
    setStep("review");
  }

  function handleReviewContinue(name: string, cents: number, items: EditableLineItem[]): void {
    setExpenseName(name);
    setTotalCents(cents);
    setEditedItems(items);
    setStep("group-select");
  }

  function handleGroupSelected(groupId: string): void {
    setSelectedGroupId(groupId);
    // Reset split state for new group
    setSelectedMembers(new Set());
    setPayerMemberId("");
    setSplitMode("equal");
    setLineItemAssignments({});
    setStep("configure-split");
  }

  function initMembersOnLoad(): void {
    if (members.length > 0 && selectedMembers.size === 0) {
      setSelectedMembers(new Set(members.map((m) => m.id)));
      if (myMember) setPayerMemberId(myMember.id);
    }
  }
  // Trigger when members load
  if (step === "configure-split" && members.length > 0 && selectedMembers.size === 0) {
    initMembersOnLoad();
  }

  function toggleMember(id: string): void {
    setSelectedMembers((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleLineItemAssignment(lineIdx: number, memberId: string): void {
    setLineItemAssignments((prev) => {
      const current = prev[lineIdx] ?? members.map((m) => m.id);
      const next = current.includes(memberId)
        ? current.filter((id) => id !== memberId)
        : [...current, memberId];
      return { ...prev, [lineIdx]: next };
    });
  }

  function handleConfigReview(): void {
    if (selectedMembers.size === 0) {
      Alert.alert("No participants", "Select at least one member to split with.");
      return;
    }
    if (!effectivePayerId) {
      Alert.alert("No payer", "Select who paid for this expense.");
      return;
    }
    setStep("confirm");
  }

  async function handleSave(): Promise<void> {
    if (!selectedGroupId || !session) return;

    const included = editedItems.filter((i) => i.included);

    if (splitMode === "itemized" && included.length > 1) {
      const result = await addItemized.mutateAsync({
        groupId: selectedGroupId,
        expenseName,
        amountCents: totalCents,
        payers: [{ memberId: effectivePayerId, paidCents: totalCents }],
        lineItems: included.map((li, i) => ({
          name: li.description || `Item ${i + 1}`,
          amountCents: li.total_cents,
          participantIds: lineItemAssignments[i] ?? members.map((m) => m.id),
        })),
      });
      if (result.error) {
        Alert.alert("Error", result.error);
        return;
      }
    } else {
      const result = await addExpense.mutateAsync({
        groupId: selectedGroupId,
        itemName: expenseName,
        amountCents: totalCents,
        memberIds: [...selectedMembers],
        payerMemberId: effectivePayerId,
        createdByUserId: session.user.id,
      });
      if (result.error) {
        Alert.alert("Error", result.error);
        return;
      }
    }

    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    resetAll();
  }

  function resetAll(): void {
    receiptScan.clear();
    setStep("scan");
    setEditedItems([]);
    setExpenseName("");
    setTotalCents(0);
    setSelectedGroupId(null);
    setSelectedMembers(new Set());
    setPayerMemberId("");
    setSplitMode("equal");
    setLineItemAssignments({});
  }

  // -- Render --

  const memberChips = members.map((m) => ({ id: m.id, label: m.display_name }));

  return (
    <>
      <Stack.Screen options={{ title: "Scan Receipt", headerShown: true }} />
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : "height"}>
        <ScrollView style={styles.scroll} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">

          {/* ---- STEP: SCAN ---- */}
          {step === "scan" && (
            <View style={styles.scanStep}>
              <View style={styles.scanHero}>
                <View style={styles.scanIconWrap}>
                  <Ionicons name="scan" size={40} color={colors.primary} />
                </View>
                <Text style={styles.scanTitle}>Scan a Receipt</Text>
                <Text style={styles.scanSubtitle}>
                  Take a photo or pick from gallery to automatically extract items and amounts
                </Text>
              </View>

              <ReceiptScanner
                imageUri={receiptScan.imageUri}
                isScanning={receiptScan.isScanning}
                error={receiptScan.error}
                onCamera={() => void receiptScan.scanFromCamera()}
                onGallery={() => void receiptScan.scanFromGallery()}
                onClear={receiptScan.clear}
              />

              {receiptScan.receipt && (
                <AppButton title="Review Items" onPress={handleReceiptParsed} />
              )}
            </View>
          )}

          {/* ---- STEP: REVIEW ---- */}
          {step === "review" && (
            <ReceiptItemEditor
              merchant={receiptScan.receipt?.merchant ?? null}
              date={receiptScan.receipt?.date ?? null}
              items={editedItems}
              confidence={receiptScan.receipt?.confidence ?? 0}
              provider={receiptScan.provider}
              onItemsChange={setEditedItems}
              onContinue={handleReviewContinue}
              onBack={() => setStep("scan")}
            />
          )}

          {/* ---- STEP: GROUP SELECT ---- */}
          {step === "group-select" && (
            <GroupPicker
              groups={groups ?? []}
              isLoading={groupsLoading}
              onSelect={handleGroupSelected}
              onBack={() => setStep("review")}
            />
          )}

          {/* ---- STEP: CONFIGURE SPLIT ---- */}
          {step === "configure-split" && (
            <View style={styles.splitStep}>
              <View style={styles.splitHeader}>
                <TouchableOpacity onPress={() => setStep("group-select")} style={styles.backBtn} activeOpacity={0.7}>
                  <Ionicons name="arrow-back" size={20} color={colors.gray700} />
                </TouchableOpacity>
                <View style={styles.splitHeaderInfo}>
                  <Text style={styles.splitTitle}>Configure Split</Text>
                  <Text style={styles.splitGroupName}>{selectedGroup?.name ?? "Group"}</Text>
                </View>
                <Text style={styles.splitAmount}>{formatCents(totalCents)}</Text>
              </View>

              {/* Participants */}
              <ChipGroup
                label="Split with"
                chips={memberChips}
                selected={selectedMembers}
                onToggle={toggleMember}
              />

              {/* Paid by */}
              <View>
                <Text style={styles.label}>Paid by</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.payerRow}>
                  {members.map((m) => (
                    <TouchableOpacity
                      key={m.id}
                      style={[styles.payerChip, effectivePayerId === m.id && styles.payerChipActive]}
                      onPress={() => setPayerMemberId(m.id)}
                      activeOpacity={0.7}
                    >
                      <Text style={[styles.payerChipText, effectivePayerId === m.id && styles.payerChipTextActive]}>
                        {m.display_name}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>

              {/* Split mode (only if multiple items) */}
              {editedItems.filter((i) => i.included).length > 1 && (
                <View>
                  <Text style={styles.label}>How to split</Text>
                  <View style={styles.toggleRow}>
                    {(["equal", "itemized"] as const).map((s) => (
                      <TouchableOpacity
                        key={s}
                        style={[styles.toggleBtn, splitMode === s && styles.toggleBtnActive]}
                        onPress={() => setSplitMode(s)}
                        activeOpacity={0.7}
                      >
                        <Text style={[styles.toggleBtnText, splitMode === s && styles.toggleBtnTextActive]}>
                          {s === "equal" ? "Equal" : "By Item"}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
              )}

              {/* Itemized assignment */}
              {splitMode === "itemized" && (
                <View style={styles.itemAssignSection}>
                  {editedItems.filter((i) => i.included).map((li, i) => {
                    const assigned = lineItemAssignments[i] ?? members.map((m) => m.id);
                    return (
                      <View key={i} style={styles.itemAssignCard}>
                        <View style={styles.itemAssignHeader}>
                          <Text style={styles.itemAssignName} numberOfLines={1}>{li.description || `Item ${i + 1}`}</Text>
                          <Text style={styles.itemAssignAmount}>{formatCents(li.total_cents)}</Text>
                        </View>
                        <View style={styles.participantRow}>
                          {members.map((m) => (
                            <TouchableOpacity
                              key={m.id}
                              style={[styles.participantChip, assigned.includes(m.id) && styles.participantChipActive]}
                              onPress={() => toggleLineItemAssignment(i, m.id)}
                              activeOpacity={0.7}
                            >
                              <Text style={[styles.participantChipText, assigned.includes(m.id) && styles.participantChipTextActive]}>
                                {m.display_name}
                              </Text>
                            </TouchableOpacity>
                          ))}
                        </View>
                      </View>
                    );
                  })}
                </View>
              )}

              <AppButton title="Review" onPress={handleConfigReview} />
            </View>
          )}

          {/* ---- STEP: CONFIRM ---- */}
          {step === "confirm" && (
            <View style={styles.confirmStep}>
              <View style={styles.confirmCard}>
                <Text style={styles.confirmLabel}>REVIEW</Text>
                <Text style={styles.confirmName}>{expenseName}</Text>
                <Text style={styles.confirmAmount}>{formatCents(totalCents)}</Text>

                <View style={styles.confirmRow}>
                  <Text style={styles.confirmRowLabel}>Group</Text>
                  <Text style={styles.confirmRowValue}>{selectedGroup?.name ?? "—"}</Text>
                </View>
                <View style={styles.confirmRow}>
                  <Text style={styles.confirmRowLabel}>Paid by</Text>
                  <Text style={styles.confirmRowValue}>
                    {members.find((m) => m.id === effectivePayerId)?.display_name ?? "—"}
                  </Text>
                </View>
                <View style={styles.confirmRow}>
                  <Text style={styles.confirmRowLabel}>Split</Text>
                  <Text style={styles.confirmRowValue}>
                    {splitMode === "itemized" ? "By item" : `Equal · ${selectedMembers.size} member${selectedMembers.size !== 1 ? "s" : ""}`}
                  </Text>
                </View>

                {splitMode === "itemized" && editedItems.filter((i) => i.included).map((li, i) => (
                  <View key={i} style={styles.confirmRow}>
                    <Text style={styles.confirmRowLabel} numberOfLines={1}>{li.description || `Item ${i + 1}`}</Text>
                    <Text style={styles.confirmRowValue}>{formatCents(li.total_cents)}</Text>
                  </View>
                ))}
              </View>

              <View style={styles.confirmActions}>
                <TouchableOpacity
                  style={styles.editBtn}
                  onPress={() => setStep("configure-split")}
                  activeOpacity={0.7}
                >
                  <Text style={styles.editBtnText}>Back to Edit</Text>
                </TouchableOpacity>
                <View style={styles.flex}>
                  <AppButton
                    title={isSaving ? "Saving..." : "Confirm & Save"}
                    onPress={() => void handleSave()}
                    isLoading={isSaving}
                  />
                </View>
              </View>
            </View>
          )}

        </ScrollView>
      </KeyboardAvoidingView>
    </>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  scroll: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.base, paddingBottom: spacing["2xl"], gap: spacing.base },

  // Scan step
  scanStep: { gap: spacing.lg },
  scanHero: { alignItems: "center", gap: spacing.sm, paddingTop: spacing.xl, paddingBottom: spacing.md },
  scanIconWrap: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: colors.primaryLight,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.sm,
  },
  scanTitle: { fontSize: fontSize["2xl"], fontWeight: fontWeight.bold, color: colors.gray900 },
  scanSubtitle: { fontSize: fontSize.sm, color: colors.gray500, textAlign: "center", paddingHorizontal: spacing.xl },

  // Split step
  splitStep: { gap: spacing.md },
  splitHeader: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  backBtn: { padding: spacing.xs },
  splitHeaderInfo: { flex: 1 },
  splitTitle: { fontSize: fontSize.lg, fontWeight: fontWeight.bold, color: colors.gray900 },
  splitGroupName: { fontSize: fontSize.sm, color: colors.gray500 },
  splitAmount: { fontSize: fontSize.lg, fontWeight: fontWeight.bold, color: colors.primary },

  label: { fontSize: fontSize.sm, fontWeight: fontWeight.semibold, color: colors.gray700, marginBottom: spacing.xs },

  payerRow: { gap: spacing.sm, paddingVertical: spacing.xs },
  payerChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.full,
    backgroundColor: colors.gray100,
    borderWidth: 1,
    borderColor: colors.border,
  },
  payerChipActive: { backgroundColor: colors.primaryLight, borderColor: colors.primary },
  payerChipText: { fontSize: fontSize.sm, fontWeight: fontWeight.medium, color: colors.gray600 },
  payerChipTextActive: { color: colors.primary, fontWeight: fontWeight.semibold },

  toggleRow: { flexDirection: "row", gap: spacing.sm },
  toggleBtn: {
    flex: 1,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    backgroundColor: colors.surface,
  },
  toggleBtnActive: { backgroundColor: colors.primaryLight, borderColor: colors.primary },
  toggleBtnText: { fontSize: fontSize.sm, fontWeight: fontWeight.medium, color: colors.gray600 },
  toggleBtnTextActive: { color: colors.primary, fontWeight: fontWeight.semibold },

  itemAssignSection: { gap: spacing.sm },
  itemAssignCard: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.sm,
  },
  itemAssignHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  itemAssignName: { flex: 1, fontSize: fontSize.sm, fontWeight: fontWeight.medium, color: colors.gray900 },
  itemAssignAmount: { fontSize: fontSize.sm, fontWeight: fontWeight.semibold, color: colors.gray700 },
  participantRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs },
  participantChip: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: borderRadius.full,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.gray100,
  },
  participantChipActive: { backgroundColor: colors.primaryLight, borderColor: colors.primary },
  participantChipText: { fontSize: fontSize.xs, color: colors.gray600 },
  participantChipTextActive: { color: colors.primary, fontWeight: fontWeight.semibold },

  // Confirm step
  confirmStep: { gap: spacing.base },
  confirmCard: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  confirmLabel: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.bold,
    color: colors.gray400,
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  confirmName: { fontSize: fontSize.xl, fontWeight: fontWeight.bold, color: colors.gray900, marginTop: spacing.xs },
  confirmAmount: { fontSize: 32, fontWeight: fontWeight.bold, color: colors.primary, marginBottom: spacing.sm },
  confirmRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: spacing.xs,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  confirmRowLabel: { fontSize: fontSize.sm, color: colors.gray500, flex: 1 },
  confirmRowValue: { fontSize: fontSize.sm, fontWeight: fontWeight.semibold, color: colors.gray800, flex: 2, textAlign: "right" },
  confirmActions: { flexDirection: "row", gap: spacing.md },
  editBtn: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.md,
    paddingVertical: spacing.md,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surface,
  },
  editBtnText: { fontSize: fontSize.sm, fontWeight: fontWeight.semibold, color: colors.gray700 },
});
