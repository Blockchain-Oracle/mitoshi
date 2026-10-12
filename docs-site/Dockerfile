# The docs site — Next.js 16 + Fumadocs, served by `next start` on 3000 behind Coolify at docs.testnet.mitoshi.xyz.
# Ported from Owarine 90a91d71:docs-site/Dockerfile (D-227). Build context: this directory (Coolify base directory
# `/docs-site`), so the app's source is not in the image; every address and receipt the guides cite is checked by
# `pnpm check:content` in the repository before it ships.
#
#   docker build .
#
# The install layer is keyed on the manifests and lockfile alone, so a content-only push reuses it.
FROM node:22-slim
ENV PNPM_HOME=/pnpm \
    PATH=/pnpm:$PATH \
    CI=1 \
    NEXT_TELEMETRY_DISABLED=1
# curl is what Coolify's container health check runs; without it a green build is rolled back as unhealthy.
RUN apt-get update && apt-get install -y --no-install-recommends curl ca-certificates && rm -rf /var/lib/apt/lists/* \
    && corepack enable && corepack prepare pnpm@11.24.0 --activate
WORKDIR /app

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
RUN --mount=type=cache,id=mitoshi-docs-pnpm-store,target=/pnpm/store \
    --mount=type=cache,id=mitoshi-docs-pnpm-metadata,target=/root/.cache/pnpm \
    pnpm install --frozen-lockfile

COPY . .
# `NEXT_PUBLIC_*` values are inlined at build; Coolify passes build-time variables as ARGs ahead of this line.
RUN --mount=type=cache,id=mitoshi-docs-next-cache,target=/app/.next/cache \
    pnpm build

ENV NODE_ENV=production \
    PORT=3000 \
    HOSTNAME=0.0.0.0
EXPOSE 3000
CMD ["pnpm", "exec", "next", "start", "--port", "3000"]
