#!/usr/bin/env bash
# Mobile expense edit (date + percent split) against the LOCAL stack.
#   tools/ui-driver/run-edit.sh <simulator-udid> <path/to/Talli.app>
set -euo pipefail
cd "$(dirname "$0")"
source ./local-test-accounts.env
./local-fixtures.sh sql "delete from settleup.groups where name = 'Edit Trip'" >/dev/null
./local-fixtures.sh sql "DO \$\$
DECLARE ana uuid := (SELECT id FROM auth.users WHERE email = '$LOCAL_USER_A_EMAIL'); g uuid; m_ana uuid;
  m_carla uuid := gen_random_uuid(); m_dina uuid := gen_random_uuid();
BEGIN
  PERFORM set_config('request.headers', '{\"x-ledger-version\":\"2\"}', true);
  PERFORM set_config('role', 'authenticated', true);
  PERFORM set_config('request.jwt.claim.sub', ana::text, true);
  PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', ana, 'role', 'authenticated')::text, true);
  g := (settleup.create_group_v2('Edit Trip', gen_random_uuid(), 'PHP', 'Ana')->'group'->>'id')::uuid;
  PERFORM set_config('role', 'postgres', true);
  INSERT INTO settleup.group_members(id, group_id, display_name, slug, share_token) VALUES
    (m_carla, g, 'Carla', 'edit-carla-' || left(g::text, 8), encode(extensions.gen_random_bytes(16), 'hex')),
    (m_dina, g, 'Dina', 'edit-dina-' || left(g::text, 8), encode(extensions.gen_random_bytes(16), 'hex'));
  SELECT id INTO m_ana FROM settleup.group_members WHERE group_id = g AND user_id = ana;
  PERFORM set_config('role', 'authenticated', true);
  PERFORM settleup.create_expense(jsonb_build_object('group_id', g, 'item_name', 'Villa', 'amount_cents', 90000, 'currency_code', 'PHP',
    'expense_date', to_char(current_date, 'YYYY-MM-DD'), 'split_mode', 'equal', 'participant_ids', jsonb_build_array(m_ana, m_carla, m_dina),
    'payers', jsonb_build_array(jsonb_build_object('member_id', m_ana, 'paid_cents', 90000))));
END \$\$;" >/dev/null
./run.sh "$1" "$2" EditSplitJourneyTests
./local-fixtures.sh sql "select e.item_name, e.amount_cents, e.expense_date,
    (select string_agg(m.display_name || ':' || p.share_cents, ',' order by m.display_name) from settleup.expense_participants p join settleup.group_members m on m.id = p.member_id where p.expense_id = e.id)
  from settleup.expenses e join settleup.groups g on g.id = e.group_id where g.name = 'Edit Trip'"
