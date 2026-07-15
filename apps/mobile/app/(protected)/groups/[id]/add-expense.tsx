import { useEffect, useMemo, useRef, useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import DateTimePicker from "@react-native-community/datetimepicker";
import { useAddExpense, useAddExpenseCustomSplit, useAddItemizedExpense } from "@/hooks/useExpenses";
import { useCreateRecurringExpense } from "@/hooks/useRecurring";
import { useMembers } from "@/hooks/useMembers";
import { useCategories } from "@/hooks/useCategories";
import { useAuth } from "@/context/AuthContext";
import { useConversationAI } from "@/hooks/useConversationAI";
import { useSmartSplit } from "@/hooks/useSmartSplit";
import { useReceiptScan } from "@/hooks/useReceiptScan";
import { AI_UNAVAILABLE_MESSAGE, useAiAvailability } from "@/hooks/useAiAvailability";
import { AmountInput, ChipGroup, SegmentedControl, AppButton, ErrorBanner, useToast, Avatar } from "@/components/ui";
import { AppTextInput } from "@/components/ui/TextInput";
import { ReceiptScanner } from "@/components/groups/ReceiptScanner";
import { ReceiptReviewCard } from "@/components/groups/ReceiptReviewCard";
import { CategoryPicker, CategoryPill } from "@/components/groups/CategoryPicker";
import { SmartSplitSheet } from "@/components/groups/SmartSplitSheet";
import { formatCents, parsePHPAmount, equalSplit, percentSplit, sharesSplit } from "@template/shared";
import { colors, fontSize, fontWeight, spacing, borderRadius } from "@/theme";

type Mode = "quick" | "chat" | "receipt" | "detailed" | "itemized";
type SplitMode = "equal" | "percent" | "shares" | "custom";
type LineItem = { name: string; amountStr: string; participantIds: string[] };

/** Local YYYY-MM-DD (never UTC — toISOString is a day off after 8am PH). */
function localTodayISO(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function isoToLocalDate(iso: string): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!match) return new Date();
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

function dateToISO(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function DateField({ value, onChange }: { value: string; onChange: (iso: string) => void }) {
  const [show, setShow] = useState(false);
  const date = isoToLocalDate(value);
  const label = date.toLocaleDateString("en-PH", { weekday: "short", month: "short", day: "numeric", year: "numeric" });
  return (
    <View>
      <Text style={styles.label}>Date</Text>
      <TouchableOpacity
        style={styles.dateBtn}
        onPress={() => setShow((v) => !v)}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityLabel={`Expense date ${label}`}
      >
        <Ionicons name="calendar-outline" size={16} color={colors.gray600} />
        <Text style={styles.dateBtnText}>{label}</Text>
      </TouchableOpacity>
      {show && (
        <DateTimePicker
          value={date}
          mode="date"
          display={Platform.OS === "ios" ? "inline" : "default"}
          onChange={(_event, selected) => {
            setShow(false);
            if (selected) onChange(dateToISO(selected));
          }}
        />
      )}
    </View>
  );
}

export default function AddExpenseScreen() {
  const { id: groupId } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { session } = useAuth();
  const toast = useToast();

  const membersQ = useMembers(groupId);
  const members = useMemo(() => membersQ.data ?? [], [membersQ.data]);
  const categoriesQ = useCategories(groupId);
  const categories = useMemo(() => categoriesQ.data ?? [], [categoriesQ.data]);
  const addExpense = useAddExpense(groupId);
  const addCustomSplit = useAddExpenseCustomSplit(groupId);
  const addItemized = useAddItemizedExpense(groupId);
  const createRecurring = useCreateRecurringExpense(groupId);
  const conversationAI = useConversationAI({ groupId, members });
  const smartSplit = useSmartSplit({ groupId });
  const receiptScan = useReceiptScan();
  const aiAvailability = useAiAvailability();
  const [showSmartSplit, setShowSmartSplit] = useState(false);

  const [mode, setMode] = useState<Mode>("quick");

  // Shared form state
  const [itemName, setItemName] = useState("");
  const [amount, setAmount] = useState("");
  const [selectedMembers, setSelectedMembers] = useState<Set<string>>(() => new Set(members.map((m) => m.id)));
  const [payerMemberId, setPayerMemberId] = useState<string>("");
  const [categoryId, setCategoryId] = useState<string | null>(null);

  // Shared expense date (all modes)
  const [expenseDate, setExpenseDate] = useState<string>(localTodayISO());

  // Detailed mode split state
  const [splitMode, setSplitMode] = useState<SplitMode>("equal");
  const [customShares, setCustomShares] = useState<Record<string, string>>({});
  const [percentShares, setPercentShares] = useState<Record<string, string>>({});
  const [shareWeights, setShareWeights] = useState<Record<string, string>>({});

  // Recurring (detailed mode)
  const [repeats, setRepeats] = useState<"none" | "weekly" | "monthly">("none");

  // Multi-payer state
  const [multiPayer, setMultiPayer] = useState(false);
  const [payerAmounts, setPayerAmounts] = useState<Record<string, string>>({});

  // Itemized mode state
  const [lineItems, setLineItems] = useState<LineItem[]>([{ name: "", amountStr: "", participantIds: [] }]);

  // Confirmation step state (quick / detailed / itemized)
  const [confirming, setConfirming] = useState(false);

  // Chat mode state
  const [chatInput, setChatInput] = useState("");
  const [draftItem, setDraftItem] = useState("");
  const [draftAmount, setDraftAmount] = useState("");
  const [draftMembers, setDraftMembers] = useState<Set<string>>(new Set());
  const hasInitializedMembersRef = useRef(false);

  // Initialize payer to first member that matches user
  const myMember = members.find((m) => m.user_id === session?.user.id) ?? members[0];
  const effectivePayerId = payerMemberId || myMember?.id || "";
  const selectedCategory = categories.find((category) => category.id === categoryId) ?? null;

  useEffect(() => {
    hasInitializedMembersRef.current = false;
    setSelectedMembers(new Set());
    setPayerMemberId("");
  }, [groupId]);

  useEffect(() => {
    if (hasInitializedMembersRef.current || members.length === 0) return;

    setSelectedMembers(new Set(members.map((member) => member.id)));
    if (myMember) {
      setPayerMemberId((current) => current || myMember.id);
    }
    hasInitializedMembersRef.current = true;
  }, [members, myMember]);

  useEffect(() => {
    if (categoryId || categories.length === 0) return;
    setCategoryId(categories.find((category) => category.slug === "other")?.id ?? categories[0]?.id ?? null);
  }, [categories, categoryId]);

  function toggleMember(id: string) {
    setSelectedMembers((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function getPayersArray(): { memberId: string; paidCents: number }[] {
    const amountCents = parsePHPAmount(amount) ?? 0;
    if (!multiPayer) {
      return [{ memberId: effectivePayerId, paidCents: amountCents }];
    }
    return Object.entries(payerAmounts)
      .map(([id, val]) => ({ memberId: id, paidCents: parsePHPAmount(val) ?? 0 }))
      .filter((p) => p.paidCents > 0);
  }

  function validatePayerSum(amountCents: number): boolean {
    if (!multiPayer) return true;
    const sum = getPayersArray().reduce((s, p) => s + p.paidCents, 0);
    if (sum !== amountCents) {
      toast.error(`Payer total ₱${(sum / 100).toFixed(2)} must equal expense amount ₱${(amountCents / 100).toFixed(2)}`);
      return false;
    }
    return true;
  }

  function getPercentSum(): number {
    return [...selectedMembers].reduce((s, id) => s + (Number.parseFloat(percentShares[id] ?? "") || 0), 0);
  }

  function getShareWeightsArray(): number[] {
    // Empty weight defaults to 1 share so the mode works with minimal typing.
    return [...selectedMembers].map((id) => {
      const raw = shareWeights[id];
      if (raw === undefined || raw.trim() === "") return 1;
      return Number.parseFloat(raw);
    });
  }

  /** Resolve percent/shares/custom to exact custom-split cents, or null if invalid. */
  function resolveCustomSplits(amountCents: number): { memberId: string; shareCents: number }[] | null {
    const ids = [...selectedMembers];
    try {
      if (splitMode === "percent") {
        const cents = percentSplit(amountCents, ids.map((id) => Number.parseFloat(percentShares[id] ?? "") || 0));
        return ids.map((id, i) => ({ memberId: id, shareCents: cents[i] ?? 0 }));
      }
      if (splitMode === "shares") {
        const cents = sharesSplit(amountCents, getShareWeightsArray());
        return ids.map((id, i) => ({ memberId: id, shareCents: cents[i] ?? 0 }));
      }
    } catch {
      return null;
    }
    if (splitMode === "custom") {
      return ids.map((id) => ({ memberId: id, shareCents: parsePHPAmount(customShares[id] ?? "0") ?? 0 }));
    }
    return null;
  }

  function validateCustomSplitSum(amountCents: number): boolean {
    const sum = [...selectedMembers].reduce((s, id) => s + (parsePHPAmount(customShares[id] ?? "0") ?? 0), 0);
    if (sum !== amountCents) {
      toast.error(`Custom split total ₱${(sum / 100).toFixed(2)} must equal expense amount ₱${(amountCents / 100).toFixed(2)}`);
      return false;
    }
    return true;
  }

  function handleQuickReview() {
    if (!itemName.trim()) {
      toast.error("Please enter what this expense was for.");
      return;
    }
    const amountCents = parsePHPAmount(amount);
    if (amountCents === null) {
      toast.error("Please enter the expense amount.");
      return;
    }
    if (amountCents < 0) {
      toast.error("Amount must be positive. To record a refund, edit an existing expense.");
      return;
    }
    if (amountCents === 0) {
      toast.error("Amount must be greater than zero.");
      return;
    }
    if (selectedMembers.size === 0) {
      toast.error("Please select at least one member to split this with.");
      return;
    }
    if (!effectivePayerId) {
      toast.error("Please select who paid for this.");
      return;
    }
    setConfirming(true);
  }

  async function handleQuickSave() {
    const amountCents = parsePHPAmount(amount) ?? 0;
    const result = await addExpense.mutateAsync({
      groupId,
      itemName: itemName.trim(),
      amountCents,
      categoryId,
      memberIds: [...selectedMembers],
      payerMemberId: effectivePayerId,
      createdByUserId: session?.user.id ?? "",
      expenseDate,
    });
    if (result.error) { toast.error(result.error); return; }
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    toast.success("Expense added");
    router.back();
  }

  function handleDetailedReview() {
    if (!itemName.trim()) {
      toast.error("Please enter what this expense was for.");
      return;
    }
    const amountCents = parsePHPAmount(amount);
    if (amountCents === null) {
      toast.error("Please enter the expense amount.");
      return;
    }
    if (amountCents < 0) {
      toast.error("Amount must be positive. To record a refund, edit an existing expense.");
      return;
    }
    if (amountCents === 0) {
      toast.error("Amount must be greater than zero.");
      return;
    }
    if (selectedMembers.size === 0) {
      toast.error("Please select at least one member to split this with.");
      return;
    }
    if (!validatePayerSum(amountCents)) return;
    if (splitMode === "custom" && !validateCustomSplitSum(amountCents)) return;
    if (splitMode === "percent" && Math.abs(getPercentSum() - 100) > 0.01) {
      toast.error(`Percentages must sum to 100 (currently ${getPercentSum().toFixed(2)}).`);
      return;
    }
    if (splitMode === "shares" && getShareWeightsArray().some((w) => !Number.isFinite(w) || w <= 0)) {
      toast.error("Shares must be positive numbers.");
      return;
    }
    if (getPayersArray().length === 0) {
      toast.error("Please select who paid.");
      return;
    }
    setConfirming(true);
  }

  async function handleDetailedSave() {
    const amountCents = parsePHPAmount(amount) ?? 0;
    const payers = getPayersArray();
    if (splitMode !== "equal") {
      // percent/shares resolve to exact cents and reuse the custom-split path
      const customSplits = resolveCustomSplits(amountCents);
      if (!customSplits) { toast.error("Could not resolve the split. Check the values and try again."); return; }
      const result = await addCustomSplit.mutateAsync({ groupId, itemName: itemName.trim(), amountCents, categoryId, customSplits, payers, expenseDate });
      if (result.error) { toast.error(result.error); return; }
    } else {
      const result = await addExpense.mutateAsync({ groupId, itemName: itemName.trim(), amountCents, categoryId, memberIds: [...selectedMembers], payerMemberId: effectivePayerId, createdByUserId: session?.user.id ?? "", expenseDate });
      if (result.error) { toast.error(result.error); return; }
    }
    if (repeats !== "none") {
      const recurringResult = await createRecurring.mutateAsync({
        groupId,
        itemName: itemName.trim(),
        amountCents,
        categoryId,
        payers,
        participantMemberIds: [...selectedMembers],
        cadence: repeats,
        createdByUserId: session?.user.id ?? "",
      });
      if (recurringResult.error) {
        toast.error(`Expense added, but the ${repeats} repeat could not be saved`);
      }
    }
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    toast.success("Expense added");
    router.back();
  }

  async function handleChatSend() {
    if (!chatInput.trim() || conversationAI.isProcessing) return;
    const userMsg = chatInput.trim();
    setChatInput("");

    const aiResult = await conversationAI.sendMessage(userMsg);

    // Sync AI draft into local form state
    const aiDraft = aiResult.draft;
    if (aiDraft) {
      setDraftItem(aiDraft.item_name);
      setDraftAmount(aiDraft.amount_cents > 0 ? String(aiDraft.amount_cents / 100) : "");
      // Match participant names to member IDs
      const matchedIds = aiDraft.participant_names.length > 0
        ? members
            .filter((m) => aiDraft.participant_names.includes(m.display_name))
            .map((m) => m.id)
        : members.map((m) => m.id);
      setDraftMembers(new Set(matchedIds));
      if (aiDraft.date) setExpenseDate(aiDraft.date);
      const suggested = categories.find((category) => category.is_default && category.slug === aiDraft.category_slug);
      if (suggested) setCategoryId(suggested.id);
    }
  }

  async function handleChatSave() {
    const amountCents = parsePHPAmount(draftAmount) ?? 0;
    if (!draftItem || amountCents <= 0) {
      toast.error("Could not extract expense details. Please fill in manually.");
      return;
    }
    const memberIds = draftMembers.size > 0 ? [...draftMembers] : members.map((m) => m.id);
    const result = await addExpense.mutateAsync({
      groupId,
      itemName: draftItem,
      amountCents,
      categoryId,
      memberIds,
      payerMemberId: effectivePayerId,
      createdByUserId: session?.user.id ?? "",
      expenseDate,
    });
    if (result.error) { toast.error(result.error); return; }
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    toast.success("Expense added");
    router.back();
  }

  function updateLineItem(i: number, patch: Partial<LineItem>) {
    setLineItems((prev) => prev.map((li, idx) => (idx === i ? { ...li, ...patch } : li)));
  }

  function toggleLineItemParticipant(lineIdx: number, memberId: string) {
    setLineItems((prev) =>
      prev.map((li, idx) => {
        if (idx !== lineIdx) return li;
        const next = li.participantIds.includes(memberId)
          ? li.participantIds.filter((id) => id !== memberId)
          : [...li.participantIds, memberId];
        return { ...li, participantIds: next };
      }),
    );
  }

  function handleItemizedReview() {
    const amountCents = parsePHPAmount(amount) ?? 0;
    if (!itemName.trim() || amountCents <= 0) {
      toast.error("Please fill in expense name and total amount.");
      return;
    }
    const filled = lineItems.filter((li) => li.name.trim() && (parsePHPAmount(li.amountStr) ?? 0) > 0);
    if (filled.length === 0) {
      toast.error("Add at least one line item with a name and amount.");
      return;
    }
    const liTotal = filled.reduce((s, li) => s + (parsePHPAmount(li.amountStr) ?? 0), 0);
    if (liTotal !== amountCents) {
      toast.error(`Line items total ₱${(liTotal / 100).toFixed(2)} must equal expense amount ₱${(amountCents / 100).toFixed(2)}`);
      return;
    }
    if (!validatePayerSum(amountCents)) return;
    if (getPayersArray().length === 0) {
      toast.error("Please select who paid.");
      return;
    }
    setConfirming(true);
  }

  async function handleItemizedSave() {
    const amountCents = parsePHPAmount(amount) ?? 0;
    const payers = getPayersArray();
    const filledItems = lineItems.filter((li) => li.name.trim() && (parsePHPAmount(li.amountStr) ?? 0) > 0);
    const result = await addItemized.mutateAsync({
      groupId,
      expenseName: itemName.trim(),
      amountCents,
      categoryId,
      payers,
      expenseDate,
      lineItems: filledItems.map((li) => ({
        name: li.name.trim(),
        amountCents: parsePHPAmount(li.amountStr) ?? 0,
        participantIds: li.participantIds.length > 0 ? li.participantIds : members.map((m) => m.id),
      })),
    });
    if (result.error) { toast.error(result.error); return; }
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    toast.success("Expense added");
    router.back();
  }

  const memberChips = members.map((m) => ({ id: m.id, label: m.display_name }));
  const amountCents = parsePHPAmount(amount) ?? 0;

  // Custom split running total
  const customSplitSum = splitMode === "custom"
    ? [...selectedMembers].reduce((s, id) => s + (parsePHPAmount(customShares[id] ?? "0") ?? 0), 0)
    : 0;
  const splitRemaining = amountCents - customSplitSum;

  // Multi-payer running total
  const payerSum = multiPayer
    ? Object.entries(payerAmounts).reduce((s, [, v]) => s + (parsePHPAmount(v) ?? 0), 0)
    : 0;
  const payerRemaining = amountCents - payerSum;

  const isSavePending = addExpense.isPending || addCustomSplit.isPending || addItemized.isPending;

  if (confirming) {
    const payerLabel = multiPayer
      ? Object.entries(payerAmounts).filter(([, v]) => (parsePHPAmount(v) ?? 0) > 0).map(([id, v]) => `${members.find((m) => m.id === id)?.display_name ?? id} (${formatCents(parsePHPAmount(v) ?? 0)})`).join(", ")
      : (members.find((m) => m.id === effectivePayerId)?.display_name ?? "—");

    const onConfirm = mode === "quick" ? handleQuickSave : mode === "detailed" ? handleDetailedSave : handleItemizedSave;

    return (
      <>
        <Stack.Screen options={{ title: "Confirm Expense", headerShown: true }} />
        <ScrollView style={styles.scroll} contentContainerStyle={[styles.content, { justifyContent: "flex-start" }]}>
          <View style={styles.confirmCard}>
            <Text style={styles.confirmTitle}>REVIEW</Text>
            <Text style={styles.confirmName}>{itemName}</Text>
            <Text style={styles.confirmAmount}>{formatCents(amountCents)}</Text>
            <CategoryPill category={selectedCategory} />
            <View style={styles.confirmRow}>
              <Text style={styles.confirmLabel}>Date</Text>
              <Text style={styles.confirmValue}>{isoToLocalDate(expenseDate).toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" })}</Text>
            </View>
            <View style={styles.confirmRow}>
              <Text style={styles.confirmLabel}>Paid by</Text>
              <Text style={styles.confirmValue}>{payerLabel}</Text>
            </View>
            {mode === "quick" && (
              <View style={styles.confirmRow}>
                <Text style={styles.confirmLabel}>Split</Text>
                <Text style={styles.confirmValue}>Equal · {selectedMembers.size} member{selectedMembers.size !== 1 ? "s" : ""}</Text>
              </View>
            )}
            {mode === "detailed" && (
              <View style={styles.confirmRow}>
                <Text style={styles.confirmLabel}>Split</Text>
                <Text style={styles.confirmValue}>
                  {splitMode === "custom"
                    ? "Custom"
                    : splitMode === "percent"
                      ? "By percentage"
                      : splitMode === "shares"
                        ? "By shares"
                        : `Equal · ${selectedMembers.size} member${selectedMembers.size !== 1 ? "s" : ""}`}
                </Text>
              </View>
            )}
            {mode === "itemized" && lineItems.filter((li) => li.name.trim()).map((li, i) => (
              <View key={i} style={styles.confirmRow}>
                <Text style={styles.confirmLabel} numberOfLines={1}>{li.name}</Text>
                <Text style={styles.confirmValue}>{formatCents(parsePHPAmount(li.amountStr) ?? 0)}</Text>
              </View>
            ))}
          </View>

          <View style={styles.confirmActions}>
            <TouchableOpacity style={styles.backBtn} onPress={() => setConfirming(false)} activeOpacity={0.7}>
              <Text style={styles.backBtnText}>Back to Edit</Text>
            </TouchableOpacity>
            <View style={{ flex: 1 }}>
              <AppButton title={isSavePending ? "Saving…" : "Confirm & Save"} onPress={onConfirm} isLoading={isSavePending} />
            </View>
          </View>
        </ScrollView>
      </>
    );
  }

  return (
    <>
      <Stack.Screen options={{ title: "Add Expense", headerShown: true }} />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : "height"}>
        <ScrollView style={styles.scroll} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          {/* Smart add hint — jumps into the natural-language chat mode */}
          {mode !== "chat" && (
            <TouchableOpacity
              style={styles.smartBanner}
              onPress={() => setMode("chat")}
              activeOpacity={0.8}
            >
              <View style={styles.smartBannerHeader}>
                <Ionicons name="sparkles" size={14} color={colors.primary} />
                <Text style={styles.smartBannerTitle}>Smart add</Text>
              </View>
              <Text style={styles.smartBannerSub}>
                Try typing something like:{" "}
                <Text style={styles.smartBannerExample}>
                  “Dinner 2400 paid by Manolo, split with Aya and Carlo”
                </Text>
              </Text>
            </TouchableOpacity>
          )}

          <SegmentedControl
            segments={[
              { value: "quick" as Mode, label: "Quick" },
              { value: "chat" as Mode, label: "Chat" },
              { value: "receipt" as Mode, label: "Receipt" },
              { value: "detailed" as Mode, label: "Detailed" },
              { value: "itemized" as Mode, label: "Itemized" },
            ]}
            value={mode}
            onChange={(m) => { setMode(m); if (m !== "chat") conversationAI.reset(); }}
          />

          {/* ---- QUICK MODE ---- */}
          {mode === "quick" && (() => {
            const quickAmountCents = parsePHPAmount(amount) ?? 0;
            const quickSelected = members.filter((m) => selectedMembers.has(m.id));
            const quickShares = new Map<string, number>();
            if (quickAmountCents > 0 && quickSelected.length > 0) {
              const parts = equalSplit(quickAmountCents, quickSelected.length);
              quickSelected.forEach((m, i) => quickShares.set(m.id, parts[i] ?? 0));
            }
            return (
              <View style={styles.form}>
                <AmountInput label="Amount" value={amount} onChangeText={setAmount} />
                <AppTextInput label="Description" value={itemName} onChangeText={setItemName} placeholder="e.g. Dinner at La Lucci" />
                <DateField value={expenseDate} onChange={setExpenseDate} />
                <View>
                  <Text style={styles.label}>Paid by</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.payerRow}>
                    {members.map((m) => (
                      <TouchableOpacity key={m.id} style={[styles.payerChip, effectivePayerId === m.id && styles.payerChipActive]} onPress={() => setPayerMemberId(m.id)} activeOpacity={0.7} accessibilityRole="radio" accessibilityState={{ selected: effectivePayerId === m.id }} accessibilityLabel={`Paid by ${m.display_name}`}>
                        <Text style={[styles.payerChipText, effectivePayerId === m.id && styles.payerChipTextActive]}>{m.display_name}</Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                </View>
                <View>
                  <View style={styles.splitHeader}>
                    <Text style={styles.label}>Split between</Text>
                    <Text style={styles.splitHeaderHint}>Equal split</Text>
                  </View>
                  <View style={styles.splitList}>
                    {members.map((m, i) => {
                      const selected = selectedMembers.has(m.id);
                      return (
                        <TouchableOpacity
                          key={m.id}
                          style={[styles.splitRow, i > 0 && styles.splitRowBorder]}
                          onPress={() => toggleMember(m.id)}
                          activeOpacity={0.7}
                          accessibilityRole="checkbox"
                          accessibilityState={{ checked: selected }}
                          accessibilityLabel={`Split with ${m.display_name}`}
                        >
                          <View style={[styles.checkbox, selected && styles.checkboxChecked]}>
                            {selected && <Ionicons name="checkmark" size={13} color={colors.white} />}
                          </View>
                          <Avatar name={m.display_name} size={28} />
                          <Text style={[styles.splitName, !selected && styles.splitNameOff]} numberOfLines={1}>
                            {m.display_name}
                            {m.user_id === session?.user.id ? " (you)" : ""}
                          </Text>
                          <Text style={[styles.splitAmount, !selected && styles.splitAmountOff]}>
                            {formatCents(selected ? quickShares.get(m.id) ?? 0 : 0)}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>
                <CategoryPicker categories={categories} selectedId={categoryId} onSelect={setCategoryId} />
                <View style={styles.quickActionsRow}>
                  <TouchableOpacity style={styles.moreOptionsBtn} onPress={() => setMode("detailed")} activeOpacity={0.7}>
                    <Text style={styles.moreOptionsText}>More options</Text>
                  </TouchableOpacity>
                  <View style={{ flex: 1 }}>
                    <AppButton title="Save expense" onPress={handleQuickReview} disabled={!itemName.trim() || !amount} />
                  </View>
                </View>
              </View>
            );
          })()}

          {/* ---- CHAT MODE ---- */}
          {mode === "chat" && (
            <View style={styles.form}>
              {aiAvailability === "unavailable" && <ErrorBanner message={AI_UNAVAILABLE_MESSAGE} />}
              <View style={styles.chatHistory}>
                {conversationAI.messages.length === 0 && (
                  <Text style={styles.chatHint}>Try: "Lunch 500 split with Manolo and Ana"</Text>
                )}
                {conversationAI.messages.map((msg, i) => (
                  <View key={i} style={[styles.chatBubble, msg.role === "user" ? styles.chatUser : styles.chatAssistant]}>
                    <Text style={[styles.chatText, msg.role === "user" && styles.chatTextUser]}>{msg.content}</Text>
                  </View>
                ))}
                {conversationAI.isProcessing && (
                  <View style={[styles.chatBubble, styles.chatAssistant]}>
                    <Text style={styles.chatText}>Thinking…</Text>
                  </View>
                )}
              </View>
              {draftItem ? (
                <View style={styles.draftCard}>
                  <Text style={styles.draftTitle}>DRAFT</Text>
                  <Text style={styles.draftItem}>{draftItem}</Text>
                  <Text style={styles.draftAmount}>{draftAmount ? `\u20B1${draftAmount}` : "\u2014"}</Text>
                  <CategoryPicker categories={categories} selectedId={categoryId} onSelect={setCategoryId} />
                  <AppButton title="Confirm & Save" onPress={handleChatSave} isLoading={addExpense.isPending} />
                </View>
              ) : null}
              <View style={styles.chatInputRow}>
                <View style={styles.chatTextInput}>
                  <AppTextInput value={chatInput} onChangeText={setChatInput} placeholder="Describe the expense…" onSubmitEditing={() => void handleChatSend()} returnKeyType="send" />
                </View>
                <TouchableOpacity style={styles.sendBtn} onPress={() => void handleChatSend()} disabled={conversationAI.isProcessing || aiAvailability === "unavailable"}>
                  <Text style={styles.sendBtnText}>{"\u2192"}</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          {/* ---- RECEIPT MODE ---- */}
          {mode === "receipt" && (
            <View style={styles.form}>
              <ReceiptScanner
                imageUri={receiptScan.imageUri}
                isScanning={receiptScan.isScanning}
                error={receiptScan.error}
                onCamera={() => void receiptScan.scanFromCamera()}
                onGallery={() => void receiptScan.scanFromGallery()}
                onClear={receiptScan.clear}
              />
              {receiptScan.receipt && (
                <ReceiptReviewCard
                  receipt={receiptScan.receipt}
                  provider={receiptScan.provider}
                  onAccept={(name, cents) => {
                    setItemName(name);
                    setAmount(String(cents / 100));
                    if (receiptScan.receipt?.date) setExpenseDate(receiptScan.receipt.date);
                    receiptScan.clear();
                    setMode("detailed");
                  }}
                  onDismiss={receiptScan.clear}
                />
              )}
            </View>
          )}

          {/* ---- ITEMIZED MODE ---- */}
          {mode === "itemized" && (
            <View style={styles.form}>
              <AppTextInput label="Expense Name" value={itemName} onChangeText={setItemName} placeholder="e.g. Dinner at Jollibee" />
              <AmountInput label="Total Amount" value={amount} onChangeText={setAmount} />
              <DateField value={expenseDate} onChange={setExpenseDate} />
              <CategoryPicker categories={categories} selectedId={categoryId} onSelect={setCategoryId} />

              {/* Line items */}
              <View>
                <Text style={styles.label}>Line Items</Text>
                <View style={styles.lineItemsContainer}>
                  {lineItems.map((li, i) => (
                    <View key={i} style={styles.lineItemCard}>
                      <View style={styles.lineItemHeader}>
                        <Text style={styles.lineItemIndex}>Item {i + 1}</Text>
                        {lineItems.length > 1 && (
                          <TouchableOpacity onPress={() => setLineItems((prev) => prev.filter((_, idx) => idx !== i))}>
                            <Text style={styles.removeText}>Remove</Text>
                          </TouchableOpacity>
                        )}
                      </View>
                      <View style={styles.lineItemFields}>
                        <View style={{ flex: 1 }}>
                          <AppTextInput value={li.name} onChangeText={(v) => updateLineItem(i, { name: v })} placeholder="Item name" />
                        </View>
                        <View style={{ width: 110 }}>
                          <AmountInput value={li.amountStr} onChangeText={(v) => updateLineItem(i, { amountStr: v })} />
                        </View>
                      </View>
                      <Text style={styles.sublabel}>Who had this?</Text>
                      <View style={styles.participantRow}>
                        {members.map((m) => (
                          <TouchableOpacity
                            key={m.id}
                            style={[styles.participantChip, li.participantIds.includes(m.id) && styles.participantChipActive]}
                            onPress={() => toggleLineItemParticipant(i, m.id)}
                            activeOpacity={0.7}
                          >
                            <Text style={[styles.participantChipText, li.participantIds.includes(m.id) && styles.participantChipTextActive]}>
                              {m.display_name}
                            </Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    </View>
                  ))}
                  <TouchableOpacity
                    style={styles.addLineItemBtn}
                    onPress={() => setLineItems((prev) => [...prev, { name: "", amountStr: "", participantIds: [] }])}
                  >
                    <Text style={styles.addLineItemText}>+ Add item</Text>
                  </TouchableOpacity>
                </View>

                {/* Line items total vs expense total */}
                {(parsePHPAmount(amount) ?? 0) > 0 && (() => {
                  const total = parsePHPAmount(amount) ?? 0;
                  const liTotal = lineItems.reduce((s, li) => s + (parsePHPAmount(li.amountStr) ?? 0), 0);
                  const remaining = total - liTotal;
                  return (
                    <View style={[styles.splitSumRow, remaining !== 0 && styles.splitSumError]}>
                      {remaining === 0 ? (
                        <View style={styles.splitSumBalanced}>
                          <Ionicons name="checkmark-circle" size={14} color={colors.success} />
                          <Text style={styles.splitSumText}>Items balance</Text>
                        </View>
                      ) : (
                        <Text style={[styles.splitSumText, styles.splitSumTextError]}>
                          {remaining > 0 ? `₱${(remaining / 100).toFixed(2)} remaining` : `₱${(Math.abs(remaining) / 100).toFixed(2)} over`}
                        </Text>
                      )}
                    </View>
                  );
                })()}
              </View>

              {/* Paid by */}
              <View>
                <View style={styles.paidByHeader}>
                  <Text style={styles.label}>Paid by</Text>
                  <TouchableOpacity onPress={() => setMultiPayer((v) => !v)} activeOpacity={0.7}>
                    <Text style={styles.multiPayerToggle}>{multiPayer ? "Single payer" : "Split payment"}</Text>
                  </TouchableOpacity>
                </View>
                {!multiPayer ? (
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.payerRow}>
                    {members.map((m) => (
                      <TouchableOpacity key={m.id} style={[styles.payerChip, effectivePayerId === m.id && styles.payerChipActive]} onPress={() => setPayerMemberId(m.id)} activeOpacity={0.7} accessibilityRole="radio" accessibilityState={{ selected: effectivePayerId === m.id }} accessibilityLabel={`Paid by ${m.display_name}`}>
                        <Text style={[styles.payerChipText, effectivePayerId === m.id && styles.payerChipTextActive]}>{m.display_name}</Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                ) : (
                  <View style={styles.customSplitSection}>
                    {members.map((m) => (
                      <View key={m.id} style={styles.customSplitRow}>
                        <Text style={styles.customSplitName} numberOfLines={1}>{m.display_name}</Text>
                        <View style={styles.customSplitInput}>
                          <AmountInput value={payerAmounts[m.id] ?? ""} onChangeText={(v) => setPayerAmounts((prev) => ({ ...prev, [m.id]: v }))} accessibilityLabel={`Amount paid by ${m.display_name}`} />
                        </View>
                      </View>
                    ))}
                    <View style={[styles.splitSumRow, payerRemaining !== 0 && styles.splitSumError]}>
                      {payerRemaining === 0 ? (
                        <View style={styles.splitSumBalanced}>
                          <Ionicons name="checkmark-circle" size={14} color={colors.success} />
                          <Text style={styles.splitSumText}>Amounts balance</Text>
                        </View>
                      ) : (
                        <Text style={[styles.splitSumText, styles.splitSumTextError]}>
                          {payerRemaining > 0 ? `₱${(payerRemaining / 100).toFixed(2)} remaining` : `₱${(Math.abs(payerRemaining) / 100).toFixed(2)} over`}
                        </Text>
                      )}
                    </View>
                  </View>
                )}
              </View>

              <AppButton title="Review" onPress={handleItemizedReview} disabled={!itemName.trim() || !amount} />
            </View>
          )}

          {/* ---- DETAILED MODE ---- */}
          {mode === "detailed" && (
            <View style={styles.form}>
              <AppTextInput label="Item Name" value={itemName} onChangeText={setItemName} placeholder="e.g. Dinner" />
              <AmountInput label="Amount" value={amount} onChangeText={setAmount} />
              <DateField value={expenseDate} onChange={setExpenseDate} />
              <CategoryPicker categories={categories} selectedId={categoryId} onSelect={setCategoryId} />

              {/* Recurring cadence */}
              <View>
                <Text style={styles.label}>Repeats</Text>
                <SegmentedControl
                  segments={[
                    { value: "none" as const, label: "Never" },
                    { value: "weekly" as const, label: "Weekly" },
                    { value: "monthly" as const, label: "Monthly" },
                  ]}
                  value={repeats}
                  onChange={setRepeats}
                />
              </View>

              {/* Participant chips */}
              <ChipGroup label="Split with" chips={memberChips} selected={selectedMembers} onToggle={toggleMember} />

              {/* Split mode toggle */}
              <View>
                <Text style={styles.label}>How to split</Text>
                <View style={styles.toggleRow}>
                  {(["equal", "percent", "shares", "custom"] as SplitMode[]).map((s) => (
                    <TouchableOpacity key={s} style={[styles.toggleBtn, splitMode === s && styles.toggleBtnActive]} onPress={() => setSplitMode(s)} activeOpacity={0.7}>
                      <Text style={[styles.toggleBtnText, splitMode === s && styles.toggleBtnTextActive]}>
                        {s === "equal" ? "Equal" : s === "percent" ? "%" : s === "shares" ? "Shares" : "Custom"}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              {/* Percent split inputs */}
              {splitMode === "percent" && selectedMembers.size > 0 && (
                <View style={styles.customSplitSection}>
                  {[...selectedMembers].map((id) => {
                    const m = members.find((mem) => mem.id === id);
                    if (!m) return null;
                    return (
                      <View key={id} style={styles.customSplitRow}>
                        <Text style={styles.customSplitName} numberOfLines={1}>{m.display_name}</Text>
                        <View style={styles.customSplitInput}>
                          <AppTextInput
                            value={percentShares[id] ?? ""}
                            onChangeText={(v) => setPercentShares((prev) => ({ ...prev, [id]: v }))}
                            placeholder="0"
                            keyboardType="decimal-pad"
                            accessibilityLabel={`Percentage for ${m.display_name}`}
                          />
                        </View>
                      </View>
                    );
                  })}
                  <View style={[styles.splitSumRow, Math.abs(getPercentSum() - 100) > 0.01 && styles.splitSumError]}>
                    {Math.abs(getPercentSum() - 100) <= 0.01 ? (
                      <View style={styles.splitSumBalanced}>
                        <Ionicons name="checkmark-circle" size={14} color={colors.success} />
                        <Text style={styles.splitSumText}>Percentages balance</Text>
                      </View>
                    ) : (
                      <Text style={[styles.splitSumText, styles.splitSumTextError]}>
                        {getPercentSum().toFixed(2)}% of 100%
                      </Text>
                    )}
                  </View>
                </View>
              )}

              {/* Shares split inputs */}
              {splitMode === "shares" && selectedMembers.size > 0 && (
                <View style={styles.customSplitSection}>
                  <Text style={styles.sublabel}>Blank = 1 share (e.g. 2 for someone covering two people)</Text>
                  {[...selectedMembers].map((id) => {
                    const m = members.find((mem) => mem.id === id);
                    if (!m) return null;
                    return (
                      <View key={id} style={styles.customSplitRow}>
                        <Text style={styles.customSplitName} numberOfLines={1}>{m.display_name}</Text>
                        <View style={styles.customSplitInput}>
                          <AppTextInput
                            value={shareWeights[id] ?? ""}
                            onChangeText={(v) => setShareWeights((prev) => ({ ...prev, [id]: v }))}
                            placeholder="1"
                            keyboardType="decimal-pad"
                            accessibilityLabel={`Shares for ${m.display_name}`}
                          />
                        </View>
                      </View>
                    );
                  })}
                  {amountCents > 0 && !getShareWeightsArray().some((w) => !Number.isFinite(w) || w <= 0) && (
                    <Text style={styles.sublabel}>
                      {(resolveCustomSplits(amountCents) ?? [])
                        .map((split) => `${members.find((mem) => mem.id === split.memberId)?.display_name ?? "?"}: ${formatCents(split.shareCents)}`)
                        .join(" · ")}
                    </Text>
                  )}
                </View>
              )}

              {/* Custom split inputs */}
              {splitMode === "custom" && selectedMembers.size > 0 && (
                <View style={styles.customSplitSection}>
                  <TouchableOpacity
                    style={styles.smartSplitBtn}
                    onPress={() => {
                      if (aiAvailability === "unavailable") {
                        toast.error(AI_UNAVAILABLE_MESSAGE);
                        return;
                      }
                      setShowSmartSplit(true);
                    }}
                    activeOpacity={0.7}
                    disabled={!itemName.trim() || amountCents <= 0}
                  >
                    <Ionicons name="sparkles" size={14} color={colors.primary} />
                    <Text style={styles.smartSplitBtnText}>Smart Split</Text>
                  </TouchableOpacity>
                  {[...selectedMembers].map((id) => {
                    const m = members.find((mem) => mem.id === id);
                    if (!m) return null;
                    return (
                      <View key={id} style={styles.customSplitRow}>
                        <Text style={styles.customSplitName} numberOfLines={1}>{m.display_name}</Text>
                        <View style={styles.customSplitInput}>
                          <AmountInput value={customShares[id] ?? ""} onChangeText={(v) => setCustomShares((prev) => ({ ...prev, [id]: v }))} accessibilityLabel={`Share for ${m.display_name}`} />
                        </View>
                      </View>
                    );
                  })}
                  <View style={[styles.splitSumRow, splitRemaining !== 0 && styles.splitSumError]}>
                    {splitRemaining === 0 ? (
                      <View style={styles.splitSumBalanced}>
                        <Ionicons name="checkmark-circle" size={14} color={colors.success} />
                        <Text style={styles.splitSumText}>Split balances</Text>
                      </View>
                    ) : (
                      <Text style={[styles.splitSumText, styles.splitSumTextError]}>
                        {splitRemaining > 0 ? `₱${(splitRemaining / 100).toFixed(2)} remaining` : `₱${(Math.abs(splitRemaining) / 100).toFixed(2)} over`}
                      </Text>
                    )}
                  </View>
                </View>
              )}

              {/* Paid by */}
              <View>
                <View style={styles.paidByHeader}>
                  <Text style={styles.label}>Paid by</Text>
                  <TouchableOpacity onPress={() => setMultiPayer((v) => !v)} activeOpacity={0.7}>
                    <Text style={styles.multiPayerToggle}>{multiPayer ? "Single payer" : "Split payment"}</Text>
                  </TouchableOpacity>
                </View>

                {!multiPayer ? (
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.payerRow}>
                    {members.map((m) => (
                      <TouchableOpacity key={m.id} style={[styles.payerChip, effectivePayerId === m.id && styles.payerChipActive]} onPress={() => setPayerMemberId(m.id)} activeOpacity={0.7} accessibilityRole="radio" accessibilityState={{ selected: effectivePayerId === m.id }} accessibilityLabel={`Paid by ${m.display_name}`}>
                        <Text style={[styles.payerChipText, effectivePayerId === m.id && styles.payerChipTextActive]}>{m.display_name}</Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                ) : (
                  <View style={styles.customSplitSection}>
                    {members.map((m) => (
                      <View key={m.id} style={styles.customSplitRow}>
                        <Text style={styles.customSplitName} numberOfLines={1}>{m.display_name}</Text>
                        <View style={styles.customSplitInput}>
                          <AmountInput value={payerAmounts[m.id] ?? ""} onChangeText={(v) => setPayerAmounts((prev) => ({ ...prev, [m.id]: v }))} accessibilityLabel={`Amount paid by ${m.display_name}`} />
                        </View>
                      </View>
                    ))}
                    <View style={[styles.splitSumRow, payerRemaining !== 0 && styles.splitSumError]}>
                      {payerRemaining === 0 ? (
                        <View style={styles.splitSumBalanced}>
                          <Ionicons name="checkmark-circle" size={14} color={colors.success} />
                          <Text style={styles.splitSumText}>Amounts balance</Text>
                        </View>
                      ) : (
                        <Text style={[styles.splitSumText, styles.splitSumTextError]}>
                          {payerRemaining > 0 ? `₱${(payerRemaining / 100).toFixed(2)} remaining` : `₱${(Math.abs(payerRemaining) / 100).toFixed(2)} over`}
                        </Text>
                      )}
                    </View>
                  </View>
                )}
              </View>

              <AppButton title="Review" onPress={handleDetailedReview} disabled={!itemName.trim() || !amount} />
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>

      {showSmartSplit && (
        <SmartSplitSheet
          itemName={itemName}
          amountCents={amountCents}
          memberNames={[...selectedMembers].map((id) => members.find((m) => m.id === id)?.display_name ?? id)}
          isLoading={smartSplit.isLoading}
          result={smartSplit.result}
          onSuggest={(context) => {
            const memberNames = [...selectedMembers].map((id) => members.find((m) => m.id === id)?.display_name ?? id);
            void smartSplit.suggest({ itemName, amountCents, memberNames, context });
          }}
          onApply={(result) => {
            const newShares: Record<string, string> = {};
            for (const s of result.suggestions) {
              const member = members.find((m) => m.display_name === s.member_name);
              if (member) newShares[member.id] = String(s.share_cents / 100);
            }
            setCustomShares(newShares);
            setShowSmartSplit(false);
            smartSplit.clear();
          }}
          onClose={() => { setShowSmartSplit(false); smartSplit.clear(); }}
        />
      )}
    </>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.base, paddingBottom: spacing["2xl"], gap: spacing.base },
  form: { gap: spacing.md, marginTop: spacing.base },

  smartBanner: {
    backgroundColor: colors.primaryLight + "80",
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.primary + "30",
    padding: spacing.base,
    marginBottom: spacing.md,
  },
  smartBannerHeader: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
  smartBannerTitle: { fontSize: fontSize.base, fontWeight: fontWeight.bold, color: colors.gray900 },
  smartBannerSub: { fontSize: fontSize.sm, color: colors.gray600, marginTop: 4, lineHeight: 18 },
  smartBannerExample: { fontWeight: fontWeight.semibold, color: colors.primaryDark },

  splitHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  splitHeaderHint: { fontSize: fontSize.sm, fontWeight: fontWeight.semibold, color: colors.primary },
  splitList: {
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md,
    marginTop: spacing.xs,
  },
  splitRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingVertical: spacing.md },
  splitRowBorder: { borderTopWidth: 1, borderTopColor: colors.gray100 },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: colors.gray300,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.white,
  },
  checkboxChecked: { backgroundColor: colors.primary, borderColor: colors.primary },
  splitName: { flex: 1, minWidth: 0, fontSize: fontSize.base, fontWeight: fontWeight.medium, color: colors.gray900 },
  splitNameOff: { color: colors.gray400 },
  splitAmount: { fontSize: fontSize.base, fontWeight: fontWeight.semibold, color: colors.gray900, fontVariant: ["tabular-nums"] },
  splitAmountOff: { color: colors.gray300 },
  quickActionsRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  moreOptionsBtn: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.lg,
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
    backgroundColor: colors.surface,
  },
  moreOptionsText: { fontSize: fontSize.base, fontWeight: fontWeight.semibold, color: colors.gray700 },
  label: { fontSize: fontSize.sm, fontWeight: fontWeight.semibold, color: colors.gray700, marginBottom: spacing.xs },

  payerRow: { gap: spacing.sm, paddingVertical: spacing.xs },
  payerChip: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: borderRadius.full, backgroundColor: colors.gray100, borderWidth: 1, borderColor: colors.border },
  payerChipActive: { backgroundColor: colors.primaryLight, borderColor: colors.primary },
  payerChipText: { fontSize: fontSize.sm, fontWeight: fontWeight.medium, color: colors.gray600 },
  payerChipTextActive: { color: colors.primary, fontWeight: fontWeight.semibold },

  toggleRow: { flexDirection: "row", gap: spacing.sm },
  toggleBtn: { flex: 1, paddingVertical: spacing.sm, borderRadius: borderRadius.sm, borderWidth: 1, borderColor: colors.border, alignItems: "center", backgroundColor: colors.surface },
  toggleBtnActive: { backgroundColor: colors.primaryLight, borderColor: colors.primary },
  toggleBtnText: { fontSize: fontSize.sm, fontWeight: fontWeight.medium, color: colors.gray600 },
  toggleBtnTextActive: { color: colors.primary, fontWeight: fontWeight.semibold },

  paidByHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: spacing.xs },
  multiPayerToggle: { fontSize: fontSize.sm, color: colors.primary, fontWeight: fontWeight.medium },

  customSplitSection: { gap: spacing.sm, backgroundColor: colors.gray50, borderRadius: borderRadius.md, padding: spacing.sm },
  smartSplitBtn: { flexDirection: "row", alignItems: "center", gap: 4, alignSelf: "flex-end", paddingHorizontal: spacing.md, paddingVertical: 6, borderRadius: borderRadius.full, backgroundColor: colors.primaryLight, borderWidth: 1, borderColor: colors.primary },
  smartSplitBtnText: { fontSize: fontSize.xs, fontWeight: fontWeight.semibold, color: colors.primary },
  customSplitRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  customSplitName: { flex: 1, fontSize: fontSize.sm, color: colors.gray700, fontWeight: fontWeight.medium },
  customSplitInput: { width: 120 },

  splitSumRow: { borderTopWidth: 1, borderTopColor: colors.border, paddingTop: spacing.sm, alignItems: "flex-end" },
  splitSumBalanced: { flexDirection: "row", alignItems: "center", gap: 4 },
  splitSumError: { borderTopColor: colors.danger },
  splitSumText: { fontSize: fontSize.sm, color: colors.success, fontWeight: fontWeight.semibold },
  splitSumTextError: { color: colors.danger },

  confirmCard: { backgroundColor: colors.surface, borderRadius: borderRadius.lg, borderWidth: 1, borderColor: colors.border, padding: spacing.lg, gap: spacing.sm, marginBottom: spacing.base },
  confirmTitle: { fontSize: fontSize.xs, fontWeight: fontWeight.bold, color: colors.gray400, textTransform: "uppercase", letterSpacing: 0.8 },
  confirmName: { fontSize: fontSize.xl, fontWeight: fontWeight.bold, color: colors.gray900, marginTop: spacing.xs },
  confirmAmount: { fontSize: 32, fontWeight: fontWeight.bold, color: colors.primary, marginBottom: spacing.sm },
  confirmRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: spacing.xs, borderTopWidth: 1, borderTopColor: colors.border },
  confirmLabel: { fontSize: fontSize.sm, color: colors.gray500, flex: 1 },
  confirmValue: { fontSize: fontSize.sm, fontWeight: fontWeight.semibold, color: colors.gray800, flex: 2, textAlign: "right" },
  confirmActions: { flexDirection: "row", gap: spacing.md },
  backBtn: { flex: 1, borderWidth: 1, borderColor: colors.border, borderRadius: borderRadius.md, paddingVertical: spacing.md, alignItems: "center", justifyContent: "center", backgroundColor: colors.surface },
  backBtnText: { fontSize: fontSize.sm, fontWeight: fontWeight.semibold, color: colors.gray700 },

  lineItemsContainer: { gap: spacing.sm },
  lineItemCard: { backgroundColor: colors.surface, borderRadius: borderRadius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.md, gap: spacing.sm },
  lineItemHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  lineItemIndex: { fontSize: fontSize.xs, fontWeight: fontWeight.bold, color: colors.gray400, textTransform: "uppercase", letterSpacing: 0.5 },
  removeText: { fontSize: fontSize.xs, color: colors.danger },
  lineItemFields: { flexDirection: "row", gap: spacing.sm, alignItems: "flex-end" },
  sublabel: { fontSize: fontSize.xs, fontWeight: fontWeight.semibold, color: colors.gray600, marginTop: spacing.xs },
  participantRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs },
  participantChip: { paddingHorizontal: spacing.sm, paddingVertical: 4, borderRadius: borderRadius.full, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.gray100 },
  participantChipActive: { backgroundColor: colors.primaryLight, borderColor: colors.primary },
  participantChipText: { fontSize: fontSize.xs, color: colors.gray600 },
  participantChipTextActive: { color: colors.primary, fontWeight: fontWeight.semibold },
  addLineItemBtn: { paddingVertical: spacing.sm, alignItems: "center", borderWidth: 1, borderColor: colors.border, borderStyle: "dashed", borderRadius: borderRadius.md },
  addLineItemText: { fontSize: fontSize.sm, color: colors.primary, fontWeight: fontWeight.medium },

  chatHistory: { minHeight: 120, gap: spacing.sm },
  chatHint: { fontSize: fontSize.sm, color: colors.gray400, fontStyle: "italic", textAlign: "center", paddingVertical: spacing.xl },
  chatBubble: { borderRadius: borderRadius.md, padding: spacing.md, maxWidth: "85%" },
  chatUser: { backgroundColor: colors.primary, alignSelf: "flex-end" },
  chatAssistant: { backgroundColor: colors.gray100, alignSelf: "flex-start" },
  chatText: { fontSize: fontSize.sm, color: colors.gray800, lineHeight: 20 },
  chatTextUser: { color: colors.white },

  draftCard: { backgroundColor: colors.surface, borderRadius: borderRadius.md, padding: spacing.md, borderWidth: 1, borderColor: colors.border, gap: spacing.sm },
  draftTitle: { fontSize: fontSize.xs, fontWeight: fontWeight.bold, color: colors.gray400, textTransform: "uppercase", letterSpacing: 0.5 },
  draftItem: { fontSize: fontSize.md, fontWeight: fontWeight.semibold, color: colors.gray900 },
  draftAmount: { fontSize: fontSize.xl, fontWeight: fontWeight.bold, color: colors.primary },

  chatInputRow: { flexDirection: "row", gap: spacing.sm, alignItems: "flex-end" },
  chatTextInput: { flex: 1 },
  sendBtn: { width: 48, height: 48, backgroundColor: colors.primary, borderRadius: borderRadius.md, alignItems: "center", justifyContent: "center" },
  sendBtnText: { color: colors.white, fontSize: fontSize.xl, fontWeight: fontWeight.bold },
  dateBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginTop: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  dateBtnText: {
    fontSize: fontSize.md,
    color: colors.gray900,
  },

});
