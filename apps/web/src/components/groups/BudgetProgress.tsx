import { formatCents } from "@template/shared";
import { PiggyBank } from "lucide-react";

type Props = {
  budgetCents: number;
  spentCents: number;
};

export function BudgetProgress({ budgetCents, spentCents }: Props): React.ReactElement {
  const pct = Math.min(100, Math.round((spentCents / budgetCents) * 100));
  const over = spentCents > budgetCents;
  const warn = !over && pct >= 80;

  const barColor = over ? "bg-red-500" : warn ? "bg-amber-500" : "bg-brand-500";
  const labelColor = over ? "text-red-600" : warn ? "text-amber-600" : "text-slate-500";

  return (
    <div className="rounded-2xl p-4 bg-white border border-slate-200">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
          <PiggyBank size={13} className="text-brand-500" />
          Budget
        </p>
        <p className={`text-xs font-semibold ${labelColor}`}>
          {formatCents(spentCents)} of {formatCents(budgetCents)}
          {over ? " — over budget" : ` · ${pct}%`}
        </p>
      </div>
      <div
        className="mt-2 h-2 rounded-full bg-slate-100 overflow-hidden"
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="Budget used"
      >
        <div className={`h-full rounded-full ${barColor} transition-all`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
