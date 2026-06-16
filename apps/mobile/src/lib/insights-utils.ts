export type GroupInsights = {
  total_expenses: number;
  total_amount_cents: number;
  average_expense_cents: number;
  top_item?: string;
  top_category?: { name: string; slug: string; amount_cents: number };
  categories: { name: string; slug: string; color: string; amount_cents: number; expense_count: number }[];
  period_days: number;
};

export function computeGroupInsights(
  expenses: { item_name: string; amount_cents: number; created_at: string; category?: { name: string; slug: string; color: string } | null }[],
): GroupInsights {
  if (expenses.length === 0) {
    return { total_expenses: 0, total_amount_cents: 0, average_expense_cents: 0, categories: [], period_days: 0 };
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

  const categoryTotals = new Map<string, { name: string; slug: string; color: string; amount_cents: number; expense_count: number }>();
  for (const expense of expenses) {
    const category = expense.category ?? { name: "Other", slug: "other", color: colorsFallback.other };
    const existing = categoryTotals.get(category.slug);
    if (existing) {
      existing.amount_cents += expense.amount_cents;
      existing.expense_count += 1;
    } else {
      categoryTotals.set(category.slug, { ...category, amount_cents: expense.amount_cents, expense_count: 1 });
    }
  }
  const categories = [...categoryTotals.values()].sort((a, b) => b.amount_cents - a.amount_cents);
  const top = categories[0];

  return {
    total_expenses: expenses.length,
    total_amount_cents: total,
    average_expense_cents: Math.round(total / expenses.length),
    top_item: topItem,
    top_category: top ? { name: top.name, slug: top.slug, amount_cents: top.amount_cents } : undefined,
    categories,
    period_days: periodDays,
  };
}

const colorsFallback = {
  other: "#6b7280",
} as const;
