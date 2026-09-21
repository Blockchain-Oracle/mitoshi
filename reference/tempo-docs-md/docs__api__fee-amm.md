# Fee AMM

Pools that convert stablecoins to pay fees.

## List pools

`GET /v1/fee-amm/pools`

Lists Fee AMM pools by mint activity, showing which stablecoin fee conversions have the most liquidity activity.

### Query parameters

- `chainId` `string | number`: Which Tempo network to query. Use the alias `mainnet` or `testnet`, or a numeric chain id. Defaults to `mainnet` when omitted.
- `cursor` `string`: Opaque keyset cursor from a previous response (`nextCursor`); pass it back verbatim to fetch the next page. Omit for the first (head) page.
- `include` `string[]`: Comma-separated token fields to include, such as `token.logoUri,token.verified`.
- `limit` `integer`: How many items to return per page (5–50, default 10). Use `nextCursor` to fetch more.
- `page` `integer`: Page number, 1-indexed (positional pagination for page-numbered access; `page=1` is the head page). Mutually exclusive with `cursor`, and `page × limit` must be at most 500 rows — use cursor pagination for deeper traversal. Pages are positional, so rows arriving at the head of a live feed can shift page contents.

### Responses

#### `200`: List of Fee AMM pools.

Headers:

- `RateLimit-Limit` `integer`: How many requests you may make in the current time window. Not sent on cached responses or `402` payment challenges.
- `RateLimit-Remaining` `integer`: How many requests you have left in the current window before you are rate-limited. Not sent on cached responses or `402` payment challenges.
- `RateLimit-Reset` `integer`: When the current window resets, as a Unix timestamp in seconds. Not sent on cached responses or `402` payment challenges.
- `RateLimit-Scope` `string`: Which quota this request counted against (e.g. `data:read`). Not sent on cached responses or `402` payment challenges.
- `tempo-request-id` `string`: A unique id for this request, returned on every response (and as `requestId` in error bodies). Include it when contacting support so we can find your request.

Body (`application/json`):

- `data` `object[]` _(required)_: Fee AMM pools ordered by mint count, most active first.
  - `createdAt` `string <date-time>` _(required)_: Timestamp when liquidity was first minted into this pool.
  - `id` `string` _(required)_: Stable resource id for the pool; this is the same value as `poolId`.
  - `lastMintAt` `string <date-time>` _(required)_: Timestamp when liquidity was most recently minted into this pool.
  - `mintCount` `integer` _(required)_: Number of liquidity mints into this pool.
  - `poolId` `string` _(required)_: Pool id computed as `keccak256(abi.encode(userToken, validatorToken))`, matching `FeeManager.getPoolId`.
  - `userAmount` `object`: Current user-token reserve. Omitted when the onchain read fails.
    - `baseUnits` `string` _(required)_: The quantity in the token's smallest unit.
    - `currency` `string` _(required)_: The monetary denomination of this quantity.
    - `decimals` `integer` _(required)_: Decimal places used to convert `baseUnits` into `formatted`.
    - `formatted` `string` _(required)_: The quantity rendered in whole token units.
  - `userToken` `object` _(required)_: A token referenced by one side of a Fee AMM pool.
    - `address` `string` _(required)_: The TIP-20 token contract address on Tempo.
    - `currency` `string` _(required)_: The currency label for this token, such as `USD` for USD-denominated stablecoins.
    - `decimals` `integer` _(required)_: The number of decimal places the token uses; Tempo stablecoins typically use 6.
    - `logoUri` `string`: A URL for the token’s logo image, when one is available.
    - `name` `string` _(required)_: The token’s human-readable name.
    - `symbol` `string` _(required)_: The short ticker symbol wallets and apps show for this token.
    - `verified` `boolean`: Whether this token is in Tempo’s curated verified token list.
  - `validatorAmount` `object`: Current validator-token reserve. Omitted when the onchain read fails.
    - `baseUnits` `string` _(required)_: The quantity in the token's smallest unit.
    - `currency` `string` _(required)_: The monetary denomination of this quantity.
    - `decimals` `integer` _(required)_: Decimal places used to convert `baseUnits` into `formatted`.
    - `formatted` `string` _(required)_: The quantity rendered in whole token units.
  - `validatorToken` `object` _(required)_: A token referenced by one side of a Fee AMM pool.
    - `address` `string` _(required)_: The TIP-20 token contract address on Tempo.
    - `currency` `string` _(required)_: The currency label for this token, such as `USD` for USD-denominated stablecoins.
    - `decimals` `integer` _(required)_: The number of decimal places the token uses; Tempo stablecoins typically use 6.
    - `logoUri` `string`: A URL for the token’s logo image, when one is available.
    - `name` `string` _(required)_: The token’s human-readable name.
    - `symbol` `string` _(required)_: The short ticker symbol wallets and apps show for this token.
    - `verified` `boolean`: Whether this token is in Tempo’s curated verified token list.
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

#### `502`: Tempo RPC or the upstream indexer could not complete the request.

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
curl 'https://api.tempo.xyz/v1/fee-amm/pools?chainId=4217&cursor=WzIzNDU2Nzg5LDBd&include=token.logoUri,token.verified&limit=10&page=1'
```

```ts
fetch('https://api.tempo.xyz/v1/fee-amm/pools?chainId=4217&cursor=WzIzNDU2Nzg5LDBd&include=token.logoUri,token.verified&limit=10&page=1')
```

## List mints

`GET /v1/fee-amm/mints`

Lists liquidity mints into Fee AMM pools.

### Query parameters

- `chainId` `string | number`: Which Tempo network to query. Use the alias `mainnet` or `testnet`, or a numeric chain id. Defaults to `mainnet` when omitted.
- `cursor` `string`: Opaque keyset cursor from a previous response (`nextCursor`); pass it back verbatim to fetch the next page. Omit for the first (head) page.
- `include` `string[]`: Comma-separated optional resources to embed, e.g. `totalCount`.
- `limit` `integer`: How many items to return per page (5–50, default 10). Use `nextCursor` to fetch more.
- `order` `string`: Sort order: `desc` for descending (the default), or `asc` for ascending.
- `page` `integer`: Page number, 1-indexed (positional pagination for page-numbered access; `page=1` is the head page). Mutually exclusive with `cursor`, and `page × limit` must be at most 500 rows — use cursor pagination for deeper traversal. Pages are positional, so rows arriving at the head of a live feed can shift page contents.
- `userToken` `string`: Only include mints for pools where users paid fees with this token.
- `validatorToken` `string`: Only include mints for pools where validators receive this token.

### Responses

#### `200`: Page of Fee AMM liquidity mints.

Headers:

- `RateLimit-Limit` `integer`: How many requests you may make in the current time window. Not sent on cached responses or `402` payment challenges.
- `RateLimit-Remaining` `integer`: How many requests you have left in the current window before you are rate-limited. Not sent on cached responses or `402` payment challenges.
- `RateLimit-Reset` `integer`: When the current window resets, as a Unix timestamp in seconds. Not sent on cached responses or `402` payment challenges.
- `RateLimit-Scope` `string`: Which quota this request counted against (e.g. `data:read`). Not sent on cached responses or `402` payment challenges.
- `tempo-request-id` `string`: A unique id for this request, returned on every response (and as `requestId` in error bodies). Include it when contacting support so we can find your request.

Body (`application/json`):

- `data` `object[]` _(required)_: Liquidity mints returned on this page.
  - `amountUserToken` `string`: Amount of the user-side token deposited, in base units. Only present on legacy-signature mints.
  - `amountValidatorToken` `string` _(required)_: Amount of the validator-side token deposited, in base units.
  - `blockNumber` `integer` _(required)_: Block number where the mint occurred.
  - `id` `string` _(required)_: Stable mint id built from the transaction hash and log index (`${transactionHash}-${logIndex}`).
  - `liquidity` `string` _(required)_: Amount of pool liquidity minted, as an integer string.
  - `logIndex` `integer` _(required)_: Log index of this mint within the block.
  - `minter` `string` _(required)_: Address that deposited tokens into the pool.
  - `recipient` `string`: Address that received the minted liquidity. Only present on current-signature mints.
  - `timestamp` `string <date-time>` _(required)_: Block timestamp when the mint occurred.
  - `transactionHash` `string` _(required)_: Hash of the transaction that emitted this mint.
  - `userToken` `object` _(required)_: A TIP-20 token used by a Fee AMM pool, with metadata when available.
    - `address` `string` _(required)_: TIP-20 token contract address used by this fee pool.
    - `currency` `string`: Display currency for the token, when available.
    - `decimals` `integer`: Number of decimal places the token uses.
    - `logoUri` `string`: URL for the token logo image, when available.
    - `name` `string`: Human-readable token name.
    - `symbol` `string`: Short token ticker symbol.
    - `verified` `boolean`: Whether Tempo has verified this token’s metadata.
  - `validatorToken` `object` _(required)_: A TIP-20 token used by a Fee AMM pool, with metadata when available.
    - `address` `string` _(required)_: TIP-20 token contract address used by this fee pool.
    - `currency` `string`: Display currency for the token, when available.
    - `decimals` `integer`: Number of decimal places the token uses.
    - `logoUri` `string`: URL for the token logo image, when available.
    - `name` `string`: Human-readable token name.
    - `symbol` `string`: Short token ticker symbol.
    - `verified` `boolean`: Whether Tempo has verified this token’s metadata.
- `meta` `object`: Response-wide metadata requested with `include`, such as `totalCount`.
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

#### `502`: The upstream Tempo indexer could not complete the request.

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
curl 'https://api.tempo.xyz/v1/fee-amm/mints?chainId=4217&cursor=WzIzNDU2Nzg5LDBd&include=totalCount&limit=10&order=desc&page=1&userToken=0x20c0000000000000000000000000000000000000&validatorToken=0x20c0000000000000000000000000000000000000'
```

```ts
fetch('https://api.tempo.xyz/v1/fee-amm/mints?chainId=4217&cursor=WzIzNDU2Nzg5LDBd&include=totalCount&limit=10&order=desc&page=1&userToken=0x20c0000000000000000000000000000000000000&validatorToken=0x20c0000000000000000000000000000000000000')
```
