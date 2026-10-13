BEGIN;
DO $$
DECLARE
  alice uuid := gen_random_uuid();
  bob uuid := gen_random_uuid();
  doc_id uuid := gen_random_uuid();
  doc jsonb;
  result jsonb;
  first_version text;
  second_version text;
  denied boolean;
  visible integer;
BEGIN
  INSERT INTO auth.users(id, email, raw_user_meta_data) VALUES
    (alice, 'budget-alice-' || alice || '@example.invalid', '{}'),
    (bob, 'budget-bob-' || bob || '@example.invalid', '{}');

  doc := jsonb_build_object(
    'version', 1, 'id', doc_id, 'createdAt', '2026-10-12T08:00:00.000Z', 'startDate', '2026-10-12',
    'deletedAt', NULL, 'annotations', '[]'::jsonb,
    'plans', jsonb_build_array(jsonb_build_object(
      'id', gen_random_uuid(), 'effectiveFrom', '2026-10-01', 'createdAt', '2026-10-12T08:00:00.000Z',
      'source', 'setup', 'summary', 'Set up',
      'config', jsonb_build_object('currency', 'PHP', 'monthlyLimitMinor', 6000000, 'weeklyTargetMinor', 700000))));

  -- Anonymous callers can do nothing.
  PERFORM set_config('role', 'anon', true);
  BEGIN
    PERFORM settleup.save_personal_budget(doc, NULL);
    denied := false;
  EXCEPTION WHEN insufficient_privilege THEN denied := true;
  END;
  ASSERT denied, 'anon must not save budgets';
  BEGIN
    SELECT count(*) INTO visible FROM settleup.personal_budgets;
    denied := false;
  EXCEPTION WHEN insufficient_privilege THEN denied := true;
  END;
  ASSERT denied, 'anon must not read budgets';

  -- Alice's first save inserts.
  PERFORM set_config('request.jwt.claim.sub', alice::text, true);
  PERFORM set_config('role', 'authenticated', true);
  result := settleup.save_personal_budget(doc, NULL);
  ASSERT result->>'status' = 'saved', 'First save is stored: ' || result::text;
  first_version := result->>'updated_at';

  -- A second "first" save (another device that never synced) gets the copy back.
  result := settleup.save_personal_budget(doc || jsonb_build_object('startDate', '2026-10-13'), NULL);
  ASSERT result->>'status' = 'conflict', 'A save without the current base is refused';
  ASSERT result->'doc'->>'startDate' = '2026-10-12', 'The conflict returns the stored copy';
  ASSERT result->>'updated_at' = first_version, 'and its version';

  -- Saving on the current base succeeds and moves the version forward.
  result := settleup.save_personal_budget(doc || jsonb_build_object('startDate', '2026-10-13'), first_version::timestamptz);
  ASSERT result->>'status' = 'saved', 'Save on the current base: ' || result::text;
  second_version := result->>'updated_at';
  ASSERT second_version::timestamptz > first_version::timestamptz, 'Versions strictly increase';

  -- A stale base is refused, and nothing changes.
  result := settleup.save_personal_budget(doc, first_version::timestamptz);
  ASSERT result->>'status' = 'conflict', 'A stale base is refused';
  ASSERT (SELECT p.doc->>'startDate' FROM settleup.personal_budgets p) = '2026-10-13', 'Stale save changed nothing';

  -- Malformed documents are refused.
  FOR result IN SELECT * FROM (VALUES
      ('"not an object"'::jsonb),
      (doc || '{"version": 2}'),
      (doc || '{"id": "nope"}'),
      (doc || '{"startDate": "2026-02-30"}'),
      (doc || '{"plans": []}'),
      (doc || '{"annotations": [{"id": "x", "kind": "exclude"}]}'),
      (doc || jsonb_build_object('annotations', jsonb_build_array(jsonb_build_object('id', gen_random_uuid(), 'kind', 'mystery')))),
      (jsonb_set(doc, '{plans,0,config,monthlyLimitMinor}', '"lots"')),
      (jsonb_set(doc, '{plans,0,config,weeklyTargetMinor}', '-5')),
      (doc - 'deletedAt')
    ) AS bad(value) LOOP
    BEGIN
      PERFORM settleup.save_personal_budget(result, second_version::timestamptz);
      denied := false;
    EXCEPTION WHEN invalid_parameter_value THEN denied := true;
    END;
    ASSERT denied, 'Malformed document must be refused: ' || result::text;
  END LOOP;

  -- No direct writes, even to one's own row.
  BEGIN
    UPDATE settleup.personal_budgets SET doc = '{}'::jsonb WHERE user_id = alice;
    denied := false;
  EXCEPTION WHEN insufficient_privilege THEN denied := true;
  END;
  ASSERT denied, 'Direct updates must be refused';
  BEGIN
    INSERT INTO settleup.personal_budgets(user_id, doc) VALUES (alice, doc);
    denied := false;
  EXCEPTION WHEN insufficient_privilege THEN denied := true;
  END;
  ASSERT denied, 'Direct inserts must be refused';

  -- Bob sees nothing of Alice's, and his own save is separate.
  PERFORM set_config('request.jwt.claim.sub', bob::text, true);
  SELECT count(*) INTO visible FROM settleup.personal_budgets;
  ASSERT visible = 0, 'Bob must not see Alice''s budget';
  result := settleup.save_personal_budget(doc, NULL);
  ASSERT result->>'status' = 'saved', 'Bob has his own budget row';
  SELECT count(*) INTO visible FROM settleup.personal_budgets;
  ASSERT visible = 1, 'Bob sees only his own';

  -- Closing Alice's account removes her budget and blocks further saves.
  PERFORM set_config('role', 'postgres', true);
  INSERT INTO settleup.closed_accounts(user_id) VALUES (alice);
  SELECT count(*) INTO visible FROM settleup.personal_budgets WHERE user_id = alice;
  ASSERT visible = 0, 'Closure deletes the budget';
  PERFORM set_config('request.jwt.claim.sub', alice::text, true);
  PERFORM set_config('role', 'authenticated', true);
  BEGIN
    PERFORM settleup.save_personal_budget(doc, NULL);
    denied := false;
  EXCEPTION WHEN insufficient_privilege THEN denied := true;
  END;
  ASSERT denied, 'A closed account cannot save';

  -- Deleting the auth user removes the row too.
  PERFORM set_config('role', 'postgres', true);
  DELETE FROM auth.users WHERE id = bob;
  SELECT count(*) INTO visible FROM settleup.personal_budgets WHERE user_id = bob;
  ASSERT visible = 0, 'Auth deletion cascades';
END;
$$;
ROLLBACK;
