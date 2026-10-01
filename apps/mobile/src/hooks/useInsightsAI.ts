import { useState, useCallback } from "react";
import type { InsightsSummary } from "@template/shared/types";
import type { CurrencyCode } from "@template/shared";
import { generateInsightsSummaryMobile } from "@/lib/ai/insights";

export function useInsightsAI() {
  const [summary, setSummary] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);

  const generate = useCallback(async (opts: {
    groupName: string;
    insights: Omit<InsightsSummary, "llm_summary">;
    currency: CurrencyCode;
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
