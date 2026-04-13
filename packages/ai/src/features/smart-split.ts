import type { ApiResponse } from "@template/shared/types";
import type { SmartSplitResult } from "@template/shared/types";
import { smartSplitResultSchema } from "@template/shared/schemas";
import { equalSplit } from "@template/shared";
import { generateJSON } from "../core/generate";
import { isLLMEnabled } from "../core/flags";

type SmartSplitInput = {
  item_name: string;
  amount_cents: number;
  member_names: string[];
  context?: string;
};

export async function suggestSplit(input: SmartSplitInput): Promise<ApiResponse<SmartSplitResult>> {
  const { item_name, amount_cents, member_names, context } = input;

  if (member_names.length === 0) {
    return { data: null, error: "No members to split between" };
  }

  if (isLLMEnabled() && context) {
    const result = await generateJSON<SmartSplitResult>({
      system: `You are a smart expense splitter. Given an expense and group members, suggest how to split the cost.
Return JSON:
- mode: "equal" or "custom"
- suggestions: array of {member_name, share_cents, reason}
- explanation: brief explanation of the split logic
- confidence: 0-1

Rules:
- share_cents must sum to exactly the total amount
- All amounts are integer cents
- If you're not confident about a custom split, default to equal
- Consider the context hint to decide splits. Examples:
  - "Manolo had 2 drinks, others had 1" → proportional (Manolo gets 2x share)
  - "Ana and Bob didn't eat, only paid for drinks" → exclude them from food line items
  - "Split 60/40 between Manolo and Yao" → percentage-based split
  - "Manolo pays a fixed ₱200, rest split equally" → subtract fixed amount then equal split`,
      prompt: `Expense: "${item_name}" for ${amount_cents} cents
Members: ${member_names.join(", ")}
Context: ${context ?? "none"}`,
      schema: smartSplitResultSchema,
    });

    if (result.data) return result;
    // Fall through to equal split on LLM error
  }

  // Fallback: equal split
  const shares = equalSplit(amount_cents, member_names.length);
  return {
    data: {
      mode: "equal",
      suggestions: member_names.map((name, i) => ({
        member_name: name,
        share_cents: shares[i]!,
        reason: null,
      })),
      explanation: null,
      confidence: 1,
    },
    error: null,
  };
}
