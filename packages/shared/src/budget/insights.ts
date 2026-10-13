import { CATEGORY_SLUGS } from "../utils/category";
import type { CurrencyCode } from "../utils/currency";
import { addDays, dayOfWeek, eachDay, weekStart, type ISODate } from "./dates";
import { computeBudget, dayAllocations, type BudgetInput } from "./engine";
import { allocateByWeights, mulDivFloor, roundDownFriendly, sumMinor } from "./money";
import { createBudgetDocument, withConfigChange } from "./plan";
import type { BudgetConfig, BudgetDocument, BudgetState, SegmentResult, SpendSource } from "./types";
import { nameMatches } from "./attribute";

// ---------------------------------------------------------------------------
// Suggestions, previews and answers built on the engine. Everything here is
// deterministic and computed from the person's own data; the Assistant and
// the setup screen show these numbers, they never make them up.
// ---------------------------------------------------------------------------

export type ActiveBudget = Extract<BudgetState, { status: "active" }>;

/** Preview versions sort after every real one, so they always govern their week. */
const PREVIEW_NOW = "9999-12-31T00:00:00.000Z";

const PREVIEW_IDS = {
  doc: "00000000-0000-4000-8000-000000000001",
  plan: "00000000-0000-4000-8000-000000000002",
};

/** Weeks of the 31-day month a weekly allowance has to fit into. */
const LONGEST_MONTH_DAYS = 31;

export type WeeklySuggestion = {
  weeklyMinor: number;
  /** The largest weekly allowance that fits the limit (after fixed costs) in a 31-day month. */
  maxWeeklyMinor: number;
  basis: "history" | "limit";
  averageWeeklyMinor: number | null;
  weeksOfHistory: number;
};

/** Complete weeks (by `weekStartsOn`) before the current one, newest last, at most `count`. */
function completeWeeks(today: ISODate, weekStartsOn: number, count: number): { start: ISODate; end: ISODate }[] {
  const current = weekStart(today, weekStartsOn);
  return Array.from({ length: count }, (_, i) => {
    const start = addDays(current, -7 * (count - i));
    return { start, end: addDays(start, 6) };
  });
}

function historyWindow(
  sources: readonly SpendSource[],
  currency: CurrencyCode,
  today: ISODate,
  weekStartsOn: number,
  fixedNames: readonly string[],
): { weeks: { start: ISODate; end: ISODate }[]; flexible: SpendSource[] } {
  const relevant = sources.filter(
    (s) => s.currency === currency && s.amountMinor > 0 && !fixedNames.some((name) => nameMatches(s.description, name)),
  );
  const earliest = relevant.reduce<ISODate | null>((min, s) => (min === null || s.date < min ? s.date : min), null);
  const weeks = earliest ? completeWeeks(today, weekStartsOn, 8).filter((w) => w.start >= weekStart(earliest, weekStartsOn)) : [];
  const first = weeks[0];
  const last = weeks.at(-1);
  const flexible = first && last ? relevant.filter((s) => s.date >= first.start && s.date <= last.end) : [];
  return { weeks, flexible };
}

export function suggestWeeklyTarget(params: {
  monthlyLimitMinor: number;
  fixedCostsMinor: number;
  currency: CurrencyCode;
  sources: readonly SpendSource[];
  today: ISODate;
  weekStartsOn: number;
  fixedNames?: readonly string[];
}): WeeklySuggestion {
  const room = Math.max(0, params.monthlyLimitMinor - params.fixedCostsMinor);
  const maxWeekly = mulDivFloor(room, 7, LONGEST_MONTH_DAYS);
  const { weeks, flexible } = historyWindow(params.sources, params.currency, params.today, params.weekStartsOn, params.fixedNames ?? []);
  if (weeks.length >= 3) {
    const average = Math.floor(sumMinor(flexible.map((s) => s.amountMinor)) / weeks.length);
    const friendly = Math.max(roundDownFriendly(average, params.currency), average > 0 ? 1 : 0);
    return {
      weeklyMinor: Math.min(friendly, roundDownFriendly(maxWeekly, params.currency) || maxWeekly),
      maxWeeklyMinor: maxWeekly,
      basis: "history",
      averageWeeklyMinor: average,
      weeksOfHistory: weeks.length,
    };
  }
  return {
    weeklyMinor: roundDownFriendly(maxWeekly, params.currency) || maxWeekly,
    maxWeeklyMinor: maxWeekly,
    basis: "limit",
    averageWeeklyMinor: null,
    weeksOfHistory: weeks.length,
  };
}

/** Weekday weights that follow how the person has spent (≥ 3 complete weeks), else null. */
export function suggestDayWeights(
  sources: readonly SpendSource[],
  currency: CurrencyCode,
  today: ISODate,
  weekStartsOn: number,
): number[] | null {
  const { weeks, flexible } = historyWindow(sources, currency, today, weekStartsOn, []);
  if (weeks.length < 3) return null;
  const totals = new Array<number>(7).fill(0);
  for (const s of flexible) totals[dayOfWeek(s.date)] = (totals[dayOfWeek(s.date)] ?? 0) + s.amountMinor;
  if (totals.every((t) => t === 0)) return null;
  // Every day keeps some allowance: a day with no history still gets a little.
  return allocateByWeights(70, totals).map((w) => Math.max(1, w));
}

/** "More on weekends": Friday to Sunday get half again as much. */
export const WEEKEND_WEIGHTS = [3, 2, 2, 2, 2, 3, 3];

export type BudgetPreview = {
  state: BudgetState;
  /** This week and the rest of the month's weeks. */
  weeks: { start: ISODate; end: ISODate; allowanceMinor: number; baseMinor: number }[];
  plannedMonthMinor: number;
  fitsLimit: boolean;
};

function previewFrom(state: BudgetState): BudgetPreview {
  if (state.status !== "active") {
    return { state, weeks: [], plannedMonthMinor: 0, fitsLimit: true };
  }
  const month = state.months.at(-1)!;
  const weeks = month.segments
    .filter((s) => s.state !== "past")
    .map((s) => ({ start: s.start, end: s.end, allowanceMinor: s.allowanceMinor, baseMinor: s.baseMinor }));
  return { state, weeks, plannedMonthMinor: month.plannedMinor, fitsLimit: month.plannedMinor <= month.limitMinor };
}

/** What a new budget with `config` would look like today, without saving anything. */
export function previewNewBudget(config: BudgetConfig, sources: readonly SpendSource[], today: ISODate, startDate: ISODate = today): BudgetPreview {
  const doc = createBudgetDocument({
    id: PREVIEW_IDS.doc,
    config,
    startDate,
    meta: { planId: PREVIEW_IDS.plan, now: `${today}T00:00:00.000Z`, source: "setup", summary: "Preview" },
  });
  return previewFrom(computeBudget({ doc, today, sources }));
}

/** The same budget with `config` from this week on, without saving anything. */
export function previewChange(
  doc: BudgetDocument,
  config: BudgetConfig,
  sources: readonly SpendSource[],
  today: ISODate,
  effectiveFrom?: ISODate,
): BudgetPreview {
  const changed = withConfigChange(doc, config, today, {
    planId: PREVIEW_IDS.plan,
    now: PREVIEW_NOW,
    source: "manual",
    summary: "Preview",
    ...(effectiveFrom ? { effectiveFrom } : {}),
  });
  return previewFrom(computeBudget({ doc: changed, today, sources }));
}

// ---------------------------------------------------------------------------
// Affordability
// ---------------------------------------------------------------------------

export type AffordScope = "today" | "weekend" | "week" | "month";

export type Affordability = {
  amountMinor: number;
  scope: AffordScope;
  /**
   * fits: within what the scope has left. fits_week: more than today's or the
   * weekend's share, but the week still covers it (other days get less).
   * over_week: within the month but over this week (next week shrinks).
   * over_month: more than the month has left after reservations.
   */
  verdict: "fits" | "fits_week" | "over_week" | "over_month";
  /** What the scope has left now: today's or the weekend days' share, the week, or the month. */
  availableMinor: number;
  availableWeekMinor: number;
  availableMonthMinor: number;
  /** Left in the scope after spending it (may be negative). */
  afterMinor: number;
  /** Next week's allowance if this is spent (null when this is the last week of the month). */
  nextWeekAfterMinor: number | null;
  nextWeekNowMinor: number | null;
  /** Weekend scope: the Saturday/Sunday dates still ahead this week. */
  days: ISODate[];
};

function nextWeek(state: ActiveBudget): SegmentResult | null {
  const month = state.months.at(-1)!;
  return month.segments.find((s) => s.start > state.live.segment.end) ?? null;
}

/** The part of what is left this week that belongs to `days`, by the daily weights. */
function shareOfDays(state: ActiveBudget, days: readonly ISODate[]): number {
  const live = state.live;
  const left = eachDay(live.today, live.segment.end);
  const perDay = dayAllocations(live.config);
  const weight = (d: ISODate): number => perDay[dayOfWeek(d)] ?? 0;
  const remaining = Math.max(0, live.segment.theoreticalMinor - live.spentWeekMinor);
  const inScope = days.filter((d) => left.includes(d));
  const total = sumMinor(left.map(weight));
  const part = sumMinor(inScope.map(weight));
  const share =
    total === 0 ? mulDivFloor(remaining, inScope.length, Math.max(1, left.length)) : mulDivFloor(remaining, part, total);
  return Math.min(share, live.availableWeekMinor);
}

export function affordability(input: BudgetInput, amountMinor: number, scope: AffordScope): Affordability | null {
  const state = computeBudget(input);
  if (state.status !== "active") return null;
  const live = state.live;
  const weekend = weekendDaysLeft(state);
  const available =
    scope === "today"
      ? live.safeTodayMinor
      : scope === "month"
        ? live.availableMonthMinor
        : scope === "weekend" && weekend.length > 0
          ? shareOfDays(state, weekend)
          : live.availableWeekMinor;
  // What-if: the same amount recorded today as weekly spending.
  const flexibleCategory = CATEGORY_SLUGS.find((c) => !live.config.outsideWeekly.includes(c)) ?? "other";
  const whatIf = computeBudget({
    ...input,
    sources: [
      ...input.sources,
      {
        ref: "personal:00000000-0000-4000-8000-0000000000ff",
        kind: "personal",
        description: "(what if)",
        amountMinor,
        currency: state.currency,
        category: flexibleCategory,
        date: live.today,
      },
    ],
  });
  const nextNow = nextWeek(state);
  const nextAfter = whatIf.status === "active" ? nextWeek(whatIf) : null;
  const verdict: Affordability["verdict"] =
    amountMinor <= available
      ? "fits"
      : scope !== "month" && amountMinor <= live.availableWeekMinor
        ? "fits_week"
        : amountMinor <= live.availableMonthMinor
          ? scope === "month"
            ? "fits"
            : "over_week"
          : "over_month";
  return {
    amountMinor,
    scope,
    verdict,
    availableMinor: available,
    availableWeekMinor: live.availableWeekMinor,
    availableMonthMinor: live.availableMonthMinor,
    afterMinor: available - amountMinor,
    nextWeekAfterMinor: nextAfter ? nextAfter.allowanceMinor : null,
    nextWeekNowMinor: nextNow ? nextNow.allowanceMinor : null,
    days: scope === "weekend" ? weekend : [],
  };
}

// ---------------------------------------------------------------------------
// Recovery
// ---------------------------------------------------------------------------

export type RecoveryOption = {
  recovery: BudgetConfig["recovery"];
  /** Allowances for the rest of the month's weeks under this option. */
  weeks: { start: ISODate; allowanceMinor: number }[];
  /** Deficit still unpaid at month end (0 when it fits). */
  shortfallMinor: number;
};

export type RecoveryPlan = {
  /** Overspending to make up: earlier weeks' deficit plus this week's overspend so far. */
  deficitMinor: number;
  current: BudgetConfig["recovery"];
  options: RecoveryOption[];
};

export function recoveryPlan(input: BudgetInput & { doc: BudgetDocument }): RecoveryPlan | null {
  const state = computeBudget(input);
  if (state.status !== "active") return null;
  const seg = state.live.segment;
  const deficit = Math.max(0, -(seg.carryInMinor + seg.baseMinor + seg.reallocationMinor - state.live.spentWeekMinor));
  const config = state.live.config;
  const options: RecoveryOption[] = [];
  const choices: BudgetConfig["recovery"][] = [{ mode: "full" }, { mode: "smoothed", weeks: 2 }, { mode: "smoothed", weeks: 3 }, { mode: "smoothed", weeks: 4 }];
  for (const recovery of choices) {
    const same = JSON.stringify(recovery) === JSON.stringify(config.recovery);
    const preview = same ? state : computeBudget({ ...input, doc: withConfigChange(input.doc, { ...config, recovery }, state.live.today, { planId: PREVIEW_IDS.plan, now: PREVIEW_NOW, source: "manual", summary: "Preview" }) });
    if (preview.status !== "active") continue;
    const segments = preview.months.at(-1)!.segments.filter((s) => s.state === "future");
    const last = preview.months.at(-1)!.segments.at(-1);
    options.push({
      recovery,
      weeks: segments.map((s) => ({ start: s.start, allowanceMinor: s.allowanceMinor })),
      shortfallMinor: last ? Math.max(0, -last.carryOutMinor) : 0,
    });
  }
  return { deficitMinor: deficit, current: config.recovery, options };
}

// ---------------------------------------------------------------------------
// Explanations
// ---------------------------------------------------------------------------

export type ExplainLine =
  | { kind: "base"; amountMinor: number; days: number }
  | { kind: "surplus"; amountMinor: number; from: SegmentResult | null }
  | { kind: "repayment"; amountMinor: number; deficitMinor: number; weeks: number; from: SegmentResult | null }
  | { kind: "reallocation"; amountMinor: number }
  | { kind: "opening"; amountMinor: number }
  | { kind: "monthly_cap"; amountMinor: number }
  | { kind: "allowance"; amountMinor: number };

/** Why this week's allowance is what it is, one line per source. */
export function explainWeek(state: ActiveBudget): ExplainLine[] {
  const month = state.months.at(-1)!;
  const seg = state.live.segment;
  const index = month.segments.findIndex((s) => s.start === seg.start);
  const previous = index > 0 ? month.segments[index - 1]! : null;
  const lines: ExplainLine[] = [{ kind: "base", amountMinor: seg.baseMinor, days: seg.days }];
  if (!previous && month.openingMinor < 0) lines.push({ kind: "opening", amountMinor: month.openingMinor });
  if (seg.surplusMinor > 0) lines.push({ kind: "surplus", amountMinor: seg.surplusMinor, from: previous });
  if (seg.repaymentMinor > 0) {
    lines.push({
      kind: "repayment",
      amountMinor: seg.repaymentMinor,
      deficitMinor: Math.max(0, -seg.carryInMinor),
      weeks: seg.recoveryWeeksLeft,
      from: previous,
    });
  }
  if (seg.reallocationMinor !== 0) lines.push({ kind: "reallocation", amountMinor: seg.reallocationMinor });
  const cut = Math.max(0, seg.theoreticalMinor) - seg.allowanceMinor;
  if (cut > 0) lines.push({ kind: "monthly_cap", amountMinor: -cut });
  lines.push({ kind: "allowance", amountMinor: seg.allowanceMinor });
  return lines;
}

export type SavingsSummary = {
  /** Unspent weekly allowance in completed months. */
  savedPastMinor: number;
  /** Unspent allowance carried inside this month so far. */
  carryNowMinor: number;
  /** Completed months: how far under their limits they finished. */
  underLimitsMinor: number;
  monthsCompleted: number;
};

export function savingsSummary(state: ActiveBudget): SavingsSummary {
  const past = state.months.filter((m) => m.state === "past");
  return {
    savedPastMinor: state.savedMinor,
    carryNowMinor: Math.max(0, state.live.segment.carryInMinor),
    underLimitsMinor: sumMinor(past.map((m) => Math.max(0, m.effectiveLimitMinor - m.spentMinor))),
    monthsCompleted: past.length,
  };
}

/** Number of segments left in the month including the current one. */
export function weeksLeftInMonth(state: ActiveBudget): number {
  const month = state.months.at(-1)!;
  return month.segments.filter((s) => s.state !== "past").length;
}

/** The weekend days (Saturday, Sunday) still ahead in the current week. */
export function weekendDaysLeft(state: ActiveBudget): ISODate[] {
  const seg = state.live.segment;
  const out: ISODate[] = [];
  for (let d = state.live.today; d <= seg.end; d = addDays(d, 1)) {
    const dow = dayOfWeek(d);
    if (dow === 0 || dow === 6) out.push(d);
  }
  return out;
}
