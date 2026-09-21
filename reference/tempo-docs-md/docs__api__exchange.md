# Exchange

Tempo's built-in stablecoin exchange: pairs, swaps, orders, prices.

## List swaps

`GET /v1/exchange/swaps`

List recent swaps on Tempo’s built-in stablecoin exchange. A swap trades one token for another and may contain multiple maker-order fills.

### Query parameters

- `blockNumber.from` `integer`: Only include swaps at or after this block number.
- `blockNumber.to` `integer`: Only include swaps at or before this block number.
- `chainId` `string | number`: Which Tempo network to query. Use the alias `mainnet` or `testnet`, or a numeric chain id. Defaults to `mainnet` when omitted.
- `cursor` `string`: Opaque keyset cursor from a previous response (`nextCursor`); pass it back verbatim to fetch the next page. Omit for the first (head) page.
- `include` `string[]`: Comma-separated token fields to include, such as `token.logoUri,token.verified`.
- `limit` `integer`: How many items to return per page (5–50, default 10). Use `nextCursor` to fetch more.
- `maker` `string`: Only include swaps that filled against an order owned by this maker address.
- `order` `string`: Sort order: `desc` for descending (the default), or `asc` for ascending.
- `participant` `string`: Only include swaps where this address participated as the taker or as a maker whose order was filled.
- `taker` `string`: Only include swaps initiated by this taker address.
- `timestamp.from` `string <date-time>`: Only include swaps at or after this ISO 8601 timestamp.
- `timestamp.to` `string <date-time>`: Only include swaps at or before this ISO 8601 timestamp.
- `transactionHash` `string`: Only include swaps included in this transaction hash.
- `valuation.currency` `string`: Currency to denominate values in (case-insensitive, e.g. `AUD`). Must be priced by the configured FX oracle.

### Responses

#### `200`: A page of swaps from Tempo’s built-in stablecoin exchange.

Headers:

- `RateLimit-Limit` `integer`: How many requests you may make in the current time window. Not sent on cached responses or `402` payment challenges.
- `RateLimit-Remaining` `integer`: How many requests you have left in the current window before you are rate-limited. Not sent on cached responses or `402` payment challenges.
- `RateLimit-Reset` `integer`: When the current window resets, as a Unix timestamp in seconds. Not sent on cached responses or `402` payment challenges.
- `RateLimit-Scope` `string`: Which quota this request counted against (e.g. `data:read`). Not sent on cached responses or `402` payment challenges.
- `tempo-request-id` `string`: A unique id for this request, returned on every response (and as `requestId` in error bodies). Include it when contacting support so we can find your request.

Body (`application/json`):

- `data` `object[]` _(required)_: Swaps returned on this page.
  - `blockNumber` `integer` _(required)_: Block number where the swap was included.
  - `destinationAmount` `object` _(required)_: A token amount carrying its nominal value in the requested denomination.
    - `baseUnits` `string` _(required)_: The quantity in the token's smallest unit.
    - `currency` `string` _(required)_: The monetary denomination of this quantity.
    - `decimals` `integer` _(required)_: Decimal places used to convert `baseUnits` into `formatted`.
    - `formatted` `string` _(required)_: The quantity rendered in whole token units.
    - `valuation` `object`: The amount’s nominal value in the requested `valuation.currency`. `null` when the token is unverified, its display currency has no rate, or rates were unavailable.
      - `amount` `string` _(required)_: The holding’s nominal value, as a decimal string in `currency`.
      - `currency` `string` _(required)_: The denomination currency of this value.
  - `destinationToken` `object` _(required)_: A token referenced by one side of a swap.
    - `address` `string` _(required)_: The TIP-20 token contract address on Tempo.
    - `currency` `string` _(required)_: The currency label for this token, such as `USD` for USD-denominated stablecoins.
    - `decimals` `integer` _(required)_: The number of decimal places the token uses; Tempo stablecoins typically use 6.
    - `logoUri` `string`: A URL for the token’s logo image, when one is available.
    - `name` `string` _(required)_: The token’s human-readable name.
    - `symbol` `string` _(required)_: The short ticker symbol wallets and apps show for this token.
    - `verified` `boolean`: Whether this token is in Tempo’s curated verified token list.
  - `filledAt` `string <date-time>` _(required)_: Block timestamp when the swap was filled onchain.
  - `fills` `object[]` _(required)_: Maker-order fills that make up this swap, ordered by execution `logIndex`. Exact-destination swaps can execute hops in reverse, so use `route` for the source-to-destination path.
    - `destinationAmount` `object` _(required)_: A token amount carrying its nominal value in the requested denomination.
      - `baseUnits` `string` _(required)_: The quantity in the token's smallest unit.
      - `currency` `string` _(required)_: The monetary denomination of this quantity.
      - `decimals` `integer` _(required)_: Decimal places used to convert `baseUnits` into `formatted`.
      - `formatted` `string` _(required)_: The quantity rendered in whole token units.
      - `valuation` `object`: The amount’s nominal value in the requested `valuation.currency`. `null` when the token is unverified, its display currency has no rate, or rates were unavailable.
        - `amount` `string` _(required)_: The holding’s nominal value, as a decimal string in `currency`.
        - `currency` `string` _(required)_: The denomination currency of this value.
    - `destinationToken` `object` _(required)_: A token referenced by one side of a swap.
      - `address` `string` _(required)_: The TIP-20 token contract address on Tempo.
      - `currency` `string` _(required)_: The currency label for this token, such as `USD` for USD-denominated stablecoins.
      - `decimals` `integer` _(required)_: The number of decimal places the token uses; Tempo stablecoins typically use 6.
      - `logoUri` `string`: A URL for the token’s logo image, when one is available.
      - `name` `string` _(required)_: The token’s human-readable name.
      - `symbol` `string` _(required)_: The short ticker symbol wallets and apps show for this token.
      - `verified` `boolean`: Whether this token is in Tempo’s curated verified token list.
    - `logIndex` `integer` _(required)_: Log index of this fill within its block.
    - `maker` `string` _(required)_: Maker address whose resting order was filled.
    - `orderId` `string` _(required)_: On-chain maker order id, returned as a decimal string.
    - `partialFill` `boolean` _(required)_: Whether this fill used only part of the maker order.
    - `price` `string` _(required)_: Quote-per-base price at fill time, returned as a fixed-decimal string with 5 decimal places. This value is direction-independent and works well for charts.
    - `sourceAmount` `object` _(required)_: A token amount carrying its nominal value in the requested denomination.
      - `baseUnits` `string` _(required)_: The quantity in the token's smallest unit.
      - `currency` `string` _(required)_: The monetary denomination of this quantity.
      - `decimals` `integer` _(required)_: Decimal places used to convert `baseUnits` into `formatted`.
      - `formatted` `string` _(required)_: The quantity rendered in whole token units.
      - `valuation` `object`: The amount’s nominal value in the requested `valuation.currency`. `null` when the token is unverified, its display currency has no rate, or rates were unavailable.
        - `amount` `string` _(required)_: The holding’s nominal value, as a decimal string in `currency`.
        - `currency` `string` _(required)_: The denomination currency of this value.
    - `sourceToken` `object` _(required)_: A token referenced by one side of a swap.
      - `address` `string` _(required)_: The TIP-20 token contract address on Tempo.
      - `currency` `string` _(required)_: The currency label for this token, such as `USD` for USD-denominated stablecoins.
      - `decimals` `integer` _(required)_: The number of decimal places the token uses; Tempo stablecoins typically use 6.
      - `logoUri` `string`: A URL for the token’s logo image, when one is available.
      - `name` `string` _(required)_: The token’s human-readable name.
      - `symbol` `string` _(required)_: The short ticker symbol wallets and apps show for this token.
      - `verified` `boolean`: Whether this token is in Tempo’s curated verified token list.
  - `id` `string` _(required)_: Stable API id built from the lowercase transaction hash and the first fill log index.
  - `logIndex` `integer` _(required)_: Block-wide log index for the swap, taken from its first fill.
  - `mode` `string` _(required)_: The amount type fixed by the swap call: `exactSource` for `swapExactAmountIn` or `exactDestination` for `swapExactAmountOut`. This is recovered from transaction calldata and is `null` when the swap did not come from a decodable swap call.
  - `rate` `string` _(required)_: Swap-level effective rate, calculated as destination amount divided by source amount from the taker’s perspective and returned with 5 decimal places. Compare it with `1` to see distance from peg.
  - `route` `string[]` _(required)_: Token path for the swap, from source through any intermediate tokens to destination. `route.length - 1` is the hop count; two entries means a direct swap.
  - `sourceAmount` `object` _(required)_: A token amount carrying its nominal value in the requested denomination.
    - `baseUnits` `string` _(required)_: The quantity in the token's smallest unit.
    - `currency` `string` _(required)_: The monetary denomination of this quantity.
    - `decimals` `integer` _(required)_: Decimal places used to convert `baseUnits` into `formatted`.
    - `formatted` `string` _(required)_: The quantity rendered in whole token units.
    - `valuation` `object`: The amount’s nominal value in the requested `valuation.currency`. `null` when the token is unverified, its display currency has no rate, or rates were unavailable.
      - `amount` `string` _(required)_: The holding’s nominal value, as a decimal string in `currency`.
      - `currency` `string` _(required)_: The denomination currency of this value.
  - `sourceToken` `object` _(required)_: A token referenced by one side of a swap.
    - `address` `string` _(required)_: The TIP-20 token contract address on Tempo.
    - `currency` `string` _(required)_: The currency label for this token, such as `USD` for USD-denominated stablecoins.
    - `decimals` `integer` _(required)_: The number of decimal places the token uses; Tempo stablecoins typically use 6.
    - `logoUri` `string`: A URL for the token’s logo image, when one is available.
    - `name` `string` _(required)_: The token’s human-readable name.
    - `symbol` `string` _(required)_: The short ticker symbol wallets and apps show for this token.
    - `verified` `boolean`: Whether this token is in Tempo’s curated verified token list.
  - `taker` `string` _(required)_: Taker address that initiated the swap.
  - `transactionHash` `string` _(required)_: Transaction hash for the transaction containing the swap.
- `meta` `object`: Page-level resources, such as valuation rate provenance.
  - `valuation` `object`: Rate provenance for leg valuations. Present when conversion rates were consulted; absent when every value was identity-valued or rates were unavailable.
    - `asOf` `string <date-time>` _(required)_: Publication date of the rate set as an ISO 8601 timestamp.
    - `basis` `string` _(required)_: Valuation basis: one token unit counts as one unit of its display currency.
    - `source` `string` _(required)_: FX rate oracle that supplied the conversion rates.
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

#### `402`: Payment required. This endpoint accepts MPP payment, and the request either exceeded free quota or needs a paid request credential. The challenge is protocol-native (handled by mppx), not the JSON error envelope: read the `WWW-Authenticate` header and retry with `Authorization: Payment <credential>`. A successful paid response carries `Payment-Receipt`.

Headers:

- `WWW-Authenticate` `string`: On a `402` response, the payment challenge to satisfy. Use it to build the `Authorization: Payment` credential and retry the request.

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

#### `502`: The indexer or Tempo RPC could not serve the exchange data right now.

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
curl 'https://api.tempo.xyz/v1/exchange/swaps?blockNumber.from=23456789&blockNumber.to=23456999&chainId=4217&cursor=WzIzNDU2Nzg5LDBd&include=token.logoUri,token.verified&limit=10&maker=0xbe058e1c4df8a4366a387bf595b284246a93039e&order=desc&participant=0xbe058e1c4df8a4366a387bf595b284246a93039e&taker=0xbe058e1c4df8a4366a387bf595b284246a93039e&timestamp.from=2024-01-01T00:00:00Z&timestamp.to=2024-12-31T23:59:59Z&transactionHash=0x515801d7f9a5ac705e793e85904c9c69b3f1694b465cc8fb6ba3f0298dc82665&valuation.currency=AUD'
```

```ts
fetch('https://api.tempo.xyz/v1/exchange/swaps?blockNumber.from=23456789&blockNumber.to=23456999&chainId=4217&cursor=WzIzNDU2Nzg5LDBd&include=token.logoUri,token.verified&limit=10&maker=0xbe058e1c4df8a4366a387bf595b284246a93039e&order=desc&participant=0xbe058e1c4df8a4366a387bf595b284246a93039e&taker=0xbe058e1c4df8a4366a387bf595b284246a93039e&timestamp.from=2024-01-01T00:00:00Z&timestamp.to=2024-12-31T23:59:59Z&transactionHash=0x515801d7f9a5ac705e793e85904c9c69b3f1694b465cc8fb6ba3f0298dc82665&valuation.currency=AUD')
```

## List pairs

`GET /v1/exchange/pairs`

List trading pairs available on Tempo’s built-in stablecoin exchange.

### Query parameters

- `chainId` `string | number`: Which Tempo network to query. Use the alias `mainnet` or `testnet`, or a numeric chain id. Defaults to `mainnet` when omitted.
- `cursor` `string`: Opaque keyset cursor from a previous response (`nextCursor`); pass it back verbatim to fetch the next page. Omit for the first (head) page.
- `include` `string[]`: Comma-separated optional resources to embed, e.g. `tokens,totalCount`.
- `limit` `integer`: How many items to return per page (5–50, default 10). Use `nextCursor` to fetch more.
- `order` `string`: Sort order: `desc` for descending (the default), or `asc` for ascending.
- `page` `integer`: Page number, 1-indexed (positional pagination for page-numbered access; `page=1` is the head page). Mutually exclusive with `cursor`, and `page × limit` must be at most 500 rows — use cursor pagination for deeper traversal. Pages are positional, so rows arriving at the head of a live feed can shift page contents.
- `sort` `string`: Sort key: `created` orders by when the pair was created, while `liquidity` ranks by the DEX-held base-token balance as a practical liquidity signal.

### Responses

#### `200`: A page of exchange trading pairs.

Headers:

- `RateLimit-Limit` `integer`: How many requests you may make in the current time window. Not sent on cached responses or `402` payment challenges.
- `RateLimit-Remaining` `integer`: How many requests you have left in the current window before you are rate-limited. Not sent on cached responses or `402` payment challenges.
- `RateLimit-Reset` `integer`: When the current window resets, as a Unix timestamp in seconds. Not sent on cached responses or `402` payment challenges.
- `RateLimit-Scope` `string`: Which quota this request counted against (e.g. `data:read`). Not sent on cached responses or `402` payment challenges.
- `tempo-request-id` `string`: A unique id for this request, returned on every response (and as `requestId` in error bodies). Include it when contacting support so we can find your request.

Body (`application/json`):

- `data` `object[]` _(required)_: Trading pairs returned on this page.
  - `base` `object` _(required)_: One side of a trading pair (with metadata when requested via `include=tokens`).
    - `address` `string` _(required)_: TIP-20 token contract address — the `0x`-prefixed 20-byte identifier for this token.
    - `currency` `string`: Human-readable currency code for the token, when known.
    - `decimals` `integer`: Number of decimal places the token uses; stablecoins on Tempo typically use 6.
    - `logoUri` `string`: URL for the token logo image, when one is available.
    - `name` `string`: Human-readable token name, such as `USD Coin`.
    - `symbol` `string`: Short token ticker symbol, such as `USDC`.
    - `verified` `boolean`: Whether Tempo has verified this token metadata.
  - `blockNumber` `integer` _(required)_: Block number where the pair was created.
  - `id` `string` _(required)_: Stable API id for this pair; it is the same value as the onchain pair key.
  - `key` `string` _(required)_: Stable onchain pair identifier returned by the DEX precompile as `pairKey`.
  - `liquidity` `string`: Liquidity signal for the pair, present only when you request `sort=liquidity`.
  - `quote` `object` _(required)_: One side of a trading pair (with metadata when requested via `include=tokens`).
    - `address` `string` _(required)_: TIP-20 token contract address — the `0x`-prefixed 20-byte identifier for this token.
    - `currency` `string`: Human-readable currency code for the token, when known.
    - `decimals` `integer`: Number of decimal places the token uses; stablecoins on Tempo typically use 6.
    - `logoUri` `string`: URL for the token logo image, when one is available.
    - `name` `string`: Human-readable token name, such as `USD Coin`.
    - `symbol` `string`: Short token ticker symbol, such as `USDC`.
    - `verified` `boolean`: Whether Tempo has verified this token metadata.
  - `timestamp` `string <date-time>` _(required)_: Block timestamp when the pair was created.
  - `transactionHash` `string` _(required)_: Transaction hash for the transaction that created the pair.
- `meta` `object`: Response-level resources requested with `include`, such as `totalCount`.
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

#### `402`: Payment required. This endpoint accepts MPP payment, and the request either exceeded free quota or needs a paid request credential. The challenge is protocol-native (handled by mppx), not the JSON error envelope: read the `WWW-Authenticate` header and retry with `Authorization: Payment <credential>`. A successful paid response carries `Payment-Receipt`.

Headers:

- `WWW-Authenticate` `string`: On a `402` response, the payment challenge to satisfy. Use it to build the `Authorization: Payment` credential and retry the request.

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

#### `502`: The indexer could not serve the exchange data right now.

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
curl 'https://api.tempo.xyz/v1/exchange/pairs?chainId=4217&cursor=WzIzNDU2Nzg5LDBd&include=tokens,totalCount&limit=10&order=desc&page=1&sort=created'
```

```ts
fetch('https://api.tempo.xyz/v1/exchange/pairs?chainId=4217&cursor=WzIzNDU2Nzg5LDBd&include=tokens,totalCount&limit=10&order=desc&page=1&sort=created')
```

## List orders

`GET /v1/exchange/orders`

List resting maker orders on Tempo’s built-in stablecoin exchange. These are open orders waiting in the orderbook.

### Query parameters

- `base` `string`: Only include orders for the pair with this base token. The quote token is determined onchain from the base token, so `base` alone selects the pair; returns 404 if no pair exists.
- `chainId` `string | number`: Which Tempo network to query. Use the alias `mainnet` or `testnet`, or a numeric chain id. Defaults to `mainnet` when omitted.
- `cursor` `string`: Opaque keyset cursor from a previous response (`nextCursor`); pass it back verbatim to fetch the next page. Omit for the first (head) page.
- `include` `string[]`: Comma-separated optional resources to embed, e.g. `tokens,totalCount`.
- `limit` `integer`: How many items to return per page (5–50, default 10). Use `nextCursor` to fetch more.
- `maker` `string`: Only include orders placed by this maker address.
- `order` `string`: Sort order: `desc` for descending (the default), or `asc` for ascending.
- `page` `integer`: Page number, 1-indexed (positional pagination for page-numbered access; `page=1` is the head page). Mutually exclusive with `cursor`, and `page × limit` must be at most 500 rows — use cursor pagination for deeper traversal. Pages are positional, so rows arriving at the head of a live feed can shift page contents.
- `side` `string`: Limit results to one side of the orderbook: `bid` orders pay quote for base, while `ask` orders sell base for quote.
- `sort` `string`: Sort key: `tick` orders by price in standard book order, while `time` orders by block number and log index.

### Responses

#### `200`: A page of resting maker orders.

Headers:

- `RateLimit-Limit` `integer`: How many requests you may make in the current time window. Not sent on cached responses or `402` payment challenges.
- `RateLimit-Remaining` `integer`: How many requests you have left in the current window before you are rate-limited. Not sent on cached responses or `402` payment challenges.
- `RateLimit-Reset` `integer`: When the current window resets, as a Unix timestamp in seconds. Not sent on cached responses or `402` payment challenges.
- `RateLimit-Scope` `string`: Which quota this request counted against (e.g. `data:read`). Not sent on cached responses or `402` payment challenges.
- `tempo-request-id` `string`: A unique id for this request, returned on every response (and as `requestId` in error bodies). Include it when contacting support so we can find your request.

Body (`application/json`):

- `data` `object[]` _(required)_: Resting orders returned on this page.
  - `amount` `string` _(required)_: Original placed amount, returned as a decimal integer string in base-token smallest units.
  - `blockNumber` `integer` _(required)_: Block number where the order was placed.
  - `id` `string` _(required)_: Stable API id for this order; it is the same value as the onchain order id.
  - `logIndex` `integer` _(required)_: Log index of the order placement within its block.
  - `maker` `string` _(required)_: Maker address that owns the order.
  - `orderId` `string` _(required)_: On-chain order id, returned as a decimal string.
  - `placedAt` `string <date-time>` _(required)_: Block timestamp when the order was placed.
  - `price` `string` _(required)_: Quote-per-base limit price implied by `tick`, returned with 5 decimal places. This value is direction-independent; use `rate` for the taker-perspective ratio.
  - `rate` `string` _(required)_: Order limit price as a destination/source ratio from the taker’s perspective, returned with 5 decimal places. Use `price` for orderbook displays.
  - `remaining` `string` _(required)_: Unfilled remainder of `amount`, returned as a decimal integer string in base-token smallest units. This is always positive for rows in this response.
  - `side` `string` _(required)_: Orderbook side: `bid` pays quote for base, and `ask` sells base for quote.
  - `tick` `integer` _(required)_: Order tick as a signed offset from peg; one tick equals `1/priceScale`.
  - `transactionHash` `string` _(required)_: Transaction hash for the transaction that placed the order.
  - `pair` `object` _(required)_: The trading pair the order belongs to.
    - `base` `object` _(required)_: One side of a trading pair (with metadata when requested via `include=tokens`).
      - `address` `string` _(required)_: TIP-20 token contract address — the `0x`-prefixed 20-byte identifier for this token.
      - `currency` `string`: Human-readable currency code for the token, when known.
      - `decimals` `integer`: Number of decimal places the token uses; stablecoins on Tempo typically use 6.
      - `logoUri` `string`: URL for the token logo image, when one is available.
      - `name` `string`: Human-readable token name, such as `USD Coin`.
      - `symbol` `string`: Short token ticker symbol, such as `USDC`.
      - `verified` `boolean`: Whether Tempo has verified this token metadata.
    - `key` `string` _(required)_: On-chain key for this `(base, quote)` trading pair.
    - `quote` `object` _(required)_: One side of a trading pair (with metadata when requested via `include=tokens`).
      - `address` `string` _(required)_: TIP-20 token contract address — the `0x`-prefixed 20-byte identifier for this token.
      - `currency` `string`: Human-readable currency code for the token, when known.
      - `decimals` `integer`: Number of decimal places the token uses; stablecoins on Tempo typically use 6.
      - `logoUri` `string`: URL for the token logo image, when one is available.
      - `name` `string`: Human-readable token name, such as `USD Coin`.
      - `symbol` `string`: Short token ticker symbol, such as `USDC`.
      - `verified` `boolean`: Whether Tempo has verified this token metadata.
- `meta` `object`: Response-level resources requested with `include`, such as `totalCount`.
  - `totalCountCapped` `boolean` _(required)_: Whether `totalCount` hit the count cap. When true, `totalCount` is a lower bound rather than an exact total.
  - `totalCount` `integer` _(required)_: Number of rows matching the query, exact when `totalCountCapped` is false and a lower bound (at least this many, computed up to 10000) when `totalCountCapped` is true. Independent of pagination: use `nextCursor` to page, not this count.
- `nextCursor` `string` _(required)_: Pass this back as the `cursor` query parameter to fetch the next page. `null` once you have reached the end of the list.
- `truncated` `boolean` _(required)_: `true` when the `OrderPlaced` scan hit its hard cap, meaning the resting set was computed from only the most recent placements.

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

#### `403`: Forbidden.

Body (`application/json`):

- `error` `object` _(required)_: What went wrong.
  - `code` `string` _(required)_: A short, stable code you can branch on in your code (e.g. `token_not_found`).
  - `details` `object[]`: A list of specific problems, when the error is about your request (e.g. invalid fields).
    - `message` `string` _(required)_: A specific thing that went wrong, in plain language (e.g. why a field failed validation).
    - `path` `string | number[]`: Where the problem is, as a path into your request (e.g. `["query", "limit"]`). Present for validation errors.
  - `message` `string` _(required)_: A human-readable explanation of what went wrong.
- `requestId` `string` _(required)_: The id of this request — include it when contacting support.

#### `404`: No exchange pair was found for the requested `base` filter.

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

#### `502`: The indexer could not serve the exchange data right now.

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
curl 'https://api.tempo.xyz/v1/exchange/orders?base=0x20c000000000000000000000b9537d11c60e8b50&chainId=4217&cursor=WzIzNDU2Nzg5LDBd&include=tokens,totalCount&limit=10&maker=0xbe058e1c4df8a4366a387bf595b284246a93039e&order=desc&page=1&side=bid&sort=tick'
```

```ts
fetch('https://api.tempo.xyz/v1/exchange/orders?base=0x20c000000000000000000000b9537d11c60e8b50&chainId=4217&cursor=WzIzNDU2Nzg5LDBd&include=tokens,totalCount&limit=10&maker=0xbe058e1c4df8a4366a387bf595b284246a93039e&order=desc&page=1&side=bid&sort=tick')
```

## List order fills

`GET /v1/exchange/orders/{orderId}/fills`

List fills for one order. A fill records an execution against the maker order.

### Path parameters

- `orderId` `string` _(required)_: On-chain order id, returned as a decimal string.

### Query parameters

- `chainId` `string | number`: Which Tempo network to query. Use the alias `mainnet` or `testnet`, or a numeric chain id. Defaults to `mainnet` when omitted.
- `cursor` `string`: Opaque keyset cursor from a previous response (`nextCursor`); pass it back verbatim to fetch the next page. Omit for the first (head) page.
- `include` `string[]`: Comma-separated optional resources to embed, e.g. `totalCount`.
- `limit` `integer`: How many items to return per page (5–50, default 10). Use `nextCursor` to fetch more.
- `order` `string`: Sort order: `desc` for descending (the default), or `asc` for ascending.
- `page` `integer`: Page number, 1-indexed (positional pagination for page-numbered access; `page=1` is the head page). Mutually exclusive with `cursor`, and `page × limit` must be at most 500 rows — use cursor pagination for deeper traversal. Pages are positional, so rows arriving at the head of a live feed can shift page contents.

### Responses

#### `200`: A page of fills for one order.

Headers:

- `RateLimit-Limit` `integer`: How many requests you may make in the current time window. Not sent on cached responses or `402` payment challenges.
- `RateLimit-Remaining` `integer`: How many requests you have left in the current window before you are rate-limited. Not sent on cached responses or `402` payment challenges.
- `RateLimit-Reset` `integer`: When the current window resets, as a Unix timestamp in seconds. Not sent on cached responses or `402` payment challenges.
- `RateLimit-Scope` `string`: Which quota this request counted against (e.g. `data:read`). Not sent on cached responses or `402` payment challenges.
- `tempo-request-id` `string`: A unique id for this request, returned on every response (and as `requestId` in error bodies). Include it when contacting support so we can find your request.

Body (`application/json`):

- `data` `object[]` _(required)_: Fills returned on this page.
  - `amountFilled` `string` _(required)_: Base-side amount filled by this event, returned as a decimal integer string in base-token smallest units.
  - `blockNumber` `integer` _(required)_: Block number where the fill was included.
  - `filledAt` `string <date-time>` _(required)_: Block timestamp when the fill landed onchain.
  - `id` `string` _(required)_: Stable API id built from the lowercase transaction hash and log index.
  - `logIndex` `integer` _(required)_: Log index of this fill within its block.
  - `orderId` `string` _(required)_: On-chain order id, returned as a decimal string.
  - `partialFill` `boolean` _(required)_: Whether this fill used only part of the maker order.
  - `taker` `string` _(required)_: Taker address that submitted the incoming order.
  - `transactionHash` `string` _(required)_: Transaction hash for the transaction containing the fill.
- `meta` `object`: Response-level resources requested with `include`.
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

#### `402`: Payment required. This endpoint accepts MPP payment, and the request either exceeded free quota or needs a paid request credential. The challenge is protocol-native (handled by mppx), not the JSON error envelope: read the `WWW-Authenticate` header and retry with `Authorization: Payment <credential>`. A successful paid response carries `Payment-Receipt`.

Headers:

- `WWW-Authenticate` `string`: On a `402` response, the payment challenge to satisfy. Use it to build the `Authorization: Payment` credential and retry the request.

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

#### `502`: The indexer could not serve the exchange data right now.

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
curl 'https://api.tempo.xyz/v1/exchange/orders/1/fills?chainId=4217&cursor=WzIzNDU2Nzg5LDBd&include=totalCount&limit=10&order=desc&page=1'
```

```ts
fetch('https://api.tempo.xyz/v1/exchange/orders/1/fills?chainId=4217&cursor=WzIzNDU2Nzg5LDBd&include=totalCount&limit=10&order=desc&page=1')
```

## Get pair

`GET /v1/exchange/pairs/{base}`

Get one trading pair by its base token address. On Tempo, the quote token for a pair is determined from the base token onchain.

### Path parameters

- `base` `string` _(required)_: Base token address for the trading pair.

### Query parameters

- `chainId` `string | number`: Which Tempo network to query. Use the alias `mainnet` or `testnet`, or a numeric chain id. Defaults to `mainnet` when omitted.
- `include` `string[]`: Comma-separated optional resources to embed, e.g. `tokens`.

### Responses

#### `200`: Details for one exchange trading pair.

Headers:

- `RateLimit-Limit` `integer`: How many requests you may make in the current time window. Not sent on cached responses or `402` payment challenges.
- `RateLimit-Remaining` `integer`: How many requests you have left in the current window before you are rate-limited. Not sent on cached responses or `402` payment challenges.
- `RateLimit-Reset` `integer`: When the current window resets, as a Unix timestamp in seconds. Not sent on cached responses or `402` payment challenges.
- `RateLimit-Scope` `string`: Which quota this request counted against (e.g. `data:read`). Not sent on cached responses or `402` payment challenges.
- `tempo-request-id` `string`: A unique id for this request, returned on every response (and as `requestId` in error bodies). Include it when contacting support so we can find your request.

Body (`application/json`):

- `base` `object` _(required)_: One side of a trading pair (with metadata when requested via `include=tokens`).
  - `address` `string` _(required)_: TIP-20 token contract address — the `0x`-prefixed 20-byte identifier for this token.
  - `currency` `string`: Human-readable currency code for the token, when known.
  - `decimals` `integer`: Number of decimal places the token uses; stablecoins on Tempo typically use 6.
  - `logoUri` `string`: URL for the token logo image, when one is available.
  - `name` `string`: Human-readable token name, such as `USD Coin`.
  - `symbol` `string`: Short token ticker symbol, such as `USDC`.
  - `verified` `boolean`: Whether Tempo has verified this token metadata.
- `blockNumber` `integer` _(required)_: Block number where the pair was created.
- `id` `string` _(required)_: Stable API id for this pair; it is the same value as the onchain pair key.
- `key` `string` _(required)_: Stable onchain pair identifier returned by the DEX precompile as `pairKey`.
- `liquidity` `string`: Liquidity signal for the pair, present only when you request `sort=liquidity`.
- `quote` `object` _(required)_: One side of a trading pair (with metadata when requested via `include=tokens`).
  - `address` `string` _(required)_: TIP-20 token contract address — the `0x`-prefixed 20-byte identifier for this token.
  - `currency` `string`: Human-readable currency code for the token, when known.
  - `decimals` `integer`: Number of decimal places the token uses; stablecoins on Tempo typically use 6.
  - `logoUri` `string`: URL for the token logo image, when one is available.
  - `name` `string`: Human-readable token name, such as `USD Coin`.
  - `symbol` `string`: Short token ticker symbol, such as `USDC`.
  - `verified` `boolean`: Whether Tempo has verified this token metadata.
- `timestamp` `string <date-time>` _(required)_: Block timestamp when the pair was created.
- `transactionHash` `string` _(required)_: Transaction hash for the transaction that created the pair.

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

#### `403`: Forbidden.

Body (`application/json`):

- `error` `object` _(required)_: What went wrong.
  - `code` `string` _(required)_: A short, stable code you can branch on in your code (e.g. `token_not_found`).
  - `details` `object[]`: A list of specific problems, when the error is about your request (e.g. invalid fields).
    - `message` `string` _(required)_: A specific thing that went wrong, in plain language (e.g. why a field failed validation).
    - `path` `string | number[]`: Where the problem is, as a path into your request (e.g. `["query", "limit"]`). Present for validation errors.
  - `message` `string` _(required)_: A human-readable explanation of what went wrong.
- `requestId` `string` _(required)_: The id of this request — include it when contacting support.

#### `404`: No exchange pair was found for that base token.

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

#### `502`: The indexer could not serve the exchange data right now.

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
curl 'https://api.tempo.xyz/v1/exchange/pairs/0x20c000000000000000000000b9537d11c60e8b50?chainId=4217&include=tokens'
```

```ts
fetch('https://api.tempo.xyz/v1/exchange/pairs/0x20c000000000000000000000b9537d11c60e8b50?chainId=4217&include=tokens')
```

## Get order

`GET /v1/exchange/orders/{orderId}`

Get one order by id, using live onchain state for fields such as the remaining amount.

### Path parameters

- `orderId` `string` _(required)_: On-chain order id, returned as a decimal string.

### Query parameters

- `chainId` `string | number`: Which Tempo network to query. Use the alias `mainnet` or `testnet`, or a numeric chain id. Defaults to `mainnet` when omitted.
- `include` `string[]`: Comma-separated optional resources to embed, e.g. `tokens`.

### Responses

#### `200`: Details for one exchange order.

Headers:

- `RateLimit-Limit` `integer`: How many requests you may make in the current time window. Not sent on cached responses or `402` payment challenges.
- `RateLimit-Remaining` `integer`: How many requests you have left in the current window before you are rate-limited. Not sent on cached responses or `402` payment challenges.
- `RateLimit-Reset` `integer`: When the current window resets, as a Unix timestamp in seconds. Not sent on cached responses or `402` payment challenges.
- `RateLimit-Scope` `string`: Which quota this request counted against (e.g. `data:read`). Not sent on cached responses or `402` payment challenges.
- `tempo-request-id` `string`: A unique id for this request, returned on every response (and as `requestId` in error bodies). Include it when contacting support so we can find your request.

Body (`application/json`):

- `amount` `string` _(required)_: Initial order size, returned as a decimal integer string in base-token smallest units.
- `flipTick` `integer` _(required)_: Replacement `tick` used if this order auto-flips into a counter-order after filling.
- `id` `string` _(required)_: Stable API id for this order; it is the same value as the onchain order id.
- `isBid` `boolean` _(required)_: Order side as a boolean: `true` means the maker buys base, and `false` means the maker sells base.
- `isFlipOrder` `boolean` _(required)_: Whether this order automatically becomes a counter-order after it fills.
- `maker` `string` _(required)_: Maker address that owns the order.
- `mode` `string` _(required)_: Taker-perspective mode for the order. `exactSource` applies to maker bids where the taker sells base; `exactDestination` applies to maker asks where the taker buys base.
- `orderId` `string` _(required)_: On-chain order id, returned as a decimal string.
- `pair` `object` _(required)_: The trading pair the order belongs to.
  - `base` `object` _(required)_: One side of a trading pair (with metadata when requested via `include=tokens`).
    - `address` `string` _(required)_: TIP-20 token contract address — the `0x`-prefixed 20-byte identifier for this token.
    - `currency` `string`: Human-readable currency code for the token, when known.
    - `decimals` `integer`: Number of decimal places the token uses; stablecoins on Tempo typically use 6.
    - `logoUri` `string`: URL for the token logo image, when one is available.
    - `name` `string`: Human-readable token name, such as `USD Coin`.
    - `symbol` `string`: Short token ticker symbol, such as `USDC`.
    - `verified` `boolean`: Whether Tempo has verified this token metadata.
  - `key` `string` _(required)_: On-chain key for this `(base, quote)` trading pair.
  - `quote` `object` _(required)_: One side of a trading pair (with metadata when requested via `include=tokens`).
    - `address` `string` _(required)_: TIP-20 token contract address — the `0x`-prefixed 20-byte identifier for this token.
    - `currency` `string`: Human-readable currency code for the token, when known.
    - `decimals` `integer`: Number of decimal places the token uses; stablecoins on Tempo typically use 6.
    - `logoUri` `string`: URL for the token logo image, when one is available.
    - `name` `string`: Human-readable token name, such as `USD Coin`.
    - `symbol` `string`: Short token ticker symbol, such as `USDC`.
    - `verified` `boolean`: Whether Tempo has verified this token metadata.
- `price` `string` _(required)_: Quote-per-base price implied by `tick`, returned as a fixed-decimal string with 5 decimal places.
- `rate` `string` _(required)_: Destination-to-source price ratio, returned as a fixed-decimal string with 5 decimal places.
- `remaining` `string` _(required)_: Unfilled base-side amount still resting on the orderbook, returned as a decimal integer string.
- `tick` `integer` _(required)_: On-chain signed tick, scaled by `1/priceScale`; use `price` for the decoded ratio.

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

#### `403`: Forbidden.

Body (`application/json`):

- `error` `object` _(required)_: What went wrong.
  - `code` `string` _(required)_: A short, stable code you can branch on in your code (e.g. `token_not_found`).
  - `details` `object[]`: A list of specific problems, when the error is about your request (e.g. invalid fields).
    - `message` `string` _(required)_: A specific thing that went wrong, in plain language (e.g. why a field failed validation).
    - `path` `string | number[]`: Where the problem is, as a path into your request (e.g. `["query", "limit"]`). Present for validation errors.
  - `message` `string` _(required)_: A human-readable explanation of what went wrong.
- `requestId` `string` _(required)_: The id of this request — include it when contacting support.

#### `404`: No exchange order was found for that id.

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

#### `502`: The Tempo RPC node could not serve the exchange data right now.

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
curl 'https://api.tempo.xyz/v1/exchange/orders/1?chainId=4217&include=tokens'
```

```ts
fetch('https://api.tempo.xyz/v1/exchange/orders/1?chainId=4217&include=tokens')
```

## Get pair OHLC

`GET /v1/exchange/pairs/{base}/ohlc`

Get OHLC price candles for one trading pair. OHLC means open, high, low, and close over each time bucket for charting.

### Path parameters

- `base` `string` _(required)_: Base token address for the trading pair.

### Query parameters

- `chainId` `string | number`: Which Tempo network to query. Use the alias `mainnet` or `testnet`, or a numeric chain id. Defaults to `mainnet` when omitted.
- `include` `string[]`: Comma-separated optional resources to embed, e.g. `tokens`.
- `interval` `string`: Time size for each OHLC candle bucket.
- `window` `string`: Rolling time window covered by the OHLC candles.

### Responses

#### `200`: OHLC candle data for the pair.

Headers:

- `RateLimit-Limit` `integer`: How many requests you may make in the current time window. Not sent on cached responses or `402` payment challenges.
- `RateLimit-Remaining` `integer`: How many requests you have left in the current window before you are rate-limited. Not sent on cached responses or `402` payment challenges.
- `RateLimit-Reset` `integer`: When the current window resets, as a Unix timestamp in seconds. Not sent on cached responses or `402` payment challenges.
- `RateLimit-Scope` `string`: Which quota this request counted against (e.g. `data:read`). Not sent on cached responses or `402` payment challenges.
- `tempo-request-id` `string`: A unique id for this request, returned on every response (and as `requestId` in error bodies). Include it when contacting support so we can find your request.

Body (`application/json`):

- `base` `object` _(required)_: One side of a trading pair (with metadata when requested via `include=tokens`).
  - `address` `string` _(required)_: TIP-20 token contract address — the `0x`-prefixed 20-byte identifier for this token.
  - `currency` `string`: Human-readable currency code for the token, when known.
  - `decimals` `integer`: Number of decimal places the token uses; stablecoins on Tempo typically use 6.
  - `logoUri` `string`: URL for the token logo image, when one is available.
  - `name` `string`: Human-readable token name, such as `USD Coin`.
  - `symbol` `string`: Short token ticker symbol, such as `USDC`.
  - `verified` `boolean`: Whether Tempo has verified this token metadata.
- `data` `object[]` _(required)_: OHLC candle buckets ordered oldest to newest; empty buckets are omitted.
  - `close` `string` _(required)_: Close price for the bucket: the latest fill rate, returned with 5 decimal places.
  - `fillCount` `integer` _(required)_: Number of fills included in this bucket.
  - `high` `string` _(required)_: High price for the bucket: the highest fill rate, returned with 5 decimal places.
  - `id` `string` _(required)_: Stable API id built from the pair key, candle interval, and bucket start time in Unix seconds.
  - `low` `string` _(required)_: Low price for the bucket: the lowest fill rate, returned with 5 decimal places.
  - `open` `string` _(required)_: Open price for the bucket: the earliest fill rate, returned with 5 decimal places.
  - `timestamp` `string <date-time>` _(required)_: ISO 8601 timestamp for the start of this candle bucket.
  - `volume` `object` _(required)_: Total filled volume in this bucket, split by pair side.
    - `base` `string` _(required)_: Total base-side amount filled in this bucket, in the token’s smallest units.
    - `quote` `string` _(required)_: Total quote-side amount filled in this bucket, reconstructed from each fill’s tick and returned in the token’s smallest units.
- `interval` `string` _(required)_: Time size for each OHLC candle bucket.
- `quote` `object` _(required)_: One side of a trading pair (with metadata when requested via `include=tokens`).
  - `address` `string` _(required)_: TIP-20 token contract address — the `0x`-prefixed 20-byte identifier for this token.
  - `currency` `string`: Human-readable currency code for the token, when known.
  - `decimals` `integer`: Number of decimal places the token uses; stablecoins on Tempo typically use 6.
  - `logoUri` `string`: URL for the token logo image, when one is available.
  - `name` `string`: Human-readable token name, such as `USD Coin`.
  - `symbol` `string`: Short token ticker symbol, such as `USDC`.
  - `verified` `boolean`: Whether Tempo has verified this token metadata.
- `truncated` `boolean` _(required)_: `true` when the fill scan hit its hard cap, meaning OHLC values were computed from only the most recent fills.
- `window` `string` _(required)_: Rolling time window covered by the OHLC candles.

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

#### `403`: Forbidden.

Body (`application/json`):

- `error` `object` _(required)_: What went wrong.
  - `code` `string` _(required)_: A short, stable code you can branch on in your code (e.g. `token_not_found`).
  - `details` `object[]`: A list of specific problems, when the error is about your request (e.g. invalid fields).
    - `message` `string` _(required)_: A specific thing that went wrong, in plain language (e.g. why a field failed validation).
    - `path` `string | number[]`: Where the problem is, as a path into your request (e.g. `["query", "limit"]`). Present for validation errors.
  - `message` `string` _(required)_: A human-readable explanation of what went wrong.
- `requestId` `string` _(required)_: The id of this request — include it when contacting support.

#### `404`: No exchange pair was found for that base token.

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

#### `502`: The indexer could not serve the exchange data right now.

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
curl 'https://api.tempo.xyz/v1/exchange/pairs/0x20c000000000000000000000b9537d11c60e8b50/ohlc?chainId=4217&include=tokens&interval=1h&window=24h'
```

```ts
fetch('https://api.tempo.xyz/v1/exchange/pairs/0x20c000000000000000000000b9537d11c60e8b50/ohlc?chainId=4217&include=tokens&interval=1h&window=24h')
```

## Get pair depth

`GET /v1/exchange/pairs/{base}/depth`

Get orderbook depth for one trading pair. Depth shows resting liquidity at price ticks on both sides of the book.

### Path parameters

- `base` `string` _(required)_: Base token address for the trading pair.

### Query parameters

- `chainId` `string | number`: Which Tempo network to query. Use the alias `mainnet` or `testnet`, or a numeric chain id. Defaults to `mainnet` when omitted.
- `include` `string[]`: Comma-separated optional resources to embed, e.g. `tokens`.
- `levels` `integer`: Maximum number of non-empty price levels to return per side (1-200).

### Responses

#### `200`: Orderbook depth data for the pair.

Headers:

- `RateLimit-Limit` `integer`: How many requests you may make in the current time window. Not sent on cached responses or `402` payment challenges.
- `RateLimit-Remaining` `integer`: How many requests you have left in the current window before you are rate-limited. Not sent on cached responses or `402` payment challenges.
- `RateLimit-Reset` `integer`: When the current window resets, as a Unix timestamp in seconds. Not sent on cached responses or `402` payment challenges.
- `RateLimit-Scope` `string`: Which quota this request counted against (e.g. `data:read`). Not sent on cached responses or `402` payment challenges.
- `tempo-request-id` `string`: A unique id for this request, returned on every response (and as `requestId` in error bodies). Include it when contacting support so we can find your request.

Body (`application/json`):

- `asks` `object[]` _(required)_: Ask-side levels, where makers sell base and takers buy it, ordered from best lowest ask outward.
  - `cumulativeSize` `string` _(required)_: Running sum of `size` from the best populated tick outward to this level, in base-token smallest units.
  - `id` `string` _(required)_: Stable API id built from the pair key, orderbook side, and tick.
  - `price` `string` _(required)_: Tick converted to a price ratio with 5 decimal places.
  - `size` `string` _(required)_: Resting liquidity at this tick level, in base-token smallest units.
  - `tick` `integer` _(required)_: Signed price tick (`int16`), always a multiple of the DEX tick spacing.
- `base` `object` _(required)_: One side of a trading pair (with metadata when requested via `include=tokens`).
  - `address` `string` _(required)_: TIP-20 token contract address — the `0x`-prefixed 20-byte identifier for this token.
  - `currency` `string`: Human-readable currency code for the token, when known.
  - `decimals` `integer`: Number of decimal places the token uses; stablecoins on Tempo typically use 6.
  - `logoUri` `string`: URL for the token logo image, when one is available.
  - `name` `string`: Human-readable token name, such as `USD Coin`.
  - `symbol` `string`: Short token ticker symbol, such as `USDC`.
  - `verified` `boolean`: Whether Tempo has verified this token metadata.
- `bids` `object[]` _(required)_: Bid-side levels, where makers buy base and takers sell it, ordered from best highest bid outward.
  - `cumulativeSize` `string` _(required)_: Running sum of `size` from the best populated tick outward to this level, in base-token smallest units.
  - `id` `string` _(required)_: Stable API id built from the pair key, orderbook side, and tick.
  - `price` `string` _(required)_: Tick converted to a price ratio with 5 decimal places.
  - `size` `string` _(required)_: Resting liquidity at this tick level, in base-token smallest units.
  - `tick` `integer` _(required)_: Signed price tick (`int16`), always a multiple of the DEX tick spacing.
- `quote` `object` _(required)_: One side of a trading pair (with metadata when requested via `include=tokens`).
  - `address` `string` _(required)_: TIP-20 token contract address — the `0x`-prefixed 20-byte identifier for this token.
  - `currency` `string`: Human-readable currency code for the token, when known.
  - `decimals` `integer`: Number of decimal places the token uses; stablecoins on Tempo typically use 6.
  - `logoUri` `string`: URL for the token logo image, when one is available.
  - `name` `string`: Human-readable token name, such as `USD Coin`.
  - `symbol` `string`: Short token ticker symbol, such as `USDC`.
  - `verified` `boolean`: Whether Tempo has verified this token metadata.

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

#### `403`: Forbidden.

Body (`application/json`):

- `error` `object` _(required)_: What went wrong.
  - `code` `string` _(required)_: A short, stable code you can branch on in your code (e.g. `token_not_found`).
  - `details` `object[]`: A list of specific problems, when the error is about your request (e.g. invalid fields).
    - `message` `string` _(required)_: A specific thing that went wrong, in plain language (e.g. why a field failed validation).
    - `path` `string | number[]`: Where the problem is, as a path into your request (e.g. `["query", "limit"]`). Present for validation errors.
  - `message` `string` _(required)_: A human-readable explanation of what went wrong.
- `requestId` `string` _(required)_: The id of this request — include it when contacting support.

#### `404`: No exchange pair was found for that base token.

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

#### `502`: The Tempo RPC node could not serve the exchange data right now.

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
curl 'https://api.tempo.xyz/v1/exchange/pairs/0x20c000000000000000000000b9537d11c60e8b50/depth?chainId=4217&include=tokens&levels=50'
```

```ts
fetch('https://api.tempo.xyz/v1/exchange/pairs/0x20c000000000000000000000b9537d11c60e8b50/depth?chainId=4217&include=tokens&levels=50')
```

## Create quote

`POST /v1/exchange/quotes`

Attempts exchange providers in priority order and returns the first executable quote. This endpoint does not submit a transaction.

### Query parameters

- `chainId` `string | number`: Which Tempo network to query. Use the alias `mainnet` or `testnet`, or a numeric chain id. Defaults to `mainnet` when omitted.
- `include` `string[]`: Comma-separated token fields to include, such as `token.logoUri,token.verified`.
- `valuation.currency` `string`: Currency to denominate values in (case-insensitive, e.g. `AUD`). Must be priced by the configured FX oracle.

### Request body (required) (`application/json`)

- `account` `string`: Wallet that will sign and execute the swap.
- `amount` `string` _(required)_: Pinned amount in base units: source amount for `exactSource`, destination amount for `exactDestination`.
- `destinationToken` `string` _(required)_: TIP-20 token the swap receives.
- `mode` `string` _(required)_: Which side of the swap keeps the requested amount exact.
- `slippageBps` `integer` _(required)_: Allowed execution slippage in basis points, where 100 is 1%.
- `sourceToken` `string` _(required)_: TIP-20 token the swap spends.

### Responses

#### `200`: A provider-neutral quote and its next execution action.

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

#### `402`: Payment required. This endpoint accepts MPP payment, and the request either exceeded free quota or needs a paid request credential. The challenge is protocol-native (handled by mppx), not the JSON error envelope: read the `WWW-Authenticate` header and retry with `Authorization: Payment <credential>`. A successful paid response carries `Payment-Receipt`.

Headers:

- `WWW-Authenticate` `string`: On a `402` response, the payment challenge to satisfy. Use it to build the `Authorization: Payment` credential and retry the request.

#### `403`: Forbidden.

Body (`application/json`):

- `error` `object` _(required)_: What went wrong.
  - `code` `string` _(required)_: A short, stable code you can branch on in your code (e.g. `token_not_found`).
  - `details` `object[]`: A list of specific problems, when the error is about your request (e.g. invalid fields).
    - `message` `string` _(required)_: A specific thing that went wrong, in plain language (e.g. why a field failed validation).
    - `path` `string | number[]`: Where the problem is, as a path into your request (e.g. `["query", "limit"]`). Present for validation errors.
  - `message` `string` _(required)_: A human-readable explanation of what went wrong.
- `requestId` `string` _(required)_: The id of this request — include it when contacting support.

#### `404`: No configured provider can price an executable exchange for these terms.

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

#### `502`: The Tempo RPC could not quote the swap or resolve token metadata.

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
curl 'https://api.tempo.xyz/v1/exchange/quotes?chainId=4217&include=token.logoUri,token.verified&valuation.currency=AUD' \
  --request POST \
  --header 'Content-Type: application/json' \
  --data '{
  "amount": "1000000",
  "destinationToken": "0x20c000000000000000000000b9537d11c60e8b50",
  "mode": "exactSource",
  "slippageBps": 50,
  "sourceToken": "0x20c0000000000000000000008f5425160ebe5525"
}'
```

```ts
fetch('https://api.tempo.xyz/v1/exchange/quotes?chainId=4217&include=token.logoUri,token.verified&valuation.currency=AUD', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    amount: '1000000',
    destinationToken: '0x20c000000000000000000000b9537d11c60e8b50',
    mode: 'exactSource',
    slippageBps: 50,
    sourceToken: '0x20c0000000000000000000008f5425160ebe5525'
  })
})
```

## Finalize quote

`POST /v1/exchange/quotes/execute`

Finishes a provider quote after the wallet supplies the requested typed-data signature. This endpoint does not submit a transaction.

### Query parameters

- `chainId` `string | number`: Which Tempo network to query. Use the alias `mainnet` or `testnet`, or a numeric chain id. Defaults to `mainnet` when omitted.
- `include` `string[]`: Comma-separated token fields to include, such as `token.logoUri,token.verified`.
- `valuation.currency` `string`: Currency to denominate values in (case-insensitive, e.g. `AUD`). Must be priced by the configured FX oracle.

### Request body (required) (`application/json`)

- `account` `string` _(required)_: Wallet that signed and will execute the swap.
- `continuation` `string` _(required)_: Opaque state returned by the quote request.
- `provider` `string` _(required)_: Provider that issued the continuation.
- `signature` `string` _(required)_: 65-byte EIP-712 signature requested by the quote.

### Responses

#### `200`: The final unsigned calls needed to execute the swap.

Headers:

- `RateLimit-Limit` `integer`: How many requests you may make in the current time window. Not sent on cached responses or `402` payment challenges.
- `RateLimit-Remaining` `integer`: How many requests you have left in the current window before you are rate-limited. Not sent on cached responses or `402` payment challenges.
- `RateLimit-Reset` `integer`: When the current window resets, as a Unix timestamp in seconds. Not sent on cached responses or `402` payment challenges.
- `RateLimit-Scope` `string`: Which quota this request counted against (e.g. `data:read`). Not sent on cached responses or `402` payment challenges.
- `tempo-request-id` `string`: A unique id for this request, returned on every response (and as `requestId` in error bodies). Include it when contacting support so we can find your request.

Body (`application/json`):

- `provider` `string` _(required)_: Provider that built the transaction.
- `transaction` `object` _(required)_: Unsigned Tempo transaction plan.
  - `calls` `object[]` _(required)_: Calls to execute in order.
    - `data` `string` _(required)_: ABI-encoded call data.
    - `to` `string` _(required)_: Contract or precompile that receives the call.
    - `value` `string` _(required)_: Native token value sent with the call.
  - `chainId` `string | number` _(required)_: Tempo chain where these calls execute.

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

#### `502`: The selected provider could not build the swap right now.

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
curl 'https://api.tempo.xyz/v1/exchange/quotes/execute?chainId=4217&include=token.logoUri,token.verified&valuation.currency=AUD' \
  --request POST \
  --header 'Content-Type: application/json' \
  --data '{
  "account": "0xbe058e1c4df8a4366a387bf595b284246a93039e",
  "continuation": "eyJwcm92aWRlciI6InVuaXN3YXAifQ",
  "provider": "uniswap",
  "signature": "0x1111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111"
}'
```

```ts
fetch('https://api.tempo.xyz/v1/exchange/quotes/execute?chainId=4217&include=token.logoUri,token.verified&valuation.currency=AUD', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    account: '0xbe058e1c4df8a4366a387bf595b284246a93039e',
    continuation: 'eyJwcm92aWRlciI6InVuaXN3YXAifQ',
    provider: 'uniswap',
    signature: '0x1111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111'
  })
})
```
