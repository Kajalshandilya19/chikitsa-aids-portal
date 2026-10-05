# syntax=docker/dockerfile:1.7
# Same layout in every service; only the port differs (auth 3201, core 3202, data 3203).

# ---- builder ----
# node:24 (Debian) ships python3/make/g++ for argon2's native build.
FROM node:24 AS builder
WORKDIR /app

COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm ci --no-audit --no-fund

COPY tsconfig.json ./
COPY src ./src
RUN npx tsc -p tsconfig.json && npm prune --omit=dev

# ---- runtime ----
# node:24-slim matches the builder's glibc so the argon2 binding loads.
FROM node:24-slim AS runtime
WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends tini curl \
    && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production
ENV PORT=3202

COPY --chown=node:node --from=builder /app/node_modules ./node_modules
COPY --chown=node:node --from=builder /app/dist ./dist
COPY --chown=node:node package.json ./

USER node
EXPOSE 3202

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD curl -fs http://127.0.0.1:3202/health || exit 1

# Migrations are NOT run here. The Kubernetes Job in kube-manifests/migration-job.yaml runs them.
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "dist/index.js"]
