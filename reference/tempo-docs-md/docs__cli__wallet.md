# Tempo Wallet CLI: setting up and using it

Tempo Wallet CLI is the command-line way to use [Tempo Wallet](https://wallet.tempo.xyz) from scripts, terminals, and AI agents. Use `tempo wallet` to authenticate, manage balances and access keys, discover [MPP](https://mpp.dev/overview) services, fund token or credit balances, and manage payment sessions. Use [`tempo request`](https://tempo.xyz/developers/docs/cli/request) when you want the CLI to make the paid HTTP call.

* [Download](#download-the-tempo-wallet-cli) — Install the Tempo launcher and wallet extensions
* [Authenticate](#authenticate-with-tempo-wallet-cli) — Connect to your Tempo Wallet
* [Agent Mode](#agent-and-script-mode) — Use TOON output, dry runs, and spend caps
* [Balances](#balances-and-credits) — View your address, balances, credits, and key state
* [Add Funds](#add-wallet-funds) — Fund your wallet or transfer tokens
* [Discover Services](#discover-services) — Browse MPP-registered service providers
* [Manage Sessions](#manage-payment-sessions) — Track and close payment sessions

## Download the Tempo Wallet CLI

```bash
curl -fsSL https://tempo.xyz/install | bash
```

The launcher manages `tempo wallet` and `tempo request` extensions. To update later, run `tempoup`. Verify with `tempo --version`.

## Authenticate with Tempo Wallet CLI

```bash
tempo wallet login
```

Opens a browser flow to connect to your [Tempo Wallet](https://wallet.tempo.xyz). If you don't have one, the flow creates it.

For remote hosts where the browser is on another device:

```bash
tempo wallet login --no-browser
```

Once logged in, verify everything works:

```bash
tempo wallet whoami
```

If `ready=true`, the wallet is ready for [`tempo request`](https://tempo.xyz/developers/docs/cli/request).

Refresh a stale access key without logging out:

```bash
tempo wallet refresh
```

To disconnect:

```bash
tempo wallet logout --yes
```

## Balances and credits

```bash
tempo wallet whoami
tempo wallet whoami --credits
```

Shows your address, token balances, key state, and optional MPP Credits balance. Credits are separate from token balances and only apply to eligible one-time MPP charges.

## Manage access keys

```bash
tempo wallet keys
tempo wallet revoke <ACCESS_KEY_ADDRESS> --dry-run
tempo wallet revoke <ACCESS_KEY_ADDRESS>
```

Each wallet can have multiple access keys with independent spending limits. Use scoped keys to constrain what an agent or script can spend, and revoke keys that are stale or no longer needed.

## Add wallet funds

```bash
tempo wallet fund
tempo wallet fund --credits
tempo wallet fund --crypto
```

On testnet, the default flow opens the faucet. On mainnet, it opens available funding options. `--crypto` opens direct crypto funding. `--credits` opens MPP Credits purchase for eligible one-time services.

To transfer tokens to another address:

```bash
tempo wallet transfer <amount> <token> <to> --dry-run
tempo wallet transfer <amount> <token> <to>
```

For more options, see [Getting Funds on Tempo](https://tempo.xyz/developers/docs/guide/getting-funds).

## Discover services

```bash
tempo wallet services
tempo wallet services --search <query>
tempo wallet services <id>
```

The [Machine Payments Protocol](https://mpp.dev/overview) (MPP) lets HTTP endpoints accept payments inline. The service directory indexes MPP-registered providers. Each entry shows endpoint URLs, HTTP methods, pricing, whether credits are supported, and request schemas. Use it to find the exact URL and payload for [`tempo request`](https://tempo.xyz/developers/docs/cli/request).

Agents that support MCP can also use the read-only services MCP server at `https://mpp.dev/mcp/services`. See [Discover MPP services](https://tempo.xyz/developers/docs/guide/machine-payments/discover-services) for MCP setup, JSON-RPC examples, and the public catalog API.

Agent workflow:

```bash
tempo wallet -t services --search ai
tempo wallet -t services <SERVICE_ID>
tempo request -t --dry-run -X POST --json '{"input":"hello"}' <SERVICE_URL>/<ENDPOINT_PATH>
tempo request -t -X POST --json '{"input":"hello"}' <SERVICE_URL>/<ENDPOINT_PATH>
```

## Manage payment sessions

When you use [pay-as-you-go](https://tempo.xyz/developers/docs/guide/machine-payments/pay-as-you-go) services, MPP opens a [session](https://mpp.dev/payment-methods/tempo/session) — a payment channel where your wallet deposits funds into a reserve contract, then pays per request using signed [vouchers](https://mpp.dev/protocol/credentials) off-chain. This avoids an on-chain transaction for every request, giving sub-100ms latency and near-zero per-request fees.

Tempo Wallet CLI tracks session state locally:

```bash
tempo wallet sessions list
tempo wallet sessions sync
tempo wallet sessions close --all
tempo wallet sessions close --orphaned
tempo wallet sessions close --finalize
```

`sync` reconciles local records with onchain state. `close --orphaned` cleans up sessions whose counterparty is unreachable. `close --finalize` finalizes channels already pending close. Use `--dry-run` with any close command to preview before executing.

## Agent and script mode

Use [TOON](https://toonformat.dev/) output for compact, machine-readable responses:

```bash
tempo wallet -t whoami
tempo wallet -t services --search ai
tempo wallet -t services <SERVICE_ID>
```

Before spending, preview and cap paid requests:

```bash
tempo request -t --dry-run -X POST --json '{"input":"hello"}' <SERVICE_URL>/<ENDPOINT_PATH>
tempo request -t --max-spend 1.00 -X POST --json '{"input":"hello"}' <SERVICE_URL>/<ENDPOINT_PATH>
```

If a service supports MPP Credits, inspect the challenge first, then pay with credits:

```bash
headers="$(mktemp)"
tempo request -t --dry-run -D "$headers" -X POST --json '{"input":"hello"}' <SERVICE_URL>/<ENDPOINT_PATH>
tempo wallet -t transfer --credits --dry-run --mpp-challenge-file "$headers"
tempo wallet -t transfer --credits --mpp-challenge-file "$headers"
```

## Tempo Wallet CLI command reference

### Wallet authentication commands

| Command | Description |
| --- | --- |
| `tempo wallet login` | Connect or create a wallet via browser auth |
| `tempo wallet login --no-browser` | Print an auth URL for remote-host login |
| `tempo wallet refresh` | Refresh the current access key |
| `tempo wallet logout` | Disconnect and clear local credentials |
| `tempo wallet whoami` | Print readiness, address, balances, and key state |
| `tempo wallet whoami --credits` | Print MPP Credits balance |

### Wallet key commands

| Command | Description |
| --- | --- |
| `tempo wallet keys` | List keys and their spending limits |
| `tempo wallet revoke <access-key> --dry-run` | Preview access-key revocation |
| `tempo wallet revoke <access-key>` | Revoke an access key |

### Wallet funding commands

| Command | Description |
| --- | --- |
| `tempo wallet fund` | Fund wallet (faucet on testnet, bridge on mainnet) |
| `tempo wallet fund --crypto` | Open direct crypto funding |
| `tempo wallet fund --credits` | Buy MPP Credits for eligible one-time services |
| `tempo wallet transfer <amount> <token> <to>` | Transfer tokens to another address |
| `tempo wallet transfer --credits --mpp-challenge-file <file>` | Pay an MPP challenge with credits |

### Wallet service discovery commands

| Command | Description |
| --- | --- |
| `tempo wallet services` | List all registered services |
| `tempo wallet services --search <query>` | Filter services by keyword |
| `tempo wallet services <id>` | Show endpoints, methods, and request schemas |

### Wallet session commands

| Command | Description |
| --- | --- |
| `tempo wallet sessions list` | List active payment sessions |
| `tempo wallet sessions sync` | Reconcile local sessions with onchain state |
| `tempo wallet sessions close --all` | Close all sessions |
| `tempo wallet sessions close --orphaned` | Close sessions whose counterparty is unreachable |
| `tempo wallet sessions close --finalize` | Finalize channels pending close |

### Advanced wallet commands

| Command | Description |
| --- | --- |
| `tempo wallet debug` | Collect debug info for support |
| `tempo wallet completions <shell>` | Generate shell completions |

## Learn more about Tempo Wallet CLI

* [Tempo Wallet](https://wallet.tempo.xyz) — Open the web wallet to manage your account
* [MPP overview](https://mpp.dev/overview) — How agentic payments work with the Machine Payments Protocol
* [tempo request](https://tempo.xyz/developers/docs/cli/request) — Make paid HTTP requests from the terminal
* [Source code](https://github.com/tempoxyz/wallet-cli) — tempoxyz/wallet-cli on GitHub
