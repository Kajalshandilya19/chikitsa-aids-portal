#!/usr/bin/env bash
# Copies services/pension-auth-service/src/lib to the other two services and the shared files to
# the web app. The auth-service copy is the master (rule R-LIB-1). Review `git diff` afterwards.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
REF="$ROOT/services/pension-auth-service/src/lib"

for svc in pension-core-service pension-data-service; do
  mkdir -p "$ROOT/services/$svc/src"
  rm -rf "$ROOT/services/$svc/src/lib"
  cp -R "$REF" "$ROOT/services/$svc/src/lib"
  echo "synced services/$svc/src/lib"
done

mkdir -p "$ROOT/web/pension-web/src/lib/shared"
for f in validators.ts permission-codes.ts; do
  cp "$REF/$f" "$ROOT/web/pension-web/src/lib/shared/$f"
  echo "synced web/pension-web/src/lib/shared/$f"
done
