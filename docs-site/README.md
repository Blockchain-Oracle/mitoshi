# Mitoshi Docs

Step-by-step guides to [Mitoshi](https://mitoshi.xyz) 見通し — prediction markets and stocks on Tempo: making a
call, Windows and lanes, signed prints and settlement, the terminal, the Trading Balance and exits, Earn, Range ·
Moonshot · Parlay · Boost, strategies and agents, games, trading from X, stocks, themes and launches on Tempo, the phone
app, who can move your money, and the architecture behind each path, with the deployed addresses on Moderato and dated
evidence.

**Checked against:** app revision `11d85e0` (`site.revision` in `lib/site.ts`) on 13 October 2026. The site lives in the
app's repository at `docs-site/` and is built for `https://docs.mitoshi.xyz` (D-228). Ported from Owarine
90a91d71:docs-site (Fumadocs on Next 16) in Mitoshi's brand (D-227).

## Start with the right guide

| Goal | Guide |
| --- | --- |
| Make a first call | [Quickstart](content/docs/start/quickstart.mdx) |
| Understand Windows and lanes | [Windows](content/docs/trading/windows.mdx) |
| See how a Window settles, and check it | [Settlement](content/docs/trading/settlement.mdx), [Proof](content/docs/trading/proof.mdx) |
| Exits with the app closed | [Exits](content/docs/trading/exits.mdx) |
| Who can move your money, and if Mitoshi stops | [Safety](content/docs/safety/who-can-do-what.mdx) |
| Copy a strategy or an agent | [Automate](content/docs/automate/overview.mdx) |
| Games: the hall, the arcade, Lucky and Duel | [Games](content/docs/games/overview.mdx) |
| Trade from X | [X](content/docs/x/trade-from-x.mdx) |
| Stocks on Tempo | [Overview](content/docs/stocks/overview.mdx) |
| How it fits together | [Architecture](content/docs/architecture/overview.mdx) |
| Every deployed address | [Deployments](content/docs/architecture/deployments.mdx) |
| The app's HTTP routes | [API](content/docs/builders/api.mdx) |
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
`https://mitoshi.xyz`) sets where app links go; `NEXT_PUBLIC_DOCS_URL` (default
`https://docs.mitoshi.xyz`) sets canonical URLs and, read at build time, where the retired `docs.testnet.mitoshi.xyz`
redirects (`next.config.mjs`).

`pnpm check` runs `scripts/check-content.mjs` against the app in the parent directory: docs links and navigation, app
routes (`<AppLink>`), every transaction hash against the acceptance records and the demo's receipts, every address
against the deployment fragments, the capture's bytes against the app's, the architecture graphs' shape and sources,
`lib/deployments.json` against `contracts/deployments`, and no previous chain's words. It fails if the pinned revision is
not an ancestor of `HEAD`, and lists the app commits since it — the list to review before advancing the pin.

## Generated files

- `lib/deployments.json` — `pnpm sync:deployments` copies the deployment fragments (the image is built from this
  directory alone, so it can't read them at build time).
- `public/diagrams/*.svg` — `pnpm diagrams` renders `lib/architecture.json`.

## Captures and walkthroughs

`scripts/media-plan.json` lists every capture and walkthrough the guides show (`<GuideCapture name=…/>`,
`<Walkthrough name=…/>`). They come from the deployed product only, recorded after each deploy that changes a screen:

```sh
pnpm exec playwright install chromium   # once
pnpm media:record --probe                # every page, link and step against the live product; no pixels kept
pnpm media:record                        # headless Chromium at 2×, signed out, https://mitoshi.xyz only
pnpm media:publish                       # copies captures byte for byte, encodes walkthroughs (ffmpeg), hashes all
```

`--only name,name` records a few. A page that answers ≥ 400, a step that fails, or a route still showing its not-built
placeholder leaves its item unpublished and says where. `public/captures/provenance-media.json` holds each published
file's SHA-256, which `pnpm check:content` re-hashes; a planned item not yet recorded renders nothing and the check lists
it with the latest probe's verdict (`evidence/media-probe-<date>.json`). Each plan item names the app files that draw its
screen; after it is recorded, the check lists the commits that touched them — the cue to record it again.

## Evidence

`evidence/` holds dated snapshots the guides cite: ops' `/health` (12 and 13 October 2026),
every admin and role read on chain, the public routes' answers, and the media probes. It is excluded from the image.

## Deploy

`Dockerfile` builds and serves on port 3000 (`next start`). On Coolify: base directory `/docs-site`, port 3000, domains
`docs.mitoshi.xyz` (needs a `docs` A record at Namecheap) and `docs.testnet.mitoshi.xyz`, which only redirects.
