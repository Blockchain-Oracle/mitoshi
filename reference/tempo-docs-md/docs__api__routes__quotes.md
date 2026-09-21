# Quotes

Live quotes for routing assets between supported chains.

## Get quotes

`GET /v1/routes/quotes`

Returns live quotes for transferring stablecoins between supported chains.

### Query parameters

- `destinationChain` `string`: Destination chain CAIP-2 id, slug, or alias. Defaults to Tempo.
- `destinationToken` `string`: Destination token symbol, address, or token key. Defaults to USDC.e for Tempo destinations.
- `provider` `string`: Only request a quote from this provider. Use an id returned by the route providers endpoint, or omit it to query every available provider.
- `sourceAmount` `string` _(required)_: Positive source token amount. Base units by default, so 1 USDC is `1000000`.
- `sourceAmountUnits` `string`: Whether `sourceAmount` is base units or a human-readable decimal.
- `sourceChain` `string` _(required)_: Source chain alias or stable id, such as `base`, `solana`, or `eip155:8453`.
- `sourceToken` `string` _(required)_: Source token symbol, contract address, or Tempo token key. Lookup is scoped to `sourceChain`; non-EVM addresses are case-sensitive. An unknown token returns an empty list.

### Responses

#### `200`: Live route quotes. An empty list means no provider returned a quote.

Headers:

- `RateLimit-Limit` `integer`: How many requests you may make in the current time window. Not sent on cached responses or `402` payment challenges.
- `RateLimit-Remaining` `integer`: How many requests you have left in the current window before you are rate-limited. Not sent on cached responses or `402` payment challenges.
- `RateLimit-Reset` `integer`: When the current window resets, as a Unix timestamp in seconds. Not sent on cached responses or `402` payment challenges.
- `RateLimit-Scope` `string`: Which quota this request counted against (e.g. `data:read`). Not sent on cached responses or `402` payment challenges.
- `tempo-request-id` `string`: A unique id for this request, returned on every response (and as `requestId` in error bodies). Include it when contacting support so we can find your request.

Body (`application/json`):

- `data` `object[]` _(required)_: Successful live route quotes.
  - `destinationAmount` `object` _(required)_: Expected amount received after provider deductions, including pool fees.
    - `baseUnits` `string` _(required)_: The quantity in the token's smallest unit.
    - `currency` `string` _(required)_: The monetary denomination of this quantity.
    - `decimals` `integer` _(required)_: Decimal places used to convert `baseUnits` into `formatted`.
    - `formatted` `string` _(required)_: The quantity rendered in whole token units.
  - `destinationAmountMin` `object`: Provider-derived minimum destination amount. Symbiosis and Squid quotes use a fixed 1% slippage tolerance.
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
  - `id` `string` _(required)_: Stable deterministic route quote id.
  - `provider` `object` _(required)_: Provider metadata embedded in a route quote.
    - `id` `string` _(required)_: Stable provider id.
    - `name` `string` _(required)_: Human-readable provider name.
  - `quality` `object` _(required)_: Machine-readable quality and settlement-time signals for a successful quote.
    - `estimatedSeconds` `integer`: Estimated settlement time in seconds, when known.
    - `tier` `string` _(required)_: Machine-readable quote quality tier for a successful quote.
  - `quote` `object` _(required)_: Freshness data for a provider route quote.
    - `expiresAt` `string <date-time>`: Timestamp after which the provider quote is no longer valid.
    - `sampledAt` `string <date-time>` _(required)_: Timestamp for the live quote request.
  - `sourceAmount` `object` _(required)_: A token quantity with its denomination and decimal representation.
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

#### `402`: Payment required. This endpoint accepts MPP payment, and the request either exceeded free quota or needs a paid request credential. The challenge is protocol-native (handled by mppx), not the JSON error envelope: read the `WWW-Authenticate` header and retry with `Authorization: Payment <credential>`. A successful paid response carries `Payment-Receipt`.

Headers:

- `WWW-Authenticate` `string`: On a `402` response, the payment challenge to satisfy. Use it to build the `Authorization: Payment` credential and retry the request.

#### `403`: Fresh instructions are suspended for this API-key organization.

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

#### `502`: No quote succeeded and at least one matching provider failed unexpectedly.

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
curl 'https://api.tempo.xyz/v1/routes/quotes?destinationChain=tempo&destinationToken=usdc.e&provider=relay&sourceAmount=1000000&sourceAmountUnits=baseUnits&sourceChain=base&sourceToken=usdc'
```

```ts
fetch('https://api.tempo.xyz/v1/routes/quotes?destinationChain=tempo&destinationToken=usdc.e&provider=relay&sourceAmount=1000000&sourceAmountUnits=baseUnits&sourceChain=base&sourceToken=usdc')
```
