import { Hono } from "hono";
import { z } from "zod";
import { suggestSplit } from "@template/ai";
import { authMiddleware, type AuthEnv } from "../middleware/auth";
import { rateLimitMiddleware } from "../middleware/rate-limit";
import { requireGroupMember } from "../middleware/group-member";

const inputSchema = z.object({
  group_id: z.string().uuid(),
  item_name: z.string().min(1),
  amount_cents: z.number().int().positive(),
  member_names: z.array(z.string()),
  context: z.string().optional(),
});

const smartSplit = new Hono<AuthEnv & { Variables: { parsedBody: unknown } }>();

smartSplit.post("/", authMiddleware, requireGroupMember(), rateLimitMiddleware, async (c) => {
  const parsed = inputSchema.safeParse(c.get("parsedBody"));
  if (!parsed.success) {
    return c.json({ data: null, error: parsed.error.issues[0]?.message ?? "Invalid input" }, 400);
  }

  const result = await suggestSplit({
    item_name: parsed.data.item_name,
    amount_cents: parsed.data.amount_cents,
    member_names: parsed.data.member_names,
    context: parsed.data.context,
  });

  return c.json(result);
});

export default smartSplit;
