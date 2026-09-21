# MCP

A hosted Model Context Protocol server: the data domain and Tempo docs exposed as tools.

## Call MCP

`POST /mcp`

A stateless streamable-HTTP MCP server: send JSON-RPC 2.0 messages as `POST` with `Accept: application/json, text/event-stream`. Tools mirror the API's data domain, plus `docs_*` documentation search. Anonymous requests allow 100 requests per minute; send `Authorization: Bearer <api key>` for protected tools.

### Request body (required) (`application/json`)

### Responses

#### `200`: JSON-RPC response returned by the MCP server.

Headers:

- `RateLimit-Limit` `integer`: How many requests you may make in the current time window. Not sent on cached responses or `402` payment challenges.
- `RateLimit-Remaining` `integer`: How many requests you have left in the current window before you are rate-limited. Not sent on cached responses or `402` payment challenges.
- `RateLimit-Reset` `integer`: When the current window resets, as a Unix timestamp in seconds. Not sent on cached responses or `402` payment challenges.
- `RateLimit-Scope` `string`: Which quota this request counted against (e.g. `data:read`). Not sent on cached responses or `402` payment challenges.
- `tempo-request-id` `string`: A unique id for this request, returned on every response (and as `requestId` in error bodies). Include it when contacting support so we can find your request.

Body (`application/json`):

- `error` `object`: JSON-RPC error object returned when a message fails.
  - `code` `integer` _(required)_: Numeric JSON-RPC error code returned by the MCP server.
  - `data` `unknown`: Optional extra error details returned by the MCP server.
  - `message` `string` _(required)_: Human-readable JSON-RPC error message.
- `id` `string | number | null`: Client-supplied JSON-RPC request id used to match responses to requests.
- `jsonrpc` `string` _(required)_: JSON-RPC protocol version; MCP uses `2.0`.
- `result` `unknown`: Result returned by the MCP method.

#### `202`: The message was a notification or client response; there is nothing to return.

#### `400`: Malformed or invalid MCP message, returned as a JSON-RPC error response rather than the standard error envelope. A malformed API key returns the standard `400` envelope instead.

Body (`application/json`):

- `error` `object`: JSON-RPC error object returned when a message fails.
  - `code` `integer` _(required)_: Numeric JSON-RPC error code returned by the MCP server.
  - `data` `unknown`: Optional extra error details returned by the MCP server.
  - `message` `string` _(required)_: Human-readable JSON-RPC error message.
- `id` `string | number | null`: Client-supplied JSON-RPC request id used to match responses to requests.
- `jsonrpc` `string` _(required)_: JSON-RPC protocol version; MCP uses `2.0`.
- `result` `unknown`: Result returned by the MCP method.

#### `401`: The presented API key is invalid. Anonymous requests are allowed under the public quota.

Body (`application/json`):

- `error` `object` _(required)_: What went wrong.
  - `code` `string` _(required)_: A short, stable code you can branch on in your code (e.g. `token_not_found`).
  - `details` `object[]`: A list of specific problems, when the error is about your request (e.g. invalid fields).
    - `message` `string` _(required)_: A specific thing that went wrong, in plain language (e.g. why a field failed validation).
    - `path` `string | number[]`: Where the problem is, as a path into your request (e.g. `["query", "limit"]`). Present for validation errors.
  - `message` `string` _(required)_: A human-readable explanation of what went wrong.
- `requestId` `string` _(required)_: The id of this request — include it when contacting support.

#### `406`: The `Accept` header must include both `application/json` and `text/event-stream`. Returned as a JSON-RPC error response.

Body (`application/json`):

- `error` `object`: JSON-RPC error object returned when a message fails.
  - `code` `integer` _(required)_: Numeric JSON-RPC error code returned by the MCP server.
  - `data` `unknown`: Optional extra error details returned by the MCP server.
  - `message` `string` _(required)_: Human-readable JSON-RPC error message.
- `id` `string | number | null`: Client-supplied JSON-RPC request id used to match responses to requests.
- `jsonrpc` `string` _(required)_: JSON-RPC protocol version; MCP uses `2.0`.
- `result` `unknown`: Result returned by the MCP method.

#### `429`: Rate limit exceeded. On endpoints that accept MPP, over-quota unpaid requests return `402 Payment Required` instead.

Headers:

- `RateLimit-Limit` `integer`: How many requests you may make in the current time window. Not sent on cached responses or `402` payment challenges.
- `RateLimit-Remaining` `integer`: How many requests you have left in the current window before you are rate-limited. Not sent on cached responses or `402` payment challenges.
- `RateLimit-Reset` `integer`: When the current window resets, as a Unix timestamp in seconds. Not sent on cached responses or `402` payment challenges.
- `RateLimit-Scope` `string`: Which quota this request counted against (e.g. `data:read`). Not sent on cached responses or `402` payment challenges.
- `tempo-request-id` `string`: A unique id for this request, returned on every response (and as `requestId` in error bodies). Include it when contacting support so we can find your request.
- `Retry-After` `integer`: How many seconds to wait before trying again. Sent with `429` (rate-limited) responses.

Body (`application/json`):

- `error` `object` _(required)_: What went wrong.
  - `code` `string` _(required)_: A short, stable code you can branch on in your code (e.g. `token_not_found`).
  - `details` `object[]`: A list of specific problems, when the error is about your request (e.g. invalid fields).
    - `message` `string` _(required)_: A specific thing that went wrong, in plain language (e.g. why a field failed validation).
    - `path` `string | number[]`: Where the problem is, as a path into your request (e.g. `["query", "limit"]`). Present for validation errors.
  - `message` `string` _(required)_: A human-readable explanation of what went wrong.
- `requestId` `string` _(required)_: The id of this request — include it when contacting support.

#### `500`: Internal server error.

Body (`application/json`):

- `error` `object` _(required)_: What went wrong.
  - `code` `string` _(required)_: A short, stable code you can branch on in your code (e.g. `token_not_found`).
  - `details` `object[]`: A list of specific problems, when the error is about your request (e.g. invalid fields).
    - `message` `string` _(required)_: A specific thing that went wrong, in plain language (e.g. why a field failed validation).
    - `path` `string | number[]`: Where the problem is, as a path into your request (e.g. `["query", "limit"]`). Present for validation errors.
  - `message` `string` _(required)_: A human-readable explanation of what went wrong.
- `requestId` `string` _(required)_: The id of this request — include it when contacting support.

### Example request

```bash
curl https://api.tempo.xyz/mcp \
  --request POST \
  --header 'Content-Type: application/json' \
  --data '{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/list",
  "params": {}
}'
```

```ts
fetch('https://api.tempo.xyz/mcp', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    jsonrpc: '2.0',
    id: 1,
    method: 'tools/list',
    params: {}
  })
})
```
