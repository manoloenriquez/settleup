-- Product events: first-party, insert-only telemetry for the PRD 12.4 taxonomy.
--
-- Privacy by construction: the event name is limited to the sixteen PRD
-- names, and `properties` is validated against a per-event allowlist of keys
-- with enumerated values. There is no free-text column, so group names,
-- member names, notes, amounts, account numbers, receipt content and share
-- tokens cannot be stored even by a buggy client.
--
-- Signed-in clients insert their own rows through RLS with per-column grants
-- (they cannot set id or occurred_at). Anonymous public-link pages go through
-- settleup.track_public_event, which resolves the share token to a member or
-- group and rate-limits on that identity. Only admins can read.
--
-- Independent of the unapplied currency migration.

-- ---------------------------------------------------------------------------
-- 1. Allowed properties per event
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION settleup.product_event_spec(p_event text)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE p_event
    WHEN 'account_created'          THEN '{}'::jsonb
    WHEN 'group_created'            THEN '{}'::jsonb
    WHEN 'member_added'             THEN '{}'::jsonb
    WHEN 'expense_draft_started'    THEN '{"entry_mode":["quick","detailed","itemized","chat","receipt"]}'::jsonb
    WHEN 'expense_saved'            THEN '{"entry_mode":["quick","detailed","itemized","chat","receipt"],"participant_bucket":["1","2","3-5","6-10","11+"]}'::jsonb
    WHEN 'expense_save_failed'      THEN '{"error_class":["validation","conflict","network","permission","unknown"]}'::jsonb
    WHEN 'public_link_copied'       THEN '{"link_type":["group","member"]}'::jsonb
    WHEN 'public_link_opened'       THEN '{"link_type":["group","member"],"status":["valid","invalid"]}'::jsonb
    WHEN 'payment_details_actioned' THEN '{"action":["copy","qr"]}'::jsonb
    WHEN 'payment_claim_submitted'  THEN '{}'::jsonb
    WHEN 'payment_claim_resolved'   THEN '{"status":["confirmed","rejected"]}'::jsonb
    WHEN 'offline_action_queued'    THEN '{}'::jsonb
    WHEN 'offline_action_resolved'  THEN '{"status":["synced","conflict","failed"]}'::jsonb
    WHEN 'ai_draft_generated'       THEN '{"source":["chat","receipt"]}'::jsonb
    WHEN 'ai_draft_resolved'        THEN '{"status":["accepted","edited","discarded"]}'::jsonb
    WHEN 'group_settled'            THEN '{}'::jsonb
    ELSE NULL
  END;
$$;

-- True only when every spec key is present with an allowed string value and
-- nothing else is supplied.
CREATE OR REPLACE FUNCTION settleup.product_event_properties_valid(p_event text, p_properties jsonb)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_spec jsonb := settleup.product_event_spec(p_event);
  v_key  text;
  v_val  jsonb;
BEGIN
  IF v_spec IS NULL OR p_properties IS NULL OR jsonb_typeof(p_properties) <> 'object' THEN
    RETURN false;
  END IF;
  FOR v_key, v_val IN SELECT * FROM jsonb_each(p_properties) LOOP
    IF NOT (v_spec ? v_key) THEN RETURN false; END IF;
    IF jsonb_typeof(v_val) <> 'string' THEN RETURN false; END IF;
    IF NOT (v_spec -> v_key) ? (v_val #>> '{}') THEN RETURN false; END IF;
  END LOOP;
  RETURN (SELECT count(*) FROM jsonb_object_keys(v_spec)) = (SELECT count(*) FROM jsonb_object_keys(p_properties));
END;
$$;

-- CHECK constraints run these under the inserting role, so signed-in clients
-- need EXECUTE. Both are pure functions over their arguments; no table access.
REVOKE ALL ON FUNCTION settleup.product_event_spec(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION settleup.product_event_properties_valid(text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION settleup.product_event_spec(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION settleup.product_event_properties_valid(text, jsonb) TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. Table
-- ---------------------------------------------------------------------------

CREATE TABLE settleup.product_events (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  event_name  text        NOT NULL CHECK (settleup.product_event_spec(event_name) IS NOT NULL),
  occurred_at timestamptz NOT NULL DEFAULT now(),
  user_id     uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  platform    text        NOT NULL CHECK (platform IN ('web', 'ios', 'android', 'server')),
  properties  jsonb       NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT product_events_properties_allowlisted
    CHECK (settleup.product_event_properties_valid(event_name, properties))
);

CREATE INDEX product_events_occurred_at_idx ON settleup.product_events (occurred_at DESC);
CREATE INDEX product_events_name_occurred_idx ON settleup.product_events (event_name, occurred_at DESC);

ALTER TABLE settleup.product_events ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON settleup.product_events FROM PUBLIC, anon, authenticated;
-- Per-column insert: clients cannot choose id or occurred_at.
GRANT INSERT (event_name, user_id, platform, properties) ON settleup.product_events TO authenticated;
GRANT SELECT ON settleup.product_events TO authenticated;

CREATE POLICY product_events_insert_own
  ON settleup.product_events FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND platform IN ('web', 'ios', 'android')
    AND NOT settleup.is_account_closed()
  );

CREATE POLICY product_events_admin_read
  ON settleup.product_events FOR SELECT TO authenticated
  USING (public.is_admin());

-- No update or delete policies: rows are immutable from the client side.

-- Closing this app's account detaches its events (global Auth deletion is
-- covered by ON DELETE SET NULL).
CREATE OR REPLACE FUNCTION settleup.detach_product_events_on_closure()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = settleup
AS $$
BEGIN
  UPDATE product_events SET user_id = NULL WHERE user_id = NEW.user_id;
  RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION settleup.detach_product_events_on_closure() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER trg_detach_product_events_on_closure
  AFTER INSERT ON settleup.closed_accounts
  FOR EACH ROW EXECUTE FUNCTION settleup.detach_product_events_on_closure();

-- ---------------------------------------------------------------------------
-- 3. Anonymous public-link events
-- ---------------------------------------------------------------------------

CREATE TABLE settleup.product_event_limits (
  limit_key    uuid        PRIMARY KEY,
  window_start timestamptz NOT NULL,
  attempts     integer     NOT NULL CHECK (attempts >= 0)
);
ALTER TABLE settleup.product_event_limits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON settleup.product_event_limits FROM PUBLIC, anon, authenticated;

-- Records one of the three public-link events. Returns true when stored.
-- A share token is resolved to its member or group id, which keys a fixed
-- window limit (60 per five minutes). A null token records an invalid-link
-- open against a shared sentinel key so abuse stays bounded. Never raises for
-- limit or lookup reasons: telemetry must not affect the page.
CREATE OR REPLACE FUNCTION settleup.track_public_event(
  p_share_token text,
  p_event_name  text,
  p_properties  jsonb DEFAULT '{}'::jsonb
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = settleup
AS $$
DECLARE
  v_key      uuid;
  v_attempts integer;
BEGIN
  IF p_event_name NOT IN ('public_link_opened', 'payment_details_actioned', 'payment_claim_submitted') THEN
    RAISE EXCEPTION 'Unsupported public event' USING ERRCODE = '22023';
  END IF;
  IF NOT product_event_properties_valid(p_event_name, p_properties) THEN
    RAISE EXCEPTION 'Invalid event properties' USING ERRCODE = '22023';
  END IF;

  IF p_share_token IS NOT NULL THEN
    SELECT id INTO v_key FROM group_members WHERE share_token = p_share_token AND departed_at IS NULL;
    IF v_key IS NULL THEN
      SELECT id INTO v_key FROM groups WHERE share_token = p_share_token;
    END IF;
    IF v_key IS NULL THEN
      RETURN false; -- unknown token: nothing to attribute, nothing to reveal
    END IF;
  ELSE
    IF p_event_name <> 'public_link_opened' OR p_properties ->> 'status' <> 'invalid' THEN
      RETURN false; -- only invalid opens may be recorded without a token
    END IF;
    v_key := '00000000-0000-0000-0000-000000000000'::uuid;
  END IF;

  INSERT INTO product_event_limits AS limits (limit_key, window_start, attempts)
    VALUES (v_key, now(), 1)
    ON CONFLICT (limit_key) DO UPDATE SET
      attempts     = CASE WHEN limits.window_start <= now() - interval '5 minutes' THEN 1 ELSE limits.attempts + 1 END,
      window_start = CASE WHEN limits.window_start <= now() - interval '5 minutes' THEN now() ELSE limits.window_start END
    RETURNING limits.attempts INTO v_attempts;
  IF v_attempts > 60 THEN
    RETURN false;
  END IF;

  INSERT INTO product_events (event_name, user_id, platform, properties)
    VALUES (p_event_name, NULL, 'web', p_properties);
  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION settleup.track_public_event(text, text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION settleup.track_public_event(text, text, jsonb) TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4. group_settled, derived on the server from the ledger itself
-- ---------------------------------------------------------------------------

-- Internal marker so each settlement is recorded once per group: a new event
-- is emitted only when no marker is newer than the group's latest expense.
CREATE TABLE settleup.group_settlements (
  group_id   uuid        NOT NULL REFERENCES settleup.groups(id) ON DELETE CASCADE,
  settled_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (group_id, settled_at)
);
ALTER TABLE settleup.group_settlements ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON settleup.group_settlements FROM PUBLIC, anon, authenticated;

-- After a payment becomes PAID, the group is settled when it has at least one
-- expense and every member's net balance (the get_member_balances formula) is
-- zero. Note for the deferred currency migration: once amounts carry a
-- currency code this check must run per currency, since balances in different
-- currencies must never net against each other.
CREATE OR REPLACE FUNCTION settleup.record_group_settled()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = settleup
AS $$
DECLARE
  v_unsettled integer;
  v_last_expense timestamptz;
BEGIN
  IF NEW.status <> 'PAID' THEN RETURN NULL; END IF;
  IF TG_OP = 'UPDATE' AND OLD.status = 'PAID' THEN RETURN NULL; END IF;

  SELECT max(created_at) INTO v_last_expense FROM expenses WHERE group_id = NEW.group_id;
  IF v_last_expense IS NULL THEN RETURN NULL; END IF;

  SELECT count(*) INTO v_unsettled
    FROM group_members gm
   WHERE gm.group_id = NEW.group_id
     AND (
       COALESCE((SELECT SUM(ep.paid_cents) FROM expense_payers ep WHERE ep.member_id = gm.id), 0)
       - COALESCE((SELECT SUM(epa.share_cents) FROM expense_participants epa WHERE epa.member_id = gm.id), 0)
       - COALESCE((SELECT SUM(p.amount_cents) FROM payments p WHERE p.to_member_id = gm.id AND p.status = 'PAID'), 0)
       + COALESCE((SELECT SUM(p.amount_cents) FROM payments p WHERE p.from_member_id = gm.id AND p.status = 'PAID'), 0)
     ) <> 0;
  IF v_unsettled > 0 THEN RETURN NULL; END IF;

  IF EXISTS (
    SELECT 1 FROM group_settlements
     WHERE group_id = NEW.group_id AND settled_at >= v_last_expense
  ) THEN
    RETURN NULL; -- already recorded for this ledger state
  END IF;

  INSERT INTO group_settlements (group_id) VALUES (NEW.group_id);
  INSERT INTO product_events (event_name, user_id, platform, properties)
    VALUES ('group_settled', NEW.created_by_user_id, 'server', '{}'::jsonb);
  RETURN NULL;
EXCEPTION WHEN OTHERS THEN
  RETURN NULL; -- telemetry never blocks a payment
END;
$$;
REVOKE ALL ON FUNCTION settleup.record_group_settled() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER trg_record_group_settled
  AFTER INSERT OR UPDATE OF status ON settleup.payments
  FOR EACH ROW EXECUTE FUNCTION settleup.record_group_settled();

-- ---------------------------------------------------------------------------
-- 5. account_created, recorded by the database for every sign-up method
-- ---------------------------------------------------------------------------

-- Email confirmation may delay the first session, and OAuth completes in a
-- redirect, so clients cannot record this reliably. The auth row insert can.
CREATE OR REPLACE FUNCTION settleup.record_account_created()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = settleup
AS $$
BEGIN
  INSERT INTO product_events (event_name, user_id, platform, properties)
    VALUES ('account_created', NEW.id, 'server', '{}'::jsonb);
  RETURN NULL;
EXCEPTION WHEN OTHERS THEN
  RETURN NULL; -- telemetry never blocks sign-up
END;
$$;
REVOKE ALL ON FUNCTION settleup.record_account_created() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER trg_record_account_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION settleup.record_account_created();
