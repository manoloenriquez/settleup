import { generateInsightsSummary } from "@template/ai";
import { insightsSummarySchema } from "@template/shared/schemas";
import { z } from "zod";
import { enforceAiRateLimit, jsonResponse, requireBearerUser, requireGroupMember } from "../_lib";

export const runtime = "nodejs";

const inputSchema = z.object({
  group_id: z.string().uuid(),
  group_name: z.string(),
  insights: insightsSummarySchema.omit({ llm_summary: true }),
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

  const summary = await generateInsightsSummary(parsed.data.insights, parsed.data.group_name);
  return jsonResponse({ data: { summary }, error: null });
}
