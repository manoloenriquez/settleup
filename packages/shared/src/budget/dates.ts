// ---------------------------------------------------------------------------
// Calendar arithmetic on local ISO dates ("2026-10-12"). Expense dates are
// local calendar days with no time or zone, so budget periods are computed on
// the same plain dates; UTC is used only as a neutral calendar for the maths,
// never to read the clock. "Today" is always passed in by the caller.
// ---------------------------------------------------------------------------

export type ISODate = string;
/** "2026-10" */
export type MonthKey = string;

const ISO = /^(\d{4})-(\d{2})-(\d{2})$/;
const DAY_MS = 86_400_000;

function parts(date: ISODate): [number, number, number] {
  const match = ISO.exec(date);
  if (!match) throw new RangeError(`Not an ISO date: ${date}`);
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

function toUTC(date: ISODate): number {
  const [y, m, d] = parts(date);
  return Date.UTC(y, m - 1, d);
}

function fromUTC(ms: number): ISODate {
  const d = new Date(ms);
  return `${String(d.getUTCFullYear()).padStart(4, "0")}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

export function isISODate(value: string): boolean {
  if (!ISO.test(value)) return false;
  return fromUTC(toUTC(value)) === value;
}

export function addDays(date: ISODate, days: number): ISODate {
  return fromUTC(toUTC(date) + days * DAY_MS);
}

/** Whole days from `a` to `b` (positive when b is later). */
export function daysBetween(a: ISODate, b: ISODate): number {
  return Math.round((toUTC(b) - toUTC(a)) / DAY_MS);
}

/** 0 = Sunday … 6 = Saturday. */
export function dayOfWeek(date: ISODate): number {
  return new Date(toUTC(date)).getUTCDay();
}

export function monthOf(date: ISODate): MonthKey {
  return date.slice(0, 7);
}

export function monthStart(month: MonthKey): ISODate {
  return `${month}-01`;
}

export function daysInMonth(month: MonthKey): number {
  const [y, m] = parts(`${month}-01`);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

export function monthEnd(month: MonthKey): ISODate {
  return `${month}-${String(daysInMonth(month)).padStart(2, "0")}`;
}

export function addMonths(month: MonthKey, count: number): MonthKey {
  const [y, m] = parts(`${month}-01`);
  const index = y * 12 + (m - 1) + count;
  return `${String(Math.floor(index / 12)).padStart(4, "0")}-${String((index % 12) + 1).padStart(2, "0")}`;
}

/** Months from `from` to `to` inclusive, oldest first. */
export function monthsBetween(from: MonthKey, to: MonthKey): MonthKey[] {
  const out: MonthKey[] = [];
  for (let month = from; month <= to; month = addMonths(month, 1)) out.push(month);
  return out;
}

export function minDate(a: ISODate, b: ISODate): ISODate {
  return a <= b ? a : b;
}

export function maxDate(a: ISODate, b: ISODate): ISODate {
  return a >= b ? a : b;
}

/** Every date from `from` to `to` inclusive. */
export function eachDay(from: ISODate, to: ISODate): ISODate[] {
  const out: ISODate[] = [];
  for (let day = from; day <= to; day = addDays(day, 1)) out.push(day);
  return out;
}

/** First day of the week containing `date`, for weeks starting on `weekStartsOn`. */
export function weekStart(date: ISODate, weekStartsOn: number): ISODate {
  return addDays(date, -((dayOfWeek(date) - weekStartsOn + 7) % 7));
}

/**
 * A week segment: the part of one week that falls inside one month. A week
 * that crosses a month boundary is two segments, one in each month, so a
 * month's spending and allowances never leak into another month.
 */
export type Segment = { start: ISODate; end: ISODate; month: MonthKey; days: number };

export function segmentsOfMonth(month: MonthKey, weekStartsOn: number): Segment[] {
  const last = monthEnd(month);
  const segments: Segment[] = [];
  let start = monthStart(month);
  while (start <= last) {
    const weekLast = addDays(weekStart(start, weekStartsOn), 6);
    const end = minDate(weekLast, last);
    segments.push({ start, end, month, days: daysBetween(start, end) + 1 });
    start = addDays(end, 1);
  }
  return segments;
}

export const WEEKDAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"] as const;
