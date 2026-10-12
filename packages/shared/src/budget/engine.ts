import { CATEGORY_SLUGS, type CategorySlug } from "../utils/category";
import { attributeSpending } from "./attribute";
import {
  addDays,
  daysBetween,
  daysInMonth,
  dayOfWeek,
  eachDay,
  monthEnd,
  monthOf,
  monthStart,
  monthsBetween,
  segmentsOfMonth,
  type ISODate,
  type MonthKey,
  type Segment,
} from "./dates";
import { addMinor, allocateByWeights, ceilDiv, mulDivFloor, sumMinor } from "./money";
import { budgetCurrency, liveAnnotations, monthVersion, segmentContaining, versionAt, weekStartsOnFor } from "./plan";
import type {
  BudgetConfig,
  BudgetDocument,
  BudgetItem,
  BudgetLive,
  BudgetState,
  BudgetWarning,
  MonthResult,
  Reservation,
  SegmentResult,
  SpendSource,
} from "./types";

// ---------------------------------------------------------------------------
// The adaptive weekly budget, computed from scratch every time from the
// document (settings + notes), the transactions and today's date.
//
// The weekly ledger is a signed carry: carry(k) = carry(k−1) + base(k) +
// reallocation(k) − spent(k). Positive carry is unspent allowance, negative is
// overspending. It uses the base, never the displayed allowance, so an
// allowance shown as 0 or cut by the monthly limit can neither erase a deficit
// nor create money. Each week's allowance is base + surplus − repayment, where
// repayment is the whole deficit (full rollover) or an installment of it
// (smoothed recovery), and the shown allowance never exceeds what the monthly
// limit still allows. See docs/budgeting/IMPLEMENTATION_PLAN.md §4.
// ---------------------------------------------------------------------------

export type BudgetInput = {
  doc: BudgetDocument | null;
  today: ISODate;
  sources: readonly SpendSource[];
  /** False when group shares could not all be loaded (figures may be low). */
  sharesComplete?: boolean;
};

/** Each weekday's share of the weekly target (index 0 = Sunday); always sums to the target. */
export function dayAllocations(config: BudgetConfig): number[] {
  const weights = config.dayWeights ?? [1, 1, 1, 1, 1, 1, 1];
  // Allocate in week order so leftover minor units go to the first days of the week.
  const order = Array.from({ length: 7 }, (_, i) => (config.weekStartsOn + i) % 7);
  const parts = allocateByWeights(
    config.weeklyTargetMinor,
    order.map((day) => weights[day] ?? 0),
  );
  const byDay = new Array<number>(7).fill(0);
  order.forEach((day, i) => {
    byDay[day] = parts[i] ?? 0;
  });
  return byDay;
}

function baseOf(segment: Pick<Segment, "start" | "end">, config: BudgetConfig): number {
  const perDay = dayAllocations(config);
  return sumMinor(eachDay(segment.start, segment.end).map((day) => perDay[dayOfWeek(day)] ?? 0));
}

function dueDate(month: MonthKey, dueDay: number | null): ISODate | null {
  if (dueDay === null) return null;
  return `${month}-${String(Math.min(dueDay, daysInMonth(month))).padStart(2, "0")}`;
}

type MonthContext = {
  month: MonthKey;
  config: BudgetConfig;
  /** Counted items of the month, including any dated after today. */
  items: BudgetItem[];
  today: ISODate;
};

function sumWhere(items: readonly BudgetItem[], keep: (item: BudgetItem) => boolean): number {
  return sumMinor(items.filter(keep).map((item) => item.amountMinor));
}

/**
 * Money spoken for in a month: unmatched fixed costs and planned spending, the
 * unspent part of limits on categories outside the weekly budget, and
 * expenses already recorded for later dates. `asOf` limits matching to items
 * dated before it (for the capacity a past week started with).
 */
function reservationsOf(ctx: MonthContext, doc: BudgetDocument, asOf: ISODate | null): Reservation[] {
  const seen = asOf === null ? ctx.items : ctx.items.filter((item) => item.date < asOf && item.date <= ctx.today);
  const out: Reservation[] = [];
  for (const fixed of ctx.config.fixedCosts) {
    const matched = sumWhere(seen, (i) => i.bucket.kind === "fixed" && i.bucket.id === fixed.id);
    out.push({
      kind: "fixed",
      id: fixed.id,
      name: fixed.name,
      amountMinor: fixed.amountMinor,
      matchedMinor: matched,
      reservedMinor: Math.max(0, fixed.amountMinor - matched),
      date: dueDate(ctx.month, fixed.dueDay),
    });
  }
  for (const plan of liveAnnotations(doc)) {
    if (plan.kind !== "planned" || monthOf(plan.from) !== ctx.month) continue;
    const matched = sumWhere(seen, (i) => i.bucket.kind === "planned" && i.bucket.id === plan.id);
    out.push({
      kind: "planned",
      id: plan.id,
      name: plan.name,
      amountMinor: plan.amountMinor,
      matchedMinor: matched,
      reservedMinor: Math.max(0, plan.amountMinor - matched),
      date: plan.from,
    });
  }
  for (const limit of ctx.config.categoryLimits) {
    if (!ctx.config.outsideWeekly.includes(limit.category)) continue;
    const matched = sumWhere(seen, (i) => i.bucket.kind === "outside" && i.category === limit.category);
    out.push({
      kind: "category",
      id: limit.category,
      name: limit.category,
      amountMinor: limit.limitMinor,
      matchedMinor: matched,
      reservedMinor: Math.max(0, limit.limitMinor - matched),
      date: null,
    });
  }
  if (asOf === null) {
    // Recorded for a later date this month: spoken for, not yet spent.
    for (const item of ctx.items) {
      if (item.date <= ctx.today || item.amountMinor <= 0) continue;
      out.push({
        kind: "scheduled",
        id: item.ref,
        name: item.description,
        amountMinor: item.amountMinor,
        matchedMinor: 0,
        reservedMinor: item.amountMinor,
        date: item.date,
      });
    }
  }
  return out;
}

function reservedTotal(reservations: readonly Reservation[]): number {
  return sumMinor(reservations.map((r) => r.reservedMinor));
}

export function computeBudget(input: BudgetInput): BudgetState {
  const { doc, today } = input;
  if (!doc || doc.deletedAt) return { status: "off" };
  if (today < doc.startDate) {
    return { status: "not_started", startDate: doc.startDate, config: versionAt(doc, doc.startDate).config };
  }

  const currency = budgetCurrency(doc);
  const startMonth = monthOf(doc.startDate);
  const currentMonth = monthOf(today);
  const items = attributeSpending(doc, input.sources, monthStart(startMonth), monthEnd(currentMonth), currency);
  const counted = items.filter((item) => item.status === "counted");
  const ledgerStart = segmentContaining(doc, doc.startDate).start;

  const reallocations = new Map<ISODate, number>();
  for (const a of liveAnnotations(doc)) {
    if (a.kind !== "reallocation") continue;
    for (const d of a.deltas) reallocations.set(d.segmentStart, addMinor(reallocations.get(d.segmentStart) ?? 0, d.deltaMinor));
  }

  const months: MonthResult[] = [];
  let opening = 0;
  let live: BudgetLive | null = null;
  let shortfall = 0;
  let plannedThisMonth = 0;
  let limitThisMonth = 0;

  for (const month of monthsBetween(startMonth, currentMonth)) {
    const isCurrent = month === currentMonth;
    const config = monthVersion(doc, month, today).config;
    const limit = config.monthlyLimitMinor;
    const effectiveLimit = limit + opening;
    const monthItems = counted.filter((item) => monthOf(item.date) === month);
    const ctx: MonthContext = { month, config, items: monthItems, today };
    const spentByDate = (before: ISODate): number => sumWhere(monthItems, (i) => i.date < before && i.date <= today);
    const spentAll = sumWhere(monthItems, (i) => i.date <= today);
    const weeklyUpToToday = monthItems.filter((i) => i.bucket.kind === "weekly" && i.date <= today);

    const segments = segmentsOfMonth(month, weekStartsOnFor(doc, month)).filter((s) => s.end >= ledgerStart);
    const results: SegmentResult[] = [];
    let carry = opening;
    let actualCarry = opening;
    let windowLeft = 0;
    let resetRecovery = opening < 0;

    segments.forEach((segment, index) => {
      const version = versionAt(doc, segment.start);
      const cfg = version.config;
      const state: SegmentResult["state"] = segment.end < today ? "past" : segment.start > today ? "future" : "current";
      const base = baseOf(segment, cfg);
      const reallocation = reallocations.get(segment.start) ?? 0;
      const deficit = Math.max(0, -carry);
      const surplus = Math.max(0, carry);
      let repayment = 0;
      if (deficit === 0) {
        windowLeft = 0;
      } else if (cfg.recovery.mode === "full") {
        repayment = deficit;
        windowLeft = 1;
      } else {
        if (resetRecovery || windowLeft <= 0) windowLeft = cfg.recovery.weeks;
        const spread = Math.max(1, Math.min(windowLeft, segments.length - index));
        repayment = Math.min(deficit, ceilDiv(deficit, spread));
      }
      const theoretical = base + reallocation + surplus - repayment;
      const capacityAtStart =
        effectiveLimit - spentByDate(segment.start) - reservedTotal(reservationsOf(ctx, doc, segment.start));
      const allowance = Math.min(Math.max(0, theoretical), Math.max(0, capacityAtStart));
      const spent = sumWhere(weeklyUpToToday, (i) => i.date >= segment.start && i.date <= segment.end);
      // Upcoming weeks assume this week's allowance gets spent: the forecast shows the plan, not a windfall.
      const assumed = state === "future" ? Math.max(0, theoretical) : state === "current" ? Math.max(spent, Math.max(0, theoretical)) : spent;
      const carryOut = carry + base + reallocation - assumed;
      results.push({
        start: segment.start,
        end: segment.end,
        days: segment.days,
        baseMinor: base,
        reallocationMinor: reallocation,
        carryInMinor: carry,
        surplusMinor: surplus,
        repaymentMinor: repayment,
        recoveryWeeksLeft: deficit > 0 && cfg.recovery.mode === "smoothed" ? Math.min(windowLeft, segments.length - index) : deficit > 0 ? 1 : 0,
        theoreticalMinor: theoretical,
        capacityAtStartMinor: capacityAtStart,
        allowanceMinor: allowance,
        spentMinor: state === "future" ? 0 : spent,
        carryOutMinor: state === "past" ? carry + base + reallocation - spent : carryOut,
        state,
        planId: version.id,
      });
      if (state !== "future") actualCarry = carry + base + reallocation - spent;
      resetRecovery = assumed > Math.max(0, theoretical);
      windowLeft = Math.max(0, windowLeft - 1);
      carry = state === "past" ? carry + base + reallocation - spent : carryOut;
    });

    const overrun = Math.max(0, spentAll - effectiveLimit);
    const planned =
      sumMinor(results.map((s) => s.baseMinor)) +
      sumMinor(config.fixedCosts.map((f) => f.amountMinor)) +
      sumMinor(config.categoryLimits.filter((l) => config.outsideWeekly.includes(l.category)).map((l) => l.limitMinor)) +
      sumMinor(
        liveAnnotations(doc).flatMap((a) => (a.kind === "planned" && monthOf(a.from) === month ? [a.amountMinor] : [])),
      );
    const byCategory = CATEGORY_SLUGS.map((category: CategorySlug) => ({
      category,
      spentMinor: sumWhere(monthItems, (i) => i.category === category && i.date <= today),
      limitMinor: config.categoryLimits.find((l) => l.category === category)?.limitMinor ?? null,
    })).filter((row) => row.spentMinor !== 0 || row.limitMinor !== null);

    months.push({
      month,
      limitMinor: limit,
      openingMinor: opening,
      effectiveLimitMinor: effectiveLimit,
      spentMinor: spentAll,
      weeklySpentMinor: sumWhere(weeklyUpToToday, () => true),
      overrunMinor: overrun,
      closingCarryMinor: actualCarry,
      monthEnd: config.monthEnd,
      segments: results,
      plannedMinor: planned,
      state: isCurrent ? "current" : "past",
      byCategory,
    });

    if (isCurrent) {
      const segment = results.find((s) => s.state === "current");
      if (!segment) throw new Error("No current week in the budget.");
      const cfg = versionAt(doc, segment.start).config;
      const reservations = reservationsOf(ctx, doc, null);
      const reserved = reservedTotal(reservations);
      const capacity = effectiveLimit - spentAll - reserved;
      const weekItems = weeklyUpToToday.filter((i) => i.date >= segment.start && i.date <= segment.end);
      const spentWeek = sumWhere(weekItems, () => true);
      const spentToday = sumWhere(weekItems, (i) => i.date === today);
      const startOfDay = Math.max(0, segment.theoreticalMinor - (spentWeek - spentToday));
      const perDay = dayAllocations(cfg);
      const daysLeft = eachDay(today, segment.end);
      const weightLeft = sumMinor(daysLeft.map((d) => perDay[dayOfWeek(d)] ?? 0));
      const todayShare =
        today === segment.end
          ? startOfDay
          : weightLeft === 0
            ? Math.floor(startOfDay / daysLeft.length)
            : mulDivFloor(startOfDay, perDay[dayOfWeek(today)] ?? 0, weightLeft);
      const dayOfMonth = Number(today.slice(8, 10));
      const daysLeftInMonth = daysInMonth(month) - dayOfMonth;
      const flexibleSoFar = Math.max(0, sumWhere(weeklyUpToToday, () => true));
      const projected = spentAll + reserved + mulDivFloor(flexibleSoFar, daysLeftInMonth, dayOfMonth);
      live = {
        today,
        segment,
        config: cfg,
        safeTodayMinor: Math.max(0, Math.min(todayShare - spentToday, capacity)),
        availableWeekMinor: Math.max(0, Math.min(segment.theoreticalMinor - spentWeek, capacity)),
        spentWeekMinor: spentWeek,
        spentTodayMinor: spentToday,
        overWeekMinor: Math.max(0, spentWeek - Math.max(0, segment.theoreticalMinor)),
        remainingMonthMinor: effectiveLimit - spentAll,
        reservedMinor: reserved,
        availableMonthMinor: Math.max(0, capacity),
        projectedMonthMinor: projected,
        onTrack: projected <= effectiveLimit,
        reservations,
        daysLeftInWeek: daysBetween(today, segment.end),
        daysLeftInMonth,
      };
      const last = results.at(-1);
      shortfall = last ? Math.max(0, -last.carryOutMinor) : 0;
      limitThisMonth = limit;
      plannedThisMonth = planned;
    }

    opening = config.monthEnd === "carry_overspend" && overrun > 0 ? -overrun : 0;
  }

  if (!live) throw new Error("The budget has no current month.");
  const current: BudgetLive = live;
  const warnings: BudgetWarning[] = [];
  const currentMonthResult = months.at(-1)!;
  if (current.overWeekMinor > 0) warnings.push({ kind: "over_week", amountMinor: current.overWeekMinor });
  if (currentMonthResult.overrunMinor > 0) {
    warnings.push({ kind: "over_month", amountMinor: currentMonthResult.overrunMinor });
  } else if (!current.onTrack) {
    warnings.push({ kind: "month_at_risk", projectedMinor: current.projectedMonthMinor });
  }
  if (plannedThisMonth > limitThisMonth) {
    warnings.push({ kind: "plan_exceeds_limit", plannedMinor: plannedThisMonth, limitMinor: limitThisMonth });
  }
  if (shortfall > 0) warnings.push({ kind: "recovery_shortfall", amountMinor: shortfall });
  const uncounted = items.filter((i) => i.status === "no_rate" || i.status === "out_of_range").length;
  if (uncounted > 0) warnings.push({ kind: "uncounted", count: uncounted });
  if (input.sharesComplete === false) warnings.push({ kind: "shares_incomplete" });

  return {
    status: "active",
    currency,
    months,
    live: current,
    items,
    warnings,
    savedMinor: sumMinor(months.filter((m) => m.state === "past").map((m) => Math.max(0, m.closingCarryMinor))),
  };
}

/** The first day of the week after the current one (for "next week" answers). */
export function nextSegmentStart(state: Extract<BudgetState, { status: "active" }>): ISODate {
  return addDays(state.live.segment.end, 1);
}
