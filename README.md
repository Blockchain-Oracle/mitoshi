# Crypto World's Fair — Tempo track

Prediction markets and stocks on Tempo, plus a mobile app, for Colosseum's Crypto World's Fair hackathon
(Sep 14 – **Oct 12, 2026**).

**Building:** start with `docs/plan/working-rules.md`, then `docs/plan/STATUS.md` (the build's resume pointer).
**Research and context:** `context/STATUS.md`.

## Pre-existing code (disclosure)

This entry ports code the owner wrote before the hackathon, and says so file by file:

- **Masayume** (`sommina-events` @ `68f7a09`) — contracts, packages and web app, moved from Somnia/DreamDEX to Tempo.
  Ported files carry `Ported from Masayume 68f7a09:<path>`.
- **Agari** (`agari-wt/w1`) — the events-engine semantics (rewritten in Solidity), the ops runtime, the wallet modal
  replica and venue features. Ported files carry `Agari <sha>:<path>`.
- **Owarine** (`owarine` @ `ecb7565b`, the owner's MIT repo) — the Tradash-behaviour trading terminal that `/trade`
  ports. Ported files carry `Ported from Owarine ecb7565b:<path>`.
- **Baku** (`roy-chain` @ `ede3ed38`, the owner's MIT repo) — the app shell (rail, top line, stage, dock). Ported files
  carry `Ported from Baku (roy-chain) ede3ed38:<path>`.
- Yosuku-derived design (through Masayume), Tradash as a behaviour reference only (nothing of theirs copied),
  21st.dev components and other third-party material: `THIRD_PARTY_NOTICES.md`.

New for this hackathon: the Tempo engine and product contracts, stocks on Tempo (Robinhood Chain bridge, v4 pools with
a guard hook, themes — contracts deployed on Moderato, their screens next), the launchpads, the Tempo
wallet/relay/passkey layer, the ops keepers, the terminal and the UX rebuild. The native mobile app is planned
(SM1–SM5) and not built yet. The plan (`docs/plan/00-plan.md`) and the git history show what was built when.

## Layout

```
docs/plan/     approved plan, stage files, decisions, parity, acceptance evidence
docs/specs/    engine, pillar 2, off-chain, mobile, UX specs
docs/design/   design system, 21st component register, flow targets
contracts/     Foundry (Tempo + evm profiles), deployments/<chainId>/<area>.json
packages/      @cwf/core · markets · brain · db · clients
services/ops   actors on runActor, one HTTP server, Fly
web/           Next.js 16 app
scripts/       codegen, invariants, keys, deploy, drive, archive, e2e
infra/         secrets (names only), env examples, Vercel and Fly notes
```

## Research context

```
context/
  STATUS.md                   resume pointer — read first
  00-hackathon-brief.md       rules, dates, prizes, the two rubrics, checklist
  01-track-economics.md       prize vs. competition — which track to pick
  02-sponsors-and-offers.md   sponsors, RPC free tiers, per-track provisioning
  03-idea-space.md            primitives → openings, and the 5-question filter
  04-decisions-and-rules.md   decisions, reference pins, repo editing rules
  05-product-vision.md        the product, in the owner's words
  tempo/                      00 facts · 01 MPP · 02 gap analysis · 03 GitHub · 04 docs index ·
                              05 agent ledger · 06 bonding curve · 07 stocks/plans/earn ·
                              08 stocks background · 09 stock tokens · 10 networks · 11 stocks architecture
  tracks/
    tempo.md  hyperliquid.md  zcash.md  robinhood-chain.md  solana.md
    _links/                   GENERATED — 213 curated links, verbatim + caveats
reference/
  tempo-docs-md/              227 Tempo doc pages as markdown
  tempo-llms.txt
data/
  colosseum-resources.json    corpus snapshot (ColosseumOrg/hackathon-resources)
  hackathon-rules.txt         official rules, text-extracted
  Crypto World's Fair Hackathon Rules.pdf
  gen-links.py                corpus → link appendices
  refresh.sh                  re-fetch + regenerate
```

## Refreshing

Colosseum edits the corpus during the hackathon — non-Solana tracks currently have no
sponsors, and Raydium is listed `comingSoon`. Re-pull every few days:

```bash
./data/refresh.sh
git diff data/ context/tracks/_links/   # see exactly what Colosseum changed
```

## Provenance

- Prizes, dates, eligibility, judging §8 — official rules PDF (`data/`)
- Judging rubric, submission requirements, process — colosseum.com/hackathon#faqs
- Track prize pools, judges, sponsors, workshops — colosseum.com/worldsfair
- All 213 resource links — `ColosseumOrg.github.io/hackathon-resources/current.json`
- Chain descriptions — each project's own documentation

Captured 2026-09-17. Track analysis in `01-track-economics.md` separates measured
facts from my estimates; the competition-density figures are inference, not data.
