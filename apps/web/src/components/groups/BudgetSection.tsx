"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { invalidateGroupData } from "@/lib/query-keys";
import { setGroupBudget } from "@/app/actions/groups";
import { amountToInput, currencyName, currencySymbol, parseAmountInput, type CurrencyCode } from "@template/shared";
import { formatCurrency, MONEY_LOCALE } from "@/lib/currency";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { PiggyBank } from "lucide-react";

type Props = {
  groupId: string;
  budgetCents: number | null;
  /** The budget's currency: group.budget_currency_code ?? group.default_currency_code ?? "PHP". */
  currency: CurrencyCode;
  canEdit: boolean;
};

export function BudgetSection({ groupId, budgetCents, currency, canEdit }: Props): React.ReactElement {
  const queryClient = useQueryClient();
  const [amountStr, setAmountStr] = useState(budgetCents ? amountToInput(budgetCents, currency) : "");
  // The input prefix fits a single-glyph symbol; wider ones ("SGD", "CHF") rely on the label.
  const symbol = currencySymbol(currency, MONEY_LOCALE);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function save(nextCents: number | null): void {
    startTransition(async () => {
      const result = await setGroupBudget(groupId, nextCents, currency);
      if (result.error) toast.error(result.error);
      else {
        toast.success(nextCents ? `Budget set to ${formatCurrency(nextCents, currency)}` : "Budget removed");
        router.refresh();
        invalidateGroupData(queryClient, groupId);
      }
    });
  }

  function handleSave(): void {
    const cents = parseAmountInput(amountStr, currency);
    if (cents === null) {
      toast.error(`Enter a valid budget amount in ${currency}.`);
      return;
    }
    save(cents);
  }

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5">
      <h2 className="text-base font-semibold text-slate-900 mb-1 flex items-center gap-2">
        <PiggyBank size={16} className="text-brand-500" />
        Group Budget
      </h2>
      <p className="text-sm text-slate-500 mb-4">
        Optional spending cap in {currency} ({currencyName(currency)}), shown as a progress bar on the
        group page. Only spending in {currency} counts toward it.
      </p>
      {canEdit ? (
        <div className="flex items-end gap-2 max-w-sm">
          <Input
            label={`Budget (${currency})`}
            leftAddon={symbol.length === 1 ? symbol : undefined}
            value={amountStr}
            onChange={(e) => setAmountStr(e.target.value)}
            inputMode="decimal"
            placeholder="e.g. 30000"
          />
          <Button onClick={handleSave} isLoading={isPending}>
            Save
          </Button>
          {budgetCents !== null && (
            <Button variant="ghost" disabled={isPending} onClick={() => save(null)}>
              Remove
            </Button>
          )}
        </div>
      ) : (
        <p className="text-sm text-slate-600">
          {budgetCents ? `Budget: ${formatCurrency(budgetCents, currency)}` : "No budget set."}
        </p>
      )}
    </section>
  );
}
