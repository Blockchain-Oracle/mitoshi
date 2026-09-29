# Ops image (plan C.6): one machine per network on Fly, node:24-slim, `/data` volume.
FROM node:24-slim AS base
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH CI=true
RUN corepack enable
WORKDIR /app

FROM base AS deps
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY packages ./packages
COPY services/ops ./services/ops
RUN pnpm install --frozen-lockfile --filter @cwf/ops...

FROM base AS run
COPY --from=deps /app /app
WORKDIR /app/services/ops
ENV NODE_ENV=production OPS_HTTP_PORT=8080
EXPOSE 8080
CMD ["pnpm", "start"]
