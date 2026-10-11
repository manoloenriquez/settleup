import type { ApiResponse } from "@template/shared";
import type { SmartSplitResult } from "@template/shared/types";
import { equalSplit } from "@template/shared";
import { getAvailability, interpretSplit } from "./apple-intelligence";
import { splitInterpretationToResult } from "./interpretation";

type SmartSplitInput = {
  itemName: string;
  amountCents: number;
  memberNames: string[];
  context?: string;
};

/**
 * Smart split: the on-device model reads the description ("Ana had two
 * drinks, Ben skipped dessert") and reports percentages, weights, fixed amounts
 * or exclusions; the cents are computed here with the same split functions the
 * manual form uses. Anything the description cannot express falls back to an
 * equal split and says so.
 */
export async function suggestSplitMobile(input: SmartSplitInput): Promise<ApiResponse<SmartSplitResult>> {
  const { itemName, amountCents, memberNames, context } = input;

  if (memberNames.length === 0) {
    return { data: null, error: "No members to split between" };
  }

  if (context?.trim()) {
    const availability = await getAvailability();
    if (availability.status === "available") {
      const result = await interpretSplit({ itemName, amount: amountCents / 100, memberNames, context: context.trim() });
      if (result.error !== null) {
        return { data: null, error: result.error };
      }
      const applied = splitInterpretationToResult(result.data, amountCents, memberNames);
      if (applied) return { data: applied, error: null };
      return { data: equalFallback(amountCents, memberNames, "Couldn't apply that description to the members, so this is an equal split."), error: null };
    }
  }

  return { data: equalFallback(amountCents, memberNames, null), error: null };
}

function equalFallback(amountCents: number, memberNames: string[], explanation: string | null): SmartSplitResult {
  const shares = equalSplit(amountCents, memberNames.length);
  return {
    mode: "equal",
    suggestions: memberNames.map((name, i) => ({ member_name: name, share_cents: shares[i]!, reason: null })),
    explanation,
    confidence: 1,
  };
}
