import { useState } from "react";
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import { currencyName, currencySymbol, type CurrencyCode } from "@template/shared";
import { AppButton } from "@/components/ui";
import { CurrencyPicker } from "@/components/CurrencyPicker";
import { usePreferences } from "@/context/PreferencesContext";
import { ROUTES } from "@/lib/routes";
import { colors, fontSize, fontWeight, spacing, borderRadius } from "@/theme";

const COMMON: CurrencyCode[] = ["PHP", "USD", "EUR", "JPY", "SGD", "GBP", "AUD", "KRW"];

/**
 * One screen: what Talli does, the main currency (pre-selected from the
 * phone's region, changeable in place), and Get Started. Using Talli without
 * an account is the default; signing in is the secondary choice and creating
 * an account waits until it's useful (sharing), from the Account tab.
 */
export default function OnboardingScreen() {
  const router = useRouter();
  const { preferences, completeOnboarding } = usePreferences();
  const [currency, setCurrency] = useState<CurrencyCode>(preferences.defaultCurrency);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  async function finish(next: "guest" | "login"): Promise<void> {
    if (busy) return;
    setBusy(true);
    try {
      await completeOnboarding(currency);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      if (next === "guest") router.replace(ROUTES.home);
      else router.push(ROUTES.login);
    } finally {
      setBusy(false);
    }
  }

  const suggestions = [...new Set<CurrencyCode>([preferences.defaultCurrency, ...COMMON])].slice(0, 8);

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content} bounces={false}>
        <View style={styles.logo}>
          <Text maxFontSizeMultiplier={1.4} style={styles.logoText}>T</Text>
        </View>
        <Text maxFontSizeMultiplier={1.4} style={styles.title} accessibilityRole="header">
          Know where your money goes
        </Text>
        <Text style={styles.lead}>
          Track what you spend, and split it with friends when you need to. No account needed.
        </Text>
        <View style={styles.points}>
          <Point icon="flash-outline" title="Log an expense in seconds" body="Type an amount, or just describe it: “Coffee 180 yesterday”." />
          <Point icon="scan-outline" title="Scan receipts privately" body="Receipts are read on this iPhone. Photos never leave it." />
          <Point icon="people-outline" title="Split with friends" body="Groups, balances and payment links — add a free account whenever you want one." />
        </View>

        <TouchableOpacity
          style={styles.currencyRow}
          onPress={() => setPickerOpen(true)}
          accessibilityRole="button"
          accessibilityLabel={`Main currency, ${currencyName(currency)}. Change`}
        >
          <View style={styles.pointText}>
            <Text style={styles.currencyLabel}>Main currency</Text>
            <Text style={styles.currencyValue}>
              {currencyName(currency)} ({currencySymbol(currency)})
            </Text>
          </View>
          <Text style={styles.moreText}>Change</Text>
        </TouchableOpacity>
        <Text style={styles.example}>
          New expenses start in {currency}; any expense can use another currency. Talli never converts amounts.
        </Text>
      </ScrollView>

      <View style={styles.footer}>
        <AppButton title="Get Started" onPress={() => void finish("guest")} isLoading={busy} />
        <AppButton title="I Already Have an Account" variant="ghost" onPress={() => void finish("login")} disabled={busy} />
      </View>

      <CurrencyPicker
        visible={pickerOpen}
        selected={currency}
        suggested={suggestions}
        onSelect={(code) => {
          setCurrency(code);
          void Haptics.selectionAsync();
        }}
        onClose={() => setPickerOpen(false)}
      />
    </SafeAreaView>
  );
}

function Point({
  icon,
  title,
  body,
}: {
  icon: React.ComponentProps<typeof Ionicons>["name"];
  title: string;
  body: string;
}) {
  return (
    <View style={styles.point} accessible accessibilityLabel={`${title}. ${body}`}>
      <View style={styles.pointIcon}>
        <Ionicons name={icon} size={20} color={colors.primary} />
      </View>
      <View style={styles.pointText}>
        <Text style={styles.pointTitle}>{title}</Text>
        <Text style={styles.pointBody}>{body}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface },
  content: { flexGrow: 1, padding: spacing.xl, paddingTop: 48, gap: spacing.base },
  logo: {
    width: 64,
    height: 64,
    borderRadius: 16,
    backgroundColor: colors.primaryFill,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.sm,
  },
  logoText: { color: colors.white, fontSize: 32, fontWeight: fontWeight.bold },
  title: { fontSize: 30, lineHeight: 36, fontWeight: fontWeight.bold, letterSpacing: -0.5, color: colors.gray900 },
  lead: { fontSize: fontSize.md, lineHeight: 22, color: colors.gray600 },
  points: { gap: spacing.lg, marginTop: spacing.base },
  point: { flexDirection: "row", gap: spacing.md, alignItems: "flex-start" },
  pointIcon: {
    width: 40,
    height: 40,
    borderRadius: borderRadius.md,
    backgroundColor: colors.primaryLight,
    alignItems: "center",
    justifyContent: "center",
  },
  pointText: { flex: 1, gap: 2 },
  pointTitle: { fontSize: fontSize.md, fontWeight: fontWeight.semibold, color: colors.gray900 },
  pointBody: { fontSize: fontSize.base, lineHeight: 20, color: colors.gray600 },
  currencyRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    minHeight: 56,
    marginTop: spacing.base,
    paddingHorizontal: spacing.base,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  currencyLabel: { fontSize: fontSize.sm, color: colors.gray600 },
  currencyValue: { fontSize: fontSize.md, fontWeight: fontWeight.semibold, color: colors.gray900 },
  moreText: { color: colors.primaryDark, fontWeight: fontWeight.semibold, fontSize: fontSize.base },
  example: { fontSize: fontSize.sm, color: colors.gray500 },
  footer: { paddingHorizontal: spacing.xl, paddingBottom: spacing.base, gap: spacing.sm },
});
