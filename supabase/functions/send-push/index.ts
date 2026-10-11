// send-push: forwards database-built Expo push messages to Expo.
//
// The database trigger settleup.notify_push_event() resolves recipients and
// device tokens itself and posts `{ messages: ExpoPushMessage[] }` here.
// This function holds no database read access and no service-role key: it
// verifies the shared secret, forwards the messages, and asks the database to
// prune tokens Expo reports as DeviceNotRegistered through one narrow RPC
// that is guarded by the same secret.
//
// See README.md in this directory for deployment and configuration.

import { createClient } from "npm:@supabase/supabase-js@2";

type ExpoPushMessage = {
  to: string;
  title: string;
  body: string;
  data: Record<string, unknown>;
  sound: "default";
};

type ExpoTicket =
  | { status: "ok"; id: string }
  | { status: "error"; message?: string; details?: { error?: string } };

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";
const EXPO_BATCH = 100;
const MAX_MESSAGES = 1000;
const TOKEN_PATTERN = /^Expo(nent)?PushToken\[[^\]\s]{1,200}\]$/;

function timingSafeEqual(a: string, b: string): boolean {
  const left = new TextEncoder().encode(a);
  const right = new TextEncoder().encode(b);
  // Compare against self on length mismatch so timing does not reveal length.
  const other = left.length === right.length ? right : left;
  let diff = left.length === right.length ? 0 : 1;
  for (let i = 0; i < left.length; i++) diff |= left[i] ^ other[i];
  return diff === 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseMessages(input: unknown): ExpoPushMessage[] | null {
  if (!isRecord(input) || !Array.isArray(input.messages)) return null;
  if (input.messages.length > MAX_MESSAGES) return null;
  const messages: ExpoPushMessage[] = [];
  for (const candidate of input.messages) {
    if (!isRecord(candidate)) return null;
    const { to, title, body, data } = candidate;
    if (typeof to !== "string" || !TOKEN_PATTERN.test(to)) return null;
    if (typeof title !== "string" || title.length === 0 || title.length > 200) return null;
    if (typeof body !== "string" || body.length === 0 || body.length > 500) return null;
    if (!isRecord(data)) return null;
    messages.push({ to, title, body, data, sound: "default" });
  }
  return messages;
}

async function pruneTokens(secret: string, tokens: string[]): Promise<number> {
  if (tokens.length === 0) return 0;
  const url = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  if (!url || !anonKey) {
    console.error("prune skipped: SUPABASE_URL or SUPABASE_ANON_KEY missing");
    return 0;
  }
  const supabase = createClient(url, anonKey, { db: { schema: "settleup" } });
  const { data, error } = await supabase.rpc("prune_push_tokens", {
    p_secret: secret,
    p_tokens: tokens,
  });
  if (error) {
    console.error("prune_push_tokens failed", error.code);
    return 0;
  }
  return typeof data === "number" ? data : 0;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("method not allowed", { status: 405 });

  const secret = Deno.env.get("PUSH_WEBHOOK_SECRET");
  const presented = req.headers.get("x-push-secret") ?? "";
  if (!secret || !timingSafeEqual(presented, secret)) {
    return new Response("unauthorized", { status: 401 });
  }

  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return new Response("bad request", { status: 400 });
  }
  const messages = parseMessages(payload);
  if (messages === null) return new Response("bad request", { status: 400 });
  if (messages.length === 0) return Response.json({ sent: 0, failed: 0, pruned: 0 });

  const expoHeaders: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json",
  };
  const expoAccessToken = Deno.env.get("EXPO_ACCESS_TOKEN");
  if (expoAccessToken) expoHeaders["Authorization"] = `Bearer ${expoAccessToken}`;

  let sent = 0;
  let failed = 0;
  const unregistered: string[] = [];

  for (let i = 0; i < messages.length; i += EXPO_BATCH) {
    const chunk = messages.slice(i, i + EXPO_BATCH);
    let tickets: ExpoTicket[] = [];
    try {
      const res = await fetch(EXPO_PUSH_URL, {
        method: "POST",
        headers: expoHeaders,
        body: JSON.stringify(chunk),
      });
      if (!res.ok) {
        console.error("expo push send failed", res.status);
        failed += chunk.length;
        continue;
      }
      const parsed = (await res.json()) as { data?: ExpoTicket[] };
      tickets = Array.isArray(parsed.data) ? parsed.data : [];
    } catch (e) {
      console.error("expo push request error", e instanceof Error ? e.message : String(e));
      failed += chunk.length;
      continue;
    }

    chunk.forEach((message, index) => {
      const ticket = tickets[index];
      if (ticket?.status === "ok") {
        sent += 1;
        return;
      }
      failed += 1;
      if (ticket?.status === "error" && ticket.details?.error === "DeviceNotRegistered") {
        unregistered.push(message.to);
      } else if (ticket?.status === "error") {
        // Log the error class only; tokens and bodies stay out of logs.
        console.error("expo ticket error", ticket.details?.error ?? "unknown");
      }
    });
  }

  const pruned = await pruneTokens(secret, unregistered);
  return Response.json({ sent, failed, pruned });
});
