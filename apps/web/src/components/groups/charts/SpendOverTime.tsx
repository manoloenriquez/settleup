import { formatCents } from "@template/shared";

type Props = {
  /** date is YYYY-MM-DD (expense_date, falling back to created_at's day). */
  points: { date: string; amount_cents: number }[];
};

const CHART_W = 600;
const CHART_H = 140;
const BAR_GAP = 2;

/** Parse YYYY-MM-DD as a local date (new Date("YYYY-MM-DD") is UTC midnight). */
function parseDay(day: string): Date {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1);
}

function shortLabel(day: string): string {
  return parseDay(day).toLocaleDateString("en-PH", { month: "short", day: "numeric" });
}

/** ISO week key (YYYY-Www) with the week's Monday as the display date. */
function isoWeekStart(day: string): string {
  const date = parseDay(day);
  const dow = (date.getDay() + 6) % 7; // Monday = 0
  date.setDate(date.getDate() - dow);
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/**
 * Total group spend bucketed over time — daily when the ledger spans a month
 * or less, weekly beyond that. Single series in the brand hue; credits net
 * against each bucket, floored at zero.
 */
export function SpendOverTime({ points }: Props): React.ReactElement {
  if (points.length === 0) {
    return (
      <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
        <h3 className="text-sm font-semibold text-slate-900">Spend over time</h3>
        <p className="mt-3 text-sm text-slate-400">No expenses yet — add one to see the trend.</p>
      </div>
    );
  }

  const days = points.map((p) => p.date).sort();
  const first = parseDay(days[0]!);
  const last = parseDay(days[days.length - 1]!);
  const spanDays = Math.round((last.getTime() - first.getTime()) / 86_400_000) + 1;
  const weekly = spanDays > 31;

  const buckets = new Map<string, number>();
  for (const p of points) {
    const key = weekly ? isoWeekStart(p.date) : p.date;
    buckets.set(key, (buckets.get(key) ?? 0) + p.amount_cents);
  }
  const series = [...buckets.entries()]
    .map(([date, cents]) => ({ date, cents: Math.max(0, cents) }))
    .sort((a, b) => a.date.localeCompare(b.date));

  const max = Math.max(...series.map((b) => b.cents), 1);
  const barW = Math.max(2, CHART_W / series.length - BAR_GAP);
  const firstBucket = series[0]!;
  const lastBucket = series[series.length - 1]!;

  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold text-slate-900">Spend over time</h3>
        <span className="text-xs text-slate-400">{weekly ? "per week" : "per day"} · peak {formatCents(max)}</span>
      </div>
      <svg
        viewBox={`0 0 ${CHART_W} ${CHART_H}`}
        className="mt-4 h-32 w-full"
        preserveAspectRatio="none"
        role="img"
        aria-label={`Bar chart of group spend ${weekly ? "per week" : "per day"}`}
      >
        <line x1="0" y1={CHART_H - 0.5} x2={CHART_W} y2={CHART_H - 0.5} stroke="#e2e8f0" strokeWidth="1" />
        {series.map((b, i) => {
          const h = Math.max(b.cents > 0 ? 3 : 0, (b.cents / max) * (CHART_H - 8));
          const x = i * (CHART_W / series.length) + BAR_GAP / 2;
          return (
            <g key={b.date}>
              <rect
                x={x}
                y={CHART_H - h}
                width={barW}
                height={h}
                rx={Math.min(4, barW / 2)}
                fill="#10b981"
              />
              {/* full-height hit target so hover/tooltip works on short bars */}
              <rect x={x} y={0} width={barW} height={CHART_H} fill="transparent">
                <title>{`${shortLabel(b.date)}${weekly ? " (week)" : ""}: ${formatCents(b.cents)}`}</title>
              </rect>
            </g>
          );
        })}
      </svg>
      <div className="mt-1.5 flex justify-between text-xs text-slate-400">
        <span>{shortLabel(firstBucket.date)}</span>
        {series.length > 1 && <span>{shortLabel(lastBucket.date)}</span>}
      </div>
    </div>
  );
}
