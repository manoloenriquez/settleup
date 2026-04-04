import type { ApiResponse } from "@template/shared";
import type { SmartSplitResult } from "@template/shared/types";
import { smartSplitResultSchema } from "@template/shared/schemas";
import { equalSplit } from "@template/shared";
import { generateJSON } from "./index";
import { callAiEndpoint } from "./api-provider";
import { resolveProvider } from "./provider";

type SmartSplitInput = {
  groupId: string;
  itemName: string;
  amountCents: number;
  memberNames: string[];
  context?: string;
};

export async function suggestSplitMobile(input: SmartSplitInput): Promise<ApiResponse<SmartSplitResult>> {
  const { groupId, itemName, amountCents, memberNames, context } = input;

  if (memberNames.length === 0) {
    return { data: null, error: "No members to split between" };
  }

  const provider = await resolveProvider();

  if (provider.name === "apple-intelligence" && context) {
    return generateJSON<SmartSplitResult>({
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
- Consider the context hint to decide splits`,
      prompt: `Expense: "${itemName}" for ${amountCents} cents
Members: ${memberNames.join(", ")}
Context: ${context}`,
      schema: smartSplitResultSchema,
    });
  }

  if (provider.name === "api" && context) {
    return callAiEndpoint<SmartSplitResult>("/smart-split", {
      group_id: groupId,
      item_name: itemName,
      amount_cents: amountCents,
      member_names: memberNames,
      context,
    });
  }

  // Fallback: equal split
  const shares = equalSplit(amountCents, memberNames.length);
  return {
    data: {
      mode: "equal",
      suggestions: memberNames.map((name, i) => ({
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
