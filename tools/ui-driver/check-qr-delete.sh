#!/usr/bin/env bash
# Payment QR deletes through the real Storage API on the LOCAL stack: Ana can
# delete her own file, not Ben's, and uploads of the wrong type are refused.
set -euo pipefail
cd "$(dirname "$0")"
source ./local-test-accounts.env
eval "$(cd ../.. && npx supabase status -o env 2>/dev/null | grep -E '^(API_URL|ANON_KEY)=')"
ana=$(./local-fixtures.sh token "$LOCAL_USER_A_EMAIL"); ben=$(./local-fixtures.sh token "$LOCAL_USER_B_EMAIL")
ana_id=$(./local-fixtures.sh sql "select id from auth.users where email = '$LOCAL_USER_A_EMAIL'")
ben_id=$(./local-fixtures.sh sql "select id from auth.users where email = '$LOCAL_USER_B_EMAIL'")
png=$(mktemp); printf '\x89PNG\r\n\x1a\n' > "$png"
up() { curl -s -o /dev/null -w "%{http_code}" -H "apikey: $ANON_KEY" -H "Authorization: Bearer $1" -H "Content-Type: $3" --data-binary @"$png" "$API_URL/storage/v1/object/payment-qr/$2"; }
rm_() { curl -s -X DELETE -H "apikey: $ANON_KEY" -H "Authorization: Bearer $1" -H "Content-Type: application/json" -d "{\"prefixes\":[\"$2\"]}" "$API_URL/storage/v1/object/payment-qr"; }
count() { ./local-fixtures.sh sql "select count(*) from storage.objects where bucket_id = 'payment-qr' and name = '$1'"; }
a="$ana_id/check-$(date +%s).png"; b="$ben_id/check-$(date +%s).png"
[ "$(up "$ana" "$a" image/png)" = 200 ] && [ "$(up "$ben" "$b" image/png)" = 200 ] || { echo "FAIL upload"; exit 1; }
[ "$(up "$ana" "$ana_id/evil.svg" image/svg+xml)" != 200 ] || { echo "FAIL svg accepted"; exit 1; }
lst() { curl -s -H "apikey: $ANON_KEY" -H "Authorization: Bearer $1" -H "Content-Type: application/json" -d "{\"prefix\":\"$2\",\"limit\":100}" "$API_URL/storage/v1/object/list/payment-qr" | python3 -c 'import sys,json; print(len(json.load(sys.stdin)))'; }
[ "$(lst "$ana" "$ana_id")" -ge 1 ] || { echo "FAIL Ana cannot list her own folder (account closure cleanup needs it)"; exit 1; }
[ "$(lst "$ana" "$ben_id")" = 0 ] || { echo "FAIL Ana can list Ben's folder"; exit 1; }
rm_ "$ana" "$b" >/dev/null; [ "$(count "$b")" = 1 ] || { echo "FAIL Ana deleted Ben's QR"; exit 1; }
rm_ "$ana" "$a" >/dev/null; [ "$(count "$a")" = 0 ] || { echo "FAIL Ana could not delete her own QR"; exit 1; }
rm_ "$ben" "$b" >/dev/null
echo "PASS qr storage: own list+delete work, others' refused, non-images refused"
