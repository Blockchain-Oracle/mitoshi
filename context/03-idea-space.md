# Idea space — mapping primitives to openings

Not a list of ideas to pick from. A map of *where the openings are*, so you can find
one you have a real reason to build.

## The generating question

Judges score **Insight**: "does the founding team have some unique insight based on
deep understanding of the problem space? Is there a **new technology, or a new trend,
that creates an opportunity**?"

That sentence tells you the shape of a winning entry:

> **A constraint that used to be unavoidable, which a specific new primitive removes,
> for a specific person who is currently suffering from it.**

Every chain in this hackathon shipped a primitive in the last year that removes a
constraint everyone else still designs around. Start from the constraint, not the chain.

## The removed constraints

| Chain | Constraint everyone else lives with | What removes it |
|---|---|---|
| Tempo | You need the native gas token to move your money | No native gas token; fees in any TIP-20; sponsorship |
| Tempo | Payments arrive as anonymous blobs you must reconcile by hand | Transfer memos + virtual addresses |
| Tempo | Machines can't pay for things | Machine Payments Protocol (HTTP 402) |
| Hyperliquid | Contracts can't see real order books, only oracle prices | `L1Read` precompiles + `CoreWriter` |
| Zcash | Privacy and auditability are mutually exclusive | Shielded pools + viewing keys |
| Zcash | Payments carry no private context | Encrypted memo fields |
| Robinhood | Smart contracts can't hold real equities | Stock Tokens (ERC-20 + ERC-8056) |
| Solana | Amounts and compute are public | Token-2022 confidential transfers; Arcium |

## Openings by track

### Tempo

**Agent spend control.** Agents that can pay (MPP/402) immediately create a problem
nobody has solved: *who decides what they're allowed to buy?* Budgets, policy,
approval thresholds, and an auditable trail of machine spending. Tempo gives you
every piece natively — receive policies for inbound control, sponsorship for fee
payment, memos for the audit trail, virtual addresses for per-agent accounting.
The buyer side ("agents can pay!") is what everyone will build. The **control plane**
is what a business would actually pay for. Anthropic is a listed Tempo partner.

**Self-reconciling money.** Virtual addresses + memos mean a payment can arrive
already matched to its invoice. This is unglamorous and it is exactly why finance
teams can't adopt stablecoins. "Accounts receivable that reconciles itself" is a
product with an obvious buyer and an obvious price.

**Zero-onboarding payouts.** Fee sponsorship + no gas token means a recipient with
nothing — no ETH, no wallet history, no crypto knowledge — receives and spends money.
Contractor payouts, remittances, marketplace seller payments. **UX** is a scored
criterion and this is the most demonstrable UX delta in the hackathon: show a user
with an empty wallet completing a transaction.

### Hyperliquid

**Depth-aware DeFi.** Every lending protocol in crypto liquidates against an *oracle
price*, because on-chain order books didn't exist. That single assumption causes
liquidation cascades: the oracle says the collateral is worth X, the book says you
can't actually sell it at X. A contract that reads real book depth through `L1Read`
can size and route liquidations against liquidity that actually exists. This is a
well-known failure mode with a newly available fix, and it is the strongest
"new technology creates an opportunity" story in the whole event.

**Order-book-native structured products.** Options, basis and funding-rate products
priced off a real book instead of an AMM curve.

**Traction is uniquely achievable here.** The users already exist and already have
capital on the platform. A useful tool can get real usage inside four weeks — and
**Traction** is explicitly scored. No other track offers that.

### Zcash

**Privacy *with* provability.** Viewing keys make "private by default, provable on
demand" a real category: confidential payroll where amounts are hidden from the world
but provable to an auditor; proof of reserves without position disclosure; B2B
invoicing where competitors can't read your margins. This also pre-answers the
hostile question — *isn't this just for criminals?* — which you will be asked.

**The memo field as a channel.** An encrypted, authenticated message that rides with
value and only the recipient can read. Private receipts, credentials, invoice
references. It's sitting there unused.

**Shielded checkout.** ZIP 321 fully specifies payment-request URIs and QR payloads.
Well-specified, visually demo-able, and almost nobody builds it.

### Robinhood Chain

**Equities as collateral.** Contracts can now hold, price and settle against real
stocks with corporate actions handled. Borrowing against equity positions is the
obvious first unlock and it is blocked on every other chain.

**The session gap.** Equities trade 24/5; crypto trades 24/7. For 48+ hours a week a
user holds equity exposure they cannot adjust. That mismatch is a structural fact
that creates a product — weekend hedging, synthetic exposure, or simply an honest
answer to "what happens to my position on Saturday?" Nobody has built for it because
until now nobody could.

**Auto-invest rails.** Round-ups or payroll sweeps from stablecoins into tokenized
equities. Retail-legible, demo-friendly, real TAM.

### Solana

**Confidential compute with a reason.** Arcium or Token-2022 confidential transfers,
applied where privacy is load-bearing — sealed-bid auctions, private order flow,
confidential payroll. Two Arcium people judge.

**The payments stack, assembled.** Subscriptions, allowances and payment channels are
new enough that a well-built, business-ready assembly of them is scarce.

## The cross-track signal worth noticing

**Agentic payments appears independently on both Tempo (Machine Payments Protocol,
HTTP 402) and Solana (x402 guide, x402 MCP server, `PAY.SH`, agent skills).** Two
unrelated ecosystems shipped the same primitive, and Colosseum curated both. That is
the clearest available signal about what this hackathon expects to see.

It's also the most crowded *idea*, so the differentiator won't be "agents can pay."
It will be solving the second-order problem — control, trust, discovery, settlement,
dispute — that arrives the moment they can.

## What loses

- **A chain-agnostic app with a chain bolted on.** If it would work identically on any
  EVM chain, you haven't entered that track in any meaningful sense, and ecosystem
  judges spot it instantly.
- **A better front-end for something that exists.** Especially a Hyperliquid trading UI.
- **Beautiful code, no story.** They said explicitly they are not grading frameworks,
  design patterns or code quality. A polished repo with no market answer loses to a
  rough product with a named customer.
- **Unsubstantiated privacy claims.** In front of these judges, specifically bad.
- **Infrastructure with no user.** "A better indexer" scores nothing on Founder-Market
  Fit, Market Size, or Traction.
- **Anything that needs a token launch to make sense.**

## The filter

Before committing, you should be able to finish all five:

1. The constraint is ______, and people currently work around it by ______.
2. **[Chain]** removes it because of **[specific primitive]**, which did not exist before ______.
3. The person who feels this is ______ — and I can name one.
4. I can demo ______ end-to-end.
5. It makes money by ______.

Fail #3 and you have a tech demo. Fail #2 and you're in the wrong track. Fail #5 and
you lose **Viability**, which is a third of the real rubric.
