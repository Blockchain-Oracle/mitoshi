# Crypto World's Fair — context

Engineered context for Colosseum's Crypto World's Fair hackathon
(Sep 14 – **Oct 12, 2026**). $840k in prizes, $250k accelerator pre-seed.

**Start with `context/STATUS.md`** — the resume pointer and read order.

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
