-- account_created was recorded by a trigger on auth.users. This Supabase
-- project's auth is shared with other apps, so every app's sign-ups would be
-- counted as Talli accounts and their user ids stored in Talli's analytics.
-- Talli clients now record it themselves after signing in; the database keeps
-- at most one per user (repeat inserts fail and are ignored by the clients).

DROP TRIGGER IF EXISTS trg_record_account_created ON auth.users;
DROP FUNCTION IF EXISTS settleup.record_account_created();

-- Rows the dropped trigger wrote (platform 'server') may belong to other
-- apps' users; Talli clients record their own from now on.
DELETE FROM settleup.product_events
WHERE event_name = 'account_created' AND platform = 'server';

-- Keep the earliest account_created per user before enforcing one.
DELETE FROM settleup.product_events a
USING settleup.product_events b
WHERE a.event_name = 'account_created'
  AND b.event_name = 'account_created'
  AND a.user_id = b.user_id
  AND (a.occurred_at, a.ctid) > (b.occurred_at, b.ctid);

CREATE UNIQUE INDEX IF NOT EXISTS product_events_one_account_created
  ON settleup.product_events (user_id)
  WHERE event_name = 'account_created';
