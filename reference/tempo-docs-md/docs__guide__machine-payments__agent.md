# Agent quickstart: build an AI agent that pays for APIs

The `tempo` CLI handles `402 Payment Required` responses the same way the client SDK does — but from a terminal, script, or AI agent, with zero integration code.

::::steps
### Install the Tempo CLI

```bash
curl -fsSL https://tempo.xyz/install | bash
```

### Log in to Tempo Wallet

```bash
tempo wallet login
tempo wallet whoami
```

`login` opens a browser flow that creates or connects a Tempo wallet. `whoami` confirms readiness and prints your address and balances.

:::tip
If your balance is zero, run `tempo wallet fund` before making requests.
:::

### Discover MPP services

```bash
tempo wallet services --search ai
tempo wallet services <SERVICE_ID>
```

The service directory shows endpoint URLs, HTTP methods, pricing, and request schemas — everything you need to construct a valid request.

For MCP-capable agents, see [Discover MPP services](https://tempo.xyz/developers/docs/guide/machine-payments/discover-services) to connect the read-only services MCP server at `https://mpp.dev/mcp/services`.

### Preview the MPP request cost

```bash
tempo request --dry-run -X POST \
  --json '{"prompt":"a sunset over the ocean"}' \
  https://fal.mpp.tempo.xyz/fal-ai/flux/dev
```

`--dry-run` validates the request and shows the payment cost without spending.

### Make an MPP paid request

```bash
tempo request -X POST \
  --json '{"prompt":"a sunset over the ocean"}' \
  https://fal.mpp.tempo.xyz/fal-ai/flux/dev
```

`tempo request` sends the request, intercepts the `402` challenge, signs and submits the payment, and retries with the credential — all in one command.
::::

## Set up an AI agent

Paste this into your agent to install Tempo's wallet and request skills:

:::code-group
```txt [Claude Code]
Read https://tempo.xyz/SKILL.md and set up tempo
```

```txt [Amp]
Read https://tempo.xyz/SKILL.md and set up tempo
```

```txt [Codex]
Read https://tempo.xyz/SKILL.md and set up tempo
```
:::

Once installed, the agent can discover services, preview costs, and make paid requests within scoped spending limits.

## Next steps for agentic payments

* [Discover MPP services](https://tempo.xyz/developers/docs/guide/machine-payments/discover-services) — Connect agents to the mpp.dev catalog over MCP
* [Server quickstart](https://tempo.xyz/developers/docs/guide/machine-payments/server) — Add payment gating to your HTTP endpoints
* [CLI reference](https://tempo.xyz/developers/docs/cli/wallet) — Complete tempo wallet and tempo request command reference
* [Accept one-time payments](https://tempo.xyz/developers/docs/guide/machine-payments/one-time-payments) — Charge per request with on-chain settlement
