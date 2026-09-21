# API Keys

Credentials for accessing the Tempo API.

## List scopes

`GET /v1/scopes`

See which scopes can be granted to API keys.

### Responses

#### `200`: Issuable scope catalog.

Headers:

- `RateLimit-Limit` `integer`: How many requests you may make in the current time window. Not sent on cached responses or `402` payment challenges.
- `RateLimit-Remaining` `integer`: How many requests you have left in the current window before you are rate-limited. Not sent on cached responses or `402` payment challenges.
- `RateLimit-Reset` `integer`: When the current window resets, as a Unix timestamp in seconds. Not sent on cached responses or `402` payment challenges.
- `RateLimit-Scope` `string`: Which quota this request counted against (e.g. `data:read`). Not sent on cached responses or `402` payment challenges.
- `tempo-request-id` `string`: A unique id for this request, returned on every response (and as `requestId` in error bodies). Include it when contacting support so we can find your request.

Body (`application/json`):

- `data` `object[]` _(required)_: Issuable API-key scopes.
  - `description` `string` _(required)_: Human-readable explanation of what the scope grants.
  - `scope` `string` _(required)_: Scope identifier used in API-key grants and route policies. Zone templates carry a concrete chain id and access level in grants.
  - `selfServe` `boolean` _(required)_: Whether an eligible session may self-mint this scope.

#### `400`: Malformed API key.

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
curl https://api.tempo.xyz/v1/scopes
```

```ts
fetch('https://api.tempo.xyz/v1/scopes')
```

## List organization API keys

`GET /v1/orgs/{orgId}/api-keys`

List every API key in the organization, across all of its projects.

### Path parameters

- `orgId` `string` _(required)_: The organization id (`org_…`).

### Query parameters

- `environment` `string`: Resource environment.
- `include` `string[]`: Fields to enrich. Defaults to lastUsedAt; pass an empty value to load metadata without analytics.

### Responses

#### `200`: The organization's keys across all projects, newest first (metadata only).

Headers:

- `RateLimit-Limit` `integer`: How many requests you may make in the current time window. Not sent on cached responses or `402` payment challenges.
- `RateLimit-Remaining` `integer`: How many requests you have left in the current window before you are rate-limited. Not sent on cached responses or `402` payment challenges.
- `RateLimit-Reset` `integer`: When the current window resets, as a Unix timestamp in seconds. Not sent on cached responses or `402` payment challenges.
- `RateLimit-Scope` `string`: Which quota this request counted against (e.g. `data:read`). Not sent on cached responses or `402` payment challenges.
- `tempo-request-id` `string`: A unique id for this request, returned on every response (and as `requestId` in error bodies). Include it when contacting support so we can find your request.

Body (`application/json`):

- `data` `object[]` _(required)_: The API keys, newest first.
  - `allowedIps` `string[]` _(required)_: Client IP addresses and CIDR ranges allowed to use this key. An empty list means unrestricted.
  - `createdAt` `string <date-time>` _(required)_: When the key was minted (ISO 8601).
  - `createdBy` `string`: Identity that minted the key (`usr_…`, or `super_admin`).
  - `environment` `string` _(required)_: Key environment.
  - `expiresAt` `string <date-time>`: When the key expires (ISO 8601). Absent for a non-expiring key.
  - `id` `string` _(required)_: Opaque key id (`key_…`).
  - `lastUsedAt` `string <date-time>`: When the key last authenticated a request (ISO 8601). Omitted with `include=` or when no usage is available.
  - `name` `string`: Human-readable key name.
  - `orgId` `string` _(required)_: Owning organization id (`org_…`).
  - `projectId` `string`: Attributed project id (`prj_…`).
  - `scopes` `string[]` _(required)_: Granted scopes. '*' and non-self-serve scopes appear only on keys minted by the super admin.
  - `tokenLast4` `string` _(required)_: Last 4 characters of the plaintext token.

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

#### `404`: No accessible organization or API key surface was found.

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
curl 'https://api.tempo.xyz/v1/orgs/org_1a2b3c4d5e6f7g8h9j0k1m2n/api-keys?environment=sandbox&include=lastUsedAt'
```

```ts
fetch('https://api.tempo.xyz/v1/orgs/org_1a2b3c4d5e6f7g8h9j0k1m2n/api-keys?environment=sandbox&include=lastUsedAt')
```

## List API keys

`GET /v1/orgs/{orgId}/projects/{projectId}/api-keys`

### Path parameters

- `orgId` `string` _(required)_: The organization id (`org_…`).
- `projectId` `string` _(required)_: The project id (`prj_…`).

### Query parameters

- `environment` `string`: Resource environment.
- `include` `string[]`: Fields to enrich. Defaults to lastUsedAt; pass an empty value to load metadata without analytics.

### Responses

#### `200`: The project's keys, newest first (metadata only).

Headers:

- `RateLimit-Limit` `integer`: How many requests you may make in the current time window. Not sent on cached responses or `402` payment challenges.
- `RateLimit-Remaining` `integer`: How many requests you have left in the current window before you are rate-limited. Not sent on cached responses or `402` payment challenges.
- `RateLimit-Reset` `integer`: When the current window resets, as a Unix timestamp in seconds. Not sent on cached responses or `402` payment challenges.
- `RateLimit-Scope` `string`: Which quota this request counted against (e.g. `data:read`). Not sent on cached responses or `402` payment challenges.
- `tempo-request-id` `string`: A unique id for this request, returned on every response (and as `requestId` in error bodies). Include it when contacting support so we can find your request.

Body (`application/json`):

- `data` `object[]` _(required)_: The API keys, newest first.
  - `allowedIps` `string[]` _(required)_: Client IP addresses and CIDR ranges allowed to use this key. An empty list means unrestricted.
  - `createdAt` `string <date-time>` _(required)_: When the key was minted (ISO 8601).
  - `createdBy` `string`: Identity that minted the key (`usr_…`, or `super_admin`).
  - `environment` `string` _(required)_: Key environment.
  - `expiresAt` `string <date-time>`: When the key expires (ISO 8601). Absent for a non-expiring key.
  - `id` `string` _(required)_: Opaque key id (`key_…`).
  - `lastUsedAt` `string <date-time>`: When the key last authenticated a request (ISO 8601). Omitted with `include=` or when no usage is available.
  - `name` `string`: Human-readable key name.
  - `orgId` `string` _(required)_: Owning organization id (`org_…`).
  - `projectId` `string`: Attributed project id (`prj_…`).
  - `scopes` `string[]` _(required)_: Granted scopes. '*' and non-self-serve scopes appear only on keys minted by the super admin.
  - `tokenLast4` `string` _(required)_: Last 4 characters of the plaintext token.

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

#### `404`: No accessible project or API key surface was found.

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
curl 'https://api.tempo.xyz/v1/orgs/org_1a2b3c4d5e6f7g8h9j0k1m2n/projects/prj_1a2b3c4d5e6f7g8h9j0k1m2n/api-keys?environment=sandbox&include=lastUsedAt'
```

```ts
fetch('https://api.tempo.xyz/v1/orgs/org_1a2b3c4d5e6f7g8h9j0k1m2n/projects/prj_1a2b3c4d5e6f7g8h9j0k1m2n/api-keys?environment=sandbox&include=lastUsedAt')
```

## Create API key

`POST /v1/orgs/{orgId}/projects/{projectId}/api-keys`

Mint a project-attributed API key. The token appears once and is never shown again.

### Path parameters

- `orgId` `string` _(required)_: The organization id (`org_…`).
- `projectId` `string` _(required)_: The project id (`prj_…`).

### Request body (required) (`application/json`)

- `allowedIps` `string[]`: Client IP addresses and CIDR ranges allowed to use the key. Omit or use an empty list for unrestricted access.
- `environment` `string`: Key environment.
- `name` `string`: Human-readable key name.
- `scopes` `string[]`: Unique scopes to grant.

### Responses

#### `200`: The minted key, including its one-time token.

Headers:

- `RateLimit-Limit` `integer`: How many requests you may make in the current time window. Not sent on cached responses or `402` payment challenges.
- `RateLimit-Remaining` `integer`: How many requests you have left in the current window before you are rate-limited. Not sent on cached responses or `402` payment challenges.
- `RateLimit-Reset` `integer`: When the current window resets, as a Unix timestamp in seconds. Not sent on cached responses or `402` payment challenges.
- `RateLimit-Scope` `string`: Which quota this request counted against (e.g. `data:read`). Not sent on cached responses or `402` payment challenges.
- `tempo-request-id` `string`: A unique id for this request, returned on every response (and as `requestId` in error bodies). Include it when contacting support so we can find your request.

Body (`application/json`):

- `allowedIps` `string[]` _(required)_: Client IP addresses and CIDR ranges allowed to use this key. An empty list means unrestricted.
- `createdAt` `string <date-time>` _(required)_: When the key was minted (ISO 8601).
- `createdBy` `string`: Identity that minted the key (`usr_…`, or `super_admin`).
- `environment` `string` _(required)_: Key environment.
- `expiresAt` `string <date-time>`: When the key expires (ISO 8601). Absent for a non-expiring key.
- `id` `string` _(required)_: Opaque key id (`key_…`).
- `lastUsedAt` `string <date-time>`: When the key last authenticated a request (ISO 8601). Omitted with `include=` or when no usage is available.
- `name` `string`: Human-readable key name.
- `orgId` `string` _(required)_: Owning organization id (`org_…`).
- `projectId` `string`: Attributed project id (`prj_…`).
- `scopes` `string[]` _(required)_: Granted scopes. '*' and non-self-serve scopes appear only on keys minted by the super admin.
- `tokenLast4` `string` _(required)_: Last 4 characters of the plaintext token.
- `token` `string` _(required)_: The plaintext token — shown once, unrecoverable afterward.

#### `400`: Malformed API key, invalid path, or invalid body.

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

#### `403`: The requested scopes are not issuable.

Body (`application/json`):

- `error` `object` _(required)_: What went wrong.
  - `code` `string` _(required)_: A short, stable code you can branch on in your code (e.g. `token_not_found`).
  - `details` `object[]`: A list of specific problems, when the error is about your request (e.g. invalid fields).
    - `message` `string` _(required)_: A specific thing that went wrong, in plain language (e.g. why a field failed validation).
    - `path` `string | number[]`: Where the problem is, as a path into your request (e.g. `["query", "limit"]`). Present for validation errors.
  - `message` `string` _(required)_: A human-readable explanation of what went wrong.
- `requestId` `string` _(required)_: The id of this request — include it when contacting support.

#### `404`: No accessible project or API key surface was found.

Body (`application/json`):

- `error` `object` _(required)_: What went wrong.
  - `code` `string` _(required)_: A short, stable code you can branch on in your code (e.g. `token_not_found`).
  - `details` `object[]`: A list of specific problems, when the error is about your request (e.g. invalid fields).
    - `message` `string` _(required)_: A specific thing that went wrong, in plain language (e.g. why a field failed validation).
    - `path` `string | number[]`: Where the problem is, as a path into your request (e.g. `["query", "limit"]`). Present for validation errors.
  - `message` `string` _(required)_: A human-readable explanation of what went wrong.
- `requestId` `string` _(required)_: The id of this request — include it when contacting support.

#### `409`: API-key limit reached.

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
curl https://api.tempo.xyz/v1/orgs/org_1a2b3c4d5e6f7g8h9j0k1m2n/projects/prj_1a2b3c4d5e6f7g8h9j0k1m2n/api-keys \
  --request POST \
  --header 'Content-Type: application/json' \
  --data '{}'
```

```ts
fetch('https://api.tempo.xyz/v1/orgs/org_1a2b3c4d5e6f7g8h9j0k1m2n/projects/prj_1a2b3c4d5e6f7g8h9j0k1m2n/api-keys', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({})
})
```

## Revoke organization API key

`DELETE /v1/orgs/{orgId}/api-keys/{keyId}`

Revoke an organization-level API key. Requests presenting its token stop resolving.

### Path parameters

- `keyId` `string` _(required)_: The key id (`key_…`).
- `orgId` `string` _(required)_: The organization id (`org_…`).

### Responses

#### `200`: Confirmation that the key was revoked.

Headers:

- `RateLimit-Limit` `integer`: How many requests you may make in the current time window. Not sent on cached responses or `402` payment challenges.
- `RateLimit-Remaining` `integer`: How many requests you have left in the current window before you are rate-limited. Not sent on cached responses or `402` payment challenges.
- `RateLimit-Reset` `integer`: When the current window resets, as a Unix timestamp in seconds. Not sent on cached responses or `402` payment challenges.
- `RateLimit-Scope` `string`: Which quota this request counted against (e.g. `data:read`). Not sent on cached responses or `402` payment challenges.
- `tempo-request-id` `string`: A unique id for this request, returned on every response (and as `requestId` in error bodies). Include it when contacting support so we can find your request.

Body (`application/json`):

- `id` `string` _(required)_: ID of the key that was revoked.

#### `400`: Malformed API key or invalid path.

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

#### `404`: No accessible API key or API key surface was found.

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
curl https://api.tempo.xyz/v1/orgs/org_1a2b3c4d5e6f7g8h9j0k1m2n/api-keys/key_1a2b3c4d5e6f7g8h9j0k1m2n \
  --request DELETE
```

```ts
fetch('https://api.tempo.xyz/v1/orgs/org_1a2b3c4d5e6f7g8h9j0k1m2n/api-keys/key_1a2b3c4d5e6f7g8h9j0k1m2n', {
  method: 'DELETE'
})
```

## Rotate organization API key

`POST /v1/orgs/{orgId}/api-keys/{keyId}/rotate`

Create a replacement organization-level API key with the same access as an existing key. The existing key remains active until revoked.

### Path parameters

- `keyId` `string` _(required)_: The key id (`key_…`).
- `orgId` `string` _(required)_: The organization id (`org_…`).

### Responses

#### `200`: The replacement key, including its one-time token.

Headers:

- `RateLimit-Limit` `integer`: How many requests you may make in the current time window. Not sent on cached responses or `402` payment challenges.
- `RateLimit-Remaining` `integer`: How many requests you have left in the current window before you are rate-limited. Not sent on cached responses or `402` payment challenges.
- `RateLimit-Reset` `integer`: When the current window resets, as a Unix timestamp in seconds. Not sent on cached responses or `402` payment challenges.
- `RateLimit-Scope` `string`: Which quota this request counted against (e.g. `data:read`). Not sent on cached responses or `402` payment challenges.
- `tempo-request-id` `string`: A unique id for this request, returned on every response (and as `requestId` in error bodies). Include it when contacting support so we can find your request.

Body (`application/json`):

- `allowedIps` `string[]` _(required)_: Client IP addresses and CIDR ranges allowed to use this key. An empty list means unrestricted.
- `createdAt` `string <date-time>` _(required)_: When the key was minted (ISO 8601).
- `createdBy` `string`: Identity that minted the key (`usr_…`, or `super_admin`).
- `environment` `string` _(required)_: Key environment.
- `expiresAt` `string <date-time>`: When the key expires (ISO 8601). Absent for a non-expiring key.
- `id` `string` _(required)_: Opaque key id (`key_…`).
- `lastUsedAt` `string <date-time>`: When the key last authenticated a request (ISO 8601). Omitted with `include=` or when no usage is available.
- `name` `string`: Human-readable key name.
- `orgId` `string` _(required)_: Owning organization id (`org_…`).
- `projectId` `string`: Attributed project id (`prj_…`).
- `scopes` `string[]` _(required)_: Granted scopes. '*' and non-self-serve scopes appear only on keys minted by the super admin.
- `tokenLast4` `string` _(required)_: Last 4 characters of the plaintext token.
- `token` `string` _(required)_: The plaintext token — shown once, unrecoverable afterward.

#### `400`: Malformed API key or invalid path.

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

#### `403`: The source key contains scopes the caller cannot rotate.

Body (`application/json`):

- `error` `object` _(required)_: What went wrong.
  - `code` `string` _(required)_: A short, stable code you can branch on in your code (e.g. `token_not_found`).
  - `details` `object[]`: A list of specific problems, when the error is about your request (e.g. invalid fields).
    - `message` `string` _(required)_: A specific thing that went wrong, in plain language (e.g. why a field failed validation).
    - `path` `string | number[]`: Where the problem is, as a path into your request (e.g. `["query", "limit"]`). Present for validation errors.
  - `message` `string` _(required)_: A human-readable explanation of what went wrong.
- `requestId` `string` _(required)_: The id of this request — include it when contacting support.

#### `404`: No accessible API key or API key surface was found.

Body (`application/json`):

- `error` `object` _(required)_: What went wrong.
  - `code` `string` _(required)_: A short, stable code you can branch on in your code (e.g. `token_not_found`).
  - `details` `object[]`: A list of specific problems, when the error is about your request (e.g. invalid fields).
    - `message` `string` _(required)_: A specific thing that went wrong, in plain language (e.g. why a field failed validation).
    - `path` `string | number[]`: Where the problem is, as a path into your request (e.g. `["query", "limit"]`). Present for validation errors.
  - `message` `string` _(required)_: A human-readable explanation of what went wrong.
- `requestId` `string` _(required)_: The id of this request — include it when contacting support.

#### `409`: API-key limit reached.

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
curl https://api.tempo.xyz/v1/orgs/org_1a2b3c4d5e6f7g8h9j0k1m2n/api-keys/key_1a2b3c4d5e6f7g8h9j0k1m2n/rotate \
  --request POST
```

```ts
fetch('https://api.tempo.xyz/v1/orgs/org_1a2b3c4d5e6f7g8h9j0k1m2n/api-keys/key_1a2b3c4d5e6f7g8h9j0k1m2n/rotate', {
  method: 'POST'
})
```

## Update API key

`PATCH /v1/orgs/{orgId}/projects/{projectId}/api-keys/{keyId}`

Replace an API key's client IP/CIDR allowlist. An empty list removes the restriction.

### Path parameters

- `keyId` `string` _(required)_: The key id (`key_…`).
- `orgId` `string` _(required)_: The organization id (`org_…`).
- `projectId` `string` _(required)_: The project id (`prj_…`).

### Request body (required) (`application/json`)

- `allowedIps` `string[]` _(required)_: Replacement client IP/CIDR allowlist. Use an empty list for unrestricted access.

### Responses

#### `200`: The updated API key metadata.

Headers:

- `RateLimit-Limit` `integer`: How many requests you may make in the current time window. Not sent on cached responses or `402` payment challenges.
- `RateLimit-Remaining` `integer`: How many requests you have left in the current window before you are rate-limited. Not sent on cached responses or `402` payment challenges.
- `RateLimit-Reset` `integer`: When the current window resets, as a Unix timestamp in seconds. Not sent on cached responses or `402` payment challenges.
- `RateLimit-Scope` `string`: Which quota this request counted against (e.g. `data:read`). Not sent on cached responses or `402` payment challenges.
- `tempo-request-id` `string`: A unique id for this request, returned on every response (and as `requestId` in error bodies). Include it when contacting support so we can find your request.

Body (`application/json`):

- `allowedIps` `string[]` _(required)_: Client IP addresses and CIDR ranges allowed to use this key. An empty list means unrestricted.
- `createdAt` `string <date-time>` _(required)_: When the key was minted (ISO 8601).
- `createdBy` `string`: Identity that minted the key (`usr_…`, or `super_admin`).
- `environment` `string` _(required)_: Key environment.
- `expiresAt` `string <date-time>`: When the key expires (ISO 8601). Absent for a non-expiring key.
- `id` `string` _(required)_: Opaque key id (`key_…`).
- `lastUsedAt` `string <date-time>`: When the key last authenticated a request (ISO 8601). Omitted with `include=` or when no usage is available.
- `name` `string`: Human-readable key name.
- `orgId` `string` _(required)_: Owning organization id (`org_…`).
- `projectId` `string`: Attributed project id (`prj_…`).
- `scopes` `string[]` _(required)_: Granted scopes. '*' and non-self-serve scopes appear only on keys minted by the super admin.
- `tokenLast4` `string` _(required)_: Last 4 characters of the plaintext token.

#### `400`: Malformed API key, invalid path, or invalid body.

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

#### `404`: No accessible API key or API key surface was found.

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
curl https://api.tempo.xyz/v1/orgs/org_1a2b3c4d5e6f7g8h9j0k1m2n/projects/prj_1a2b3c4d5e6f7g8h9j0k1m2n/api-keys/key_1a2b3c4d5e6f7g8h9j0k1m2n \
  --request PATCH \
  --header 'Content-Type: application/json' \
  --data '{
  "allowedIps": [
    "203.0.113.0/24"
  ]
}'
```

```ts
fetch('https://api.tempo.xyz/v1/orgs/org_1a2b3c4d5e6f7g8h9j0k1m2n/projects/prj_1a2b3c4d5e6f7g8h9j0k1m2n/api-keys/key_1a2b3c4d5e6f7g8h9j0k1m2n', {
  method: 'PATCH',
  headers: {
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    allowedIps: ['203.0.113.0/24']
  })
})
```

## Revoke API key

`DELETE /v1/orgs/{orgId}/projects/{projectId}/api-keys/{keyId}`

Revoke an API key. Requests presenting its token stop resolving.

### Path parameters

- `keyId` `string` _(required)_: The key id (`key_…`).
- `orgId` `string` _(required)_: The organization id (`org_…`).
- `projectId` `string` _(required)_: The project id (`prj_…`).

### Responses

#### `200`: Confirmation that the key was revoked.

Headers:

- `RateLimit-Limit` `integer`: How many requests you may make in the current time window. Not sent on cached responses or `402` payment challenges.
- `RateLimit-Remaining` `integer`: How many requests you have left in the current window before you are rate-limited. Not sent on cached responses or `402` payment challenges.
- `RateLimit-Reset` `integer`: When the current window resets, as a Unix timestamp in seconds. Not sent on cached responses or `402` payment challenges.
- `RateLimit-Scope` `string`: Which quota this request counted against (e.g. `data:read`). Not sent on cached responses or `402` payment challenges.
- `tempo-request-id` `string`: A unique id for this request, returned on every response (and as `requestId` in error bodies). Include it when contacting support so we can find your request.

Body (`application/json`):

- `id` `string` _(required)_: ID of the key that was revoked.

#### `400`: Malformed API key or invalid path.

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

#### `404`: No accessible API key or API key surface was found.

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
curl https://api.tempo.xyz/v1/orgs/org_1a2b3c4d5e6f7g8h9j0k1m2n/projects/prj_1a2b3c4d5e6f7g8h9j0k1m2n/api-keys/key_1a2b3c4d5e6f7g8h9j0k1m2n \
  --request DELETE
```

```ts
fetch('https://api.tempo.xyz/v1/orgs/org_1a2b3c4d5e6f7g8h9j0k1m2n/projects/prj_1a2b3c4d5e6f7g8h9j0k1m2n/api-keys/key_1a2b3c4d5e6f7g8h9j0k1m2n', {
  method: 'DELETE'
})
```

## Rotate API key

`POST /v1/orgs/{orgId}/projects/{projectId}/api-keys/{keyId}/rotate`

Create a replacement API key with the same access as an existing key. The existing key remains active until revoked.

### Path parameters

- `keyId` `string` _(required)_: The key id (`key_…`).
- `orgId` `string` _(required)_: The organization id (`org_…`).
- `projectId` `string` _(required)_: The project id (`prj_…`).

### Responses

#### `200`: The replacement key, including its one-time token.

Headers:

- `RateLimit-Limit` `integer`: How many requests you may make in the current time window. Not sent on cached responses or `402` payment challenges.
- `RateLimit-Remaining` `integer`: How many requests you have left in the current window before you are rate-limited. Not sent on cached responses or `402` payment challenges.
- `RateLimit-Reset` `integer`: When the current window resets, as a Unix timestamp in seconds. Not sent on cached responses or `402` payment challenges.
- `RateLimit-Scope` `string`: Which quota this request counted against (e.g. `data:read`). Not sent on cached responses or `402` payment challenges.
- `tempo-request-id` `string`: A unique id for this request, returned on every response (and as `requestId` in error bodies). Include it when contacting support so we can find your request.

Body (`application/json`):

- `allowedIps` `string[]` _(required)_: Client IP addresses and CIDR ranges allowed to use this key. An empty list means unrestricted.
- `createdAt` `string <date-time>` _(required)_: When the key was minted (ISO 8601).
- `createdBy` `string`: Identity that minted the key (`usr_…`, or `super_admin`).
- `environment` `string` _(required)_: Key environment.
- `expiresAt` `string <date-time>`: When the key expires (ISO 8601). Absent for a non-expiring key.
- `id` `string` _(required)_: Opaque key id (`key_…`).
- `lastUsedAt` `string <date-time>`: When the key last authenticated a request (ISO 8601). Omitted with `include=` or when no usage is available.
- `name` `string`: Human-readable key name.
- `orgId` `string` _(required)_: Owning organization id (`org_…`).
- `projectId` `string`: Attributed project id (`prj_…`).
- `scopes` `string[]` _(required)_: Granted scopes. '*' and non-self-serve scopes appear only on keys minted by the super admin.
- `tokenLast4` `string` _(required)_: Last 4 characters of the plaintext token.
- `token` `string` _(required)_: The plaintext token — shown once, unrecoverable afterward.

#### `400`: Malformed API key or invalid path.

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

#### `403`: The source key contains scopes the caller cannot rotate.

Body (`application/json`):

- `error` `object` _(required)_: What went wrong.
  - `code` `string` _(required)_: A short, stable code you can branch on in your code (e.g. `token_not_found`).
  - `details` `object[]`: A list of specific problems, when the error is about your request (e.g. invalid fields).
    - `message` `string` _(required)_: A specific thing that went wrong, in plain language (e.g. why a field failed validation).
    - `path` `string | number[]`: Where the problem is, as a path into your request (e.g. `["query", "limit"]`). Present for validation errors.
  - `message` `string` _(required)_: A human-readable explanation of what went wrong.
- `requestId` `string` _(required)_: The id of this request — include it when contacting support.

#### `404`: No accessible API key or API key surface was found.

Body (`application/json`):

- `error` `object` _(required)_: What went wrong.
  - `code` `string` _(required)_: A short, stable code you can branch on in your code (e.g. `token_not_found`).
  - `details` `object[]`: A list of specific problems, when the error is about your request (e.g. invalid fields).
    - `message` `string` _(required)_: A specific thing that went wrong, in plain language (e.g. why a field failed validation).
    - `path` `string | number[]`: Where the problem is, as a path into your request (e.g. `["query", "limit"]`). Present for validation errors.
  - `message` `string` _(required)_: A human-readable explanation of what went wrong.
- `requestId` `string` _(required)_: The id of this request — include it when contacting support.

#### `409`: API-key limit reached.

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
curl https://api.tempo.xyz/v1/orgs/org_1a2b3c4d5e6f7g8h9j0k1m2n/projects/prj_1a2b3c4d5e6f7g8h9j0k1m2n/api-keys/key_1a2b3c4d5e6f7g8h9j0k1m2n/rotate \
  --request POST
```

```ts
fetch('https://api.tempo.xyz/v1/orgs/org_1a2b3c4d5e6f7g8h9j0k1m2n/projects/prj_1a2b3c4d5e6f7g8h9j0k1m2n/api-keys/key_1a2b3c4d5e6f7g8h9j0k1m2n/rotate', {
  method: 'POST'
})
```
