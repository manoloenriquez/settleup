-- Atomic batch expense creation. The web batch path previously looped
-- create_expense from the server action — one RPC (= one transaction) per
-- item, so a mid-batch failure left earlier expenses committed. Wrapping the
-- loop in a single plpgsql function makes the whole batch one transaction:
-- any RAISE EXCEPTION rolls back every item.
--
-- Each item is delegated to settleup.create_expense, which re-validates
-- membership, payer sums, and split sums exactly as for single expenses.
-- The batch group_id is forced onto every item so a payload can't smuggle
-- items into another group.

CREATE OR REPLACE FUNCTION settleup.create_expenses_batch(p_input JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = settleup
AS $$
DECLARE
  v_group_id UUID;
  v_item     JSONB;
  v_result   JSONB;
  v_expenses JSONB := '[]'::JSONB;
BEGIN
  v_group_id := (p_input->>'group_id')::UUID;

  IF v_group_id IS NULL THEN
    RAISE EXCEPTION 'group_id is required';
  END IF;
  IF p_input->'items' IS NULL OR jsonb_typeof(p_input->'items') <> 'array'
     OR jsonb_array_length(p_input->'items') = 0 THEN
    RAISE EXCEPTION 'items array is required';
  END IF;
  IF jsonb_array_length(p_input->'items') > 50 THEN
    RAISE EXCEPTION 'Too many items in batch (max 50)';
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_input->'items') LOOP
    v_result := settleup.create_expense(v_item || jsonb_build_object('group_id', v_group_id));
    v_expenses := v_expenses || jsonb_build_array(v_result->'expense');
  END LOOP;

  RETURN jsonb_build_object('expenses', v_expenses);
END;
$$;

REVOKE ALL ON FUNCTION settleup.create_expenses_batch(JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION settleup.create_expenses_batch(JSONB) TO authenticated;
