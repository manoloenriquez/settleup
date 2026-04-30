import { Hono } from "hono";
import { authMiddleware, type AuthEnv } from "../middleware/auth";
import { createServiceRoleClient } from "../lib/supabase";

const account = new Hono<AuthEnv>();

/**
 * Delete the authenticated user's own account.
 *
 * Auth: requires a valid Bearer token (authMiddleware). The user can only
 * delete themselves — we ignore any user_id in the body and use the JWT's
 * sub claim as the source of truth. Cascade deletes (profiles,
 * payment_profiles, group_members.user_id → null, etc.) are expected to
 * be wired in the database schema via FKs.
 */
account.delete("/", authMiddleware, async (c) => {
  const user = c.get("user");

  const admin = createServiceRoleClient();
  const { error } = await admin.auth.admin.deleteUser(user.id);

  if (error) {
    console.error("[api] account deletion failed", { userId: user.id, error: error.message });
    return c.json({ data: null, error: "Could not delete account. Please try again." }, 500);
  }

  return c.json({ data: { deleted: true }, error: null });
});

export default account;
