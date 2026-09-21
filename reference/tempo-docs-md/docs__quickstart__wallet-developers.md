# Integrating wallet support for Tempo

Tempo is EVM-compatible, so standard transactions work out of the box. However, Tempo has [no native gas token](https://tempo.xyz/developers/docs/quickstart/evm-compatibility#handling-eth-native-token-balance-checks), which means wallet behaviors like balance display and gas quoting need adjustment.

To deliver the best experience for your users, integrate [Tempo Transactions](https://tempo.xyz/developers/docs/guide/tempo-transaction) — a protocol-native [EIP-2718](https://github.com/ethereum/EIPs/blob/master/EIPS/eip-2718.md) transaction type (type byte `0x76`) that provides fee token selection, fee sponsorship, call batching, concurrent nonces, passkey signing, and scheduled execution — without requiring a bundler, paymaster, or third-party vendor.

[SDKs](https://tempo.xyz/developers/docs/guide/tempo-transaction#integration-guides) are available for TypeScript, Rust, Go, Python, and Foundry. Integration typically takes less than an hour.

## Wallet integration steps

::::steps
### Integrate Tempo Transactions

Replace your wallet's transaction construction with Tempo Transactions. The minimum change is switching from a type-2 (EIP-1559) envelope to a type-`0x76` Tempo Transaction envelope using one of the [Tempo SDKs](https://tempo.xyz/developers/docs/guide/tempo-transaction#integration-guides).

:::code-group
```ts twoslash [example.ts]
// @noErrors
import { client } from './viem.config'
import { parseUnits } from 'viem'

// Sends a Tempo Transaction (type 0x76)
const { receipt } = await client.token.transferSync({
  amount: parseUnits('100', 6),
  to: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEbb',
  token: '0x20c0000000000000000000000000000000000001',
})
```

```ts twoslash [viem.config.ts] filename="viem.config.ts"
import { privateKeyToAccount } from 'viem/accounts'
import { createClient } from 'viem/tempo'

export const client = createClient({
  account: privateKeyToAccount('0x...'),
})
```
:::

:::tip
With Tempo Transactions, you can also:

* Set the fee token for your users' transactions ([guide](https://tempo.xyz/developers/docs/guide/payments/pay-fees-in-any-stablecoin))
* Sponsor transaction fees for your users ([guide](https://tempo.xyz/developers/docs/guide/payments/sponsor-user-fees))
* Send concurrent transactions with independent nonces ([guide](https://tempo.xyz/developers/docs/guide/payments/send-parallel-transactions))
* Use expiring nonces for cheaper transactions that don't require nonce tracking ([guide](https://tempo.xyz/developers/docs/guide/tempo-transaction#expiring-nonces))
:::

### Handle the absence of a native token

If you use `eth_getBalance` to validate a user's balance, you should instead check the user's account fee token balance on Tempo. Additionally, you should not display any "native balance" in your UI for Tempo users.

:::info
In testnet, `eth_getBalance` [returns a large placeholder value](https://tempo.xyz/developers/docs/quickstart/evm-compatibility#handling-eth-native-token-balance-checks) for the native token balance to unblock existing assumptions wallets have about the native token balance.
:::

:::code-group
```ts twoslash [example.ts]
// @noErrors
import { client } from './viem.config'

const userFeeToken = await client.fee.getUserToken({
  account: '0x...'
})

const balance = await client.token.getBalance({
  account: '0x...',
  token: userFeeToken.address
})
```

```ts twoslash [viem.config.ts] filename="viem.config.ts"
import { privateKeyToAccount } from 'viem/accounts'
import { createClient } from 'viem/tempo'

export const client = createClient({
  account: privateKeyToAccount('0x...'),
})
```
:::

### Configure native currency symbol

If you need to display a native token symbol, such as showing how much gas a transaction requires, you can set the currency symbol to `USD` for Tempo as fees are denominated in USD.

### Use fee token preferences to quote gas prices

On Tempo, users can pay fees in any supported stablecoin. You should quote gas/fee prices in your UI based on a transaction's fee token.

:::info
As a wallet developer, you can set the fee token for your user at the account level.

If you don't, Tempo uses a cascading fee token selection algorithm to determine the fee token for a transaction – learn more about [Fee Token Preferences](https://tempo.xyz/developers/docs/protocol/fees/spec-fee#fee-token-preferences).
:::

### Add fee token selection to your UI

Your wallet should provide a way for users to choose which stablecoin they pay fees in. This can be a dropdown in the transaction confirmation screen or a setting in account preferences.

To set the fee token on a per-transaction basis, pass the `feeToken` parameter when submitting a Tempo Transaction:

:::code-group
```ts twoslash [example.ts]
// @noErrors
import { client } from './viem.config'
import { parseUnits } from 'viem'

const { receipt } = await client.token.transferSync({
  amount: parseUnits('100', 6),
  feeToken: '0x20c0000000000000000000000000000000000002', // [!code hl]
  to: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEbb',
  token: '0x20c0000000000000000000000000000000000001',
})
```

```ts twoslash [viem.config.ts] filename="viem.config.ts"
import { privateKeyToAccount } from 'viem/accounts'
import { createClient } from 'viem/tempo'

export const client = createClient({
  account: privateKeyToAccount('0x...'),
})
```
:::

To set a persistent default so users don't need to select on every transaction, use `setUserToken`:

```ts
await client.fee.setUserTokenSync({
  token: '0x20c0000000000000000000000000000000000001',
})
```

See [Fee Token Preferences](https://tempo.xyz/developers/docs/protocol/fees/spec-fee#fee-token-preferences) for the full cascading resolution order.

### Display token and network assets

Tempo provides a public tokenlist service that hosts token and network assets. You can pull these assets from our public tokenlist service to display in your UI.

* **GitHub**: [tempoxyz/tempo-apps/apps/tokenlist](https://github.com/tempoxyz/tempo-apps/tree/main/apps/tokenlist)
* **Tokenlist JSON**: [tokenlist.tempo.xyz/list/42431](https://tokenlist.tempo.xyz/list/42431)
::::

## Already using EIP-7702 or EIP-4337?

If you've integrated a third-party account abstraction provider for batching, sponsorship, or smart accounts, Tempo Transactions provide these features natively at the protocol level. See the [feature comparison](https://tempo.xyz/developers/docs/protocol/transactions/eip-7702#feature-comparison) for details.

## Wallet integration recipes

### Get user's fee token

Retrieve the user's configured fee token preference:

```ts
import { getUserToken } from 'viem/tempo'

const feeToken = await client.fee.getUserToken({
  account: userAddress
})
```

See [`getUserToken`](https://viem.sh/tempo/actions/fee.getUserToken) for full documentation.

### Get token balance

Check a user's balance for a specific token:

```ts
import { getBalance } from 'viem/tempo'

const balance = await client.token.getBalance({
  account: userAddress,
  token: tokenAddress
})
// ^? { amount: bigint; decimals: number; formatted: string }
```

See [`getBalance`](https://viem.sh/tempo/actions/token.getBalance) for full documentation.

### Set user fee token

Set the user's default fee token preference. This will be used for all transactions unless a different fee token is specified at the transaction level.

```ts
import { setUserToken } from 'viem/tempo'

await client.fee.setUserTokenSync({
  token: '0x20c0000000000000000000000000000000000001',
})
```

See [`setUserToken`](https://viem.sh/tempo/actions/fee.setUserToken) for full documentation.

## Checklist

Before launching Tempo support, ensure your wallet:

* \[ ] Integrates Tempo Transactions for transaction submission
* \[ ] Checks fee token balance instead of native balance
* \[ ] Hides or removes native balance display for Tempo
* \[ ] Displays `USD` as the currency symbol for gas
* \[ ] Quotes gas prices in the user's fee token
* \[ ] Provides fee token selection in the UI (dropdown or account setting)
* \[ ] Pulls token/network assets from Tempo's tokenlist
* \[ ] (Recommended) Sponsors fees for your users via [fee sponsorship](https://tempo.xyz/developers/docs/guide/payments/sponsor-user-fees)
* \[ ] (Recommended) Uses [expiring nonces](https://tempo.xyz/developers/docs/guide/tempo-transaction#expiring-nonces) for lower-cost transactions that don't require nonce management

## Learning Resources

* [Tempo Transactions](https://tempo.xyz/developers/docs/guide/tempo-transaction) — Integrate Tempo Transactions for full control over transaction parameters
* [Fee Token Preferences](https://tempo.xyz/developers/docs/protocol/fees/spec-fee#fee-token-preferences) — Learn how fee token preferences work in the protocol
* [Sponsor User Fees](https://tempo.xyz/developers/docs/guide/payments/sponsor-user-fees) — Sponsor user fees to enable feeless transaction experiences in your application
* [EIP-7702 Comparison](https://tempo.xyz/developers/docs/protocol/transactions/eip-7702) — How Tempo Transactions compare to EIP-7702 delegation
* [Pay Fees in Any Stablecoin](https://tempo.xyz/developers/docs/guide/payments/pay-fees-in-any-stablecoin) — Pay fees in any supported stablecoin
