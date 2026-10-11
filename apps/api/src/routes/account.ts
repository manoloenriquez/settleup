import { Hono } from "hono";
import { authMiddleware, type AuthEnv } from "../middleware/auth";
import { createUserScopedClient } from "../lib/supabase";

const account = new Hono<AuthEnv>();

// This project shares Auth with other applications. Close only this app's
// identity using the caller's JWT; never delete the shared Auth login.
account.delete("/", authMiddleware, async (c) => {
  const client = createUserScopedClient(c.get("token"));
  const { error } = await client.schema("settleup").rpc("close_account");
  if (error) {
    console.error("[api] account closure failed", { userId: c.get("user").id, code: error.code });
    return c.json({ data: null, error: "Could not close account. Please try again." }, 500);
  }
  return c.json({ data: { closed: true }, error: null });
});

export default account;
