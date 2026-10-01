#!/usr/bin/env bash
# Journey C against the LOCAL stack: Ben creates a friend invite through the
# API, then FriendJourneyTests accepts it in the app as Ana.
#   tools/ui-driver/run-friend.sh <simulator-udid> <path/to/Talli.app>
set -euo pipefail
cd "$(dirname "$0")"
source ./local-test-accounts.env
# Fresh start: Ana and Ben stop being friends (the direct ledger stays, as in the app).
ben=$(./local-fixtures.sh token "$LOCAL_USER_B_EMAIL")
ana_id=$(./local-fixtures.sh sql "select id from auth.users where email = '$LOCAL_USER_A_EMAIL'")
./local-fixtures.sh rpc "$ben" remove_friend "{\"p_friend_user_id\":\"$ana_id\"}" >/dev/null || true
FRIEND_TOKEN=$(./local-fixtures.sh rpc "$ben" create_friend_invite '{"p_display_name":"Ben","p_currency_code":"PHP"}' \
  | python3 -c 'import sys,json; print(json.load(sys.stdin)["token"])')
export FRIEND_TOKEN
./run.sh "$1" "$2" FriendJourneyTests
# The server agrees: the friendship exists and the ledger nets to zero.
./local-fixtures.sh sql "select f.direct_group_id, (select coalesce(sum(amount_cents),0) from settleup.expenses e where e.group_id = f.direct_group_id) as spent
  from settleup.friendships f join auth.users a on a.id in (f.user_low, f.user_high) and a.email = '$LOCAL_USER_A_EMAIL'
  join auth.users b on b.id in (f.user_low, f.user_high) and b.email = '$LOCAL_USER_B_EMAIL'"
