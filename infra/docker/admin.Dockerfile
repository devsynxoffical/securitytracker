# Company OS Admin Panel: Next.js static export served by Caddy.
# Build context is the repository root:  docker build -f infra/docker/admin.Dockerfile --build-arg NEXT_PUBLIC_API_URL=https://api.example.com/api/v1 .

FROM node:22-bookworm-slim AS base
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH CI=true NEXT_TELEMETRY_DISABLED=1
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate
WORKDIR /repo

FROM base AS deps
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json tsconfig.base.json turbo.json ./
COPY packages/contracts/package.json packages/contracts/
COPY packages/config/package.json packages/config/
COPY apps/admin/package.json apps/admin/
RUN pnpm install --frozen-lockfile --filter @company-os/admin... --filter @company-os/contracts...

FROM deps AS build
ARG NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL}
COPY packages/contracts packages/contracts
COPY apps/admin apps/admin
RUN pnpm --filter @company-os/contracts build && pnpm --filter @company-os/admin build

# Static files only; Caddy in the compose stack serves them with security headers.
FROM caddy:2-alpine AS runtime
COPY --from=build /repo/apps/admin/out /srv/admin
COPY infra/caddy/admin-static.Caddyfile /etc/caddy/Caddyfile
EXPOSE 8080
