import { minorToDecimal, type CurrencyCode } from "./currency";

export type LedgerExpense = {
  item_name: string;
  amount_cents: number;
  /** Absent for rows from before currencies existed — those are pesos. */
  currency_code?: CurrencyCode;
  created_at: string;
  /** User-set expense date (YYYY-MM-DD); falls back to created_at when absent. */
  expense_date?: string | null;
  payer_names: string[];
  participant_names: string[];
  category_name?: string | null;
  notes?: string | null;
};

export type LedgerPayment = {
  from_name: string;
  to_name: string;
  amount_cents: number;
  currency_code?: CurrencyCode;
  created_at: string;
  status: string;
};

function csvEscape(value: string): string {
  if (/[",\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function row(cells: string[]): string {
  return cells.map(csvEscape).join(",");
}

/** Plain decimal in the row's own currency ("1234.50", "1500" for JPY). */
function decimal(minor: number, currency: CurrencyCode | undefined): string {
  return minorToDecimal(minor, currency ?? "PHP");
}

function day(dateStr: string): string {
  return dateStr.slice(0, 10);
}

/**
 * Builds a flat CSV ledger of a group's expenses and payments, oldest first.
 * Amounts are plain decimals in each row's own currency (named in the
 * currency column) so spreadsheets treat them as numbers; nothing is converted.
 */
export function buildGroupLedgerCsv(
  expenses: LedgerExpense[],
  payments: LedgerPayment[],
): string {
  const header = row(["type", "date", "description", "category", "amount", "currency", "paid_by", "split_with", "status", "notes"]);

  const expenseRows = expenses.map((e) => ({
    date: e.expense_date ?? e.created_at,
    line: row([
      "expense",
      day(e.expense_date ?? e.created_at),
      e.item_name,
      e.category_name ?? "",
      decimal(e.amount_cents, e.currency_code),
      e.currency_code ?? "PHP",
      e.payer_names.join("; "),
      e.participant_names.join("; "),
      "",
      e.notes ?? "",
    ]),
  }));

  const paymentRows = payments.map((p) => ({
    date: p.created_at,
    line: row([
      "payment",
      day(p.created_at),
      `${p.from_name} paid ${p.to_name}`,
      "",
      decimal(p.amount_cents, p.currency_code),
      p.currency_code ?? "PHP",
      p.from_name,
      p.to_name,
      p.status,
      "",
    ]),
  }));

  const body = [...expenseRows, ...paymentRows]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((r) => r.line);

  return [header, ...body].join("\n") + "\n";
}
