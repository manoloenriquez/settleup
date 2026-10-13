import { formatAmount } from "../utils/amount";
import type { CurrencyCode } from "../utils/currency";
import { WEEKDAY_NAMES, type ISODate } from "./dates";
import type { ExplainLine } from "./insights";
import type { BudgetWarning, SegmentResult } from "./types";

// ---------------------------------------------------------------------------
// The words for budget figures, shared by the screens and the Assistant so
// both say exactly the same thing about the same number.
// ---------------------------------------------------------------------------

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "12 Oct" */
export function shortDate(date: ISODate): string {
  return `${Number(date.slice(8, 10))} ${MONTHS[Number(date.slice(5, 7)) - 1] ?? ""}`;
}

/** "12–18 Oct", "29 Sep – 5 Oct", or "12 Oct" for one day. */
export function dateRange(start: ISODate, end: ISODate): string {
  if (start === end) return shortDate(start);
  if (start.slice(0, 7) === end.slice(0, 7)) return `${Number(start.slice(8, 10))}–${shortDate(end)}`;
  return `${shortDate(start)} – ${shortDate(end)}`;
}

export function weekdayName(day: number): string {
  return WEEKDAY_NAMES[day] ?? "";
}

export type CopyLine = { label: string; value: string; detail?: string };

function money(amountMinor: number, currency: CurrencyCode, signed = false): string {
  const text = formatAmount(Math.abs(amountMinor), currency);
  if (!signed || amountMinor === 0) return text;
  return amountMinor > 0 ? `+${text}` : `−${text}`;
}

function weekLabel(segment: SegmentResult | null): string {
  return segment ? dateRange(segment.start, segment.end) : "last week";
}

/** One line of "why is this week's allowance what it is". */
export function explainLineCopy(line: ExplainLine, currency: CurrencyCode): CopyLine {
  switch (line.kind) {
    case "base":
      return {
        label: "Weekly allowance",
        value: money(line.amountMinor, currency),
        ...(line.days < 7 ? { detail: `${line.days} ${line.days === 1 ? "day" : "days"} of this week are in this month` } : {}),
      };
    case "surplus":
      return {
        label: "Left over from earlier weeks",
        value: money(line.amountMinor, currency, true),
        ...(line.from ? { detail: `${weekLabel(line.from)}: spent ${money(line.from.spentMinor, currency)} of ${money(line.from.allowanceMinor, currency)}` } : {}),
      };
    case "repayment":
      return {
        label: "Making up for overspending",
        value: money(-line.amountMinor, currency, true),
        detail:
          line.weeks > 1
            ? `${money(line.deficitMinor, currency)} over so far, spread across ${line.weeks} weeks`
            : `${money(line.deficitMinor, currency)} over so far`,
      };
    case "reallocation":
      return {
        label: line.amountMinor > 0 ? "Moved in from other weeks" : "Moved to another week",
        value: money(line.amountMinor, currency, true),
      };
    case "opening":
      return {
        label: "Over last month's limit",
        value: money(line.amountMinor, currency, true),
        detail: "Carried into this month",
      };
    case "monthly_cap":
      return {
        label: "Kept within the monthly limit",
        value: money(line.amountMinor, currency, true),
        detail: "There isn't more left this month",
      };
    case "allowance":
      return { label: "This week", value: money(line.amountMinor, currency) };
  }
}

export function warningCopy(warning: BudgetWarning, currency: CurrencyCode): string {
  switch (warning.kind) {
    case "over_week":
      return `${money(warning.amountMinor, currency)} over this week's allowance. Next week's will be smaller.`;
    case "over_month":
      return `${money(warning.amountMinor, currency)} over this month's limit.`;
    case "month_at_risk":
      return `At this pace the month ends at about ${money(warning.projectedMinor, currency)}, above your limit.`;
    case "plan_exceeds_limit":
      return `Your weekly allowance and set-aside spending add up to ${money(warning.plannedMinor, currency)}, more than your ${money(warning.limitMinor, currency)} monthly limit. The limit still applies.`;
    case "recovery_shortfall":
      return `${money(warning.amountMinor, currency)} of overspending won't be made up before the month ends.`;
    case "uncounted":
      return `${warning.count} ${warning.count === 1 ? "expense isn't" : "expenses aren't"} counted: no exchange rate for ${warning.count === 1 ? "its" : "their"} currency.`;
    case "shares_incomplete":
      return "Some group expenses couldn't be loaded, so these figures may be low.";
  }
}

/** "₱3,800 left this week" or "₱200 over this week", for the line after saving an expense. */
export function weekLeftCopy(availableWeekMinor: number, overWeekMinor: number, currency: CurrencyCode): string {
  if (overWeekMinor > 0) return `${money(overWeekMinor, currency)} over this week`;
  return `${money(availableWeekMinor, currency)} left this week`;
}
