import type { ApiResponse } from "@template/shared/types";
import type { SmartSplitResult } from "@template/shared/types";
import { equalSplit } from "@template/shared";

type SmartSplitInput = {
  item_name: string;
  amount_cents: number;
  member_names: string[];
  context?: string;
};

/**
 * Equal split suggestion for the web app. Interpreting free-text split
 * descriptions is an on-device (Apple Intelligence) feature of the iPhone app.
 */
export async function suggestSplit(input: SmartSplitInput): Promise<ApiResponse<SmartSplitResult>> {
  const { amount_cents, member_names, context } = input;

  if (member_names.length === 0) {
    return { data: null, error: "No members to split between" };
  }

  const shares = equalSplit(amount_cents, member_names.length);
  return {
    data: {
      mode: "equal",
      suggestions: member_names.map((name, i) => ({
        member_name: name,
        share_cents: shares[i]!,
        reason: null,
      })),
      explanation: context?.trim()
        ? "Custom split descriptions are interpreted on iPhone with Apple Intelligence; this is an equal split."
        : null,
      confidence: 1,
    },
    error: null,
  };
}
