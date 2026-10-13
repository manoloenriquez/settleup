#!/usr/bin/env bash
# Budget journeys on the simulator.
#   tools/ui-driver/run-budget.sh <simulator-udid> <path/to/Talli.app>
# Guest journey first, then the signed-in one against the LOCAL stack (seeds
# Ana's groups like run-flows.sh, clears her budget), then prints the budget
# the server stored for her.
set -euo pipefail
cd "$(dirname "$0")"
source ./local-test-accounts.env
UDID="$1"; APP="$2"
mkdir -p out

seed() {
  ./local-fixtures.sh sql "delete from settleup.groups g using settleup.group_members m, auth.users u
    where m.group_id = g.id and m.user_id = u.id and u.email = '$LOCAL_USER_A_EMAIL' and g.kind = 'shared'" >/dev/null
  ./local-fixtures.sh sql "delete from settleup.personal_expenses p using auth.users u where p.user_id = u.id and u.email = '$LOCAL_USER_A_EMAIL'" >/dev/null
  ./local-fixtures.sh sql "DO \$\$
  DECLARE ana uuid := (SELECT id FROM auth.users WHERE email = '$LOCAL_USER_A_EMAIL'); g uuid; f uuid; m_ana uuid; f_ana uuid;
    m_carla uuid := gen_random_uuid(); m_dina uuid := gen_random_uuid();
    f_carla uuid := gen_random_uuid(); f_dina uuid := gen_random_uuid();
  BEGIN
    PERFORM set_config('request.headers', '{\"x-ledger-version\":\"2\"}', true);
    PERFORM set_config('role', 'authenticated', true);
    PERFORM set_config('request.jwt.claim.sub', ana::text, true);
    PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', ana, 'role', 'authenticated')::text, true);
    g := (settleup.create_group_v2('Weekend Trip', gen_random_uuid(), 'PHP', 'Ana')->'group'->>'id')::uuid;
    f := (settleup.create_group_v2('Flat 2B', gen_random_uuid(), 'PHP', 'Ana')->'group'->>'id')::uuid;
    PERFORM set_config('role', 'postgres', true);
    INSERT INTO settleup.group_members(id, group_id, display_name, slug, share_token) VALUES
      (m_carla, g, 'Carla', 'flow-carla-' || left(g::text, 8), encode(extensions.gen_random_bytes(16), 'hex')),
      (m_dina, g, 'Dina', 'flow-dina-' || left(g::text, 8), encode(extensions.gen_random_bytes(16), 'hex')),
      (f_carla, f, 'Carla', 'flow-carla-' || left(f::text, 8), encode(extensions.gen_random_bytes(16), 'hex')),
      (f_dina, f, 'Dina', 'flow-dina-' || left(f::text, 8), encode(extensions.gen_random_bytes(16), 'hex'));
    SELECT id INTO m_ana FROM settleup.group_members WHERE group_id = g AND user_id = ana;
    SELECT id INTO f_ana FROM settleup.group_members WHERE group_id = f AND user_id = ana;
    PERFORM set_config('role', 'authenticated', true);
    PERFORM settleup.create_expense(jsonb_build_object('group_id', g, 'item_name', 'Taxi', 'amount_cents', 30000, 'currency_code', 'PHP',
      'expense_date', to_char(current_date, 'YYYY-MM-DD'), 'split_mode', 'equal', 'participant_ids', jsonb_build_array(m_ana, m_carla, m_dina),
      'payers', jsonb_build_array(jsonb_build_object('member_id', m_ana, 'paid_cents', 30000))));
    PERFORM settleup.create_expense(jsonb_build_object('group_id', f, 'item_name', 'Electricity', 'amount_cents', 135000, 'currency_code', 'PHP',
      'expense_date', to_char(current_date, 'YYYY-MM-DD'), 'split_mode', 'equal', 'participant_ids', jsonb_build_array(f_ana, f_carla, f_dina),
      'payers', jsonb_build_array(jsonb_build_object('member_id', f_carla, 'paid_cents', 135000))));
  END \$\$;" >/dev/null
}

status=0
SCREEN_PREFIX=budget ./run.sh "$UDID" "$APP" BudgetJourneyTests || status=1
seed
./local-fixtures.sh sql "delete from settleup.personal_budgets b using auth.users u where b.user_id = u.id and u.email = '$LOCAL_USER_A_EMAIL'" >/dev/null
./run.sh "$UDID" "$APP" BudgetSignedInJourneyTests || status=1
echo "Server copy of Ana's budget:"
./local-fixtures.sh sql "select jsonb_path_query_array(b.doc, '$.plans[*].config.weeklyTargetMinor'), jsonb_path_query_array(b.doc, '$.plans[*].source'), b.updated_at
  from settleup.personal_budgets b join auth.users u on u.id = b.user_id where u.email = '$LOCAL_USER_A_EMAIL'"
exit $status
