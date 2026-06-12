// send-push: receives database trigger events (via pg_net) and delivers
// Expo push notifications to the relevant group members.
//
// Deploy:  supabase functions deploy send-push --no-verify-jwt
// Configure (SQL, per environment):
//   INSERT INTO settleup.app_config (key, value) VALUES
//     ('push_webhook_url',    'https://<ref>.supabase.co/functions/v1/send-push'),
//     ('push_webhook_secret', '<random secret>');
// The same secret must be set as a function secret:
//   supabase secrets set PUSH_WEBHOOK_SECRET=<random secret>

import { createClient } from "npm:@supabase/supabase-js@2";

type TriggerPayload = {
  event: "expense_added" | "payment_pending" | "payment_confirmed";
  record: Record<string, unknown>;
};

type ExpoPushMessage = {
  to: string;
  title: string;
  body: string;
  data: Record<string, unknown>;
  sound: "default";
};

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";

function formatPHP(cents: number): string {
  return `₱${(cents / 100).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

Deno.serve(async (req) => {
  const secret = Deno.env.get("PUSH_WEBHOOK_SECRET");
  if (!secret || req.headers.get("x-push-secret") !== secret) {
    return new Response("unauthorized", { status: 401 });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { db: { schema: "settleup" } },
  );

  let payload: TriggerPayload;
  try {
    payload = (await req.json()) as TriggerPayload;
  } catch {
    return new Response("bad request", { status: 400 });
  }

  const record = payload.record;
  const groupId = record["group_id"] as string | undefined;
  if (!groupId) return new Response("ok", { status: 200 });

  const [{ data: group }, { data: members }] = await Promise.all([
    supabase.from("groups").select("name").eq("id", groupId).single(),
    supabase.from("group_members").select("id, display_name, user_id").eq("group_id", groupId),
  ]);
  const groupName = group?.name ?? "your group";
  const memberById = new Map((members ?? []).map((m) => [m.id as string, m]));

  // Decide recipients (user ids) + message per event
  let recipientUserIds: string[] = [];
  let title = groupName;
  let body = "";

  if (payload.event === "expense_added") {
    const itemName = (record["item_name"] as string) ?? "an expense";
    const amount = formatPHP((record["amount_cents"] as number) ?? 0);
    const creator = record["created_by_user_id"] as string | null;
    recipientUserIds = (members ?? [])
      .map((m) => m.user_id as string | null)
      .filter((id): id is string => id !== null && id !== creator);
    body = `New expense: ${itemName} (${amount})`;
  } else if (payload.event === "payment_pending") {
    const from = memberById.get(record["from_member_id"] as string);
    const to = memberById.get(record["to_member_id"] as string);
    const amount = formatPHP((record["amount_cents"] as number) ?? 0);
    const toUserId = to?.user_id as string | null;
    if (toUserId) recipientUserIds = [toUserId];
    body = `${from?.display_name ?? "Someone"} says they paid you ${amount} — tap to confirm`;
  } else if (payload.event === "payment_confirmed") {
    const from = memberById.get(record["from_member_id"] as string);
    const to = memberById.get(record["to_member_id"] as string);
    const amount = formatPHP((record["amount_cents"] as number) ?? 0);
    const fromUserId = from?.user_id as string | null;
    if (fromUserId) recipientUserIds = [fromUserId];
    body = `${to?.display_name ?? "The recipient"} confirmed your ${amount} payment`;
  }

  if (recipientUserIds.length === 0 || !body) {
    return new Response("ok", { status: 200 });
  }

  const { data: tokens } = await supabase
    .from("push_tokens")
    .select("token")
    .in("user_id", recipientUserIds);

  const messages: ExpoPushMessage[] = (tokens ?? []).map((t) => ({
    to: t.token as string,
    title,
    body,
    data: { group_id: groupId, event: payload.event },
    sound: "default",
  }));

  // Expo accepts batches of up to 100 messages
  for (let i = 0; i < messages.length; i += 100) {
    const chunk = messages.slice(i, i + 100);
    const res = await fetch(EXPO_PUSH_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(chunk),
    });
    if (!res.ok) {
      console.error("expo push send failed", res.status, await res.text());
    }
  }

  return new Response(JSON.stringify({ sent: messages.length }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
});
