<span id="json-rpc-api" />

# Tempo JSON-RPC API

The Tempo API exposes a **JSON-RPC entrypoint** for raw, node-level chain access alongside its REST and Indexer surfaces. Through it, Tempo nodes serve all standard [Ethereum JSON-RPC methods](https://ethereum.org/developers/docs/apis/json-rpc/) (`eth_`, `net_`, `web3_`, `txpool_`, `trace_`, `debug_`) plus Tempo-specific namespaces for fork scheduling, consensus data, and node administration.

Point any Ethereum-compatible client at the hosted entrypoint, or [run your own node](https://tempo.xyz/developers/docs/guide/node/rpc):

| Chain | RPC URL |
|---------|---------|
| Mainnet | `https://api.tempo.xyz/rpc` |
| Testnet | `https://api.tempo.xyz/rpc/testnet` |

## Connect to Tempo JSON-RPC with tools

Use the Tempo JSON-RPC API with command-line tools, TypeScript clients, React hooks, or Rust providers.

### Cast

[Cast](https://www.getfoundry.sh/reference/cast/cast) is Foundry's command-line tool that includes tools to call JSON-RPC methods and inspect chain state from a terminal.

```bash [Terminal]
cast block-number --rpc-url https://api.tempo.xyz/rpc # [!code focus]
```

### Viem

[Viem](https://viem.sh/docs/clients/public) is a TypeScript client for Ethereum-compatible JSON-RPC APIs, useful for server-side scripts and app logic.

```ts [example.ts]
import { createClient, http } from 'viem/tempo'

const client = createClient({
  transport: http('https://api.tempo.xyz/rpc'), // [!code focus]
})

const blockNumber = await client.getBlockNumber() // [!code focus]
```

### Typed Client

The [Tempo API Typed Client](https://tempo.xyz/developers/docs/api/typed-client) is Tempo's typed API client for TypeScript. Use it when you want one client for Tempo REST endpoints and the JSON-RPC passthrough, with typed route parameters, status narrowing, and Tempo API error envelopes.

```ts [example.ts]
import { Client } from 'tapimo'

const client = Client.create({ apiKey: process.env.TEMPO_API_KEY })

const response = await client.rpc[':chain{mainnet|testnet|[0-9]+}?'].$post({
  param: { chain: 'testnet' }, // [!code focus]
  json: { jsonrpc: '2.0', id: 1, method: 'eth_blockNumber', params: [] }, // [!code focus]
})

const body = await response.json() // [!code focus]
```

### Wagmi

[Wagmi](https://wagmi.sh/react/api/createConfig) provides React hooks and configuration helpers on top of Viem clients.

:::code-group
```ts [wagmi.config.ts]
import { createConfig, http } from 'wagmi'
import { tempo } from 'viem/chains'

export const config = createConfig({
  chains: [tempo],
  transports: {
    [tempo.id]: http('https://api.tempo.xyz/rpc'), // [!code focus]
  },
})
```

```tsx [BlockNumber.tsx]
import { useBlockNumber } from 'wagmi'

export function BlockNumber() {
  const blockNumber = useBlockNumber() // [!code focus]
  return <span>{blockNumber.data?.toString()}</span> // [!code focus]
}
```
:::

### Rust

[Alloy](https://docs.rs/alloy-provider) is a Rust toolkit for Ethereum-compatible chains, including providers for JSON-RPC calls.

```rs [example.rs]
use alloy::providers::{Provider, ProviderBuilder};
use tempo_alloy::TempoNetwork;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let provider = ProviderBuilder::new_with_network::<TempoNetwork>()
        .connect("https://api.tempo.xyz/rpc") // [!code focus]
        .await?;

    let block_number = provider.get_block_number().await?; // [!code focus]
    println!("Latest block: {block_number}"); // [!code focus]

    Ok(())
}
```

## Tempo JSON-RPC endpoints

Tempo JSON-RPC endpoints are defined in the [Tempo OpenAPI specification](https://api.tempo.xyz/openapi.json).
