-- Push notifications: device token registry + database triggers that fan
-- events out to the send-push edge function via pg_net.
--
-- The trigger is a no-op until ops seeds settleup.app_config with
-- 'push_webhook_url' (the send-push function URL) and
-- 'push_webhook_secret' (shared secret the function verifies), so this is
-- safe to apply before the edge function is deployed.

CREATE EXTENSION IF NOT EXISTS pg_net;

-- ---------------------------------------------------------------------------
-- 1. Device push tokens (one row per user+device)
-- ---------------------------------------------------------------------------

CREATE TABLE settleup.push_tokens (
  user_id    UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  token      TEXT        NOT NULL,
  platform   TEXT        NOT NULL CHECK (platform IN ('ios', 'android')),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, token)
);

ALTER TABLE settleup.push_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "push_tokens_owner_all"
  ON settleup.push_tokens FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- 2. Service-managed config (no client access: RLS on, no policies)
-- ---------------------------------------------------------------------------

CREATE TABLE settleup.app_config (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

ALTER TABLE settleup.app_config ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- 3. Event fan-out trigger
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION settleup.notify_push_event()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = settleup
AS $$
DECLARE
  v_url    TEXT;
  v_secret TEXT;
  v_event  TEXT;
  v_payload JSONB;
BEGIN
  SELECT value INTO v_url FROM app_config WHERE key = 'push_webhook_url';
  SELECT value INTO v_secret FROM app_config WHERE key = 'push_webhook_secret';
  IF v_url IS NULL OR v_secret IS NULL THEN
    RETURN NULL; -- push not configured in this environment
  END IF;

  v_event := TG_ARGV[0];
  v_payload := jsonb_build_object(
    'event', v_event,
    'record', to_jsonb(NEW)
  );

  PERFORM net.http_post(
    url := v_url,
    body := v_payload,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-push-secret', v_secret
    ),
    timeout_milliseconds := 3000
  );

  RETURN NULL;
EXCEPTION WHEN OTHERS THEN
  -- Never let notification plumbing break the underlying write.
  RETURN NULL;
END;
$$;

-- New expense added
DROP TRIGGER IF EXISTS trg_push_expense_added ON settleup.expenses;
CREATE TRIGGER trg_push_expense_added
  AFTER INSERT ON settleup.expenses
  FOR EACH ROW
  EXECUTE FUNCTION settleup.notify_push_event('expense_added');

-- Friend reported a payment (PENDING) — notify the recipient
DROP TRIGGER IF EXISTS trg_push_payment_pending ON settleup.payments;
CREATE TRIGGER trg_push_payment_pending
  AFTER INSERT ON settleup.payments
  FOR EACH ROW
  WHEN (NEW.status = 'PENDING')
  EXECUTE FUNCTION settleup.notify_push_event('payment_pending');

-- Pending payment confirmed — notify the payer
DROP TRIGGER IF EXISTS trg_push_payment_confirmed ON settleup.payments;
CREATE TRIGGER trg_push_payment_confirmed
  AFTER UPDATE ON settleup.payments
  FOR EACH ROW
  WHEN (OLD.status = 'PENDING' AND NEW.status = 'PAID')
  EXECUTE FUNCTION settleup.notify_push_event('payment_confirmed');
