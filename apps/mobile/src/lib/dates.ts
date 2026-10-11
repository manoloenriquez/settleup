/** Local YYYY-MM-DD (never UTC — toISOString is a day off after 8am in Manila). */
export function localTodayISO(now: Date = new Date()): string {
  return dateToISO(now);
}

export function dateToISO(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function isoToLocalDate(iso: string): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!match) return new Date();
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

/** "Today", "Yesterday", or "Wed, 1 Oct" in the device locale. */
export function friendlyDate(iso: string, today: string = localTodayISO()): string {
  if (iso === today) return "Today";
  const yesterday = new Date(isoToLocalDate(today));
  yesterday.setDate(yesterday.getDate() - 1);
  if (iso === dateToISO(yesterday)) return "Yesterday";
  const date = isoToLocalDate(iso);
  const sameYear = iso.slice(0, 4) === today.slice(0, 4);
  return date.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    ...(sameYear ? {} : { year: "numeric" }),
  });
}

/** "October 2026" for a "2026-10" month key. */
export function monthLabel(month: string): string {
  const [year, m] = month.split("-").map(Number);
  return new Date(year ?? 1970, (m ?? 1) - 1, 1).toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
  });
}
