import { formatCents } from "@template/shared";
import { CategoryIconTile } from "@/components/groups/CategoryIcon";

type DonutCategory = {
  id: string | null;
  name: string;
  slug: string;
  icon: string;
  color: string;
  amount_cents: number;
  expense_count: number;
};

type Props = {
  categories: DonutCategory[];
  totalAmountCents: number;
};

const RADIUS = 40;
const STROKE = 16;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
/** Surface gap between adjacent arcs so segments never touch (CVD-safe separation). */
const GAP = 2;

/**
 * Spending by category as a donut. Colors are the group's own category
 * colors (identity follows the entity across the app); the legend carries
 * icon + name + amount for every slice so identity is never color-alone.
 */
export function CategoryDonut({ categories, totalAmountCents }: Props): React.ReactElement {
  // Credits (negative expenses) can't be drawn as arc length — chart positive spend only.
  const positive = categories.filter((c) => c.amount_cents > 0);
  const chartTotal = positive.reduce((sum, c) => sum + c.amount_cents, 0);
  const hasCredits = totalAmountCents !== chartTotal;

  if (positive.length === 0 || chartTotal <= 0) {
    return (
      <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
        <h3 className="text-sm font-semibold text-slate-900">Spending by category</h3>
        <p className="mt-3 text-sm text-slate-400">No expenses yet — add one to see the breakdown.</p>
      </div>
    );
  }

  let offset = 0;
  const segments = positive.map((c) => {
    const fraction = c.amount_cents / chartTotal;
    const length = Math.max(0, fraction * CIRCUMFERENCE - GAP);
    const segment = { ...c, fraction, length, offset };
    offset += fraction * CIRCUMFERENCE;
    return segment;
  });

  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
      <h3 className="text-sm font-semibold text-slate-900">Spending by category</h3>
      <div className="mt-4 flex flex-col items-center gap-5 sm:flex-row sm:items-start">
        <div className="relative shrink-0">
          <svg viewBox="0 0 100 100" className="h-36 w-36 -rotate-90" role="img" aria-label="Donut chart of spending by category">
            {segments.map((s) => (
              <circle
                key={s.slug}
                cx="50"
                cy="50"
                r={RADIUS}
                fill="none"
                stroke={s.color}
                strokeWidth={STROKE}
                strokeDasharray={`${s.length} ${CIRCUMFERENCE - s.length}`}
                strokeDashoffset={-s.offset}
              >
                <title>{`${s.name}: ${formatCents(s.amount_cents)} (${Math.round(s.fraction * 100)}%)`}</title>
              </circle>
            ))}
          </svg>
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-[10px] font-medium uppercase tracking-wide text-slate-400">Total</span>
            <span className="text-sm font-bold tabular-nums text-slate-900">{formatCents(chartTotal)}</span>
          </div>
        </div>
        <ul className="flex w-full min-w-0 flex-col gap-2">
          {segments.map((s) => (
            <li key={s.slug} className="flex items-center gap-2.5">
              <CategoryIconTile icon={s.icon} color={s.color} size="sm" />
              <span className="min-w-0 flex-1 truncate text-sm text-slate-700">{s.name}</span>
              <span className="text-sm font-semibold tabular-nums text-slate-900">{formatCents(s.amount_cents)}</span>
              <span className="w-10 text-right text-xs tabular-nums text-slate-400">{Math.round(s.fraction * 100)}%</span>
            </li>
          ))}
        </ul>
      </div>
      {hasCredits && (
        <p className="mt-3 text-xs text-slate-400">Credits and refunds are excluded from the chart.</p>
      )}
    </div>
  );
}
