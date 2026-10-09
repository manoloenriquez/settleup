#!/usr/bin/env bash
# Same-name join warning against the LOCAL stack (JoinDuplicateJourneyTests).
#   tools/ui-driver/run-join.sh <simulator-udid> <path/to/Talli.app>
set -euo pipefail
cd "$(dirname "$0")"
source ./local-test-accounts.env
./local-fixtures.sh sql "delete from settleup.groups where name = 'Join Check'" >/dev/null
./local-fixtures.sh sql "DO \$\$
DECLARE ana uuid := (SELECT id FROM auth.users WHERE email = '$LOCAL_USER_A_EMAIL'); g uuid;
BEGIN
  PERFORM set_config('request.headers', '{\"x-ledger-version\":\"2\"}', true);
  PERFORM set_config('role', 'authenticated', true);
  PERFORM set_config('request.jwt.claim.sub', ana::text, true);
  PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', ana, 'role', 'authenticated')::text, true);
  g := (settleup.create_group_v2('Join Check', gen_random_uuid(), 'PHP', 'Ana')->'group'->>'id')::uuid;
  PERFORM set_config('role', 'postgres', true);
  INSERT INTO settleup.group_members(group_id, display_name, slug, share_token)
    VALUES (g, 'Ben', 'join-ben-' || left(g::text, 8), encode(extensions.gen_random_bytes(16), 'hex'));
END \$\$;" >/dev/null
JOIN_CODE=$(./local-fixtures.sh sql "select invite_code from settleup.groups where name = 'Join Check'")
export JOIN_CODE
TEST_RUNNER_JOIN_CODE="$JOIN_CODE" ./run.sh "$1" "$2" JoinDuplicateJourneyTests
# Expect two Bens only after "Join as a New Member" (the first attempt added nobody).
./local-fixtures.sh sql "select string_agg(display_name || case when user_id is null then ' (no account)' else ' (account)' end, ', ' order by user_id nulls first)
  from settleup.group_members m join settleup.groups g on g.id = m.group_id where g.name = 'Join Check'"
