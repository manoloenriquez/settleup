import type { InsightsSummary } from "@template/shared/types";
import { generateJSON, isLLMEnabled } from "./index";
import { z } from "zod";

type ExpenseData = {
  item_name: string;
  amount_cents: number;
  created_at: string;
  payer_names: string[];
};

type MemberData = {
  display_name: string;
  net_cents: number;
};

/**
 * Compute deterministic aggregate insights from expense & member data.
 */
export function computeInsights(
  expenses: ExpenseData[],
  _members: MemberData[],
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
    period,
  };
}

const llmSummarySchema = z.object({
  summary: z.string(),
});

/**
 * Generate an optional LLM narrative summary of the group insights.
 */
export async function generateInsightsSummary(
  insights: Omit<InsightsSummary, "llm_summary">,
  groupName: string,
  userId: string,
): Promise<string | null> {
  if (!isLLMEnabled()) return null;

  const result = await generateJSON({
    system: `You are a friendly expense insights assistant. Given group spending data, write a brief 2-3 sentence summary highlighting interesting patterns, who's been spending the most, and any notable trends. Keep it casual and helpful. Currency is Philippine Peso (₱). Return JSON: {"summary": "your text here"}`,
    prompt: JSON.stringify({ groupName, ...insights }),
    schema: llmSummarySchema,
    userId,
  });

  return result.data?.summary ?? null;
}
