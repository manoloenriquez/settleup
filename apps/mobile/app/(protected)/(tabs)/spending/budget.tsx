import { useMemo } from "react";
import { ActionSheetIOS, Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Stack, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import {
  dateRange,
  explainLineCopy,
  explainWeek,
  formatAmount,
  liveAnnotations,
  parseAmountInput,
  shortDate,
  warningCopy,
  type BudgetItem,
  type CurrencyCode,
  type Reservation,
} from "@template/shared";
import { AppButton, EmptyState, ErrorBanner, useToast } from "@/components/ui";
import { BudgetSummaryCard } from "@/components/budget/BudgetSummaryCard";
import { useBudgetStore } from "@/context/BudgetContext";
import { useBudget } from "@/hooks/useBudget";
import { useBudgetActions } from "@/hooks/useBudgetActions";
import { useStackedLayout } from "@/hooks/useStackedLayout";
import { categoryMeta } from "@/lib/categories";
import { monthLabel } from "@/lib/dates";
import { ROUTES } from "@/lib/routes";
import { colors, fontSize, fontWeight, spacing, borderRadius } from "@/theme";

function Section({ title, children, action }: { title: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle} accessibilityRole="header">
          {title}
        </Text>
        {action}
      </View>
      <View style={styles.card}>{children}</View>
    </View>
  );
}

function Row({ label, value, detail, strong, tone }: { label: string; value: string; detail?: string; strong?: boolean; tone?: "danger" | "good" }) {
  // At accessibility text sizes the value goes under the label instead of squeezing it.
  const stacked = useStackedLayout();
  return (
    <View style={[styles.row, stacked && styles.rowStacked]} accessible accessibilityLabel={`${label}: ${value}${detail ? `. ${detail}` : ""}`}>
      <View style={styles.rowText}>
        <Text style={[styles.rowLabel, strong && styles.strong]}>{label}</Text>
        {detail ? <Text style={styles.rowDetail}>{detail}</Text> : null}
      </View>
      <Text style={[styles.rowValue, stacked && styles.rowValueStacked, strong && styles.strong, tone === "danger" && styles.danger, tone === "good" && styles.good]}>{value}</Text>
    </View>
  );
}

function Bar({ value, total, over }: { value: number; total: number; over?: boolean }) {
  const share = total > 0 ? Math.min(1, Math.max(0, value / total)) : value > 0 ? 1 : 0;
  return (
    <View style={styles.track}>
      <View style={[styles.fill, { width: `${share * 100}%` }, over && styles.fillOver]} />
    </View>
  );
}

const BUCKET_LABEL: Record<BudgetItem["bucket"]["kind"], string> = {
  weekly: "Weekly",
  fixed: "Fixed cost",
  planned: "Planned",
  outside: "Month only",
};

function itemSub(item: BudgetItem): string {
  const parts = [shortDate(item.date)];
  if (item.groupName) parts.push(`your share in ${item.groupName}`);
  if (item.status === "excluded") parts.push("not counted");
  else if (item.status === "no_rate") parts.push(`${item.originalCurrency} — add a rate to count it`);
  else if (item.bucket.kind === "fixed" || item.bucket.kind === "planned") parts.push(item.bucket.name);
  else parts.push(BUCKET_LABEL[item.bucket.kind]);
  if (item.rate) parts.push(`${formatAmount(item.originalMinor, item.originalCurrency)} at ${item.rate}`);
  return parts.join(" · ");
}

function reservationLabel(r: Reservation): string {
  if (r.kind === "category") return `${categoryMeta(r.id as Parameters<typeof categoryMeta>[0]).label} limit`;
  return r.name;
}

function reservationDetail(r: Reservation, currency: CurrencyCode): string {
  if (r.kind === "scheduled") return `Recorded for ${r.date ? shortDate(r.date) : "later"}`;
  const due = r.date ? (r.kind === "fixed" ? `Due ${shortDate(r.date)}` : `From ${shortDate(r.date)}`) : null;
  const paid = r.matchedMinor > 0 ? `${formatAmount(r.matchedMinor, currency)} of ${formatAmount(r.amountMinor, currency)} spent` : `${formatAmount(r.amountMinor, currency)} planned`;
  return [due, paid].filter(Boolean).join(" · ");
}

export default function BudgetScreen() {
  const router = useRouter();
  const toast = useToast();
  const view = useBudget();
  const store = useBudgetStore();
  const actions = useBudgetActions();
  const stacked = useStackedLayout();
  const { state, doc } = view;

  const explanation = useMemo(() => (state.status === "active" ? explainWeek(state) : []), [state]);

  const header = (
    <Stack.Screen
      options={{
        title: "Budget",
        headerRight: () =>
          state.status !== "off" ? (
            <TouchableOpacity onPress={() => router.push(ROUTES.budgetSetup)} accessibilityRole="button" hitSlop={8}>
              <Text style={styles.headerButton} maxFontSizeMultiplier={1.3}>Edit</Text>
            </TouchableOpacity>
          ) : null,
      }}
    />
  );

  if (store.status === "error") {
    return (
      <>
        {header}
        <View style={styles.screen}>
          <ErrorBanner message={store.error ?? "Your budget could not be read."} onRetry={store.reload} />
        </View>
      </>
    );
  }

  if (view.loading) {
    return (
      <>
        {header}
        <View style={styles.screen}>
          <Text style={[styles.empty, styles.loading]}>Loading your budget…</Text>
        </View>
      </>
    );
  }

  if (state.status === "off") {
    return (
      <>
        {header}
        <View style={styles.screen}>
          <EmptyState
            icon="pie-chart-outline"
            title="No budget yet"
            description="Set a monthly limit and a weekly allowance. Talli does the maths every day."
            actionLabel="Set Up Budget"
            onAction={() => router.push(ROUTES.budgetSetup)}
          />
        </View>
      </>
    );
  }

  if (state.status === "not_started") {
    return (
      <>
        {header}
        <ScrollView style={styles.screen} contentContainerStyle={styles.content} contentInsetAdjustmentBehavior="automatic">
          <BudgetSummaryCard state={state} onOpen={() => router.push(ROUTES.budgetSetup)} />
        </ScrollView>
      </>
    );
  }

  const { live, currency, warnings } = state;
  const month = state.months.at(-1)!;
  const fmt = (n: number): string => formatAmount(n, currency);
  const reservations = live.reservations.filter((r) => r.reservedMinor > 0 || r.kind !== "scheduled");
  const monthItems = state.items
    .filter((i) => i.date.slice(0, 7) === month.month)
    .sort((a, b) => b.date.localeCompare(a.date) || a.ref.localeCompare(b.ref))
    .slice(0, 40);
  const notes = doc ? liveAnnotations(doc) : [];
  const plans = notes.filter((n) => n.kind === "planned" && n.from.slice(0, 7) === month.month);

  function itemActions(item: BudgetItem): void {
    if (!doc) return;
    if (item.kind === "refund") {
      const id = item.ref.replace(/^refund:/, "");
      Alert.alert("Remove this refund?", item.description, [
        { text: "Cancel", style: "cancel" },
        { text: "Remove", style: "destructive", onPress: () => void actions.removeNote(id).then(() => toast.success("Refund removed")) },
      ]);
      return;
    }
    const exclusion = notes.find((n) => n.kind === "exclude" && n.ref === item.ref);
    const link = notes.find((n) => n.kind === "link" && n.ref === item.ref);
    const options: { label: string; run: () => Promise<unknown>; done: string; destructive?: boolean }[] = [];
    if (exclusion) {
      options.push({ label: "Count in Budget", run: () => actions.removeNote(exclusion.id), done: "Counted again" });
    } else {
      options.push({
        label: "Don’t Count in Budget",
        run: () => actions.addNote({ kind: "exclude", ref: item.ref }),
        done: "Not counted",
      });
      if (link) options.push({ label: "Count in Weekly Allowance", run: () => actions.removeNote(link.id), done: "Moved to this week" });
      for (const fixed of live.config.fixedCosts) {
        if (item.bucket.kind === "fixed" && item.bucket.id === fixed.id) continue;
        options.push({
          label: `Count Toward ${fixed.name}`,
          run: () => actions.addNote({ kind: "link", ref: item.ref, target: `fixed:${fixed.id}` }),
          done: `Counted toward ${fixed.name}`,
        });
      }
      for (const plan of plans) {
        if (plan.kind !== "planned" || (item.bucket.kind === "planned" && item.bucket.id === plan.id)) continue;
        options.push({
          label: `Count Toward ${plan.name}`,
          run: () => actions.addNote({ kind: "link", ref: item.ref, target: `planned:${plan.id}` }),
          done: `Counted toward ${plan.name}`,
        });
      }
      options.push({ label: "Record a Refund", run: () => promptRefund(item), done: "" });
    }
    const labels = [...options.map((o) => o.label), "Cancel"];
    ActionSheetIOS.showActionSheetWithOptions(
      { title: item.description, message: itemSub(item), options: labels, cancelButtonIndex: labels.length - 1 },
      (index) => {
        const option = options[index];
        if (!option) return;
        option.run().then(
          () => option.done && toast.success(option.done),
          (e: unknown) => toast.error(e instanceof Error ? e.message : "That didn't save."),
        );
      },
    );
  }

  function promptRefund(item: BudgetItem): Promise<void> {
    return new Promise((resolve) => {
      Alert.prompt(
        "How much came back?",
        `Refund for ${item.description}. It counts as money back today.`,
        [
          { text: "Cancel", style: "cancel", onPress: () => resolve() },
          {
            text: "Save",
            onPress: (value?: string) => {
              const amount = parseAmountInput(value ?? "", currency);
              if (!amount || amount <= 0) {
                toast.error("Enter an amount greater than zero.");
                resolve();
                return;
              }
              void actions
                .addNote({
                  kind: "refund",
                  date: live.today,
                  amountMinor: amount,
                  category: item.category,
                  note: `Refund: ${item.description}`.slice(0, 120),
                  ref: item.ref.startsWith("refund:") ? null : item.ref,
                })
                .then(
                  () => toast.success(`${fmt(amount)} refund recorded`),
                  (e: unknown) => toast.error(e instanceof Error ? e.message : "That didn't save."),
                )
                .finally(resolve);
            },
          },
        ],
        "plain-text",
        "",
        "decimal-pad",
      );
    });
  }

  return (
    <>
      {header}
      <ScrollView style={styles.screen} contentContainerStyle={styles.content} contentInsetAdjustmentBehavior="automatic">
        <View style={styles.hero} accessible accessibilityLabel={`Safe to spend today: ${fmt(live.safeTodayMinor)}`}>
          <Text style={styles.heroLabel}>Safe to spend today</Text>
          <Text style={styles.heroValue} adjustsFontSizeToFit numberOfLines={1} maxFontSizeMultiplier={1.4}>
            {fmt(live.safeTodayMinor)}
          </Text>
          <Text style={styles.heroMeta}>
            {live.spentTodayMinor > 0 ? `${fmt(live.spentTodayMinor)} spent today · ` : ""}
            {live.daysLeftInWeek === 0 ? "Last day of this week" : `${live.daysLeftInWeek + 1} days left this week`}
          </Text>
        </View>

        <View style={styles.pair}>
          <View style={styles.pairCard} accessible accessibilityLabel={`${live.overWeekMinor > 0 ? "Over this week" : "Left this week"}: ${fmt(live.overWeekMinor > 0 ? live.overWeekMinor : live.availableWeekMinor)}`}>
            <Text style={styles.pairLabel}>{live.overWeekMinor > 0 ? "Over this week" : "Left this week"}</Text>
            <Text style={[styles.pairValue, live.overWeekMinor > 0 && styles.danger]} adjustsFontSizeToFit numberOfLines={1}>
              {fmt(live.overWeekMinor > 0 ? live.overWeekMinor : live.availableWeekMinor)}
            </Text>
          </View>
          <View style={styles.pairCard} accessible accessibilityLabel={`Left this month: ${fmt(live.availableMonthMinor)}`}>
            <Text style={styles.pairLabel}>Left this month</Text>
            <Text style={styles.pairValue} adjustsFontSizeToFit numberOfLines={1}>
              {fmt(live.availableMonthMinor)}
            </Text>
          </View>
        </View>

        {(warnings.length > 0 || view.pendingGroupChanges > 0 || store.syncStatus === "unavailable") && (
          <View style={styles.notices}>
            {warnings.map((w) => (
              <View key={w.kind} style={[styles.notice, (w.kind === "over_month" || w.kind === "over_week") && styles.noticeDanger]}>
                <Ionicons name="alert-circle-outline" size={18} color={colors.warningDark} />
                <Text style={styles.noticeText}>{warningCopy(w, currency)}</Text>
              </View>
            ))}
            {view.pendingGroupChanges > 0 && (
              <View style={styles.notice}>
                <Ionicons name="cloud-offline-outline" size={18} color={colors.warningDark} />
                <Text style={styles.noticeText}>
                  {view.pendingGroupChanges} group {view.pendingGroupChanges === 1 ? "change isn’t" : "changes aren’t"} counted until {view.pendingGroupChanges === 1 ? "it syncs" : "they sync"}.
                </Text>
              </View>
            )}
            {store.syncStatus === "unavailable" && (
              <View style={styles.notice}>
                <Ionicons name="phone-portrait-outline" size={18} color={colors.warningDark} />
                <Text style={styles.noticeText}>Your budget is saved on this iPhone. Backup to your account isn’t available yet.</Text>
              </View>
            )}
          </View>
        )}

        <Section title={`This week · ${dateRange(live.segment.start, live.segment.end)}`}>
          <Bar value={live.spentWeekMinor} total={live.segment.allowanceMinor} over={live.overWeekMinor > 0} />
          <Text style={styles.barMeta}>
            {fmt(live.spentWeekMinor)} of {fmt(live.segment.allowanceMinor)} spent
          </Text>
          <Text style={styles.subhead}>Why this amount</Text>
          {explanation.map((line, i) => {
            const copy = explainLineCopy(line, currency);
            return <Row key={i} label={copy.label} value={copy.value} detail={copy.detail} strong={line.kind === "allowance"} />;
          })}
        </Section>

        <Section title={monthLabel(month.month)}>
          <Bar value={month.spentMinor} total={month.effectiveLimitMinor} over={month.spentMinor > month.effectiveLimitMinor} />
          <Row label="Monthly limit" value={fmt(month.limitMinor)} />
          {month.openingMinor < 0 && <Row label="Carried from last month" value={`−${fmt(-month.openingMinor)}`} tone="danger" />}
          <Row label="Spent" value={fmt(month.spentMinor)} />
          <Row label="Set aside" value={fmt(live.reservedMinor)} detail="Fixed costs and planned spending not paid yet" />
          <Row label="Free to spend" value={fmt(live.availableMonthMinor)} strong />
          <Row
            label="Month end at this pace"
            value={fmt(live.projectedMonthMinor)}
            detail={live.onTrack ? "On track" : "Above your limit"}
            tone={live.onTrack ? "good" : "danger"}
          />
        </Section>

        <Section
          title="Set aside"
          action={
            <TouchableOpacity onPress={() => router.push(ROUTES.budgetPlan)} accessibilityRole="button" hitSlop={8}>
              <Text style={styles.link}>Plan Spending</Text>
            </TouchableOpacity>
          }
        >
          {reservations.length === 0 ? (
            <Text style={styles.empty}>
              Nothing set aside. Add fixed costs like rent in Edit, or plan a purchase or trip so it doesn’t eat into your weekly allowance.
            </Text>
          ) : (
            reservations.map((r) => (
              <Row key={`${r.kind}:${r.id}`} label={reservationLabel(r)} value={fmt(r.reservedMinor)} detail={reservationDetail(r, currency)} />
            ))
          )}
        </Section>

        {month.byCategory.length > 0 && (
          <Section title="By category">
            {month.byCategory
              .slice()
              .sort((a, b) => b.spentMinor - a.spentMinor)
              .map((c) => {
                const meta = categoryMeta(c.category);
                const over = c.limitMinor !== null && c.spentMinor > c.limitMinor;
                return (
                  <View key={c.category} style={styles.category}>
                    <Row
                      label={meta.label}
                      value={c.limitMinor !== null ? `${fmt(c.spentMinor)} of ${fmt(c.limitMinor)}` : fmt(c.spentMinor)}
                      tone={over ? "danger" : undefined}
                    />
                    {c.limitMinor !== null && <Bar value={c.spentMinor} total={c.limitMinor} over={over} />}
                  </View>
                );
              })}
          </Section>
        )}

        <Section title="Counted this month">
          {monthItems.length === 0 ? (
            <Text style={styles.empty}>Expenses you add, and your share of group expenses, show up here.</Text>
          ) : (
            monthItems.map((item) => (
              <TouchableOpacity
                key={item.ref}
                style={[styles.item, stacked && styles.rowStacked]}
                onPress={() => itemActions(item)}
                accessibilityRole="button"
                accessibilityHint="Choose how this counts in your budget"
                accessibilityLabel={`${item.description}, ${item.status === "counted" ? fmt(item.amountMinor) : "not counted"}, ${itemSub(item)}`}
              >
                <View style={styles.rowText}>
                  <Text style={styles.rowLabel} numberOfLines={1}>
                    {item.description}
                  </Text>
                  <Text style={styles.rowDetail} numberOfLines={2}>
                    {itemSub(item)}
                  </Text>
                </View>
                <Text style={[styles.rowValue, stacked && styles.rowValueStacked, item.status !== "counted" && styles.muted, item.amountMinor < 0 && styles.good]}>
                  {item.status === "counted" ? (item.amountMinor < 0 ? `−${fmt(-item.amountMinor)}` : fmt(item.amountMinor)) : fmt(0)}
                </Text>
              </TouchableOpacity>
            ))
          )}
          {view.sharesLoading && <Text style={styles.empty}>Loading your group expenses…</Text>}
          {view.sharesError && <Text style={styles.empty}>Group expenses couldn’t load: {view.sharesError}</Text>}
        </Section>

        <View style={styles.footer}>
          <AppButton title="History" variant="secondary" onPress={() => router.push(ROUTES.budgetHistory)} style={styles.footerButton} />
          <AppButton title="Edit Budget" variant="secondary" onPress={() => router.push(ROUTES.budgetSetup)} style={styles.footerButton} />
        </View>
        <Text style={styles.footnote}>
          Your share of group expenses counts, not what you paid for others. Paying friends back doesn’t count as spending.
        </Text>
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.base, paddingBottom: spacing["3xl"], gap: spacing.base },
  headerButton: { fontSize: fontSize.lg, color: colors.primary, fontWeight: fontWeight.semibold },
  hero: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.xs,
  },
  heroLabel: { fontSize: fontSize.base, color: colors.gray600, fontWeight: fontWeight.semibold },
  heroValue: { fontSize: 40, fontWeight: fontWeight.bold, color: colors.gray900, fontVariant: ["tabular-nums"] },
  heroMeta: { fontSize: fontSize.sm, color: colors.gray500 },
  pair: { flexDirection: "row", gap: spacing.sm, flexWrap: "wrap" },
  pairCard: {
    flex: 1,
    minWidth: 150,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: 2,
  },
  pairLabel: { fontSize: fontSize.sm, color: colors.gray500 },
  pairValue: { fontSize: fontSize.xl, fontWeight: fontWeight.bold, color: colors.gray900, fontVariant: ["tabular-nums"] },
  notices: { gap: spacing.sm },
  notice: {
    flexDirection: "row",
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: borderRadius.md,
    backgroundColor: colors.warningLight,
    alignItems: "flex-start",
  },
  noticeDanger: { backgroundColor: colors.dangerLight },
  noticeText: { flex: 1, fontSize: fontSize.base, lineHeight: 20, color: colors.gray800 },
  section: { gap: spacing.sm },
  sectionHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  sectionTitle: { fontSize: fontSize.lg, fontWeight: fontWeight.bold, color: colors.gray900, flexShrink: 1 },
  link: { fontSize: fontSize.base, fontWeight: fontWeight.semibold, color: colors.primary },
  card: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.base,
    gap: spacing.sm,
  },
  subhead: { fontSize: fontSize.sm, fontWeight: fontWeight.semibold, color: colors.gray500, marginTop: spacing.sm, textTransform: "uppercase" },
  row: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: spacing.md, minHeight: 24 },
  rowStacked: { flexDirection: "column", alignItems: "stretch", gap: 2 },
  rowValueStacked: { textAlign: "left" },
  rowText: { flex: 1, gap: 2 },
  rowLabel: { fontSize: fontSize.md, color: colors.gray800 },
  rowDetail: { fontSize: fontSize.sm, color: colors.gray500, lineHeight: 17 },
  rowValue: { fontSize: fontSize.md, color: colors.gray900, fontVariant: ["tabular-nums"], textAlign: "right" },
  strong: { fontWeight: fontWeight.bold },
  danger: { color: colors.danger },
  good: { color: colors.success },
  muted: { color: colors.gray500 },
  track: { height: 8, borderRadius: 4, backgroundColor: colors.gray100, overflow: "hidden" },
  fill: { height: 8, borderRadius: 4, backgroundColor: colors.primary },
  fillOver: { backgroundColor: colors.danger },
  barMeta: { fontSize: fontSize.sm, color: colors.gray500, fontVariant: ["tabular-nums"] },
  category: { gap: spacing.xs },
  item: { flexDirection: "row", alignItems: "center", gap: spacing.md, minHeight: 44, paddingVertical: spacing.xs },
  loading: { padding: spacing.base },
  empty: { fontSize: fontSize.base, lineHeight: 20, color: colors.gray500 },
  footer: { flexDirection: "row", gap: spacing.sm, flexWrap: "wrap" },
  footerButton: { flex: 1, minWidth: 150 },
  footnote: { fontSize: fontSize.sm, lineHeight: 18, color: colors.gray500, textAlign: "center" },
});
