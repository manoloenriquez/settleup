import { useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Switch, Text, TouchableOpacity, View } from "react-native";
import { Stack, useRouter } from "expo-router";
import { formatAmount, monthOf, parseAmountInput, type CurrencyCode } from "@template/shared";
import { AmountInput, AppButton, AppTextInput, DateField, useToast } from "@/components/ui";
import { useBudget } from "@/hooks/useBudget";
import { useBudgetActions } from "@/hooks/useBudgetActions";
import { colors, fontSize, fontWeight, spacing } from "@/theme";

/**
 * Set money aside for something coming up: a purchase (one day) or a trip
 * (every expense in its dates counts toward it, not the weekly allowance).
 */
export default function BudgetPlanScreen() {
  const router = useRouter();
  const toast = useToast();
  const { state, today } = useBudget();
  const actions = useBudgetActions();
  const currency: CurrencyCode = state.status === "active" ? state.currency : "PHP";
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);
  const [trip, setTrip] = useState(false);
  const [saving, setSaving] = useState(false);

  const amountMinor = parseAmountInput(amount, currency);
  const end = trip ? to : from;
  const sameMonth = monthOf(from) === monthOf(end) && from <= end;
  const valid = name.trim().length > 0 && !!amountMinor && sameMonth;
  const available = state.status === "active" ? state.live.availableMonthMinor : 0;
  const thisMonth = state.status === "active" && monthOf(from) === monthOf(state.live.today);

  async function save(): Promise<void> {
    if (!valid || !amountMinor || saving) return;
    setSaving(true);
    try {
      await actions.addNote({
        kind: "planned",
        name: name.trim().slice(0, 60),
        amountMinor,
        from,
        to: end,
        coversAllSpending: trip,
        category: null,
      });
      toast.success(`${formatAmount(amountMinor, currency)} set aside for ${name.trim()}`);
      router.back();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "That couldn't be saved.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <Stack.Screen
        options={{
          title: "Plan Spending",
          headerRight: () => (
            <TouchableOpacity onPress={() => void save()} disabled={!valid || saving} accessibilityRole="button" hitSlop={8}>
              <Text maxFontSizeMultiplier={1.3} style={[styles.headerButton, (!valid || saving) && styles.disabled]}>Save</Text>
            </TouchableOpacity>
          ),
        }}
      />
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView style={styles.screen} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" contentInsetAdjustmentBehavior="automatic">
          <AppTextInput label="What for" placeholder="e.g. New phone, Baguio trip" value={name} onChangeText={setName} autoFocus accessibilityLabel="What for" />
          <AmountInput label="Amount to set aside" value={amount} onChangeText={setAmount} currency={currency} accessibilityLabel="Amount to set aside" />
          <View style={styles.switchRow}>
            <View style={styles.flex}>
              <Text style={styles.label}>It’s a trip</Text>
              <Text style={styles.help}>Everything you spend during the trip counts toward this instead of your weekly allowance.</Text>
            </View>
            <Switch value={trip} onValueChange={setTrip} accessibilityLabel="It’s a trip" />
          </View>
          <DateField label={trip ? "From" : "When"} value={from} onChange={setFrom} />
          {trip && <DateField label="To" value={to} onChange={setTo} />}
          {!sameMonth && <Text style={styles.error}>Choose dates within one month, ending on or after the start.</Text>}
          {thisMonth && amountMinor !== null && amountMinor > available && (
            <Text style={styles.warn}>
              That’s more than the {formatAmount(available, currency)} left this month. It will be set aside anyway and the month will show as over.
            </Text>
          )}
          {!trip && <Text style={styles.help}>An expense in that month whose description contains “{name.trim() || "the name"}” counts toward it. You can also link one from the budget screen.</Text>}
          <AppButton title="Set Aside" onPress={() => void save()} disabled={!valid || saving} isLoading={saving} />
        </ScrollView>
      </KeyboardAvoidingView>
    </>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.base, paddingBottom: spacing["3xl"], gap: spacing.base },
  headerButton: { fontSize: fontSize.lg, color: colors.primary, fontWeight: fontWeight.semibold },
  disabled: { opacity: 0.4 },
  label: { fontSize: fontSize.base, fontWeight: fontWeight.semibold, color: colors.gray700 },
  help: { fontSize: fontSize.sm, lineHeight: 18, color: colors.gray500 },
  error: { fontSize: fontSize.sm, color: colors.danger },
  warn: { fontSize: fontSize.sm, lineHeight: 18, color: colors.warningDark },
  switchRow: { flexDirection: "row", gap: spacing.md, alignItems: "center" },
});
