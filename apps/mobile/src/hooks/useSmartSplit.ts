import { useState, useCallback } from "react";
import type { SmartSplitResult } from "@template/shared/types";
import { suggestSplitMobile } from "@/lib/ai/smart-split";

export function useSmartSplit() {
  const [result, setResult] = useState<SmartSplitResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const suggest = useCallback(async (opts: {
    itemName: string;
    amountCents: number;
    memberNames: string[];
    context: string;
  }) => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await suggestSplitMobile(opts);
      if (res.error) {
        setError(res.error);
        return null;
      }
      setResult(res.data);
      return res.data;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const clear = useCallback(() => {
    setResult(null);
    setError(null);
  }, []);

  return { result, isLoading, error, suggest, clear };
}
