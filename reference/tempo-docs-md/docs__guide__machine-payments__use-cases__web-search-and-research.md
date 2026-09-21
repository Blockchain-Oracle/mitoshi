# Pay for web search and research

Give your agents access to web search, content extraction, and multi-hop research — pay per query with stablecoins on Tempo. No API keys, no monthly plans, no usage caps.

## The web search payment problem

Agents that research, summarize, or fact-check need reliable web search. But search APIs require developer accounts, billing setups, and API keys for every provider. Rate limits are tied to pricing tiers, and switching between providers means managing multiple integrations.

## How MPP enables paid web research

With MPP, your agent pays per search query or page extraction in a single HTTP request. The agent discovers the price via the `402` Challenge, pays with a stablecoin transfer, and gets results — no signup required. Switch between search providers by changing the URL.

**Tempo Charge** works well here: each search query is an independent request with a known price. The agent signs a TIP-20 transfer, the provider verifies it in ~500ms, and returns the results.

## Web research services you can pay for

| Provider | Capabilities | Service URL |
|---|---|---|
| [Parallel](https://parallelmpp.dev) | Web search, page extraction, multi-hop research | `parallelmpp.dev` |
| Exa | AI-powered search, content retrieval, answers | `api.exa.ai` |
| [Brave](https://brave.mpp.paywithlocus.com) | Web, news, images, videos, AI answers | `brave.mpp.paywithlocus.com` |
| Firecrawl | Web scraping, crawling, structured extraction | `firecrawl.mpp.tempo.xyz` |
| [Diffbot](https://diffbot.mpp.paywithlocus.com) | Article, product, and discussion extraction | `diffbot.mpp.paywithlocus.com` |
| Oxylabs | Web scraping with geo-targeting and JS rendering | `oxylabs.mpp.tempo.xyz` |

## Try Parallel with Tempo payments

```bash
# Install Tempo CLI + wallet
curl -L https://tempo.xyz/install | bash && tempo add request && tempo wallet login

# Search the web via Parallel
tempo request parallelmpp.dev/search \
  -d '{"query": "machine payments protocol"}'
```

## Prompt your agent to buy web research

```
Use parallelmpp.dev to search the web via Tempo.
Pay per query with stablecoins — no API key needed.
```

## Next steps for web research payments

* [Accept one-time payments](https://tempo.xyz/developers/docs/guide/machine-payments/one-time-payments) — Build a payment-gated search API
* [Agent quickstart](https://tempo.xyz/developers/docs/guide/machine-payments/agent) — Set up your agent to discover and pay for services
* [Browse all services](https://mpp.dev/services) — 85+ MPP-enabled services in the directory
