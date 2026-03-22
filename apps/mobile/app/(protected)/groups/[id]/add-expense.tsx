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
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import { useAddExpense } from "@/hooks/useExpenses";
import { useMembers } from "@/hooks/useMembers";
import { useAuth } from "@/context/AuthContext";
import { AmountInput, ChipGroup, SegmentedControl, AppButton } from "@/components/ui";
import { AppTextInput } from "@/components/ui/TextInput";
import { formatCents, parsePHPAmount, parseExpenseText, fuzzyMatchMember } from "@template/shared";
import { colors, fontSize, fontWeight, spacing, borderRadius } from "@/theme";

type Mode = "quick" | "chat" | "detailed";

export default function AddExpenseScreen() {
  const { id: groupId } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { session } = useAuth();

  const membersQ = useMembers(groupId);
  const members = membersQ.data ?? [];
  const addExpense = useAddExpense(groupId);

  const [mode, setMode] = useState<Mode>("quick");

  // Quick mode state
  const [itemName, setItemName] = useState("");
  const [amount, setAmount] = useState("");
  const [selectedMembers, setSelectedMembers] = useState<Set<string>>(() => new Set(members.map((m) => m.id)));
  const [payerMemberId, setPayerMemberId] = useState<string>("");

  // Chat mode state
  const [chatInput, setChatInput] = useState("");
  const [chatMessages, setChatMessages] = useState<{ role: "user" | "assistant"; content: string }[]>([]);
  const [draftItem, setDraftItem] = useState("");
  const [draftAmount, setDraftAmount] = useState("");
  const [draftMembers, setDraftMembers] = useState<Set<string>>(new Set());

  // Initialize payer to first member that matches user
  const myMember = members.find((m) => m.user_id === session?.user.id) ?? members[0];
  const effectivePayerId = payerMemberId || myMember?.id || "";

  function toggleMember(id: string) {
    setSelectedMembers((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleQuickSave() {
    const amountCents = parsePHPAmount(amount) ?? 0;
    if (!itemName.trim() || amountCents <= 0 || selectedMembers.size === 0 || !effectivePayerId) {
      Alert.alert("Missing info", "Please fill in item name, amount, and select at least one member.");
      return;
    }

    const result = await addExpense.mutateAsync({
      groupId,
      itemName: itemName.trim(),
      amountCents,
      memberIds: [...selectedMembers],
      payerMemberId: effectivePayerId,
      createdByUserId: session?.user.id ?? "",
    });

    if (result.error) {
      Alert.alert("Error", result.error);
      return;
    }

    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    router.back();
  }

  function handleChatSend() {
    if (!chatInput.trim()) return;

    const userMsg = chatInput.trim();
    setChatMessages((prev) => [...prev, { role: "user", content: userMsg }]);
    setChatInput("");

    // Parse with heuristics
    const draft = parseExpenseText(userMsg);
    // fuzzyMatchMember returns member IDs
    const matchedMemberIds = draft.participantNames
      .map((n) => fuzzyMatchMember(n, members))
      .filter(Boolean) as string[];
    const matchedNames = matchedMemberIds
      .map((id) => members.find((m) => m.id === id)?.display_name)
      .filter(Boolean) as string[];

    if (draft.itemName || (draft.amountCents ?? 0) > 0) {
      setDraftItem(draft.itemName);
      setDraftAmount((draft.amountCents ?? 0) > 0 ? String((draft.amountCents ?? 0) / 100) : "");
      setDraftMembers(new Set(matchedMemberIds.length > 0 ? matchedMemberIds : members.map((m) => m.id)));

      const reply = `Got it! "${draft.itemName}" for ${formatCents(draft.amountCents ?? 0)}${matchedNames.length > 0 ? ` split with ${matchedNames.join(", ")}` : " split equally"}. Confirm to save.`;
      setChatMessages((prev) => [...prev, { role: "assistant", content: reply }]);
    } else {
      setChatMessages((prev) => [...prev, { role: "assistant", content: "I couldn't parse that. Try: \"Lunch 500 split Manolo, Ana\"" }]);
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
      createdByUserId: session!.user.id,
    });

    if (result.error) { Alert.alert("Error", result.error); return; }
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    router.back();
  }

  const memberChips = members.map((m) => ({ id: m.id, label: m.display_name }));

  return (
    <>
      <Stack.Screen options={{ title: "Add Expense", headerShown: true }} />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : "height"}>
        <ScrollView style={styles.scroll} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <SegmentedControl
            segments={[
              { value: "quick" as Mode, label: "Quick" },
              { value: "chat" as Mode, label: "Chat" },
              { value: "detailed" as Mode, label: "Detailed" },
            ]}
            value={mode}
            onChange={setMode}
          />

          {mode === "quick" && (
            <View style={styles.form}>
              <AppTextInput
                label="Item Name"
                value={itemName}
                onChangeText={setItemName}
                placeholder="e.g. Lunch, Grab, Hotel"
              />
              <AmountInput label="Amount" value={amount} onChangeText={setAmount} />
              <ChipGroup
                label="Split with"
                chips={memberChips}
                selected={selectedMembers}
                onToggle={toggleMember}
              />
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
              <AppButton
                title={addExpense.isPending ? "Saving…" : "Save Expense"}
                onPress={handleQuickSave}
                isLoading={addExpense.isPending}
                disabled={!itemName.trim() || !amount || addExpense.isPending}
              />
            </View>
          )}

          {mode === "chat" && (
            <View style={styles.form}>
              <View style={styles.chatHistory}>
                {chatMessages.length === 0 && (
                  <Text style={styles.chatHint}>Try: "Lunch 500 split with Manolo and Ana"</Text>
                )}
                {chatMessages.map((msg, i) => (
                  <View key={i} style={[styles.chatBubble, msg.role === "user" ? styles.chatUser : styles.chatAssistant]}>
                    <Text style={[styles.chatText, msg.role === "user" && styles.chatTextUser]}>{msg.content}</Text>
                  </View>
                ))}
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
                  <AppTextInput
                    value={chatInput}
                    onChangeText={setChatInput}
                    placeholder="Describe the expense…"
                    onSubmitEditing={handleChatSend}
                    returnKeyType="send"
                  />
                </View>
                <TouchableOpacity style={styles.sendBtn} onPress={handleChatSend}>
                  <Text style={styles.sendBtnText}>{"\u2192"}</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          {mode === "detailed" && (
            <View style={styles.form}>
              <AppTextInput label="Item Name" value={itemName} onChangeText={setItemName} placeholder="e.g. Dinner" />
              <AmountInput label="Amount" value={amount} onChangeText={setAmount} />
              <ChipGroup label="Split with" chips={memberChips} selected={selectedMembers} onToggle={toggleMember} />
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
              <AppButton
                title={addExpense.isPending ? "Saving…" : "Save Expense"}
                onPress={handleQuickSave}
                isLoading={addExpense.isPending}
                disabled={!itemName.trim() || !amount || addExpense.isPending}
              />
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
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
