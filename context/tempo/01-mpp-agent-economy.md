# MPP — the agent economy Tempo already shipped

The Machine Payments Protocol is far deeper than Colosseum's resource corpus
suggested (the corpus lists one link and calls it "advanced and still fast-moving").
In reality it is a complete, populated agent-commerce economy. **This is Tempo's
most differentiated surface and the least likely to be used well by other entrants.**

## How it works

HTTP **402** payment challenges. A client requests a resource, gets a `402` with a
price, pays via a **TIP-20 stablecoin transfer**, and receives the data in the same
response. **No API keys, no signup, no billing account, no credit card.**

Three billing modes:

| Mode | Mechanism | Use |
|---|---|---|
| **One-time** | `mppx` charge intent; TIP-20 transfer settles in **~500ms** | Per-request APIs |
| **Pay-as-you-go** | **Payment channels** — deposit once, sign off-chain vouchers, pay per request with no on-chain latency | High-frequency calls |
| **Streamed** | Per-token billing over **Server-Sent Events** | Charge word-by-word for LLM output |

Server side: **`mppx` middleware for Next.js, Hono, Express and the Fetch API.**
Adding payment gating to an endpoint is middleware, not an integration project.

Client side: **polyfill `fetch`** so any 402 is paid automatically.

Discovery: **`mpp.dev/services`** directory (**85+ services**), a public catalog API,
and a read-only MCP server.

CLI:

```bash
curl -L https://tempo.xyz/install | bash && tempo add request && tempo wallet login
tempo request alphavantage.mpp.paywithlocus.com/query \
  -d '{"function": "TIME_SERIES_DAILY", "symbol": "AAPL"}'
```

The wallet CLI has **spend caps**, credits, sessions and agent flags.

## What agents can already buy

| Category | Providers |
|---|---|
| **Financial & market data** | **Alpha Vantage** (stocks, forex, crypto, commodities, technicals), **CoinGecko**, **SEC EDGAR** (filings, XBRL, full-text), FX rates 150+ currencies |
| **Blockchain data** | Alchemy, Allium, **Nansen**, Dune, Codex |
| **AI models** | OpenAI, Anthropic, Gemini, Mistral |
| Web search & research | Parallel, Exa, Brave, Firecrawl |
| Media generation | fal.ai, OpenAI, Gemini, Deepgram |
| Browser automation | Browserbase, 2Captcha, Oxylabs |
| Compute & code execution | incl. GPU |
| Storage & git repos | — |
| Data enrichment / leads | Apollo, Hunter, Clado |
| Translation & language | DeepL, Deepgram |
| Maps, geocoding, weather, flights | Google Maps, Mapbox |
| **Agent-to-agent** | **Auto.exchange, AgentMail** — hire agents for coding, design, writing, email |

## Why this matters more than it looks

**1. It solves the stock-price oracle problem without an oracle.**
Alpha Vantage over MPP returns real stock prices, paid per query in stablecoins. For
a prediction market on equities, resolution can be a *purchase* rather than an oracle
integration. Chainlink/Chronicle/RedStone also exist on Tempo for on-chain feeds —
but the MPP path needs no feed to exist for your ticker.

**2. Agent spending becomes an on-chain audit trail.**
When an agent pays for Nansen data, a web search and an LLM call, those payments are
TIP-20 transfers on Tempo. **You can see what an agent bought before it acted.** That
does not exist anywhere else, because nowhere else do agents pay for their inputs
on-chain. It makes "show your work" a protocol-level property.

**3. ERC-8004 gives those agents portable identity and reputation.**
Identity Registry `0x8004A169…` and Reputation Registry `0x8004BAa1…` are predeployed.
An agent's track record is on-chain, readable by anyone, and not owned by your app.

**4. Agent-to-agent hiring already exists.** Auto.exchange and AgentMail mean an agent
can subcontract. Multi-agent economics are live, not theoretical.

## The composition nobody has built

Identity + reputation (ERC-8004) · payment rails with spend caps (MPP) · a populated
service economy (85+) · financial data as a purchasable input · stablecoin settlement
with no gas token · auditable spending receipts.

Those are the parts of an **accountable autonomous economic actor**. They are all
deployed and none of them are assembled into a product. That gap is the strongest
"new technology creates an opportunity" claim available in this hackathon — and
**Insight** is a scored criterion.

## Caveats to preserve

- Colosseum's corpus calls MPP "advanced and still fast-moving."
- Fee sponsorship: the **public sponsor is testnet-only**; production requires an
  approved hosted or self-managed payer.
- Service listings, prices and capability claims at `mpp.dev` are provider-supplied.
- Tempo Zones (private zones) are **testnet-only** and not production-ready.
