#!/usr/bin/env bash
# Assistant journeys against the LOCAL stack. Seeds an "Assistant Trip" group
# owned by Ana with two members who have no account (Carla, Dina), runs the
# guest and signed-in assistant journeys, then prints the server state.
#   tools/ui-driver/run-assistant.sh <simulator-udid> <path/to/Talli.app>
set -euo pipefail
cd "$(dirname "$0")"
source ./local-test-accounts.env
./local-fixtures.sh sql "delete from settleup.groups where name = 'Assistant Trip'" >/dev/null
./local-fixtures.sh sql "DO \$\$
DECLARE ana uuid := (SELECT id FROM auth.users WHERE email = '$LOCAL_USER_A_EMAIL'); g uuid;
BEGIN
  PERFORM set_config('request.headers', '{\"x-ledger-version\":\"2\"}', true);
  PERFORM set_config('role', 'authenticated', true);
  PERFORM set_config('request.jwt.claim.sub', ana::text, true);
  PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', ana, 'role', 'authenticated')::text, true);
  g := (settleup.create_group_v2('Assistant Trip', gen_random_uuid(), 'PHP', 'Ana')->'group'->>'id')::uuid;
  PERFORM set_config('role', 'postgres', true);
  INSERT INTO settleup.group_members(group_id, display_name, slug, share_token) VALUES
    (g, 'Carla', 'asst-carla-' || left(g::text, 8), encode(extensions.gen_random_bytes(16), 'hex')),
    (g, 'Dina', 'asst-dina-' || left(g::text, 8), encode(extensions.gen_random_bytes(16), 'hex'));
END \$\$;" >/dev/null
./run.sh "$1" "$2" AssistantGuestJourneyTests AssistantSignedInJourneyTests
./local-fixtures.sh sql "select
    (select string_agg(item_name || '=' || amount_cents || ' [' || (select string_agg(m.display_name || ':' || p.share_cents, ',' order by m.display_name) from settleup.expense_participants p join settleup.group_members m on m.id = p.member_id where p.expense_id = e.id) || ']', '; ') from settleup.expenses e where e.group_id = g.id) as expenses,
    (select string_agg(amount_cents::text || ' from ' || (select display_name from settleup.group_members where id = from_member_id), ', ') from settleup.payments where group_id = g.id) as payments
  from settleup.groups g where g.name = 'Assistant Trip'"
