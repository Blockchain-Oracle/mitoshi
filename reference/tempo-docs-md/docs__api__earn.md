# Earn

Vaults that earn yield from assets deposited on Tempo.

## List vaults

`GET /v1/earn/vaults`

Lists compatible earn vaults discovered from deployment events and resolved from current chain state.

### Query parameters

- `asset` `string`: Only include vaults accepting this asset address.
- `capability` `string[]`: Comma-separated capabilities that every returned vault must support.
- `chainId` `string | number`: Which Tempo network to query. Use the alias `mainnet` or `testnet`, or a numeric chain id. Defaults to `mainnet` when omitted.
- `cursor` `string`: Opaque keyset cursor from a previous response (`nextCursor`); pass it back verbatim to fetch the next page. Omit for the first (head) page.
- `engine.type` `string`: Only include vaults with this inferred engine type.
- `include` `string[]`: Comma-separated vault fields to include, such as `apy,tvl`.
- `limit` `integer`: How many items to return per page (5–50, default 10). Use `nextCursor` to fetch more.
- `apy.window` `string`: Rate measurement window. Selecting one includes `apy`; omission prefers `7d` and falls back to `1h` when unavailable.

### Responses

#### `200`: A page of compatible deployed earn vaults.

Headers:

- `RateLimit-Limit` `integer`: How many requests you may make in the current time window. Not sent on cached responses or `402` payment challenges.
- `RateLimit-Remaining` `integer`: How many requests you have left in the current window before you are rate-limited. Not sent on cached responses or `402` payment challenges.
- `RateLimit-Reset` `integer`: When the current window resets, as a Unix timestamp in seconds. Not sent on cached responses or `402` payment challenges.
- `RateLimit-Scope` `string`: Which quota this request counted against (e.g. `data:read`). Not sent on cached responses or `402` payment challenges.
- `tempo-request-id` `string`: A unique id for this request, returned on every response (and as `requestId` in error bodies). Include it when contacting support so we can find your request.

Body (`application/json`):

- `data` `object[]` _(required)_: Compatible deployed earn vaults in deployment order.
  - `access` `object`: Vault share-token access, when requested.
    - `status` `string` _(required)_: Vault share-token access status.
  - `apy` `object`: Annualized vault yield over the selected window, plus every available current Merkle reward APR. Null when no component is measurable.
    - `asOf` `string <date-time>` _(required)_: UTC instant the rate was measured to, rounded to a 15-minute bucket.
    - `methodology` `string` _(required)_: Identifier of the calculation that produced this rate.
    - `net` `string` _(required)_: Higher of observed vault APY and configured reward campaign targets.
    - `rewards` `object[]`: Enabled, registered Merkle rewards. Omitted when reward enrichment is unavailable.
      - `apr` `string` _(required)_: Current reward APR, or null before its first calculation.
      - `asset` `object` _(required)_: EarnShare token distributed by the reward campaign.
        - `address` `string` _(required)_: An account address — the `0x`-prefixed 20-byte identifier for a wallet or contract, returned in lowercase.
        - `chainId` `string | number` _(required)_: Which Tempo network to query. Use the alias `mainnet` or `testnet`, or a numeric chain id (mainnet is `4217`).
        - `decimals` `integer` _(required)_: Reward asset decimal places.
      - `calculatedThrough` `integer`: Unix timestamp through which a calculated reward APR applies.
      - `campaignId` `string` _(required)_: EarnVault address that identifies the reward campaign.
      - `endsAt` `integer` _(required)_: Exclusive campaign end as a Unix timestamp.
      - `startsAt` `integer` _(required)_: Inclusive campaign start as a Unix timestamp.
      - `targetTotalApr` `string` _(required)_: Configured target for combined observed vault yield and Merkle rewards.
    - `vault` `string` _(required)_: Observed fee-aware vault APY before reward APR.
    - `window` `string` _(required)_: Window this rate covers.
  - `assetToken` `object` _(required)_: A compact token reference, returned when you request `include=token`.
    - `address` `string` _(required)_: The TIP-20 token contract address on Tempo.
    - `currency` `string` _(required)_: The currency label for this token, such as `USD` for USD-denominated stablecoins.
    - `decimals` `integer` _(required)_: The number of decimal places the token uses; Tempo stablecoins typically use 6.
    - `id` `string` _(required)_: A stable resource ID for this token, equal to its contract address.
    - `logoUri` `string`: A URL for the token’s logo image, when one is available.
    - `name` `string` _(required)_: The token’s human-readable name.
    - `symbol` `string` _(required)_: The short ticker symbol wallets and apps show for this token.
    - `verified` `boolean` _(required)_: Whether this token is in Tempo’s curated verified token list.
  - `capabilities` `object`: Vault capabilities, when requested.
    - `asyncRedeem` `boolean` _(required)_: Whether queued redemptions are supported.
    - `boundedRedeem` `boolean` _(required)_: Whether redemption accepts a minimum asset bound.
    - `deposit` `boolean` _(required)_: Whether asset deposits are supported.
    - `exactWithdraw` `boolean` _(required)_: Whether exact asset withdrawals are supported.
    - `inKindDeposit` `boolean` _(required)_: Whether venue-share deposits are supported.
    - `privateRouting` `boolean` _(required)_: Whether private routing is supported.
    - `redeem` `boolean` _(required)_: Whether immediate redemptions are supported.
    - `routerSwaps` `boolean` _(required)_: Whether router token swaps are supported.
  - `description` `string` _(required)_: Curated vault description, or null when the vault is not verified.
  - `engine` `object` _(required)_: Current vault engine.
    - `address` `string` _(required)_: Current vault engine contract address.
    - `type` `string` _(required)_: Inferred engine type, or null when it is unknown.
    - `venue` `string` _(required)_: Yield venue, or null when the engine does not expose one.
  - `id` `string` _(required)_: Stable vault id, equal to the lowercase vault address.
  - `instantLiquidity` `string` _(required)_: Assets the venue would release right now, capped at the vault backing, in asset base units. Null when the engine interface cannot report a reliable number.
  - `instantLiquidityValue` `object`: Instant liquidity valued in USD, when requested via `include=tvl`, or null when liquidity is unavailable or the asset has no priced display currency.
    - `amount` `string` _(required)_: Value in base units at `decimals` precision.
    - `currency` `string` _(required)_: Display currency of this value.
    - `decimals` `integer` _(required)_: Decimal places used to convert `amount` into `formatted`.
    - `formatted` `string` _(required)_: Value rendered in whole units.
  - `label` `string` _(required)_: Vault display label.
  - `sharePrice` `object` _(required)_: Assets returned for one whole earn share, in the asset display currency, or null when the engine cannot quote an exit.
    - `amount` `string` _(required)_: Value in base units at `decimals` precision.
    - `currency` `string` _(required)_: Display currency of this value.
    - `decimals` `integer` _(required)_: Decimal places used to convert `amount` into `formatted`.
    - `formatted` `string` _(required)_: Value rendered in whole units.
  - `shareToken` `object` _(required)_: A compact token reference, returned when you request `include=token`.
    - `address` `string` _(required)_: The TIP-20 token contract address on Tempo.
    - `currency` `string` _(required)_: The currency label for this token, such as `USD` for USD-denominated stablecoins.
    - `decimals` `integer` _(required)_: The number of decimal places the token uses; Tempo stablecoins typically use 6.
    - `id` `string` _(required)_: A stable resource ID for this token, equal to its contract address.
    - `logoUri` `string`: A URL for the token’s logo image, when one is available.
    - `name` `string` _(required)_: The token’s human-readable name.
    - `symbol` `string` _(required)_: The short ticker symbol wallets and apps show for this token.
    - `verified` `boolean` _(required)_: Whether this token is in Tempo’s curated verified token list.
  - `slug` `string` _(required)_: Curated URL slug, or null when the vault is not verified.
  - `state` `object` _(required)_: Live vault accounting state.
    - `depositsPaused` `boolean` _(required)_: Whether new deposits are paused.
    - `engineShares` `string` _(required)_: Venue shares held for the vault.
    - `feesActive` `boolean` _(required)_: Whether fees are configured and not emergency-disabled.
    - `isAccountingAligned` `boolean` _(required)_: Whether Earn share supply matches its asset backing.
    - `openRedeemRequestCount` `integer` _(required)_: Queued redemptions still awaiting settlement.
    - `totalAssets` `string` _(required)_: Asset value of the active backing.
    - `totalEarnShares` `string` _(required)_: Active Earn share supply.
  - `tvl` `object`: Total assets valued in USD, when requested via `include=tvl`, or null when the asset has no priced display currency.
    - `amount` `string` _(required)_: Value in base units at `decimals` precision.
    - `currency` `string` _(required)_: Display currency of this value.
    - `decimals` `integer` _(required)_: Decimal places used to convert `amount` into `formatted`.
    - `formatted` `string` _(required)_: Value rendered in whole units.
  - `vaultAddress` `string` _(required)_: Earn vault contract address.
  - `verified` `boolean` _(required)_: Whether this vault is in the curated earn registry.
  - `zone` `object`: Curated private Zone route, when requested, or null when absent.
    - `chainId` `string | number` _(required)_: Private Zone chain id.
    - `inputTokens` `string[]` _(required)_: Tokens accepted by private deposits.
    - `name` `string` _(required)_: Private Zone name.
    - `outputTokens` `string[]` _(required)_: Tokens supported by private redemptions.
  - `zones` `object[]`: Curated private Zone routes, when requested.
    - `chainId` `string | number` _(required)_: Private Zone chain id.
    - `deploymentBlock` `integer` _(required)_: Parent-chain block that deployed the Earn router.
    - `earnRouter` `string` _(required)_: Parent-chain router for this Zone and Earn vault.
    - `inputTokens` `string[]` _(required)_: Tokens accepted by private deposits.
    - `name` `string` _(required)_: Private Zone name.
    - `outputTokens` `string[]` _(required)_: Tokens returned by private redemptions.
- `meta` `object`: Rate provenance for valued fields.
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

#### `502`: Could not read earn deployment or vault data.

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
curl 'https://api.tempo.xyz/v1/earn/vaults?asset=0xbe058e1c4df8a4366a387bf595b284246a93039e&capability=asyncRedeem,boundedRedeem,deposit,exactWithdraw,inKindDeposit,privateRouting,redeem,routerSwaps&chainId=4217&cursor=WzIzNDU2Nzg5LDBd&engine.type=erc4626&include=access,apy,capabilities,token.logoUri,tvl,zone,zones&limit=10&apy.window=7d'
```

```ts
fetch('https://api.tempo.xyz/v1/earn/vaults?asset=0xbe058e1c4df8a4366a387bf595b284246a93039e&capability=asyncRedeem,boundedRedeem,deposit,exactWithdraw,inKindDeposit,privateRouting,redeem,routerSwaps&chainId=4217&cursor=WzIzNDU2Nzg5LDBd&engine.type=erc4626&include=access,apy,capabilities,token.logoUri,tvl,zone,zones&limit=10&apy.window=7d')
```

## List verified vaults

`GET /v1/earn/vaults/verified`

Lists registry-curated earn vaults after resolving their current onchain configuration.

### Query parameters

- `asset` `string`: Only include vaults accepting this asset address.
- `capability` `string[]`: Comma-separated capabilities that every returned vault must support.
- `chainId` `string | number`: Which Tempo network to query. Use the alias `mainnet` or `testnet`, or a numeric chain id. Defaults to `mainnet` when omitted.
- `cursor` `string`: Opaque keyset cursor from a previous response (`nextCursor`); pass it back verbatim to fetch the next page. Omit for the first (head) page.
- `engine.type` `string`: Only include vaults with this inferred engine type.
- `include` `string[]`: Comma-separated vault fields to include, such as `apy,tvl`.
- `limit` `integer`: How many items to return per page (5–50, default 10). Use `nextCursor` to fetch more.
- `apy.window` `string`: Rate measurement window. Selecting one includes `apy`; omission prefers `7d` and falls back to `1h` when unavailable.

### Responses

#### `200`: A page of registry-curated earn vaults.

Headers:

- `RateLimit-Limit` `integer`: How many requests you may make in the current time window. Not sent on cached responses or `402` payment challenges.
- `RateLimit-Remaining` `integer`: How many requests you have left in the current window before you are rate-limited. Not sent on cached responses or `402` payment challenges.
- `RateLimit-Reset` `integer`: When the current window resets, as a Unix timestamp in seconds. Not sent on cached responses or `402` payment challenges.
- `RateLimit-Scope` `string`: Which quota this request counted against (e.g. `data:read`). Not sent on cached responses or `402` payment challenges.
- `tempo-request-id` `string`: A unique id for this request, returned on every response (and as `requestId` in error bodies). Include it when contacting support so we can find your request.

Body (`application/json`):

- `data` `object[]` _(required)_: Registry-curated earn vaults ordered by vault address.
  - `access` `object`: Vault share-token access, when requested.
    - `status` `string` _(required)_: Vault share-token access status.
  - `apy` `object`: Annualized vault yield over the selected window, plus every available current Merkle reward APR. Null when no component is measurable.
    - `asOf` `string <date-time>` _(required)_: UTC instant the rate was measured to, rounded to a 15-minute bucket.
    - `methodology` `string` _(required)_: Identifier of the calculation that produced this rate.
    - `net` `string` _(required)_: Higher of observed vault APY and configured reward campaign targets.
    - `rewards` `object[]`: Enabled, registered Merkle rewards. Omitted when reward enrichment is unavailable.
      - `apr` `string` _(required)_: Current reward APR, or null before its first calculation.
      - `asset` `object` _(required)_: EarnShare token distributed by the reward campaign.
        - `address` `string` _(required)_: An account address — the `0x`-prefixed 20-byte identifier for a wallet or contract, returned in lowercase.
        - `chainId` `string | number` _(required)_: Which Tempo network to query. Use the alias `mainnet` or `testnet`, or a numeric chain id (mainnet is `4217`).
        - `decimals` `integer` _(required)_: Reward asset decimal places.
      - `calculatedThrough` `integer`: Unix timestamp through which a calculated reward APR applies.
      - `campaignId` `string` _(required)_: EarnVault address that identifies the reward campaign.
      - `endsAt` `integer` _(required)_: Exclusive campaign end as a Unix timestamp.
      - `startsAt` `integer` _(required)_: Inclusive campaign start as a Unix timestamp.
      - `targetTotalApr` `string` _(required)_: Configured target for combined observed vault yield and Merkle rewards.
    - `vault` `string` _(required)_: Observed fee-aware vault APY before reward APR.
    - `window` `string` _(required)_: Window this rate covers.
  - `assetToken` `object` _(required)_: A compact token reference, returned when you request `include=token`.
    - `address` `string` _(required)_: The TIP-20 token contract address on Tempo.
    - `currency` `string` _(required)_: The currency label for this token, such as `USD` for USD-denominated stablecoins.
    - `decimals` `integer` _(required)_: The number of decimal places the token uses; Tempo stablecoins typically use 6.
    - `id` `string` _(required)_: A stable resource ID for this token, equal to its contract address.
    - `logoUri` `string`: A URL for the token’s logo image, when one is available.
    - `name` `string` _(required)_: The token’s human-readable name.
    - `symbol` `string` _(required)_: The short ticker symbol wallets and apps show for this token.
    - `verified` `boolean` _(required)_: Whether this token is in Tempo’s curated verified token list.
  - `capabilities` `object`: Vault capabilities, when requested.
    - `asyncRedeem` `boolean` _(required)_: Whether queued redemptions are supported.
    - `boundedRedeem` `boolean` _(required)_: Whether redemption accepts a minimum asset bound.
    - `deposit` `boolean` _(required)_: Whether asset deposits are supported.
    - `exactWithdraw` `boolean` _(required)_: Whether exact asset withdrawals are supported.
    - `inKindDeposit` `boolean` _(required)_: Whether venue-share deposits are supported.
    - `privateRouting` `boolean` _(required)_: Whether private routing is supported.
    - `redeem` `boolean` _(required)_: Whether immediate redemptions are supported.
    - `routerSwaps` `boolean` _(required)_: Whether router token swaps are supported.
  - `description` `string` _(required)_: Curated vault description, or null when the vault is not verified.
  - `engine` `object` _(required)_
    - `address` `string` _(required)_: Current vault engine contract address.
    - `type` `string` _(required)_: Inferred vault engine type.
    - `venue` `string` _(required)_: Yield venue, or null when the engine does not expose one.
  - `id` `string` _(required)_: Stable vault id, equal to the lowercase vault address.
  - `instantLiquidity` `string` _(required)_: Assets the venue would release right now, capped at the vault backing, in asset base units. Null when the engine interface cannot report a reliable number.
  - `instantLiquidityValue` `object`: Instant liquidity valued in USD, when requested via `include=tvl`, or null when liquidity is unavailable or the asset has no priced display currency.
    - `amount` `string` _(required)_: Value in base units at `decimals` precision.
    - `currency` `string` _(required)_: Display currency of this value.
    - `decimals` `integer` _(required)_: Decimal places used to convert `amount` into `formatted`.
    - `formatted` `string` _(required)_: Value rendered in whole units.
  - `label` `string` _(required)_: Vault display label.
  - `sharePrice` `object` _(required)_: Assets returned for one whole earn share, in the asset display currency, or null when the engine cannot quote an exit.
    - `amount` `string` _(required)_: Value in base units at `decimals` precision.
    - `currency` `string` _(required)_: Display currency of this value.
    - `decimals` `integer` _(required)_: Decimal places used to convert `amount` into `formatted`.
    - `formatted` `string` _(required)_: Value rendered in whole units.
  - `shareToken` `object` _(required)_: A compact token reference, returned when you request `include=token`.
    - `address` `string` _(required)_: The TIP-20 token contract address on Tempo.
    - `currency` `string` _(required)_: The currency label for this token, such as `USD` for USD-denominated stablecoins.
    - `decimals` `integer` _(required)_: The number of decimal places the token uses; Tempo stablecoins typically use 6.
    - `id` `string` _(required)_: A stable resource ID for this token, equal to its contract address.
    - `logoUri` `string`: A URL for the token’s logo image, when one is available.
    - `name` `string` _(required)_: The token’s human-readable name.
    - `symbol` `string` _(required)_: The short ticker symbol wallets and apps show for this token.
    - `verified` `boolean` _(required)_: Whether this token is in Tempo’s curated verified token list.
  - `slug` `string` _(required)_: Stable curated vault slug.
  - `state` `object` _(required)_: Live vault accounting state.
    - `depositsPaused` `boolean` _(required)_: Whether new deposits are paused.
    - `engineShares` `string` _(required)_: Venue shares held for the vault.
    - `feesActive` `boolean` _(required)_: Whether fees are configured and not emergency-disabled.
    - `isAccountingAligned` `boolean` _(required)_: Whether Earn share supply matches its asset backing.
    - `openRedeemRequestCount` `integer` _(required)_: Queued redemptions still awaiting settlement.
    - `totalAssets` `string` _(required)_: Asset value of the active backing.
    - `totalEarnShares` `string` _(required)_: Active Earn share supply.
  - `tvl` `object`: Total assets valued in USD, when requested via `include=tvl`, or null when the asset has no priced display currency.
    - `amount` `string` _(required)_: Value in base units at `decimals` precision.
    - `currency` `string` _(required)_: Display currency of this value.
    - `decimals` `integer` _(required)_: Decimal places used to convert `amount` into `formatted`.
    - `formatted` `string` _(required)_: Value rendered in whole units.
  - `vaultAddress` `string` _(required)_: Earn vault contract address.
  - `verified` `boolean` _(required)_: This vault is in the curated earn registry.
  - `zone` `object`: Curated private Zone route, when requested, or null when absent.
    - `chainId` `string | number` _(required)_: Private Zone chain id.
    - `inputTokens` `string[]` _(required)_: Tokens accepted by private deposits.
    - `name` `string` _(required)_: Private Zone name.
    - `outputTokens` `string[]` _(required)_: Tokens supported by private redemptions.
  - `zones` `object[]`: Curated private Zone routes, when requested.
    - `chainId` `string | number` _(required)_: Private Zone chain id.
    - `deploymentBlock` `integer` _(required)_: Parent-chain block that deployed the Earn router.
    - `earnRouter` `string` _(required)_: Parent-chain router for this Zone and Earn vault.
    - `inputTokens` `string[]` _(required)_: Tokens accepted by private deposits.
    - `name` `string` _(required)_: Private Zone name.
    - `outputTokens` `string[]` _(required)_: Tokens returned by private redemptions.
- `meta` `object`: Rate provenance for valued fields.
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

#### `502`: Could not read curated earn registry or vault data.

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
curl 'https://api.tempo.xyz/v1/earn/vaults/verified?asset=0xbe058e1c4df8a4366a387bf595b284246a93039e&capability=asyncRedeem,boundedRedeem,deposit,exactWithdraw,inKindDeposit,privateRouting,redeem,routerSwaps&chainId=4217&cursor=WzIzNDU2Nzg5LDBd&engine.type=erc4626&include=access,apy,capabilities,token.logoUri,tvl,zone,zones&limit=10&apy.window=7d'
```

```ts
fetch('https://api.tempo.xyz/v1/earn/vaults/verified?asset=0xbe058e1c4df8a4366a387bf595b284246a93039e&capability=asyncRedeem,boundedRedeem,deposit,exactWithdraw,inKindDeposit,privateRouting,redeem,routerSwaps&chainId=4217&cursor=WzIzNDU2Nzg5LDBd&engine.type=erc4626&include=access,apy,capabilities,token.logoUri,tvl,zone,zones&limit=10&apy.window=7d')
```

## List account positions

`GET /v1/earn/addresses/{address}/positions`

Lists every earn vault where an account currently holds shares on the selected Tempo chain or private Zone. Lifetime cash flows are available on Tempo chains.

### Path parameters

- `address` `string` _(required)_: Account whose earn positions to list.

### Query parameters

- `chainId` `string | number`: Which Tempo network to query. Use the alias `mainnet` or `testnet`, or a numeric chain id. Defaults to `mainnet` when omitted.
- `cursor` `string`: Opaque keyset cursor from a previous response (`nextCursor`); pass it back verbatim to fetch the next page. Omit for the first (head) page.
- `include` `string[]`: Comma-separated position fields to include, such as `earnings`. Earnings are unavailable when selecting a private Zone.
- `limit` `integer`: How many items to return per page (5–50, default 10). Use `nextCursor` to fetch more.
- `valuation.currency` `string`: When present, include each position’s nominal value in this denomination. Case-insensitive and must be priced by the configured FX oracle.
- `verified` `boolean`: When `true`, include only positions in registry-curated (verified) earn vaults.

### Responses

#### `200`: A page of the account’s earn vault positions.

Headers:

- `RateLimit-Limit` `integer`: How many requests you may make in the current time window. Not sent on cached responses or `402` payment challenges.
- `RateLimit-Remaining` `integer`: How many requests you have left in the current window before you are rate-limited. Not sent on cached responses or `402` payment challenges.
- `RateLimit-Reset` `integer`: When the current window resets, as a Unix timestamp in seconds. Not sent on cached responses or `402` payment challenges.
- `RateLimit-Scope` `string`: Which quota this request counted against (e.g. `data:read`). Not sent on cached responses or `402` payment challenges.
- `tempo-request-id` `string`: A unique id for this request, returned on every response (and as `requestId` in error bodies). Include it when contacting support so we can find your request.

Body (`application/json`):

- `data` `object[]` _(required)_: Vaults where the account holds earn shares.
  - `assetAmount` `object` _(required)_: Current asset value of the held shares, including fees, in `valueToken` units.
    - `amount` `string` _(required)_: Value in base units at `decimals` precision.
    - `currency` `string` _(required)_: Display currency of this value.
    - `decimals` `integer` _(required)_: Decimal places used to convert `amount` into `formatted`.
    - `formatted` `string` _(required)_: Value rendered in whole units.
  - `assetToken` `object` _(required)_: A compact token reference, returned when you request `include=token`.
    - `address` `string` _(required)_: The TIP-20 token contract address on Tempo.
    - `currency` `string` _(required)_: The currency label for this token, such as `USD` for USD-denominated stablecoins.
    - `decimals` `integer` _(required)_: The number of decimal places the token uses; Tempo stablecoins typically use 6.
    - `id` `string` _(required)_: A stable resource ID for this token, equal to its contract address.
    - `logoUri` `string`: A URL for the token’s logo image, when one is available.
    - `name` `string` _(required)_: The token’s human-readable name.
    - `symbol` `string` _(required)_: The short ticker symbol wallets and apps show for this token.
    - `verified` `boolean` _(required)_: Whether this token is in Tempo’s curated verified token list.
  - `chainId` `string | number` _(required)_: Chain containing the held shares.
  - `id` `string` _(required)_: Stable resource ID for this position, equal to the vault address.
  - `lifetimeCashFlows` `object`: Lifetime deposits and completed withdrawals, when requested.
  - `shareAmount` `object` _(required)_: Earn share balance this account holds, in `shareToken` units.
    - `amount` `string` _(required)_: Value in base units at `decimals` precision.
    - `currency` `string` _(required)_: Display currency of this value.
    - `decimals` `integer` _(required)_: Decimal places used to convert `amount` into `formatted`.
    - `formatted` `string` _(required)_: Value rendered in whole units.
  - `shareToken` `object` _(required)_: A compact token reference, returned when you request `include=token`.
    - `address` `string` _(required)_: The TIP-20 token contract address on Tempo.
    - `currency` `string` _(required)_: The currency label for this token, such as `USD` for USD-denominated stablecoins.
    - `decimals` `integer` _(required)_: The number of decimal places the token uses; Tempo stablecoins typically use 6.
    - `id` `string` _(required)_: A stable resource ID for this token, equal to its contract address.
    - `logoUri` `string`: A URL for the token’s logo image, when one is available.
    - `name` `string` _(required)_: The token’s human-readable name.
    - `symbol` `string` _(required)_: The short ticker symbol wallets and apps show for this token.
    - `verified` `boolean` _(required)_: Whether this token is in Tempo’s curated verified token list.
  - `valuation` `object`: The position’s nominal value when `valuation.currency` is requested, or `null` when the asset token is unverified, its display currency has no rate, or rates were unavailable.
    - `amount` `string` _(required)_: The holding’s nominal value, as a decimal string in `currency`.
    - `currency` `string` _(required)_: The denomination currency of this value.
  - `valueToken` `object` _(required)_: A compact token reference, returned when you request `include=token`.
    - `address` `string` _(required)_: The TIP-20 token contract address on Tempo.
    - `currency` `string` _(required)_: The currency label for this token, such as `USD` for USD-denominated stablecoins.
    - `decimals` `integer` _(required)_: The number of decimal places the token uses; Tempo stablecoins typically use 6.
    - `id` `string` _(required)_: A stable resource ID for this token, equal to its contract address.
    - `logoUri` `string`: A URL for the token’s logo image, when one is available.
    - `name` `string` _(required)_: The token’s human-readable name.
    - `symbol` `string` _(required)_: The short ticker symbol wallets and apps show for this token.
    - `verified` `boolean` _(required)_: Whether this token is in Tempo’s curated verified token list.
  - `vaultAddress` `string` _(required)_: Earn vault contract address holding this position.
  - `verified` `boolean` _(required)_: Whether the vault is in the curated earn registry.
- `meta` `object`: Page-level valuation rate provenance.
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

#### `502`: Could not read earn deployment or position data.

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
curl 'https://api.tempo.xyz/v1/earn/addresses/0xbe058e1c4df8a4366a387bf595b284246a93039e/positions?chainId=4217&cursor=WzIzNDU2Nzg5LDBd&include=earnings&limit=10&valuation.currency=AUD&verified=true'
```

```ts
fetch('https://api.tempo.xyz/v1/earn/addresses/0xbe058e1c4df8a4366a387bf595b284246a93039e/positions?chainId=4217&cursor=WzIzNDU2Nzg5LDBd&include=earnings&limit=10&valuation.currency=AUD&verified=true')
```

## List share prices

`GET /v1/earn/vaults/{vaultId}/share-prices`

Lists daily historical share prices for one earn vault.

### Path parameters

- `vaultId` `string` _(required)_: Earn vault contract address.

### Query parameters

- `chainId` `string | number`: Which Tempo network to query. Use the alias `mainnet` or `testnet`, or a numeric chain id. Defaults to `mainnet` when omitted.
- `from` `string <date-time>` _(required)_: First daily share-price observation, as an ISO 8601 timestamp.
- `interval` `string`: Time between share-price observations.
- `to` `string <date-time>` _(required)_: Last possible daily share-price observation, as an ISO 8601 timestamp.

### Responses

#### `200`: Daily historical share prices for one earn vault.

Headers:

- `RateLimit-Limit` `integer`: How many requests you may make in the current time window. Not sent on cached responses or `402` payment challenges.
- `RateLimit-Remaining` `integer`: How many requests you have left in the current window before you are rate-limited. Not sent on cached responses or `402` payment challenges.
- `RateLimit-Reset` `integer`: When the current window resets, as a Unix timestamp in seconds. Not sent on cached responses or `402` payment challenges.
- `RateLimit-Scope` `string`: Which quota this request counted against (e.g. `data:read`). Not sent on cached responses or `402` payment challenges.
- `tempo-request-id` `string`: A unique id for this request, returned on every response (and as `requestId` in error bodies). Include it when contacting support so we can find your request.

Body (`application/json`):

- `data` `object[]` _(required)_: Daily Earn vault share prices.
  - `sharePrice` `object` _(required)_: Assets returned for one whole Earn share at the observation block.
    - `amount` `string` _(required)_: Value in base units at `decimals` precision.
    - `currency` `string` _(required)_: Display currency of this value.
    - `decimals` `integer` _(required)_: Decimal places used to convert `amount` into `formatted`.
    - `formatted` `string` _(required)_: Value rendered in whole units.
  - `timestamp` `string <date-time>` _(required)_: Requested daily observation timestamp.

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

#### `404`: No compatible earn vault was found at the supplied vault address.

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

#### `502`: Could not read historical earn vault share prices.

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
curl 'https://api.tempo.xyz/v1/earn/vaults/0xf4ae63687d6753a78e7f551d2eda1d0d31a5ea3a/share-prices?chainId=4217&from=2026-07-01T00:00:00.000Z&interval=day&to=2026-07-31T00:00:00.000Z'
```

```ts
fetch('https://api.tempo.xyz/v1/earn/vaults/0xf4ae63687d6753a78e7f551d2eda1d0d31a5ea3a/share-prices?chainId=4217&from=2026-07-01T00:00:00.000Z&interval=day&to=2026-07-31T00:00:00.000Z')
```

## Get vault

`GET /v1/earn/vaults/{vaultId}`

Resolves any compatible earn vault directly from current chain state and enriches it when curated.

### Path parameters

- `vaultId` `string` _(required)_: Earn vault contract address.

### Query parameters

- `chainId` `string | number`: Which Tempo network to query. Use the alias `mainnet` or `testnet`, or a numeric chain id. Defaults to `mainnet` when omitted.
- `include` `string[]`: Comma-separated vault fields to include, such as `apy,tvl`.
- `apy.window` `string`: Rate measurement window. Selecting one includes `apy`; omission prefers `7d` and falls back to `1h` when unavailable.

### Responses

#### `200`: One compatible earn vault.

Headers:

- `RateLimit-Limit` `integer`: How many requests you may make in the current time window. Not sent on cached responses or `402` payment challenges.
- `RateLimit-Remaining` `integer`: How many requests you have left in the current window before you are rate-limited. Not sent on cached responses or `402` payment challenges.
- `RateLimit-Reset` `integer`: When the current window resets, as a Unix timestamp in seconds. Not sent on cached responses or `402` payment challenges.
- `RateLimit-Scope` `string`: Which quota this request counted against (e.g. `data:read`). Not sent on cached responses or `402` payment challenges.
- `tempo-request-id` `string`: A unique id for this request, returned on every response (and as `requestId` in error bodies). Include it when contacting support so we can find your request.

Body (`application/json`):

- `access` `object`: Vault share-token access, when requested.
  - `status` `string` _(required)_: Vault share-token access status.
- `apy` `object`: Annualized vault yield over the selected window, plus every available current Merkle reward APR. Null when no component is measurable.
  - `asOf` `string <date-time>` _(required)_: UTC instant the rate was measured to, rounded to a 15-minute bucket.
  - `methodology` `string` _(required)_: Identifier of the calculation that produced this rate.
  - `net` `string` _(required)_: Higher of observed vault APY and configured reward campaign targets.
  - `rewards` `object[]`: Enabled, registered Merkle rewards. Omitted when reward enrichment is unavailable.
    - `apr` `string` _(required)_: Current reward APR, or null before its first calculation.
    - `asset` `object` _(required)_: EarnShare token distributed by the reward campaign.
      - `address` `string` _(required)_: An account address — the `0x`-prefixed 20-byte identifier for a wallet or contract, returned in lowercase.
      - `chainId` `string | number` _(required)_: Which Tempo network to query. Use the alias `mainnet` or `testnet`, or a numeric chain id (mainnet is `4217`).
      - `decimals` `integer` _(required)_: Reward asset decimal places.
    - `calculatedThrough` `integer`: Unix timestamp through which a calculated reward APR applies.
    - `campaignId` `string` _(required)_: EarnVault address that identifies the reward campaign.
    - `endsAt` `integer` _(required)_: Exclusive campaign end as a Unix timestamp.
    - `startsAt` `integer` _(required)_: Inclusive campaign start as a Unix timestamp.
    - `targetTotalApr` `string` _(required)_: Configured target for combined observed vault yield and Merkle rewards.
  - `vault` `string` _(required)_: Observed fee-aware vault APY before reward APR.
  - `window` `string` _(required)_: Window this rate covers.
- `assetToken` `object` _(required)_: A compact token reference, returned when you request `include=token`.
  - `address` `string` _(required)_: The TIP-20 token contract address on Tempo.
  - `currency` `string` _(required)_: The currency label for this token, such as `USD` for USD-denominated stablecoins.
  - `decimals` `integer` _(required)_: The number of decimal places the token uses; Tempo stablecoins typically use 6.
  - `id` `string` _(required)_: A stable resource ID for this token, equal to its contract address.
  - `logoUri` `string`: A URL for the token’s logo image, when one is available.
  - `name` `string` _(required)_: The token’s human-readable name.
  - `symbol` `string` _(required)_: The short ticker symbol wallets and apps show for this token.
  - `verified` `boolean` _(required)_: Whether this token is in Tempo’s curated verified token list.
- `capabilities` `object`: Vault capabilities, when requested.
  - `asyncRedeem` `boolean` _(required)_: Whether queued redemptions are supported.
  - `boundedRedeem` `boolean` _(required)_: Whether redemption accepts a minimum asset bound.
  - `deposit` `boolean` _(required)_: Whether asset deposits are supported.
  - `exactWithdraw` `boolean` _(required)_: Whether exact asset withdrawals are supported.
  - `inKindDeposit` `boolean` _(required)_: Whether venue-share deposits are supported.
  - `privateRouting` `boolean` _(required)_: Whether private routing is supported.
  - `redeem` `boolean` _(required)_: Whether immediate redemptions are supported.
  - `routerSwaps` `boolean` _(required)_: Whether router token swaps are supported.
- `description` `string` _(required)_: Curated vault description, or null when the vault is not verified.
- `engine` `object` _(required)_: Current vault engine.
  - `address` `string` _(required)_: Current vault engine contract address.
  - `type` `string` _(required)_: Inferred engine type, or null when it is unknown.
  - `venue` `string` _(required)_: Yield venue, or null when the engine does not expose one.
- `id` `string` _(required)_: Stable vault id, equal to the lowercase vault address.
- `instantLiquidity` `string` _(required)_: Assets the venue would release right now, capped at the vault backing, in asset base units. Null when the engine interface cannot report a reliable number.
- `instantLiquidityValue` `object`: Instant liquidity valued in USD, when requested via `include=tvl`, or null when liquidity is unavailable or the asset has no priced display currency.
  - `amount` `string` _(required)_: Value in base units at `decimals` precision.
  - `currency` `string` _(required)_: Display currency of this value.
  - `decimals` `integer` _(required)_: Decimal places used to convert `amount` into `formatted`.
  - `formatted` `string` _(required)_: Value rendered in whole units.
- `label` `string` _(required)_: Vault display label.
- `sharePrice` `object` _(required)_: Assets returned for one whole earn share, in the asset display currency, or null when the engine cannot quote an exit.
  - `amount` `string` _(required)_: Value in base units at `decimals` precision.
  - `currency` `string` _(required)_: Display currency of this value.
  - `decimals` `integer` _(required)_: Decimal places used to convert `amount` into `formatted`.
  - `formatted` `string` _(required)_: Value rendered in whole units.
- `shareToken` `object` _(required)_: A compact token reference, returned when you request `include=token`.
  - `address` `string` _(required)_: The TIP-20 token contract address on Tempo.
  - `currency` `string` _(required)_: The currency label for this token, such as `USD` for USD-denominated stablecoins.
  - `decimals` `integer` _(required)_: The number of decimal places the token uses; Tempo stablecoins typically use 6.
  - `id` `string` _(required)_: A stable resource ID for this token, equal to its contract address.
  - `logoUri` `string`: A URL for the token’s logo image, when one is available.
  - `name` `string` _(required)_: The token’s human-readable name.
  - `symbol` `string` _(required)_: The short ticker symbol wallets and apps show for this token.
  - `verified` `boolean` _(required)_: Whether this token is in Tempo’s curated verified token list.
- `slug` `string` _(required)_: Curated URL slug, or null when the vault is not verified.
- `state` `object` _(required)_: Live vault accounting state.
  - `depositsPaused` `boolean` _(required)_: Whether new deposits are paused.
  - `engineShares` `string` _(required)_: Venue shares held for the vault.
  - `feesActive` `boolean` _(required)_: Whether fees are configured and not emergency-disabled.
  - `isAccountingAligned` `boolean` _(required)_: Whether Earn share supply matches its asset backing.
  - `openRedeemRequestCount` `integer` _(required)_: Queued redemptions still awaiting settlement.
  - `totalAssets` `string` _(required)_: Asset value of the active backing.
  - `totalEarnShares` `string` _(required)_: Active Earn share supply.
- `tvl` `object`: Total assets valued in USD, when requested via `include=tvl`, or null when the asset has no priced display currency.
  - `amount` `string` _(required)_: Value in base units at `decimals` precision.
  - `currency` `string` _(required)_: Display currency of this value.
  - `decimals` `integer` _(required)_: Decimal places used to convert `amount` into `formatted`.
  - `formatted` `string` _(required)_: Value rendered in whole units.
- `vaultAddress` `string` _(required)_: Earn vault contract address.
- `verified` `boolean` _(required)_: Whether this vault is in the curated earn registry.
- `zone` `object`: Curated private Zone route, when requested, or null when absent.
  - `chainId` `string | number` _(required)_: Private Zone chain id.
  - `inputTokens` `string[]` _(required)_: Tokens accepted by private deposits.
  - `name` `string` _(required)_: Private Zone name.
  - `outputTokens` `string[]` _(required)_: Tokens supported by private redemptions.
- `zones` `object[]`: Curated private Zone routes, when requested.
  - `chainId` `string | number` _(required)_: Private Zone chain id.
  - `deploymentBlock` `integer` _(required)_: Parent-chain block that deployed the Earn router.
  - `earnRouter` `string` _(required)_: Parent-chain router for this Zone and Earn vault.
  - `inputTokens` `string[]` _(required)_: Tokens accepted by private deposits.
  - `name` `string` _(required)_: Private Zone name.
  - `outputTokens` `string[]` _(required)_: Tokens returned by private redemptions.
- `meta` `object`: Rate provenance for valued fields.
  - `valuation` `object`: Rate provenance for leg valuations. Present when conversion rates were consulted; absent when every value was identity-valued or rates were unavailable.
    - `asOf` `string <date-time>` _(required)_: Publication date of the rate set as an ISO 8601 timestamp.
    - `basis` `string` _(required)_: Valuation basis: one token unit counts as one unit of its display currency.
    - `source` `string` _(required)_: FX rate oracle that supplied the conversion rates.

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

#### `404`: No compatible earn vault was found at this address.

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

#### `502`: Could not read earn vault data.

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
curl 'https://api.tempo.xyz/v1/earn/vaults/0xbe058e1c4df8a4366a387bf595b284246a93039e?chainId=4217&include=access,apy,capabilities,token.logoUri,tvl,zone,zones&apy.window=7d'
```

```ts
fetch('https://api.tempo.xyz/v1/earn/vaults/0xbe058e1c4df8a4366a387bf595b284246a93039e?chainId=4217&include=access,apy,capabilities,token.logoUri,tvl,zone,zones&apy.window=7d')
```

## Get account position

`GET /v1/earn/vaults/{vaultId}/positions/{address}`

Gets an account’s direct or Zone-routed balances and asset value for one earn vault, optionally at an ISO 8601 timestamp.

### Path parameters

- `address` `string` _(required)_: Account whose earn position to read.
- `vaultId` `string` _(required)_: Earn vault contract address.

### Query parameters

- `asOf` `string <date-time>`: ISO 8601 timestamp at which to read the position. Resolves the latest indexed block at or before this time.
- `chainId` `string | number`: Which Tempo network to query. Use the alias `mainnet` or `testnet`, or a numeric chain id. Defaults to `mainnet` when omitted.
- `include` `string[]`: Include wallet-specific APY or current reward state, optionally with the latest recovery proof.

### Responses

#### `200`: Current or historical earn position for one account in one vault.

Headers:

- `RateLimit-Limit` `integer`: How many requests you may make in the current time window. Not sent on cached responses or `402` payment challenges.
- `RateLimit-Remaining` `integer`: How many requests you have left in the current window before you are rate-limited. Not sent on cached responses or `402` payment challenges.
- `RateLimit-Reset` `integer`: When the current window resets, as a Unix timestamp in seconds. Not sent on cached responses or `402` payment challenges.
- `RateLimit-Scope` `string`: Which quota this request counted against (e.g. `data:read`). Not sent on cached responses or `402` payment challenges.
- `tempo-request-id` `string`: A unique id for this request, returned on every response (and as `requestId` in error bodies). Include it when contacting support so we can find your request.

Body (`application/json`):

- `account` `string` _(required)_: Account whose earn position was read.
- `assetAllowance` `string` _(required)_: Assets the vault may spend from a direct account, in asset base units. Always zero for Zone-routed positions, which use Zone withdrawals instead of approvals.
- `assetBalance` `string` _(required)_: Assets held by this account at the observation block, in asset base units.
- `assetToken` `string` _(required)_: TIP-20 asset token accepted by the vault or its selected Zone route.
- `chainId` `string | number` _(required)_: Chain containing the account position.
- `id` `string` _(required)_: Stable resource ID for this vault position, equal to the account address.
- `shareAllowance` `string` _(required)_: Earn shares the vault may spend from a direct account, in share base units. Always zero for Zone-routed positions, which use Zone withdrawals instead of approvals.
- `shareBalance` `string` _(required)_: Earn shares held by this account at the observation block, in share base units.
- `shareToken` `string` _(required)_: TIP-20 token representing earn shares.
- `value` `string` _(required)_: Asset value of this account’s earn shares at the observation block, including fees, in `valueToken` base units.
- `valueToken` `string` _(required)_: TIP-20 asset denominating `value` on the vault’s parent chain.
- `apy` `object`: Wallet-specific effective APY when requested, or null when unavailable. Qualification comes from the latest delivered reward snapshot and may lag recent deposits or transfers.
  - `breakdown` `object[]` _(required)_: Position amounts grouped by the annual rate they receive.
    - `assetAmount` `object` _(required)_: Vault asset amount receiving this annual rate.
      - `baseUnits` `string` _(required)_: Position amount in vault asset base units.
      - `decimals` `integer` _(required)_: Vault asset decimal places.
      - `formatted` `string` _(required)_: Position amount rendered in whole vault asset units.
    - `net` `string` _(required)_: Annual rate applied to this position amount.
    - `type` `string` _(required)_: Base vault yield or qualified depositor boost.
  - `net` `string` _(required)_: Balance-weighted annual rate for this wallet position.
- `asOf` `string <date-time>`: Requested historical observation time, when supplied.
- `block` `object`: Indexed block used for a historical Earn position observation, when requested.
  - `number` `integer` _(required)_: Indexed observation block.
  - `timestamp` `string <date-time>` _(required)_: Timestamp of the indexed observation block.
- `rewards` `object`: Current reward state when requested through `include`.
  - `cumulativeEntitlement` `string` _(required)_: Cumulative EarnShare entitlement.
  - `cumulativePaid` `string` _(required)_: Cumulative EarnShare paid.
  - `deferral` `string`: Current payout delivery exception.
  - `pending` `string` _(required)_: EarnShare still owed.
  - `proof` `object`: Permissionless recovery proof against the confirmed root.
    - `cumulativeAmount` `string` _(required)_: A non-negative whole number, given as a decimal string so very large token amounts keep full precision. Expressed in the smallest unit of the token (e.g. `1000000` is 1.00 of a 6-decimal stablecoin).
    - `distributorAddress` `string` _(required)_: An account address — the `0x`-prefixed 20-byte identifier for a wallet or contract, returned in lowercase.
    - `proof` `string[]` _(required)_
    - `rootVersion` `string` _(required)_: A non-negative whole number, given as a decimal string so very large token amounts keep full precision. Expressed in the smallest unit of the token (e.g. `1000000` is 1.00 of a 6-decimal stablecoin).
    - `statementHash` `string` _(required)_: A 32-byte hash, `0x`-prefixed and returned in lowercase — for example a transaction or block hash.

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

#### `404`: No compatible earn vault was found at the supplied vault address.

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

#### `502`: Could not read the earn vault position.

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
curl 'https://api.tempo.xyz/v1/earn/vaults/0x4f94590b636f5878bce585e82379de81e1ec174f/positions/0xbe058e1c4df8a4366a387bf595b284246a93039e?asOf=2026-07-21T09:00:00.000Z&chainId=4217&include=apy,rewards,rewards.proof'
```

```ts
fetch('https://api.tempo.xyz/v1/earn/vaults/0x4f94590b636f5878bce585e82379de81e1ec174f/positions/0xbe058e1c4df8a4366a387bf595b284246a93039e?asOf=2026-07-21T09:00:00.000Z&chainId=4217&include=apy,rewards,rewards.proof')
```

## Get vault earnings

`GET /v1/earn/vaults/{vaultId}/earnings/{address}`

Gets an account’s indexed asset value and earnings for lifetime history, the trailing 30 days, or shares still held.

### Path parameters

- `address` `string` _(required)_: Account whose vault earnings to read.
- `vaultId` `string` _(required)_: Earn vault contract address.

### Query parameters

- `chainId` `string | number`: Which Tempo network to query. Use the alias `mainnet` or `testnet`, or a numeric chain id. Defaults to `mainnet` when omitted.
- `period` `string`: Earnings period to calculate: trailing 30 days, shares still held, or lifetime history.

### Responses

#### `200`: Cost-basis-aware earnings for one account in one vault.

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

#### `404`: No compatible earn vault was found at this address.

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

#### `502`: Could not read the earn vault earnings.

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
curl 'https://api.tempo.xyz/v1/earn/vaults/0xf4ae63687d6753a78e7f551d2eda1d0d31a5ea3a/earnings/0xbe058e1c4df8a4366a387bf595b284246a93039e?chainId=4217&period=lifetime'
```

```ts
fetch('https://api.tempo.xyz/v1/earn/vaults/0xf4ae63687d6753a78e7f551d2eda1d0d31a5ea3a/earnings/0xbe058e1c4df8a4366a387bf595b284246a93039e?chainId=4217&period=lifetime')
```
