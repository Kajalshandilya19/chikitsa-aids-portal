# syntax=docker/dockerfile:1.7
# pension-web: Next.js 16 standalone build. Runs as the non-root "node" user on node:24-slim.

FROM node:24 AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm ci --no-audit --no-fund

FROM node:24 AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
# Inlined at build time (cookie names are needed by the edge proxy).
ARG SESSION_COOKIE_PREFIX=hp
ENV SESSION_COOKIE_PREFIX=${SESSION_COOKIE_PREFIX}
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:24-slim AS runtime
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends tini curl && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3200 HOSTNAME=0.0.0.0
COPY --chown=node:node --from=build /app/.next/standalone ./
COPY --chown=node:node --from=build /app/.next/static ./.next/static
COPY --chown=node:node --from=build /app/public ./public
# No source maps in a deployable image (they rebuild the source tree).
RUN find /app -name "*.map" -not -path "*/node_modules/*" -delete
USER node
EXPOSE 3200
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 CMD curl -fs http://127.0.0.1:3200/robots.txt || exit 1
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "server.js"]
