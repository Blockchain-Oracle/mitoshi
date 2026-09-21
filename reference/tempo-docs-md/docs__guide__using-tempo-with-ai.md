# Using Tempo with AI through the MCP server

Tempo publishes documentation, Markdown pages, MCP tools, and agent plugins so AI coding agents can work with Tempo using current project context instead of guesses.

Tempo Mainnet has been live since March 18, 2026. Agent wallet workflows use mainnet, and pathUSD in Tempo Wallet is a live mainnet asset. Moderato and its faucet-issued pathUSD are reserved for explicitly testnet development workflows.

Use this page when you want Claude, Codex, Cursor, Amp, or another MCP-compatible client to search Tempo and related documentation, read complete pages, and install reusable Tempo workflows.

## Connect to Tempo's MCP server

The Tempo MCP server gives agents programmatic access to Tempo documentation and related developer resources.

### Claude

```bash
claude mcp add --transport http tempo https://mcp.tempo.xyz
```

### Codex

```bash
codex mcp add tempo --url https://mcp.tempo.xyz
```

### Cursor

[Install in Cursor](cursor://anysphere.cursor-deeplink/mcp/install?name=tempo\&config=eyJ1cmwiOiJodHRwczovL21jcC50ZW1wby54eXoifQ%3D%3D)

To open Cursor and automatically add the Tempo MCP server, click install. Alternatively, add the following to your `~/.cursor/mcp.json` file. To learn more, see the Cursor [documentation](https://docs.cursor.com/context/model-context-protocol).

```json
{
  "mcpServers": {
    "tempo": {
      "url": "https://mcp.tempo.xyz"
    }
  }
}
```

### Amp

```bash
amp mcp add --transport http tempo https://mcp.tempo.xyz
```

### Manual

```json
{
  "mcpServers": {
    "tempo": {
      "url": "https://mcp.tempo.xyz"
    }
  }
}
```

## MCP tools

The MCP endpoint exposes these tools to connected agents:

| Tool | Purpose | Required arguments |
| --- | --- | --- |
| `search` | Search docs. | `query` |
| `find_pages` | Find matching page URLs from a source index. | `source`, `query` |
| `read_page` | Read one cleaned documentation page. | `source` plus `path` or `url` |
| `code` | Run multi-step documentation lookups. | `code` |

### MCP feedback

MCP clients can also post feedback directly to `https://tempo.xyz/developers/api/feedback`:

```json
{
  "source": "mcp",
  "sentiment": "negative",
  "message": "The read_page result for /guide/payments is missing fee-token setup.",
  "toolName": "read_page",
  "relatedResource": "/guide/payments",
  "client": "codex"
}
```

### Try the MCP server

Use the interactive web page to try the Tempo MCP server.

## Install Tempo plugins

The Tempo plugin installs a complete agent integration: the Tempo MCP server, workflow skills for using Tempo APIs and docs, and editor metadata that helps agents discover the right Tempo tools without manual setup.

:::code-group
```bash [Codex]
codex plugin marketplace add tempoxyz/docs --ref main
codex plugin add docs@tempo
```

```bash [Claude]
claude plugin marketplace add tempoxyz/docs
claude plugin install docs@tempo
```
:::

:::warning[Legacy Codex marketplace name]
If Codex reports that the plugin is missing after finding this marketplace as `docs`, replace that
pre-rename registration once, then rerun the install:

```bash
codex plugin marketplace remove docs
codex plugin marketplace add tempoxyz/docs --ref main
codex plugin add docs@tempo
```
:::

## Install the Mercator plugin

Mercator adds paid API discovery and execution through the Mercator MCP server. The installer installs the CLI, configures detected MCP clients, and bootstraps the local Mercator plugin:

```bash
curl -fsSL https://mercator.tempo.xyz/downloads/latest/install.sh | sh
```

To install the plugin directly from the Tempo marketplace, add the public `tempoxyz/docs` source and select `mercator@tempo`:

:::code-group
```bash [Codex]
codex plugin marketplace add tempoxyz/docs --ref main
codex plugin add mercator@tempo
```

```bash [Claude]
claude plugin marketplace add tempoxyz/docs
claude plugin install mercator@tempo --scope user --yes
```
:::

## Tempo Docs

### Docs skill

Install the Tempo Docs skill to give AI coding agents access to Tempo documentation, related documentation sources, and examples:

```bash
npx skills add tempoxyz/docs
```

Once installed, the agent uses it automatically when relevant tasks are detected.

### Read docs as Markdown

Every page on this site is available as plain Markdown — append `.md` to any URL:

```
https://tempo.xyz/developers/docs/quickstart/integrate-tempo.md
```

For LLM consumption, two [`llms.txt`](https://llmstxt.org/) files are served at the root:

| URL | Contents |
| --- | --- |
| [`/llms.txt`](https://tempo.xyz/developers/llms.txt) | Concise index of all pages with titles and descriptions |
| [`/llms-full.txt`](https://tempo.xyz/developers/llms-full.txt) | Complete documentation in a single file |
