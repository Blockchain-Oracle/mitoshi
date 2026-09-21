# Usage

Request and sponsorship usage for organizations.

## Get request usage

`GET /v1/orgs/{orgId}/usage/requests`

### Path parameters

- `orgId` `string` _(required)_: The organization id (`org_…`).

### Query parameters

- `environment` `string`: Only include requests made with this API-key environment.
- `from` `string <date-time>`: Only include requests at or after this ISO 8601 timestamp.
- `interval` `string`: Time bucket size for the usage series.
- `projectId` `string`: Only include requests attributed to this project (`prj_…`). Omit for organization-wide usage.
- `to` `string <date-time>`: Only include requests at or before this ISO 8601 timestamp.

### Responses

#### `200`: The request usage.

Headers:

- `RateLimit-Limit` `integer`: How many requests you may make in the current time window. Not sent on cached responses or `402` payment challenges.
- `RateLimit-Remaining` `integer`: How many requests you have left in the current window before you are rate-limited. Not sent on cached responses or `402` payment challenges.
- `RateLimit-Reset` `integer`: When the current window resets, as a Unix timestamp in seconds. Not sent on cached responses or `402` payment challenges.
- `RateLimit-Scope` `string`: Which quota this request counted against (e.g. `data:read`). Not sent on cached responses or `402` payment challenges.
- `tempo-request-id` `string`: A unique id for this request, returned on every response (and as `requestId` in error bodies). Include it when contacting support so we can find your request.

Body (`application/json`):

- `byKey` `object[]` _(required)_: Usage grouped by API key.
  - `apiKeyId` `string` _(required)_: API key id (`key_…`).
  - `averageDurationMs` `number` _(required)_: Average request duration in milliseconds.
  - `errors` `integer` _(required)_: Requests whose status was at least 400.
  - `requests` `integer` _(required)_: Total requests.
- `byRoute` `object[]` _(required)_: Usage grouped by route.
  - `averageDurationMs` `number` _(required)_: Average request duration in milliseconds.
  - `errors` `integer` _(required)_: Requests whose status was at least 400.
  - `requests` `integer` _(required)_: Total requests.
  - `route` `string` _(required)_: Matched route pattern.
- `byStatus` `object[]` _(required)_: Usage grouped by status code.
  - `requests` `integer` _(required)_: Total requests.
  - `status` `integer` _(required)_: HTTP status code.
- `from` `string <date-time>` _(required)_: Inclusive lower timestamp bound used for the read (ISO 8601).
- `interval` `string` _(required)_: Bucket size used for the time series.
- `series` `object[]` _(required)_: Usage grouped into time buckets.
  - `errors` `integer` _(required)_: Requests whose status was at least 400.
  - `requests` `integer` _(required)_: Total requests.
  - `time` `string <date-time>` _(required)_: Bucket start timestamp (ISO 8601).
- `to` `string <date-time>` _(required)_: Inclusive upper timestamp bound used for the read (ISO 8601).
- `totals` `object` _(required)_: Overall usage totals.
  - `averageDurationMs` `number` _(required)_: Average request duration in milliseconds.
  - `errors` `integer` _(required)_: Requests whose status was at least 400.
  - `requests` `integer` _(required)_: Total requests.

#### `400`: Malformed API key, invalid path, or invalid query.

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

#### `404`: No accessible organization was found for this id.

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

#### `501`: Usage analytics is not configured on this deployment.

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
curl 'https://api.tempo.xyz/v1/orgs/org_1a2b3c4d5e6f7g8h9j0k1m2n/usage/requests?environment=sandbox&from=2026-01-01T00:00:00Z&interval=day&projectId=prj_1a2b3c4d5e6f7g8h9j0k1m2n&to=2026-01-31T23:59:59Z'
```

```ts
fetch('https://api.tempo.xyz/v1/orgs/org_1a2b3c4d5e6f7g8h9j0k1m2n/usage/requests?environment=sandbox&from=2026-01-01T00:00:00Z&interval=day&projectId=prj_1a2b3c4d5e6f7g8h9j0k1m2n&to=2026-01-31T23:59:59Z')
```

## Get sponsorship usage

`GET /v1/orgs/{orgId}/usage/sponsorships`

### Path parameters

- `orgId` `string` _(required)_: The organization id (`org_…`).

### Query parameters

- `environment` `string`: Only include sponsorships requested under this key environment.
- `from` `string <date-time>`: Window start (ISO 8601), inclusive. Defaults to 30 days before `to`.
- `interval` `string`: Bucket width, aligned to UTC calendar boundaries.
- `projectId` `string`: Only include sponsorships attributed to this project (`prj_…`).
- `to` `string <date-time>`: Window end (ISO 8601), exclusive. Defaults to now.

### Responses

#### `200`: The organization's sponsorship usage series.

Headers:

- `RateLimit-Limit` `integer`: How many requests you may make in the current time window. Not sent on cached responses or `402` payment challenges.
- `RateLimit-Remaining` `integer`: How many requests you have left in the current window before you are rate-limited. Not sent on cached responses or `402` payment challenges.
- `RateLimit-Reset` `integer`: When the current window resets, as a Unix timestamp in seconds. Not sent on cached responses or `402` payment challenges.
- `RateLimit-Scope` `string`: Which quota this request counted against (e.g. `data:read`). Not sent on cached responses or `402` payment challenges.
- `tempo-request-id` `string`: A unique id for this request, returned on every response (and as `requestId` in error bodies). Include it when contacting support so we can find your request.

Body (`application/json`):

- `data` `object[]` _(required)_: Time-ordered usage buckets; buckets with no sponsorships are omitted.
  - `count` `number` _(required)_: Sponsored transactions recorded in the bucket, any status.
  - `failed` `number` _(required)_: Sponsored transactions in the bucket whose status is `failed`.
  - `feeTotal` `object` _(required)_: Committed fees for the bucket.
    - `amount` `string` _(required)_: Committed fees as a decimal string: finalized fees plus in-flight fee caps; failed rows contribute zero.
    - `currency` `string` _(required)_: Currency of the fee figure.
  - `timestamp` `string <date-time>` _(required)_: Bucket start (ISO 8601), aligned to UTC calendar boundaries.

#### `400`: Malformed API key, invalid path, or invalid query.

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

#### `404`: No accessible organization was found for this id.

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
curl 'https://api.tempo.xyz/v1/orgs/org_1a2b3c4d5e6f7g8h9j0k1m2n/usage/sponsorships?environment=production&from=2026-01-01T00:00:00Z&interval=day&projectId=prj_1a2b3c4d5e6f7g8h9j0k1m2n&to=2026-01-31T00:00:00Z'
```

```ts
fetch('https://api.tempo.xyz/v1/orgs/org_1a2b3c4d5e6f7g8h9j0k1m2n/usage/sponsorships?environment=production&from=2026-01-01T00:00:00Z&interval=day&projectId=prj_1a2b3c4d5e6f7g8h9j0k1m2n&to=2026-01-31T00:00:00Z')
```
