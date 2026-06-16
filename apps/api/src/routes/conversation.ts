import { Hono } from "hono";
import { z } from "zod";
import { parseConversation } from "@template/ai";
import { conversationMessageSchema } from "@template/shared/schemas";
import { AI_LIMITS } from "@template/shared/constants";
import { authMiddleware, type AuthEnv } from "../middleware/auth";
import { rateLimitMiddleware } from "../middleware/rate-limit";
import { requireGroupMember } from "../middleware/group-member";

const inputSchema = z.object({
  group_id: z.string().uuid(),
  messages: z.array(conversationMessageSchema).min(1).max(AI_LIMITS.MAX_CONVERSATION_MESSAGES),
  member_names: z.array(z.string()),
});

const conversation = new Hono<AuthEnv & { Variables: { parsedBody: unknown } }>();

conversation.post("/", authMiddleware, requireGroupMember(), rateLimitMiddleware, async (c) => {
  const parsed = inputSchema.safeParse(c.get("parsedBody"));
  if (!parsed.success) {
    return c.json({ data: null, error: parsed.error.issues[0]?.message ?? "Invalid input" }, 400);
  }

  const result = await parseConversation({
    messages: parsed.data.messages,
    member_names: parsed.data.member_names,
  });

  return c.json(result);
});

export default conversation;
