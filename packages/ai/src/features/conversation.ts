import type { ApiResponse } from "@template/shared/types";
import type { ExpenseDraft, ConversationMessage } from "@template/shared/types";
import { parseExpenseText, fuzzyMatchMember } from "@template/shared";

type ConversationInput = {
  messages: ConversationMessage[];
  member_names: string[];
};

export type ConversationResponse = {
  reply: string;
  draft: ExpenseDraft | null;
};

/**
 * Keyword expense entry for the web app ("Lunch 500 split Manolo Yao").
 * Deterministic; the full natural-language interpretation runs on iPhone with
 * Apple Intelligence and never on a server.
 */
export async function parseConversation(
  input: ConversationInput,
): Promise<ApiResponse<ConversationResponse>> {
  const { messages, member_names } = input;
  const lastMessage = messages[messages.length - 1];
  if (!lastMessage) {
    return { data: null, error: "No messages provided" };
  }
  return { data: parseWithHeuristics(lastMessage.content, member_names), error: null };
}

function parseWithHeuristics(
  text: string,
  memberNames: string[],
): ConversationResponse {
  const parsed = parseExpenseText(text);

  if (!parsed) {
    return {
      reply: "I couldn't understand that as an expense. Try something like: \"Lunch 500 split Manolo and Yao\"",
      draft: null,
    };
  }

  // Resolve participant names
  const participantNames: string[] = [];
  if (parsed.participantNames.length > 0) {
    const memberObjs = memberNames.map((n, i) => ({ display_name: n, id: String(i) }));
    for (const name of parsed.participantNames) {
      const matchId = fuzzyMatchMember(name, memberObjs);
      if (matchId !== null) {
        const matched = memberObjs.find((m) => m.id === matchId);
        if (matched) participantNames.push(matched.display_name);
      }
    }
  }

  const draft: ExpenseDraft = {
    item_name: parsed.itemName,
    amount_cents: parsed.amountCents ?? 0,
    confidence: 0.7,
    participant_names: participantNames.length > 0 ? participantNames : memberNames,
    payer_name: null,
    category_slug: "other",
    notes: null,
    date: null,
    source: "conversation",
  };

  return {
    reply: `Got it! "${parsed.itemName}" for ₱${((parsed.amountCents ?? 0) / 100).toFixed(2)}${participantNames.length > 0 ? ` split between ${participantNames.join(", ")}` : " split equally among everyone"}.`,
    draft,
  };
}
