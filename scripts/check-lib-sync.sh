#!/usr/bin/env bash
# Rule R-LIB-1 (AGENTS.md): services/*/src/lib/ is byte-identical in all three services, and the
# shared files the web app needs are byte-identical copies of the service ones.
# Exits non-zero and prints the differing files when anything drifted. Run before every commit
# (scripts/dev.sh check runs it first).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
REF="$ROOT/services/pension-auth-service/src/lib"
fail=0

for svc in pension-core-service pension-data-service; do
  other="$ROOT/services/$svc/src/lib"
  if ! diff -rq "$REF" "$other" >/dev/null; then
    echo "DRIFT: services/$svc/src/lib differs from services/pension-auth-service/src/lib"
    diff -rq "$REF" "$other" || true
    fail=1
  fi
done

# Files the browser needs too. Same bytes, so a rule changed on one side is changed on both.
for f in validators.ts permission-codes.ts; do
  if ! cmp -s "$REF/$f" "$ROOT/web/pension-web/src/lib/shared/$f"; then
    echo "DRIFT: web/pension-web/src/lib/shared/$f differs from services/pension-auth-service/src/lib/$f"
    fail=1
  fi
done

if [[ $fail -eq 0 ]]; then
  echo "lib sync OK: 3 services identical, web shared files identical"
else
  echo
  echo "Fix: make the change in services/pension-auth-service/src/lib, then run scripts/sync-lib.sh"
  exit 1
fi
