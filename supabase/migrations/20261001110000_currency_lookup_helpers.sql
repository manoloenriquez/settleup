-- Helpers for currency-aware clients (requires 20260908163441_currency_ledger).
--
-- Groups have a default currency but may hold expenses and payments in
-- others (trips abroad). Balances are always per currency and never
-- converted, so clients first ask which currencies exist, then call the
-- per-currency *_v2 functions once for each.

-- Currencies across every group the caller belongs to, most used first.
CREATE FUNCTION settleup.get_my_currencies()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  WITH mine AS (
    SELECT g.id, g.default_currency_code
    FROM settleup.groups g
    WHERE g.is_archived = false AND g.id IN (SELECT settleup.user_group_ids())
  ),
  used AS (
    SELECT default_currency_code::text AS code FROM mine
    UNION ALL SELECT e.currency_code::text FROM settleup.expenses e JOIN mine ON mine.id = e.group_id
    UNION ALL SELECT p.currency_code::text FROM settleup.payments p JOIN mine ON mine.id = p.group_id
  )
  SELECT coalesce(jsonb_agg(code ORDER BY uses DESC, code), '[]'::jsonb)
  FROM (SELECT code, count(*) AS uses FROM used GROUP BY code) counted;
$$;
REVOKE ALL ON FUNCTION settleup.get_my_currencies() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION settleup.get_my_currencies() TO authenticated;

-- Currencies of the group behind a public group link or personal member
-- link: the default first, then any others in use. An unknown or revoked
-- token returns [] — the same "not found" the public pages already show.
CREATE FUNCTION settleup.get_share_currencies(p_share_token text)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  WITH target AS (
    SELECT g.id, g.default_currency_code FROM settleup.groups g
    WHERE p_share_token IS NOT NULL AND length(p_share_token) <= 128 AND g.share_token = p_share_token
    UNION
    SELECT g.id, g.default_currency_code FROM settleup.group_members m
    JOIN settleup.groups g ON g.id = m.group_id
    WHERE p_share_token IS NOT NULL AND length(p_share_token) <= 128
      AND m.share_token = p_share_token AND m.departed_at IS NULL
  ),
  codes AS (
    SELECT t.default_currency_code::text AS code, 0 AS rank FROM target t
    UNION SELECT e.currency_code::text, 1 FROM settleup.expenses e JOIN target t ON t.id = e.group_id
    UNION SELECT p.currency_code::text, 1 FROM settleup.payments p JOIN target t ON t.id = p.group_id
  )
  SELECT coalesce(jsonb_agg(code ORDER BY rank, code), '[]'::jsonb)
  FROM (SELECT code, min(rank) AS rank FROM codes GROUP BY code) ranked;
$$;
REVOKE ALL ON FUNCTION settleup.get_share_currencies(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION settleup.get_share_currencies(text) TO anon, authenticated;

-- Recurring templates created by currency-aware clients carry their own
-- currency; the column default stays PHP for older rows and clients.
