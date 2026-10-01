"use client";

import { currencyName, type CurrencyCode } from "@template/shared";
import { SEPARATE_CURRENCIES_NOTE } from "@/lib/currency";

type Props = {
  currencies: CurrencyCode[];
  value: CurrencyCode;
  onChange: (currency: CurrencyCode) => void;
};

/**
 * Picks which currency's balances to show. Renders nothing for a
 * single-currency group; balances are never converted between currencies.
 */
export function CurrencySwitcher({ currencies, value, onChange }: Props): React.ReactElement | null {
  if (currencies.length < 2) return null;
  return (
    <div className="flex flex-col gap-1.5">
      <div role="radiogroup" aria-label="Balance currency" className="flex flex-wrap gap-1.5">
        {currencies.map((code) => {
          const active = code === value;
          return (
            <button
              key={code}
              type="button"
              role="radio"
              aria-checked={active}
              title={currencyName(code)}
              onClick={() => onChange(code)}
              className={[
                "rounded-full border px-3 py-1 text-xs font-semibold transition-colors",
                active
                  ? "border-brand-600 bg-brand-600 text-white"
                  : "border-slate-200 bg-white text-slate-600 hover:border-slate-300",
              ].join(" ")}
            >
              {code}
            </button>
          );
        })}
      </div>
      <p className="text-xs text-slate-500">{SEPARATE_CURRENCIES_NOTE}</p>
    </div>
  );
}
