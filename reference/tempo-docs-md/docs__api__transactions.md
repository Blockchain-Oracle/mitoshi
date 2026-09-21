# Transactions

Transactions submitted to Tempo, and their receipts.

## List transactions

`GET /v1/transactions`

List transactions across Tempo, with filters for addresses, blocks, timestamps, fees, and status.

### Query parameters

- `address` `string`: Filter to transactions where this address is either the sender or recipient.
- `blockNumber.from` `integer`: Only include transactions at or after this block number.
- `blockNumber.to` `integer`: Only include transactions at or before this block number.
- `chainId` `string | number`: Which Tempo network to query. Use the alias `mainnet` or `testnet`, or a numeric chain id. Defaults to `mainnet` when omitted.
- `cursor` `string`: Opaque keyset cursor from a previous response (`nextCursor`); pass it back verbatim to fetch the next page. Omit for the first (head) page.
- `feePayer` `string`: Filter to transactions whose fee payer is this address.
- `feeToken` `string`: Filter to transactions whose fee was paid in this token address.
- `include` `string[]`: Comma-separated related resources to include, such as `feeToken.logoUri,feeToken.verified,receipt,totalCount`.
- `limit` `integer`: How many items to return per page (5–50, default 10). Use `nextCursor` to fetch more.
- `order` `string`: Sort order: `desc` for descending (the default), or `asc` for ascending.
- `page` `integer`: Page number, 1-indexed (positional pagination for page-numbered access; `page=1` is the head page). Mutually exclusive with `cursor`, and `page × limit` must be at most 500 rows — use cursor pagination for deeper traversal. Pages are positional, so rows arriving at the head of a live feed can shift page contents.
- `recipient` `string`: Filter to transactions sent to this recipient address.
- `sender` `string`: Filter to transactions sent by this sender address.
- `status` `string`: Filter to transactions whose receipt shows this execution status.
- `timestamp.from` `string <date-time>`: Only include transactions at or after this ISO 8601 timestamp.
- `timestamp.to` `string <date-time>`: Only include transactions at or before this ISO 8601 timestamp.

### Responses

#### `200`: A page of transactions.

Headers:

- `RateLimit-Limit` `integer`: How many requests you may make in the current time window. Not sent on cached responses or `402` payment challenges.
- `RateLimit-Remaining` `integer`: How many requests you have left in the current window before you are rate-limited. Not sent on cached responses or `402` payment challenges.
- `RateLimit-Reset` `integer`: When the current window resets, as a Unix timestamp in seconds. Not sent on cached responses or `402` payment challenges.
- `RateLimit-Scope` `string`: Which quota this request counted against (e.g. `data:read`). Not sent on cached responses or `402` payment challenges.
- `tempo-request-id` `string`: A unique id for this request, returned on every response (and as `requestId` in error bodies). Include it when contacting support so we can find your request.

Body (`application/json`):

- `data` `object[]` _(required)_: Transactions on this page.
  - `blockHash` `string` _(required)_: The block hash once included, or `null` while the transaction is pending.
  - `blockNumber` `integer` _(required)_: The block number once included, or `null` while the transaction is pending.
  - `calls` `object[]`: Decoded calls for Tempo account-abstraction transactions.
    - `data` `string`: Call data sent to the contract, as `0x`-prefixed bytes.
    - `to` `string` _(required)_: The address this call targets, or `null` when it creates a contract.
  - `chainId` `integer`: The chain ID that this transaction belongs to.
  - `feeToken` `object`: The token requested for transaction fees, with RPC metadata and optional curated fields.
    - `address` `string` _(required)_: The TIP-20 token contract address on Tempo.
    - `currency` `string` _(required)_: The currency label for this token, such as `USD` for USD-denominated stablecoins.
    - `decimals` `integer` _(required)_: The number of decimal places the token uses; Tempo stablecoins typically use 6.
    - `logoUri` `string`: A URL for the token’s logo image, when one is available.
    - `name` `string` _(required)_: The token’s human-readable name.
    - `symbol` `string` _(required)_: The short ticker symbol wallets and apps show for this token.
    - `verified` `boolean`: Whether this token is in Tempo’s curated verified token list.
  - `gas` `integer` _(required)_: Maximum gas the transaction is allowed to use.
  - `gasPrice` `string`: Gas price for legacy-style transactions, expressed as a decimal string when humanized.
  - `hash` `string` _(required)_: A 32-byte hash, `0x`-prefixed and returned in lowercase, that identifies this transaction.
  - `id` `string` _(required)_: Stable resource ID for this API response; it is the transaction hash.
  - `input` `string`: Call data for non-Tempo transaction formats, as `0x`-prefixed bytes.
  - `maxFeePerGas` `string`: Maximum total fee per gas the sender is willing to pay.
  - `maxPriorityFeePerGas` `string`: Maximum priority fee per gas for EIP-1559-style transactions.
  - `meta` `object` _(required)_: The original JSON-RPC payload plus any resources requested with `include`.
    - `receipt` `object`: The transaction outcome included only when you request `include=receipt`.
      - `blockHash` `string` _(required)_: The block hash, or `null` when the receipt was reconstructed from indexed data.
      - `blockNumber` `integer` _(required)_: The block number that included this receipt.
      - `contractAddress` `string` _(required)_: The created contract address, or `null` if the transaction did not create a contract.
      - `cumulativeGasUsed` `integer` _(required)_: Total gas used in the block up to and including this transaction.
      - `effectiveGasPrice` `string` _(required)_: Effective gas price paid for this transaction, in attodollars per gas.
      - `feeAmount` `object` _(required)_: Fee charged to the fee payer, denominated in USD.
        - `baseUnits` `string` _(required)_: The quantity in the token's smallest unit.
        - `currency` `string` _(required)_: The monetary denomination of this quantity.
        - `decimals` `integer` _(required)_: Decimal places used to convert `baseUnits` into `formatted`.
        - `formatted` `string` _(required)_: The quantity rendered in whole token units.
        - `valuation` `object`: The fee’s nominal value in the requested `valuation.currency`. `null` when rates were unavailable.
      - `feePayer` `string`: The address that paid the transaction fee.
      - `feeToken` `object`: The token requested for transaction fees, with RPC metadata and optional curated fields.
        - `address` `string` _(required)_: The TIP-20 token contract address on Tempo.
        - `currency` `string` _(required)_: The currency label for this token, such as `USD` for USD-denominated stablecoins.
        - `decimals` `integer` _(required)_: The number of decimal places the token uses; Tempo stablecoins typically use 6.
        - `logoUri` `string`: A URL for the token’s logo image, when one is available.
        - `name` `string` _(required)_: The token’s human-readable name.
        - `symbol` `string` _(required)_: The short ticker symbol wallets and apps show for this token.
        - `verified` `boolean`: Whether this token is in Tempo’s curated verified token list.
      - `gasUsed` `integer` _(required)_: Gas actually used to execute the transaction.
      - `id` `string` _(required)_: Stable resource ID for this API response; it is the transaction hash.
      - `logs` `object[]` _(required)_: Event logs emitted by this transaction, returned in JSON-RPC log format.
        - `address` `string` _(required)_: The contract address that emitted this event log.
        - `blockHash` `string` _(required)_: The block hash once included, or `null` while pending.
        - `blockNumber` `string` _(required)_: The block number once included, or `null` while pending.
        - `blockTimestamp` `string`: Tempo-provided block timestamp for this log.
        - `data` `string` _(required)_: ABI-encoded data for the event parameters that are not indexed.
        - `logIndex` `string` _(required)_: The log position within the block, or `null` while pending.
        - `removed` `boolean` _(required)_: Whether this log was removed by a chain reorganization; Tempo finality means finalized logs do not reorg.
        - `topics` `string[]` _(required)_: Indexed event topics, including the event signature hash as the first topic.
        - `transactionHash` `string` _(required)_: The transaction hash for this log, or `null` while pending.
        - `transactionIndex` `string` _(required)_: The transaction position within the block, or `null` while pending.
      - `meta` `object` _(required)_: Receipt metadata containing valuation rate provenance and the JSON-RPC payload.
        - `valuation` `object`: Rate provenance for leg valuations. Present when conversion rates were consulted; absent when every value was identity-valued or rates were unavailable.
        - `rpc` `object` _(required)_: The original JSON-RPC receipt payload.
      - `recipient` `string` _(required)_: The recipient address, or `null` when the transaction created a contract.
      - `sender` `string` _(required)_: The address that sent or authorized the transaction.
      - `status` `string` _(required)_: Whether the transaction succeeded or reverted.
      - `timestamp` `string <date-time>` _(required)_: The block timestamp as ISO 8601, or `null` when it is unavailable.
      - `transactionHash` `string` _(required)_: A 32-byte hash, `0x`-prefixed and returned in lowercase, that identifies the transaction.
      - `transactionIndex` `integer` _(required)_: The transaction position within its block.
      - `type` `string` _(required)_: Human-readable transaction type decoded from the raw JSON-RPC `type` byte.
    - `rpc` `object` _(required)_: The original JSON-RPC transaction payload.
      - `aaAuthorizationList` `object[]`: Tempo account-abstraction authorizations attached to the transaction.
      - `accessList` `object[]`: EIP-2930 access list that predeclares accounts and storage slots for the transaction.
        - `address` `string` _(required)_: The account whose storage slots are listed in this access-list entry.
        - `storageKeys` `string[]` _(required)_: The storage slot keys the transaction plans to access.
      - `authorizationList` `object[]`: EIP-7702 authorizations attached to the transaction.
      - `blobVersionedHashes` `string[]`: Versioned blob hashes for EIP-4844 blob data.
      - `blockHash` `string` _(required)_: The block hash once included, or `null` while the transaction is pending.
      - `blockNumber` `string` _(required)_: The block number once included, or `null` while the transaction is pending.
      - `blockTimestamp` `string`: The block timestamp for the block that included this transaction.
      - `calls` `object[]`: Decoded calls for Tempo account-abstraction transactions.
        - `data` `string`: Call data for this call; this is the same bytes as `input` when both are present.
        - `input` `string`: Call data sent to the contract, as `0x`-prefixed bytes.
        - `to` `string`: The address this call targets, or `null` when the call creates a contract.
        - `value` `string`: Native value sent with this call, as a hex quantity.
      - `chainId` `string`: The chain ID that the transaction is valid on; legacy transactions may omit it.
      - `feePayer` `string`: The address that paid the transaction fee.
      - `feePayerSignature` `object`: A signature envelope exactly as returned by JSON-RPC.
        - `type` `string`: The signature scheme used by this envelope, such as `secp256k1`, `p256`, or `keychain` when the RPC includes it.
      - `feeToken` `string`: The fee token requested by the transaction; Tempo fees are paid in USD stablecoins such as `pathUSD`.
      - `from` `string` _(required)_: The address that submitted or authorized the transaction.
      - `gas` `string` _(required)_: Maximum gas the transaction is allowed to use.
      - `gasPrice` `string`: Gas price for legacy-style transactions, expressed as a decimal string when humanized.
      - `hash` `string` _(required)_: A 32-byte hash, `0x`-prefixed and returned in lowercase, that identifies this transaction.
      - `input` `string`: Call data for non-Tempo transaction formats, as `0x`-prefixed bytes.
      - `keyAuthorization` `object`: Key authorization data attached to this Tempo transaction.
      - `maxFeePerBlobGas` `string`: Maximum fee per blob gas for EIP-4844 blob data.
      - `maxFeePerGas` `string`: Maximum total fee per gas the sender is willing to pay.
      - `maxPriorityFeePerGas` `string`: Maximum priority fee per gas for EIP-1559-style transactions.
      - `nonce` `string` _(required)_: Nonce from the sender account that orders and de-duplicates transactions.
      - `nonceKey` `string`: Tempo two-dimensional nonce key used to group nonce sequences.
      - `r` `string`: The `r` value from the transaction ECDSA signature.
      - `s` `string`: The `s` value from the transaction ECDSA signature.
      - `signature` `object`: A signature envelope exactly as returned by JSON-RPC.
        - `type` `string`: The signature scheme used by this envelope, such as `secp256k1`, `p256`, or `keychain` when the RPC includes it.
      - `to` `string`: The recipient address, or `null` when the transaction creates a contract.
      - `transactionIndex` `string` _(required)_: The transaction position within its block, or `null` while pending.
      - `type` `string` _(required)_: Raw transaction type byte, such as `0x2` for EIP-1559 or `0x76` for Tempo.
      - `v` `string`: The `v` recovery value from the transaction ECDSA signature.
      - `validAfter` `string`: Earliest Unix timestamp when this Tempo transaction may be included.
      - `validBefore` `string`: Latest Unix timestamp when this Tempo transaction may be included.
      - `value` `string`: Native value sent by non-Tempo transaction formats.
      - `yParity` `string`: The y-parity value from the transaction signature.
  - `nonce` `integer` _(required)_: Nonce from the sender account that orders and de-duplicates transactions.
  - `nonceKey` `string`: Tempo two-dimensional nonce key used by Tempo transactions.
  - `recipient` `string` _(required)_: The recipient address, or `null` when the transaction creates a contract.
  - `sender` `string` _(required)_: The address that submitted or authorized the transaction.
  - `timestamp` `string <date-time>` _(required)_: The block timestamp as ISO 8601, or `null` while the transaction is pending.
  - `transactionIndex` `integer` _(required)_: The transaction position within its block, or `null` while pending.
  - `type` `string` _(required)_: Human-readable transaction type decoded from the raw JSON-RPC `type` byte.
  - `validAfter` `string <date-time>`: Earliest ISO 8601 time when this Tempo transaction may be included.
  - `validBefore` `string <date-time>`: Latest ISO 8601 time when this Tempo transaction may be included.
  - `value` `string` _(required)_: Native value transferred by this transaction, as a decimal string.
- `meta` `object`: Response-level metadata requested with `include`, such as `totalCount`.
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

#### `502`: Could not read transaction or token data from an upstream service.

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
curl 'https://api.tempo.xyz/v1/transactions?address=0xbe058e1c4df8a4366a387bf595b284246a93039e&blockNumber.from=23456789&blockNumber.to=23456999&chainId=4217&cursor=WzIzNDU2Nzg5LDBd&feePayer=0xbe058e1c4df8a4366a387bf595b284246a93039e&feeToken=0x20c0000000000000000000000000000000000000&include=feeToken.logoUri,feeToken.verified,receipt,totalCount&limit=10&order=desc&page=1&recipient=0xbe058e1c4df8a4366a387bf595b284246a93039e&sender=0xbe058e1c4df8a4366a387bf595b284246a93039e&status=success&timestamp.from=2024-01-01T00:00:00Z&timestamp.to=2024-12-31T23:59:59Z'
```

```ts
fetch('https://api.tempo.xyz/v1/transactions?address=0xbe058e1c4df8a4366a387bf595b284246a93039e&blockNumber.from=23456789&blockNumber.to=23456999&chainId=4217&cursor=WzIzNDU2Nzg5LDBd&feePayer=0xbe058e1c4df8a4366a387bf595b284246a93039e&feeToken=0x20c0000000000000000000000000000000000000&include=feeToken.logoUri,feeToken.verified,receipt,totalCount&limit=10&order=desc&page=1&recipient=0xbe058e1c4df8a4366a387bf595b284246a93039e&sender=0xbe058e1c4df8a4366a387bf595b284246a93039e&status=success&timestamp.from=2024-01-01T00:00:00Z&timestamp.to=2024-12-31T23:59:59Z')
```

## List transaction receipts

`GET /v1/transactions/receipts`

List transaction receipts across Tempo, with filters for addresses, blocks, timestamps, fees, and status.

### Query parameters

- `address` `string`: Filter to receipts whose transaction has this address as sender or recipient.
- `blockNumber.from` `integer`: Only include receipts at or after this block number.
- `blockNumber.to` `integer`: Only include receipts at or before this block number.
- `chainId` `string | number`: Which Tempo network to query. Use the alias `mainnet` or `testnet`, or a numeric chain id. Defaults to `mainnet` when omitted.
- `cursor` `string`: Opaque keyset cursor from a previous response (`nextCursor`); pass it back verbatim to fetch the next page. Omit for the first (head) page.
- `feePayer` `string`: Filter to receipts whose transaction fee was paid by this address.
- `feeToken` `string`: Filter to receipts whose transaction fee was paid in this token address.
- `include` `string[]`: Comma-separated resources to include, such as `feeToken.logoUri,feeToken.verified,totalCount`.
- `limit` `integer`: How many items to return per page (5–50, default 10). Use `nextCursor` to fetch more.
- `order` `string`: Sort order: `desc` for descending (the default), or `asc` for ascending.
- `page` `integer`: Page number, 1-indexed (positional pagination for page-numbered access; `page=1` is the head page). Mutually exclusive with `cursor`, and `page × limit` must be at most 500 rows — use cursor pagination for deeper traversal. Pages are positional, so rows arriving at the head of a live feed can shift page contents.
- `recipient` `string`: Filter to receipts for transactions sent to this recipient address.
- `sender` `string`: Filter to receipts for transactions sent by this sender address.
- `status` `string`: Filter to receipts with this execution status.
- `timestamp.from` `string <date-time>`: Only include receipts at or after this ISO 8601 timestamp.
- `timestamp.to` `string <date-time>`: Only include receipts at or before this ISO 8601 timestamp.
- `valuation.currency` `string`: Currency to denominate values in (case-insensitive, e.g. `AUD`). Must be priced by the configured FX oracle.

### Responses

#### `200`: A page of transaction receipts.

Headers:

- `RateLimit-Limit` `integer`: How many requests you may make in the current time window. Not sent on cached responses or `402` payment challenges.
- `RateLimit-Remaining` `integer`: How many requests you have left in the current window before you are rate-limited. Not sent on cached responses or `402` payment challenges.
- `RateLimit-Reset` `integer`: When the current window resets, as a Unix timestamp in seconds. Not sent on cached responses or `402` payment challenges.
- `RateLimit-Scope` `string`: Which quota this request counted against (e.g. `data:read`). Not sent on cached responses or `402` payment challenges.
- `tempo-request-id` `string`: A unique id for this request, returned on every response (and as `requestId` in error bodies). Include it when contacting support so we can find your request.

Body (`application/json`):

- `data` `object[]` _(required)_: Receipts on this page.
  - `blockHash` `string` _(required)_: The block hash, or `null` when the receipt was reconstructed from indexed data.
  - `blockNumber` `integer` _(required)_: The block number that included this receipt.
  - `contractAddress` `string` _(required)_: The created contract address, or `null` if the transaction did not create a contract.
  - `cumulativeGasUsed` `integer` _(required)_: Total gas used in the block up to and including this transaction.
  - `effectiveGasPrice` `string` _(required)_: Effective gas price paid for this transaction, in attodollars per gas.
  - `feeAmount` `object` _(required)_: Fee charged to the fee payer, denominated in USD.
    - `baseUnits` `string` _(required)_: The quantity in the token's smallest unit.
    - `currency` `string` _(required)_: The monetary denomination of this quantity.
    - `decimals` `integer` _(required)_: Decimal places used to convert `baseUnits` into `formatted`.
    - `formatted` `string` _(required)_: The quantity rendered in whole token units.
    - `valuation` `object`: The fee’s nominal value in the requested `valuation.currency`. `null` when rates were unavailable.
      - `amount` `string` _(required)_: The holding’s nominal value, as a decimal string in `currency`.
      - `currency` `string` _(required)_: The denomination currency of this value.
  - `feePayer` `string`: The address that paid the transaction fee.
  - `feeToken` `object`: The token requested for transaction fees, with RPC metadata and optional curated fields.
    - `address` `string` _(required)_: The TIP-20 token contract address on Tempo.
    - `currency` `string` _(required)_: The currency label for this token, such as `USD` for USD-denominated stablecoins.
    - `decimals` `integer` _(required)_: The number of decimal places the token uses; Tempo stablecoins typically use 6.
    - `logoUri` `string`: A URL for the token’s logo image, when one is available.
    - `name` `string` _(required)_: The token’s human-readable name.
    - `symbol` `string` _(required)_: The short ticker symbol wallets and apps show for this token.
    - `verified` `boolean`: Whether this token is in Tempo’s curated verified token list.
  - `gasUsed` `integer` _(required)_: Gas actually used to execute the transaction.
  - `id` `string` _(required)_: Stable resource ID for this API response; it is the transaction hash.
  - `logs` `object[]` _(required)_: Event logs emitted by this transaction, returned in JSON-RPC log format.
    - `address` `string` _(required)_: The contract address that emitted this event log.
    - `blockHash` `string` _(required)_: The block hash once included, or `null` while pending.
    - `blockNumber` `string` _(required)_: The block number once included, or `null` while pending.
    - `blockTimestamp` `string`: Tempo-provided block timestamp for this log.
    - `data` `string` _(required)_: ABI-encoded data for the event parameters that are not indexed.
    - `logIndex` `string` _(required)_: The log position within the block, or `null` while pending.
    - `removed` `boolean` _(required)_: Whether this log was removed by a chain reorganization; Tempo finality means finalized logs do not reorg.
    - `topics` `string[]` _(required)_: Indexed event topics, including the event signature hash as the first topic.
    - `transactionHash` `string` _(required)_: The transaction hash for this log, or `null` while pending.
    - `transactionIndex` `string` _(required)_: The transaction position within the block, or `null` while pending.
  - `meta` `object` _(required)_: Receipt metadata containing valuation rate provenance and the JSON-RPC payload.
    - `valuation` `object`: Rate provenance for leg valuations. Present when conversion rates were consulted; absent when every value was identity-valued or rates were unavailable.
      - `asOf` `string <date-time>` _(required)_: Publication date of the rate set as an ISO 8601 timestamp.
      - `basis` `string` _(required)_: Valuation basis: one token unit counts as one unit of its display currency.
      - `source` `string` _(required)_: FX rate oracle that supplied the conversion rates.
    - `rpc` `object` _(required)_: The original JSON-RPC receipt payload.
      - `blobGasPrice` `string`: Blob gas price for EIP-4844 blob data.
      - `blobGasUsed` `string`: Blob gas used by EIP-4844 blob data.
      - `blockHash` `string` _(required)_: The block hash, or `null` for receipts reconstructed from the index.
      - `blockNumber` `string` _(required)_: The block number that included this receipt.
      - `blockTimestamp` `string`: Block timestamp added when this receipt is reconstructed from indexed data.
      - `contractAddress` `string`: The created contract address, or `null` if the transaction did not create a contract.
      - `cumulativeGasUsed` `string` _(required)_: Total gas used in the block up to and including this transaction.
      - `effectiveGasPrice` `string` _(required)_: Effective gas price paid for this transaction.
      - `feePayer` `string`: The address that paid the transaction fee.
      - `feeToken` `string`: The token used to pay the fee; on Tempo this is a USD stablecoin such as `pathUSD`.
      - `from` `string` _(required)_: The address that sent or authorized the transaction.
      - `gasUsed` `string` _(required)_: Gas actually used to execute the transaction.
      - `logs` `object[]` _(required)_: Event logs emitted by contracts while this transaction executed.
        - `address` `string` _(required)_: The contract address that emitted this event log.
        - `blockHash` `string` _(required)_: The block hash once included, or `null` while pending.
        - `blockNumber` `string` _(required)_: The block number once included, or `null` while pending.
        - `blockTimestamp` `string`: Tempo-provided block timestamp for this log.
        - `data` `string` _(required)_: ABI-encoded data for the event parameters that are not indexed.
        - `logIndex` `string` _(required)_: The log position within the block, or `null` while pending.
        - `removed` `boolean` _(required)_: Whether this log was removed by a chain reorganization; Tempo finality means finalized logs do not reorg.
        - `topics` `string[]` _(required)_: Indexed event topics, including the event signature hash as the first topic.
        - `transactionHash` `string` _(required)_: The transaction hash for this log, or `null` while pending.
        - `transactionIndex` `string` _(required)_: The transaction position within the block, or `null` while pending.
      - `logsBloom` `string`: Bloom filter summarizing the logs in this receipt.
      - `root` `string`: Post-transaction state root used by pre-Byzantium Ethereum receipts.
      - `status` `string` _(required)_: Execution status as a hex quantity: `0x1` means success and `0x0` means reverted.
      - `to` `string` _(required)_: The recipient address, or `null` when the transaction created a contract.
      - `transactionHash` `string` _(required)_: A 32-byte hash, `0x`-prefixed and returned in lowercase, that identifies the transaction.
      - `transactionIndex` `string` _(required)_: The transaction position within its block.
      - `type` `string` _(required)_: Raw transaction type byte, such as `0x2` for EIP-1559 or `0x76` for Tempo.
  - `recipient` `string` _(required)_: The recipient address, or `null` when the transaction created a contract.
  - `sender` `string` _(required)_: The address that sent or authorized the transaction.
  - `status` `string` _(required)_: Whether the transaction succeeded or reverted.
  - `timestamp` `string <date-time>` _(required)_: The block timestamp as ISO 8601, or `null` when it is unavailable.
  - `transactionHash` `string` _(required)_: A 32-byte hash, `0x`-prefixed and returned in lowercase, that identifies the transaction.
  - `transactionIndex` `integer` _(required)_: The transaction position within its block.
  - `type` `string` _(required)_: Human-readable transaction type decoded from the raw JSON-RPC `type` byte.
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

#### `502`: Could not read receipt or token data from an upstream service.

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
curl 'https://api.tempo.xyz/v1/transactions/receipts?address=0xbe058e1c4df8a4366a387bf595b284246a93039e&blockNumber.from=23456789&blockNumber.to=23456999&chainId=4217&cursor=WzIzNDU2Nzg5LDBd&feePayer=0xbe058e1c4df8a4366a387bf595b284246a93039e&feeToken=0x20c0000000000000000000000000000000000000&include=feeToken.logoUri,feeToken.verified,totalCount&limit=10&order=desc&page=1&recipient=0xbe058e1c4df8a4366a387bf595b284246a93039e&sender=0xbe058e1c4df8a4366a387bf595b284246a93039e&status=success&timestamp.from=2024-01-01T00:00:00Z&timestamp.to=2024-12-31T23:59:59Z&valuation.currency=AUD'
```

```ts
fetch('https://api.tempo.xyz/v1/transactions/receipts?address=0xbe058e1c4df8a4366a387bf595b284246a93039e&blockNumber.from=23456789&blockNumber.to=23456999&chainId=4217&cursor=WzIzNDU2Nzg5LDBd&feePayer=0xbe058e1c4df8a4366a387bf595b284246a93039e&feeToken=0x20c0000000000000000000000000000000000000&include=feeToken.logoUri,feeToken.verified,totalCount&limit=10&order=desc&page=1&recipient=0xbe058e1c4df8a4366a387bf595b284246a93039e&sender=0xbe058e1c4df8a4366a387bf595b284246a93039e&status=success&timestamp.from=2024-01-01T00:00:00Z&timestamp.to=2024-12-31T23:59:59Z&valuation.currency=AUD')
```

## List token transactions

`GET /v1/tokens/{token}/transactions`

Lists transactions that interacted with this token contract.

### Path parameters

- `token` `string` _(required)_: The TIP-20 token contract address on Tempo.

### Query parameters

- `blockNumber.from` `integer`: Only include transactions at or after this block number.
- `blockNumber.to` `integer`: Only include transactions at or before this block number.
- `chainId` `string | number`: Which Tempo network to query. Use the alias `mainnet` or `testnet`, or a numeric chain id. Defaults to `mainnet` when omitted.
- `cursor` `string`: Opaque keyset cursor from a previous response (`nextCursor`); pass it back verbatim to fetch the next page. Omit for the first (head) page.
- `feePayer` `string`: Only include transactions where this account paid the fee.
- `feeToken` `string`: Only include transactions whose fee was paid in this token. On Tempo, fees are paid in USD stablecoins instead of a separate volatile gas token.
- `include` `string[]`: Comma-separated related resources to include, such as `feeToken.logoUri,feeToken.verified,token,totalCount`.
- `limit` `integer`: How many items to return per page (5–50, default 10). Use `nextCursor` to fetch more.
- `order` `string`: Sort order: `desc` for descending (the default), or `asc` for ascending.
- `page` `integer`: Page number, 1-indexed (positional pagination for page-numbered access; `page=1` is the head page). Mutually exclusive with `cursor`, and `page × limit` must be at most 500 rows — use cursor pagination for deeper traversal. Pages are positional, so rows arriving at the head of a live feed can shift page contents.
- `timestamp.from` `string <date-time>`: Only include transactions at or after this ISO 8601 timestamp.
- `timestamp.to` `string <date-time>`: Only include transactions at or before this ISO 8601 timestamp.

### Responses

#### `200`: A page of transactions involving this token contract.

Headers:

- `RateLimit-Limit` `integer`: How many requests you may make in the current time window. Not sent on cached responses or `402` payment challenges.
- `RateLimit-Remaining` `integer`: How many requests you have left in the current window before you are rate-limited. Not sent on cached responses or `402` payment challenges.
- `RateLimit-Reset` `integer`: When the current window resets, as a Unix timestamp in seconds. Not sent on cached responses or `402` payment challenges.
- `RateLimit-Scope` `string`: Which quota this request counted against (e.g. `data:read`). Not sent on cached responses or `402` payment challenges.
- `tempo-request-id` `string`: A unique id for this request, returned on every response (and as `requestId` in error bodies). Include it when contacting support so we can find your request.

Body (`application/json`):

- `data` `object[]` _(required)_: The transactions in this page.
  - `blockHash` `string` _(required)_: The block hash once included, or `null` while the transaction is pending.
  - `blockNumber` `integer` _(required)_: The block number once included, or `null` while the transaction is pending.
  - `calls` `object[]`: Decoded calls for Tempo account-abstraction transactions.
    - `data` `string`: Call data sent to the contract, as `0x`-prefixed bytes.
    - `to` `string` _(required)_: The address this call targets, or `null` when it creates a contract.
  - `chainId` `integer`: The chain ID that this transaction belongs to.
  - `feeToken` `object`: The token requested for transaction fees, with RPC metadata and optional curated fields.
    - `address` `string` _(required)_: The TIP-20 token contract address on Tempo.
    - `currency` `string` _(required)_: The currency label for this token, such as `USD` for USD-denominated stablecoins.
    - `decimals` `integer` _(required)_: The number of decimal places the token uses; Tempo stablecoins typically use 6.
    - `logoUri` `string`: A URL for the token’s logo image, when one is available.
    - `name` `string` _(required)_: The token’s human-readable name.
    - `symbol` `string` _(required)_: The short ticker symbol wallets and apps show for this token.
    - `verified` `boolean`: Whether this token is in Tempo’s curated verified token list.
  - `gas` `integer` _(required)_: Maximum gas the transaction is allowed to use.
  - `gasPrice` `string`: Gas price for legacy-style transactions, expressed as a decimal string when humanized.
  - `hash` `string` _(required)_: A 32-byte hash, `0x`-prefixed and returned in lowercase, that identifies this transaction.
  - `id` `string` _(required)_: Stable resource ID for this API response; it is the transaction hash.
  - `input` `string`: Call data for non-Tempo transaction formats, as `0x`-prefixed bytes.
  - `maxFeePerGas` `string`: Maximum total fee per gas the sender is willing to pay.
  - `maxPriorityFeePerGas` `string`: Maximum priority fee per gas for EIP-1559-style transactions.
  - `meta` `object` _(required)_: The original JSON-RPC payload plus any resources requested with `include`.
    - `receipt` `object`: The transaction outcome included only when you request `include=receipt`.
      - `blockHash` `string` _(required)_: The block hash, or `null` when the receipt was reconstructed from indexed data.
      - `blockNumber` `integer` _(required)_: The block number that included this receipt.
      - `contractAddress` `string` _(required)_: The created contract address, or `null` if the transaction did not create a contract.
      - `cumulativeGasUsed` `integer` _(required)_: Total gas used in the block up to and including this transaction.
      - `effectiveGasPrice` `string` _(required)_: Effective gas price paid for this transaction, in attodollars per gas.
      - `feeAmount` `object` _(required)_: Fee charged to the fee payer, denominated in USD.
        - `baseUnits` `string` _(required)_: The quantity in the token's smallest unit.
        - `currency` `string` _(required)_: The monetary denomination of this quantity.
        - `decimals` `integer` _(required)_: Decimal places used to convert `baseUnits` into `formatted`.
        - `formatted` `string` _(required)_: The quantity rendered in whole token units.
        - `valuation` `object`: The fee’s nominal value in the requested `valuation.currency`. `null` when rates were unavailable.
      - `feePayer` `string`: The address that paid the transaction fee.
      - `feeToken` `object`: The token requested for transaction fees, with RPC metadata and optional curated fields.
        - `address` `string` _(required)_: The TIP-20 token contract address on Tempo.
        - `currency` `string` _(required)_: The currency label for this token, such as `USD` for USD-denominated stablecoins.
        - `decimals` `integer` _(required)_: The number of decimal places the token uses; Tempo stablecoins typically use 6.
        - `logoUri` `string`: A URL for the token’s logo image, when one is available.
        - `name` `string` _(required)_: The token’s human-readable name.
        - `symbol` `string` _(required)_: The short ticker symbol wallets and apps show for this token.
        - `verified` `boolean`: Whether this token is in Tempo’s curated verified token list.
      - `gasUsed` `integer` _(required)_: Gas actually used to execute the transaction.
      - `id` `string` _(required)_: Stable resource ID for this API response; it is the transaction hash.
      - `logs` `object[]` _(required)_: Event logs emitted by this transaction, returned in JSON-RPC log format.
        - `address` `string` _(required)_: The contract address that emitted this event log.
        - `blockHash` `string` _(required)_: The block hash once included, or `null` while pending.
        - `blockNumber` `string` _(required)_: The block number once included, or `null` while pending.
        - `blockTimestamp` `string`: Tempo-provided block timestamp for this log.
        - `data` `string` _(required)_: ABI-encoded data for the event parameters that are not indexed.
        - `logIndex` `string` _(required)_: The log position within the block, or `null` while pending.
        - `removed` `boolean` _(required)_: Whether this log was removed by a chain reorganization; Tempo finality means finalized logs do not reorg.
        - `topics` `string[]` _(required)_: Indexed event topics, including the event signature hash as the first topic.
        - `transactionHash` `string` _(required)_: The transaction hash for this log, or `null` while pending.
        - `transactionIndex` `string` _(required)_: The transaction position within the block, or `null` while pending.
      - `meta` `object` _(required)_: Receipt metadata containing valuation rate provenance and the JSON-RPC payload.
        - `valuation` `object`: Rate provenance for leg valuations. Present when conversion rates were consulted; absent when every value was identity-valued or rates were unavailable.
        - `rpc` `object` _(required)_: The original JSON-RPC receipt payload.
      - `recipient` `string` _(required)_: The recipient address, or `null` when the transaction created a contract.
      - `sender` `string` _(required)_: The address that sent or authorized the transaction.
      - `status` `string` _(required)_: Whether the transaction succeeded or reverted.
      - `timestamp` `string <date-time>` _(required)_: The block timestamp as ISO 8601, or `null` when it is unavailable.
      - `transactionHash` `string` _(required)_: A 32-byte hash, `0x`-prefixed and returned in lowercase, that identifies the transaction.
      - `transactionIndex` `integer` _(required)_: The transaction position within its block.
      - `type` `string` _(required)_: Human-readable transaction type decoded from the raw JSON-RPC `type` byte.
    - `rpc` `object` _(required)_: The original JSON-RPC transaction payload.
      - `aaAuthorizationList` `object[]`: Tempo account-abstraction authorizations attached to the transaction.
      - `accessList` `object[]`: EIP-2930 access list that predeclares accounts and storage slots for the transaction.
        - `address` `string` _(required)_: The account whose storage slots are listed in this access-list entry.
        - `storageKeys` `string[]` _(required)_: The storage slot keys the transaction plans to access.
      - `authorizationList` `object[]`: EIP-7702 authorizations attached to the transaction.
      - `blobVersionedHashes` `string[]`: Versioned blob hashes for EIP-4844 blob data.
      - `blockHash` `string` _(required)_: The block hash once included, or `null` while the transaction is pending.
      - `blockNumber` `string` _(required)_: The block number once included, or `null` while the transaction is pending.
      - `blockTimestamp` `string`: The block timestamp for the block that included this transaction.
      - `calls` `object[]`: Decoded calls for Tempo account-abstraction transactions.
        - `data` `string`: Call data for this call; this is the same bytes as `input` when both are present.
        - `input` `string`: Call data sent to the contract, as `0x`-prefixed bytes.
        - `to` `string`: The address this call targets, or `null` when the call creates a contract.
        - `value` `string`: Native value sent with this call, as a hex quantity.
      - `chainId` `string`: The chain ID that the transaction is valid on; legacy transactions may omit it.
      - `feePayer` `string`: The address that paid the transaction fee.
      - `feePayerSignature` `object`: A signature envelope exactly as returned by JSON-RPC.
        - `type` `string`: The signature scheme used by this envelope, such as `secp256k1`, `p256`, or `keychain` when the RPC includes it.
      - `feeToken` `string`: The fee token requested by the transaction; Tempo fees are paid in USD stablecoins such as `pathUSD`.
      - `from` `string` _(required)_: The address that submitted or authorized the transaction.
      - `gas` `string` _(required)_: Maximum gas the transaction is allowed to use.
      - `gasPrice` `string`: Gas price for legacy-style transactions, expressed as a decimal string when humanized.
      - `hash` `string` _(required)_: A 32-byte hash, `0x`-prefixed and returned in lowercase, that identifies this transaction.
      - `input` `string`: Call data for non-Tempo transaction formats, as `0x`-prefixed bytes.
      - `keyAuthorization` `object`: Key authorization data attached to this Tempo transaction.
      - `maxFeePerBlobGas` `string`: Maximum fee per blob gas for EIP-4844 blob data.
      - `maxFeePerGas` `string`: Maximum total fee per gas the sender is willing to pay.
      - `maxPriorityFeePerGas` `string`: Maximum priority fee per gas for EIP-1559-style transactions.
      - `nonce` `string` _(required)_: Nonce from the sender account that orders and de-duplicates transactions.
      - `nonceKey` `string`: Tempo two-dimensional nonce key used to group nonce sequences.
      - `r` `string`: The `r` value from the transaction ECDSA signature.
      - `s` `string`: The `s` value from the transaction ECDSA signature.
      - `signature` `object`: A signature envelope exactly as returned by JSON-RPC.
        - `type` `string`: The signature scheme used by this envelope, such as `secp256k1`, `p256`, or `keychain` when the RPC includes it.
      - `to` `string`: The recipient address, or `null` when the transaction creates a contract.
      - `transactionIndex` `string` _(required)_: The transaction position within its block, or `null` while pending.
      - `type` `string` _(required)_: Raw transaction type byte, such as `0x2` for EIP-1559 or `0x76` for Tempo.
      - `v` `string`: The `v` recovery value from the transaction ECDSA signature.
      - `validAfter` `string`: Earliest Unix timestamp when this Tempo transaction may be included.
      - `validBefore` `string`: Latest Unix timestamp when this Tempo transaction may be included.
      - `value` `string`: Native value sent by non-Tempo transaction formats.
      - `yParity` `string`: The y-parity value from the transaction signature.
  - `nonce` `integer` _(required)_: Nonce from the sender account that orders and de-duplicates transactions.
  - `nonceKey` `string`: Tempo two-dimensional nonce key used by Tempo transactions.
  - `recipient` `string` _(required)_: The recipient address, or `null` when the transaction creates a contract.
  - `sender` `string` _(required)_: The address that submitted or authorized the transaction.
  - `timestamp` `string <date-time>` _(required)_: The block timestamp as ISO 8601, or `null` while the transaction is pending.
  - `transactionIndex` `integer` _(required)_: The transaction position within its block, or `null` while pending.
  - `type` `string` _(required)_: Human-readable transaction type decoded from the raw JSON-RPC `type` byte.
  - `validAfter` `string <date-time>`: Earliest ISO 8601 time when this Tempo transaction may be included.
  - `validBefore` `string <date-time>`: Latest ISO 8601 time when this Tempo transaction may be included.
  - `value` `string` _(required)_: Native value transferred by this transaction, as a decimal string.
- `meta` `object`: Extra resources you requested with `include`.
  - `totalCountCapped` `boolean`: Whether `totalCount` reached the API count cap; when `true`, treat the count as a lower bound.
  - `token` `object`: A compact token reference, returned when you request `include=token`.
    - `address` `string` _(required)_: The TIP-20 token contract address on Tempo.
    - `currency` `string` _(required)_: The currency label for this token, such as `USD` for USD-denominated stablecoins.
    - `decimals` `integer` _(required)_: The number of decimal places the token uses; Tempo stablecoins typically use 6.
    - `id` `string` _(required)_: A stable resource ID for this token, equal to its contract address.
    - `logoUri` `string`: A URL for the token’s logo image, when one is available.
    - `name` `string` _(required)_: The token’s human-readable name.
    - `symbol` `string` _(required)_: The short ticker symbol wallets and apps show for this token.
    - `verified` `boolean` _(required)_: Whether this token is in Tempo’s curated verified token list.
  - `totalCount` `integer`: The capped total number of matching transactions, returned when you request `include=totalCount`.
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

#### `502`: The upstream indexer could not serve this request.

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
curl 'https://api.tempo.xyz/v1/tokens/0x20c0000000000000000000000000000000000000/transactions?blockNumber.from=23456789&blockNumber.to=23456999&chainId=4217&cursor=WzIzNDU2Nzg5LDBd&feePayer=0xbe058e1c4df8a4366a387bf595b284246a93039e&feeToken=0x20c0000000000000000000000000000000000000&include=feeToken.logoUri,feeToken.verified,token,totalCount&limit=10&order=desc&page=1&timestamp.from=2024-01-01T00:00:00Z&timestamp.to=2024-12-31T23:59:59Z'
```

```ts
fetch('https://api.tempo.xyz/v1/tokens/0x20c0000000000000000000000000000000000000/transactions?blockNumber.from=23456789&blockNumber.to=23456999&chainId=4217&cursor=WzIzNDU2Nzg5LDBd&feePayer=0xbe058e1c4df8a4366a387bf595b284246a93039e&feeToken=0x20c0000000000000000000000000000000000000&include=feeToken.logoUri,feeToken.verified,token,totalCount&limit=10&order=desc&page=1&timestamp.from=2024-01-01T00:00:00Z&timestamp.to=2024-12-31T23:59:59Z')
```

## Get a transaction by hash

`GET /v1/transactions/{transactionHash}`

Get one transaction by its 32-byte transaction hash.

### Path parameters

- `transactionHash` `string` _(required)_: A 32-byte hash, `0x`-prefixed and returned in lowercase, that identifies this transaction.

### Query parameters

- `chainId` `string | number`: Which Tempo network to query. Use the alias `mainnet` or `testnet`, or a numeric chain id. Defaults to `mainnet` when omitted.
- `include` `string[]`: Comma-separated related resources to include, such as `feeToken.logoUri,feeToken.verified,receipt`.

### Responses

#### `200`: A single transaction with decoded fields and original JSON-RPC data.

Headers:

- `RateLimit-Limit` `integer`: How many requests you may make in the current time window. Not sent on cached responses or `402` payment challenges.
- `RateLimit-Remaining` `integer`: How many requests you have left in the current window before you are rate-limited. Not sent on cached responses or `402` payment challenges.
- `RateLimit-Reset` `integer`: When the current window resets, as a Unix timestamp in seconds. Not sent on cached responses or `402` payment challenges.
- `RateLimit-Scope` `string`: Which quota this request counted against (e.g. `data:read`). Not sent on cached responses or `402` payment challenges.
- `tempo-request-id` `string`: A unique id for this request, returned on every response (and as `requestId` in error bodies). Include it when contacting support so we can find your request.

Body (`application/json`):

- `blockHash` `string` _(required)_: The block hash once included, or `null` while the transaction is pending.
- `blockNumber` `integer` _(required)_: The block number once included, or `null` while the transaction is pending.
- `calls` `object[]`: Decoded calls for Tempo account-abstraction transactions.
  - `data` `string`: Call data sent to the contract, as `0x`-prefixed bytes.
  - `to` `string` _(required)_: The address this call targets, or `null` when it creates a contract.
- `chainId` `integer`: The chain ID that this transaction belongs to.
- `feeToken` `object`: The token requested for transaction fees, with RPC metadata and optional curated fields.
  - `address` `string` _(required)_: The TIP-20 token contract address on Tempo.
  - `currency` `string` _(required)_: The currency label for this token, such as `USD` for USD-denominated stablecoins.
  - `decimals` `integer` _(required)_: The number of decimal places the token uses; Tempo stablecoins typically use 6.
  - `logoUri` `string`: A URL for the token’s logo image, when one is available.
  - `name` `string` _(required)_: The token’s human-readable name.
  - `symbol` `string` _(required)_: The short ticker symbol wallets and apps show for this token.
  - `verified` `boolean`: Whether this token is in Tempo’s curated verified token list.
- `gas` `integer` _(required)_: Maximum gas the transaction is allowed to use.
- `gasPrice` `string`: Gas price for legacy-style transactions, expressed as a decimal string when humanized.
- `hash` `string` _(required)_: A 32-byte hash, `0x`-prefixed and returned in lowercase, that identifies this transaction.
- `id` `string` _(required)_: Stable resource ID for this API response; it is the transaction hash.
- `input` `string`: Call data for non-Tempo transaction formats, as `0x`-prefixed bytes.
- `maxFeePerGas` `string`: Maximum total fee per gas the sender is willing to pay.
- `maxPriorityFeePerGas` `string`: Maximum priority fee per gas for EIP-1559-style transactions.
- `meta` `object` _(required)_: The original JSON-RPC payload plus any resources requested with `include`.
  - `receipt` `object`: The transaction outcome included only when you request `include=receipt`.
    - `blockHash` `string` _(required)_: The block hash, or `null` when the receipt was reconstructed from indexed data.
    - `blockNumber` `integer` _(required)_: The block number that included this receipt.
    - `contractAddress` `string` _(required)_: The created contract address, or `null` if the transaction did not create a contract.
    - `cumulativeGasUsed` `integer` _(required)_: Total gas used in the block up to and including this transaction.
    - `effectiveGasPrice` `string` _(required)_: Effective gas price paid for this transaction, in attodollars per gas.
    - `feeAmount` `object` _(required)_: Fee charged to the fee payer, denominated in USD.
      - `baseUnits` `string` _(required)_: The quantity in the token's smallest unit.
      - `currency` `string` _(required)_: The monetary denomination of this quantity.
      - `decimals` `integer` _(required)_: Decimal places used to convert `baseUnits` into `formatted`.
      - `formatted` `string` _(required)_: The quantity rendered in whole token units.
      - `valuation` `object`: The fee’s nominal value in the requested `valuation.currency`. `null` when rates were unavailable.
        - `amount` `string` _(required)_: The holding’s nominal value, as a decimal string in `currency`.
        - `currency` `string` _(required)_: The denomination currency of this value.
    - `feePayer` `string`: The address that paid the transaction fee.
    - `feeToken` `object`: The token requested for transaction fees, with RPC metadata and optional curated fields.
      - `address` `string` _(required)_: The TIP-20 token contract address on Tempo.
      - `currency` `string` _(required)_: The currency label for this token, such as `USD` for USD-denominated stablecoins.
      - `decimals` `integer` _(required)_: The number of decimal places the token uses; Tempo stablecoins typically use 6.
      - `logoUri` `string`: A URL for the token’s logo image, when one is available.
      - `name` `string` _(required)_: The token’s human-readable name.
      - `symbol` `string` _(required)_: The short ticker symbol wallets and apps show for this token.
      - `verified` `boolean`: Whether this token is in Tempo’s curated verified token list.
    - `gasUsed` `integer` _(required)_: Gas actually used to execute the transaction.
    - `id` `string` _(required)_: Stable resource ID for this API response; it is the transaction hash.
    - `logs` `object[]` _(required)_: Event logs emitted by this transaction, returned in JSON-RPC log format.
      - `address` `string` _(required)_: The contract address that emitted this event log.
      - `blockHash` `string` _(required)_: The block hash once included, or `null` while pending.
      - `blockNumber` `string` _(required)_: The block number once included, or `null` while pending.
      - `blockTimestamp` `string`: Tempo-provided block timestamp for this log.
      - `data` `string` _(required)_: ABI-encoded data for the event parameters that are not indexed.
      - `logIndex` `string` _(required)_: The log position within the block, or `null` while pending.
      - `removed` `boolean` _(required)_: Whether this log was removed by a chain reorganization; Tempo finality means finalized logs do not reorg.
      - `topics` `string[]` _(required)_: Indexed event topics, including the event signature hash as the first topic.
      - `transactionHash` `string` _(required)_: The transaction hash for this log, or `null` while pending.
      - `transactionIndex` `string` _(required)_: The transaction position within the block, or `null` while pending.
    - `meta` `object` _(required)_: Receipt metadata containing valuation rate provenance and the JSON-RPC payload.
      - `valuation` `object`: Rate provenance for leg valuations. Present when conversion rates were consulted; absent when every value was identity-valued or rates were unavailable.
        - `asOf` `string <date-time>` _(required)_: Publication date of the rate set as an ISO 8601 timestamp.
        - `basis` `string` _(required)_: Valuation basis: one token unit counts as one unit of its display currency.
        - `source` `string` _(required)_: FX rate oracle that supplied the conversion rates.
      - `rpc` `object` _(required)_: The original JSON-RPC receipt payload.
        - `blobGasPrice` `string`: Blob gas price for EIP-4844 blob data.
        - `blobGasUsed` `string`: Blob gas used by EIP-4844 blob data.
        - `blockHash` `string` _(required)_: The block hash, or `null` for receipts reconstructed from the index.
        - `blockNumber` `string` _(required)_: The block number that included this receipt.
        - `blockTimestamp` `string`: Block timestamp added when this receipt is reconstructed from indexed data.
        - `contractAddress` `string`: The created contract address, or `null` if the transaction did not create a contract.
        - `cumulativeGasUsed` `string` _(required)_: Total gas used in the block up to and including this transaction.
        - `effectiveGasPrice` `string` _(required)_: Effective gas price paid for this transaction.
        - `feePayer` `string`: The address that paid the transaction fee.
        - `feeToken` `string`: The token used to pay the fee; on Tempo this is a USD stablecoin such as `pathUSD`.
        - `from` `string` _(required)_: The address that sent or authorized the transaction.
        - `gasUsed` `string` _(required)_: Gas actually used to execute the transaction.
        - `logs` `object[]` _(required)_: Event logs emitted by contracts while this transaction executed.
        - `logsBloom` `string`: Bloom filter summarizing the logs in this receipt.
        - `root` `string`: Post-transaction state root used by pre-Byzantium Ethereum receipts.
        - `status` `string` _(required)_: Execution status as a hex quantity: `0x1` means success and `0x0` means reverted.
        - `to` `string` _(required)_: The recipient address, or `null` when the transaction created a contract.
        - `transactionHash` `string` _(required)_: A 32-byte hash, `0x`-prefixed and returned in lowercase, that identifies the transaction.
        - `transactionIndex` `string` _(required)_: The transaction position within its block.
        - `type` `string` _(required)_: Raw transaction type byte, such as `0x2` for EIP-1559 or `0x76` for Tempo.
    - `recipient` `string` _(required)_: The recipient address, or `null` when the transaction created a contract.
    - `sender` `string` _(required)_: The address that sent or authorized the transaction.
    - `status` `string` _(required)_: Whether the transaction succeeded or reverted.
    - `timestamp` `string <date-time>` _(required)_: The block timestamp as ISO 8601, or `null` when it is unavailable.
    - `transactionHash` `string` _(required)_: A 32-byte hash, `0x`-prefixed and returned in lowercase, that identifies the transaction.
    - `transactionIndex` `integer` _(required)_: The transaction position within its block.
    - `type` `string` _(required)_: Human-readable transaction type decoded from the raw JSON-RPC `type` byte.
  - `rpc` `object` _(required)_: The original JSON-RPC transaction payload.
    - `aaAuthorizationList` `object[]`: Tempo account-abstraction authorizations attached to the transaction.
    - `accessList` `object[]`: EIP-2930 access list that predeclares accounts and storage slots for the transaction.
      - `address` `string` _(required)_: The account whose storage slots are listed in this access-list entry.
      - `storageKeys` `string[]` _(required)_: The storage slot keys the transaction plans to access.
    - `authorizationList` `object[]`: EIP-7702 authorizations attached to the transaction.
    - `blobVersionedHashes` `string[]`: Versioned blob hashes for EIP-4844 blob data.
    - `blockHash` `string` _(required)_: The block hash once included, or `null` while the transaction is pending.
    - `blockNumber` `string` _(required)_: The block number once included, or `null` while the transaction is pending.
    - `blockTimestamp` `string`: The block timestamp for the block that included this transaction.
    - `calls` `object[]`: Decoded calls for Tempo account-abstraction transactions.
      - `data` `string`: Call data for this call; this is the same bytes as `input` when both are present.
      - `input` `string`: Call data sent to the contract, as `0x`-prefixed bytes.
      - `to` `string`: The address this call targets, or `null` when the call creates a contract.
      - `value` `string`: Native value sent with this call, as a hex quantity.
    - `chainId` `string`: The chain ID that the transaction is valid on; legacy transactions may omit it.
    - `feePayer` `string`: The address that paid the transaction fee.
    - `feePayerSignature` `object`: A signature envelope exactly as returned by JSON-RPC.
      - `type` `string`: The signature scheme used by this envelope, such as `secp256k1`, `p256`, or `keychain` when the RPC includes it.
    - `feeToken` `string`: The fee token requested by the transaction; Tempo fees are paid in USD stablecoins such as `pathUSD`.
    - `from` `string` _(required)_: The address that submitted or authorized the transaction.
    - `gas` `string` _(required)_: Maximum gas the transaction is allowed to use.
    - `gasPrice` `string`: Gas price for legacy-style transactions, expressed as a decimal string when humanized.
    - `hash` `string` _(required)_: A 32-byte hash, `0x`-prefixed and returned in lowercase, that identifies this transaction.
    - `input` `string`: Call data for non-Tempo transaction formats, as `0x`-prefixed bytes.
    - `keyAuthorization` `object`: Key authorization data attached to this Tempo transaction.
    - `maxFeePerBlobGas` `string`: Maximum fee per blob gas for EIP-4844 blob data.
    - `maxFeePerGas` `string`: Maximum total fee per gas the sender is willing to pay.
    - `maxPriorityFeePerGas` `string`: Maximum priority fee per gas for EIP-1559-style transactions.
    - `nonce` `string` _(required)_: Nonce from the sender account that orders and de-duplicates transactions.
    - `nonceKey` `string`: Tempo two-dimensional nonce key used to group nonce sequences.
    - `r` `string`: The `r` value from the transaction ECDSA signature.
    - `s` `string`: The `s` value from the transaction ECDSA signature.
    - `signature` `object`: A signature envelope exactly as returned by JSON-RPC.
      - `type` `string`: The signature scheme used by this envelope, such as `secp256k1`, `p256`, or `keychain` when the RPC includes it.
    - `to` `string`: The recipient address, or `null` when the transaction creates a contract.
    - `transactionIndex` `string` _(required)_: The transaction position within its block, or `null` while pending.
    - `type` `string` _(required)_: Raw transaction type byte, such as `0x2` for EIP-1559 or `0x76` for Tempo.
    - `v` `string`: The `v` recovery value from the transaction ECDSA signature.
    - `validAfter` `string`: Earliest Unix timestamp when this Tempo transaction may be included.
    - `validBefore` `string`: Latest Unix timestamp when this Tempo transaction may be included.
    - `value` `string`: Native value sent by non-Tempo transaction formats.
    - `yParity` `string`: The y-parity value from the transaction signature.
- `nonce` `integer` _(required)_: Nonce from the sender account that orders and de-duplicates transactions.
- `nonceKey` `string`: Tempo two-dimensional nonce key used by Tempo transactions.
- `recipient` `string` _(required)_: The recipient address, or `null` when the transaction creates a contract.
- `sender` `string` _(required)_: The address that submitted or authorized the transaction.
- `timestamp` `string <date-time>` _(required)_: The block timestamp as ISO 8601, or `null` while the transaction is pending.
- `transactionIndex` `integer` _(required)_: The transaction position within its block, or `null` while pending.
- `type` `string` _(required)_: Human-readable transaction type decoded from the raw JSON-RPC `type` byte.
- `validAfter` `string <date-time>`: Earliest ISO 8601 time when this Tempo transaction may be included.
- `validBefore` `string <date-time>`: Latest ISO 8601 time when this Tempo transaction may be included.
- `value` `string` _(required)_: Native value transferred by this transaction, as a decimal string.

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

#### `404`: No transaction was found for that hash.

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

#### `502`: Could not read transaction or token data from upstream JSON-RPC.

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
curl 'https://api.tempo.xyz/v1/transactions/0x515801d7f9a5ac705e793e85904c9c69b3f1694b465cc8fb6ba3f0298dc82665?chainId=4217&include=feeToken.logoUri,feeToken.verified,receipt'
```

```ts
fetch('https://api.tempo.xyz/v1/transactions/0x515801d7f9a5ac705e793e85904c9c69b3f1694b465cc8fb6ba3f0298dc82665?chainId=4217&include=feeToken.logoUri,feeToken.verified,receipt')
```

## Get a transaction receipt

`GET /v1/transactions/{transactionHash}/receipt`

Get the outcome of one transaction by its transaction hash.

### Path parameters

- `transactionHash` `string` _(required)_: A 32-byte hash, `0x`-prefixed and returned in lowercase, that identifies the transaction.

### Query parameters

- `chainId` `string | number`: Which Tempo network to query. Use the alias `mainnet` or `testnet`, or a numeric chain id. Defaults to `mainnet` when omitted.
- `include` `string[]`: Comma-separated fee-token fields to include, such as `feeToken.logoUri,feeToken.verified`.
- `valuation.currency` `string`: Currency to denominate values in (case-insensitive, e.g. `AUD`). Must be priced by the configured FX oracle.

### Responses

#### `200`: A single transaction receipt with status, gas, fees, and logs.

Headers:

- `RateLimit-Limit` `integer`: How many requests you may make in the current time window. Not sent on cached responses or `402` payment challenges.
- `RateLimit-Remaining` `integer`: How many requests you have left in the current window before you are rate-limited. Not sent on cached responses or `402` payment challenges.
- `RateLimit-Reset` `integer`: When the current window resets, as a Unix timestamp in seconds. Not sent on cached responses or `402` payment challenges.
- `RateLimit-Scope` `string`: Which quota this request counted against (e.g. `data:read`). Not sent on cached responses or `402` payment challenges.
- `tempo-request-id` `string`: A unique id for this request, returned on every response (and as `requestId` in error bodies). Include it when contacting support so we can find your request.

Body (`application/json`):

- `blockHash` `string` _(required)_: The block hash, or `null` when the receipt was reconstructed from indexed data.
- `blockNumber` `integer` _(required)_: The block number that included this receipt.
- `contractAddress` `string` _(required)_: The created contract address, or `null` if the transaction did not create a contract.
- `cumulativeGasUsed` `integer` _(required)_: Total gas used in the block up to and including this transaction.
- `effectiveGasPrice` `string` _(required)_: Effective gas price paid for this transaction, in attodollars per gas.
- `feeAmount` `object` _(required)_: Fee charged to the fee payer, denominated in USD.
  - `baseUnits` `string` _(required)_: The quantity in the token's smallest unit.
  - `currency` `string` _(required)_: The monetary denomination of this quantity.
  - `decimals` `integer` _(required)_: Decimal places used to convert `baseUnits` into `formatted`.
  - `formatted` `string` _(required)_: The quantity rendered in whole token units.
  - `valuation` `object`: The fee’s nominal value in the requested `valuation.currency`. `null` when rates were unavailable.
    - `amount` `string` _(required)_: The holding’s nominal value, as a decimal string in `currency`.
    - `currency` `string` _(required)_: The denomination currency of this value.
- `feePayer` `string`: The address that paid the transaction fee.
- `feeToken` `object`: The token requested for transaction fees, with RPC metadata and optional curated fields.
  - `address` `string` _(required)_: The TIP-20 token contract address on Tempo.
  - `currency` `string` _(required)_: The currency label for this token, such as `USD` for USD-denominated stablecoins.
  - `decimals` `integer` _(required)_: The number of decimal places the token uses; Tempo stablecoins typically use 6.
  - `logoUri` `string`: A URL for the token’s logo image, when one is available.
  - `name` `string` _(required)_: The token’s human-readable name.
  - `symbol` `string` _(required)_: The short ticker symbol wallets and apps show for this token.
  - `verified` `boolean`: Whether this token is in Tempo’s curated verified token list.
- `gasUsed` `integer` _(required)_: Gas actually used to execute the transaction.
- `id` `string` _(required)_: Stable resource ID for this API response; it is the transaction hash.
- `logs` `object[]` _(required)_: Event logs emitted by this transaction, returned in JSON-RPC log format.
  - `address` `string` _(required)_: The contract address that emitted this event log.
  - `blockHash` `string` _(required)_: The block hash once included, or `null` while pending.
  - `blockNumber` `string` _(required)_: The block number once included, or `null` while pending.
  - `blockTimestamp` `string`: Tempo-provided block timestamp for this log.
  - `data` `string` _(required)_: ABI-encoded data for the event parameters that are not indexed.
  - `logIndex` `string` _(required)_: The log position within the block, or `null` while pending.
  - `removed` `boolean` _(required)_: Whether this log was removed by a chain reorganization; Tempo finality means finalized logs do not reorg.
  - `topics` `string[]` _(required)_: Indexed event topics, including the event signature hash as the first topic.
  - `transactionHash` `string` _(required)_: The transaction hash for this log, or `null` while pending.
  - `transactionIndex` `string` _(required)_: The transaction position within the block, or `null` while pending.
- `meta` `object` _(required)_: Receipt metadata containing valuation rate provenance and the JSON-RPC payload.
  - `valuation` `object`: Rate provenance for leg valuations. Present when conversion rates were consulted; absent when every value was identity-valued or rates were unavailable.
    - `asOf` `string <date-time>` _(required)_: Publication date of the rate set as an ISO 8601 timestamp.
    - `basis` `string` _(required)_: Valuation basis: one token unit counts as one unit of its display currency.
    - `source` `string` _(required)_: FX rate oracle that supplied the conversion rates.
  - `rpc` `object` _(required)_: The original JSON-RPC receipt payload.
    - `blobGasPrice` `string`: Blob gas price for EIP-4844 blob data.
    - `blobGasUsed` `string`: Blob gas used by EIP-4844 blob data.
    - `blockHash` `string` _(required)_: The block hash, or `null` for receipts reconstructed from the index.
    - `blockNumber` `string` _(required)_: The block number that included this receipt.
    - `blockTimestamp` `string`: Block timestamp added when this receipt is reconstructed from indexed data.
    - `contractAddress` `string`: The created contract address, or `null` if the transaction did not create a contract.
    - `cumulativeGasUsed` `string` _(required)_: Total gas used in the block up to and including this transaction.
    - `effectiveGasPrice` `string` _(required)_: Effective gas price paid for this transaction.
    - `feePayer` `string`: The address that paid the transaction fee.
    - `feeToken` `string`: The token used to pay the fee; on Tempo this is a USD stablecoin such as `pathUSD`.
    - `from` `string` _(required)_: The address that sent or authorized the transaction.
    - `gasUsed` `string` _(required)_: Gas actually used to execute the transaction.
    - `logs` `object[]` _(required)_: Event logs emitted by contracts while this transaction executed.
      - `address` `string` _(required)_: The contract address that emitted this event log.
      - `blockHash` `string` _(required)_: The block hash once included, or `null` while pending.
      - `blockNumber` `string` _(required)_: The block number once included, or `null` while pending.
      - `blockTimestamp` `string`: Tempo-provided block timestamp for this log.
      - `data` `string` _(required)_: ABI-encoded data for the event parameters that are not indexed.
      - `logIndex` `string` _(required)_: The log position within the block, or `null` while pending.
      - `removed` `boolean` _(required)_: Whether this log was removed by a chain reorganization; Tempo finality means finalized logs do not reorg.
      - `topics` `string[]` _(required)_: Indexed event topics, including the event signature hash as the first topic.
      - `transactionHash` `string` _(required)_: The transaction hash for this log, or `null` while pending.
      - `transactionIndex` `string` _(required)_: The transaction position within the block, or `null` while pending.
    - `logsBloom` `string`: Bloom filter summarizing the logs in this receipt.
    - `root` `string`: Post-transaction state root used by pre-Byzantium Ethereum receipts.
    - `status` `string` _(required)_: Execution status as a hex quantity: `0x1` means success and `0x0` means reverted.
    - `to` `string` _(required)_: The recipient address, or `null` when the transaction created a contract.
    - `transactionHash` `string` _(required)_: A 32-byte hash, `0x`-prefixed and returned in lowercase, that identifies the transaction.
    - `transactionIndex` `string` _(required)_: The transaction position within its block.
    - `type` `string` _(required)_: Raw transaction type byte, such as `0x2` for EIP-1559 or `0x76` for Tempo.
- `recipient` `string` _(required)_: The recipient address, or `null` when the transaction created a contract.
- `sender` `string` _(required)_: The address that sent or authorized the transaction.
- `status` `string` _(required)_: Whether the transaction succeeded or reverted.
- `timestamp` `string <date-time>` _(required)_: The block timestamp as ISO 8601, or `null` when it is unavailable.
- `transactionHash` `string` _(required)_: A 32-byte hash, `0x`-prefixed and returned in lowercase, that identifies the transaction.
- `transactionIndex` `integer` _(required)_: The transaction position within its block.
- `type` `string` _(required)_: Human-readable transaction type decoded from the raw JSON-RPC `type` byte.

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

#### `404`: No receipt was found for that transaction hash.

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

#### `502`: Could not read receipt or token data from upstream JSON-RPC.

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
curl 'https://api.tempo.xyz/v1/transactions/0x515801d7f9a5ac705e793e85904c9c69b3f1694b465cc8fb6ba3f0298dc82665/receipt?chainId=4217&include=feeToken.logoUri,feeToken.verified&valuation.currency=AUD'
```

```ts
fetch('https://api.tempo.xyz/v1/transactions/0x515801d7f9a5ac705e793e85904c9c69b3f1694b465cc8fb6ba3f0298dc82665/receipt?chainId=4217&include=feeToken.logoUri,feeToken.verified&valuation.currency=AUD')
```
