# Tempo CLI: installation and usage

The `tempo` binary covers three core workflows:

* **Tempo Wallet CLI (`tempo wallet`)** — use Tempo Wallet from the terminal: balances, funding, access keys, service discovery, and agent-ready wallet operations
* **`tempo request`** — make paid HTTP requests with automatic [MPP](https://mpp.dev/overview) payment negotiation
* **`tempo node`** / **`tempo download`** — run and sync a Tempo node

## Install the Tempo CLI

:::code-group
```bash [Terminal]
curl -fsSL https://tempo.xyz/install | bash
```
:::

To update later, run `tempoup`.

## Teach your agent to use Tempo

Paste this into your AI agent to set up Tempo Wallet CLI and start making paid requests:

:::code-group
```bash [Claude Code]
claude -p "Read https://tempo.xyz/SKILL.md and set up tempo"
```

```bash [Amp]
amp --execute "Read https://tempo.xyz/SKILL.md and set up tempo"
```

```bash [Codex CLI]
codex exec "Read https://tempo.xyz/SKILL.md and set up tempo"
```
:::

All commands support `--help` for documentation and `--describe` for JSON command schemas. For scripts and agents, pass `-t` (`--toon-output`) to get compact, machine-readable output, and use `--dry-run` or `--max-spend` before paid calls.

## Tempo CLI commands

Dive into each command:

* [tempo download](https://tempo.xyz/developers/docs/cli/node) — Fetch chain snapshots for faster initial sync
* [Wallet CLI](https://tempo.xyz/developers/docs/cli/wallet) — Use Tempo Wallet CLI from the command line for agents and scripts
* [tempo request](https://tempo.xyz/developers/docs/cli/request) — Make HTTP requests that pay automatically via MPP
* [tempo node](https://tempo.xyz/developers/docs/cli/node) — Run and configure a Tempo RPC or validator node
