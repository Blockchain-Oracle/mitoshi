# Monetize your API with agentic payments

Accept stablecoin payments for any HTTP endpoint. No signup flows, no billing accounts, no API key management. Your users — agents, apps, or humans — pay per request with stablecoins on Tempo, and you get paid instantly.

## The API monetization problem

Monetizing an API today means building a billing system: user registration, API key provisioning, usage metering, invoicing, and payment collection. For most developers, the billing infrastructure is harder to build than the API itself. Stripe and similar tools help, but still require account creation and credit card onboarding from every customer.

## How MPP adds agentic API payments

With MPP, you add a few lines of code to your HTTP endpoint and it becomes payment-gated. The server returns a `402` Challenge with the price, the client pays with a stablecoin transfer, and the server delivers the response with a `Receipt`. Settlement happens in ~500ms on Tempo.

**Two billing models** are available out of the box:

* **Tempo Charge** — One-time payment per request. Best for single API calls, content access, or discrete operations.
* **Tempo Session** — Continuous pay-as-you-go via payment channels. Best for LLM APIs, metered services, or streamed responses.

## Add API payments in 5 minutes

::::steps
### Install the MPP SDK

:::code-group
```bash [npm]
npm install mppx viem
```

```bash [pnpm]
pnpm add mppx viem
```

```bash [bun]
bun add mppx viem
```
:::

### Add MPP payment gating

```ts
import { Mppx, tempo } from 'mppx/server'

const mppx = Mppx.create({
  methods: [tempo({
    currency: '0x20c0000000000000000000000000000000000000',
    recipient: '0xYOUR_ADDRESS_HERE',
  })],
})

export async function handler(request: Request) {
  const result = await mppx.charge({
    amount: '0.01',
    description: 'API call',
  })(request)

  if (result.status === 402) return result.challenge

  // Your API logic here
  return result.withReceipt(Response.json({ data: '...' }))
}
```

### Test the paid API

```bash
npx mppx account create
npx mppx http://localhost:3000/api/endpoint
```
::::

## Why Tempo for API monetization

* **~500ms settlement** — Fast enough for synchronous request/response flows
* **Sub-cent fees** — Charge $0.001 per request and still be profitable
* **No customer onboarding** — Clients pay with a wallet, no signup required
* **Fee sponsorship** — Cover gas fees for your customers so they only need stablecoins
* **Any stablecoin** — Accept pathUSD, USDC.e, or any TIP-20 token

## Next steps for API monetization

* [Accept one-time payments](https://tempo.xyz/developers/docs/guide/machine-payments/one-time-payments) — Step-by-step guide with framework examples
* [Accept pay-as-you-go payments](https://tempo.xyz/developers/docs/guide/machine-payments/pay-as-you-go) — Session-based billing for metered services
* [Accept streamed payments](https://tempo.xyz/developers/docs/guide/machine-payments/streamed-payments) — Pay-per-chunk for streaming responses
* [Full MPP documentation](https://mpp.dev) — Protocol spec, SDK reference, and guides
