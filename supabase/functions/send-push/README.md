# send-push

Forwards Expo push messages that the database builds. Holds no service-role key and reads nothing from the database.

## How delivery works

1. `settleup.notify_push_event()` fires after an expense insert, a pending payment insert, or a pending-to-paid payment update (migration `20260612020000`, payload rewritten in `20260909120000`).
2. Inside the trigger, `settleup.build_push_messages(event, row)` resolves recipients and their tokens and returns finished Expo messages: group name as title, a short body, and `data: { group_id, event, route }`.
3. The trigger posts `{ messages }` to this function with the `x-push-secret` header via `pg_net`. Nothing is sent when `settleup.app_config` has no `push_webhook_url` or `push_webhook_secret`.
4. This function verifies the secret, forwards to Expo in batches of 100, and passes any `DeviceNotRegistered` tokens to `settleup.prune_push_tokens(secret, tokens)`, the only write it can perform.

Trigger failures never affect the underlying write; delivery is best effort with no retry queue.

## Deploy

```bash
supabase functions deploy send-push --no-verify-jwt
```

`--no-verify-jwt` is required because `pg_net` sends no user JWT. Authentication is the shared secret only.

## Secrets

```bash
supabase secrets set PUSH_WEBHOOK_SECRET="$(openssl rand -hex 32)"
# Optional but recommended: an Expo access token with push permission.
supabase secrets set EXPO_ACCESS_TOKEN="<token from expo.dev>"
```

`SUPABASE_URL` and `SUPABASE_ANON_KEY` are injected automatically for the prune RPC. Do not set `SUPABASE_SERVICE_ROLE_KEY` for this function.

## Enable delivery in the database

Run as the project owner (the table has no client policies):

```sql
INSERT INTO settleup.app_config (key, value) VALUES
  ('push_webhook_url',    'https://<project-ref>.supabase.co/functions/v1/send-push'),
  ('push_webhook_secret', '<same value as PUSH_WEBHOOK_SECRET>')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;
```

To disable delivery, delete either row.

## Verify

```bash
curl -s -X POST "https://<project-ref>.supabase.co/functions/v1/send-push" \
  -H "Content-Type: application/json" \
  -H "x-push-secret: <secret>" \
  -d '{"messages":[{"to":"ExponentPushToken[xxxxxxxx]","title":"Test","body":"Hello","data":{"group_id":"00000000-0000-0000-0000-000000000000","event":"expense_added","route":"/groups/00000000-0000-0000-0000-000000000000"}}]}'
```

Expected response: `{"sent":0,"failed":1,"pruned":0}` for a fake token (Expo rejects it), or `sent: 1` for a real device token. A wrong secret returns 401.

## Device side

`apps/mobile/src/services/push.ts` registers tokens into `settleup.push_tokens` under the owner's RLS policy and re-registers when Expo rotates the token. Taps route to `data.route` (currently always `/groups/<id>`, where new expenses and the pending-payment confirmation card are shown); unknown routes fall back to the group screen.
