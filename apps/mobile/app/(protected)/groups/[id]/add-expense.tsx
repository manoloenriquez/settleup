import { useEffect, useMemo, useRef, useState } from "react";
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
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import { useAddExpense, useAddExpenseCustomSplit, useAddItemizedExpense } from "@/hooks/useExpenses";
import { useMembers } from "@/hooks/useMembers";
import { useAuth } from "@/context/AuthContext";
import { useConversationAI } from "@/hooks/useConversationAI";
import { useSmartSplit } from "@/hooks/useSmartSplit";
import { useReceiptScan } from "@/hooks/useReceiptScan";
import { AmountInput, ChipGroup, SegmentedControl, AppButton } from "@/components/ui";
import { AppTextInput } from "@/components/ui/TextInput";
import { ReceiptScanner } from "@/components/groups/ReceiptScanner";
import { ReceiptReviewCard } from "@/components/groups/ReceiptReviewCard";
import { SmartSplitSheet } from "@/components/groups/SmartSplitSheet";
import { formatCents, parsePHPAmount } from "@template/shared";
import { colors, fontSize, fontWeight, spacing, borderRadius } from "@/theme";

type Mode = "quick" | "chat" | "receipt" | "detailed" | "itemized";
type SplitMode = "equal" | "custom";
type LineItem = { name: string; amountStr: string; participantIds: string[] };

export default function AddExpenseScreen() {
  const { id: groupId } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { session } = useAuth();

  const membersQ = useMembers(groupId);
  const members = useMemo(() => membersQ.data ?? [], [membersQ.data]);
  const addExpense = useAddExpense(groupId);
  const addCustomSplit = useAddExpenseCustomSplit(groupId);
  const addItemized = useAddItemizedExpense(groupId);
  const conversationAI = useConversationAI({ groupId, members });
  const smartSplit = useSmartSplit({ groupId });
  const receiptScan = useReceiptScan();
  const [showSmartSplit, setShowSmartSplit] = useState(false);

  const [mode, setMode] = useState<Mode>("quick");

  // Shared form state
  const [itemName, setItemName] = useState("");
  const [amount, setAmount] = useState("");
  const [selectedMembers, setSelectedMembers] = useState<Set<string>>(() => new Set(members.map((m) => m.id)));
  const [payerMemberId, setPayerMemberId] = useState<string>("");

  // Detailed mode split state
  const [splitMode, setSplitMode] = useState<SplitMode>("equal");
  const [customShares, setCustomShares] = useState<Record<string, string>>({});

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
      Alert.alert("Payer mismatch", `Payer total ₱${(sum / 100).toFixed(2)} must equal expense amount ₱${(amountCents / 100).toFixed(2)}`);
      return false;
    }
    return true;
  }

  function validateCustomSplitSum(amountCents: number): boolean {
    const sum = [...selectedMembers].reduce((s, id) => s + (parsePHPAmount(customShares[id] ?? "0") ?? 0), 0);
    if (sum !== amountCents) {
      Alert.alert("Split mismatch", `Custom split total ₱${(sum / 100).toFixed(2)} must equal expense amount ₱${(amountCents / 100).toFixed(2)}`);
      return false;
    }
    return true;
  }

  function handleQuickReview() {
    const amountCents = parsePHPAmount(amount) ?? 0;
    if (!itemName.trim() || amountCents <= 0 || selectedMembers.size === 0 || !effectivePayerId) {
      Alert.alert("Missing info", "Please fill in item name, amount, and select at least one member.");
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
      memberIds: [...selectedMembers],
      payerMemberId: effectivePayerId,
      createdByUserId: session?.user.id ?? "",
    });
    if (result.error) { Alert.alert("Error", result.error); return; }
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    router.back();
  }

  function handleDetailedReview() {
    const amountCents = parsePHPAmount(amount) ?? 0;
    if (!itemName.trim() || amountCents <= 0 || selectedMembers.size === 0) {
      Alert.alert("Missing info", "Please fill in all required fields.");
      return;
    }
    if (!validatePayerSum(amountCents)) return;
    if (splitMode === "custom" && !validateCustomSplitSum(amountCents)) return;
    if (getPayersArray().length === 0) {
      Alert.alert("No payer", "Please select who paid.");
      return;
    }
    setConfirming(true);
  }

  async function handleDetailedSave() {
    const amountCents = parsePHPAmount(amount) ?? 0;
    const payers = getPayersArray();
    if (splitMode === "custom") {
      const customSplits = [...selectedMembers].map((id) => ({
        memberId: id,
        shareCents: parsePHPAmount(customShares[id] ?? "0") ?? 0,
      }));
      const result = await addCustomSplit.mutateAsync({ groupId, itemName: itemName.trim(), amountCents, customSplits, payers });
      if (result.error) { Alert.alert("Error", result.error); return; }
    } else {
      const result = await addExpense.mutateAsync({ groupId, itemName: itemName.trim(), amountCents, memberIds: [...selectedMembers], payerMemberId: effectivePayerId, createdByUserId: session?.user.id ?? "" });
      if (result.error) { Alert.alert("Error", result.error); return; }
    }
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
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
    }
  }

  async function handleChatSave() {
    const amountCents = parsePHPAmount(draftAmount) ?? 0;
    if (!draftItem || amountCents <= 0) {
      Alert.alert("Missing info", "Could not extract expense details. Please fill in manually.");
      return;
    }
    const memberIds = draftMembers.size > 0 ? [...draftMembers] : members.map((m) => m.id);
    const result = await addExpense.mutateAsync({
      groupId,
      itemName: draftItem,
      amountCents,
      memberIds,
      payerMemberId: effectivePayerId,
      createdByUserId: session?.user.id ?? "",
    });
    if (result.error) { Alert.alert("Error", result.error); return; }
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
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
      Alert.alert("Missing info", "Please fill in expense name and total amount.");
      return;
    }
    const filled = lineItems.filter((li) => li.name.trim() && (parsePHPAmount(li.amountStr) ?? 0) > 0);
    if (filled.length === 0) {
      Alert.alert("No items", "Add at least one line item with a name and amount.");
      return;
    }
    const liTotal = filled.reduce((s, li) => s + (parsePHPAmount(li.amountStr) ?? 0), 0);
    if (liTotal !== amountCents) {
      Alert.alert("Amount mismatch", `Line items total ₱${(liTotal / 100).toFixed(2)} must equal expense amount ₱${(amountCents / 100).toFixed(2)}`);
      return;
    }
    if (!validatePayerSum(amountCents)) return;
    if (getPayersArray().length === 0) {
      Alert.alert("No payer", "Please select who paid.");
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
      payers,
      lineItems: filledItems.map((li) => ({
        name: li.name.trim(),
        amountCents: parsePHPAmount(li.amountStr) ?? 0,
        participantIds: li.participantIds.length > 0 ? li.participantIds : members.map((m) => m.id),
      })),
    });
    if (result.error) { Alert.alert("Error", result.error); return; }
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
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
                <Text style={styles.confirmValue}>{splitMode === "custom" ? "Custom" : `Equal · ${selectedMembers.size} member${selectedMembers.size !== 1 ? "s" : ""}`}</Text>
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
          {mode === "quick" && (
            <View style={styles.form}>
              <AppTextInput label="Item Name" value={itemName} onChangeText={setItemName} placeholder="e.g. Lunch, Grab, Hotel" />
              <AmountInput label="Amount" value={amount} onChangeText={setAmount} />
              <ChipGroup label="Split with" chips={memberChips} selected={selectedMembers} onToggle={toggleMember} />
              <View>
                <Text style={styles.label}>Paid by</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.payerRow}>
                  {members.map((m) => (
                    <TouchableOpacity key={m.id} style={[styles.payerChip, effectivePayerId === m.id && styles.payerChipActive]} onPress={() => setPayerMemberId(m.id)} activeOpacity={0.7}>
                      <Text style={[styles.payerChipText, effectivePayerId === m.id && styles.payerChipTextActive]}>{m.display_name}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
              <AppButton title="Review" onPress={handleQuickReview} disabled={!itemName.trim() || !amount} />
            </View>
          )}

          {/* ---- CHAT MODE ---- */}
          {mode === "chat" && (
            <View style={styles.form}>
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
                  <AppButton title="Confirm & Save" onPress={handleChatSave} isLoading={addExpense.isPending} />
                </View>
              ) : null}
              <View style={styles.chatInputRow}>
                <View style={styles.chatTextInput}>
                  <AppTextInput value={chatInput} onChangeText={setChatInput} placeholder="Describe the expense…" onSubmitEditing={() => void handleChatSend()} returnKeyType="send" />
                </View>
                <TouchableOpacity style={styles.sendBtn} onPress={() => void handleChatSend()} disabled={conversationAI.isProcessing}>
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
                      <TouchableOpacity key={m.id} style={[styles.payerChip, effectivePayerId === m.id && styles.payerChipActive]} onPress={() => setPayerMemberId(m.id)} activeOpacity={0.7}>
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
                          <AmountInput value={payerAmounts[m.id] ?? ""} onChangeText={(v) => setPayerAmounts((prev) => ({ ...prev, [m.id]: v }))} />
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

              {/* Participant chips */}
              <ChipGroup label="Split with" chips={memberChips} selected={selectedMembers} onToggle={toggleMember} />

              {/* Split mode toggle */}
              <View>
                <Text style={styles.label}>How to split</Text>
                <View style={styles.toggleRow}>
                  {(["equal", "custom"] as SplitMode[]).map((s) => (
                    <TouchableOpacity key={s} style={[styles.toggleBtn, splitMode === s && styles.toggleBtnActive]} onPress={() => setSplitMode(s)} activeOpacity={0.7}>
                      <Text style={[styles.toggleBtnText, splitMode === s && styles.toggleBtnTextActive]}>
                        {s === "equal" ? "Equal" : "Custom"}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              {/* Custom split inputs */}
              {splitMode === "custom" && selectedMembers.size > 0 && (
                <View style={styles.customSplitSection}>
                  <TouchableOpacity
                    style={styles.smartSplitBtn}
                    onPress={() => setShowSmartSplit(true)}
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
                          <AmountInput value={customShares[id] ?? ""} onChangeText={(v) => setCustomShares((prev) => ({ ...prev, [id]: v }))} />
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
                      <TouchableOpacity key={m.id} style={[styles.payerChip, effectivePayerId === m.id && styles.payerChipActive]} onPress={() => setPayerMemberId(m.id)} activeOpacity={0.7}>
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
                          <AmountInput value={payerAmounts[m.id] ?? ""} onChangeText={(v) => setPayerAmounts((prev) => ({ ...prev, [m.id]: v }))} />
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
});
