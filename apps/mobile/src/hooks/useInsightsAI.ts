import { useState, useCallback } from "react";
import type { InsightsSummary } from "@template/shared/types";
import { generateInsightsSummaryMobile } from "@/lib/ai/insights";

export function useInsightsAI() {
  const [summary, setSummary] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);

  const generate = useCallback(async (opts: {
    groupId: string;
    groupName: string;
    insights: Omit<InsightsSummary, "llm_summary">;
  }) => {
    setIsGenerating(true);
    try {
      const text = await generateInsightsSummaryMobile(opts);
      setSummary(text);
    } finally {
      setIsGenerating(false);
    }
  }, []);

  return { summary, isGenerating, generate };
}
