BEGIN;
DO $$
DECLARE
  alice uuid := gen_random_uuid();
  bob uuid := gen_random_uuid();
  e1 uuid := gen_random_uuid();
  e2 uuid := gen_random_uuid();
  result jsonb;
  row1 jsonb;
  tomb_version text;
  denied boolean;
  visible integer;
BEGIN
  INSERT INTO auth.users(id, email, raw_user_meta_data) VALUES
    (alice, 'personal-alice-' || alice || '@example.invalid', '{}'),
    (bob, 'personal-bob-' || bob || '@example.invalid', '{}');

  -- Alice inserts two expenses in one call.
  PERFORM set_config('request.jwt.claim.sub', alice::text, true);
  PERFORM set_config('role', 'authenticated', true);
  result := settleup.upsert_personal_expenses(jsonb_build_array(
    jsonb_build_object('id', e1, 'description', ' Coffee ', 'amount_minor', 18000, 'currency_code', 'PHP',
      'category_slug', 'food-drinks', 'expense_date', '2026-10-01', 'notes', NULL, 'merchant', NULL,
      'source', 'manual', 'client_created_at', '2026-10-01T08:00:00Z', 'client_updated_at', '2026-10-01T08:00:00Z',
      'deleted', false, 'base_updated_at', NULL),
    jsonb_build_object('id', e2, 'description', 'Ichiran', 'amount_minor', 1500, 'currency_code', 'JPY',
      'category_slug', 'food-drinks', 'expense_date', '2026-09-12', 'notes', '', 'merchant', 'Ichiran',
      'source', 'receipt', 'client_created_at', '2026-10-01T08:01:00Z', 'client_updated_at', '2026-10-01T08:01:00Z',
      'deleted', false, 'base_updated_at', NULL)));
  ASSERT jsonb_array_length(result) = 2, 'One result per row';
  ASSERT result->0->>'status' = 'applied' AND result->0->'row'->>'description' = 'Coffee', 'Insert trims text';
  ASSERT result->1->'row'->>'notes' IS NULL, 'Empty notes are stored as null';
  ASSERT NOT (result->0->'row' ? 'user_id'), 'Payload must not expose user ids';
  ASSERT (result->0->'row'->>'updated_at') < (result->1->'row'->>'updated_at'), 'Rows written together still order';

  -- Replaying the same upload is harmless (no duplicate rows).
  PERFORM settleup.upsert_personal_expenses(jsonb_build_array(result->0->'row' || jsonb_build_object('deleted', false, 'base_updated_at', NULL)));
  SELECT count(*) INTO visible FROM settleup.personal_expenses;
  ASSERT visible = 2, 'Replay must not duplicate';

  -- Delete e1 (tombstone), then another device without the deletion edits it: deletion wins.
  row1 := settleup.upsert_personal_expenses(jsonb_build_array(
    (result->0->'row') || jsonb_build_object('deleted', true, 'base_updated_at', result->0->'row'->>'updated_at')))->0;
  ASSERT row1->>'status' = 'applied' AND row1->'row'->>'deleted_at' IS NOT NULL, 'Deletion is recorded';
  tomb_version := row1->'row'->>'updated_at';
  row1 := settleup.upsert_personal_expenses(jsonb_build_array(
    (result->0->'row') || jsonb_build_object('description', 'Edited elsewhere', 'deleted', false,
      'base_updated_at', result->0->'row'->>'updated_at')))->0;
  ASSERT row1->>'status' = 'kept_server' AND row1->'row'->>'deleted_at' IS NOT NULL, 'Unseen deletion must win';

  -- Undo on the device that saw the deletion restores it.
  row1 := settleup.upsert_personal_expenses(jsonb_build_array(
    (result->0->'row') || jsonb_build_object('deleted', false, 'base_updated_at', tomb_version)))->0;
  ASSERT row1->>'status' = 'applied' AND row1->'row'->>'deleted_at' IS NULL, 'Undo restores';

  -- Validation: unsupported currency and oversized amounts are refused.
  denied := false;
  BEGIN
    PERFORM settleup.upsert_personal_expenses(jsonb_build_array((result->1->'row') || jsonb_build_object('currency_code', 'XXX', 'deleted', false)));
  EXCEPTION WHEN check_violation THEN denied := true; END;
  ASSERT denied, 'Unsupported currency is rejected';
  denied := false;
  BEGIN
    PERFORM settleup.upsert_personal_expenses(jsonb_build_array((result->1->'row') || jsonb_build_object('amount_minor', 100000000000, 'deleted', false)));
  EXCEPTION WHEN check_violation THEN denied := true; END;
  ASSERT denied, 'Amount cap is enforced';

  -- Bob can neither read nor overwrite Alice's rows.
  PERFORM set_config('request.jwt.claim.sub', bob::text, true);
  SELECT count(*) INTO visible FROM settleup.personal_expenses;
  ASSERT visible = 0, 'RLS hides other users rows';
  row1 := settleup.upsert_personal_expenses(jsonb_build_array(
    (result->1->'row') || jsonb_build_object('description', 'Hijack', 'deleted', false)))->0;
  ASSERT row1->>'status' = 'rejected' AND row1->'row' = 'null'::jsonb, 'Foreign id is rejected without data';
  denied := false;
  BEGIN UPDATE settleup.personal_expenses SET description = 'x' WHERE id = e2; EXCEPTION WHEN insufficient_privilege THEN denied := true; END;
  ASSERT denied, 'No direct writes';

  -- Anonymous callers cannot sync.
  PERFORM set_config('role', 'anon', true);
  PERFORM set_config('request.jwt.claim.sub', '', true);
  denied := false;
  BEGIN PERFORM settleup.upsert_personal_expenses('[]'::jsonb); EXCEPTION WHEN insufficient_privilege THEN denied := true; END;
  ASSERT denied, 'Anon cannot execute';

  -- Closing Alice's account deletes her private spending.
  PERFORM set_config('role', 'authenticated', true);
  PERFORM set_config('request.jwt.claim.sub', alice::text, true);
  PERFORM settleup.close_account();
  PERFORM set_config('role', 'postgres', true);
  ASSERT NOT EXISTS (SELECT 1 FROM settleup.personal_expenses WHERE user_id = alice), 'Closure deletes personal expenses';
END $$;
ROLLBACK;
