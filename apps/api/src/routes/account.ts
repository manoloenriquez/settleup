import { Hono } from "hono";
import { QR_BUCKET } from "@template/shared";
import { authMiddleware, type AuthEnv } from "../middleware/auth";
import { createUserScopedClient } from "../lib/supabase";

const account = new Hono<AuthEnv>();

// This project shares Auth with other applications. Close only this app's
// identity using the caller's JWT; never delete the shared Auth login.
account.delete("/", authMiddleware, async (c) => {
  const client = createUserScopedClient(c.get("token"));
  const userId = c.get("user").id;
  // Closing removes the payment profile row; its public QR images must not
  // outlive the account (the web app does the same). Remove them only after
  // closure succeeds, so a failed closure leaves the profile intact. The
  // owner-folder storage policy still applies after closure. Best effort.
  const { data: files } = await client.storage.from(QR_BUCKET).list(userId, { limit: 1000 });
  const { error } = await client.schema("settleup").rpc("close_account");
  if (error) {
    console.error("[api] account closure failed", { userId, code: error.code });
    return c.json({ data: null, error: "Could not close account. Please try again." }, 500);
  }
  if (files && files.length > 0) {
    const { error: removeError } = await client.storage
      .from(QR_BUCKET)
      .remove(files.map((file) => `${userId}/${file.name}`));
    if (removeError) console.error("[api] QR image cleanup failed", { userId, message: removeError.message });
  }
  return c.json({ data: { closed: true }, error: null });
});

export default account;
