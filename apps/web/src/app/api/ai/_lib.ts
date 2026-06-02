import { createAnonClient, createUserScopedClient, type User } from "@template/supabase";
import { z } from "zod";

type RouteResult<T> =
  | { ok: true; data: T }
  | { ok: false; response: Response };

const rateLimitResultSchema = z.object({
  allowed: z.boolean(),
  retry_after_ms: z.number().int().nonnegative(),
});

export function jsonResponse<T>(
  body: T,
  init?: ResponseInit,
): Response {
  return Response.json(body, init);
}

export async function requireBearerUser(request: Request): Promise<RouteResult<{ user: User; token: string }>> {
  const token = request.headers.get("Authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) {
    return { ok: false, response: jsonResponse({ data: null, error: "Unauthorized" }, { status: 401 }) };
  }

  const supabase = createAnonClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser(token);

  if (error || !user) {
    return { ok: false, response: jsonResponse({ data: null, error: "Unauthorized" }, { status: 401 }) };
  }

  return { ok: true, data: { user, token } };
}

export async function requireGroupMember(token: string, userId: string, groupId: string): Promise<RouteResult<void>> {
  const supabase = createUserScopedClient(token);
  const { data: member } = await supabase
    .schema("settleup")
    .from("group_members")
    .select("id")
    .eq("group_id", groupId)
    .eq("user_id", userId)
    .maybeSingle();

  if (!member) {
    return {
      ok: false,
      response: jsonResponse({ data: null, error: "You are not a member of this group." }, { status: 403 }),
    };
  }

  return { ok: true, data: undefined };
}

export async function enforceAiRateLimit(token: string): Promise<RouteResult<void>> {
  const supabase = createUserScopedClient(token);
  const { data, error } = await supabase.rpc("consume_ai_rate_limit");

  if (error) {
    return { ok: true, data: undefined };
  }

  const parsed = rateLimitResultSchema.safeParse(data);
  if (!parsed.success) {
    return { ok: true, data: undefined };
  }

  if (!parsed.data.allowed) {
    return {
      ok: false,
      response: jsonResponse(
        {
          data: null,
          error: `Rate limited. Try again in ${Math.ceil(parsed.data.retry_after_ms / 1000)}s.`,
        },
        { status: 429 },
      ),
    };
  }

  return { ok: true, data: undefined };
}
