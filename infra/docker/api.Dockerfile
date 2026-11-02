# Company OS API and worker image (02-architecture.md section 5).
# The same image runs the API (default) and the worker (WORKER_ENABLED=true).
# Build context is the repository root:  docker build -f infra/docker/api.Dockerfile .

FROM node:22-bookworm-slim AS base
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH CI=true
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate \
 && apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /repo

# ---- dependencies (cached by lockfile)
FROM base AS deps
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json tsconfig.base.json turbo.json ./
COPY packages/contracts/package.json packages/contracts/
COPY packages/config/package.json packages/config/
COPY apps/api/package.json apps/api/
RUN pnpm install --frozen-lockfile --filter @company-os/api... --filter @company-os/contracts...

# ---- build
FROM deps AS build
COPY packages/contracts packages/contracts
COPY apps/api apps/api
RUN pnpm --filter @company-os/contracts build \
 && pnpm --filter @company-os/api exec prisma generate \
 && pnpm --filter @company-os/api exec nest build \
 && pnpm --filter @company-os/api --prod deploy /out

# ---- runtime
FROM node:22-bookworm-slim AS runtime
ENV NODE_ENV=production PORT=4000
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates curl && rm -rf /var/lib/apt/lists/* \
 && groupadd -r app && useradd -r -g app -d /app app
WORKDIR /app
COPY --from=build --chown=app:app /out/node_modules ./node_modules
COPY --from=build --chown=app:app /out/package.json ./package.json
COPY --from=build --chown=app:app /repo/apps/api/dist ./dist
COPY --from=build --chown=app:app /repo/apps/api/prisma ./prisma
COPY --chown=app:app infra/docker/api-entrypoint.sh /app/entrypoint.sh
RUN chmod +x /app/entrypoint.sh
USER app
EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 CMD curl -fsS http://localhost:4000/api/v1/health || exit 1
ENTRYPOINT ["/app/entrypoint.sh"]
