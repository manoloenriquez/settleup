import { useState } from "react";
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import { currencyName, currencySymbol, formatAmount, type CurrencyCode } from "@template/shared";
import { AppButton } from "@/components/ui";
import { CurrencyPicker } from "@/components/CurrencyPicker";
import { usePreferences } from "@/context/PreferencesContext";
import { ROUTES } from "@/lib/routes";
import { colors, fontSize, fontWeight, spacing, borderRadius } from "@/theme";

type Step = "welcome" | "currency" | "account";

const COMMON: CurrencyCode[] = ["PHP", "USD", "EUR", "JPY", "SGD", "GBP", "AUD", "KRW"];

/**
 * Three short screens: what Talli does, the main currency, and an optional
 * account. Nothing else is asked up front.
 */
export default function OnboardingScreen() {
  const router = useRouter();
  const { preferences, completeOnboarding } = usePreferences();
  const [step, setStep] = useState<Step>("welcome");
  const [currency, setCurrency] = useState<CurrencyCode>(preferences.defaultCurrency);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  async function finish(next: "guest" | "register" | "login"): Promise<void> {
    if (busy) return;
    setBusy(true);
    try {
      await completeOnboarding(currency);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      if (next === "guest") router.replace(ROUTES.home);
      else router.push(next === "register" ? ROUTES.register : ROUTES.login);
    } finally {
      setBusy(false);
    }
  }

  const suggestions = [...new Set<CurrencyCode>([preferences.defaultCurrency, ...COMMON])].slice(0, 8);

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      {step !== "welcome" && (
        <TouchableOpacity
          style={styles.back}
          onPress={() => setStep(step === "account" ? "currency" : "welcome")}
          accessibilityRole="button"
          accessibilityLabel="Back"
          hitSlop={12}
        >
          <Ionicons name="chevron-back" size={24} color={colors.primary} />
        </TouchableOpacity>
      )}
      <ScrollView contentContainerStyle={styles.content} bounces={false}>
        {step === "welcome" && (
          <>
            <View style={styles.logo}>
              <Text style={styles.logoText}>T</Text>
            </View>
            <Text style={styles.title} accessibilityRole="header">
              Know where your money goes
            </Text>
            <Text style={styles.lead}>
              Talli keeps track of what you spend and, when you’re ready, what you share with
              friends.
            </Text>
            <View style={styles.points}>
              <Point icon="flash-outline" title="Log an expense in seconds" body="Type an amount, or just describe it: “Coffee 180 yesterday”." />
              <Point icon="scan-outline" title="Scan receipts privately" body="Receipts are read on this iPhone. Photos never leave it." />
              <Point icon="people-outline" title="Split with friends later" body="Groups, balances and payment links when you create an account." />
            </View>
          </>
        )}

        {step === "currency" && (
          <>
            <Text style={styles.title} accessibilityRole="header">
              Your main currency
            </Text>
            <Text style={styles.lead}>
              New expenses start in this currency. You can pick another one for any expense —
              Talli never converts amounts behind your back.
            </Text>
            <View style={styles.grid}>
              {suggestions.map((code) => {
                const active = code === currency;
                return (
                  <TouchableOpacity
                    key={code}
                    style={[styles.option, active && styles.optionActive]}
                    onPress={() => {
                      setCurrency(code);
                      void Haptics.selectionAsync();
                    }}
                    accessibilityRole="radio"
                    accessibilityState={{ checked: active }}
                    accessibilityLabel={`${currencyName(code)}, ${code}`}
                  >
                    <Text style={[styles.optionSymbol, active && styles.optionTextActive]}>
                      {currencySymbol(code)}
                    </Text>
                    <Text style={[styles.optionCode, active && styles.optionTextActive]}>{code}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            <TouchableOpacity
              onPress={() => setPickerOpen(true)}
              accessibilityRole="button"
              style={styles.moreBtn}
            >
              <Text style={styles.moreText}>More currencies</Text>
            </TouchableOpacity>
            <Text style={styles.example}>
              {currencyName(currency)} · e.g. {formatAmount(currency === "JPY" || currency === "KRW" ? 1500 : 123450, currency)}
            </Text>
          </>
        )}

        {step === "account" && (
          <>
            <Text style={styles.title} accessibilityRole="header">
              An account is optional
            </Text>
            <Text style={styles.lead}>
              Everything you add is saved on this iPhone. Create a free account when you want to:
            </Text>
            <View style={styles.points}>
              <Point icon="people-outline" title="Share expenses" body="Groups and friends, with balances everyone can see." />
              <Point icon="link-outline" title="Collect payments" body="Send a link with your GCash or bank details." />
              <Point icon="sync-outline" title="Sync and recover" body="Your expenses on every device, even a new phone." />
            </View>
            <Text style={styles.note}>
              If you create an account later, you choose whether to add the expenses on this
              iPhone to it.
            </Text>
          </>
        )}
      </ScrollView>

      <View style={styles.footer}>
        {step === "welcome" && <AppButton title="Get Started" onPress={() => setStep("currency")} />}
        {step === "currency" && (
          <AppButton title={`Use ${currencyName(currency)}`} onPress={() => setStep("account")} />
        )}
        {step === "account" && (
          <>
            <AppButton title="Create Account" onPress={() => void finish("register")} disabled={busy} />
            <AppButton title="Sign In" variant="secondary" onPress={() => void finish("login")} disabled={busy} />
            <AppButton
              title="Continue Without an Account"
              variant="ghost"
              onPress={() => void finish("guest")}
              isLoading={busy}
            />
          </>
        )}
      </View>

      <CurrencyPicker
        visible={pickerOpen}
        selected={currency}
        suggested={suggestions}
        onSelect={setCurrency}
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
  back: { position: "absolute", top: 56, left: spacing.base, zIndex: 1, padding: spacing.xs },
  content: { flexGrow: 1, padding: spacing.xl, paddingTop: 72, gap: spacing.base },
  logo: {
    width: 64,
    height: 64,
    borderRadius: 16,
    backgroundColor: colors.primary,
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
  grid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginTop: spacing.sm },
  option: {
    width: "23%",
    minHeight: 64,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
  },
  optionActive: { borderColor: colors.primary, backgroundColor: colors.primaryLight },
  optionSymbol: { fontSize: fontSize.lg, fontWeight: fontWeight.semibold, color: colors.gray800 },
  optionCode: { fontSize: fontSize.xs, color: colors.gray500, fontWeight: fontWeight.medium },
  optionTextActive: { color: colors.primaryDark },
  moreBtn: { alignSelf: "flex-start", paddingVertical: spacing.sm },
  moreText: { color: colors.primary, fontWeight: fontWeight.semibold, fontSize: fontSize.base },
  example: { fontSize: fontSize.sm, color: colors.gray500 },
  note: { fontSize: fontSize.sm, lineHeight: 19, color: colors.gray500, marginTop: spacing.base },
  footer: { paddingHorizontal: spacing.xl, paddingBottom: spacing.base, gap: spacing.sm },
});
