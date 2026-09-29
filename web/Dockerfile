# Pattern from Agari b/Dockerfile: built from the repo root so the workspace packages web imports as TypeScript
# source are present; install layer keyed on manifests + lockfile; pnpm store and Next's cache as BuildKit cache mounts.
#
#   docker build -f web/Dockerfile .
FROM node:24-slim AS build
ENV PNPM_HOME=/pnpm \
    PATH=/pnpm:$PATH \
    CI=1 \
    NEXT_TELEMETRY_DISABLED=1
# curl is what Coolify's container health check runs; node slim images ship neither curl nor wget.
RUN apt-get update && apt-get install -y --no-install-recommends curl ca-certificates && rm -rf /var/lib/apt/lists/* \
    && corepack enable && corepack prepare pnpm@11.24.0 --activate
WORKDIR /app

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY web/package.json ./web/
COPY scripts/package.json ./scripts/
COPY contracts/package.json ./contracts/
COPY packages/brain/package.json ./packages/brain/
COPY packages/clients/package.json ./packages/clients/
COPY packages/core/package.json ./packages/core/
COPY packages/db/package.json ./packages/db/
COPY packages/markets/package.json ./packages/markets/
COPY packages/tokens/package.json ./packages/tokens/
COPY services/ops/package.json ./services/ops/
RUN --mount=type=cache,id=mitoshi-pnpm-store,target=/pnpm/store \
    pnpm install --frozen-lockfile --filter "@cwf/web..."

COPY . .

# NEXT_PUBLIC_* values are inlined at build; Coolify passes build-time variables as ARGs before this line.
RUN --mount=type=cache,id=mitoshi-next-cache,target=/app/web/.next/cache \
    pnpm --filter @cwf/web build

ENV NODE_ENV=production \
    PORT=3000 \
    HOSTNAME=0.0.0.0
EXPOSE 3000
CMD ["pnpm", "--filter", "@cwf/web", "start"]
