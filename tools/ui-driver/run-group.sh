#!/usr/bin/env bash
# Journey D against the LOCAL stack: Ana starts with no groups, creates one in
# the app, and the server state is checked afterwards.
#   tools/ui-driver/run-group.sh <simulator-udid> <path/to/Talli.app>
set -euo pipefail
cd "$(dirname "$0")"
source ./local-test-accounts.env
./local-fixtures.sh sql "delete from settleup.groups g using settleup.group_members m, auth.users u
  where m.group_id = g.id and m.user_id = u.id and u.email = '$LOCAL_USER_A_EMAIL' and g.kind = 'shared'" >/dev/null
./run.sh "$1" "$2" GroupJourneyTests
./local-fixtures.sh sql "select g.name, g.share_enabled,
    (select string_agg(display_name || coalesce('(' || left(user_id::text, 4) || ')', ''), ', ' order by display_name) from settleup.group_members where group_id = g.id) as members,
    (select string_agg(item_name || '=' || amount_cents, ', ') from settleup.expenses where group_id = g.id) as expenses,
    (select string_agg(amount_cents::text, ', ') from settleup.payments where group_id = g.id) as payments
  from settleup.groups g where g.name = 'Boracay Trip'"
