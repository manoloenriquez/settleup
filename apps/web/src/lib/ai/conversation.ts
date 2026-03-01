import type { ApiResponse } from "@template/shared/types";
import type { ExpenseDraft, ConversationMessage } from "@template/shared/types";
import { expenseDraftSchema } from "@template/shared/schemas";
import { parseExpenseText, fuzzyMatchMember } from "@template/shared";
import { generateJSON, isLLMEnabled } from "./index";
import { z } from "zod";

type ConversationInput = {
  messages: ConversationMessage[];
  member_names: string[];
  userId: string;
};

const conversationResponseSchema = z.object({
  reply: z.string(),
  draft: expenseDraftSchema.nullable(),
});

type ConversationResponse = {
  reply: string;
  draft: ExpenseDraft | null;
};

export async function parseConversation(
  input: ConversationInput,
): Promise<ApiResponse<ConversationResponse>> {
  const { messages, member_names, userId } = input;
  const lastMessage = messages[messages.length - 1];
  if (!lastMessage) {
    return { data: null, error: "No messages provided" };
  }

  if (isLLMEnabled()) {
    const result = await generateJSON<ConversationResponse>({
      system: `You are a helpful expense tracking assistant for the app SettleUp Lite.
Users describe expenses in natural language. Extract expense details and return JSON:
- reply: a short friendly message confirming what you understood
- draft: null if the message isn't about an expense, otherwise an object with:
  - item_name: what was purchased
  - amount_cents: total cost in integer cents (e.g. 15000 for ₱150.00)
  - confidence: 0-1 how confident you are
  - participant_names: who should split this (empty array = everyone)
  - payer_name: who paid (null = unknown)
  - notes: any extra context (null if none)
  - source: always "conversation"

Group members: ${member_names.join(", ")}
Currency: Philippine Peso (₱). Multiply by 100 to get cents.`,
      prompt: messages.map((m) => `${m.role}: ${m.content}`).join("\n"),
      schema: conversationResponseSchema,
      userId,
    });

    if (result.data) return result;
    // Fall through to heuristic on LLM error
  }

  // Fallback: use existing parseExpenseText + fuzzyMatchMember
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
    notes: null,
    source: "conversation",
  };

  return {
    reply: `Got it! "${parsed.itemName}" for ₱${((parsed.amountCents ?? 0) / 100).toFixed(2)}${participantNames.length > 0 ? ` split between ${participantNames.join(", ")}` : " split equally among everyone"}.`,
    draft,
  };
}
