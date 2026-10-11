// ---------------------------------------------------------------------------
// Deterministic resolution of the date phrases people type into the expense
// chat. The language model only reports the phrase it saw ("yesterday", "last
// Friday", "March 3"); turning that into a calendar date is calendar
// arithmetic, so it happens here and is unit-tested.
// ---------------------------------------------------------------------------

const WEEKDAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

function toISO(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function fromISO(iso: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!match) return null;
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

function shift(base: Date, days: number): Date {
  const next = new Date(base);
  next.setDate(next.getDate() + days);
  return next;
}

/**
 * Resolves a date mention relative to `today` (local YYYY-MM-DD). Returns an
 * ISO date, or null when the phrase is missing, unknown, or in the future by
 * more than a day (expenses are recorded after the fact).
 */
export function resolveDateMention(mention: string | null | undefined, today: string): string | null {
  if (!mention) return null;
  const base = fromISO(today);
  if (!base) return null;
  const text = mention.trim().toLowerCase();
  if (!text) return null;

  if (/^(today|tonight|this morning|earlier)$/.test(text)) return today;
  if (/^(yesterday|last night)$/.test(text)) return toISO(shift(base, -1));
  if (/^(the )?day before yesterday$/.test(text)) return toISO(shift(base, -2));
  const daysAgo = /^(\d{1,2}) days? ago$/.exec(text);
  if (daysAgo?.[1]) return toISO(shift(base, -Number(daysAgo[1])));
  const weeksAgo = /^(a|1|one|2|two|3|three) weeks? ago$/.exec(text);
  if (weeksAgo?.[1]) {
    const n = { a: 1, one: 1, two: 2, three: 3 }[weeksAgo[1]] ?? Number(weeksAgo[1]);
    return toISO(shift(base, -7 * n));
  }
  if (/^last week$/.test(text)) return toISO(shift(base, -7));

  const weekday = /^(?:last |this |on )?(sunday|monday|tuesday|wednesday|thursday|friday|saturday|sun|mon|tue|tues|wed|thu|thurs|fri|sat)$/.exec(text);
  if (weekday?.[1]) {
    const index = WEEKDAYS.findIndex((d) => d.startsWith(weekday[1]!.slice(0, 3)));
    if (index >= 0) {
      // The most recent occurrence strictly before today; "last Friday" said on a Friday means a week ago.
      let back = (base.getDay() - index + 7) % 7;
      if (back === 0) back = 7;
      return toISO(shift(base, -back));
    }
  }

  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  if (iso) return withinRange(text, base) ? text : null;

  const numeric = /^(\d{1,2})[/.-](\d{1,2})(?:[/.-](\d{2,4}))?$/.exec(text);
  if (numeric?.[1] && numeric[2]) {
    const month = Number(numeric[1]);
    const day = Number(numeric[2]);
    const year = numeric[3] ? Number(numeric[3].length === 2 ? `20${numeric[3]}` : numeric[3]) : base.getFullYear();
    return buildDate(year, month, day, base);
  }

  const textual = /^(?:on )?([a-z]{3,9})\.?\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s+(\d{4}))?$/.exec(text) ?? /^(?:on )?(\d{1,2})(?:st|nd|rd|th)?\s+(?:of\s+)?([a-z]{3,9})(?:,?\s+(\d{4}))?$/.exec(text);
  if (textual) {
    const first = textual[1]!;
    const second = textual[2]!;
    const monthWord = /^\d/.test(first) ? second : first;
    const dayWord = /^\d/.test(first) ? first : second;
    const month = MONTHS.indexOf(monthWord.slice(0, 3));
    if (month >= 0) {
      const year = textual[3] ? Number(textual[3]) : base.getFullYear();
      return buildDate(year, month + 1, Number(dayWord), base);
    }
  }
  return null;
}

function buildDate(year: number, month: number, day: number, base: Date): string | null {
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  let candidate = new Date(year, month - 1, day);
  if (candidate.getMonth() !== month - 1) return null;
  // A month/day without a year that lands in the future means the previous year.
  if (candidate.getTime() > shift(base, 1).getTime() && year === base.getFullYear()) {
    candidate = new Date(year - 1, month - 1, day);
  }
  const iso = toISO(candidate);
  return withinRange(iso, base) ? iso : null;
}

function withinRange(iso: string, base: Date): boolean {
  const date = fromISO(iso);
  if (!date) return false;
  const tomorrow = shift(base, 1).getTime();
  const twoYearsAgo = shift(base, -731).getTime();
  return date.getTime() <= tomorrow && date.getTime() >= twoYearsAgo;
}
