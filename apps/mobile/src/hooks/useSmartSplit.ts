import { useState, useCallback } from "react";
import type { SmartSplitResult } from "@template/shared/types";
import { suggestSplitMobile } from "@/lib/ai/smart-split";

type UseSmartSplitOptions = {
  groupId: string;
};

export function useSmartSplit({ groupId }: UseSmartSplitOptions) {
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
      const res = await suggestSplitMobile({
        groupId,
        itemName: opts.itemName,
        amountCents: opts.amountCents,
        memberNames: opts.memberNames,
        context: opts.context,
      });
      if (res.error) {
        setError(res.error);
        return null;
      }
      setResult(res.data);
      return res.data;
    } finally {
      setIsLoading(false);
    }
  }, [groupId]);

  const clear = useCallback(() => {
    setResult(null);
    setError(null);
  }, []);

  return { result, isLoading, error, suggest, clear };
}
