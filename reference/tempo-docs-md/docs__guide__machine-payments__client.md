# Client quickstart: build an MPP client

Polyfill `fetch` to handle `402` responses. Your existing code works unchanged — payments happen in the background.

::::steps
### Install MPP client dependencies

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

### Define the MPP payer account

```ts
import { privateKeyToAccount } from 'viem/accounts'

const account = privateKeyToAccount('0xabc…123')
```

:::tip
With Tempo, you can also use passkey or WebCrypto signing.
:::

### Create the MPP payment handler

Call `Mppx.create` at startup. This polyfills `fetch` to automatically handle `402` payment challenges.

```ts
import { privateKeyToAccount } from 'viem/accounts'
import { Mppx, tempo } from 'mppx/client'

const account = privateKeyToAccount('0xabc…123')

Mppx.create({
  methods: [tempo({ account })],
})
```

:::tip
If you want to avoid polyfilling, use the bound `fetch` instead.

```ts
const mppx = Mppx.create({
  polyfill: false,
  methods: [tempo({ account })]
})

const response = await mppx.fetch('https://api.example.com/resource')
```
:::

### Request MPP-protected resources

Use `fetch`. Payment happens when a server returns `402`.

```ts
const response = await fetch('https://api.example.com/resource')
```
::::

## Advanced MPP client patterns

### Use MPP with Wagmi

You can inject a [Wagmi](https://wagmi.sh) connector into Mppx by passing the `getConnectorClient` function.

:::code-group
```ts [example.ts]
import { Mppx, tempo } from 'mppx/client'
import { getConnectorClient } from 'wagmi/actions'
import { config } from './config'

Mppx.create({
  methods: [tempo({
    getClient: (parameters) => getConnectorClient(config, parameters),
  })],
})
```

```ts [config.ts]
import { createConfig, http } from 'wagmi'
import { tempoModerato } from 'viem/chains'
import { tempoWallet } from 'wagmi/connectors'

export const config = createConfig({
  connectors: [tempoWallet()],
  chains: [tempoModerato],
  transports: {
    [tempoModerato.id]: http(),
  },
})
```
:::

### Use per-request payer accounts

Pass accounts on individual requests instead of at setup:

```ts
import { privateKeyToAccount } from 'viem/accounts'
import { Mppx, tempo } from 'mppx/client'

const mppx = Mppx.create({
  polyfill: false,
  methods: [tempo()]
})

const response = await mppx.fetch('https://api.example.com/resource', {
  context: {
    account: privateKeyToAccount('0xabc…123'),
  }
})
```

### Handle MPP payments manually

Use `Mppx.create` for full control over the payment flow:

* Present payment UI before paying
* Implement custom retry logic
* Handle credentials manually

```ts
import { Mppx, tempo } from 'mppx/client'
import { privateKeyToAccount } from 'viem/accounts'

const mppx = Mppx.create({
  polyfill: false,
  methods: [tempo()],
})

const response = await fetch('https://api.example.com/resource')

if (response.status === 402) {
  const credential = await mppx.createCredential(response, {
    account: privateKeyToAccount('0x...'),
  })

  const paidResponse = await fetch('https://api.example.com/resource', {
    headers: { Authorization: credential },
  })
}
```

### Read MPP payment receipts

On success, the server returns a `Payment-Receipt` header:

```ts
import { Receipt } from 'mppx'

const response = await fetch('https://api.example.com/resource')

const receipt = Receipt.fromResponse(response)

console.log(receipt.status)
// success
console.log(receipt.reference)
// 0xtx789abc...
```

## Next steps for MPP clients

* [Server quickstart](https://tempo.xyz/developers/docs/guide/machine-payments/server) — Add payment gating to your HTTP endpoints
* [Accept one-time payments](https://tempo.xyz/developers/docs/guide/machine-payments/one-time-payments) — Charge per request with on-chain settlement
* [Full SDK reference](https://mpp.dev/sdk/typescript/client/Mppx.create) — Complete mppx client API documentation
