#!/usr/bin/env bash
# The five core UX flows against the LOCAL stack, measured (taps, fields,
# keystrokes, scrolls, screens) with screenshots. Each flow gets fresh seed
# data and a fresh install.
#   FLOW_PHASE=before|after tools/ui-driver/run-flows.sh <udid> <Talli.app> [Class ...]
# Defaults to the UXAfter* classes (UXBefore* only match the baseline build,
# tag ux-baseline-2026-10-09). Results: out/flows-<phase>.jsonl + out/<phase>-F*.png
set -euo pipefail
cd "$(dirname "$0")"
source ./local-test-accounts.env
PHASE="${FLOW_PHASE:-after}"
UDID="$1"; APP="$2"; shift 2
NAMED=$#
if [ $# -gt 0 ]; then CLASSES=("$@"); else
  P="UXAfter"; [ "$PHASE" = before ] && P="UXBefore"
  CLASSES=("${P}1FirstExpenseTests" "${P}2GroupExpenseTests" "${P}3CreateGroupTests" "${P}4SettleUpTests" "${P}5FixMistakeTests")
fi
mkdir -p out
# A full run starts clean; a run of named classes adds to the existing results.
[ "$NAMED" -eq 0 ] && rm -f "out/flows-$PHASE.jsonl" out/"$PHASE"-F*.png

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
for cls in "${CLASSES[@]}"; do
  seed
  FLOW_PHASE="$PHASE" ./run.sh "$UDID" "$APP" "$cls" || status=1
done
echo "--- out/flows-$PHASE.jsonl"
cat "out/flows-$PHASE.jsonl" 2>/dev/null || true
exit $status
