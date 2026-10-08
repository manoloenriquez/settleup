import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Keyboard,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Stack, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { formatAmount, type AssistantReceipt, type AssistantRoute } from "@template/shared";
import { AssistantMessage } from "@/components/assistant/AssistantMessage";
import { receiptForAssistant, useAssistant } from "@/hooks/useAssistant";
import { useAiAvailability } from "@/hooks/useAiAvailability";
import { useReceiptScan } from "@/hooks/useReceiptScan";
import { presentChoices } from "@/hooks/useAddMenu";
import { ROUTES } from "@/lib/routes";
import { colors, fontSize, fontWeight, spacing, borderRadius } from "@/theme";

const SIGNED_IN_STARTERS = [
  "Who owes me money?",
  "I paid 1,200 for dinner with ",
  "How much did we spend this month?",
  "Show my recent expenses",
];
/** Height of the floating system tab bar above the home indicator. */
const TAB_BAR_HEIGHT = 56;

const GUEST_STARTERS = ["I paid 180 for coffee", "How much did I spend this month?", "What can you do?"];

export default function AssistantScreen() {
  const router = useRouter();
  const assistant = useAssistant();
  const ai = useAiAvailability();
  const scan = useReceiptScan();
  const [draft, setDraft] = useState("");
  const [receipt, setReceipt] = useState<AssistantReceipt | null>(null);
  const scrollRef = useRef<ScrollView>(null);
  const insets = useSafeAreaInsets();
  const [keyboardHeight, setKeyboardHeight] = useState(0);

  // The screen runs to the bottom edge under the floating tab bar, so the
  // composer is lifted explicitly: above the tab bar normally, and on top of
  // the keyboard while typing (KeyboardAvoidingView does not account for the
  // native tab container).
  useEffect(() => {
    const show = Keyboard.addListener(Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow", (e) =>
      setKeyboardHeight(e.endCoordinates.height),
    );
    const hide = Keyboard.addListener(Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide", () => setKeyboardHeight(0));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);
  const composerBottom = keyboardHeight > 0 ? keyboardHeight + spacing.sm : insets.bottom + TAB_BAR_HEIGHT;

  useEffect(() => {
    if (scan.review) setReceipt(receiptForAssistant(scan.review));
  }, [scan.review]);

  useEffect(() => {
    const t = setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 50);
    return () => clearTimeout(t);
  }, [assistant.messages.length, assistant.busy]);

  function open(route: AssistantRoute): void {
    switch (route.screen) {
      case "group":
        router.push({ pathname: "/(protected)/groups/[id]", params: { id: route.groupId } });
        return;
      case "group_settings":
        router.push({ pathname: "/(protected)/groups/[id]/settings", params: { id: route.groupId } });
        return;
      case "share_group":
        router.push({ pathname: "/(protected)/groups/[id]/overview", params: { id: route.groupId } });
        return;
      case "payment_details":
        router.push("/(protected)/(tabs)/account/payment");
        return;
      case "account":
        router.push(ROUTES.account);
        return;
      case "sign_in":
        router.push(ROUTES.login);
        return;
      case "new_group":
        router.push(ROUTES.newGroup);
        return;
      case "add_friend":
        router.push(ROUTES.addFriend);
        return;
    }
  }

  function submit(text: string = draft): void {
    const value = text.trim();
    if ((!value && !receipt) || assistant.busy) return;
    // Replies are cards to read and confirm; put the keyboard away so the
    // whole preview and the tab bar are visible.
    Keyboard.dismiss();
    setDraft("");
    const attached = receipt ?? undefined;
    setReceipt(null);
    scan.clear();
    void assistant.send(value, attached);
  }

  function attachReceipt(): void {
    presentChoices("Add a receipt", [
      { label: "Take Photo", run: () => void scan.scanFromCamera() },
      { label: "Choose from Photos", run: () => void scan.scanFromGallery() },
    ]);
  }

  const starters = assistant.isGuest ? GUEST_STARTERS : SIGNED_IN_STARTERS;
  const empty = assistant.messages.length === 0;

  return (
    <>
      <Stack.Screen
        options={{
          title: "Assistant",
          headerRight: () =>
            empty ? null : (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Clear conversation"
                hitSlop={10}
                onPress={() => void assistant.clear()}
              >
                <Ionicons name="trash-outline" size={22} color={colors.primary} />
              </Pressable>
            ),
        }}
      />
      <View style={styles.flex}>
        <ScrollView
          ref={scrollRef}
          style={styles.flex}
          contentContainerStyle={styles.content}
          contentInsetAdjustmentBehavior="automatic"
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
        >
          {empty ? (
            <View style={styles.intro}>
              <Ionicons name="sparkles" size={28} color={colors.primary} />
              <Text style={styles.introTitle}>Ask Talli</Text>
              <Text style={styles.introText}>
                Add or change expenses, record payments and ask about balances in your own words. You'll always see what
                will change before anything is saved.
              </Text>
              {ai.state === "unavailable" ? (
                <Text style={styles.introNote}>
                  Apple Intelligence isn't available on this iPhone, so I understand common phrasings only. {ai.reason ?? ""}
                </Text>
              ) : (
                <Text style={styles.introNote}>Runs on this iPhone. Your messages aren't sent anywhere.</Text>
              )}
              <View style={styles.starters}>
                {starters.map((starter) => (
                  <Pressable
                    key={starter}
                    accessibilityRole="button"
                    onPress={() => (starter.endsWith(" ") ? setDraft(starter) : submit(starter))}
                    style={({ pressed }) => [styles.starter, pressed && styles.pressed]}
                  >
                    <Text style={styles.starterText}>{starter.trim()}</Text>
                  </Pressable>
                ))}
              </View>
            </View>
          ) : null}
          {assistant.messages.map((message) => (
            <AssistantMessage
              key={message.id}
              message={message}
              disabled={assistant.busy}
              onChoose={(choice) => void assistant.choose(message.id, choice)}
              onConfirm={() => void assistant.confirm(message.id)}
              onCancel={() => assistant.cancel(message.id)}
              onUndo={() => void assistant.undo(message.id)}
              onOpen={open}
            />
          ))}
          {assistant.busy ? (
            <View style={styles.thinking} accessibilityLabel="Working">
              <ActivityIndicator color={colors.primary} />
            </View>
          ) : null}
        </ScrollView>
        {scan.isScanning || receipt || scan.error ? (
          <View style={styles.attachment}>
            <Ionicons name="receipt-outline" size={18} color={colors.gray600} />
            <Text style={styles.attachmentText} numberOfLines={2}>
              {scan.isScanning
                ? "Reading the receipt on this iPhone…"
                : receipt
                  ? `Receipt${receipt.merchant ? ` · ${receipt.merchant}` : ""}${receipt.totalMinor && receipt.currency ? ` · ${formatAmount(receipt.totalMinor, receipt.currency)}` : ""}${receipt.overall === "needs_review" ? " · needs checking" : ""}`
                  : scan.error}
            </Text>
            {!scan.isScanning ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Remove receipt"
                hitSlop={10}
                onPress={() => {
                  setReceipt(null);
                  scan.clear();
                }}
              >
                <Ionicons name="close-circle" size={20} color={colors.gray400} />
              </Pressable>
            ) : null}
          </View>
        ) : null}
        <View style={[styles.composer, { paddingBottom: composerBottom }]}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Attach a receipt"
            onPress={attachReceipt}
            disabled={assistant.busy || scan.isScanning}
            style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}
          >
            <Ionicons name="camera-outline" size={24} color={colors.primary} />
          </Pressable>
          <TextInput
            style={styles.input}
            value={draft}
            onChangeText={setDraft}
            placeholder={receipt ? "Which group, who shared it?" : "Message"}
            placeholderTextColor={colors.gray400}
            multiline
            maxLength={500}
            accessibilityLabel="Message to the assistant"
            testID="assistant-input"
            returnKeyType="send"
            submitBehavior="submit"
            onSubmitEditing={() => submit()}
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Send"
            testID="assistant-send"
            onPress={() => submit()}
            disabled={assistant.busy || (!draft.trim() && !receipt)}
            style={({ pressed }) => [styles.sendButton, (assistant.busy || (!draft.trim() && !receipt)) && styles.dim, pressed && styles.pressed]}
          >
            <Ionicons name="arrow-up" size={20} color={colors.white} />
          </Pressable>
        </View>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, gap: spacing.sm, paddingBottom: spacing.xl },
  intro: { alignItems: "center", gap: spacing.sm, paddingVertical: spacing.xl },
  introTitle: { fontSize: fontSize.xl, fontWeight: fontWeight.bold, color: colors.gray900 },
  introText: { fontSize: fontSize.md, color: colors.gray700, textAlign: "center", lineHeight: 22 },
  introNote: { fontSize: fontSize.sm, color: colors.gray500, textAlign: "center" },
  starters: { alignSelf: "stretch", gap: spacing.sm, marginTop: spacing.md },
  starter: {
    minHeight: 44,
    justifyContent: "center",
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  starterText: { fontSize: fontSize.md, color: colors.gray800 },
  thinking: { alignItems: "flex-start", paddingVertical: spacing.sm },
  attachment: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginHorizontal: spacing.md,
    padding: spacing.sm,
    borderRadius: borderRadius.md,
    backgroundColor: colors.gray100,
  },
  attachmentText: { flex: 1, fontSize: fontSize.sm, color: colors.gray700 },
  composer: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    paddingBottom: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    backgroundColor: colors.surface,
  },
  iconButton: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  input: {
    flex: 1,
    minHeight: 44,
    maxHeight: 120,
    paddingHorizontal: spacing.md,
    paddingTop: 11,
    paddingBottom: 11,
    borderRadius: 22,
    backgroundColor: colors.gray100,
    color: colors.gray900,
    fontSize: fontSize.md,
  },
  sendButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.primary,
  },
  pressed: { opacity: 0.7 },
  dim: { opacity: 0.4 },
});
