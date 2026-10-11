#!/usr/bin/env bash
# Payment details against the LOCAL stack, then check what the server stored.
#   tools/ui-driver/run-payment.sh <simulator-udid> <path/to/Talli.app>
set -euo pipefail
cd "$(dirname "$0")"
source ./local-test-accounts.env
./local-fixtures.sh sql "delete from settleup.user_payment_profiles p using auth.users u where p.user_id = u.id and u.email = '$LOCAL_USER_A_EMAIL'" >/dev/null 2>&1 || true
./run.sh "$1" "$2" PaymentDetailsTests
./local-fixtures.sh sql "select to_jsonb(p) - 'id' - 'user_id' - 'created_at' - 'updated_at' from settleup.user_payment_profiles p join auth.users u on u.id = p.user_id where u.email = '$LOCAL_USER_A_EMAIL'"
