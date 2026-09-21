# Indexer

Run read-only SQL queries against Tempo's indexed data.

## Query indexed chain data

`GET /v1/indexer/query`

Runs a read-only SQL-style query against Tempo’s indexed chain data, with optional live streaming as new blocks arrive.

### Query parameters

- `sql` `string` _(required)_: Read-only SQL query to run against Tempo’s indexed chain data. Use `SELECT` statements only.
- `chainId` `string | integer`: Which Tempo network to query. Use the alias `mainnet` or `testnet`, or a numeric chain id (mainnet is `4217`).
- `signature` `string[]`: ABI event signature to expose as a named SQL CTE, so you can query decoded event fields directly. Repeat this parameter to add multiple signatures.
- `engine` `string`: Choose the indexer engine yourself. By default the indexer routes automatically; `clickhouse` cannot be used with `live=true`.
- `live` `boolean`: Stream results as Server-Sent Events and re-run the query on every new block. This cannot be combined with `engine=clickhouse`.
- `limit` `integer`: Maximum number of rows to return. The server clamps this to the range 1 through 10,000.
- `timeout_ms` `integer`: Per-query timeout in milliseconds. The server clamps this to the range 100 through 30,000.

### Responses

#### `200`: Structured result from a Tempo indexer SQL query. When `live=true` the response is a `text/event-stream` (SSE) of `result` events with this same shape, interleaved with `error` and `lagged` events, re-run on every new block.

Headers:

- `RateLimit-Limit` `integer`: How many requests you may make in the current time window. Not sent on cached responses or `402` payment challenges.
- `RateLimit-Remaining` `integer`: How many requests you have left in the current window before you are rate-limited. Not sent on cached responses or `402` payment challenges.
- `RateLimit-Reset` `integer`: When the current window resets, as a Unix timestamp in seconds. Not sent on cached responses or `402` payment challenges.
- `RateLimit-Scope` `string`: Which quota this request counted against (e.g. `data:read`). Not sent on cached responses or `402` payment challenges.
- `tempo-request-id` `string`: A unique id for this request, returned on every response (and as `requestId` in error bodies). Include it when contacting support so we can find your request.

Body (`application/json`):

- `ok` `boolean` _(required)_: Whether the SQL query completed successfully.
- `columns` `string[]` _(required)_: Column names returned by the query, in row-value order.
- `rows` `unknown[][]` _(required)_: Query results. Each row is an array of values in the same order as `columns`.
- `row_count` `integer` _(required)_: Number of rows returned in this response.
- `engine` `string`: Indexer engine that ran the query.
- `query_time_ms` `number`: Server-side query execution time in milliseconds.

#### `400`: The query is invalid, the API key is malformed, or the selected chain is invalid or unsupported. Query errors use the indexer envelope; Tempo errors use the standard API envelope.

#### `401`: The API key is missing or invalid.

Body (`application/json`):

- `error` `object` _(required)_: What went wrong.
  - `code` `string` _(required)_: A short, stable code you can branch on in your code (e.g. `token_not_found`).
  - `details` `object[]`: A list of specific problems, when the error is about your request (e.g. invalid fields).
    - `message` `string` _(required)_: A specific thing that went wrong, in plain language (e.g. why a field failed validation).
    - `path` `string | number[]`: Where the problem is, as a path into your request (e.g. `["query", "limit"]`). Present for validation errors.
  - `message` `string` _(required)_: A human-readable explanation of what went wrong.
- `requestId` `string` _(required)_: The id of this request — include it when contacting support.

#### `402`: Payment required. This endpoint accepts MPP payment, and the request either exceeded free quota or needs a paid request credential. The challenge is protocol-native (handled by mppx), not the JSON error envelope: read the `WWW-Authenticate` header and retry with `Authorization: Payment <credential>`. A successful paid response carries `Payment-Receipt`.

Headers:

- `WWW-Authenticate` `string`: On a `402` response, the payment challenge to satisfy. Use it to build the `Authorization: Payment` credential and retry the request.

#### `403`: The API key cannot query the selected indexer.

Body (`application/json`):

- `error` `object` _(required)_: What went wrong.
  - `code` `string` _(required)_: A short, stable code you can branch on in your code (e.g. `token_not_found`).
  - `details` `object[]`: A list of specific problems, when the error is about your request (e.g. invalid fields).
    - `message` `string` _(required)_: A specific thing that went wrong, in plain language (e.g. why a field failed validation).
    - `path` `string | number[]`: Where the problem is, as a path into your request (e.g. `["query", "limit"]`). Present for validation errors.
  - `message` `string` _(required)_: A human-readable explanation of what went wrong.
- `requestId` `string` _(required)_: The id of this request — include it when contacting support.

#### `422`: The SQL failed validation or execution; this uses the upstream indexer’s error shape.

Body (`application/json`):

- `ok` `boolean` _(required)_: Always `false` when the indexer returns an error.
- `error` `string` _(required)_: Human-readable error message from the indexer.

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

#### `502`: The indexer could not complete the request. Indexer HTTP errors retain the indexer envelope; network failures use the Tempo envelope.

#### `504`: Request timed out. The request did not complete within the 60-second deadline; retry it.

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
curl 'https://api.tempo.xyz/v1/indexer/query?sql=string&chainId=mainnet&signature=string&engine=postgres&live=false&limit=10000&timeout_ms=5000'
```

```ts
fetch('https://api.tempo.xyz/v1/indexer/query?sql=string&chainId=mainnet&signature=string&engine=postgres&live=false&limit=10000&timeout_ms=5000')
```
