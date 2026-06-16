import type { MiddlewareHandler } from "hono";
import { createUserScopedClient } from "../lib/supabase";
import type { AuthEnv } from "./auth";

/**
 * Ensures the authenticated user is a member of the group in the request body.
 * Reads `group_id` from the parsed JSON body and rejects with 403 otherwise.
 *
 * Must run AFTER `authMiddleware`.
 *
 * The body is cached on the context as `parsedBody` so handlers can reuse it
 * without reading the stream twice.
 */
export const requireGroupMember = (): MiddlewareHandler<
  AuthEnv & { Variables: { parsedBody: unknown } }
> => {
  return async (c, next) => {
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ data: null, error: "Invalid JSON" }, 400);
    }

    const groupId =
      body && typeof body === "object" && "group_id" in body
        ? (body as { group_id: unknown }).group_id
        : null;

    if (typeof groupId !== "string") {
      return c.json({ data: null, error: "Missing group_id" }, 400);
    }

    const user = c.get("user");
    const token = c.get("token");
    const supabase = createUserScopedClient(token);

    const { data: member } = await supabase
      .schema("settleup")
      .from("group_members")
      .select("id")
      .eq("group_id", groupId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (!member) {
      return c.json({ data: null, error: "You are not a member of this group." }, 403);
    }

    c.set("parsedBody", body);
    await next();
    return undefined;
  };
};
