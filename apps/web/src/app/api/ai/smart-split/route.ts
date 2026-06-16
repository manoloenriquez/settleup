import { suggestSplit } from "@template/ai";
import { z } from "zod";
import { enforceAiRateLimit, jsonResponse, requireBearerUser, requireGroupMember } from "../_lib";

export const runtime = "nodejs";

const inputSchema = z.object({
  group_id: z.string().uuid(),
  item_name: z.string().min(1),
  amount_cents: z.number().int().positive(),
  member_names: z.array(z.string()),
  context: z.string().optional(),
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

  const result = await suggestSplit({
    item_name: parsed.data.item_name,
    amount_cents: parsed.data.amount_cents,
    member_names: parsed.data.member_names,
    context: parsed.data.context,
  });

  return jsonResponse(result);
}
