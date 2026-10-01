"use client";

import { CURRENCY_CODES, currencyName, isCurrencyCode, type CurrencyCode } from "@template/shared";
import { Select } from "@/components/ui/Select";

type Props = {
  value: CurrencyCode;
  onChange: (currency: CurrencyCode) => void;
  label?: string;
  name?: string;
  id?: string;
  disabled?: boolean;
  className?: string;
};

/** Every supported ledger currency, shown as "PHP — Philippine Peso". */
export function CurrencySelect({
  value,
  onChange,
  label = "Currency",
  name,
  id,
  disabled,
  className,
}: Props): React.ReactElement {
  return (
    <Select
      label={label}
      name={name}
      id={id}
      value={value}
      disabled={disabled}
      className={className}
      onChange={(event) => {
        if (isCurrencyCode(event.target.value)) onChange(event.target.value);
      }}
    >
      {CURRENCY_CODES.map((code) => (
        <option key={code} value={code}>
          {code} — {currencyName(code)}
        </option>
      ))}
    </Select>
  );
}
