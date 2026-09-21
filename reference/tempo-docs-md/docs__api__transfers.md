# Transfers

Token movements from executing transactions.

## List transfers

`GET /v1/transfers`

List token transfer events across Tempo.

### Query parameters

- `address` `string`: Only include transfers where this account is the sender or recipient. Use this shortcut by itself, not with `sender` or `recipient`.
- `recipient` `string`: Match transfers sent to this recipient address (`to`).
- `sender` `string`: Match transfers sent from this sender address (`from`).
- `token` `string`: Match transfers for this TIP-20 token contract address.
- `blockNumber.from` `integer`: Only include transfers at or after this block number.
- `blockNumber.to` `integer`: Only include transfers at or before this block number.
- `chainId` `string | number`: Which Tempo network to query. Use the alias `mainnet` or `testnet`, or a numeric chain id. Defaults to `mainnet` when omitted.
- `cursor` `string`: Opaque keyset cursor from a previous response (`nextCursor`); pass it back verbatim to fetch the next page. Omit for the first (head) page.
- `include` `string[]`: Comma-separated related resources to include, such as `token.logoUri,token.verified,memo,crossToken,totalCount`.
- `limit` `integer`: How many items to return per page (5–50, default 10). Use `nextCursor` to fetch more.
- `order` `string`: Sort order: `desc` for descending (the default), or `asc` for ascending.
- `page` `integer`: Page number, 1-indexed (positional pagination for page-numbered access; `page=1` is the head page). Mutually exclusive with `cursor`, and `page × limit` must be at most 500 rows — use cursor pagination for deeper traversal. Pages are positional, so rows arriving at the head of a live feed can shift page contents.
- `timestamp.from` `string <date-time>`: Only include transfers at or after this ISO 8601 timestamp.
- `timestamp.to` `string <date-time>`: Only include transfers at or before this ISO 8601 timestamp.
- `valuation.currency` `string`: Currency to denominate values in (case-insensitive, e.g. `AUD`). Must be priced by the configured FX oracle.

### Responses

#### `200`: A page of token transfer events.

Headers:

- `RateLimit-Limit` `integer`: How many requests you may make in the current time window. Not sent on cached responses or `402` payment challenges.
- `RateLimit-Remaining` `integer`: How many requests you have left in the current window before you are rate-limited. Not sent on cached responses or `402` payment challenges.
- `RateLimit-Reset` `integer`: When the current window resets, as a Unix timestamp in seconds. Not sent on cached responses or `402` payment challenges.
- `RateLimit-Scope` `string`: Which quota this request counted against (e.g. `data:read`). Not sent on cached responses or `402` payment challenges.
- `tempo-request-id` `string`: A unique id for this request, returned on every response (and as `requestId` in error bodies). Include it when contacting support so we can find your request.

Body (`application/json`):

- `data` `object[]` _(required)_: The transfers in this page.
  - `attribution` `string`: The resolved MPP service name, when the transfer memo matches a known service fingerprint. Returned when you request `include=memo`.
  - `blockNumber` `integer` _(required)_: The block number where this transfer was recorded.
  - `destinationAmount` `object`: A token amount carrying its nominal value in the requested denomination.
    - `baseUnits` `string` _(required)_: The quantity in the token's smallest unit.
    - `currency` `string` _(required)_: The monetary denomination of this quantity.
    - `decimals` `integer` _(required)_: Decimal places used to convert `baseUnits` into `formatted`.
    - `formatted` `string` _(required)_: The quantity rendered in whole token units.
    - `valuation` `object`: The amount’s nominal value in the requested `valuation.currency`. `null` when the token is unverified, its display currency has no rate, or rates were unavailable.
      - `amount` `string` _(required)_: The holding’s nominal value, as a decimal string in `currency`.
      - `currency` `string` _(required)_: The denomination currency of this value.
  - `destinationToken` `object`: The token that moved.
    - `address` `string` _(required)_: The TIP-20 token contract address on Tempo.
    - `currency` `string` _(required)_: The currency label for this token, such as `USD` for USD-denominated stablecoins.
    - `decimals` `integer` _(required)_: The number of decimal places the token uses; Tempo stablecoins typically use 6.
    - `logoUri` `string`: A URL for the token’s logo image, returned with `include=token.logoUri`.
    - `name` `string` _(required)_: The token’s human-readable name.
    - `symbol` `string` _(required)_: The short ticker symbol wallets and apps show for this token.
    - `verified` `boolean`: Whether this token is in Tempo’s curated verified list, returned with `include=token.verified`.
  - `id` `string` _(required)_: A stable resource ID for this transfer, built from `${transactionHash}-${logIndex}`.
  - `logIndex` `integer` _(required)_: The transfer event’s log index within the block.
  - `memo` `string`: The decoded text memo from the matching `TransferWithMemo` event, when one is present. Returned when you request `include=memo`.
  - `recipient` `string` _(required)_: The account address that received the tokens.
  - `sender` `string` _(required)_: The account address that sent the tokens.
  - `sourceAmount` `object` _(required)_: A token amount carrying its nominal value in the requested denomination.
    - `baseUnits` `string` _(required)_: The quantity in the token's smallest unit.
    - `currency` `string` _(required)_: The monetary denomination of this quantity.
    - `decimals` `integer` _(required)_: Decimal places used to convert `baseUnits` into `formatted`.
    - `formatted` `string` _(required)_: The quantity rendered in whole token units.
    - `valuation` `object`: The amount’s nominal value in the requested `valuation.currency`. `null` when the token is unverified, its display currency has no rate, or rates were unavailable.
      - `amount` `string` _(required)_: The holding’s nominal value, as a decimal string in `currency`.
      - `currency` `string` _(required)_: The denomination currency of this value.
  - `sourceToken` `object` _(required)_: The token that moved.
    - `address` `string` _(required)_: The TIP-20 token contract address on Tempo.
    - `currency` `string` _(required)_: The currency label for this token, such as `USD` for USD-denominated stablecoins.
    - `decimals` `integer` _(required)_: The number of decimal places the token uses; Tempo stablecoins typically use 6.
    - `logoUri` `string`: A URL for the token’s logo image, returned with `include=token.logoUri`.
    - `name` `string` _(required)_: The token’s human-readable name.
    - `symbol` `string` _(required)_: The short ticker symbol wallets and apps show for this token.
    - `verified` `boolean`: Whether this token is in Tempo’s curated verified list, returned with `include=token.verified`.
  - `timestamp` `string <date-time>` _(required)_: The block timestamp when this transfer was recorded.
  - `transactionHash` `string` _(required)_: The hash of the transaction that emitted this transfer event.
- `meta` `object`: Page-level resources: opt-in counts and valuation rate provenance.
  - `valuation` `object`: Rate provenance for leg valuations. Present when conversion rates were consulted; absent when every value was identity-valued or rates were unavailable.
    - `asOf` `string <date-time>` _(required)_: Publication date of the rate set as an ISO 8601 timestamp.
    - `basis` `string` _(required)_: Valuation basis: one token unit counts as one unit of its display currency.
    - `source` `string` _(required)_: FX rate oracle that supplied the conversion rates.
  - `totalCount` `integer`: Number of rows matching the query, exact when `totalCountCapped` is false and a lower bound (at least this many, computed up to 10000) when `totalCountCapped` is true. Independent of pagination: use `nextCursor` to page, not this count.
  - `totalCountCapped` `boolean`: Whether `totalCount` hit the count cap. When true, `totalCount` is a lower bound rather than an exact total.
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

#### `502`: The indexer or Tempo RPC could not serve this request.

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
curl 'https://api.tempo.xyz/v1/transfers?address=0xbe058e1c4df8a4366a387bf595b284246a93039e&recipient=0xbe058e1c4df8a4366a387bf595b284246a93039e&sender=0xbe058e1c4df8a4366a387bf595b284246a93039e&token=0x20c0000000000000000000000000000000000000&blockNumber.from=23456789&blockNumber.to=23456999&chainId=4217&cursor=WzIzNDU2Nzg5LDBd&include=crossToken,memo,token.logoUri,token.verified,totalCount&limit=10&order=desc&page=1&timestamp.from=2024-01-01T00:00:00Z&timestamp.to=2024-12-31T23:59:59Z&valuation.currency=AUD'
```

```ts
fetch('https://api.tempo.xyz/v1/transfers?address=0xbe058e1c4df8a4366a387bf595b284246a93039e&recipient=0xbe058e1c4df8a4366a387bf595b284246a93039e&sender=0xbe058e1c4df8a4366a387bf595b284246a93039e&token=0x20c0000000000000000000000000000000000000&blockNumber.from=23456789&blockNumber.to=23456999&chainId=4217&cursor=WzIzNDU2Nzg5LDBd&include=crossToken,memo,token.logoUri,token.verified,totalCount&limit=10&order=desc&page=1&timestamp.from=2024-01-01T00:00:00Z&timestamp.to=2024-12-31T23:59:59Z&valuation.currency=AUD')
```
