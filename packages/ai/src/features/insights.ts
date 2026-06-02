import type { InsightsSummary } from "@template/shared/types";
import { llmSummarySchema } from "@template/shared/schemas";
import { generateJSON } from "../core/generate";
import { isLLMEnabled } from "../core/flags";

type ExpenseData = {
  item_name: string;
  amount_cents: number;
  created_at: string;
  payer_names: string[];
  category?: {
    id: string | null;
    name: string;
    slug: string;
    icon: string;
    color: string;
  } | null;
};

/**
 * Compute deterministic aggregate insights from expense & member data.
 */
export function computeInsights(
  expenses: ExpenseData[],
): Omit<InsightsSummary, "llm_summary"> {
  const totalExpenses = expenses.length;
  const totalAmountCents = expenses.reduce((sum, e) => sum + e.amount_cents, 0);
  const averageExpenseCents = totalExpenses > 0 ? Math.round(totalAmountCents / totalExpenses) : 0;

  // Top spender by total paid
  const payerTotals = new Map<string, number>();
  for (const expense of expenses) {
    for (const name of expense.payer_names) {
      payerTotals.set(name, (payerTotals.get(name) ?? 0) + expense.amount_cents);
    }
  }
  let topSpender: { name: string; amount_cents: number } | null = null;
  for (const [name, amount_cents] of payerTotals) {
    if (!topSpender || amount_cents > topSpender.amount_cents) {
      topSpender = { name, amount_cents };
    }
  }

  // Most common item
  const itemCounts = new Map<string, number>();
  for (const expense of expenses) {
    const key = expense.item_name.toLowerCase().trim();
    itemCounts.set(key, (itemCounts.get(key) ?? 0) + 1);
  }
  let mostCommonItem: { name: string; count: number } | null = null;
  for (const [name, count] of itemCounts) {
    if (count > 1 && (!mostCommonItem || count > mostCommonItem.count)) {
      mostCommonItem = { name, count };
    }
  }

  const categoryTotals = new Map<
    string,
    {
      id: string | null;
      name: string;
      slug: string;
      icon: string;
      color: string;
      amount_cents: number;
      expense_count: number;
    }
  >();
  for (const expense of expenses) {
    const category = expense.category ?? {
      id: null,
      name: "Other",
      slug: "other",
      icon: "circle-ellipsis",
      color: "#6b7280",
    };
    const existing = categoryTotals.get(category.slug);
    if (existing) {
      existing.amount_cents += expense.amount_cents;
      existing.expense_count += 1;
    } else {
      categoryTotals.set(category.slug, {
        ...category,
        amount_cents: expense.amount_cents,
        expense_count: 1,
      });
    }
  }
  const categories = [...categoryTotals.values()].sort((a, b) => b.amount_cents - a.amount_cents);
  const firstCategory = categories[0] ?? null;
  const topCategory = firstCategory
    ? {
        name: firstCategory.name,
        slug: firstCategory.slug,
        amount_cents: firstCategory.amount_cents,
      }
    : null;

  // Period
  const dates = expenses.map((e) => e.created_at).sort();
  const period =
    dates.length > 0
      ? { first_expense: dates[0]!, last_expense: dates[dates.length - 1]! }
      : null;

  return {
    total_expenses: totalExpenses,
    total_amount_cents: totalAmountCents,
    average_expense_cents: averageExpenseCents,
    top_spender: topSpender,
    most_common_item: mostCommonItem,
    top_category: topCategory,
    categories,
    period,
  };
}

/**
 * Generate an optional LLM narrative summary of the group insights.
 */
export async function generateInsightsSummary(
  insights: Omit<InsightsSummary, "llm_summary">,
  groupName: string,
): Promise<string | null> {
  if (!isLLMEnabled()) return null;

  const result = await generateJSON({
    system: `You are a friendly expense insights assistant. Given group spending data, write a brief 2-3 sentence summary highlighting interesting patterns, who's been spending the most, and any notable trends. Keep it casual and helpful. Currency is Philippine Peso (₱). Return JSON: {"summary": "your text here"}`,
    prompt: JSON.stringify({ groupName, ...insights }),
    schema: llmSummarySchema,
  });

  return result.data?.summary ?? null;
}
