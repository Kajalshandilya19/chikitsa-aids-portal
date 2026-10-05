#!/usr/bin/env bash
# Local developer entry point. Every command loads env/local.env first.
#
#   scripts/dev.sh infra-up        start postgres, redis, minio (docker-compose) and wait until healthy
#   scripts/dev.sh infra-down      stop them (data is kept in docker volumes)
#   scripts/dev.sh up              infra-up, then the 3 services and the web app in the background
#   scripts/dev.sh down            stop the services and the web app (infra keeps running)
#   scripts/dev.sh start <name>    start one component: auth | core | data | web
#   scripts/dev.sh stop <name>     stop one component
#   scripts/dev.sh status          what is running, on which port
#   scripts/dev.sh logs <name>     tail a log: auth | core | data | web
#   scripts/dev.sh migrate         run pending migrations: auth, then core, then data
#   scripts/dev.sh seed            RBAC catalogue, districts, centers, settings, dev users (idempotent)
#   scripts/dev.sh creds [--reset] local logins (docs/DEMO_LOGINS.md); --reset re-issues demo users' passwords
#   scripts/dev.sh check           lib sync + rule check + typecheck + lint + tests in every package
#   scripts/dev.sh acceptance <n>  phase n acceptance script (scripts/acceptance/phase<n>.mjs); add --allow-todo while building
#   scripts/dev.sh smoke           both Phase 0 smoke scripts
#   scripts/dev.sh psql            psql shell as the admin user
#   scripts/dev.sh reset-db        DELETE the local database volume and start over (asks first)
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="$ROOT/env/local.env"
LOGS="$ROOT/.logs"
RUN="$ROOT/.run"
mkdir -p "$LOGS" "$RUN"

[[ -f "$ENV_FILE" ]] || { echo "env/local.env missing: run scripts/setup.sh first"; exit 1; }
set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a

SERVICES=(auth core data)
dir_of() {
  case "$1" in
    auth) echo "$ROOT/services/pension-auth-service" ;;
    core) echo "$ROOT/services/pension-core-service" ;;
    data) echo "$ROOT/services/pension-data-service" ;;
    web) echo "$ROOT/web/pension-web" ;;
    *) echo "unknown component: $1" >&2; exit 1 ;;
  esac
}
port_of() {
  case "$1" in
    auth) echo "$AUTH_SERVICE_PORT" ;;
    core) echo "$CORE_SERVICE_PORT" ;;
    data) echo "$DATA_SERVICE_PORT" ;;
    web) echo "$WEB_PORT" ;;
  esac
}

compose() { docker compose --project-directory "$ROOT" -f "$ROOT/docker-compose.yml" --env-file "$ENV_FILE" "$@"; }

is_running() {
  local pidfile="$RUN/$1.pid"
  [[ -f "$pidfile" ]] && kill -0 "$(cat "$pidfile")" 2>/dev/null
}

start_one() {
  local name="$1" dir
  dir="$(dir_of "$name")"
  if is_running "$name"; then echo "$name already running"; return; fi
  [[ -d "$dir/node_modules" ]] || { echo "$name: node_modules missing, run: (cd $dir && npm ci)"; exit 1; }
  if [[ "$name" == "web" ]]; then
    (cd "$dir" && nohup npm run dev >"$LOGS/$name.log" 2>&1 & echo $! >"$RUN/$name.pid")
  else
    (cd "$dir" && nohup npm run start:dev >"$LOGS/$name.log" 2>&1 & echo $! >"$RUN/$name.pid")
  fi
  echo "$name starting on :$(port_of "$name") (log: .logs/$name.log)"
}

stop_one() {
  local name="$1" pidfile="$RUN/$1.pid"
  if is_running "$name"; then
    local pid
    pid="$(cat "$pidfile")"
    # npm starts a child process tree; stop the whole group.
    pkill -TERM -P "$pid" 2>/dev/null || true
    kill -TERM "$pid" 2>/dev/null || true
    echo "$name stopped"
  fi
  rm -f "$pidfile"
}

cmd="${1:-help}"
case "$cmd" in
  infra-up)
    compose up -d --wait
    echo "infra healthy: postgres :$DB_PORT, redis :$REDIS_PORT, minio :$MINIO_PORT (console :$MINIO_CONSOLE_PORT)"
    ;;
  infra-down)
    compose stop
    ;;
  up)
    "$0" infra-up
    for s in "${SERVICES[@]}"; do start_one "$s"; done
    start_one web
    echo "web: $WEB_ORIGIN"
    ;;
  down)
    stop_one web
    for s in "${SERVICES[@]}"; do stop_one "$s"; done
    ;;
  start)
    start_one "${2:?usage: scripts/dev.sh start auth|core|data|web}"
    ;;
  stop)
    stop_one "${2:?usage: scripts/dev.sh stop auth|core|data|web}"
    ;;
  status)
    compose ps --format 'table {{.Name}}\t{{.Status}}'
    for s in "${SERVICES[@]}" web; do
      if is_running "$s"; then echo "$s: running (pid $(cat "$RUN/$s.pid"), :$(port_of "$s"))"; else echo "$s: stopped"; fi
    done
    ;;
  logs)
    name="${2:?usage: scripts/dev.sh logs auth|core|data|web}"
    tail -n 200 -f "$LOGS/$name.log"
    ;;
  migrate)
    for s in "${SERVICES[@]}"; do
      echo "== migrate $s"
      (cd "$(dir_of "$s")" && npm run migration:run)
    done
    ;;
  seed)
    echo "== seed auth (RBAC catalogue, districts, centers, dev users)"
    (cd "$(dir_of auth)" && npm run seed)
    echo "== seed core (settings)"
    (cd "$(dir_of core)" && npm run seed)
    ;;
  creds)
    node "$ROOT/scripts/demo-logins.mjs" "${@:2}"
    ;;
  check)
    "$ROOT/scripts/check-lib-sync.sh"
    node "$ROOT/scripts/check-rules.mjs"
    for s in "${SERVICES[@]}" web; do
      d="$(dir_of "$s")"
      echo "== check $s"
      (cd "$d" && npm run typecheck && npm run lint && npm test --if-present)
    done
    ;;
  acceptance)
    n="${2:?usage: scripts/dev.sh acceptance <1-5> [--allow-todo]}"
    node "$ROOT/scripts/acceptance/phase$n.mjs" "${@:3}"
    ;;
  smoke)
    node "$ROOT/scripts/smoke-auth.mjs" && node "$ROOT/scripts/smoke-data.mjs"
    ;;
  psql)
    compose exec postgres psql -U "$DB_ADMIN_USER" -d "$DB_NAME"
    ;;
  reset-db)
    read -r -p "This DELETES the local database and object store volumes. Type 'reset' to continue: " answer
    [[ "$answer" == "reset" ]] || { echo "cancelled"; exit 1; }
    "$0" down || true
    compose down -v
    "$0" infra-up
    "$0" migrate
    "$0" seed
    ;;
  *)
    sed -n '2,19p' "$0"
    ;;
esac
