# Deposit Addresses

Reusable route addresses and deposits detected at those addresses.

## List deposit addresses

`GET /v1/routes/deposit-addresses`

Lists reusable route deposit addresses, newest first.

### Query parameters

- `cursor` `string`: Opaque keyset cursor from a previous response (`nextCursor`); pass it back verbatim to fetch the next page. Omit for the first (head) page.
- `limit` `integer`: How many items to return per page (5–50, default 10). Use `nextCursor` to fetch more.

### Responses

#### `200`: A page of reusable route deposit addresses.

Headers:

- `RateLimit-Limit` `integer`: How many requests you may make in the current time window. Not sent on cached responses or `402` payment challenges.
- `RateLimit-Remaining` `integer`: How many requests you have left in the current window before you are rate-limited. Not sent on cached responses or `402` payment challenges.
- `RateLimit-Reset` `integer`: When the current window resets, as a Unix timestamp in seconds. Not sent on cached responses or `402` payment challenges.
- `RateLimit-Scope` `string`: Which quota this request counted against (e.g. `data:read`). Not sent on cached responses or `402` payment challenges.
- `tempo-request-id` `string`: A unique id for this request, returned on every response (and as `requestId` in error bodies). Include it when contacting support so we can find your request.

Body (`application/json`):

- `data` `object[]` _(required)_: Route deposit addresses on this page, newest first.
  - `address` `string` _(required)_: Reusable source-chain deposit address.
  - `createdAt` `string <date-time>` _(required)_: When the deposit address was created (ISO 8601).
  - `destinationChain` `object` _(required)_: A normalized chain reference for route quotes.
    - `addressFormat` `string` _(required)_: Address encoding used by accounts and token identifiers on this chain.
    - `id` `string` _(required)_: CAIP-2 chain id.
    - `kind` `string` _(required)_: Chain execution family used for provider routing.
    - `name` `string` _(required)_: Human-readable chain name.
  - `destinationToken` `object` _(required)_: A normalized token reference for route quotes.
    - `address` `string` _(required)_: Contract address, mint, or issuer address on the token chain.
    - `currency` `string` _(required)_: Monetary denomination represented by this token.
    - `decimals` `integer` _(required)_: Number of decimal places this token uses.
    - `name` `string` _(required)_: Human-readable token name.
    - `standard` `string` _(required)_: Token standard on the token chain.
    - `symbol` `string` _(required)_: Short token ticker symbol.
    - `tokenKey` `string` _(required)_: Stable Tempo token key scoped to the token chain.
    - `verified` `boolean` _(required)_: Whether Tempo recognizes this token in its route quote inventory.
  - `id` `string` _(required)_: Route deposit address id (`rda_…`, or legacy `fda_…`).
  - `provider` `object` _(required)_: Provider metadata embedded in a route quote.
    - `id` `string` _(required)_: Stable provider id.
    - `name` `string` _(required)_: Human-readable provider name.
  - `recipient` `string` _(required)_: Tempo account that receives completed deposits.
  - `refundAddress` `string` _(required)_: Source-chain address that receives refunds.
  - `sourceChain` `object` _(required)_: A normalized chain reference for route quotes.
    - `addressFormat` `string` _(required)_: Address encoding used by accounts and token identifiers on this chain.
    - `id` `string` _(required)_: CAIP-2 chain id.
    - `kind` `string` _(required)_: Chain execution family used for provider routing.
    - `name` `string` _(required)_: Human-readable chain name.
  - `sourceToken` `object` _(required)_: A normalized token reference for route quotes.
    - `address` `string` _(required)_: Contract address, mint, or issuer address on the token chain.
    - `currency` `string` _(required)_: Monetary denomination represented by this token.
    - `decimals` `integer` _(required)_: Number of decimal places this token uses.
    - `name` `string` _(required)_: Human-readable token name.
    - `standard` `string` _(required)_: Token standard on the token chain.
    - `symbol` `string` _(required)_: Short token ticker symbol.
    - `tokenKey` `string` _(required)_: Stable Tempo token key scoped to the token chain.
    - `verified` `boolean` _(required)_: Whether Tempo recognizes this token in its route quote inventory.
  - `status` `string` _(required)_: Whether the address can safely process new deposits.
  - `subsidize` `boolean` _(required)_: Whether Tempo guarantees normalized 1:1 delivery.
  - `updatedAt` `string <date-time>` _(required)_: When the deposit address last materially changed (ISO 8601).
- `nextCursor` `string` _(required)_: Pass this back as the `cursor` query parameter to fetch the next page. `null` once you have reached the end of the list.

#### `400`: Invalid request.

Body (`application/json`):

- `error` `object` _(required)_: What went wrong.
  - `code` `string` _(required)_: A short, stable code you can branch on in your code (e.g. `token_not_found`).
  - `details` `object[]`: A list of specific problems, when the error is about your request (e.g. invalid fields).
    - `message` `string` _(required)_: A specific thing that went wrong, in plain language (e.g. why a field failed validation).
    - `path` `string | number[]`: Where the problem is, as a path into your request (e.g. `["query", "limit"]`). Present for validation errors.
  - `message` `string` _(required)_: A human-readable explanation of what went wrong.
- `requestId` `string` _(required)_: The id of this request — include it when contacting support.

#### `401`: Missing or invalid API key.

Body (`application/json`):

- `error` `object` _(required)_: What went wrong.
  - `code` `string` _(required)_: A short, stable code you can branch on in your code (e.g. `token_not_found`).
  - `details` `object[]`: A list of specific problems, when the error is about your request (e.g. invalid fields).
    - `message` `string` _(required)_: A specific thing that went wrong, in plain language (e.g. why a field failed validation).
    - `path` `string | number[]`: Where the problem is, as a path into your request (e.g. `["query", "limit"]`). Present for validation errors.
  - `message` `string` _(required)_: A human-readable explanation of what went wrong.
- `requestId` `string` _(required)_: The id of this request — include it when contacting support.

#### `403`: Forbidden.

Body (`application/json`):

- `error` `object` _(required)_: What went wrong.
  - `code` `string` _(required)_: A short, stable code you can branch on in your code (e.g. `token_not_found`).
  - `details` `object[]`: A list of specific problems, when the error is about your request (e.g. invalid fields).
    - `message` `string` _(required)_: A specific thing that went wrong, in plain language (e.g. why a field failed validation).
    - `path` `string | number[]`: Where the problem is, as a path into your request (e.g. `["query", "limit"]`). Present for validation errors.
  - `message` `string` _(required)_: A human-readable explanation of what went wrong.
- `requestId` `string` _(required)_: The id of this request — include it when contacting support.

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

#### `502`: Upstream data failure.

Body (`application/json`):

- `error` `object` _(required)_: What went wrong.
  - `code` `string` _(required)_: A short, stable code you can branch on in your code (e.g. `token_not_found`).
  - `details` `object[]`: A list of specific problems, when the error is about your request (e.g. invalid fields).
    - `message` `string` _(required)_: A specific thing that went wrong, in plain language (e.g. why a field failed validation).
    - `path` `string | number[]`: Where the problem is, as a path into your request (e.g. `["query", "limit"]`). Present for validation errors.
  - `message` `string` _(required)_: A human-readable explanation of what went wrong.
- `requestId` `string` _(required)_: The id of this request — include it when contacting support.

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
curl 'https://api.tempo.xyz/v1/routes/deposit-addresses?cursor=WzIzNDU2Nzg5LDBd&limit=10'
```

```ts
fetch('https://api.tempo.xyz/v1/routes/deposit-addresses?cursor=WzIzNDU2Nzg5LDBd&limit=10')
```

## Create deposit address

`POST /v1/routes/deposit-addresses`

Creates or returns a reusable deposit address for routes a Tempo account.

### Header parameters

- `idempotency-key` `string` _(required)_: Opaque retry key scoped to the API key. Matching requests replay successful responses for 24 hours; changed input conflicts, in-flight requests block, and failed attempts release the key.

### Request body (required) (`application/json`)

- `amount` `string` _(required)_: Amount in base units of the token the mode fixes.
- `destinationToken` `string` _(required)_: Tempo destination token symbol, contract address, or token key.
- `recipient` `string` _(required)_: Tempo account that receives completed deposits.
- `refundAddress` `string` _(required)_: Source-chain account that receives refunds.
- `sourceChain` `string` _(required)_: Source chain CAIP-2 id, slug, or alias.
- `sourceToken` `string` _(required)_: Source token symbol, contract address, or token key.
- `subsidize` `boolean`: Guarantees normalized 1:1 delivery through a Tempo-funded subsidy.

### Responses

#### `200`: The created or matching reusable route deposit address and quote.

Headers:

- `RateLimit-Limit` `integer`: How many requests you may make in the current time window. Not sent on cached responses or `402` payment challenges.
- `RateLimit-Remaining` `integer`: How many requests you have left in the current window before you are rate-limited. Not sent on cached responses or `402` payment challenges.
- `RateLimit-Reset` `integer`: When the current window resets, as a Unix timestamp in seconds. Not sent on cached responses or `402` payment challenges.
- `RateLimit-Scope` `string`: Which quota this request counted against (e.g. `data:read`). Not sent on cached responses or `402` payment challenges.
- `tempo-request-id` `string`: A unique id for this request, returned on every response (and as `requestId` in error bodies). Include it when contacting support so we can find your request.

#### `400`: Invalid request.

Body (`application/json`):

- `error` `object` _(required)_: What went wrong.
  - `code` `string` _(required)_: A short, stable code you can branch on in your code (e.g. `token_not_found`).
  - `details` `object[]`: A list of specific problems, when the error is about your request (e.g. invalid fields).
    - `message` `string` _(required)_: A specific thing that went wrong, in plain language (e.g. why a field failed validation).
    - `path` `string | number[]`: Where the problem is, as a path into your request (e.g. `["query", "limit"]`). Present for validation errors.
  - `message` `string` _(required)_: A human-readable explanation of what went wrong.
- `requestId` `string` _(required)_: The id of this request — include it when contacting support.

#### `401`: Missing or invalid API key.

Body (`application/json`):

- `error` `object` _(required)_: What went wrong.
  - `code` `string` _(required)_: A short, stable code you can branch on in your code (e.g. `token_not_found`).
  - `details` `object[]`: A list of specific problems, when the error is about your request (e.g. invalid fields).
    - `message` `string` _(required)_: A specific thing that went wrong, in plain language (e.g. why a field failed validation).
    - `path` `string | number[]`: Where the problem is, as a path into your request (e.g. `["query", "limit"]`). Present for validation errors.
  - `message` `string` _(required)_: A human-readable explanation of what went wrong.
- `requestId` `string` _(required)_: The id of this request — include it when contacting support.

#### `403`: The organization cannot create another address or is not eligible for a Tempo-funded Routes subsidy.

Body (`application/json`):

- `error` `object` _(required)_: What went wrong.
  - `code` `string` _(required)_: A short, stable code you can branch on in your code (e.g. `token_not_found`).
  - `details` `object[]`: A list of specific problems, when the error is about your request (e.g. invalid fields).
    - `message` `string` _(required)_: A specific thing that went wrong, in plain language (e.g. why a field failed validation).
    - `path` `string | number[]`: Where the problem is, as a path into your request (e.g. `["query", "limit"]`). Present for validation errors.
  - `message` `string` _(required)_: A human-readable explanation of what went wrong.
- `requestId` `string` _(required)_: The id of this request — include it when contacting support.

#### `404`: No provider can provision the requested reusable address route.

Body (`application/json`):

- `error` `object` _(required)_: What went wrong.
  - `code` `string` _(required)_: A short, stable code you can branch on in your code (e.g. `token_not_found`).
  - `details` `object[]`: A list of specific problems, when the error is about your request (e.g. invalid fields).
    - `message` `string` _(required)_: A specific thing that went wrong, in plain language (e.g. why a field failed validation).
    - `path` `string | number[]`: Where the problem is, as a path into your request (e.g. `["query", "limit"]`). Present for validation errors.
  - `message` `string` _(required)_: A human-readable explanation of what went wrong.
- `requestId` `string` _(required)_: The id of this request — include it when contacting support.

#### `409`: The request conflicts with an existing address, policy, or in-flight request.

Body (`application/json`):

- `error` `object` _(required)_: What went wrong.
  - `code` `string` _(required)_: A short, stable code you can branch on in your code (e.g. `token_not_found`).
  - `details` `object[]`: A list of specific problems, when the error is about your request (e.g. invalid fields).
    - `message` `string` _(required)_: A specific thing that went wrong, in plain language (e.g. why a field failed validation).
    - `path` `string | number[]`: Where the problem is, as a path into your request (e.g. `["query", "limit"]`). Present for validation errors.
  - `message` `string` _(required)_: A human-readable explanation of what went wrong.
- `requestId` `string` _(required)_: The id of this request — include it when contacting support.

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

#### `502`: The selected provider could not provision the address.

Body (`application/json`):

- `error` `object` _(required)_: What went wrong.
  - `code` `string` _(required)_: A short, stable code you can branch on in your code (e.g. `token_not_found`).
  - `details` `object[]`: A list of specific problems, when the error is about your request (e.g. invalid fields).
    - `message` `string` _(required)_: A specific thing that went wrong, in plain language (e.g. why a field failed validation).
    - `path` `string | number[]`: Where the problem is, as a path into your request (e.g. `["query", "limit"]`). Present for validation errors.
  - `message` `string` _(required)_: A human-readable explanation of what went wrong.
- `requestId` `string` _(required)_: The id of this request — include it when contacting support.

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
curl https://api.tempo.xyz/v1/routes/deposit-addresses \
  --request POST \
  --header 'idempotency-key: routes_01k1c5j8q8p0be6j5v9m6d1e4r' \
  --header 'Content-Type: application/json' \
  --data '{
  "amount": "1000000",
  "destinationToken": "usdt0",
  "recipient": "0x1111111111111111111111111111111111111111",
  "refundAddress": "TJRabPrwbZy45sbavfcjinPJC18kjpRTv8",
  "sourceChain": "tron",
  "sourceToken": "usdt"
}'
```

```ts
fetch('https://api.tempo.xyz/v1/routes/deposit-addresses', {
  method: 'POST',
  headers: {
    'idempotency-key': 'routes_01k1c5j8q8p0be6j5v9m6d1e4r',
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    amount: '1000000',
    destinationToken: 'usdt0',
    recipient: '0x1111111111111111111111111111111111111111',
    refundAddress: 'TJRabPrwbZy45sbavfcjinPJC18kjpRTv8',
    sourceChain: 'tron',
    sourceToken: 'usdt'
  })
})
```

## Reconcile deposit address

`POST /v1/routes/deposit-addresses/{id}/reconcile`

Queues an immediate provider reconciliation for one reusable route deposit address.

### Path parameters

- `id` `string` _(required)_: Route deposit address ID (`rda_…`).

### Responses

#### `202`: The route deposit address was queued for reconciliation.

Headers:

- `RateLimit-Limit` `integer`: How many requests you may make in the current time window. Not sent on cached responses or `402` payment challenges.
- `RateLimit-Remaining` `integer`: How many requests you have left in the current window before you are rate-limited. Not sent on cached responses or `402` payment challenges.
- `RateLimit-Reset` `integer`: When the current window resets, as a Unix timestamp in seconds. Not sent on cached responses or `402` payment challenges.
- `RateLimit-Scope` `string`: Which quota this request counted against (e.g. `data:read`). Not sent on cached responses or `402` payment challenges.
- `tempo-request-id` `string`: A unique id for this request, returned on every response (and as `requestId` in error bodies). Include it when contacting support so we can find your request.

#### `400`: Invalid request.

Body (`application/json`):

- `error` `object` _(required)_: What went wrong.
  - `code` `string` _(required)_: A short, stable code you can branch on in your code (e.g. `token_not_found`).
  - `details` `object[]`: A list of specific problems, when the error is about your request (e.g. invalid fields).
    - `message` `string` _(required)_: A specific thing that went wrong, in plain language (e.g. why a field failed validation).
    - `path` `string | number[]`: Where the problem is, as a path into your request (e.g. `["query", "limit"]`). Present for validation errors.
  - `message` `string` _(required)_: A human-readable explanation of what went wrong.
- `requestId` `string` _(required)_: The id of this request — include it when contacting support.

#### `401`: Missing or invalid API key.

Body (`application/json`):

- `error` `object` _(required)_: What went wrong.
  - `code` `string` _(required)_: A short, stable code you can branch on in your code (e.g. `token_not_found`).
  - `details` `object[]`: A list of specific problems, when the error is about your request (e.g. invalid fields).
    - `message` `string` _(required)_: A specific thing that went wrong, in plain language (e.g. why a field failed validation).
    - `path` `string | number[]`: Where the problem is, as a path into your request (e.g. `["query", "limit"]`). Present for validation errors.
  - `message` `string` _(required)_: A human-readable explanation of what went wrong.
- `requestId` `string` _(required)_: The id of this request — include it when contacting support.

#### `403`: The API key does not grant routes write access.

Body (`application/json`):

- `error` `object` _(required)_: What went wrong.
  - `code` `string` _(required)_: A short, stable code you can branch on in your code (e.g. `token_not_found`).
  - `details` `object[]`: A list of specific problems, when the error is about your request (e.g. invalid fields).
    - `message` `string` _(required)_: A specific thing that went wrong, in plain language (e.g. why a field failed validation).
    - `path` `string | number[]`: Where the problem is, as a path into your request (e.g. `["query", "limit"]`). Present for validation errors.
  - `message` `string` _(required)_: A human-readable explanation of what went wrong.
- `requestId` `string` _(required)_: The id of this request — include it when contacting support.

#### `404`: No visible route deposit address exists for the identifier.

Body (`application/json`):

- `error` `object` _(required)_: What went wrong.
  - `code` `string` _(required)_: A short, stable code you can branch on in your code (e.g. `token_not_found`).
  - `details` `object[]`: A list of specific problems, when the error is about your request (e.g. invalid fields).
    - `message` `string` _(required)_: A specific thing that went wrong, in plain language (e.g. why a field failed validation).
    - `path` `string | number[]`: Where the problem is, as a path into your request (e.g. `["query", "limit"]`). Present for validation errors.
  - `message` `string` _(required)_: A human-readable explanation of what went wrong.
- `requestId` `string` _(required)_: The id of this request — include it when contacting support.

#### `409`: The route deposit address is not active.

Body (`application/json`):

- `error` `object` _(required)_: What went wrong.
  - `code` `string` _(required)_: A short, stable code you can branch on in your code (e.g. `token_not_found`).
  - `details` `object[]`: A list of specific problems, when the error is about your request (e.g. invalid fields).
    - `message` `string` _(required)_: A specific thing that went wrong, in plain language (e.g. why a field failed validation).
    - `path` `string | number[]`: Where the problem is, as a path into your request (e.g. `["query", "limit"]`). Present for validation errors.
  - `message` `string` _(required)_: A human-readable explanation of what went wrong.
- `requestId` `string` _(required)_: The id of this request — include it when contacting support.

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

#### `501`: Manual routes reconciliation is not configured.

Body (`application/json`):

- `error` `object` _(required)_: What went wrong.
  - `code` `string` _(required)_: A short, stable code you can branch on in your code (e.g. `token_not_found`).
  - `details` `object[]`: A list of specific problems, when the error is about your request (e.g. invalid fields).
    - `message` `string` _(required)_: A specific thing that went wrong, in plain language (e.g. why a field failed validation).
    - `path` `string | number[]`: Where the problem is, as a path into your request (e.g. `["query", "limit"]`). Present for validation errors.
  - `message` `string` _(required)_: A human-readable explanation of what went wrong.
- `requestId` `string` _(required)_: The id of this request — include it when contacting support.

#### `502`: Reconciliation could not be queued.

Body (`application/json`):

- `error` `object` _(required)_: What went wrong.
  - `code` `string` _(required)_: A short, stable code you can branch on in your code (e.g. `token_not_found`).
  - `details` `object[]`: A list of specific problems, when the error is about your request (e.g. invalid fields).
    - `message` `string` _(required)_: A specific thing that went wrong, in plain language (e.g. why a field failed validation).
    - `path` `string | number[]`: Where the problem is, as a path into your request (e.g. `["query", "limit"]`). Present for validation errors.
  - `message` `string` _(required)_: A human-readable explanation of what went wrong.
- `requestId` `string` _(required)_: The id of this request — include it when contacting support.

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
curl https://api.tempo.xyz/v1/routes/deposit-addresses/rda_001785792000000_2ZPE2gvateYEQ0dQslgvkhjx/reconcile \
  --request POST
```

```ts
fetch('https://api.tempo.xyz/v1/routes/deposit-addresses/rda_001785792000000_2ZPE2gvateYEQ0dQslgvkhjx/reconcile', {
  method: 'POST'
})
```

## Get deposit address

`GET /v1/routes/deposit-addresses/{id}`

Returns one reusable route deposit address.

### Path parameters

- `id` `string` _(required)_: Route deposit address ID (`rda_…`).

### Responses

#### `200`: The requested route deposit address.

Headers:

- `RateLimit-Limit` `integer`: How many requests you may make in the current time window. Not sent on cached responses or `402` payment challenges.
- `RateLimit-Remaining` `integer`: How many requests you have left in the current window before you are rate-limited. Not sent on cached responses or `402` payment challenges.
- `RateLimit-Reset` `integer`: When the current window resets, as a Unix timestamp in seconds. Not sent on cached responses or `402` payment challenges.
- `RateLimit-Scope` `string`: Which quota this request counted against (e.g. `data:read`). Not sent on cached responses or `402` payment challenges.
- `tempo-request-id` `string`: A unique id for this request, returned on every response (and as `requestId` in error bodies). Include it when contacting support so we can find your request.

Body (`application/json`):

- `address` `string` _(required)_: Reusable source-chain deposit address.
- `createdAt` `string <date-time>` _(required)_: When the deposit address was created (ISO 8601).
- `destinationChain` `object` _(required)_: A normalized chain reference for route quotes.
  - `addressFormat` `string` _(required)_: Address encoding used by accounts and token identifiers on this chain.
  - `id` `string` _(required)_: CAIP-2 chain id.
  - `kind` `string` _(required)_: Chain execution family used for provider routing.
  - `name` `string` _(required)_: Human-readable chain name.
- `destinationToken` `object` _(required)_: A normalized token reference for route quotes.
  - `address` `string` _(required)_: Contract address, mint, or issuer address on the token chain.
  - `currency` `string` _(required)_: Monetary denomination represented by this token.
  - `decimals` `integer` _(required)_: Number of decimal places this token uses.
  - `name` `string` _(required)_: Human-readable token name.
  - `standard` `string` _(required)_: Token standard on the token chain.
  - `symbol` `string` _(required)_: Short token ticker symbol.
  - `tokenKey` `string` _(required)_: Stable Tempo token key scoped to the token chain.
  - `verified` `boolean` _(required)_: Whether Tempo recognizes this token in its route quote inventory.
- `id` `string` _(required)_: Route deposit address id (`rda_…`, or legacy `fda_…`).
- `provider` `object` _(required)_: Provider metadata embedded in a route quote.
  - `id` `string` _(required)_: Stable provider id.
  - `name` `string` _(required)_: Human-readable provider name.
- `recipient` `string` _(required)_: Tempo account that receives completed deposits.
- `refundAddress` `string` _(required)_: Source-chain address that receives refunds.
- `sourceChain` `object` _(required)_: A normalized chain reference for route quotes.
  - `addressFormat` `string` _(required)_: Address encoding used by accounts and token identifiers on this chain.
  - `id` `string` _(required)_: CAIP-2 chain id.
  - `kind` `string` _(required)_: Chain execution family used for provider routing.
  - `name` `string` _(required)_: Human-readable chain name.
- `sourceToken` `object` _(required)_: A normalized token reference for route quotes.
  - `address` `string` _(required)_: Contract address, mint, or issuer address on the token chain.
  - `currency` `string` _(required)_: Monetary denomination represented by this token.
  - `decimals` `integer` _(required)_: Number of decimal places this token uses.
  - `name` `string` _(required)_: Human-readable token name.
  - `standard` `string` _(required)_: Token standard on the token chain.
  - `symbol` `string` _(required)_: Short token ticker symbol.
  - `tokenKey` `string` _(required)_: Stable Tempo token key scoped to the token chain.
  - `verified` `boolean` _(required)_: Whether Tempo recognizes this token in its route quote inventory.
- `status` `string` _(required)_: Whether the address can safely process new deposits.
- `subsidize` `boolean` _(required)_: Whether Tempo guarantees normalized 1:1 delivery.
- `updatedAt` `string <date-time>` _(required)_: When the deposit address last materially changed (ISO 8601).

#### `400`: Invalid request.

Body (`application/json`):

- `error` `object` _(required)_: What went wrong.
  - `code` `string` _(required)_: A short, stable code you can branch on in your code (e.g. `token_not_found`).
  - `details` `object[]`: A list of specific problems, when the error is about your request (e.g. invalid fields).
    - `message` `string` _(required)_: A specific thing that went wrong, in plain language (e.g. why a field failed validation).
    - `path` `string | number[]`: Where the problem is, as a path into your request (e.g. `["query", "limit"]`). Present for validation errors.
  - `message` `string` _(required)_: A human-readable explanation of what went wrong.
- `requestId` `string` _(required)_: The id of this request — include it when contacting support.

#### `401`: Missing or invalid API key.

Body (`application/json`):

- `error` `object` _(required)_: What went wrong.
  - `code` `string` _(required)_: A short, stable code you can branch on in your code (e.g. `token_not_found`).
  - `details` `object[]`: A list of specific problems, when the error is about your request (e.g. invalid fields).
    - `message` `string` _(required)_: A specific thing that went wrong, in plain language (e.g. why a field failed validation).
    - `path` `string | number[]`: Where the problem is, as a path into your request (e.g. `["query", "limit"]`). Present for validation errors.
  - `message` `string` _(required)_: A human-readable explanation of what went wrong.
- `requestId` `string` _(required)_: The id of this request — include it when contacting support.

#### `403`: Forbidden.

Body (`application/json`):

- `error` `object` _(required)_: What went wrong.
  - `code` `string` _(required)_: A short, stable code you can branch on in your code (e.g. `token_not_found`).
  - `details` `object[]`: A list of specific problems, when the error is about your request (e.g. invalid fields).
    - `message` `string` _(required)_: A specific thing that went wrong, in plain language (e.g. why a field failed validation).
    - `path` `string | number[]`: Where the problem is, as a path into your request (e.g. `["query", "limit"]`). Present for validation errors.
  - `message` `string` _(required)_: A human-readable explanation of what went wrong.
- `requestId` `string` _(required)_: The id of this request — include it when contacting support.

#### `404`: No visible route deposit address exists for the identifier.

Body (`application/json`):

- `error` `object` _(required)_: What went wrong.
  - `code` `string` _(required)_: A short, stable code you can branch on in your code (e.g. `token_not_found`).
  - `details` `object[]`: A list of specific problems, when the error is about your request (e.g. invalid fields).
    - `message` `string` _(required)_: A specific thing that went wrong, in plain language (e.g. why a field failed validation).
    - `path` `string | number[]`: Where the problem is, as a path into your request (e.g. `["query", "limit"]`). Present for validation errors.
  - `message` `string` _(required)_: A human-readable explanation of what went wrong.
- `requestId` `string` _(required)_: The id of this request — include it when contacting support.

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

#### `502`: Upstream data failure.

Body (`application/json`):

- `error` `object` _(required)_: What went wrong.
  - `code` `string` _(required)_: A short, stable code you can branch on in your code (e.g. `token_not_found`).
  - `details` `object[]`: A list of specific problems, when the error is about your request (e.g. invalid fields).
    - `message` `string` _(required)_: A specific thing that went wrong, in plain language (e.g. why a field failed validation).
    - `path` `string | number[]`: Where the problem is, as a path into your request (e.g. `["query", "limit"]`). Present for validation errors.
  - `message` `string` _(required)_: A human-readable explanation of what went wrong.
- `requestId` `string` _(required)_: The id of this request — include it when contacting support.

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
curl https://api.tempo.xyz/v1/routes/deposit-addresses/rda_001785792000000_2ZPE2gvateYEQ0dQslgvkhjx
```

```ts
fetch('https://api.tempo.xyz/v1/routes/deposit-addresses/rda_001785792000000_2ZPE2gvateYEQ0dQslgvkhjx')
```

## Get deposit

`GET /v1/routes/deposits/{id}`

Returns one detected deposit and its delivery status.

### Path parameters

- `id` `string` _(required)_: Route deposit id (`rdp_…`).

### Responses

#### `200`: The requested route deposit.

Headers:

- `RateLimit-Limit` `integer`: How many requests you may make in the current time window. Not sent on cached responses or `402` payment challenges.
- `RateLimit-Remaining` `integer`: How many requests you have left in the current window before you are rate-limited. Not sent on cached responses or `402` payment challenges.
- `RateLimit-Reset` `integer`: When the current window resets, as a Unix timestamp in seconds. Not sent on cached responses or `402` payment challenges.
- `RateLimit-Scope` `string`: Which quota this request counted against (e.g. `data:read`). Not sent on cached responses or `402` payment challenges.
- `tempo-request-id` `string`: A unique id for this request, returned on every response (and as `requestId` in error bodies). Include it when contacting support so we can find your request.

Body (`application/json`):

- `createdAt` `string <date-time>` _(required)_: When the deposit was first detected (ISO 8601).
- `depositAddressId` `string` _(required)_: Route deposit address that detected the transfer, including legacy IDs.
- `detectionTrigger` `string`: How the deposit was first detected.
- `destinationAmount` `object`: A token quantity with its denomination and decimal representation.
  - `baseUnits` `string` _(required)_: The quantity in the token's smallest unit.
  - `currency` `string` _(required)_: The monetary denomination of this quantity.
  - `decimals` `integer` _(required)_: Decimal places used to convert `baseUnits` into `formatted`.
  - `formatted` `string` _(required)_: The quantity rendered in whole token units.
- `destinationAmountRequired` `object`: Destination amount required for completion, when known.
  - `baseUnits` `string` _(required)_: The quantity in the token's smallest unit.
  - `currency` `string` _(required)_: The monetary denomination of this quantity.
  - `decimals` `integer` _(required)_: Decimal places used to convert `baseUnits` into `formatted`.
  - `formatted` `string` _(required)_: The quantity rendered in whole token units.
- `destinationChain` `object` _(required)_: A normalized chain reference for route quotes.
  - `addressFormat` `string` _(required)_: Address encoding used by accounts and token identifiers on this chain.
  - `id` `string` _(required)_: CAIP-2 chain id.
  - `kind` `string` _(required)_: Chain execution family used for provider routing.
  - `name` `string` _(required)_: Human-readable chain name.
- `destinationToken` `object` _(required)_: A normalized token reference for route quotes.
  - `address` `string` _(required)_: Contract address, mint, or issuer address on the token chain.
  - `currency` `string` _(required)_: Monetary denomination represented by this token.
  - `decimals` `integer` _(required)_: Number of decimal places this token uses.
  - `name` `string` _(required)_: Human-readable token name.
  - `standard` `string` _(required)_: Token standard on the token chain.
  - `symbol` `string` _(required)_: Short token ticker symbol.
  - `tokenKey` `string` _(required)_: Stable Tempo token key scoped to the token chain.
  - `verified` `boolean` _(required)_: Whether Tempo recognizes this token in its route quote inventory.
- `destinationTransactionHashes` `string[]`: Verified destination transaction references.
- `id` `string` _(required)_: Route deposit id (`rdp_…`, or legacy `fdp_…`).
- `provider` `object` _(required)_: Provider metadata embedded in a route quote.
  - `id` `string` _(required)_: Stable provider id.
  - `name` `string` _(required)_: Human-readable provider name.
- `recipient` `string` _(required)_: Tempo account that receives the completed deposit.
- `refundAddress` `string` _(required)_: Source-chain address that receives a refund.
- `refundAmount` `object`: A token quantity with its denomination and decimal representation.
  - `baseUnits` `string` _(required)_: The quantity in the token's smallest unit.
  - `currency` `string` _(required)_: The monetary denomination of this quantity.
  - `decimals` `integer` _(required)_: Decimal places used to convert `baseUnits` into `formatted`.
  - `formatted` `string` _(required)_: The quantity rendered in whole token units.
- `refundTransactionHashes` `string[]`: Verified source-chain refund transaction references.
- `sender` `string`: Observed source-chain sender, when available.
- `sourceAmount` `object`: Verified source amount, when source evidence is available.
  - `baseUnits` `string` _(required)_: The quantity in the token's smallest unit.
  - `currency` `string` _(required)_: The monetary denomination of this quantity.
  - `decimals` `integer` _(required)_: Decimal places used to convert `baseUnits` into `formatted`.
  - `formatted` `string` _(required)_: The quantity rendered in whole token units.
- `sourceChain` `object` _(required)_: A normalized chain reference for route quotes.
  - `addressFormat` `string` _(required)_: Address encoding used by accounts and token identifiers on this chain.
  - `id` `string` _(required)_: CAIP-2 chain id.
  - `kind` `string` _(required)_: Chain execution family used for provider routing.
  - `name` `string` _(required)_: Human-readable chain name.
- `sourceToken` `object` _(required)_: A normalized token reference for route quotes.
  - `address` `string` _(required)_: Contract address, mint, or issuer address on the token chain.
  - `currency` `string` _(required)_: Monetary denomination represented by this token.
  - `decimals` `integer` _(required)_: Number of decimal places this token uses.
  - `name` `string` _(required)_: Human-readable token name.
  - `standard` `string` _(required)_: Token standard on the token chain.
  - `symbol` `string` _(required)_: Short token ticker symbol.
  - `tokenKey` `string` _(required)_: Stable Tempo token key scoped to the token chain.
  - `verified` `boolean` _(required)_: Whether Tempo recognizes this token in its route quote inventory.
- `sourceTransactionHashes` `string[]` _(required)_: Provider-observed source transaction references.
- `sourceTransferIndex` `integer`: Verified transfer position within the source transaction.
- `status` `string` _(required)_: Current delivery status of the deposit.
- `statusReason` `object`: Why a deposit needs attention or recovery.
  - `code` `string` _(required)_: Stable machine-readable reason code.
  - `message` `string` _(required)_: Human-readable explanation of the current status.
- `updatedAt` `string <date-time>` _(required)_: When the deposit last materially changed (ISO 8601).

#### `400`: Invalid request.

Body (`application/json`):

- `error` `object` _(required)_: What went wrong.
  - `code` `string` _(required)_: A short, stable code you can branch on in your code (e.g. `token_not_found`).
  - `details` `object[]`: A list of specific problems, when the error is about your request (e.g. invalid fields).
    - `message` `string` _(required)_: A specific thing that went wrong, in plain language (e.g. why a field failed validation).
    - `path` `string | number[]`: Where the problem is, as a path into your request (e.g. `["query", "limit"]`). Present for validation errors.
  - `message` `string` _(required)_: A human-readable explanation of what went wrong.
- `requestId` `string` _(required)_: The id of this request — include it when contacting support.

#### `401`: Missing or invalid API key.

Body (`application/json`):

- `error` `object` _(required)_: What went wrong.
  - `code` `string` _(required)_: A short, stable code you can branch on in your code (e.g. `token_not_found`).
  - `details` `object[]`: A list of specific problems, when the error is about your request (e.g. invalid fields).
    - `message` `string` _(required)_: A specific thing that went wrong, in plain language (e.g. why a field failed validation).
    - `path` `string | number[]`: Where the problem is, as a path into your request (e.g. `["query", "limit"]`). Present for validation errors.
  - `message` `string` _(required)_: A human-readable explanation of what went wrong.
- `requestId` `string` _(required)_: The id of this request — include it when contacting support.

#### `403`: Forbidden.

Body (`application/json`):

- `error` `object` _(required)_: What went wrong.
  - `code` `string` _(required)_: A short, stable code you can branch on in your code (e.g. `token_not_found`).
  - `details` `object[]`: A list of specific problems, when the error is about your request (e.g. invalid fields).
    - `message` `string` _(required)_: A specific thing that went wrong, in plain language (e.g. why a field failed validation).
    - `path` `string | number[]`: Where the problem is, as a path into your request (e.g. `["query", "limit"]`). Present for validation errors.
  - `message` `string` _(required)_: A human-readable explanation of what went wrong.
- `requestId` `string` _(required)_: The id of this request — include it when contacting support.

#### `404`: No visible route deposit exists for the identifier.

Body (`application/json`):

- `error` `object` _(required)_: What went wrong.
  - `code` `string` _(required)_: A short, stable code you can branch on in your code (e.g. `token_not_found`).
  - `details` `object[]`: A list of specific problems, when the error is about your request (e.g. invalid fields).
    - `message` `string` _(required)_: A specific thing that went wrong, in plain language (e.g. why a field failed validation).
    - `path` `string | number[]`: Where the problem is, as a path into your request (e.g. `["query", "limit"]`). Present for validation errors.
  - `message` `string` _(required)_: A human-readable explanation of what went wrong.
- `requestId` `string` _(required)_: The id of this request — include it when contacting support.

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

#### `502`: Upstream data failure.

Body (`application/json`):

- `error` `object` _(required)_: What went wrong.
  - `code` `string` _(required)_: A short, stable code you can branch on in your code (e.g. `token_not_found`).
  - `details` `object[]`: A list of specific problems, when the error is about your request (e.g. invalid fields).
    - `message` `string` _(required)_: A specific thing that went wrong, in plain language (e.g. why a field failed validation).
    - `path` `string | number[]`: Where the problem is, as a path into your request (e.g. `["query", "limit"]`). Present for validation errors.
  - `message` `string` _(required)_: A human-readable explanation of what went wrong.
- `requestId` `string` _(required)_: The id of this request — include it when contacting support.

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
curl https://api.tempo.xyz/v1/routes/deposits/rdp_001785792060000_2ZPE2gvateYEQ0dQslgvkhjx
```

```ts
fetch('https://api.tempo.xyz/v1/routes/deposits/rdp_001785792060000_2ZPE2gvateYEQ0dQslgvkhjx')
```

## List deposits

`GET /v1/routes/deposits`

Lists visible deposits, optionally filtered, newest first.

### Query parameters

- `depositAddress` `string`: Reusable source-chain deposit address that received the funds.
- `cursor` `string`: Opaque keyset cursor from a previous response (`nextCursor`); pass it back verbatim to fetch the next page. Omit for the first (head) page.
- `destinationToken` `string`: Destination token symbol, contract address, or token key.
- `include` `string[]`: Comma-separated optional resources to embed, e.g. `totalCount`.
- `limit` `integer`: How many items to return per page (5–50, default 10). Use `nextCursor` to fetch more.
- `provider` `string`: Route provider id.
- `recipient` `string`: Tempo account that received the deposits.
- `sourceChain` `string`: Source chain CAIP-2 id, slug, or alias.
- `sourceToken` `string`: Source token symbol, contract address, or token key.
- `status` `string`: Current delivery status of the deposit.

### Responses

#### `200`: A page of visible route deposits.

Headers:

- `RateLimit-Limit` `integer`: How many requests you may make in the current time window. Not sent on cached responses or `402` payment challenges.
- `RateLimit-Remaining` `integer`: How many requests you have left in the current window before you are rate-limited. Not sent on cached responses or `402` payment challenges.
- `RateLimit-Reset` `integer`: When the current window resets, as a Unix timestamp in seconds. Not sent on cached responses or `402` payment challenges.
- `RateLimit-Scope` `string`: Which quota this request counted against (e.g. `data:read`). Not sent on cached responses or `402` payment challenges.
- `tempo-request-id` `string`: A unique id for this request, returned on every response (and as `requestId` in error bodies). Include it when contacting support so we can find your request.

Body (`application/json`):

- `data` `object[]` _(required)_: Detected deposits on this page, newest first.
  - `createdAt` `string <date-time>` _(required)_: When the deposit was first detected (ISO 8601).
  - `depositAddressId` `string` _(required)_: Route deposit address that detected the transfer, including legacy IDs.
  - `detectionTrigger` `string`: How the deposit was first detected.
  - `destinationAmount` `object`: A token quantity with its denomination and decimal representation.
    - `baseUnits` `string` _(required)_: The quantity in the token's smallest unit.
    - `currency` `string` _(required)_: The monetary denomination of this quantity.
    - `decimals` `integer` _(required)_: Decimal places used to convert `baseUnits` into `formatted`.
    - `formatted` `string` _(required)_: The quantity rendered in whole token units.
  - `destinationAmountRequired` `object`: Destination amount required for completion, when known.
    - `baseUnits` `string` _(required)_: The quantity in the token's smallest unit.
    - `currency` `string` _(required)_: The monetary denomination of this quantity.
    - `decimals` `integer` _(required)_: Decimal places used to convert `baseUnits` into `formatted`.
    - `formatted` `string` _(required)_: The quantity rendered in whole token units.
  - `destinationChain` `object` _(required)_: A normalized chain reference for route quotes.
    - `addressFormat` `string` _(required)_: Address encoding used by accounts and token identifiers on this chain.
    - `id` `string` _(required)_: CAIP-2 chain id.
    - `kind` `string` _(required)_: Chain execution family used for provider routing.
    - `name` `string` _(required)_: Human-readable chain name.
  - `destinationToken` `object` _(required)_: A normalized token reference for route quotes.
    - `address` `string` _(required)_: Contract address, mint, or issuer address on the token chain.
    - `currency` `string` _(required)_: Monetary denomination represented by this token.
    - `decimals` `integer` _(required)_: Number of decimal places this token uses.
    - `name` `string` _(required)_: Human-readable token name.
    - `standard` `string` _(required)_: Token standard on the token chain.
    - `symbol` `string` _(required)_: Short token ticker symbol.
    - `tokenKey` `string` _(required)_: Stable Tempo token key scoped to the token chain.
    - `verified` `boolean` _(required)_: Whether Tempo recognizes this token in its route quote inventory.
  - `destinationTransactionHashes` `string[]`: Verified destination transaction references.
  - `id` `string` _(required)_: Route deposit id (`rdp_…`, or legacy `fdp_…`).
  - `provider` `object` _(required)_: Provider metadata embedded in a route quote.
    - `id` `string` _(required)_: Stable provider id.
    - `name` `string` _(required)_: Human-readable provider name.
  - `recipient` `string` _(required)_: Tempo account that receives the completed deposit.
  - `refundAddress` `string` _(required)_: Source-chain address that receives a refund.
  - `refundAmount` `object`: A token quantity with its denomination and decimal representation.
    - `baseUnits` `string` _(required)_: The quantity in the token's smallest unit.
    - `currency` `string` _(required)_: The monetary denomination of this quantity.
    - `decimals` `integer` _(required)_: Decimal places used to convert `baseUnits` into `formatted`.
    - `formatted` `string` _(required)_: The quantity rendered in whole token units.
  - `refundTransactionHashes` `string[]`: Verified source-chain refund transaction references.
  - `sender` `string`: Observed source-chain sender, when available.
  - `sourceAmount` `object`: Verified source amount, when source evidence is available.
    - `baseUnits` `string` _(required)_: The quantity in the token's smallest unit.
    - `currency` `string` _(required)_: The monetary denomination of this quantity.
    - `decimals` `integer` _(required)_: Decimal places used to convert `baseUnits` into `formatted`.
    - `formatted` `string` _(required)_: The quantity rendered in whole token units.
  - `sourceChain` `object` _(required)_: A normalized chain reference for route quotes.
    - `addressFormat` `string` _(required)_: Address encoding used by accounts and token identifiers on this chain.
    - `id` `string` _(required)_: CAIP-2 chain id.
    - `kind` `string` _(required)_: Chain execution family used for provider routing.
    - `name` `string` _(required)_: Human-readable chain name.
  - `sourceToken` `object` _(required)_: A normalized token reference for route quotes.
    - `address` `string` _(required)_: Contract address, mint, or issuer address on the token chain.
    - `currency` `string` _(required)_: Monetary denomination represented by this token.
    - `decimals` `integer` _(required)_: Number of decimal places this token uses.
    - `name` `string` _(required)_: Human-readable token name.
    - `standard` `string` _(required)_: Token standard on the token chain.
    - `symbol` `string` _(required)_: Short token ticker symbol.
    - `tokenKey` `string` _(required)_: Stable Tempo token key scoped to the token chain.
    - `verified` `boolean` _(required)_: Whether Tempo recognizes this token in its route quote inventory.
  - `sourceTransactionHashes` `string[]` _(required)_: Provider-observed source transaction references.
  - `sourceTransferIndex` `integer`: Verified transfer position within the source transaction.
  - `status` `string` _(required)_: Current delivery status of the deposit.
  - `statusReason` `object`: Why a deposit needs attention or recovery.
    - `code` `string` _(required)_: Stable machine-readable reason code.
    - `message` `string` _(required)_: Human-readable explanation of the current status.
  - `updatedAt` `string <date-time>` _(required)_: When the deposit last materially changed (ISO 8601).
- `meta` `object`: Extra response metadata requested with `include`.
  - `totalCountCapped` `boolean` _(required)_: Whether `totalCount` hit the count cap. When true, `totalCount` is a lower bound rather than an exact total.
  - `totalCount` `integer` _(required)_: Number of rows matching the query, exact when `totalCountCapped` is false and a lower bound (at least this many, computed up to 10000) when `totalCountCapped` is true. Independent of pagination: use `nextCursor` to page, not this count.
- `nextCursor` `string` _(required)_: Pass this back as the `cursor` query parameter to fetch the next page. `null` once you have reached the end of the list.

#### `400`: Invalid request.

Body (`application/json`):

- `error` `object` _(required)_: What went wrong.
  - `code` `string` _(required)_: A short, stable code you can branch on in your code (e.g. `token_not_found`).
  - `details` `object[]`: A list of specific problems, when the error is about your request (e.g. invalid fields).
    - `message` `string` _(required)_: A specific thing that went wrong, in plain language (e.g. why a field failed validation).
    - `path` `string | number[]`: Where the problem is, as a path into your request (e.g. `["query", "limit"]`). Present for validation errors.
  - `message` `string` _(required)_: A human-readable explanation of what went wrong.
- `requestId` `string` _(required)_: The id of this request — include it when contacting support.

#### `401`: Missing or invalid API key.

Body (`application/json`):

- `error` `object` _(required)_: What went wrong.
  - `code` `string` _(required)_: A short, stable code you can branch on in your code (e.g. `token_not_found`).
  - `details` `object[]`: A list of specific problems, when the error is about your request (e.g. invalid fields).
    - `message` `string` _(required)_: A specific thing that went wrong, in plain language (e.g. why a field failed validation).
    - `path` `string | number[]`: Where the problem is, as a path into your request (e.g. `["query", "limit"]`). Present for validation errors.
  - `message` `string` _(required)_: A human-readable explanation of what went wrong.
- `requestId` `string` _(required)_: The id of this request — include it when contacting support.

#### `403`: Forbidden.

Body (`application/json`):

- `error` `object` _(required)_: What went wrong.
  - `code` `string` _(required)_: A short, stable code you can branch on in your code (e.g. `token_not_found`).
  - `details` `object[]`: A list of specific problems, when the error is about your request (e.g. invalid fields).
    - `message` `string` _(required)_: A specific thing that went wrong, in plain language (e.g. why a field failed validation).
    - `path` `string | number[]`: Where the problem is, as a path into your request (e.g. `["query", "limit"]`). Present for validation errors.
  - `message` `string` _(required)_: A human-readable explanation of what went wrong.
- `requestId` `string` _(required)_: The id of this request — include it when contacting support.

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

#### `502`: Upstream data failure.

Body (`application/json`):

- `error` `object` _(required)_: What went wrong.
  - `code` `string` _(required)_: A short, stable code you can branch on in your code (e.g. `token_not_found`).
  - `details` `object[]`: A list of specific problems, when the error is about your request (e.g. invalid fields).
    - `message` `string` _(required)_: A specific thing that went wrong, in plain language (e.g. why a field failed validation).
    - `path` `string | number[]`: Where the problem is, as a path into your request (e.g. `["query", "limit"]`). Present for validation errors.
  - `message` `string` _(required)_: A human-readable explanation of what went wrong.
- `requestId` `string` _(required)_: The id of this request — include it when contacting support.

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
curl 'https://api.tempo.xyz/v1/routes/deposits?depositAddress=TJRabPrwbZy45sbavfcjinPJC18kjpRTv8&cursor=WzIzNDU2Nzg5LDBd&destinationToken=usdt0&include=totalCount&limit=10&provider=relay&recipient=0xbe058e1c4df8a4366a387bf595b284246a93039e&sourceChain=tron&sourceToken=usdt&status=detected'
```

```ts
fetch('https://api.tempo.xyz/v1/routes/deposits?depositAddress=TJRabPrwbZy45sbavfcjinPJC18kjpRTv8&cursor=WzIzNDU2Nzg5LDBd&destinationToken=usdt0&include=totalCount&limit=10&provider=relay&recipient=0xbe058e1c4df8a4366a387bf595b284246a93039e&sourceChain=tron&sourceToken=usdt&status=detected')
```
