import { useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { currencyName, type CurrencyCode } from "@template/shared";
import { CurrencyPicker } from "@/components/CurrencyPicker";
import { usePreferences } from "@/context/PreferencesContext";
import { useProfile } from "@/hooks/useProfile";
import { useAuth } from "@/context/AuthContext";
import { Stack, useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import * as Crypto from "expo-crypto";
import { onlineManager } from "@tanstack/react-query";
import { useCreateGroup } from "@/hooks/useGroups";
import { useOutbox } from "@/context/OutboxContext";
import { AppButton } from "@/components/ui/Button";
import { AppTextInput } from "@/components/ui/TextInput";
import { useToast } from "@/components/ui";
import { colors, fontSize, fontWeight, spacing } from "@/theme";

export default function NewGroupScreen() {
  const toast = useToast();
  const router = useRouter();
  const [name, setName] = useState("");
  const createGroup = useCreateGroup();
  const outbox = useOutbox();
  const { preferences } = usePreferences();
  const { session } = useAuth();
  const { data: profile } = useProfile();
  const [currency, setCurrency] = useState<CurrencyCode>(preferences.defaultCurrency);
  const [pickerOpen, setPickerOpen] = useState(false);
  const suggestedName = profile?.full_name?.trim() || session?.user.email?.split("@")[0] || "";
  const [myName, setMyName] = useState<string | null>(null);
  const displayName = (myName ?? suggestedName).trim();

  async function handleCreate() {
    if (!name.trim() || !displayName) return;

    if (!onlineManager.isOnline()) {
      // Queue for replay (client id doubles as the group id). Never navigate
      // into the pending group — it doesn't exist server-side yet.
      const clientId = Crypto.randomUUID();
      await outbox.enqueue({
        id: clientId,
        kind: "group.create",
        entityId: clientId,
        groupId: clientId,
        payload: { name: name.trim(), currency_code: currency, display_name: displayName },
        createdAt: new Date().toISOString(),
        summary: { title: name.trim(), amountCents: 0 },
      });
      router.back();
      return;
    }

    const result = await createGroup.mutateAsync({
      id: Crypto.randomUUID(),
      name: name.trim(),
      currency,
      displayName,
    });
    if (result.error) {
      toast.error(result.error);
      return;
    }

    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    if (!result.data) {
      toast.error("Group data was not returned.");
      return;
    }

    router.replace(`/(protected)/groups/${result.data.id}`);
  }

  return (
    <>
      <Stack.Screen options={{ title: "New Group", headerShown: true }} />
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
          <Text style={styles.heading}>Create a Group</Text>
          <Text style={styles.sub}>
            For a trip, a household or a night out. You can add people next — they don’t need the app.
          </Text>

          <View style={styles.form}>
            <AppTextInput
              label="Group Name"
              value={name}
              onChangeText={setName}
              placeholder="e.g. Siargao Trip"
              autoFocus
              returnKeyType="next"
            />

            <AppTextInput
              label="Your name in this group"
              value={myName ?? suggestedName}
              onChangeText={setMyName}
              placeholder="How others will see you"
              autoCapitalize="words"
              returnKeyType="done"
            />

            <View style={styles.currencyRow}>
              <Text style={styles.label}>Main currency</Text>
              <TouchableOpacity
                style={styles.currencyBtn}
                onPress={() => setPickerOpen(true)}
                accessibilityRole="button"
                accessibilityLabel={`Main currency ${currencyName(currency)}. Change`}
              >
                <Text style={styles.currencyText}>
                  {currencyName(currency)} ({currency})
                </Text>
                <Ionicons name="chevron-forward" size={16} color={colors.gray400} />
              </TouchableOpacity>
              <Text style={styles.hint}>
                Expenses start in this currency. Any expense can use another one — balances are kept per
                currency and never converted.
              </Text>
            </View>

            <AppButton
              title={createGroup.isPending ? "Creating…" : "Create Group"}
              onPress={handleCreate}
              isLoading={createGroup.isPending}
              disabled={!name.trim() || !displayName || createGroup.isPending}
            />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
      <CurrencyPicker
        visible={pickerOpen}
        selected={currency}
        suggested={[preferences.defaultCurrency]}
        onSelect={setCurrency}
        onClose={() => setPickerOpen(false)}
      />
    </>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.base, paddingTop: spacing.xl },
  heading: { fontSize: fontSize["2xl"], fontWeight: fontWeight.bold, color: colors.gray900 },
  sub: { fontSize: fontSize.base, color: colors.gray500, marginTop: spacing.xs, marginBottom: spacing.xl, lineHeight: 22 },
  form: { gap: spacing.md },
  currencyRow: { gap: spacing.xs },
  label: { fontSize: fontSize.sm, fontWeight: fontWeight.semibold, color: colors.gray700 },
  currencyBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    minHeight: 48,
    paddingHorizontal: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    backgroundColor: colors.surface,
  },
  currencyText: { fontSize: fontSize.md, color: colors.gray900 },
  hint: { fontSize: fontSize.sm, color: colors.gray500, lineHeight: 18 },
});
