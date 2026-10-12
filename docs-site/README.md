# Mitoshi Docs

Step-by-step guides to [Mitoshi](https://testnet.mitoshi.xyz) 見通し — prediction markets and stocks on Tempo: making a
call, Windows and lanes, signed prints and settlement, the terminal, the Trading Balance and exits, Earn, Range ·
Moonshot · Parlay · Boost, strategies and agents, games, stocks on Tempo, and the architecture behind each path, with the
deployed addresses on Moderato and dated evidence.

**Checked against:** app revision `9002c8c` (`site.revision` in `lib/site.ts`) on 12 October 2026. The site lives in the
app's repository at `docs-site/` and is built for `https://docs.testnet.mitoshi.xyz`. Ported from Owarine
90a91d71:docs-site (Fumadocs on Next 16) in Mitoshi's brand (D-227).

## Start with the right guide

| Goal | Guide |
| --- | --- |
| Make a first call | [Quickstart](content/docs/start/quickstart.mdx) |
| Understand Windows and lanes | [Windows](content/docs/trading/windows.mdx) |
| See how a Window settles, and check it | [Settlement](content/docs/trading/settlement.mdx), [Proof](content/docs/trading/proof.mdx) |
| Exits with the app closed | [Exits](content/docs/trading/exits.mdx) |
| Copy a strategy or an agent | [Automate](content/docs/automate/overview.mdx) |
| Stocks on Tempo | [Overview](content/docs/stocks/overview.mdx) |
| How it fits together | [Architecture](content/docs/architecture/overview.mdx) |
| Every deployed address | [Deployments](content/docs/architecture/deployments.mdx) |
| What has run live, with receipts | [Evidence](content/docs/help/evidence.mdx) |
| What is live, next, or waiting | [Availability](content/docs/help/availability.mdx) |

## Run locally

Node.js 22+ and `pnpm@11.24.0`:

```sh
pnpm install --frozen-lockfile
cp .env.example .env.local
pnpm dev            # localhost:3156
pnpm check          # content checks, typecheck, build
```

The docs render without a running app, wallet, database or key. `NEXT_PUBLIC_APP_URL` (default
`https://testnet.mitoshi.xyz`) sets where app links go; `NEXT_PUBLIC_DOCS_URL` (default
`https://docs.testnet.mitoshi.xyz`) sets canonical URLs.

`pnpm check` runs `scripts/check-content.mjs` against the app in the parent directory: docs links and navigation, app
routes (`<AppLink>`), every transaction hash against the acceptance records and the demo's receipts, every address
against the deployment fragments, the capture's bytes against the app's, the architecture graphs' shape and sources,
`lib/deployments.json` against `contracts/deployments`, and no previous chain's words. It fails if the pinned revision is
not an ancestor of `HEAD`, and lists the app commits since it — the list to review before advancing the pin.

## Generated files

- `lib/deployments.json` — `pnpm sync:deployments` copies the deployment fragments (the image is built from this
  directory alone, so it can't read them at build time).
- `public/diagrams/*.svg` — `pnpm diagrams` renders `lib/architecture.json`.

## Evidence

`evidence/` holds dated snapshots the guides cite: ops' `/health` and the mirrors' total supply, both read on 12 October
2026. It is excluded from the image.

## Deploy

`Dockerfile` builds and serves on port 3000 (`next start`). On Coolify: base directory `/docs-site`, port 3000, domain
`docs.testnet.mitoshi.xyz` (the `*.testnet` record already points at the server).
