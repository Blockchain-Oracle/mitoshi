# Track economics — where the expected value actually is

The prize table is public. The competition density is not. That asymmetry is the
whole opportunity.

## What is measured vs. what is estimated

**Measured** (from the rules PDF, the site, and the corpus):

- Every prize amount and winner count.
- 4,055 registered builders on Sep 17.
- Prior hackathon sizes: Frontier 2,858 projects · Cypherpunk 1,576 · Breakout 1,416 ·
  Radar 1,360 · Renaissance 1,076.
- **Only the Solana track has sponsors (4) and RPC providers (5) in the corpus.**
  Tempo, Hyperliquid, Zcash, Robinhood, Ethereum, Base and Arbitrum all have
  `sponsors: []` and `rpcProviders: []`.
- Solana's track carries **87 curated resource links**. Every other track carries 18,
  and 7 of those 18 are the same Stablecorp company-formation boilerplate — so the
  real figure is **~11 links of actual technical guidance per non-Solana track**.

**Estimated** (my inference — treat as a prior to update, not a fact):

Colosseum was the Solana hackathon organisation until this event; its entire builder
base, Discord, and Superteam distribution network are Solana-native. Multi-ecosystem
tracks are new here. So the crowd will land overwhelmingly on Solana, with the EVM
tracks (Ethereum/Base/Arbitrum) as the familiar fallback.

## The density table

| Track | Pool | Slots | Per slot | Est. field | Est. odds | Barrier |
|---|---|---|---|---|---|---|
| Solana | $100k | 10 | $10k | very high | worst | low |
| **Tempo** | **$100k** | **10** | **$10k** | **very low** | **best** | low (EVM) |
| **Hyperliquid** | **$100k** | **10** | **$10k** | **low–mid** | **good** | mid |
| **Zcash** | **$100k** | **10** | **$10k** | **lowest** | **best** | **high (Rust)** |
| Robinhood Chain | $25k | 5 | $5k | low | good | low (EVM) |
| Ethereum L1 | $25k | 5 | $5k | mid | poor | low |
| Base | $25k | 5 | $5k | mid | poor | low |
| Arbitrum | $25k | 5 | $5k | mid | poor | low |

Plus, orthogonal to all of it: **20 slots at $15,000** for standout teams in any
track, and the $30k Grand Champion.

## The three things that follow from this

**1. The $100k pools are not equally hard.**
Tempo, Hyperliquid and Zcash pay the same $10,000 per winner as Solana while drawing
a fraction of the field. Same money, thinner competition, identical access to the
Grand Champion and the 20×$15k pool. There is no prize-side reason to choose Solana,
only a familiarity-side reason.

**2. The thin corpus is a signal, not a warning.**
"Only 11 technical links exist for this track" means Colosseum has not yet built a
pipeline there — and that nobody else has either. A track with no sponsors and no
RPC providers is a track where a working product is startling rather than expected.

**3. Barrier is the moat, and it is priced backwards.**
Zcash is the hardest track — Rust, `librustzcash`, shielded pools, running Zebra and
lightwalletd, a threat model to respect. That barrier is exactly why its $100k pool
will see the smallest field. Difficulty that deters competitors *is* the edge, as
long as you can actually clear it. Tempo is the inverse: full EVM, Viem-first
TypeScript SDK, Foundry support — trivially easy *and* nearly unpopulated, because
the chain is simply too new for anyone to have built on it yet.

## The ranking

**Tempo — best risk-adjusted.** $100k pool, standard EVM skills, a TypeScript SDK,
and a chain so new that a genuinely working payments product is rare. Stripe +
Paradigm behind it, Anthropic/Klarna/DoorDash/Deutsche Bank/Mastercard as design
partners, and a dedicated Tempo workshop already run on Sep 16. Colosseum is
visibly invested in this track performing.

**Zcash — best upside if you can pay the Rust cost.** Same $100k, the smallest
likely field, and the strongest narrative in crypto right now. The risk is real:
this is the one track where you can burn a week on toolchain and have nothing to
demo. Only take it with a concrete plan to avoid writing circuits.

**Hyperliquid — best if you have any trading instinct.** $100k, a real user base
that already has money on the platform, and the HyperCore↔HyperEVM boundary is
genuinely under-explored. Hydromancer is a listed hackathon sponsor and gives you
free historical fills/candles/order-book data without an API key.

**Robinhood Chain — best novelty per unit effort.** Only $25k/5, but tokenized
equities with Chainlink feeds is a primitive almost nobody has built on, and it is
plain EVM + Foundry. Cheapest track to reach a working demo. Weakest pool.

**Solana — only with a genuinely differentiated idea.** The resources are superb
and the sponsors are real. But you are competing against the people this
organisation was built for, for the same $10k that Tempo pays. Choose it because
the *product* needs Solana, never because the tooling is comfortable.

## The move that beats picking a track

Every rubric in `00-hackathon-brief.md` — Insight, Market Size, Viability, Traction —
rewards a product that is *about* something, not a product that is *on* something.
The winning framing is "here is a real problem and this chain is the only place it
can be solved," not "here is a chain and here is something I built on it."

So: pick the track by where the field is thin, then pick the idea by where the
chain's unique primitive removes a real constraint. `03-idea-space.md` maps those
primitives to openings.
