# Deployment

Nothing here has been deployed yet: hosting is open (Q-16). The manifests are ready for any Kubernetes cluster with a Postgres 17, a Redis and an S3-compatible store.

## 1. Images

```bash
docker build -t <registry>/pension-auth-service:<tag> services/pension-auth-service
docker build -t <registry>/pension-core-service:<tag> services/pension-core-service
docker build -t <registry>/pension-data-service:<tag> services/pension-data-service
docker build -t <registry>/pension-web:<tag> web/pension-web
```

Every image runs as a non-root user on `node:24-slim` with `NODE_ENV=production`. Images never run migrations. In every `kube-manifests/*.yaml`, replace `REGISTRY` and `TAG`.

## 2. One-time setup per environment

1. **Namespace:**
   ```bash
   kubectl apply -f k8s/namespace.yaml
   ```
2. **Database:** a DBA runs [k8s/db-bootstrap.sql](../k8s/db-bootstrap.sql) once, with real passwords. It creates one DB, one login per service, one schema per service, and the audit grant.
3. **Secrets:** create them from [k8s/pension-secret.example.yaml](../k8s/pension-secret.example.yaml), with values from the secret store.
   - Generate `PII_ENCRYPTION_KEY` and `PII_HMAC_KEY` once per environment and **back them up**. Losing `PII_ENCRYPTION_KEY` makes every encrypted field unreadable.
   - Never reuse local or UAT keys in production.
4. **Network policies:**
   ```bash
   kubectl apply -f k8s/network-policy.yaml
   ```
5. **Bucket:** create the private bucket `MINIO_BUCKET`, with no anonymous access.

## 3. Every release

In this order. Stop at the first failure.

```bash
# 1. migrations (auth first: it creates the audit function the others use)
for s in auth core data; do
  kubectl -n hiv-pension delete job pension-$s-service-migrate --ignore-not-found
  kubectl apply -f services/pension-$s-service/kube-manifests/migration-job.yaml
  kubectl -n hiv-pension wait --for=condition=complete --timeout=300s job/pension-$s-service-migrate
done
# 2. rbac catalogue, districts (and placeholder Centers on an empty DB)
kubectl -n hiv-pension delete job pension-auth-service-seed --ignore-not-found
kubectl apply -f services/pension-auth-service/kube-manifests/seed-job.yaml
kubectl -n hiv-pension wait --for=condition=complete --timeout=300s job/pension-auth-service-seed
# 3. services, then web
for s in auth core data; do kubectl apply -f services/pension-$s-service/kube-manifests/deployment.yaml; done
kubectl apply -f web/pension-web/kube-manifests/
kubectl apply -f services/pension-data-service/kube-manifests/purge-cronjob.yaml
```

## 4. First Super Admin in a new environment

No dev users exist outside `APP_ENV=local`. Create the first Super Admin once, as a Job or with `kubectl run`, using the auth image and its secrets with `DB_ALLOW_MIGRATIONS=true`:

```bash
node dist/dev/create-superadmin.js <user_code> <mobile> "<Full Name>"
```

The command:

- prints a temporary password ONCE. Hand it over in person;
- refuses to run if a Super Admin already exists.

At first login the account must change the password with an SMS OTP and enrol TOTP. It then creates every other user in the portal.

## 5. Checks after a rollout

- `GET /health/ready` on each service answers `ready`.
- Log in as the Super Admin. Then:
  - Audit Log > Verify Integrity: all chains OK (until Phase 0b ships the screen: `GET /auth/api/v1/audit/verify`);
  - Masters > Centers: list loads (until then: the Center list on the login page loads).
- Logs are JSON, contain no request bodies, and contain no `dev_answer`.
