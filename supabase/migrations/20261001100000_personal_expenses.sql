-- Personal expenses: one person's own spending, outside any group ledger.
--
-- The phone is the source of truth (guests have nothing else); signed-in
-- users sync their device store here so it is backed up and reaches their
-- other devices. There are no payers, shares or balances, so these rows never
-- touch group ledgers, dashboards or public share links.
--
-- Conflict rule: the last write to ARRIVE wins; device clocks are never
-- compared. A deleted row is only restored by a device whose base version is
-- the deletion itself (an Undo on the device that deleted it); any other
-- device adopts the deletion.

CREATE TABLE settleup.personal_expenses (
  id                uuid PRIMARY KEY,
  user_id           uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  description       text NOT NULL CHECK (char_length(btrim(description)) BETWEEN 1 AND 120),
  amount_minor      bigint NOT NULL CHECK (amount_minor > 0 AND amount_minor <= 99999999999),
  currency_code     text NOT NULL CHECK (currency_code IN (
    'PHP','USD','EUR','GBP','CAD','AUD','NZD','JPY','CNY','HKD','SGD','TWD','KRW','INR','THB',
    'VND','IDR','MYR','CHF','NOK','SEK','DKK','PLN','CZK','HUF','RON','BRL','MXN','ARS','CLP',
    'COP','PEN','ZAR','AED','SAR','QAR','KWD','BHD','OMR','JOD','EGP','ILS','TRY','ISK','PKR',
    'BDT','LKR','NPR','KES','NGN','UAH','MAD')),
  category_slug     text NOT NULL CHECK (category_slug IN (
    'food-drinks','groceries','transport','lodging','activities','shopping','supplies','fees','other')),
  expense_date      date NOT NULL,
  notes             text CHECK (notes IS NULL OR char_length(notes) <= 500),
  merchant          text CHECK (merchant IS NULL OR char_length(merchant) <= 120),
  source            text NOT NULL CHECK (source IN ('manual','receipt','chat')),
  client_created_at timestamptz NOT NULL,
  client_updated_at timestamptz NOT NULL,
  deleted_at        timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now(),
  -- Server version. clock_timestamp so rows written in one call still order.
  updated_at        timestamptz NOT NULL DEFAULT clock_timestamp()
);

-- Pull cursor: a user's rows in server-version order.
CREATE INDEX personal_expenses_user_version ON settleup.personal_expenses (user_id, updated_at, id);

ALTER TABLE settleup.personal_expenses ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON settleup.personal_expenses FROM PUBLIC, anon, authenticated;
GRANT SELECT ON settleup.personal_expenses TO authenticated;

-- Reads: own rows only. Writes go through upsert_personal_expenses.
CREATE POLICY personal_expenses_select_own ON settleup.personal_expenses
  FOR SELECT TO authenticated USING (user_id = (SELECT auth.uid()));

-- Batch upsert. Returns one result per input row:
--   {id, status: 'applied' | 'kept_server' | 'rejected', row}
-- 'rejected' means the id belongs to another account (row is null, nothing
-- about that account is revealed).
CREATE FUNCTION settleup.upsert_personal_expenses(p_rows jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_row jsonb;
  v_id uuid;
  v_existing settleup.personal_expenses%ROWTYPE;
  v_saved settleup.personal_expenses%ROWTYPE;
  v_deleted boolean;
  v_base timestamptz;
  v_results jsonb := '[]'::jsonb;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Sign in to sync expenses.' USING ERRCODE = 'PT401';
  END IF;
  IF EXISTS (SELECT 1 FROM settleup.closed_accounts WHERE user_id = v_uid) THEN
    RAISE EXCEPTION 'This account is closed.' USING ERRCODE = 'PT403';
  END IF;
  IF jsonb_typeof(p_rows) <> 'array' OR jsonb_array_length(p_rows) > 100 THEN
    RAISE EXCEPTION 'Send between 0 and 100 expenses at a time.' USING ERRCODE = '22023';
  END IF;

  FOR v_row IN SELECT value FROM jsonb_array_elements(p_rows) LOOP
    v_id := (v_row->>'id')::uuid;
    v_deleted := coalesce((v_row->>'deleted')::boolean, false);
    v_base := nullif(v_row->>'base_updated_at', '')::timestamptz;

    SELECT * INTO v_existing FROM settleup.personal_expenses WHERE id = v_id FOR UPDATE;

    IF FOUND AND v_existing.user_id <> v_uid THEN
      v_results := v_results || jsonb_build_object('id', v_id, 'status', 'rejected', 'row', NULL);
      CONTINUE;
    END IF;

    IF FOUND AND v_existing.deleted_at IS NOT NULL AND NOT v_deleted
       AND v_base IS DISTINCT FROM v_existing.updated_at THEN
      -- Deleted elsewhere; this device has not seen the deletion. Keep it.
      v_results := v_results || jsonb_build_object(
        'id', v_id, 'status', 'kept_server', 'row', settleup.personal_expense_json(v_existing));
      CONTINUE;
    END IF;

    IF FOUND THEN
      UPDATE settleup.personal_expenses SET
        description       = btrim(v_row->>'description'),
        amount_minor      = (v_row->>'amount_minor')::bigint,
        currency_code     = v_row->>'currency_code',
        category_slug     = v_row->>'category_slug',
        expense_date      = (v_row->>'expense_date')::date,
        notes             = nullif(v_row->>'notes', ''),
        merchant          = nullif(v_row->>'merchant', ''),
        source            = v_row->>'source',
        client_updated_at = (v_row->>'client_updated_at')::timestamptz,
        deleted_at        = CASE WHEN v_deleted THEN coalesce(v_existing.deleted_at, clock_timestamp()) ELSE NULL END,
        updated_at        = clock_timestamp()
      WHERE id = v_id
      RETURNING * INTO v_saved;
    ELSE
      INSERT INTO settleup.personal_expenses (
        id, user_id, description, amount_minor, currency_code, category_slug, expense_date,
        notes, merchant, source, client_created_at, client_updated_at, deleted_at)
      VALUES (
        v_id, v_uid, btrim(v_row->>'description'), (v_row->>'amount_minor')::bigint,
        v_row->>'currency_code', v_row->>'category_slug', (v_row->>'expense_date')::date,
        nullif(v_row->>'notes', ''), nullif(v_row->>'merchant', ''), v_row->>'source',
        (v_row->>'client_created_at')::timestamptz, (v_row->>'client_updated_at')::timestamptz,
        CASE WHEN v_deleted THEN clock_timestamp() ELSE NULL END)
      RETURNING * INTO v_saved;
    END IF;

    v_results := v_results || jsonb_build_object(
      'id', v_id, 'status', 'applied', 'row', settleup.personal_expense_json(v_saved));
  END LOOP;

  RETURN v_results;
END;
$$;

-- Client-facing shape of one row (no user_id).
CREATE FUNCTION settleup.personal_expense_json(r settleup.personal_expenses)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT jsonb_build_object(
    'id', r.id, 'description', r.description, 'amount_minor', r.amount_minor,
    'currency_code', r.currency_code, 'category_slug', r.category_slug,
    'expense_date', r.expense_date, 'notes', r.notes, 'merchant', r.merchant,
    'source', r.source, 'client_created_at', r.client_created_at,
    'client_updated_at', r.client_updated_at, 'deleted_at', r.deleted_at,
    'updated_at', r.updated_at);
$$;

REVOKE ALL ON FUNCTION settleup.upsert_personal_expenses(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION settleup.upsert_personal_expenses(jsonb) TO authenticated;
REVOKE ALL ON FUNCTION settleup.personal_expense_json(settleup.personal_expenses) FROM PUBLIC, anon, authenticated;

-- Private spending goes when the account is closed (shared ledgers stay).
CREATE FUNCTION settleup.delete_personal_expenses_on_closure()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  DELETE FROM settleup.personal_expenses WHERE user_id = NEW.user_id;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION settleup.delete_personal_expenses_on_closure() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER closed_accounts_delete_personal_expenses
  AFTER INSERT ON settleup.closed_accounts
  FOR EACH ROW EXECUTE FUNCTION settleup.delete_personal_expenses_on_closure();
