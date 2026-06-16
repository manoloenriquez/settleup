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
 * profiles, user_payment_profiles, owned groups, etc.) are wired in the
 * database schema via FKs. Membership rows in groups owned by other users
 * are retained with group_members.user_id set to null for history.
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
