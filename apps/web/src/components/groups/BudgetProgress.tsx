import type { CurrencyCode } from "@template/shared";
import { PiggyBank } from "lucide-react";
import { formatCurrency } from "@/lib/currency";

type Props = {
  budgetCents: number;
  /** The budget's currency; only spending in this currency counts toward it. */
  currency: CurrencyCode;
  /** Every expense in the group; ones in other currencies are left out, never converted. */
  expenses: { amount_cents: number; currency_code: CurrencyCode }[];
};

/** Spending in the budget's currency (credits ignored). Never adds currencies together. */
export function spentInCurrency(
  expenses: { amount_cents: number; currency_code: CurrencyCode }[],
  currency: CurrencyCode,
): number {
  return expenses.reduce(
    (sum, e) => (e.currency_code === currency ? sum + Math.max(0, e.amount_cents) : sum),
    0,
  );
}

export function BudgetProgress({ budgetCents, currency, expenses }: Props): React.ReactElement {
  const spentCents = spentInCurrency(expenses, currency);
  const hasOtherCurrencies = expenses.some((e) => e.currency_code !== currency);
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
          Budget ({currency})
        </p>
        <p className={`text-xs font-semibold ${labelColor}`}>
          {formatCurrency(spentCents, currency)} of {formatCurrency(budgetCents, currency)}
          {over ? " — over budget" : ` · ${pct}%`}
        </p>
      </div>
      <div
        className="mt-2 h-2 rounded-full bg-slate-100 overflow-hidden"
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`Budget used, ${currency}`}
      >
        <div className={`h-full rounded-full ${barColor} transition-all`} style={{ width: `${pct}%` }} />
      </div>
      {hasOtherCurrencies && (
        <p className="mt-2 text-xs text-slate-400">
          Only spending in {currency} counts toward this budget. Other currencies are not converted.
        </p>
      )}
    </div>
  );
}
