-- Push delivery without a service-role client.
--
-- Previously the trigger posted the entire changed row to the send-push edge
-- function, which then used SUPABASE_SERVICE_ROLE_KEY to read group members
-- and device tokens. Now the database (already SECURITY DEFINER inside the
-- trigger) resolves recipients and tokens itself and posts only the finished
-- Expo messages. The edge function needs no database read access at all.
--
-- Token pruning is the single remaining write: Expo reports
-- DeviceNotRegistered per ticket, and the function hands those tokens to
-- settleup.prune_push_tokens, which is guarded by the same shared secret the
-- trigger sends. No other function may touch push_tokens on a caller's behalf.
--
-- Still a no-op until settleup.app_config holds push_webhook_url and
-- push_webhook_secret. Independent of the unapplied currency migration.

CREATE OR REPLACE FUNCTION settleup.format_php_cents(p_cents bigint)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = settleup
AS $$
  SELECT '₱' || to_char(coalesce(p_cents, 0) / 100.0, 'FM999,999,999,999,990.00');
$$;

REVOKE ALL ON FUNCTION settleup.format_php_cents(bigint) FROM PUBLIC, anon, authenticated;

-- Builds the exact Expo messages for one event. Returns an empty array when
-- there is nothing to send. Only the fields a device needs are included:
-- group name as the title, a short body, and routing data.
CREATE OR REPLACE FUNCTION settleup.build_push_messages(p_event text, p_record jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = settleup
AS $$
DECLARE
  v_group_id   uuid;
  v_title      text;
  v_body       text;
  v_route      text;
  v_name       text;
  v_recipients uuid[] := '{}';
  v_messages   jsonb;
BEGIN
  v_group_id := (p_record->>'group_id')::uuid;
  IF v_group_id IS NULL THEN
    RETURN '[]'::jsonb;
  END IF;

  SELECT name INTO v_title FROM groups WHERE id = v_group_id;
  IF v_title IS NULL THEN
    RETURN '[]'::jsonb;
  END IF;

  IF p_event = 'expense_added' THEN
    v_body := 'New expense: ' || coalesce(nullif(p_record->>'item_name', ''), 'an expense')
      || ' (' || format_php_cents((p_record->>'amount_cents')::bigint) || ')';
    v_route := '/groups/' || v_group_id;
    SELECT coalesce(array_agg(DISTINCT gm.user_id), '{}')
      INTO v_recipients
      FROM group_members gm
     WHERE gm.group_id = v_group_id
       AND gm.user_id IS NOT NULL
       AND gm.departed_at IS NULL
       AND gm.user_id IS DISTINCT FROM (p_record->>'created_by_user_id')::uuid;

  ELSIF p_event = 'payment_pending' THEN
    SELECT display_name INTO v_name
      FROM group_members
     WHERE id = (p_record->>'from_member_id')::uuid AND group_id = v_group_id;
    v_body := coalesce(v_name, 'Someone') || ' says they paid you '
      || format_php_cents((p_record->>'amount_cents')::bigint) || ' — tap to confirm';
    v_route := '/groups/' || v_group_id; -- confirmation card lives on the group screen
    SELECT coalesce(array_agg(gm.user_id), '{}')
      INTO v_recipients
      FROM group_members gm
     WHERE gm.id = (p_record->>'to_member_id')::uuid
       AND gm.group_id = v_group_id
       AND gm.user_id IS NOT NULL
       AND gm.departed_at IS NULL;

  ELSIF p_event = 'payment_confirmed' THEN
    SELECT display_name INTO v_name
      FROM group_members
     WHERE id = (p_record->>'to_member_id')::uuid AND group_id = v_group_id;
    v_body := coalesce(v_name, 'The recipient') || ' confirmed your '
      || format_php_cents((p_record->>'amount_cents')::bigint) || ' payment';
    v_route := '/groups/' || v_group_id;
    SELECT coalesce(array_agg(gm.user_id), '{}')
      INTO v_recipients
      FROM group_members gm
     WHERE gm.id = (p_record->>'from_member_id')::uuid
       AND gm.group_id = v_group_id
       AND gm.user_id IS NOT NULL
       AND gm.departed_at IS NULL;

  ELSE
    RETURN '[]'::jsonb;
  END IF;

  IF cardinality(v_recipients) = 0 THEN
    RETURN '[]'::jsonb;
  END IF;

  SELECT coalesce(jsonb_agg(jsonb_build_object(
           'to', t.token,
           'title', v_title,
           'body', v_body,
           'sound', 'default',
           'data', jsonb_build_object(
             'group_id', v_group_id,
             'event', p_event,
             'route', v_route
           )
         )), '[]'::jsonb)
    INTO v_messages
    FROM push_tokens t
   WHERE t.user_id = ANY (v_recipients);

  RETURN v_messages;
END;
$$;

REVOKE ALL ON FUNCTION settleup.build_push_messages(text, jsonb) FROM PUBLIC, anon, authenticated;

-- Trigger: post finished messages only. Failures never affect the write.
CREATE OR REPLACE FUNCTION settleup.notify_push_event()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = settleup
AS $$
DECLARE
  v_url      text;
  v_secret   text;
  v_messages jsonb;
BEGIN
  SELECT value INTO v_url FROM app_config WHERE key = 'push_webhook_url';
  SELECT value INTO v_secret FROM app_config WHERE key = 'push_webhook_secret';
  IF v_url IS NULL OR v_secret IS NULL THEN
    RETURN NULL; -- push not configured in this environment
  END IF;

  v_messages := build_push_messages(TG_ARGV[0], to_jsonb(NEW));
  IF v_messages IS NULL OR jsonb_array_length(v_messages) = 0 THEN
    RETURN NULL;
  END IF;

  PERFORM net.http_post(
    url := v_url,
    body := jsonb_build_object('messages', v_messages),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-push-secret', v_secret
    ),
    timeout_milliseconds := 3000
  );

  RETURN NULL;
EXCEPTION WHEN OTHERS THEN
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION settleup.notify_push_event() FROM PUBLIC, anon, authenticated;

-- Narrow write path for the edge function: delete tokens Expo reports as no
-- longer registered. Callable with the anon key only when the shared secret
-- matches; the secret is at least 32 random bytes, so guessing is not viable.
CREATE OR REPLACE FUNCTION settleup.prune_push_tokens(p_secret text, p_tokens text[])
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = settleup
AS $$
DECLARE
  v_secret text;
  v_count  integer := 0;
BEGIN
  SELECT value INTO v_secret FROM app_config WHERE key = 'push_webhook_secret';
  IF v_secret IS NULL OR p_secret IS NULL OR p_secret <> v_secret THEN
    RAISE EXCEPTION 'unauthorized' USING ERRCODE = '42501';
  END IF;
  IF p_tokens IS NULL OR cardinality(p_tokens) = 0 THEN
    RETURN 0;
  END IF;
  IF cardinality(p_tokens) > 500 THEN
    RAISE EXCEPTION 'too many tokens' USING ERRCODE = '22023';
  END IF;

  DELETE FROM push_tokens WHERE token = ANY (p_tokens);
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION settleup.prune_push_tokens(text, text[]) FROM PUBLIC, authenticated;
GRANT EXECUTE ON FUNCTION settleup.prune_push_tokens(text, text[]) TO anon;
