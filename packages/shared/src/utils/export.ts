export type LedgerExpense = {
  item_name: string;
  amount_cents: number;
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

function pesos(cents: number): string {
  return (cents / 100).toFixed(2);
}

function day(dateStr: string): string {
  return dateStr.slice(0, 10);
}

/**
 * Builds a flat CSV ledger of a group's expenses and payments, oldest first.
 * Amounts are plain decimal pesos so spreadsheets treat them as numbers.
 */
export function buildGroupLedgerCsv(
  expenses: LedgerExpense[],
  payments: LedgerPayment[],
): string {
  const header = row(["type", "date", "description", "category", "amount_php", "paid_by", "split_with", "status", "notes"]);

  const expenseRows = expenses.map((e) => ({
    date: e.expense_date ?? e.created_at,
    line: row([
      "expense",
      day(e.expense_date ?? e.created_at),
      e.item_name,
      e.category_name ?? "",
      pesos(e.amount_cents),
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
      pesos(p.amount_cents),
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
