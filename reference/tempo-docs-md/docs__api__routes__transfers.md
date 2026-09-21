# Transfers

Transfers routed between supported chains.

## Register source transaction

`POST /v1/routes/transfers/{id}/source-transactions`

Registers verified source transactions once per organization, environment, and project.

### Path parameters

- `id` `string` _(required)_: Route transfer ID (`rtr_…`).

### Request body (required) (`application/json`)

### Responses

#### `200`: The transfer with its verified source transactions.

Headers:

- `RateLimit-Limit` `integer`: How many requests you may make in the current time window. Not sent on cached responses or `402` payment challenges.
- `RateLimit-Remaining` `integer`: How many requests you have left in the current window before you are rate-limited. Not sent on cached responses or `402` payment challenges.
- `RateLimit-Reset` `integer`: When the current window resets, as a Unix timestamp in seconds. Not sent on cached responses or `402` payment challenges.
- `RateLimit-Scope` `string`: Which quota this request counted against (e.g. `data:read`). Not sent on cached responses or `402` payment challenges.
- `tempo-request-id` `string`: A unique id for this request, returned on every response (and as `requestId` in error bodies). Include it when contacting support so we can find your request.

Body (`application/json`):

- `createdAt` `string <date-time>` _(required)_: When the transfer was created (ISO 8601).
- `destinationAmount` `object`: Expected amount received after provider deductions, including pool fees.
  - `baseUnits` `string` _(required)_: The quantity in the token's smallest unit.
  - `currency` `string` _(required)_: The monetary denomination of this quantity.
  - `decimals` `integer` _(required)_: Decimal places used to convert `baseUnits` into `formatted`.
  - `formatted` `string` _(required)_: The quantity rendered in whole token units.
- `destinationAmountMin` `object`: Minimum destination amount encoded in the transfer action.
  - `baseUnits` `string` _(required)_: The quantity in the token's smallest unit.
  - `currency` `string` _(required)_: The monetary denomination of this quantity.
  - `decimals` `integer` _(required)_: Decimal places used to convert `baseUnits` into `formatted`.
  - `formatted` `string` _(required)_: The quantity rendered in whole token units.
- `destinationAmountRequired` `object`: Destination amount required for normalized 1:1 delivery, when enabled.
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
- `fees` `object[]` _(required)_: Explicit fees charged separately from the routed amount; deductions reflected in `destinationAmount` are omitted.
  - `amount` `object` _(required)_: A token quantity with its denomination and decimal representation.
    - `baseUnits` `string` _(required)_: The quantity in the token's smallest unit.
    - `currency` `string` _(required)_: The monetary denomination of this quantity.
    - `decimals` `integer` _(required)_: Decimal places used to convert `baseUnits` into `formatted`.
    - `formatted` `string` _(required)_: The quantity rendered in whole token units.
  - `side` `string` _(required)_: Which side of the transfer the fee is taken from.
  - `token` `object` _(required)_: A normalized token reference for route quotes.
    - `address` `string` _(required)_: Contract address, mint, or issuer address on the token chain.
    - `currency` `string` _(required)_: Monetary denomination represented by this token.
    - `decimals` `integer` _(required)_: Number of decimal places this token uses.
    - `name` `string` _(required)_: Human-readable token name.
    - `standard` `string` _(required)_: Token standard on the token chain.
    - `symbol` `string` _(required)_: Short token ticker symbol.
    - `tokenKey` `string` _(required)_: Stable Tempo token key scoped to the token chain.
    - `verified` `boolean` _(required)_: Whether Tempo recognizes this token in its route quote inventory.
  - `type` `string` _(required)_: What the fee pays for.
- `id` `string` _(required)_: Route transfer id (`rtr_…`, lexically time-ordered).
- `method` `string` _(required)_: How the caller funds the transfer.
- `mode` `string` _(required)_: Which side of the transfer the quoted amount fixes.
- `provider` `object` _(required)_: Provider metadata embedded in a route quote.
  - `id` `string` _(required)_: Stable provider id.
  - `name` `string` _(required)_: Human-readable provider name.
- `quote` `object` _(required)_: Freshness and validity window of the selected quote.
  - `expiresAt` `string <date-time>` _(required)_: When the quoted terms stop being executable (ISO 8601).
  - `sampledAt` `string <date-time>` _(required)_: When the provider produced the quote (ISO 8601).
- `recipient` `string` _(required)_: Final beneficiary of the transfer.
- `refundAddress` `string`: Source-chain refund recipient (deposit-address method).
- `refundAmount` `object`: A token quantity with its denomination and decimal representation.
  - `baseUnits` `string` _(required)_: The quantity in the token's smallest unit.
  - `currency` `string` _(required)_: The monetary denomination of this quantity.
  - `decimals` `integer` _(required)_: Decimal places used to convert `baseUnits` into `formatted`.
  - `formatted` `string` _(required)_: The quantity rendered in whole token units.
- `refundTransactionHashes` `string[]`: Verified refund transaction references.
- `sender` `string`: Source-chain account that signs the route action (transaction method).
- `sourceAmount` `object` _(required)_: A token quantity with its denomination and decimal representation.
  - `baseUnits` `string` _(required)_: The quantity in the token's smallest unit.
  - `currency` `string` _(required)_: The monetary denomination of this quantity.
  - `decimals` `integer` _(required)_: Decimal places used to convert `baseUnits` into `formatted`.
  - `formatted` `string` _(required)_: The quantity rendered in whole token units.
- `sourceAmountMax` `object`: A token quantity with its denomination and decimal representation.
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
- `sourceTransactionHashes` `string[]`: Verified source transaction references.
- `subsidize` `boolean`: Whether Tempo guarantees normalized 1:1 destination delivery.
- `status` `string` _(required)_: Lifecycle status of the route transfer.
- `statusReason` `object`: Why the transfer is in its current status, when context is needed.
  - `code` `string` _(required)_: Stable machine-readable reason code.
  - `message` `string` _(required)_: Human-readable explanation of the reason.
- `updatedAt` `string <date-time>` _(required)_: When the transfer last materially changed (ISO 8601).
- `version` `integer` _(required)_: Monotonic revision that increments whenever the transfer materially changes.

#### `400`: The path, body, or submitted source transaction is invalid.

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

#### `404`: No visible route transfer exists for the identifier.

Body (`application/json`):

- `error` `object` _(required)_: What went wrong.
  - `code` `string` _(required)_: A short, stable code you can branch on in your code (e.g. `token_not_found`).
  - `details` `object[]`: A list of specific problems, when the error is about your request (e.g. invalid fields).
    - `message` `string` _(required)_: A specific thing that went wrong, in plain language (e.g. why a field failed validation).
    - `path` `string | number[]`: Where the problem is, as a path into your request (e.g. `["query", "limit"]`). Present for validation errors.
  - `message` `string` _(required)_: A human-readable explanation of what went wrong.
- `requestId` `string` _(required)_: The id of this request — include it when contacting support.

#### `409`: The transfer or source transaction cannot be registered yet.

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

#### `501`: Source transaction reconciliation is not configured.

Body (`application/json`):

- `error` `object` _(required)_: What went wrong.
  - `code` `string` _(required)_: A short, stable code you can branch on in your code (e.g. `token_not_found`).
  - `details` `object[]`: A list of specific problems, when the error is about your request (e.g. invalid fields).
    - `message` `string` _(required)_: A specific thing that went wrong, in plain language (e.g. why a field failed validation).
    - `path` `string | number[]`: Where the problem is, as a path into your request (e.g. `["query", "limit"]`). Present for validation errors.
  - `message` `string` _(required)_: A human-readable explanation of what went wrong.
- `requestId` `string` _(required)_: The id of this request — include it when contacting support.

#### `502`: Source verification or reconciliation dispatch failed.

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
curl https://api.tempo.xyz/v1/routes/transfers/rtr_001785729600000_2ZPE2gvateYEQ0dQslgvkhjx/source-transactions \
  --request POST \
  --header 'Content-Type: application/json' \
  --data '{
  "transactionHash": "0x5151515151515151515151515151515151515151515151515151515151515151"
}'
```

```ts
fetch('https://api.tempo.xyz/v1/routes/transfers/rtr_001785729600000_2ZPE2gvateYEQ0dQslgvkhjx/source-transactions', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    transactionHash: '0x5151515151515151515151515151515151515151515151515151515151515151'
  })
})
```

## List transfers

`GET /v1/routes/transfers`

Lists transfers from newest to oldest.

### Query parameters

- `cursor` `string`: Opaque keyset cursor from a previous response (`nextCursor`); pass it back verbatim to fetch the next page. Omit for the first (head) page.
- `include` `string[]`: Comma-separated optional resources to embed, e.g. `totalCount`.
- `limit` `integer`: How many items to return per page (5–50, default 10). Use `nextCursor` to fetch more.
- `status` `string`: Lifecycle status of the route transfer.

### Responses

#### `200`: A page of route transfers.

Headers:

- `RateLimit-Limit` `integer`: How many requests you may make in the current time window. Not sent on cached responses or `402` payment challenges.
- `RateLimit-Remaining` `integer`: How many requests you have left in the current window before you are rate-limited. Not sent on cached responses or `402` payment challenges.
- `RateLimit-Reset` `integer`: When the current window resets, as a Unix timestamp in seconds. Not sent on cached responses or `402` payment challenges.
- `RateLimit-Scope` `string`: Which quota this request counted against (e.g. `data:read`). Not sent on cached responses or `402` payment challenges.
- `tempo-request-id` `string`: A unique id for this request, returned on every response (and as `requestId` in error bodies). Include it when contacting support so we can find your request.

Body (`application/json`):

- `data` `object[]` _(required)_: Route transfers on this page, newest first.
  - `createdAt` `string <date-time>` _(required)_: When the transfer was created (ISO 8601).
  - `destinationAmount` `object`: Expected amount received after provider deductions, including pool fees.
    - `baseUnits` `string` _(required)_: The quantity in the token's smallest unit.
    - `currency` `string` _(required)_: The monetary denomination of this quantity.
    - `decimals` `integer` _(required)_: Decimal places used to convert `baseUnits` into `formatted`.
    - `formatted` `string` _(required)_: The quantity rendered in whole token units.
  - `destinationAmountMin` `object`: Minimum destination amount encoded in the transfer action.
    - `baseUnits` `string` _(required)_: The quantity in the token's smallest unit.
    - `currency` `string` _(required)_: The monetary denomination of this quantity.
    - `decimals` `integer` _(required)_: Decimal places used to convert `baseUnits` into `formatted`.
    - `formatted` `string` _(required)_: The quantity rendered in whole token units.
  - `destinationAmountRequired` `object`: Destination amount required for normalized 1:1 delivery, when enabled.
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
  - `fees` `object[]` _(required)_: Explicit fees charged separately from the routed amount; deductions reflected in `destinationAmount` are omitted.
    - `amount` `object` _(required)_: A token quantity with its denomination and decimal representation.
      - `baseUnits` `string` _(required)_: The quantity in the token's smallest unit.
      - `currency` `string` _(required)_: The monetary denomination of this quantity.
      - `decimals` `integer` _(required)_: Decimal places used to convert `baseUnits` into `formatted`.
      - `formatted` `string` _(required)_: The quantity rendered in whole token units.
    - `side` `string` _(required)_: Which side of the transfer the fee is taken from.
    - `token` `object` _(required)_: A normalized token reference for route quotes.
      - `address` `string` _(required)_: Contract address, mint, or issuer address on the token chain.
      - `currency` `string` _(required)_: Monetary denomination represented by this token.
      - `decimals` `integer` _(required)_: Number of decimal places this token uses.
      - `name` `string` _(required)_: Human-readable token name.
      - `standard` `string` _(required)_: Token standard on the token chain.
      - `symbol` `string` _(required)_: Short token ticker symbol.
      - `tokenKey` `string` _(required)_: Stable Tempo token key scoped to the token chain.
      - `verified` `boolean` _(required)_: Whether Tempo recognizes this token in its route quote inventory.
    - `type` `string` _(required)_: What the fee pays for.
  - `id` `string` _(required)_: Route transfer id (`rtr_…`, lexically time-ordered).
  - `method` `string` _(required)_: How the caller funds the transfer.
  - `mode` `string` _(required)_: Which side of the transfer the quoted amount fixes.
  - `provider` `object` _(required)_: Provider metadata embedded in a route quote.
    - `id` `string` _(required)_: Stable provider id.
    - `name` `string` _(required)_: Human-readable provider name.
  - `quote` `object` _(required)_: Freshness and validity window of the selected quote.
    - `expiresAt` `string <date-time>` _(required)_: When the quoted terms stop being executable (ISO 8601).
    - `sampledAt` `string <date-time>` _(required)_: When the provider produced the quote (ISO 8601).
  - `recipient` `string` _(required)_: Final beneficiary of the transfer.
  - `refundAddress` `string`: Source-chain refund recipient (deposit-address method).
  - `refundAmount` `object`: A token quantity with its denomination and decimal representation.
    - `baseUnits` `string` _(required)_: The quantity in the token's smallest unit.
    - `currency` `string` _(required)_: The monetary denomination of this quantity.
    - `decimals` `integer` _(required)_: Decimal places used to convert `baseUnits` into `formatted`.
    - `formatted` `string` _(required)_: The quantity rendered in whole token units.
  - `refundTransactionHashes` `string[]`: Verified refund transaction references.
  - `sender` `string`: Source-chain account that signs the route action (transaction method).
  - `sourceAmount` `object` _(required)_: A token quantity with its denomination and decimal representation.
    - `baseUnits` `string` _(required)_: The quantity in the token's smallest unit.
    - `currency` `string` _(required)_: The monetary denomination of this quantity.
    - `decimals` `integer` _(required)_: Decimal places used to convert `baseUnits` into `formatted`.
    - `formatted` `string` _(required)_: The quantity rendered in whole token units.
  - `sourceAmountMax` `object`: A token quantity with its denomination and decimal representation.
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
  - `sourceTransactionHashes` `string[]`: Verified source transaction references.
  - `subsidize` `boolean`: Whether Tempo guarantees normalized 1:1 destination delivery.
  - `status` `string` _(required)_: Lifecycle status of the route transfer.
  - `statusReason` `object`: Why the transfer is in its current status, when context is needed.
    - `code` `string` _(required)_: Stable machine-readable reason code.
    - `message` `string` _(required)_: Human-readable explanation of the reason.
  - `updatedAt` `string <date-time>` _(required)_: When the transfer last materially changed (ISO 8601).
  - `version` `integer` _(required)_: Monotonic revision that increments whenever the transfer materially changes.
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
curl 'https://api.tempo.xyz/v1/routes/transfers?cursor=WzIzNDU2Nzg5LDBd&include=totalCount&limit=10&status=awaiting-source'
```

```ts
fetch('https://api.tempo.xyz/v1/routes/transfers?cursor=WzIzNDU2Nzg5LDBd&include=totalCount&limit=10&status=awaiting-source')
```

## Create transfer

`POST /v1/routes/transfers`

Creates a durable transfer between supported chains, including optional normalized destination subsidies.

### Header parameters

- `idempotency-key` `string` _(required)_: Opaque retry key scoped to the API key. Matching requests replay successful responses for 24 hours; changed input conflicts, in-flight requests block, and failed attempts release the key.

### Request body (required) (`application/json`)

- `amount` `string` _(required)_: Amount in base units of the token the mode fixes.
- `destinationChain` `string`: Destination chain CAIP-2 id, slug, or alias. Defaults to Tempo.
- `destinationToken` `string` _(required)_: Destination token symbol, contract address, or token key.
- `mode` `string` _(required)_: Which side of the transfer the quoted amount fixes.
- `provider` `string`: Route provider ID. Omit to select the best available provider.
- `recipient` `string` _(required)_: Destination-chain account that receives the transfer.
- `sender` `string` _(required)_: Source-chain account that signs the route action.
- `slippageBps` `integer`: Maximum acceptable slippage in basis points.
- `sourceChain` `string` _(required)_: Source chain CAIP-2 id, slug, or alias.
- `sourceToken` `string` _(required)_: Source token symbol, contract address, or token key.
- `subsidize` `boolean`: Guarantees normalized 1:1 delivery for exact-source Tempo USD transfers to Base or Ethereum. A Tempo Admin must enable subsidies for the organization.

### Responses

#### `200`: The created route transfer with its one-time executable action.

Headers:

- `RateLimit-Limit` `integer`: How many requests you may make in the current time window. Not sent on cached responses or `402` payment challenges.
- `RateLimit-Remaining` `integer`: How many requests you have left in the current window before you are rate-limited. Not sent on cached responses or `402` payment challenges.
- `RateLimit-Reset` `integer`: When the current window resets, as a Unix timestamp in seconds. Not sent on cached responses or `402` payment challenges.
- `RateLimit-Scope` `string`: Which quota this request counted against (e.g. `data:read`). Not sent on cached responses or `402` payment challenges.
- `tempo-request-id` `string`: A unique id for this request, returned on every response (and as `requestId` in error bodies). Include it when contacting support so we can find your request.

Body (`application/json`):

- `action` `object` _(required)_: Executable source-chain action. Never returned by transfer reads.
- `createdAt` `string <date-time>` _(required)_: When the transfer was created (ISO 8601).
- `destinationAmount` `object`: Expected amount received after provider deductions, including pool fees.
  - `baseUnits` `string` _(required)_: The quantity in the token's smallest unit.
  - `currency` `string` _(required)_: The monetary denomination of this quantity.
  - `decimals` `integer` _(required)_: Decimal places used to convert `baseUnits` into `formatted`.
  - `formatted` `string` _(required)_: The quantity rendered in whole token units.
- `destinationAmountMin` `object`: Minimum destination amount encoded in the transfer action.
  - `baseUnits` `string` _(required)_: The quantity in the token's smallest unit.
  - `currency` `string` _(required)_: The monetary denomination of this quantity.
  - `decimals` `integer` _(required)_: Decimal places used to convert `baseUnits` into `formatted`.
  - `formatted` `string` _(required)_: The quantity rendered in whole token units.
- `destinationAmountRequired` `object`: Destination amount required for normalized 1:1 delivery, when enabled.
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
- `fees` `object[]` _(required)_: Explicit fees charged separately from the routed amount; deductions reflected in `destinationAmount` are omitted.
  - `amount` `object` _(required)_: A token quantity with its denomination and decimal representation.
    - `baseUnits` `string` _(required)_: The quantity in the token's smallest unit.
    - `currency` `string` _(required)_: The monetary denomination of this quantity.
    - `decimals` `integer` _(required)_: Decimal places used to convert `baseUnits` into `formatted`.
    - `formatted` `string` _(required)_: The quantity rendered in whole token units.
  - `side` `string` _(required)_: Which side of the transfer the fee is taken from.
  - `token` `object` _(required)_: A normalized token reference for route quotes.
    - `address` `string` _(required)_: Contract address, mint, or issuer address on the token chain.
    - `currency` `string` _(required)_: Monetary denomination represented by this token.
    - `decimals` `integer` _(required)_: Number of decimal places this token uses.
    - `name` `string` _(required)_: Human-readable token name.
    - `standard` `string` _(required)_: Token standard on the token chain.
    - `symbol` `string` _(required)_: Short token ticker symbol.
    - `tokenKey` `string` _(required)_: Stable Tempo token key scoped to the token chain.
    - `verified` `boolean` _(required)_: Whether Tempo recognizes this token in its route quote inventory.
  - `type` `string` _(required)_: What the fee pays for.
- `id` `string` _(required)_: Route transfer id (`rtr_…`, lexically time-ordered).
- `method` `string` _(required)_: How the caller funds the transfer.
- `mode` `string` _(required)_: Which side of the transfer the quoted amount fixes.
- `provider` `object` _(required)_: Provider metadata embedded in a route quote.
  - `id` `string` _(required)_: Stable provider id.
  - `name` `string` _(required)_: Human-readable provider name.
- `quote` `object` _(required)_: Freshness and validity window of the selected quote.
  - `expiresAt` `string <date-time>` _(required)_: When the quoted terms stop being executable (ISO 8601).
  - `sampledAt` `string <date-time>` _(required)_: When the provider produced the quote (ISO 8601).
- `recipient` `string` _(required)_: Final beneficiary of the transfer.
- `refundAddress` `string`: Source-chain refund recipient (deposit-address method).
- `refundAmount` `object`: A token quantity with its denomination and decimal representation.
  - `baseUnits` `string` _(required)_: The quantity in the token's smallest unit.
  - `currency` `string` _(required)_: The monetary denomination of this quantity.
  - `decimals` `integer` _(required)_: Decimal places used to convert `baseUnits` into `formatted`.
  - `formatted` `string` _(required)_: The quantity rendered in whole token units.
- `refundTransactionHashes` `string[]`: Verified refund transaction references.
- `sender` `string`: Source-chain account that signs the route action (transaction method).
- `sourceAmount` `object` _(required)_: A token quantity with its denomination and decimal representation.
  - `baseUnits` `string` _(required)_: The quantity in the token's smallest unit.
  - `currency` `string` _(required)_: The monetary denomination of this quantity.
  - `decimals` `integer` _(required)_: Decimal places used to convert `baseUnits` into `formatted`.
  - `formatted` `string` _(required)_: The quantity rendered in whole token units.
- `sourceAmountMax` `object`: A token quantity with its denomination and decimal representation.
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
- `sourceTransactionHashes` `string[]`: Verified source transaction references.
- `subsidize` `boolean`: Whether Tempo guarantees normalized 1:1 destination delivery.
- `status` `string` _(required)_: Lifecycle status of the route transfer.
- `statusReason` `object`: Why the transfer is in its current status, when context is needed.
  - `code` `string` _(required)_: Stable machine-readable reason code.
  - `message` `string` _(required)_: Human-readable explanation of the reason.
- `updatedAt` `string <date-time>` _(required)_: When the transfer last materially changed (ISO 8601).
- `version` `integer` _(required)_: Monotonic revision that increments whenever the transfer materially changes.

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

#### `403`: The requested normalized delivery subsidy is unavailable.

Body (`application/json`):

- `error` `object` _(required)_: What went wrong.
  - `code` `string` _(required)_: A short, stable code you can branch on in your code (e.g. `token_not_found`).
  - `details` `object[]`: A list of specific problems, when the error is about your request (e.g. invalid fields).
    - `message` `string` _(required)_: A specific thing that went wrong, in plain language (e.g. why a field failed validation).
    - `path` `string | number[]`: Where the problem is, as a path into your request (e.g. `["query", "limit"]`). Present for validation errors.
  - `message` `string` _(required)_: A human-readable explanation of what went wrong.
- `requestId` `string` _(required)_: The id of this request — include it when contacting support.

#### `404`: No provider can prepare the requested route.

Body (`application/json`):

- `error` `object` _(required)_: What went wrong.
  - `code` `string` _(required)_: A short, stable code you can branch on in your code (e.g. `token_not_found`).
  - `details` `object[]`: A list of specific problems, when the error is about your request (e.g. invalid fields).
    - `message` `string` _(required)_: A specific thing that went wrong, in plain language (e.g. why a field failed validation).
    - `path` `string | number[]`: Where the problem is, as a path into your request (e.g. `["query", "limit"]`). Present for validation errors.
  - `message` `string` _(required)_: A human-readable explanation of what went wrong.
- `requestId` `string` _(required)_: The id of this request — include it when contacting support.

#### `409`: The Idempotency-Key conflicts with an existing or in-flight request.

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

#### `501`: Destination subsidy settlement is not configured.

Body (`application/json`):

- `error` `object` _(required)_: What went wrong.
  - `code` `string` _(required)_: A short, stable code you can branch on in your code (e.g. `token_not_found`).
  - `details` `object[]`: A list of specific problems, when the error is about your request (e.g. invalid fields).
    - `message` `string` _(required)_: A specific thing that went wrong, in plain language (e.g. why a field failed validation).
    - `path` `string | number[]`: Where the problem is, as a path into your request (e.g. `["query", "limit"]`). Present for validation errors.
  - `message` `string` _(required)_: A human-readable explanation of what went wrong.
- `requestId` `string` _(required)_: The id of this request — include it when contacting support.

#### `502`: No provider succeeded and at least one failed unexpectedly.

Body (`application/json`):

- `error` `object` _(required)_: What went wrong.
  - `code` `string` _(required)_: A short, stable code you can branch on in your code (e.g. `token_not_found`).
  - `details` `object[]`: A list of specific problems, when the error is about your request (e.g. invalid fields).
    - `message` `string` _(required)_: A specific thing that went wrong, in plain language (e.g. why a field failed validation).
    - `path` `string | number[]`: Where the problem is, as a path into your request (e.g. `["query", "limit"]`). Present for validation errors.
  - `message` `string` _(required)_: A human-readable explanation of what went wrong.
- `requestId` `string` _(required)_: The id of this request — include it when contacting support.

#### `503`: Destination subsidy capacity is temporarily unavailable.

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
curl https://api.tempo.xyz/v1/routes/transfers \
  --request POST \
  --header 'idempotency-key: routes_01k1c5j8q8p0be6j5v9m6d1e4r' \
  --header 'Content-Type: application/json' \
  --data '{
  "amount": "1000000",
  "destinationToken": "usdc",
  "mode": "exactSource",
  "recipient": "0x1111111111111111111111111111111111111111",
  "sender": "0x2222222222222222222222222222222222222222",
  "sourceChain": "tempo",
  "sourceToken": "usdce"
}'
```

```ts
fetch('https://api.tempo.xyz/v1/routes/transfers', {
  method: 'POST',
  headers: {
    'idempotency-key': 'routes_01k1c5j8q8p0be6j5v9m6d1e4r',
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    amount: '1000000',
    destinationToken: 'usdc',
    mode: 'exactSource',
    recipient: '0x1111111111111111111111111111111111111111',
    sender: '0x2222222222222222222222222222222222222222',
    sourceChain: 'tempo',
    sourceToken: 'usdce'
  })
})
```

## Create transfer into vault

`POST /v1/routes/transfers/vault`

Creates a transfer into a Tempo Earn vault.

### Header parameters

- `idempotency-key` `string` _(required)_: Opaque retry key scoped to the API key. Matching requests replay successful responses for 24 hours; changed input conflicts, in-flight requests block, and failed attempts release the key.

### Request body (required) (`application/json`)

- `amount` `string` _(required)_: Amount in base units of the token the mode fixes.
- `mode` `string` _(required)_: Which side of the transfer the quoted amount fixes.
- `recipient` `string` _(required)_: Destination-chain account that receives the transfer.
- `sender` `string` _(required)_: Source-chain account that signs the route action.
- `slippageBps` `integer`: Maximum acceptable slippage in basis points.
- `sourceChain` `string` _(required)_: Source chain CAIP-2 id, slug, or alias.
- `sourceToken` `string` _(required)_: Source token symbol, contract address, or token key.
- `vaultAddress` `string` _(required)_: Tempo Earn vault contract address.

### Responses

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

#### `501`: This route transfer destination is not implemented.

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
curl https://api.tempo.xyz/v1/routes/transfers/vault \
  --request POST \
  --header 'idempotency-key: routes_01k1c5j8q8p0be6j5v9m6d1e4r' \
  --header 'Content-Type: application/json' \
  --data '{
  "amount": "1000000",
  "mode": "exactSource",
  "recipient": "0x1111111111111111111111111111111111111111",
  "sender": "0x2222222222222222222222222222222222222222",
  "sourceChain": "tempo",
  "sourceToken": "usdce",
  "vaultAddress": "0xf4f4f4f4f4f4f4f4f4f4f4f4f4f4f4f4f4f4f4f4"
}'
```

```ts
fetch('https://api.tempo.xyz/v1/routes/transfers/vault', {
  method: 'POST',
  headers: {
    'idempotency-key': 'routes_01k1c5j8q8p0be6j5v9m6d1e4r',
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    amount: '1000000',
    mode: 'exactSource',
    recipient: '0x1111111111111111111111111111111111111111',
    sender: '0x2222222222222222222222222222222222222222',
    sourceChain: 'tempo',
    sourceToken: 'usdce',
    vaultAddress: '0xf4f4f4f4f4f4f4f4f4f4f4f4f4f4f4f4f4f4f4f4'
  })
})
```

## Create transfer into zone

`POST /v1/routes/transfers/zone`

Creates a transfer into a Tempo Zone.

### Header parameters

- `idempotency-key` `string` _(required)_: Opaque retry key scoped to the API key. Matching requests replay successful responses for 24 hours; changed input conflicts, in-flight requests block, and failed attempts release the key.

### Request body (required) (`application/json`)

- `amount` `string` _(required)_: Amount in base units of the token the mode fixes.
- `destinationChain` `string` _(required)_: Configured Zone CAIP-2 id.
- `destinationToken` `string` _(required)_: Destination token symbol, contract address, or token key.
- `mode` `string` _(required)_: Which side of the transfer the quoted amount fixes.
- `recipient` `string` _(required)_: Destination-chain account that receives the transfer.
- `recipientFallback` `string` _(required)_: Public Tempo recipient used if the Zone credit cannot complete.
- `sender` `string` _(required)_: Source-chain account that signs the route action.
- `slippageBps` `integer`: Maximum acceptable slippage in basis points.
- `sourceChain` `string` _(required)_: Source chain CAIP-2 id, slug, or alias.
- `sourceToken` `string` _(required)_: Source token symbol, contract address, or token key.

### Responses

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

#### `501`: This route transfer destination is not implemented.

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
curl https://api.tempo.xyz/v1/routes/transfers/zone \
  --request POST \
  --header 'idempotency-key: routes_01k1c5j8q8p0be6j5v9m6d1e4r' \
  --header 'Content-Type: application/json' \
  --data '{
  "amount": "1000000",
  "destinationChain": "eip155:1424310003",
  "destinationToken": "usdc",
  "mode": "exactSource",
  "recipient": "0x1111111111111111111111111111111111111111",
  "recipientFallback": "0x2222222222222222222222222222222222222222",
  "sender": "0x2222222222222222222222222222222222222222",
  "sourceChain": "tempo",
  "sourceToken": "usdce"
}'
```

```ts
fetch('https://api.tempo.xyz/v1/routes/transfers/zone', {
  method: 'POST',
  headers: {
    'idempotency-key': 'routes_01k1c5j8q8p0be6j5v9m6d1e4r',
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    amount: '1000000',
    destinationChain: 'eip155:1424310003',
    destinationToken: 'usdc',
    mode: 'exactSource',
    recipient: '0x1111111111111111111111111111111111111111',
    recipientFallback: '0x2222222222222222222222222222222222222222',
    sender: '0x2222222222222222222222222222222222222222',
    sourceChain: 'tempo',
    sourceToken: 'usdce'
  })
})
```

## Get transfer

`GET /v1/routes/transfers/{id}`

Returns a transfer by ID.

### Path parameters

- `id` `string` _(required)_: Route transfer ID (`rtr_…`).

### Responses

#### `200`: The requested route transfer.

Headers:

- `RateLimit-Limit` `integer`: How many requests you may make in the current time window. Not sent on cached responses or `402` payment challenges.
- `RateLimit-Remaining` `integer`: How many requests you have left in the current window before you are rate-limited. Not sent on cached responses or `402` payment challenges.
- `RateLimit-Reset` `integer`: When the current window resets, as a Unix timestamp in seconds. Not sent on cached responses or `402` payment challenges.
- `RateLimit-Scope` `string`: Which quota this request counted against (e.g. `data:read`). Not sent on cached responses or `402` payment challenges.
- `tempo-request-id` `string`: A unique id for this request, returned on every response (and as `requestId` in error bodies). Include it when contacting support so we can find your request.

Body (`application/json`):

- `createdAt` `string <date-time>` _(required)_: When the transfer was created (ISO 8601).
- `destinationAmount` `object`: Expected amount received after provider deductions, including pool fees.
  - `baseUnits` `string` _(required)_: The quantity in the token's smallest unit.
  - `currency` `string` _(required)_: The monetary denomination of this quantity.
  - `decimals` `integer` _(required)_: Decimal places used to convert `baseUnits` into `formatted`.
  - `formatted` `string` _(required)_: The quantity rendered in whole token units.
- `destinationAmountMin` `object`: Minimum destination amount encoded in the transfer action.
  - `baseUnits` `string` _(required)_: The quantity in the token's smallest unit.
  - `currency` `string` _(required)_: The monetary denomination of this quantity.
  - `decimals` `integer` _(required)_: Decimal places used to convert `baseUnits` into `formatted`.
  - `formatted` `string` _(required)_: The quantity rendered in whole token units.
- `destinationAmountRequired` `object`: Destination amount required for normalized 1:1 delivery, when enabled.
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
- `fees` `object[]` _(required)_: Explicit fees charged separately from the routed amount; deductions reflected in `destinationAmount` are omitted.
  - `amount` `object` _(required)_: A token quantity with its denomination and decimal representation.
    - `baseUnits` `string` _(required)_: The quantity in the token's smallest unit.
    - `currency` `string` _(required)_: The monetary denomination of this quantity.
    - `decimals` `integer` _(required)_: Decimal places used to convert `baseUnits` into `formatted`.
    - `formatted` `string` _(required)_: The quantity rendered in whole token units.
  - `side` `string` _(required)_: Which side of the transfer the fee is taken from.
  - `token` `object` _(required)_: A normalized token reference for route quotes.
    - `address` `string` _(required)_: Contract address, mint, or issuer address on the token chain.
    - `currency` `string` _(required)_: Monetary denomination represented by this token.
    - `decimals` `integer` _(required)_: Number of decimal places this token uses.
    - `name` `string` _(required)_: Human-readable token name.
    - `standard` `string` _(required)_: Token standard on the token chain.
    - `symbol` `string` _(required)_: Short token ticker symbol.
    - `tokenKey` `string` _(required)_: Stable Tempo token key scoped to the token chain.
    - `verified` `boolean` _(required)_: Whether Tempo recognizes this token in its route quote inventory.
  - `type` `string` _(required)_: What the fee pays for.
- `id` `string` _(required)_: Route transfer id (`rtr_…`, lexically time-ordered).
- `method` `string` _(required)_: How the caller funds the transfer.
- `mode` `string` _(required)_: Which side of the transfer the quoted amount fixes.
- `provider` `object` _(required)_: Provider metadata embedded in a route quote.
  - `id` `string` _(required)_: Stable provider id.
  - `name` `string` _(required)_: Human-readable provider name.
- `quote` `object` _(required)_: Freshness and validity window of the selected quote.
  - `expiresAt` `string <date-time>` _(required)_: When the quoted terms stop being executable (ISO 8601).
  - `sampledAt` `string <date-time>` _(required)_: When the provider produced the quote (ISO 8601).
- `recipient` `string` _(required)_: Final beneficiary of the transfer.
- `refundAddress` `string`: Source-chain refund recipient (deposit-address method).
- `refundAmount` `object`: A token quantity with its denomination and decimal representation.
  - `baseUnits` `string` _(required)_: The quantity in the token's smallest unit.
  - `currency` `string` _(required)_: The monetary denomination of this quantity.
  - `decimals` `integer` _(required)_: Decimal places used to convert `baseUnits` into `formatted`.
  - `formatted` `string` _(required)_: The quantity rendered in whole token units.
- `refundTransactionHashes` `string[]`: Verified refund transaction references.
- `sender` `string`: Source-chain account that signs the route action (transaction method).
- `sourceAmount` `object` _(required)_: A token quantity with its denomination and decimal representation.
  - `baseUnits` `string` _(required)_: The quantity in the token's smallest unit.
  - `currency` `string` _(required)_: The monetary denomination of this quantity.
  - `decimals` `integer` _(required)_: Decimal places used to convert `baseUnits` into `formatted`.
  - `formatted` `string` _(required)_: The quantity rendered in whole token units.
- `sourceAmountMax` `object`: A token quantity with its denomination and decimal representation.
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
- `sourceTransactionHashes` `string[]`: Verified source transaction references.
- `subsidize` `boolean`: Whether Tempo guarantees normalized 1:1 destination delivery.
- `status` `string` _(required)_: Lifecycle status of the route transfer.
- `statusReason` `object`: Why the transfer is in its current status, when context is needed.
  - `code` `string` _(required)_: Stable machine-readable reason code.
  - `message` `string` _(required)_: Human-readable explanation of the reason.
- `updatedAt` `string <date-time>` _(required)_: When the transfer last materially changed (ISO 8601).
- `version` `integer` _(required)_: Monotonic revision that increments whenever the transfer materially changes.

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

#### `404`: No visible route transfer exists for the identifier.

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
curl https://api.tempo.xyz/v1/routes/transfers/rtr_001785729600000_2ZPE2gvateYEQ0dQslgvkhjx
```

```ts
fetch('https://api.tempo.xyz/v1/routes/transfers/rtr_001785729600000_2ZPE2gvateYEQ0dQslgvkhjx')
```
