#!/usr/bin/env bash
# One-time local setup. Safe to re-run: an existing env/local.env is never overwritten.
#   1. env/local.env from env/local.env.example, every __GENERATE__ replaced by a random value
#   2. docker-compose infrastructure (postgres, redis, minio) up and healthy
#   3. npm ci in every service and in the web app
#   4. migrations + seed (scripts/dev.sh migrate && scripts/dev.sh seed)
#
#   scripts/setup.sh --env-only   only step 1
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

command -v docker >/dev/null || { echo "docker is required"; exit 1; }
command -v node >/dev/null || { echo "node >= 22 is required"; exit 1; }
command -v openssl >/dev/null || { echo "openssl is required"; exit 1; }

ENV_FILE="$ROOT/env/local.env"
if [[ -f "$ENV_FILE" ]]; then
  echo "env/local.env exists, keeping it"
else
  echo "creating env/local.env with fresh secrets"
  b64key() { openssl rand -base64 32 | tr -d '\n'; }
  hexpw() { openssl rand -hex 24; }
  : >"$ENV_FILE"
  while IFS= read -r line || [[ -n "$line" ]]; do
    if [[ "$line" == *"=__GENERATE__" ]]; then
      key="${line%%=*}"
      case "$key" in
        PII_ENCRYPTION_KEY|PII_HMAC_KEY) val="$(b64key)" ;;
        JWT_SIGNING_KEY) val="$(openssl rand -base64 48 | tr -d '\n/+=')" ;;
        # Must satisfy the password policy (V-006): upper, lower, digit, symbol, >= 10 chars.
        DEV_USER_PASSWORD) val="Dev@$(openssl rand -hex 6)Pw9" ;;
        *) val="$(hexpw)" ;;
      esac
      echo "$key=$val" >>"$ENV_FILE"
    else
      echo "$line" >>"$ENV_FILE"
    fi
  done <"$ROOT/env/local.env.example"
  chmod 600 "$ENV_FILE"
fi
[[ "${1:-}" == "--env-only" ]] && exit 0

"$ROOT/scripts/dev.sh" infra-up

for dir in services/pension-auth-service services/pension-core-service services/pension-data-service web/pension-web; do
  if [[ -f "$ROOT/$dir/package.json" ]]; then
    echo "npm ci in $dir"
    (cd "$ROOT/$dir" && npm ci --no-audit --no-fund)
  fi
done

"$ROOT/scripts/dev.sh" migrate
"$ROOT/scripts/dev.sh" seed

echo
echo "setup complete. Start everything with: scripts/dev.sh up"
echo "dev user password is DEV_USER_PASSWORD in env/local.env (users are listed in docs/SEED_DATA.md)"
