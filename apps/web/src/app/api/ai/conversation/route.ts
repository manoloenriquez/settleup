import { parseConversation } from "@template/ai";
import { AI_LIMITS } from "@template/shared/constants";
import { conversationMessageSchema } from "@template/shared/schemas";
import { z } from "zod";
import { enforceAiRateLimit, jsonResponse, requireBearerUser, requireGroupMember } from "../_lib";

export const runtime = "nodejs";

const inputSchema = z.object({
  group_id: z.string().uuid(),
  messages: z.array(conversationMessageSchema).min(1).max(AI_LIMITS.MAX_CONVERSATION_MESSAGES),
  member_names: z.array(z.string()),
});

export async function POST(request: Request): Promise<Response> {
  const auth = await requireBearerUser(request);
  if (!auth.ok) return auth.response;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ data: null, error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = inputSchema.safeParse(body);
  if (!parsed.success) {
    return jsonResponse({ data: null, error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }

  const member = await requireGroupMember(auth.data.token, auth.data.user.id, parsed.data.group_id);
  if (!member.ok) return member.response;

  const rate = await enforceAiRateLimit(auth.data.token);
  if (!rate.ok) return rate.response;

  const result = await parseConversation({
    messages: parsed.data.messages,
    member_names: parsed.data.member_names,
  });

  return jsonResponse(result);
}
