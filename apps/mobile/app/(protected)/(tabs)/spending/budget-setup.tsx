import { useMemo, useState } from "react";
import { Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Switch, Text, TouchableOpacity, View } from "react-native";
import { Stack, useRouter } from "expo-router";
import * as Crypto from "expo-crypto";
import {
  CATEGORY_SLUGS,
  WEEKEND_WEIGHTS,
  amountToInput,
  budgetConfigSchema,
  dateRange,
  defaultBudgetConfig,
  formatAmount,
  monthOf,
  monthStart,
  parseAmountInput,
  previewChange,
  previewNewBudget,
  suggestDayWeights,
  suggestWeeklyTarget,
  versionAt,
  weekdayName,
  type BudgetConfig,
  type CategorySlug,
  type CurrencyCode,
  type FixedCost,
} from "@template/shared";
import { AmountInput, AppButton, AppTextInput, ChipGroup, SegmentedControl, useToast } from "@/components/ui";
import { useBudget } from "@/hooks/useBudget";
import { useBudgetActions } from "@/hooks/useBudgetActions";
import { usePreferences } from "@/context/PreferencesContext";
import { categoryMeta } from "@/lib/categories";
import { ROUTES } from "@/lib/routes";
import { colors, fontSize, fontWeight, spacing, borderRadius } from "@/theme";

type DailyMode = "even" | "weekends" | "history" | "daily";
type Recovery = "full" | "2" | "3" | "4";

const WEEK_STARTS = [1, 0, 6] as const;

function input(minor: number, currency: CurrencyCode): string {
  return minor > 0 ? amountToInput(minor, currency) : "";
}

function dailyModeOf(config: BudgetConfig): DailyMode {
  if (!config.dayWeights) return "even";
  return JSON.stringify(config.dayWeights) === JSON.stringify(WEEKEND_WEIGHTS) ? "weekends" : "history";
}

function changeSummary(before: BudgetConfig | null, after: BudgetConfig): string {
  if (!before) return `Monthly ${formatAmount(after.monthlyLimitMinor, after.currency)}, weekly ${formatAmount(after.weeklyTargetMinor, after.currency)}`;
  const parts: string[] = [];
  const money = (n: number): string => formatAmount(n, after.currency);
  if (before.monthlyLimitMinor !== after.monthlyLimitMinor) parts.push(`Monthly ${money(before.monthlyLimitMinor)} → ${money(after.monthlyLimitMinor)}`);
  if (before.weeklyTargetMinor !== after.weeklyTargetMinor) parts.push(`Weekly ${money(before.weeklyTargetMinor)} → ${money(after.weeklyTargetMinor)}`);
  if (JSON.stringify(before.recovery) !== JSON.stringify(after.recovery)) parts.push("Overspending recovery changed");
  if (JSON.stringify(before.fixedCosts) !== JSON.stringify(after.fixedCosts)) parts.push("Fixed costs changed");
  if (JSON.stringify(before.dayWeights) !== JSON.stringify(after.dayWeights)) parts.push("Daily spread changed");
  if (parts.length === 0) parts.push("Settings changed");
  return parts.join("; ").slice(0, 200);
}

/** The form starts from the saved budget, so it only renders once that has loaded. */
export default function BudgetSetupScreen() {
  const view = useBudget();
  if (view.storeStatus !== "ready") {
    return (
      <>
        <Stack.Screen options={{ title: "Budget" }} />
        <View style={styles.screen}>
          <Text style={[styles.help, styles.loadingText]}>{view.storeStatus === "error" ? "Your budget could not be read." : "Loading your budget…"}</Text>
        </View>
      </>
    );
  }
  return <BudgetSetupForm key={view.doc?.id ?? "new"} />;
}

function BudgetSetupForm() {
  const router = useRouter();
  const toast = useToast();
  const view = useBudget();
  const actions = useBudgetActions();
  const { preferences } = usePreferences();
  const { doc, today, sources } = view;
  const editing = !!doc && !doc.deletedAt;
  const current = editing ? versionAt(doc, today).config : null;
  const currency: CurrencyCode = current?.currency ?? preferences.defaultCurrency;
  const base = current ?? defaultBudgetConfig(currency);

  const [monthly, setMonthly] = useState(input(base.monthlyLimitMinor, currency));
  const [weekly, setWeekly] = useState(input(base.weeklyTargetMinor, currency));
  const [weeklyTouched, setWeeklyTouched] = useState(editing);
  const [dailyMode, setDailyMode] = useState<DailyMode>(dailyModeOf(base));
  const [dailyAmount, setDailyAmount] = useState(input(Math.floor(base.weeklyTargetMinor / 7), currency));
  const [weekStartsOn, setWeekStartsOn] = useState(base.weekStartsOn);
  const [recovery, setRecovery] = useState<Recovery>(base.recovery.mode === "full" ? "full" : (String(base.recovery.weeks) as Recovery));
  const [carryOver, setCarryOver] = useState(base.monthEnd === "carry_overspend");
  const [fixedCosts, setFixedCosts] = useState<FixedCost[]>(base.fixedCosts);
  const [outsideWeekly, setOutsideWeekly] = useState(new Set<string>(base.outsideWeekly));
  const [limits, setLimits] = useState<Record<string, string>>(() =>
    Object.fromEntries(base.categoryLimits.map((l) => [l.category, input(l.limitMinor, currency)])),
  );
  const [rates, setRates] = useState<Record<string, string>>(() => {
    const latest: Record<string, string> = {};
    for (const r of [...base.rates].sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom))) latest[r.currency] = r.rate;
    return latest;
  });
  const [moreOpen, setMoreOpen] = useState(false);
  const [newCostName, setNewCostName] = useState("");
  const [newCostAmount, setNewCostAmount] = useState("");
  const [saving, setSaving] = useState(false);

  const monthlyMinor = parseAmountInput(monthly, currency) ?? (monthly.trim() === "0" ? 0 : null);
  const fixedTotal = fixedCosts.reduce((sum, f) => sum + f.amountMinor, 0);
  const suggestion = useMemo(
    () =>
      monthlyMinor === null
        ? null
        : suggestWeeklyTarget({
            monthlyLimitMinor: monthlyMinor,
            fixedCostsMinor: fixedTotal,
            currency,
            sources,
            today,
            weekStartsOn,
            fixedNames: fixedCosts.map((f) => f.name),
          }),
    [monthlyMinor, fixedTotal, currency, sources, today, weekStartsOn, fixedCosts],
  );
  const historyWeights = useMemo(() => suggestDayWeights(sources, currency, today, weekStartsOn), [sources, currency, today, weekStartsOn]);
  const otherCurrencies = useMemo(
    () => [...new Set(sources.map((s) => s.currency).filter((c) => c !== currency))].sort(),
    [sources, currency],
  );

  const weeklyMinor =
    dailyMode === "daily"
      ? (() => {
          const d = parseAmountInput(dailyAmount, currency);
          return d === null ? null : d * 7;
        })()
      : weeklyTouched
        ? (parseAmountInput(weekly, currency) ?? (weekly.trim() === "0" ? 0 : null))
        : (suggestion?.weeklyMinor ?? null);

  const config = useMemo<BudgetConfig | null>(() => {
    if (monthlyMinor === null || weeklyMinor === null) return null;
    const categoryLimits = CATEGORY_SLUGS.flatMap((category) => {
      const v = limits[category];
      const minor = v ? parseAmountInput(v, currency) : null;
      return minor && minor > 0 ? [{ category, limitMinor: minor }] : [];
    });
    const rateList = [...(current?.rates ?? [])];
    for (const [code, rate] of Object.entries(rates)) {
      const trimmed = rate.trim();
      const existing = rateList.filter((r) => r.currency === code).sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom)).at(-1);
      if (!trimmed || existing?.rate === trimmed) continue;
      // A currency's first rate counts its expenses from the start of the budget; a changed rate applies from today.
      const effectiveFrom = existing ? today : monthStart(monthOf(doc?.startDate ?? today));
      const index = rateList.findIndex((r) => r.currency === code && r.effectiveFrom === effectiveFrom);
      const entry = { currency: code as CurrencyCode, rate: trimmed, effectiveFrom };
      if (index >= 0) rateList[index] = entry;
      else rateList.push(entry);
    }
    const candidate: BudgetConfig = {
      ...base,
      currency,
      monthlyLimitMinor: monthlyMinor,
      weeklyTargetMinor: weeklyMinor,
      dayWeights: dailyMode === "weekends" ? WEEKEND_WEIGHTS : dailyMode === "history" ? (historyWeights ?? base.dayWeights) : null,
      weekStartsOn,
      recovery: recovery === "full" ? { mode: "full" } : { mode: "smoothed", weeks: Number(recovery) },
      monthEnd: carryOver ? "carry_overspend" : "fresh_start",
      outsideWeekly: [...outsideWeekly] as CategorySlug[],
      categoryLimits,
      fixedCosts,
      rates: rateList,
    };
    return budgetConfigSchema.safeParse(candidate).success ? candidate : null;
  }, [monthlyMinor, weeklyMinor, limits, rates, current, today, doc, base, currency, dailyMode, historyWeights, weekStartsOn, recovery, carryOver, outsideWeekly, fixedCosts]);

  const preview = useMemo(() => {
    if (!config) return null;
    return editing && doc ? previewChange(doc, config, sources, today) : previewNewBudget(config, sources, today);
  }, [config, editing, doc, sources, today]);

  function addFixedCost(): void {
    const amount = parseAmountInput(newCostAmount, currency);
    const name = newCostName.trim();
    if (!name || !amount) {
      toast.error("Add a name and an amount for the fixed cost.");
      return;
    }
    setFixedCosts((list) => [...list, { id: Crypto.randomUUID(), name: name.slice(0, 60), amountMinor: amount, category: "fees", dueDay: null }]);
    setNewCostName("");
    setNewCostAmount("");
  }

  async function save(): Promise<void> {
    if (!config || saving) return;
    setSaving(true);
    try {
      if (editing) await actions.changeSettings(config, changeSummary(current, config));
      else await actions.setUp(config, { summary: changeSummary(null, config) });
      toast.success(editing ? "Budget updated" : "Budget set up");
      router.replace(ROUTES.budget);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "The budget couldn't be saved.");
    } finally {
      setSaving(false);
    }
  }

  function confirmTurnOff(): void {
    Alert.alert("Turn off your budget?", "Your expenses stay. You can set up a budget again any time.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Turn Off",
        style: "destructive",
        onPress: () =>
          void actions.turnOff().then(() => {
            toast.success("Budget turned off");
            router.replace(ROUTES.spending);
          }),
      },
    ]);
  }

  const money = (n: number): string => formatAmount(n, currency);
  const fits = preview?.fitsLimit ?? true;

  return (
    <>
      <Stack.Screen
        options={{
          title: editing ? "Edit Budget" : "Set Up Budget",
          headerRight: () => (
            <TouchableOpacity onPress={() => void save()} disabled={!config || saving} accessibilityRole="button" hitSlop={8}>
              <Text maxFontSizeMultiplier={1.3} style={[styles.headerButton, (!config || saving) && styles.disabled]}>Save</Text>
            </TouchableOpacity>
          ),
        }}
      />
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView style={styles.screen} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" contentInsetAdjustmentBehavior="automatic">
          <AmountInput
            label="Monthly spending limit"
            value={monthly}
            onChangeText={setMonthly}
            currency={currency}
            autoFocus={!editing}
            accessibilityLabel="Monthly spending limit"
          />
          <Text style={styles.help}>Everything you spend in a month counts toward this, including your share of group expenses.</Text>

          <View style={styles.group}>
            <Text style={styles.label}>Daily allowance</Text>
            <SegmentedControl<DailyMode>
              segments={[
                { value: "even", label: "Even" },
                { value: "weekends", label: "Weekends+" },
                ...(historyWeights ? [{ value: "history" as const, label: "Like Me" }] : []),
                { value: "daily", label: "Per Day" },
              ]}
              value={dailyMode}
              onChange={setDailyMode}
            />
            <Text style={styles.help}>
              {dailyMode === "even"
                ? "The same every day."
                : dailyMode === "weekends"
                  ? "Friday to Sunday get half again as much as other days."
                  : dailyMode === "history"
                    ? "Follows the days you’ve spent most on in recent weeks."
                    : "Set a daily amount; your weekly allowance is seven days of it."}
            </Text>
          </View>

          {dailyMode === "daily" ? (
            <AmountInput label="Each day" value={dailyAmount} onChangeText={setDailyAmount} currency={currency} accessibilityLabel="Daily amount" />
          ) : (
            <View style={styles.group}>
              <AmountInput
                label="Weekly allowance"
                value={weeklyTouched ? weekly : suggestion ? input(suggestion.weeklyMinor, currency) : ""}
                onChangeText={(v) => {
                  setWeeklyTouched(true);
                  setWeekly(v);
                }}
                currency={currency}
                accessibilityLabel="Weekly allowance"
              />
              {suggestion && !weeklyTouched && (
                <Text style={styles.help}>
                  {suggestion.basis === "history"
                    ? `Suggested from your last ${suggestion.weeksOfHistory} weeks (about ${money(suggestion.averageWeeklyMinor ?? 0)} a week).`
                    : `The most that fits ${money(monthlyMinor ?? 0)}${fixedTotal > 0 ? " after fixed costs" : ""} in a 31-day month.`}{" "}
                  Unused allowance rolls into next week; overspending comes out of it.
                </Text>
              )}
            </View>
          )}

          <View style={styles.group}>
            <Text style={styles.label}>Week starts on</Text>
            <SegmentedControl<string>
              segments={WEEK_STARTS.map((d) => ({ value: String(d), label: weekdayName(d) }))}
              value={String(weekStartsOn)}
              onChange={(v) => setWeekStartsOn(Number(v))}
            />
            {editing && weekStartsOn !== current?.weekStartsOn && <Text style={styles.help}>A new week start takes effect next month.</Text>}
          </View>

          {preview && preview.state.status === "active" && (
            <View style={[styles.preview, !fits && styles.previewWarn]} accessible accessibilityLabel={`Preview. ${preview.weeks.map((w) => `${dateRange(w.start, w.end)}: ${money(w.allowanceMinor)}`).join(". ")}`}>
              <Text style={styles.previewTitle}>{editing ? "With these changes" : "Your weeks this month"}</Text>
              {preview.weeks.map((w) => (
                <View key={w.start} style={styles.previewRow}>
                  <Text style={styles.previewLabel}>{dateRange(w.start, w.end)}</Text>
                  <Text style={styles.previewValue}>{money(w.allowanceMinor)}</Text>
                </View>
              ))}
              <Text style={styles.previewMeta}>
                {fits
                  ? `Planned for the month: ${money(preview.plannedMonthMinor)} of ${money(config?.monthlyLimitMinor ?? 0)}.`
                  : `Planned for the month: ${money(preview.plannedMonthMinor)}, more than your ${money(config?.monthlyLimitMinor ?? 0)} limit. Talli still stops at the limit; lower the weekly allowance to match.`}
              </Text>
            </View>
          )}
          {!config && monthly.trim() !== "" && <Text style={styles.error}>Check the amounts above.</Text>}

          <TouchableOpacity style={styles.more} onPress={() => setMoreOpen((o) => !o)} accessibilityRole="button" accessibilityState={{ expanded: moreOpen }}>
            <Text style={styles.moreText}>More Options</Text>
            <Text style={styles.moreHint}>Overspending, fixed costs, categories{otherCurrencies.length ? ", currencies" : ""}</Text>
          </TouchableOpacity>

          {moreOpen && (
            <View style={styles.moreBody}>
              <View style={styles.group}>
                <Text style={styles.label}>When you overspend</Text>
                <SegmentedControl<Recovery>
                  segments={[
                    { value: "full", label: "Next Week" },
                    { value: "2", label: "2 Weeks" },
                    { value: "3", label: "3 Weeks" },
                    { value: "4", label: "4 Weeks" },
                  ]}
                  value={recovery}
                  onChange={setRecovery}
                />
                <Text style={styles.help}>
                  {recovery === "full"
                    ? "Next week’s allowance is lowered by the whole amount."
                    : `The amount is taken out in equal parts over ${recovery} weeks. Nothing is forgiven, it just takes longer, and never past the end of the month.`}
                </Text>
              </View>

              <View style={styles.switchRow}>
                <View style={styles.flex}>
                  <Text style={styles.label}>Carry overspending into next month</Text>
                  <Text style={styles.help}>Only spending above the monthly limit carries. Money you don’t spend never raises next month’s limit.</Text>
                </View>
                <Switch value={carryOver} onValueChange={setCarryOver} accessibilityLabel="Carry overspending into next month" />
              </View>

              <View style={styles.group}>
                <Text style={styles.label}>Fixed costs</Text>
                <Text style={styles.help}>Set aside each month and kept out of your weekly allowance. An expense whose description contains the name (like “Rent”) counts toward it.</Text>
                {fixedCosts.map((f) => (
                  <View key={f.id} style={styles.listRow}>
                    <Text style={styles.listText}>{f.name}</Text>
                    <Text style={styles.listValue}>{money(f.amountMinor)}</Text>
                    <TouchableOpacity onPress={() => setFixedCosts((l) => l.filter((x) => x.id !== f.id))} accessibilityRole="button" accessibilityLabel={`Remove ${f.name}`} hitSlop={8}>
                      <Text style={styles.remove}>Remove</Text>
                    </TouchableOpacity>
                  </View>
                ))}
                <View style={styles.addRow}>
                  <AppTextInput placeholder="Name, e.g. Rent" value={newCostName} onChangeText={setNewCostName} containerStyle={styles.flex} accessibilityLabel="Fixed cost name" />
                  <View style={styles.flex}>
                    <AmountInput value={newCostAmount} onChangeText={setNewCostAmount} currency={currency} accessibilityLabel="Fixed cost amount" />
                  </View>
                </View>
                <AppButton title="Add Fixed Cost" variant="secondary" onPress={addFixedCost} />
              </View>

              <ChipGroup
                label="Count only toward the month (not the week)"
                chips={CATEGORY_SLUGS.map((c) => ({ id: c, label: categoryMeta(c).label }))}
                selected={outsideWeekly}
                onToggle={(id) =>
                  setOutsideWeekly((set) => {
                    const next = new Set(set);
                    if (next.has(id)) next.delete(id);
                    else next.add(id);
                    return next;
                  })
                }
              />

              <View style={styles.group}>
                <Text style={styles.label}>Category limits (optional)</Text>
                {CATEGORY_SLUGS.map((c) => (
                  <View key={c} style={styles.limitRow}>
                    <Text style={styles.listText}>{categoryMeta(c).label}</Text>
                    <View style={styles.limitInput}>
                      <AmountInput value={limits[c] ?? ""} onChangeText={(v) => setLimits((l) => ({ ...l, [c]: v }))} currency={currency} accessibilityLabel={`${categoryMeta(c).label} monthly limit`} placeholder="No limit" />
                    </View>
                  </View>
                ))}
              </View>

              {otherCurrencies.length > 0 && (
                <View style={styles.group}>
                  <Text style={styles.label}>Exchange rates</Text>
                  <Text style={styles.help}>Expenses in other currencies count once you set a rate. A changed rate applies from today; earlier expenses keep the rate they had.</Text>
                  {otherCurrencies.map((code) => (
                    <View key={code} style={styles.limitRow}>
                      <Text style={styles.listText}>1 {code} =</Text>
                      <View style={styles.limitInput}>
                        <AppTextInput
                          value={rates[code] ?? ""}
                          onChangeText={(v) => setRates((r) => ({ ...r, [code]: v.replace(",", ".") }))}
                          keyboardType="decimal-pad"
                          placeholder={`${currency}`}
                          accessibilityLabel={`${code} to ${currency} rate`}
                        />
                      </View>
                    </View>
                  ))}
                </View>
              )}
            </View>
          )}

          <AppButton title={editing ? "Save Changes" : "Start Budget"} onPress={() => void save()} disabled={!config || saving} isLoading={saving} />
          {!editing && (
            <TouchableOpacity
              onPress={() => router.push({ pathname: ROUTES.assistant, params: { prompt: "Help me set up a budget" } })}
              accessibilityRole="button"
              style={styles.assist}
            >
              <Text style={styles.link}>Set Up with Assistant</Text>
            </TouchableOpacity>
          )}
          {editing && <AppButton title="Turn Off Budget" variant="ghost" onPress={confirmTurnOff} />}
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
  loadingText: { padding: spacing.base },
  group: { gap: spacing.sm },
  label: { fontSize: fontSize.base, fontWeight: fontWeight.semibold, color: colors.gray700 },
  help: { fontSize: fontSize.sm, lineHeight: 18, color: colors.gray500 },
  error: { fontSize: fontSize.sm, color: colors.danger },
  preview: {
    backgroundColor: colors.primaryTint,
    borderColor: colors.primaryBorderSoft,
    borderWidth: 1,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    gap: spacing.xs,
  },
  previewWarn: { backgroundColor: colors.warningLight, borderColor: colors.warning },
  previewTitle: { fontSize: fontSize.base, fontWeight: fontWeight.bold, color: colors.gray900, marginBottom: spacing.xs },
  previewRow: { flexDirection: "row", justifyContent: "space-between" },
  previewLabel: { fontSize: fontSize.base, color: colors.gray700 },
  previewValue: { fontSize: fontSize.base, color: colors.gray900, fontWeight: fontWeight.semibold, fontVariant: ["tabular-nums"] },
  previewMeta: { fontSize: fontSize.sm, lineHeight: 18, color: colors.gray600, marginTop: spacing.xs },
  more: { paddingVertical: spacing.sm, minHeight: 44, justifyContent: "center" },
  moreText: { fontSize: fontSize.md, fontWeight: fontWeight.semibold, color: colors.primary },
  moreHint: { fontSize: fontSize.sm, color: colors.gray500 },
  moreBody: { gap: spacing.lg },
  switchRow: { flexDirection: "row", gap: spacing.md, alignItems: "center" },
  listRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, minHeight: 44 },
  listText: { flex: 1, fontSize: fontSize.md, color: colors.gray800 },
  listValue: { fontSize: fontSize.md, color: colors.gray900, fontVariant: ["tabular-nums"] },
  remove: { fontSize: fontSize.base, color: colors.danger, fontWeight: fontWeight.semibold },
  addRow: { flexDirection: "row", gap: spacing.sm, alignItems: "flex-start" },
  limitRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  limitInput: { width: 160 },
  assist: { alignItems: "center", paddingVertical: spacing.sm, minHeight: 44, justifyContent: "center" },
  link: { fontSize: fontSize.md, fontWeight: fontWeight.semibold, color: colors.primary },
});
