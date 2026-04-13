import { Hono } from "hono";
import { z } from "zod";
import { generateInsightsSummary } from "@template/ai";
import { insightsSummarySchema } from "@template/shared/schemas";
import { authMiddleware, type AuthEnv } from "../middleware/auth";
import { rateLimitMiddleware } from "../middleware/rate-limit";
import { requireGroupMember } from "../middleware/group-member";

const inputSchema = z.object({
  group_id: z.string().uuid(),
  group_name: z.string(),
  insights: insightsSummarySchema.omit({ llm_summary: true }),
});

const insightsSummary = new Hono<AuthEnv & { Variables: { parsedBody: unknown } }>();

insightsSummary.post("/", authMiddleware, requireGroupMember(), rateLimitMiddleware, async (c) => {
  const parsed = inputSchema.safeParse(c.get("parsedBody"));
  if (!parsed.success) {
    return c.json({ data: null, error: parsed.error.issues[0]?.message ?? "Invalid input" }, 400);
  }

  const summary = await generateInsightsSummary(parsed.data.insights, parsed.data.group_name);
  return c.json({ data: { summary }, error: null });
});

export default insightsSummary;
