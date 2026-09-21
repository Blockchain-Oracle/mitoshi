# How to provide liquidity on the Tempo DEX

Add liquidity for a token pair by placing orders on the Stablecoin DEX. You can provide liquidity on the `buy` or `sell` side of the orderbook, with `limit` or `flip` orders. To learn more about order types see the [documentation on order types](https://tempo.xyz/developers/docs/protocol/exchange/providing-liquidity#order-types).

In this guide you will learn how to place buy and sell orders to provide liquidity on the Stablecoin DEX orderbook. Active makers may pay less gas when they cancel eligible orders or have eligible orders filled, then later place new eligible orders. See the [T7 network upgrade](https://tempo.xyz/developers/docs/protocol/upgrades/t7#user-attributed-dex-savings) for the feature details.

## Liquidity provider demo

**Interactive demo: Place an Order**

1. Connect
2. Add funds
3. Place order
4. Query order

Source: [tempoxyz/examples/tree/main/examples/exchange](https://github.com/tempoxyz/examples/tree/main/examples/exchange)

## Liquidity provider steps

::::steps
### Set up your liquidity client

Ensure that you have set up your client by following the [guide](https://tempo.xyz/developers/docs/sdk/typescript).

### Approve stablecoin spend

To place an order, you need to approve the Stablecoin DEX contract to spend the order's "spend" token.

:::info
The code samples in this guide will place orders on the `AlphaUSD` / `pathUSD` pair.

The "spend" token is the token that will be spent to place the order.

* buying `AlphaUSD` spends `pathUSD`
* selling `AlphaUSD` spends `AlphaUSD`
:::

**Interactive demo: Approve Spend**

1. Connect
2. Approve spend

:::code-group
```tsx twoslash [ApproveSpend.tsx]
// @noErrors
import { parseUnits } from 'viem'
import { Addresses } from 'viem/tempo'
import { Hooks } from 'wagmi/tempo'

const pathUsd = '0x20c0000000000000000000000000000000000000'
const alphaUsd = '0x20c0000000000000000000000000000000000001'

function ApproveSpend(props: { orderType: 'buy' | 'sell' }) {
  const { orderType } = props
  // buying AlphaUSD requires we spend pathUSD // [!code hl]
  const spendToken = orderType === 'buy' ? pathUsd : alphaUsd // [!code hl]
  // [!code hl]
  const { mutate: approve } = Hooks.token.useApproveSync() // [!code hl]

  return (
    <button type="button" onClick={() => {
      approve({ // [!code hl]
        amount: parseUnits('100', 6), // [!code hl]
        spender: Addresses.stablecoinDex, // [!code hl]
        token: spendToken, // [!code hl]
      }) // [!code hl]
  }}>
      Approve Spend
    </button>
  )
}
```

```ts [wagmi.config.ts]
import { tempo } from 'viem/chains'
import { createConfig, http } from 'wagmi'
import { tempoWallet } from 'wagmi/connectors'

export const config = createConfig({
  connectors: [tempoWallet()],
  chains: [tempo],
  multiInjectedProviderDiscovery: false,
  transports: {
    [tempo.id]: http(),
  },
})
```
:::

### Place a liquidity order

Once the spend is approved, you can place an order by calling the `place` action on the Stablecoin DEX.

:::info
In the code sample below, we use the `useSendCallsSync` hook to batch the approve and place order calls in a single transaction for efficiency.
:::

**Interactive demo: Place Order**

1. Connect
2. Place order

:::code-group
```tsx twoslash [PlaceOrder.tsx]
// @noErrors
import { Actions, Addresses } from 'viem/tempo'
import { parseUnits } from 'viem'
import { useSendCallsSync } from 'wagmi' // [!code hl]

const pathUsd = '0x20c0000000000000000000000000000000000000'
const alphaUsd = '0x20c0000000000000000000000000000000000001'

function PlaceOrder(props: { orderType: 'buy' | 'sell' }) {
  const { orderType } = props
  // buying AlphaUSD requires we spend pathUSD
  const spendToken = orderType === 'buy' ? pathUsd : alphaUsd

  const sendCalls = useSendCallsSync() // [!code hl]

  return (
    <button type="button" onClick={() => {
      const calls = [ // [!code hl]
        Actions.token.approve.call({ // [!code hl]
          spender: Addresses.stablecoinDex, // [!code hl]
          amount: parseUnits('100', 6), // [!code hl]
          token: spendToken, // [!code hl]
        }), // [!code hl]
        Actions.dex.place.call({ // [!code hl]
          token: alphaUsd, // [!code hl]
          amount: parseUnits('100', 6), // [!code hl]
          type: orderType, // [!code hl]
          tick: 0, // [!code hl]
        }), // [!code hl]
      ] // [!code hl]
      sendCalls.sendCallsSync({ calls }) // [!code hl]
    }}>
      Place Order
    </button>
  )
}
```

```ts [wagmi.config.ts]
import { tempo } from 'viem/chains'
import { createConfig, http } from 'wagmi'
import { tempoWallet } from 'wagmi/connectors'

export const config = createConfig({
  connectors: [tempoWallet()],
  chains: [tempo],
  multiInjectedProviderDiscovery: false,
  transports: {
    [tempo.id]: http(),
  },
})
```
:::

### View liquidity order details

After placing an order, you can query its details to see the current state, including the amount filled and remaining using [`Hooks.dex.useOrder`](https://wagmi.sh/tempo/hooks/dex.useOrder).

**Interactive demo: View Order**

1. Connect
2. Add funds
3. Place order
4. Query order

:::code-group
```tsx twoslash [QueryOrder.tsx]
// @noErrors
import { Hooks } from 'wagmi/tempo'

const orderId = 123n

const { data: order, refetch } = Hooks.dex.useOrder({
  orderId,
})

console.log('Type:', order?.isBid ? 'Buy' : 'Sell')
console.log('Amount:', order?.amount.toString())
console.log('Remaining:', order?.remaining.toString())
console.log('Tick:', order?.tick)
console.log('Is flip order:', order?.isFlip)
```

```ts [wagmi.config.ts]
import { tempo } from 'viem/chains'
import { createConfig, http } from 'wagmi'
import { tempoWallet } from 'wagmi/connectors'

export const config = createConfig({
  connectors: [tempoWallet()],
  chains: [tempo],
  multiInjectedProviderDiscovery: false,
  transports: {
    [tempo.id]: http(),
  },
})
```
:::

For more details on querying orders, see the [`Hooks.dex.useOrder`](https://wagmi.sh/tempo/hooks/dex.useOrder) documentation.
::::

## Liquidity provider recipes

### Cancel a liquidity order

Cancel an order using its order ID.

When you cancel an order, any remaining funds are credited to your exchange balance (not directly to your wallet). To move funds back to your wallet, you can [withdraw them to your wallet](https://tempo.xyz/developers/docs/protocol/exchange/exchange-balance#withdrawing-from-the-dex).

**Interactive demo: Place and Cancel an Order**

1. Connect
2. Add funds
3. Place order
4. Cancel order

Source: [tempoxyz/examples/tree/main/examples/exchange](https://github.com/tempoxyz/examples/tree/main/examples/exchange)

:::code-group
```tsx twoslash [ManageOrder.tsx]
// @noErrors
import { Actions, Addresses } from 'viem/tempo'
import { Hooks } from 'wagmi/tempo'
import { parseUnits } from 'viem'
import { useSendCallsSync } from 'wagmi'

const pathUsd = '0x20c0000000000000000000000000000000000000'
const alphaUsd = '0x20c0000000000000000000000000000000000001'

function ManageOrder() {
  const sendCalls = useSendCallsSync()
  const cancelOrder = Hooks.dex.useCancelSync() // [!code hl]

  const placeOrder = () => {
    const calls = [
      Actions.token.approve.call({
        spender: Addresses.stablecoinDex,
        amount: parseUnits('100', 6),
        token: pathUsd,
      }),
      Actions.dex.place.call({
        token: alphaUsd,
        amount: parseUnits('100', 6),
        type: 'buy',
        tick: 0,
      }),
    ]
    sendCalls.sendCallsSync({ calls })
  }

  return (
    <>
      <button type="button" onClick={placeOrder}>
        Place Order
      </button>
      <form onSubmit={
        (event) => {
          event.preventDefault()
          const formData = new FormData(event.target as HTMLFormElement)
          const orderId = BigInt(formData.get('orderId') as string)

          cancelOrder.mutate({ orderId }) // [!code hl]
        }
      }>
        <input type="text" name="orderId" placeholder="Order ID" />
        <button // [!code hl]
          type="submit" // [!code hl]
          disabled={cancelOrder.isPending} // [!code hl]
        > {/* [!code hl] */}
        {cancelOrder.isPending ? 'Canceling...' : 'Cancel Order'} {/* [!code hl] */}
        </button> {/* [!code hl] */}
      </form>
    </>
  )
}
```

```ts [wagmi.config.ts]
import { tempo } from 'viem/chains'
import { createConfig, http } from 'wagmi'
import { tempoWallet } from 'wagmi/connectors'

export const config = createConfig({
  connectors: [tempoWallet()],
  chains: [tempo],
  multiInjectedProviderDiscovery: false,
  transports: {
    [tempo.id]: http(),
  },
})
```
:::

### Determine the quote token

Each token has a designated quote token that it trades against on the DEX. For most stablecoins, this will be `pathUSD`.

Use the `token.useGetMetadata` hook to retrieve a token's quote token.

:::code-group
```ts twoslash [example.ts]
// @errors: 2322
import { config } from './wagmi.config'
declare module 'wagmi' {
  interface Register {
    config: typeof config
  }
}
// ---cut---
import { Hooks } from 'wagmi/tempo'

const { data: metadata } = Hooks.token.useGetMetadata({ // [!code focus]
  token: '0x20c0000000000000000000000000000000000001', // AlphaUSD // [!code focus]
}) // [!code focus]

console.log('Token:', metadata?.symbol)
// @log: Token: AlphaUSD
console.log('Quote Token:', metadata?.quoteToken) // returns `pathUSD` address 
// @log: Quote Token: 0x20c0000000000000000000000000000000000000
```

```ts [wagmi.config.ts] filename="wagmi.config.ts"
// @noErrors
import { tempo } from 'viem/chains'
import { createConfig, http } from 'wagmi'
import { tempoWallet } from 'wagmi/connectors'

export const config = createConfig({
  connectors: [tempoWallet()],
  chains: [tempo],
  multiInjectedProviderDiscovery: false,
  transports: {
    [tempo.id]: http(),
  },
})
```
:::

### Place a flip order

Flip orders automatically switch between buy and sell sides when filled, providing continuous liquidity. Use viem's [`dex.placeFlip`](https://viem.sh/tempo/actions/dex.placeFlip) to create a flip order call.

A flip order can re-list on the opposite side at the same tick (`flipTick == tick`), which is useful for pegged or near-1:1 pairs. When it fills, the order keeps the same `orderId` and emits an `OrderFlipped` event instead of a new `OrderPlaced`, so a single flip strategy stays trackable under one ID across its full lifecycle. Indexers, SDKs, and contract code that follow flip orders should treat `OrderFlipped` as the latest active state — see the [flip-order indexing notes](https://tempo.xyz/developers/docs/protocol/exchange/providing-liquidity#flip-order-indexing).

:::code-group
```tsx twoslash [PlaceFlipOrder.tsx]
// @noErrors
import { Actions, Addresses } from 'viem/tempo'
import { parseUnits } from 'viem'
import { useSendCallsSync } from 'wagmi'

const pathUsd = '0x20c0000000000000000000000000000000000000'
const alphaUsd = '0x20c0000000000000000000000000000000000001'

function PlaceFlipOrder(props: { orderType: 'buy' | 'sell' }) {
  const { orderType } = props
  // buying AlphaUSD requires we spend pathUSD
  const spendToken = orderType === 'buy' ? pathUsd : alphaUsd

  const sendCalls = useSendCallsSync()

  return (
    <button type="button" onClick={() => {
      const calls = [
        Actions.token.approve.call({
          spender: Addresses.stablecoinDex,
          amount: parseUnits('100', 6),
          token: spendToken,
        }),
        Actions.dex.placeFlip.call({ // [!code focus]
          token: alphaUsd,
          amount: parseUnits('100', 6),
          type: orderType,
          tick: 0,
        }),
      ]
      sendCalls.sendCallsSync({ calls })
    }}>
      Place Flip Order
    </button>
  )
}
```

```ts [wagmi.config.ts]
import { tempo } from 'viem/chains'
import { createConfig, http } from 'wagmi'
import { tempoWallet } from 'wagmi/connectors'

export const config = createConfig({
  connectors: [tempoWallet()],
  chains: [tempo],
  multiInjectedProviderDiscovery: false,
  transports: {
    [tempo.id]: http(),
  },
})
```
:::

### Place order at specific price

Ticks represent prices relative to the quote token (usually pathUSD). The formula is:

```
tick = (price - 1) * 100_000
```

For example, price $1.0000 → tick = 0, price $0.9990 → tick = -10, and price $1.0010 → tick = 10.

Use the `Tick` utility to convert between prices and ticks:

```tsx
import { Actions, Tick } from 'viem/tempo' // [!code hl]
import { parseUnits } from 'viem'

const alphaUsd = '0x20c0000000000000000000000000000000000001'

// buy order at $0.9990 (tick: -10) // [!code hl]
const buyCall = Actions.dex.place.call({ // [!code hl]
  token: alphaUsd, // [!code hl]
  amount: parseUnits('100', 6), // [!code hl]
  type: 'buy', // [!code hl]
  tick: Tick.fromPrice('0.9990'), // -10 // [!code hl]
}) // [!code hl]

// sell order at $1.0010 (tick: 10) // [!code hl]
const sellCall = Actions.dex.place.call({ // [!code hl]
  token: alphaUsd, // [!code hl]
  amount: parseUnits('100', 6), // [!code hl]
  type: 'sell', // [!code hl]
  tick: Tick.fromPrice('1.0010'), // 10 // [!code hl]
}) // [!code hl]
```

For more details including tick precision, limits, and calculation examples, see [Understanding Ticks](https://tempo.xyz/developers/docs/protocol/exchange/providing-liquidity#understanding-ticks).

## Liquidity provider best practices

### Batch liquidity calls

You can batch the calls to approve spend and place the order in a single transaction for efficiency. See the [Tempo Transactions guide](https://tempo.xyz/developers/docs/guide/tempo-transaction) for more details.

## Liquidity learning resources

* [Executing Swaps](https://tempo.xyz/developers/docs/guide/stablecoin-dex/executing-swaps) — Learn how to execute swaps and trade stablecoins on the DEX
* [Protocol Exchange Specification](https://tempo.xyz/developers/docs/protocol/exchange/spec) — Deep dive into the Stablecoin DEX protocol specification
* [Exchange Balance](https://tempo.xyz/developers/docs/protocol/exchange/exchange-balance) — Manage token balances on the exchange to optimize gas costs
