import type { InsightsSummary } from "@template/shared/types";
import { llmSummarySchema } from "@template/shared/schemas";
import { generateJSON } from "./index";
import { callAiEndpoint } from "./api-provider";
import { resolveProvider } from "./provider";

type InsightsInput = {
  groupId: string;
  groupName: string;
  insights: Omit<InsightsSummary, "llm_summary">;
};

export async function generateInsightsSummaryMobile(
  input: InsightsInput,
): Promise<string | null> {
  const { groupId, groupName, insights } = input;
  const provider = await resolveProvider();

  if (provider.name === "apple-intelligence") {
    // The model must receive peso amounts, not raw cents — otherwise it reports
    // every value 100x too large (e.g. "₱12,000" for ₱120.00). Mirror the
    // conversion done server-side in @template/ai's generateInsightsSummary.
    const toPeso = (cents: number): string => (cents / 100).toFixed(2);
    const promptPayload = {
      groupName,
      total_expenses: insights.total_expenses,
      total_spent_php: toPeso(insights.total_amount_cents),
      average_expense_php: toPeso(insights.average_expense_cents),
      top_spender: insights.top_spender
        ? { name: insights.top_spender.name, amount_php: toPeso(insights.top_spender.amount_cents) }
        : null,
      most_common_item: insights.most_common_item,
      top_category: insights.top_category
        ? { name: insights.top_category.name, amount_php: toPeso(insights.top_category.amount_cents) }
        : null,
      categories: insights.categories.map((c) => ({
        name: c.name,
        amount_php: toPeso(c.amount_cents),
        expense_count: c.expense_count,
      })),
      period: insights.period,
    };
    const result = await generateJSON({
      system: `You are a friendly expense insights assistant. Given group spending data, write a brief 2-3 sentence summary highlighting interesting patterns, who's been spending the most, and any notable trends. Keep it casual and helpful. All monetary values are already in Philippine Pesos (₱) as decimal amounts (e.g. "120.00" means ₱120.00) — use them exactly as given, do not rescale. Return JSON: {"summary": "your text here"}`,
      prompt: JSON.stringify(promptPayload),
      schema: llmSummarySchema,
    });
    return result.data?.summary ?? null;
  }

  if (provider.name === "api") {
    const result = await callAiEndpoint<{ summary: string | null }>("/insights-summary", {
      group_id: groupId,
      group_name: groupName,
      insights,
    });
    return result.data?.summary ?? null;
  }

  return null;
}
