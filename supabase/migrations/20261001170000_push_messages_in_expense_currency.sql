-- Push messages were written for a PHP-only ledger: every amount went
-- through format_php_cents, so a US$45.00 expense arrived as "₱45.00". Amounts
-- now use the expense's or payment's own currency and its ISO 4217 minor
-- units. Nothing else about the messages changes.

CREATE OR REPLACE FUNCTION settleup.format_minor_amount(p_minor bigint, p_currency text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = settleup
AS $$
  WITH c AS (
    SELECT coalesce(nullif(upper(p_currency), ''), 'PHP') AS code
  ), d AS (
    SELECT code,
           CASE
             WHEN code IN ('JPY', 'KRW', 'VND', 'CLP', 'ISK') THEN 0
             WHEN code IN ('KWD', 'BHD', 'OMR', 'JOD') THEN 3
             ELSE 2
           END AS decimals
    FROM c
  )
  SELECT CASE WHEN code = 'PHP' THEN '₱' ELSE code || ' ' END
         || CASE decimals
              WHEN 0 THEN to_char(coalesce(p_minor, 0), 'FM999,999,999,999,990')
              WHEN 3 THEN to_char(coalesce(p_minor, 0) / 1000.0, 'FM999,999,999,999,990.000')
              ELSE to_char(coalesce(p_minor, 0) / 100.0, 'FM999,999,999,999,990.00')
            END
  FROM d;
$$;

REVOKE ALL ON FUNCTION settleup.format_minor_amount(bigint, text) FROM PUBLIC, anon, authenticated;

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
      || ' (' || format_minor_amount((p_record->>'amount_cents')::bigint, p_record->>'currency_code') || ')';
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
      || format_minor_amount((p_record->>'amount_cents')::bigint, p_record->>'currency_code') || ' — tap to confirm';
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
      || format_minor_amount((p_record->>'amount_cents')::bigint, p_record->>'currency_code') || ' payment';
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
