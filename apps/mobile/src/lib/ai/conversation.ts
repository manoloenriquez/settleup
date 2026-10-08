import type { ApiResponse } from "@template/shared";
import type { ExpenseDraft, ConversationMessage } from "@template/shared/types";
import { parseExpenseText, fuzzyMatchMember } from "@template/shared";
import { getAvailability, interpretExpense } from "./apple-intelligence";
import { interpretationToDraft } from "./interpretation";

export type ConversationResponse = {
  reply: string;
  draft: ExpenseDraft | null;
};

type ConversationInput = {
  messages: ConversationMessage[];
  memberNames: string[];
  members: { id: string; display_name: string }[];
  /** Display name of the signed-in member, so "me" resolves deterministically. */
  userName: string | null;
  /** Local YYYY-MM-DD for relative dates. */
  today: string;
};

/**
 * Natural-language expense entry. The on-device model interprets the message;
 * amounts, dates, categories and member names are then resolved by ordinary
 * code. Without Apple Intelligence the keyword parser that predates the AI
 * features handles the simple "Lunch 500 split Ana Ben" form.
 */
export async function parseConversationMobile(input: ConversationInput): Promise<ApiResponse<ConversationResponse>> {
  const { messages, memberNames, members, userName, today } = input;
  const lastMessage = messages[messages.length - 1];
  if (!lastMessage) {
    return { data: null, error: "No messages provided" };
  }

  const availability = await getAvailability();
  if (availability.status !== "available") {
    return { data: parseWithHeuristics(lastMessage.content, memberNames, members), error: null };
  }

  const result = await interpretExpense({
    text: lastMessage.content,
    history: messages.slice(0, -1).map((m) => ({ role: m.role, content: m.content })),
    memberNames,
    userName,
    today,
  });
  if (result.error !== null) {
    return { data: null, error: result.error };
  }
  return { data: interpretationToDraft(result.data, { text: lastMessage.content, userName, today }), error: null };
}

function parseWithHeuristics(
  text: string,
  memberNames: string[],
  members: { id: string; display_name: string }[],
): ConversationResponse {
  const parsed = parseExpenseText(text);

  if (!parsed || parsed.amountCents === null || parsed.amountCents <= 0) {
    return {
      reply: 'I couldn\'t understand that as an expense. Try something like: "Lunch 500 split Manolo and Yao"',
      draft: null,
    };
  }

  const participantNames: string[] = [];
  for (const name of parsed.participantNames) {
    const matchId = fuzzyMatchMember(name, members);
    if (matchId !== null) {
      const matched = members.find((m) => m.id === matchId);
      if (matched) participantNames.push(matched.display_name);
    }
  }

  const draft: ExpenseDraft = {
    item_name: parsed.itemName,
    amount_cents: parsed.amountCents,
    confidence: 0.7,
    participant_names: participantNames.length > 0 ? participantNames : memberNames,
    payer_name: null,
    category_slug: "other",
    notes: null,
    date: null,
    source: "conversation",
  };

  return {
    reply: `Got it! "${parsed.itemName}" for ₱${(parsed.amountCents / 100).toFixed(2)}${participantNames.length > 0 ? ` split between ${participantNames.join(", ")}` : " split equally among everyone"}.`,
    draft,
  };
}
