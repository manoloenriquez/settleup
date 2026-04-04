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
    const result = await generateJSON({
      system: `You are a friendly expense insights assistant. Given group spending data, write a brief 2-3 sentence summary highlighting interesting patterns, who's been spending the most, and any notable trends. Keep it casual and helpful. Currency is Philippine Peso (₱). Return JSON: {"summary": "your text here"}`,
      prompt: JSON.stringify({ groupName, ...insights }),
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
