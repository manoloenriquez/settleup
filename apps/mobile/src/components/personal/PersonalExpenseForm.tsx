import { useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useNavigation, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import {
  amountToInput,
  currencyPrecision,
  formatAmount,
  inferCategorySlug,
  isUnusuallyLarge,
  parseAmountInput,
  validatePersonalExpenseInput,
  type CategorySlug,
  type CurrencyCode,
  type PersonalExpense,
  type PersonalExpenseInput,
  type PersonalExpenseSource,
} from "@template/shared";
import { AmountInput, AppButton, AppTextInput, DateField, useToast } from "@/components/ui";
import { CurrencyPicker } from "@/components/CurrencyPicker";
import { CategoryChips } from "@/components/personal/CategoryChips";
import { ReceiptScanner } from "@/components/groups/ReceiptScanner";
import { usePersonalLedger } from "@/context/PersonalLedgerContext";
import { usePreferences } from "@/context/PreferencesContext";
import { useReceiptScan } from "@/hooks/useReceiptScan";
import { useAiAvailability } from "@/hooks/useAiAvailability";
import { parseConversationMobile } from "@/lib/ai/conversation";
import { chatToPersonalDraft, receiptToPersonalDraft, type PersonalDraft } from "@/lib/personal/drafts";
import { localTodayISO } from "@/lib/dates";
import { colors, fontSize, fontWeight, spacing, borderRadius } from "@/theme";
import { useStackedLayout } from "@/hooks/useStackedLayout";

type Assist = "none" | "scan" | "describe";

type Props = {
  /** Present when editing. */
  expense?: PersonalExpense;
  /** Open straight into receipt scanning or the describe box. */
  initialAssist?: Assist;
};

export function PersonalExpenseForm({ expense, initialAssist = "none" }: Props) {
  const stacked = useStackedLayout();
  const router = useRouter();
  const navigation = useNavigation();
  const toast = useToast();
  const ledger = usePersonalLedger();
  const { preferences } = usePreferences();
  const ai = useAiAvailability();
  const receiptScan = useReceiptScan();
  const editing = expense !== undefined;

  const [currency, setCurrency] = useState<CurrencyCode>(expense?.currency ?? preferences.defaultCurrency);
  const [amountText, setAmountText] = useState(expense ? amountToInput(expense.amountMinor, expense.currency) : "");
  const [description, setDescription] = useState(expense?.description ?? "");
  const [category, setCategory] = useState<CategorySlug>(expense?.category ?? "other");
  const [categoryChosen, setCategoryChosen] = useState(editing);
  const [date, setDate] = useState(expense?.date ?? localTodayISO());
  const [notes, setNotes] = useState(expense?.notes ?? "");
  const [merchant, setMerchant] = useState<string | null>(expense?.merchant ?? null);
  const [source, setSource] = useState<PersonalExpenseSource>(expense?.source ?? "manual");
  const [assist, setAssist] = useState<Assist>(editing ? "none" : initialAssist);
  const [checkHint, setCheckHint] = useState<string | null>(null);
  const [describeText, setDescribeText] = useState("");
  const [describing, setDescribing] = useState(false);
  const [describeError, setDescribeError] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [amountError, setAmountError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);

  // Suggest a category from the description until the person picks one.
  useEffect(() => {
    if (categoryChosen) return;
    setCategory(inferCategorySlug(description) ?? "other");
  }, [description, categoryChosen]);

  function applyDraft(draft: PersonalDraft, from: PersonalExpenseSource) {
    setCurrency(draft.currency);
    if (draft.amountMinor) setAmountText(amountToInput(draft.amountMinor, draft.currency));
    if (draft.description) setDescription(draft.description);
    if (draft.date) setDate(draft.date);
    setMerchant(draft.merchant);
    setCategory(draft.category);
    setCategoryChosen(draft.category !== "other");
    setSource(from);
    setCheckHint(draft.checkHint);
    setAmountError(null);
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  }

  // A finished scan fills the form once.
  const appliedScan = useRef<unknown>(null);
  useEffect(() => {
    const receipt = receiptScan.receipt;
    if (!receipt || appliedScan.current === receipt) return;
    appliedScan.current = receipt;
    applyDraft(receiptToPersonalDraft(receipt, receiptScan.review, currency), "receipt");
    setAssist("none");
    // eslint-disable-next-line react-hooks/exhaustive-deps -- apply each scan result exactly once
  }, [receiptScan.receipt]);

  async function handleDescribe() {
    const text = describeText.trim();
    if (!text || describing) return;
    setDescribing(true);
    setDescribeError(null);
    try {
      const result = await parseConversationMobile({
        messages: [{ role: "user", content: text }],
        memberNames: [],
        members: [],
        userName: null,
        today: localTodayISO(),
      });
      if (result.error !== null) {
        setDescribeError(result.error);
        return;
      }
      if (!result.data.draft) {
        setDescribeError(result.data.reply);
        return;
      }
      applyDraft(chatToPersonalDraft(result.data.draft, currency), "chat");
      setAssist("none");
      setDescribeText("");
    } finally {
      setDescribing(false);
    }
  }

  function buildInput(): PersonalExpenseInput | null {
    const amountMinor = parseAmountInput(amountText, currency);
    if (amountMinor === null) {
      setAmountError(
        amountText.trim()
          ? `Enter an amount like ${amountToInput(currency === "JPY" || currency === "KRW" ? 1500 : 12550, currency)}.`
          : "Enter the amount.",
      );
      return null;
    }
    const input: PersonalExpenseInput = {
      description: description.trim() || merchant || "",
      amountMinor,
      currency,
      category,
      date,
      notes: notes.trim() || null,
      merchant,
      source,
    };
    const valid = validatePersonalExpenseInput(input);
    if (!valid.ok) {
      toast.error(valid.error);
      return null;
    }
    return input;
  }

  async function persist(input: PersonalExpenseInput) {
    if (savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    try {
      if (expense) await ledger.update(expense.id, input);
      else await ledger.add(input);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      toast.success(editing ? "Expense updated" : `Saved ${formatAmount(input.amountMinor, input.currency)}`);
      router.back();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "The expense couldn’t be saved. Try again.");
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  function handleSave() {
    const input = buildInput();
    if (!input) return;
    if (isUnusuallyLarge(input.amountMinor, input.currency)) {
      Alert.alert(
        `Save ${formatAmount(input.amountMinor, input.currency)}?`,
        "That’s a large amount. Check the decimal point before saving.",
        [
          { text: "Edit Amount", style: "cancel" },
          { text: "Save", onPress: () => void persist(input) },
        ],
      );
      return;
    }
    void persist(input);
  }

  function handleDelete() {
    if (!expense) return;
    const id = expense.id;
    void ledger
      .remove(id)
      .then(() => {
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
        router.back();
        toast.withAction("Expense deleted", {
          label: "Undo",
          onPress: () => {
            void ledger.restore(id).catch(() => toast.error("The expense couldn’t be restored."));
          },
        });
      })
      .catch((e: unknown) => toast.error(e instanceof Error ? e.message : "The expense couldn’t be deleted."));
  }

  const dirty = expense
    ? amountText !== amountToInput(expense.amountMinor, expense.currency) ||
      currency !== expense.currency ||
      description !== expense.description ||
      category !== expense.category ||
      date !== expense.date ||
      notes !== (expense.notes ?? "")
    : amountText.trim() !== "" || description.trim() !== "" || notes.trim() !== "";

  function handleCancel() {
    if (!dirty) {
      router.back();
      return;
    }
    Alert.alert(editing ? "Discard your changes?" : "Discard this expense?", undefined, [
      { text: "Keep Editing", style: "cancel" },
      { text: "Discard", style: "destructive", onPress: () => router.back() },
    ]);
  }

  const canSave = amountText.trim().length > 0 && (description.trim().length > 0 || !!merchant) && !saving;

  useLayoutEffect(() => {
    navigation.setOptions({
      title: editing ? "Edit Expense" : "New Expense",
      // Like Mail and Calendar: a sheet with unsaved input can't be swiped
      // away by accident; Cancel asks first.
      gestureEnabled: !dirty,
      headerLeft: () => (
        <TouchableOpacity onPress={handleCancel} accessibilityRole="button" hitSlop={12}>
          <Text style={styles.headerCancel}>Cancel</Text>
        </TouchableOpacity>
      ),
      headerRight: () => (
        <TouchableOpacity
          onPress={handleSave}
          disabled={!canSave}
          accessibilityRole="button"
          accessibilityState={{ disabled: !canSave }}
          hitSlop={12}
        >
          {saving ? (
            <ActivityIndicator color={colors.primary} />
          ) : (
            <Text style={[styles.headerSave, !canSave && styles.headerSaveDisabled]}>Save</Text>
          )}
        </TouchableOpacity>
      ),
    });
  });

  const aiReady = ai.state === "ready";

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView
        style={styles.flex}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        automaticallyAdjustKeyboardInsets
      >
        {!editing && (
          <View style={[styles.assistRow, stacked && styles.stacked]}>
            <AssistButton
              icon="scan-outline"
              label="Scan Receipt"
              active={assist === "scan"}
              onPress={() => setAssist(assist === "scan" ? "none" : "scan")}
            />
            <AssistButton
              icon="chatbubble-ellipses-outline"
              label="Describe It"
              active={assist === "describe"}
              onPress={() => setAssist(assist === "describe" ? "none" : "describe")}
            />
          </View>
        )}

        {assist === "scan" &&
          (aiReady ? (
            <ReceiptScanner
              imageUri={receiptScan.imageUri}
              isScanning={receiptScan.isScanning}
              error={receiptScan.error}
              permissionBlocked={receiptScan.permissionBlocked}
              onCamera={() => void receiptScan.scanFromCamera()}
              onGallery={() => void receiptScan.scanFromGallery()}
              onClear={receiptScan.clear}
              onRetake={() => void receiptScan.retake()}
            />
          ) : (
            <Text style={styles.assistNote}>
              {ai.state === "checking"
                ? "Checking Apple Intelligence…"
                : `${ai.reason ?? "Receipt scanning needs Apple Intelligence."} You can type the amount below.`}
            </Text>
          ))}

        {assist === "describe" && (
          <View style={styles.describe}>
            <TextInput
              value={describeText}
              onChangeText={setDescribeText}
              placeholder="e.g. Grab to BGC 320 yesterday"
              placeholderTextColor={colors.gray400}
              style={styles.describeInput}
              autoFocus
              returnKeyType="done"
              onSubmitEditing={() => void handleDescribe()}
              accessibilityLabel="Describe the expense"
            />
            <AppButton
              title="Fill In"
              variant="secondary"
              onPress={() => void handleDescribe()}
              isLoading={describing}
              disabled={!describeText.trim()}
            />
            <Text style={styles.assistNote}>
              {aiReady
                ? "Read on this iPhone with Apple Intelligence."
                : "Works best as “what amount”, e.g. “Lunch 250”."}
            </Text>
            {describeError && (
              <Text style={styles.errorText} accessibilityRole="alert">
                {describeError}
              </Text>
            )}
          </View>
        )}

        {checkHint && (
          <View style={styles.checkHint} accessibilityRole="alert">
            <Ionicons name="alert-circle-outline" size={18} color={colors.warningDark} />
            <Text style={styles.checkHintText}>{checkHint}</Text>
          </View>
        )}

        <AmountInput
          label="Amount"
          value={amountText}
          onChangeText={(text) => {
            setAmountText(text);
            setAmountError(null);
            setCheckHint(null);
          }}
          currency={currency}
          onCurrencyPress={() => setPickerOpen(true)}
          error={amountError ?? undefined}
          autoFocus={!editing && initialAssist === "none"}
        />

        <AppTextInput
          label="Description"
          value={description}
          onChangeText={setDescription}
          placeholder="What was it for?"
          maxLength={120}
          returnKeyType="done"
        />

        <CategoryChips
          value={category}
          onChange={(slug) => {
            setCategory(slug);
            setCategoryChosen(true);
          }}
          suggested={!categoryChosen && category !== "other"}
        />

        <DateField value={date} onChange={setDate} maximumDate={new Date()} />

        <AppTextInput
          label="Notes (optional)"
          value={notes}
          onChangeText={setNotes}
          placeholder="Anything to remember"
          multiline
          maxLength={500}
        />

        <AppButton title={editing ? "Save Changes" : "Save Expense"} onPress={handleSave} disabled={!canSave} isLoading={saving} />

        {editing && (
          <AppButton title="Delete Expense" variant="destructive" onPress={handleDelete} style={styles.deleteBtn} />
        )}
      </ScrollView>

      <CurrencyPicker
        visible={pickerOpen}
        selected={currency}
        suggested={[preferences.defaultCurrency]}
        onSelect={(code) => {
          setCurrency(code);
          // Keep the typed amount, but say so at once if it no longer fits
          // the new currency (e.g. 12.50 after switching to JPY).
          setAmountError(
            amountText.trim() && parseAmountInput(amountText, code) === null
              ? currencyPrecision(code) === 0
                ? `${code} amounts have no decimals.`
                : `Check the amount for ${code}.`
              : null,
          );
        }}
        onClose={() => setPickerOpen(false)}
      />
    </KeyboardAvoidingView>
  );
}

function AssistButton({
  icon,
  label,
  active,
  onPress,
}: {
  icon: React.ComponentProps<typeof Ionicons>["name"];
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      style={[styles.assistBtn, active && styles.assistBtnActive]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ expanded: active }}
    >
      <Ionicons name={icon} size={18} color={active ? colors.white : colors.primary} />
      <Text style={[styles.assistText, active && styles.assistTextActive]}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.base, gap: spacing.base, paddingBottom: spacing["3xl"] },
  headerCancel: { fontSize: fontSize.md, color: colors.primary },
  headerSave: { fontSize: fontSize.md, fontWeight: fontWeight.bold, color: colors.primary },
  headerSaveDisabled: { color: colors.gray300 },
  assistRow: { flexDirection: "row", gap: spacing.sm },
  stacked: { flexDirection: "column" },
  assistBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    minHeight: 44,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.primary,
    backgroundColor: colors.surface,
  },
  assistBtnActive: { backgroundColor: colors.primary },
  assistText: { fontSize: fontSize.base, fontWeight: fontWeight.semibold, color: colors.primary },
  assistTextActive: { color: colors.white },
  assistNote: { fontSize: fontSize.sm, color: colors.gray500, lineHeight: 18 },
  describe: { gap: spacing.sm },
  describeInput: {
    minHeight: 48,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md,
    fontSize: fontSize.md,
    color: colors.gray900,
    backgroundColor: colors.surface,
  },
  errorText: { fontSize: fontSize.sm, color: colors.danger },
  checkHint: {
    flexDirection: "row",
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: borderRadius.md,
    backgroundColor: colors.warningLight,
  },
  checkHintText: { flex: 1, fontSize: fontSize.sm, lineHeight: 19, color: colors.warningDark },
  deleteBtn: { marginTop: spacing.sm },
});
