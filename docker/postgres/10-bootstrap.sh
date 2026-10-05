#!/bin/sh
# Runs ONCE, when the Postgres volume is first created (docker-entrypoint-initdb.d).
# The same statements are in k8s/db-bootstrap.sql for a real server (run by a DBA, by hand).
#
# One login role per service, one schema per service, each schema owned by its service:
#   pension_auth   owned by AUTH_DB_USER   users, roles, permissions, sessions, districts, centers
#   pension_audit  owned by AUTH_DB_USER   the audit log; other services may only call append_event()
#   pension_core   owned by CORE_DB_USER   beneficiaries, applications, PPO, payments
#   pension_data   owned by DATA_DB_USER   import batches, staged rows, export jobs
# A service can never read or write another service's schema. Rule R-DB-1 in AGENTS.md.
set -eu

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<SQL
CREATE ROLE ${AUTH_DB_USER} LOGIN PASSWORD '${AUTH_DB_PASSWORD}';
CREATE ROLE ${CORE_DB_USER} LOGIN PASSWORD '${CORE_DB_PASSWORD}';
CREATE ROLE ${DATA_DB_USER} LOGIN PASSWORD '${DATA_DB_PASSWORD}';

REVOKE ALL ON DATABASE ${POSTGRES_DB} FROM PUBLIC;
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
GRANT CONNECT ON DATABASE ${POSTGRES_DB} TO ${AUTH_DB_USER}, ${CORE_DB_USER}, ${DATA_DB_USER};

CREATE SCHEMA pension_auth  AUTHORIZATION ${AUTH_DB_USER};
CREATE SCHEMA pension_audit AUTHORIZATION ${AUTH_DB_USER};
CREATE SCHEMA pension_core  AUTHORIZATION ${CORE_DB_USER};
CREATE SCHEMA pension_data  AUTHORIZATION ${DATA_DB_USER};

-- Core and data reach the audit log only through pension_audit.append_event() (created by the
-- auth-service migration, SECURITY DEFINER). USAGE lets them call it; no table privilege is given.
GRANT USAGE ON SCHEMA pension_audit TO ${CORE_DB_USER}, ${DATA_DB_USER};

ALTER ROLE ${AUTH_DB_USER} SET search_path = pension_auth;
ALTER ROLE ${CORE_DB_USER} SET search_path = pension_core;
ALTER ROLE ${DATA_DB_USER} SET search_path = pension_data;
ALTER DATABASE ${POSTGRES_DB} SET timezone = 'Asia/Kolkata';
SQL
