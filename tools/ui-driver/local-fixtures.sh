#!/usr/bin/env bash
# Helpers for signed-in journeys against the LOCAL Supabase stack.
#   local-fixtures.sh signup <email> <display name>   -> prints access token
#   local-fixtures.sh token <email>                    -> prints access token
#   local-fixtures.sh rpc <token> <fn> '<json args>'   -> prints JSON result
#   local-fixtures.sh sql '<query>'                    -> runs SQL as postgres
set -euo pipefail
cd "$(dirname "$0")"
source ./local-test-accounts.env
ROOT="$(git rev-parse --show-toplevel)"
eval "$(cd "$ROOT" && npx supabase status -o env 2>/dev/null | grep -E '^(API_URL|ANON_KEY)=')"
case "$API_URL" in http://127.0.0.1:*|http://localhost:*) ;; *) echo "refusing: API_URL is not local" >&2; exit 1;; esac
H=(-H "apikey: $ANON_KEY" -H "Content-Type: application/json")
cmd="$1"; shift
case "$cmd" in
  signup)
    curl -s "${H[@]}" "$API_URL/auth/v1/signup" \
      -d "{\"email\":\"$1\",\"password\":\"$LOCAL_TEST_PASSWORD\",\"data\":{\"full_name\":\"$2\"}}" \
      | python3 -c 'import sys,json; print(json.load(sys.stdin).get("access_token",""))' ;;
  token)
    curl -s "${H[@]}" "$API_URL/auth/v1/token?grant_type=password" \
      -d "{\"email\":\"$1\",\"password\":\"$LOCAL_TEST_PASSWORD\"}" \
      | python3 -c 'import sys,json; print(json.load(sys.stdin).get("access_token",""))' ;;
  rpc)
    curl -s "${H[@]}" -H "Authorization: Bearer $1" -H "Content-Profile: settleup" \
      -H "Accept-Profile: settleup" -H "x-ledger-version: 2" "$API_URL/rest/v1/rpc/$2" -d "${3:-{\}}" ;;
  sql)
    docker exec -i supabase_db_settleup psql -U postgres -tA -c "$1" ;;
  *) echo "unknown command $cmd" >&2; exit 1 ;;
esac
