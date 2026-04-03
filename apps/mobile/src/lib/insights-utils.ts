export type GroupInsights = {
  total_expenses: number;
  total_amount_cents: number;
  average_expense_cents: number;
  top_item?: string;
  period_days: number;
};

export function computeGroupInsights(
  expenses: { item_name: string; amount_cents: number; created_at: string }[],
): GroupInsights {
  if (expenses.length === 0) {
    return { total_expenses: 0, total_amount_cents: 0, average_expense_cents: 0, period_days: 0 };
  }

  const total = expenses.reduce((sum, e) => sum + e.amount_cents, 0);
  const first = expenses[0]?.created_at ? new Date(expenses[0].created_at) : new Date();
  const last = expenses[expenses.length - 1]?.created_at ? new Date(expenses[expenses.length - 1]!.created_at) : new Date();
  const periodDays = Math.max(1, Math.ceil((last.getTime() - first.getTime()) / 86400000));

  const nameCount = new Map<string, number>();
  for (const e of expenses) {
    nameCount.set(e.item_name, (nameCount.get(e.item_name) ?? 0) + 1);
  }
  const topItem = [...nameCount.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];

  return {
    total_expenses: expenses.length,
    total_amount_cents: total,
    average_expense_cents: Math.round(total / expenses.length),
    top_item: topItem,
    period_days: periodDays,
  };
}
