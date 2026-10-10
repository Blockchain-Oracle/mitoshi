# Ops image (plan C.5/C.6): one container per network on Coolify. Pattern from Agari b/Dockerfile (cached
# install layer; curl for Coolify's health check).
#
#   docker build -f services/ops/Dockerfile .
FROM node:24-slim
ENV PNPM_HOME=/pnpm \
    PATH=/pnpm:$PATH \
    CI=1
RUN apt-get update && apt-get install -y --no-install-recommends curl ca-certificates && rm -rf /var/lib/apt/lists/* \
    && corepack enable && corepack prepare pnpm@11.24.0 --activate
WORKDIR /app

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
# pnpm applies `patchedDependencies` at install (the `accounts` backup-passkey patch, D-053).
COPY patches ./patches
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
    pnpm install --frozen-lockfile --filter "@cwf/ops..."

COPY . .
ENV NODE_ENV=production OPS_HTTP_PORT=8080
EXPOSE 8080
WORKDIR /app/services/ops
CMD ["pnpm", "start"]
