import type { InsightsSummary } from "@template/shared/types";
import { getAvailability, summarizeInsights } from "./apple-intelligence";
import { buildInsightFacts } from "./interpretation";

type InsightsInput = {
  groupName: string;
  insights: Omit<InsightsSummary, "llm_summary">;
};

/**
 * Narrative summary of group spending. Every number is computed by
 * `computeInsights`; the on-device model only turns the resulting facts into a
 * couple of friendly sentences. Returns null when Apple Intelligence is
 * unavailable so the screen simply shows the statistics.
 */
export async function generateInsightsSummaryMobile(input: InsightsInput): Promise<string | null> {
  const availability = await getAvailability();
  if (availability.status !== "available") return null;
  const result = await summarizeInsights(buildInsightFacts(input.groupName, input.insights));
  return result.error === null ? result.data.trim() || null : null;
}
