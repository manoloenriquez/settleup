import type { z } from "zod";
import type { CategorySlug } from "../utils/category";
import type { CurrencyCode } from "../utils/currency";
import type { ISODate, MonthKey } from "./dates";
import type {
  budgetAnnotationSchema,
  budgetConfigSchema,
  budgetDocumentSchema,
  budgetPlanVersionSchema,
  budgetStoreSchema,
  exchangeRateSchema,
  fixedCostSchema,
  recoverySchema,
} from "./schema";

export type BudgetConfig = z.infer<typeof budgetConfigSchema>;
export type BudgetPlanVersion = z.infer<typeof budgetPlanVersionSchema>;
export type BudgetAnnotation = z.infer<typeof budgetAnnotationSchema>;
export type BudgetDocument = z.infer<typeof budgetDocumentSchema>;
export type BudgetStore = z.infer<typeof budgetStoreSchema>;
export type FixedCost = z.infer<typeof fixedCostSchema>;
export type ExchangeRate = z.infer<typeof exchangeRateSchema>;
export type RecoveryMode = z.infer<typeof recoverySchema>;
export type PlannedSpend = Extract<BudgetAnnotation, { kind: "planned" }>;
export type Reallocation = Extract<BudgetAnnotation, { kind: "reallocation" }>;
export type RefundNote = Extract<BudgetAnnotation, { kind: "refund" }>;

// ---------------------------------------------------------------------------
// Engine input: transactions as the budget sees them.
// ---------------------------------------------------------------------------

export type SpendSource = {
  /** "personal:<id>" or "group:<expense id>" */
  ref: string;
  kind: "personal" | "group";
  description: string;
  /** The person's own cost: a personal expense in full, their share of a group expense. */
  amountMinor: number;
  currency: CurrencyCode;
  category: CategorySlug;
  date: ISODate;
  /** Group expenses: which group, and the whole bill for context. */
  groupName?: string;
  totalMinor?: number;
};

// ---------------------------------------------------------------------------
// Engine output.
// ---------------------------------------------------------------------------

export type Bucket =
  | { kind: "weekly" }
  | { kind: "fixed"; id: string; name: string }
  | { kind: "planned"; id: string; name: string }
  | { kind: "outside" };

export type ItemStatus = "counted" | "excluded" | "no_rate" | "out_of_range";

export type BudgetItem = {
  ref: string;
  kind: "personal" | "group" | "refund";
  description: string;
  date: ISODate;
  category: CategorySlug;
  /** As recorded. */
  originalMinor: number;
  originalCurrency: CurrencyCode;
  /** In the budget currency; negative for refunds; 0 unless counted. */
  amountMinor: number;
  /** Rate used when the record was in another currency. */
  rate: string | null;
  bucket: Bucket;
  status: ItemStatus;
  /** How the bucket was decided, for "why does this count here?". */
  reason: "excluded" | "linked" | "trip" | "name" | "outside_category" | "weekly" | "no_rate" | "out_of_range";
  groupName?: string;
};

export type SegmentResult = {
  start: ISODate;
  end: ISODate;
  days: number;
  /** The weekly allowance for these days, before any rollover. */
  baseMinor: number;
  /** Allowance moved into (+) or out of (−) this week by a plan. */
  reallocationMinor: number;
  /** Ledger balance before this week: + unspent, − overspent. */
  carryInMinor: number;
  surplusMinor: number;
  repaymentMinor: number;
  /** Weeks the current deficit is being spread over (smoothed recovery). */
  recoveryWeeksLeft: number;
  /** base + reallocation + surplus − repayment; may be negative. */
  theoreticalMinor: number;
  /** What the monthly limit still allowed when the week began. */
  capacityAtStartMinor: number;
  /** Shown allowance: theoretical, at least 0, at most the monthly capacity. */
  allowanceMinor: number;
  spentMinor: number;
  carryOutMinor: number;
  state: "past" | "current" | "future";
  /** The settings version this week ran under. */
  planId: string;
};

export type MonthResult = {
  month: MonthKey;
  limitMinor: number;
  /** Overspending carried in from the previous month (≤ 0). */
  openingMinor: number;
  effectiveLimitMinor: number;
  /** Everything counted in the month (all buckets), up to today for the current month. */
  spentMinor: number;
  weeklySpentMinor: number;
  /** Above the effective limit (≥ 0). */
  overrunMinor: number;
  /** Ledger balance at month end (current month: so far). */
  closingCarryMinor: number;
  monthEnd: BudgetConfig["monthEnd"];
  segments: SegmentResult[];
  /** The month's plan: weekly allowances + fixed costs + outside-weekly limits + planned spending. */
  plannedMinor: number;
  state: "past" | "current";
  byCategory: { category: CategorySlug; spentMinor: number; limitMinor: number | null }[];
};

export type Reservation = {
  kind: "fixed" | "planned" | "category" | "scheduled";
  id: string;
  name: string;
  amountMinor: number;
  matchedMinor: number;
  reservedMinor: number;
  /** Fixed costs: the due day; planned: its first day; scheduled: the expense date. */
  date: ISODate | null;
};

export type BudgetWarning =
  | { kind: "over_week"; amountMinor: number }
  | { kind: "over_month"; amountMinor: number }
  | { kind: "month_at_risk"; projectedMinor: number }
  | { kind: "plan_exceeds_limit"; plannedMinor: number; limitMinor: number }
  | { kind: "recovery_shortfall"; amountMinor: number }
  | { kind: "uncounted"; count: number }
  | { kind: "shares_incomplete" };

export type BudgetLive = {
  today: ISODate;
  segment: SegmentResult;
  config: BudgetConfig;
  /** What can be spent today without falling behind this week or the month. */
  safeTodayMinor: number;
  /** Left this week, never above what remains in the month. */
  availableWeekMinor: number;
  spentWeekMinor: number;
  spentTodayMinor: number;
  /** Over this week's allowance (≥ 0). */
  overWeekMinor: number;
  /** effective limit − spent this month (may be negative). */
  remainingMonthMinor: number;
  reservedMinor: number;
  /** remaining − reserved, at least 0: free to spend this month. */
  availableMonthMinor: number;
  /** Month end at the current pace (weekly spending pace + everything reserved). */
  projectedMonthMinor: number;
  onTrack: boolean;
  reservations: Reservation[];
  daysLeftInWeek: number;
  daysLeftInMonth: number;
};

export type BudgetState =
  | { status: "off" }
  | { status: "not_started"; startDate: ISODate; config: BudgetConfig }
  | {
      status: "active";
      currency: CurrencyCode;
      months: MonthResult[];
      live: BudgetLive;
      items: BudgetItem[];
      warnings: BudgetWarning[];
      /** Unspent weekly allowance kept in completed months (never moved forward). */
      savedMinor: number;
    };
