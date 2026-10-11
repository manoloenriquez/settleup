#!/usr/bin/env bash
# Plant an old-shaped ["dashboard"] entry in the installed app's saved query
# cache (what TestFlight build 1 left behind), to reproduce the build 2 launch
# crash or to drive RecoveryTests. The app must have run signed in once.
#   tools/ui-driver/plant-bad-cache.sh <simulator-udid> [buster-to-write]
set -euo pipefail
UDID="$1"
xcrun simctl terminate "$UDID" com.manoloenriquez.talli >/dev/null 2>&1 || true
DIR="$(xcrun simctl get_app_container "$UDID" com.manoloenriquez.talli data)/Library/Application Support/com.manoloenriquez.talli/RCTAsyncLocalStorage_V1"
python3 - "$DIR" "${2:-}" <<'PY'
import json, sys, os, hashlib, time
d, buster = sys.argv[1], sys.argv[2]
mp = os.path.join(d, "manifest.json")
m = json.load(open(mp))
for k, v in list(m.items()):
    if "query-cache" not in k:
        continue
    f = os.path.join(d, hashlib.md5(k.encode()).hexdigest())
    inline = v is not None
    snap = json.loads(v if inline else open(f).read())
    if buster:
        snap["buster"] = buster + snap["buster"][snap["buster"].index(":"):]
    for q in snap["clientState"]["queries"]:
        if q["queryKey"] == ["dashboard"]:
            q["state"]["data"] = {"total_owed_cents": 100, "groups": []}
            q["state"]["dataUpdatedAt"] = int(time.time() * 1000)
    out = json.dumps(snap)
    if inline:
        m[k] = out
        json.dump(m, open(mp, "w"))
    else:
        open(f, "w").write(out)
    print("planted old dashboard shape in", k.split(":")[-1])
PY
