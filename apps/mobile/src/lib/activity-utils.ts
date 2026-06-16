export type ActivityItem = {
  id: string;
  type: "expense" | "payment";
  label: string;
  amount_cents: number;
  created_at: string;
  category?: { name: string; color: string } | null;
};

export function mergeAndSortActivity(
  expenses: { id: string; item_name: string; amount_cents: number; created_at: string; category?: { name: string; color: string } | null }[],
  payments: { id: string; amount_cents: number; created_at: string }[],
): ActivityItem[] {
  const items: ActivityItem[] = [];

  for (const e of expenses) {
    items.push({ id: e.id, type: "expense", label: e.item_name, amount_cents: e.amount_cents, created_at: e.created_at, category: e.category ?? null });
  }

  for (const p of payments) {
    items.push({ id: p.id, type: "payment", label: "Payment recorded", amount_cents: p.amount_cents, created_at: p.created_at });
  }

  items.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  return items.slice(0, 30);
}
