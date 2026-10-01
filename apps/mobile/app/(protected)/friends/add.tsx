import { useState } from "react";
import { ScrollView, Share, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Stack, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";
import { currencyName, type CurrencyCode } from "@template/shared";
import { AppButton, AppTextInput, useToast } from "@/components/ui";
import { CurrencyPicker } from "@/components/CurrencyPicker";
import { useAuth } from "@/context/AuthContext";
import { usePreferences } from "@/context/PreferencesContext";
import { useProfile } from "@/hooks/useProfile";
import { createFriendInvite } from "@/services/friends";
import { colors, fontSize, fontWeight, spacing, borderRadius } from "@/theme";

/** Make a single-use invite link and send it however the person likes. */
export default function AddFriendScreen() {
  const router = useRouter();
  const toast = useToast();
  const { session } = useAuth();
  const { data: profile } = useProfile();
  const { preferences } = usePreferences();
  const suggested = profile?.full_name?.trim() || session?.user.email?.split("@")[0] || "";
  const [name, setName] = useState<string | null>(null);
  const [currency, setCurrency] = useState<CurrencyCode>(preferences.defaultCurrency);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [link, setLink] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const displayName = (name ?? suggested).trim();

  async function create() {
    if (!displayName || busy) return;
    setBusy(true);
    const res = await createFriendInvite(displayName, currency);
    setBusy(false);
    if (res.error !== null) return toast.error(res.error);
    setLink(res.data.url);
    void send(res.data.url);
  }

  async function send(url: string) {
    try {
      await Share.share({
        message: `${displayName} wants to keep track of shared expenses with you on Talli: ${url}`,
        url,
      });
    } catch {
      // cancelled
    }
  }

  return (
    <>
      <Stack.Screen options={{ title: "Add a Friend" }} />
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.lead}>
          Talli makes a private link for one friend. When they open it and sign in, you’ll share a
          simple tab between the two of you. Nobody can find you by searching.
        </Text>
        <AppTextInput
          label="Your name for this friend"
          value={name ?? suggested}
          onChangeText={setName}
          placeholder="How your friend knows you"
          autoCapitalize="words"
          editable={!link}
        />
        <View style={styles.currencyRow}>
          <Text style={styles.label}>Currency for your tab</Text>
          <TouchableOpacity
            style={styles.currencyBtn}
            onPress={() => setPickerOpen(true)}
            disabled={!!link}
            accessibilityRole="button"
            accessibilityLabel={`Currency ${currencyName(currency)}. Change`}
          >
            <Text style={styles.currencyText}>
              {currencyName(currency)} ({currency})
            </Text>
            <Ionicons name="chevron-forward" size={16} color={colors.gray400} />
          </TouchableOpacity>
        </View>
        {link ? (
          <>
            <View style={styles.linkBox}>
              <Text style={styles.linkLabel}>Invite link (works once, for 14 days)</Text>
              <Text style={styles.link} selectable numberOfLines={2}>
                {link}
              </Text>
            </View>
            <AppButton title="Send Invite Link" onPress={() => void send(link)} />
            <AppButton
              title="Copy Link"
              variant="secondary"
              onPress={() => {
                void Clipboard.setStringAsync(link).then(() => toast.success("Link copied"));
              }}
            />
            <AppButton title="Done" variant="ghost" onPress={() => router.back()} />
          </>
        ) : (
          <AppButton title="Create Invite Link" onPress={() => void create()} isLoading={busy} disabled={!displayName} />
        )}
      </ScrollView>
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
  content: { padding: spacing.base, gap: spacing.md, paddingBottom: spacing["3xl"] },
  lead: { fontSize: fontSize.base, lineHeight: 21, color: colors.gray600 },
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
    borderRadius: borderRadius.md,
    backgroundColor: colors.surface,
  },
  currencyText: { fontSize: fontSize.md, color: colors.gray900 },
  linkBox: { padding: spacing.md, borderRadius: borderRadius.md, backgroundColor: colors.primaryLight, gap: 4 },
  linkLabel: { fontSize: fontSize.xs, fontWeight: fontWeight.semibold, color: colors.primaryDark },
  link: { fontSize: fontSize.sm, color: colors.gray900 },
});
