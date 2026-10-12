-- Personal budgets: one budget document per account.
--
-- The document holds the person's budget settings (append-only plan
-- versions) and their notes about spending (refunds, exclusions, planned
-- spending). It never holds computed totals: the app recomputes every figure
-- from this plus the transactions. Guests keep theirs on the phone; signed-in
-- users sync it here so it is backed up and reaches their other devices.
--
-- Concurrency: compare-and-swap on updated_at. A save based on an older
-- version is refused with the current copy, and the app merges its own
-- changes on top (packages/shared/src/budget/merge.ts). Device clocks are
-- never compared.

CREATE TABLE settleup.personal_budgets (
  user_id    uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  doc        jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  -- Server version; strictly increases on every save.
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

ALTER TABLE settleup.personal_budgets ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON settleup.personal_budgets FROM PUBLIC, anon, authenticated;
GRANT SELECT ON settleup.personal_budgets TO authenticated;

-- Reads: own row only. Writes go through save_personal_budget.
CREATE POLICY personal_budgets_select_own ON settleup.personal_budgets
  FOR SELECT TO authenticated USING (user_id = (SELECT auth.uid()));

-- The structure every client relies on. The apps validate the whole document
-- (Zod); this keeps one client from storing something another can't read.
CREATE FUNCTION settleup.budget_document_valid(p_doc jsonb)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
SET search_path = ''
AS $$
DECLARE
  v_item jsonb;
  v_uuid constant text := '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$';
  v_date constant text := '^\d{4}-\d{2}-\d{2}$';
BEGIN
  IF p_doc IS NULL OR jsonb_typeof(p_doc) IS DISTINCT FROM 'object' THEN RETURN false; END IF;
  IF octet_length(p_doc::text) > 262144 THEN RETURN false; END IF;
  IF p_doc->'version' IS DISTINCT FROM '1'::jsonb THEN RETURN false; END IF;
  IF jsonb_typeof(p_doc->'id') IS DISTINCT FROM 'string' OR (p_doc->>'id') !~ v_uuid THEN RETURN false; END IF;
  IF jsonb_typeof(p_doc->'createdAt') IS DISTINCT FROM 'string' THEN RETURN false; END IF;
  IF jsonb_typeof(p_doc->'startDate') IS DISTINCT FROM 'string' OR (p_doc->>'startDate') !~ v_date THEN RETURN false; END IF;
  BEGIN
    PERFORM (p_doc->>'startDate')::date;
  EXCEPTION WHEN others THEN
    RETURN false;
  END;
  IF NOT (p_doc ? 'deletedAt') OR jsonb_typeof(p_doc->'deletedAt') NOT IN ('null', 'string') THEN RETURN false; END IF;

  IF jsonb_typeof(p_doc->'plans') IS DISTINCT FROM 'array'
     OR jsonb_array_length(p_doc->'plans') NOT BETWEEN 1 AND 500 THEN
    RETURN false;
  END IF;
  FOR v_item IN SELECT value FROM jsonb_array_elements(p_doc->'plans') LOOP
    IF jsonb_typeof(v_item) IS DISTINCT FROM 'object'
       OR jsonb_typeof(v_item->'id') IS DISTINCT FROM 'string' OR (v_item->>'id') !~ v_uuid
       OR jsonb_typeof(v_item->'effectiveFrom') IS DISTINCT FROM 'string' OR (v_item->>'effectiveFrom') !~ v_date
       OR jsonb_typeof(v_item->'createdAt') IS DISTINCT FROM 'string'
       OR jsonb_typeof(v_item->'config') IS DISTINCT FROM 'object'
       OR jsonb_typeof(v_item->'config'->'currency') IS DISTINCT FROM 'string'
       OR jsonb_typeof(v_item->'config'->'monthlyLimitMinor') IS DISTINCT FROM 'number'
       OR jsonb_typeof(v_item->'config'->'weeklyTargetMinor') IS DISTINCT FROM 'number' THEN
      RETURN false;
    END IF;
    -- Checked apart from the type tests above: SQL does not promise to stop at the first true OR.
    IF (v_item->'config'->>'monthlyLimitMinor')::numeric NOT BETWEEN 0 AND 99999999999
       OR (v_item->'config'->>'weeklyTargetMinor')::numeric NOT BETWEEN 0 AND 99999999999 THEN
      RETURN false;
    END IF;
  END LOOP;

  IF jsonb_typeof(p_doc->'annotations') IS DISTINCT FROM 'array'
     OR jsonb_array_length(p_doc->'annotations') > 2000 THEN
    RETURN false;
  END IF;
  FOR v_item IN SELECT value FROM jsonb_array_elements(p_doc->'annotations') LOOP
    IF jsonb_typeof(v_item) IS DISTINCT FROM 'object'
       OR jsonb_typeof(v_item->'id') IS DISTINCT FROM 'string' OR (v_item->>'id') !~ v_uuid
       OR (v_item->>'kind') IS NULL
       OR (v_item->>'kind') NOT IN ('exclude', 'link', 'refund', 'planned', 'reallocation') THEN
      RETURN false;
    END IF;
  END LOOP;
  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION settleup.budget_document_valid(jsonb) FROM PUBLIC, anon, authenticated;

-- Save the caller's budget. p_base_updated_at is the version the app last
-- received (null when it has never seen one). Returns
--   {status: 'saved', updated_at}                 when written
--   {status: 'conflict', doc, updated_at}         when the server copy changed
CREATE FUNCTION settleup.save_personal_budget(p_doc jsonb, p_base_updated_at timestamptz)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_row settleup.personal_budgets;
  v_saved timestamptz;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000';
  END IF;
  IF settleup.is_account_closed() THEN
    RAISE EXCEPTION 'This account is closed' USING ERRCODE = '42501';
  END IF;
  IF NOT settleup.budget_document_valid(p_doc) THEN
    RAISE EXCEPTION 'That budget could not be saved: it is not in the expected format' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_row FROM settleup.personal_budgets WHERE user_id = v_uid FOR UPDATE;
  IF FOUND THEN
    IF p_base_updated_at IS NULL OR v_row.updated_at <> p_base_updated_at THEN
      RETURN jsonb_build_object('status', 'conflict', 'doc', v_row.doc, 'updated_at', v_row.updated_at);
    END IF;
    v_saved := GREATEST(clock_timestamp(), v_row.updated_at + interval '1 microsecond');
    UPDATE settleup.personal_budgets SET doc = p_doc, updated_at = v_saved WHERE user_id = v_uid;
  ELSE
    -- Two first saves racing: one inserts, the other gets the conflict.
    INSERT INTO settleup.personal_budgets (user_id, doc, updated_at)
    VALUES (v_uid, p_doc, clock_timestamp())
    ON CONFLICT (user_id) DO NOTHING
    RETURNING updated_at INTO v_saved;
    IF v_saved IS NULL THEN
      SELECT * INTO v_row FROM settleup.personal_budgets WHERE user_id = v_uid;
      RETURN jsonb_build_object('status', 'conflict', 'doc', v_row.doc, 'updated_at', v_row.updated_at);
    END IF;
  END IF;
  RETURN jsonb_build_object('status', 'saved', 'updated_at', v_saved);
END;
$$;

REVOKE ALL ON FUNCTION settleup.save_personal_budget(jsonb, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION settleup.save_personal_budget(jsonb, timestamptz) TO authenticated;

-- A private budget goes when the account is closed (shared ledgers stay).
CREATE FUNCTION settleup.delete_personal_budget_on_closure()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  DELETE FROM settleup.personal_budgets WHERE user_id = NEW.user_id;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION settleup.delete_personal_budget_on_closure() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER closed_accounts_delete_personal_budget
  AFTER INSERT ON settleup.closed_accounts
  FOR EACH ROW EXECUTE FUNCTION settleup.delete_personal_budget_on_closure();
