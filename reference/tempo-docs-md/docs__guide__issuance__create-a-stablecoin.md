# How to create a TIP-20 stablecoin

Create your own stablecoin on Tempo using [TIP-20 Tokens](https://tempo.xyz/developers/docs/protocol/tip20/overview).
TIP-20 tokens are designed specifically for payments with built-in compliance features, role-based permissions,
and integration with Tempo's payment infrastructure.

## Stablecoin creation demo

By the end of this guide, you will be able to create a stablecoin on Tempo.

**Interactive demo: Create a Stablecoin**

1. Connect
2. Add funds
3. Create token

Source: [tempoxyz/examples/tree/main/examples/issuance](https://github.com/tempoxyz/examples/tree/main/examples/issuance)

## Stablecoin creation steps

::::steps
### Set up Wagmi for stablecoin creation

Ensure that you have set up your project with Wagmi, a Tempo chain config, and a wallet connector:

* [Connection details](https://tempo.xyz/developers/docs/quickstart/connection-details)
* [TypeScript SDK](https://tempo.xyz/developers/docs/sdk/typescript)
* [Wallet integration](https://tempo.xyz/developers/docs/quickstart/wallet-developers)

### Add testnet funds for deployment¹

Before we send off a transaction to deploy our stablecoin to the Tempo testnet, we need to make sure our account is funded with a stablecoin to cover the transaction fee.

As we have configured our project to use `AlphaUSD` (`0x20c000…0001`)
as the [default fee token](https://tempo.xyz/developers/docs/quickstart/evm-compatibility#consideration-1-setting-a-user-default-fee-token), we will need to add some `AlphaUSD` to our account.

Luckily, the built-in Tempo testnet faucet supports funding accounts with `AlphaUSD`.

**Interactive demo: Add Funds**

1. Add funds

:::code-group
```tsx twoslash [AddFunds.ts]
// @noErrors
import { Hooks } from 'wagmi/tempo'
import { useConnection } from 'wagmi'

export function AddFunds() {
  const { address } = useConnection()
  const addFunds = Hooks.faucet.useFund()

  return (
    <button onClick={() => addFunds.mutate({ account: address })}>
      Add Funds
    </button>
  )
}
```

```tsx twoslash [config.ts] filename="config.ts"
// @noErrors
import { createConfig, http } from 'wagmi'
import { tempo } from 'viem/chains'
import { tempoWallet } from 'wagmi/connectors'

export const config = createConfig({
  chains: [tempo],
  connectors: [tempoWallet()],
  transports: {
    [tempo.id]: http(),
  },
})
```
:::

:::warning
¹ It is important to note that the `addFunds` Hook only works on testnets as a convenience feature to get
started quickly. For production, you will need to onramp & fund your account manually.
:::

### Add stablecoin form fields

Now that we have some funds to cover the transaction fee in our account, we can create a stablecoin.

Let's create a new component and add some input fields for the **name** and **symbol** of our stablecoin, as shown in the demo.

**Interactive demo: Create Form**

1. Add funds
2. Create token

:::code-group
```tsx twoslash [CreateStablecoin.tsx]
// @noErrors
export function CreateStablecoin() {
  return (
    <div>
      <form
        onSubmit={(event) => {
          event.preventDefault()
          const formData = new FormData(event.target as HTMLFormElement)
          const name = formData.get('name') as string
          const symbol = formData.get('symbol') as string
        }}
      >
        <input type="text" name="name" placeholder="demoUSD" required />
        <input type="text" name="symbol" placeholder="DEMO" required />
        <button type="submit">
          Create
        </button>
      </form>
    </div>
  )
}
```

```tsx twoslash [config.ts] filename="config.ts"
// @noErrors
import { createConfig, http } from 'wagmi'
import { tempo } from 'viem/chains'
import { tempoWallet } from 'wagmi/connectors'

export const config = createConfig({
  chains: [tempo],
  connectors: [tempoWallet()],
  transports: {
    [tempo.id]: http(),
  },
})
```
:::

### Add stablecoin deployment logic

Now that we have some input fields, we need to add some logic to handle the submission of the form to create the stablecoin.

After this step, your users will be able to create a stablecoin by clicking the "Create" button!

Tokens can also carry an optional on-chain [`logoURI`](https://tempo.xyz/developers/docs/protocol/tip20/spec#logo-uri) that wallets and explorers read directly from the token contract. It's set on the token contract and is independent of this creation flow; for the recommended format, use a square, rasterized PNG or WebP (max 256 bytes; `https`, `http`, `ipfs`, or `data` scheme).

:::warning
The `currency` field is **immutable** after token creation and affects fee payment eligibility, DEX routing, and quote token pairing. See [Currency Declaration](https://tempo.xyz/developers/docs/protocol/tip20/overview#currency-declaration) for guidelines on choosing the right value. **Only `USD` stablecoins can be used to pay transaction fees on Tempo.**
:::

**Interactive demo: Create Form**

1. Create token

:::code-group
```tsx twoslash [CreateStablecoin.tsx]
import { Hooks } from 'wagmi/tempo' // [!code ++]

// @noErrors
export function CreateStablecoin() {
  const create = Hooks.token.useCreateSync() // [!code ++]

  return (
    <div>
      <form
        onSubmit={(event) => {
          event.preventDefault()
          const formData = new FormData(event.target as HTMLFormElement)
          const name = formData.get('name') as string
          const symbol = formData.get('symbol') as string
          create.mutate({ // [!code ++]
            name, // [!code ++]
            symbol, // [!code ++]
            currency: 'USD', // [!code ++]
          }) // [!code ++]
        }}
      >
        <input type="text" name="name" placeholder="demoUSD" required />
        <input type="text" name="symbol" placeholder="DEMO" required />
        <button type="submit">
          Create
        </button>
      </form>
    </div>
  )
}
```

```tsx twoslash [config.ts] filename="config.ts"
// @noErrors
import { createConfig, http } from 'wagmi'
import { tempo } from 'viem/chains'
import { tempoWallet } from 'wagmi/connectors'

export const config = createConfig({
  chains: [tempo],
  connectors: [tempoWallet()],
  transports: {
    [tempo.id]: http(),
  },
})
```
:::

### Add stablecoin creation success state

Now that users can submit the form and create a stablecoin, let's add a basic success state to display
the name of the stablecoin and a link to the transaction receipt.

:::code-group
```tsx twoslash [CreateStablecoin.tsx]
import { Hooks } from 'wagmi/tempo' 

// @noErrors
export function CreateStablecoin() {
  const create = Hooks.token.useCreateSync() 

  return (
    <div>
      <form
        onSubmit={(event) => {
          event.preventDefault()
          const formData = new FormData(event.target as HTMLFormElement)
          const name = formData.get('name') as string
          const symbol = formData.get('symbol') as string
          create.mutate({ 
            name, 
            symbol, 
            currency: 'USD', 
          }) 
        }}
      >
        <input type="text" name="name" placeholder="demoUSD" required />
        <input type="text" name="symbol" placeholder="DEMO" required />
        <button type="submit">
          Create
        </button>
      </form>

      {create.data && ( // [!code ++]
        <div> {/* [!code ++] */}
          {create.data.name} created successfully! {/* [!code ++] */}
          <a href={`https://explore.tempo.xyz/tx/${create.data.receipt.transactionHash}`}> {/* [!code ++] */}
            View receipt {/* [!code ++] */}
          </a> {/* [!code ++] */}
        </div> {/* [!code ++] */}
      )} {/* [!code ++] */}
    </div>
  )
}
```

```tsx twoslash [config.ts] filename="config.ts"
// @noErrors
import { createConfig, http } from 'wagmi'
import { tempo } from 'viem/chains'
import { tempoWallet } from 'wagmi/connectors'

export const config = createConfig({
  chains: [tempo],
  connectors: [tempoWallet()],
  transports: {
    [tempo.id]: http(),
  },
})
```
:::

### Next steps after creating a stablecoin

Now that you have created your first stablecoin, you can now:

* [Add your token to the Token List](https://tempo.xyz/developers/docs/quickstart/tokenlist#adding-a-new-token) so it appears in wallets, explorers, and other apps on Tempo
* learn the [Best Practices](#stablecoin-creation-best-practices) below
* follow a guide on how to [mint](https://tempo.xyz/developers/docs/guide/issuance/mint-stablecoins) and [more](https://tempo.xyz/developers/docs/guide/issuance/manage-stablecoin) with your stablecoin.
::::

## Stablecoin creation best practices

### Stablecoin creation loading state

When the user is creating a stablecoin, we should show loading state to indicate that the process is happening.

We can use the `isPending` property from the `useCreateSync` hook to show pending state to the user on our "Create" button.

```tsx
<button 
  disabled={create.isPending} // [!code ++]
  type="submit"
>
  {create.isPending ? 'Creating...' : 'Create'} {/* [!code ++] */}
</button>
```

### Stablecoin creation error handling

If an error unexpectedly occurs, we should display an error message to the user.

We can use the `error` property from the `useCreateSync` hook to show error state to the user.

```tsx twoslash
// @noErrors
export function CreateStablecoin() {
  // ...

  if (create.error) // [!code ++]
    return <div>Error: {create.error.message}</div> {/* [!code ++] */}

  // ...
}
```

## Stablecoin creation learning resources

* [TIP-20 Tokens](https://tempo.xyz/developers/docs/protocol/tip20/overview) — Learn more about TIP-20 tokens on Tempo
