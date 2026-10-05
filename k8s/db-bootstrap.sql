-- One-time database bootstrap for a real server (UAT / production). Run by a DBA as a superuser,
-- once, BEFORE the first migration Job. Same statements as docker/postgres/10-bootstrap.sh (local).
-- Replace every __PASSWORD__ with the value stored in the matching Kubernetes Secret.
--
--   psql -h <host> -U postgres -v ON_ERROR_STOP=1 -f k8s/db-bootstrap.sql

CREATE DATABASE hiv_pension;
\connect hiv_pension

CREATE ROLE pension_auth_svc LOGIN PASSWORD '__PASSWORD__';
CREATE ROLE pension_core_svc LOGIN PASSWORD '__PASSWORD__';
CREATE ROLE pension_data_svc LOGIN PASSWORD '__PASSWORD__';

REVOKE ALL ON DATABASE hiv_pension FROM PUBLIC;
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
GRANT CONNECT ON DATABASE hiv_pension TO pension_auth_svc, pension_core_svc, pension_data_svc;

CREATE SCHEMA pension_auth  AUTHORIZATION pension_auth_svc;
CREATE SCHEMA pension_audit AUTHORIZATION pension_auth_svc;
CREATE SCHEMA pension_core  AUTHORIZATION pension_core_svc;
CREATE SCHEMA pension_data  AUTHORIZATION pension_data_svc;

GRANT USAGE ON SCHEMA pension_audit TO pension_core_svc, pension_data_svc;

ALTER ROLE pension_auth_svc SET search_path = pension_auth;
ALTER ROLE pension_core_svc SET search_path = pension_core;
ALTER ROLE pension_data_svc SET search_path = pension_data;
ALTER DATABASE hiv_pension SET timezone = 'Asia/Kolkata';
