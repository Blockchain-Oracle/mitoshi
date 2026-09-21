# RPC

Direct access to the chain over Ethereum JSON-RPC. Not part of the stable API contract; best-effort support only. No compatibility, latency, availability, or data-freshness guarantees. Breaking changes may happen with limited notice.

## admin_validatorKey

`POST /rpc`

Returns the validator public key configured on the node, or null for non-validator nodes.

### Responses

#### `200`: JSON-RPC response.

Body (`application/json`):

- `jsonrpc` `string`
- `id` `integer`
- `result` `string`

### Example request

```bash
curl https://api.tempo.xyz/rpc \
  --request POST \
  --header 'Content-Type: application/json' \
  --data '{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "admin_validatorKey",
  "params": []
}'
```

```ts
fetch('https://api.tempo.xyz/rpc', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    jsonrpc: '2.0',
    id: 1,
    method: 'admin_validatorKey',
    params: []
  })
})
```

## consensus_getFinalization

`POST /rpc`

Returns a finalized consensus block by height or the latest finalized block.

### Parameters

- `Query` `string | object` _(required)_

### Responses

#### `200`: JSON-RPC response.

Body (`application/json`):

- `jsonrpc` `string`
- `id` `integer`
- `result` `object`
  - `block` `object` _(required)_: The Tempo block.
    - `baseFeePerGas` `string`
    - `blobGasUsed` `string`
    - `blockAccessListHash` `string`
    - `difficulty` `string`
    - `excessBlobGas` `string`
    - `extraData` `string` _(required)_
    - `gasLimit` `string` _(required)_
    - `gasUsed` `string` _(required)_
    - `hash` `string` _(required)_
    - `logsBloom` `string` _(required)_
    - `miner` `string` _(required)_
    - `mixHash` `string` _(required)_
    - `nonce` `string` _(required)_
    - `number` `string` _(required)_
    - `parentBeaconBlockRoot` `string`
    - `parentHash` `string` _(required)_
    - `receiptsRoot` `string` _(required)_
    - `requestsHash` `string`
    - `sha3Uncles` `string` _(required)_
    - `size` `string` _(required)_
    - `stateRoot` `string` _(required)_
    - `timestamp` `string` _(required)_
    - `transactions` `string[] | object & object & object | object[]` _(required)_
    - `transactionsRoot` `string` _(required)_
    - `uncles` `string[]` _(required)_
    - `withdrawals` `object[]`
      - `address` `string` _(required)_
      - `amount` `string` _(required)_
      - `index` `string` _(required)_
      - `validatorIndex` `string` _(required)_
    - `withdrawalsRoot` `string`
    - `consensusContext` `object`: Tempo consensus context.
      - `epoch` `string` _(required)_
      - `parentView` `string` _(required)_
      - `proposer` `string` _(required)_: Proposer consensus public key.
      - `view` `string` _(required)_
    - `mainBlockGeneralGasLimit` `string` _(required)_
    - `sharedGasLimit` `string` _(required)_
    - `timestampMillis` `string` _(required)_
    - `timestampMillisPart` `string` _(required)_
  - `certificate` `string` _(required)_: Hex-encoded notarization or finalization.
  - `digest` `string` _(required)_: Consensus block digest.
  - `epoch` `integer` _(required)_
  - `view` `integer` _(required)_

### Example request

```bash
curl https://api.tempo.xyz/rpc \
  --request POST \
  --header 'Content-Type: application/json' \
  --data '{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "consensus_getFinalization",
  "params": [
    "latest"
  ]
}'
```

```ts
fetch('https://api.tempo.xyz/rpc', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    jsonrpc: '2.0',
    id: 1,
    method: 'consensus_getFinalization',
    params: ['latest']
  })
})
```

## consensus_getIdentityTransitionProof

`POST /rpc`

Returns DKG identity transition proofs for the network identity at a requested epoch.

### Parameters

- `from_epoch` `integer`
- `full` `boolean`

### Responses

#### `200`: JSON-RPC response.

Body (`application/json`):

- `jsonrpc` `string`
- `id` `integer`
- `result` `object`
  - `identity` `string` _(required)_: Network identity for the requested epoch.
  - `transitions` `object[]` _(required)_
    - `newIdentity` `string` _(required)_: Hex-encoded BLS public key after the transition.
    - `oldIdentity` `string` _(required)_: Hex-encoded BLS public key before the transition.
    - `proof` `object`
      - `finalizationCertificate` `string` _(required)_: Hex-encoded finalization certificate.
      - `header` `object` _(required)_
        - `baseFeePerGas` `string`
        - `consensusContext` `object`
        - `difficulty` `string`
        - `extraData` `string` _(required)_
        - `gasLimit` `string` _(required)_
        - `gasUsed` `string` _(required)_
        - `hash` `string` _(required)_
        - `logsBloom` `string` _(required)_
        - `mainBlockGeneralGasLimit` `string` _(required)_
        - `miner` `string` _(required)_
        - `mixHash` `string`
        - `nonce` `string`
        - `number` `string` _(required)_
        - `parentHash` `string` _(required)_
        - `receiptsRoot` `string` _(required)_
        - `sha3Uncles` `string` _(required)_
        - `sharedGasLimit` `string` _(required)_
        - `stateRoot` `string` _(required)_
        - `timestamp` `string` _(required)_
        - `timestampMillis` `string` _(required)_
        - `timestampMillisPart` `string` _(required)_
        - `transactionsRoot` `string` _(required)_
        - `withdrawalsRoot` `string`
    - `transitionEpoch` `integer` _(required)_

### Example request

```bash
curl https://api.tempo.xyz/rpc \
  --request POST \
  --header 'Content-Type: application/json' \
  --data '{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "consensus_getIdentityTransitionProof",
  "params": [
    null,
    false
  ]
}'
```

```ts
fetch('https://api.tempo.xyz/rpc', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    jsonrpc: '2.0',
    id: 1,
    method: 'consensus_getIdentityTransitionProof',
    params: [null, false]
  })
})
```

## consensus_getLatest

`POST /rpc`

Returns the current consensus state snapshot, including the latest finalized block and latest notarized block.

### Responses

#### `200`: JSON-RPC response.

Body (`application/json`):

- `jsonrpc` `string`
- `id` `integer`
- `result` `object`
  - `finalized` `object` _(required)_
    - `block` `object` _(required)_: The Tempo block.
      - `baseFeePerGas` `string`
      - `blobGasUsed` `string`
      - `blockAccessListHash` `string`
      - `difficulty` `string`
      - `excessBlobGas` `string`
      - `extraData` `string` _(required)_
      - `gasLimit` `string` _(required)_
      - `gasUsed` `string` _(required)_
      - `hash` `string` _(required)_
      - `logsBloom` `string` _(required)_
      - `miner` `string` _(required)_
      - `mixHash` `string` _(required)_
      - `nonce` `string` _(required)_
      - `number` `string` _(required)_
      - `parentBeaconBlockRoot` `string`
      - `parentHash` `string` _(required)_
      - `receiptsRoot` `string` _(required)_
      - `requestsHash` `string`
      - `sha3Uncles` `string` _(required)_
      - `size` `string` _(required)_
      - `stateRoot` `string` _(required)_
      - `timestamp` `string` _(required)_
      - `transactions` `string[] | object & object & object | object[]` _(required)_
      - `transactionsRoot` `string` _(required)_
      - `uncles` `string[]` _(required)_
      - `withdrawals` `object[]`
        - `address` `string` _(required)_
        - `amount` `string` _(required)_
        - `index` `string` _(required)_
        - `validatorIndex` `string` _(required)_
      - `withdrawalsRoot` `string`
      - `consensusContext` `object`: Tempo consensus context.
        - `epoch` `string` _(required)_
        - `parentView` `string` _(required)_
        - `proposer` `string` _(required)_: Proposer consensus public key.
        - `view` `string` _(required)_
      - `mainBlockGeneralGasLimit` `string` _(required)_
      - `sharedGasLimit` `string` _(required)_
      - `timestampMillis` `string` _(required)_
      - `timestampMillisPart` `string` _(required)_
    - `certificate` `string` _(required)_: Hex-encoded notarization or finalization.
    - `digest` `string` _(required)_: Consensus block digest.
    - `epoch` `integer` _(required)_
    - `view` `integer` _(required)_
  - `notarized` `object` _(required)_
    - `block` `object` _(required)_: The Tempo block.
      - `baseFeePerGas` `string`
      - `blobGasUsed` `string`
      - `blockAccessListHash` `string`
      - `difficulty` `string`
      - `excessBlobGas` `string`
      - `extraData` `string` _(required)_
      - `gasLimit` `string` _(required)_
      - `gasUsed` `string` _(required)_
      - `hash` `string` _(required)_
      - `logsBloom` `string` _(required)_
      - `miner` `string` _(required)_
      - `mixHash` `string` _(required)_
      - `nonce` `string` _(required)_
      - `number` `string` _(required)_
      - `parentBeaconBlockRoot` `string`
      - `parentHash` `string` _(required)_
      - `receiptsRoot` `string` _(required)_
      - `requestsHash` `string`
      - `sha3Uncles` `string` _(required)_
      - `size` `string` _(required)_
      - `stateRoot` `string` _(required)_
      - `timestamp` `string` _(required)_
      - `transactions` `string[] | object & object & object | object[]` _(required)_
      - `transactionsRoot` `string` _(required)_
      - `uncles` `string[]` _(required)_
      - `withdrawals` `object[]`
        - `address` `string` _(required)_
        - `amount` `string` _(required)_
        - `index` `string` _(required)_
        - `validatorIndex` `string` _(required)_
      - `withdrawalsRoot` `string`
      - `consensusContext` `object`: Tempo consensus context.
        - `epoch` `string` _(required)_
        - `parentView` `string` _(required)_
        - `proposer` `string` _(required)_: Proposer consensus public key.
        - `view` `string` _(required)_
      - `mainBlockGeneralGasLimit` `string` _(required)_
      - `sharedGasLimit` `string` _(required)_
      - `timestampMillis` `string` _(required)_
      - `timestampMillisPart` `string` _(required)_
    - `certificate` `string` _(required)_: Hex-encoded notarization or finalization.
    - `digest` `string` _(required)_: Consensus block digest.
    - `epoch` `integer` _(required)_
    - `view` `integer` _(required)_

### Example request

```bash
curl https://api.tempo.xyz/rpc \
  --request POST \
  --header 'Content-Type: application/json' \
  --data '{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "consensus_getLatest",
  "params": []
}'
```

```ts
fetch('https://api.tempo.xyz/rpc', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    jsonrpc: '2.0',
    id: 1,
    method: 'consensus_getLatest',
    params: []
  })
})
```

## consensus_subscribe

`POST /rpc`

Subscribes to consensus events over WebSocket.

### Responses

#### `200`: JSON-RPC response.

Body (`application/json`):

- `jsonrpc` `string`
- `id` `integer`
- `result` `string`

### Example request

```bash
curl https://api.tempo.xyz/rpc \
  --request POST \
  --header 'Content-Type: application/json' \
  --data '{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "consensus_subscribe",
  "params": []
}'
```

```ts
fetch('https://api.tempo.xyz/rpc', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    jsonrpc: '2.0',
    id: 1,
    method: 'consensus_subscribe',
    params: []
  })
})
```

## consensus_unsubscribe

`POST /rpc`

Unsubscribes from a consensus event subscription.

### Parameters

- `Subscription ID` `string` _(required)_

### Responses

#### `200`: JSON-RPC response.

Body (`application/json`):

- `jsonrpc` `string`
- `id` `integer`
- `result` `boolean`

### Example request

```bash
curl https://api.tempo.xyz/rpc \
  --request POST \
  --header 'Content-Type: application/json' \
  --data '{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "consensus_unsubscribe",
  "params": [
    "string"
  ]
}'
```

```ts
fetch('https://api.tempo.xyz/rpc', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    jsonrpc: '2.0',
    id: 1,
    method: 'consensus_unsubscribe',
    params: ['string']
  })
})
```

## eth_blockNumber

`POST /rpc`

Returns the number of most recent block.

### Responses

#### `200`: JSON-RPC response.

Body (`application/json`):

- `jsonrpc` `string`
- `id` `integer`
- `result` `string`

### Example request

```bash
curl https://api.tempo.xyz/rpc \
  --request POST \
  --header 'Content-Type: application/json' \
  --data '{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "eth_blockNumber",
  "params": []
}'
```

```ts
fetch('https://api.tempo.xyz/rpc', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    jsonrpc: '2.0',
    id: 1,
    method: 'eth_blockNumber',
    params: []
  })
})
```

## eth_call

`POST /rpc`

Executes a new message call immediately without creating a transaction on the block chain.

### Parameters

- `Transaction` `object` _(required)_
  - `accessList` `object[]`: EIP-2930 access list
    - `address` `string` _(required)_
    - `storageKeys` `string[]` _(required)_
  - `authorizationList` `object[]`: EIP-7702 authorization list
    - `address` `string` _(required)_
    - `chainId` `string` _(required)_: Chain ID on which this transaction is valid
    - `nonce` `string` _(required)_
    - `r` `string` _(required)_
    - `s` `string` _(required)_
    - `yParity` `string` _(required)_: The parity (0 for even, 1 for odd) of the y-value of the secp256k1 signature
  - `blobVersionedHashes` `string[]`: List of versioned blob hashes associated with the transaction's EIP-4844 data blobs.
  - `blobs` `string[]`: Raw blob data.
  - `chainId` `string`: Chain ID that this transaction is valid on.
  - `from` `string`
  - `gas` `string`
  - `gasPrice` `string`: The gas price willing to be paid by the sender in wei
  - `input` `string`
  - `maxFeePerBlobGas` `string`: The maximum total fee per gas the sender is willing to pay for blob gas in wei
  - `maxFeePerGas` `string`: The maximum total fee per gas the sender is willing to pay (includes the network / base fee and miner / priority fee) in wei
  - `maxPriorityFeePerGas` `string`: Maximum fee per gas the sender is willing to pay to miners in wei
  - `nonce` `string`
  - `to` `string`
  - `type` `string`
  - `value` `string`
  - `aaAuthorizationList` `object[]`: EIP-7702-style authorizations (Tempo AA).
    - `address` `string` _(required)_
    - `chainId` `string` _(required)_
    - `nonce` `string` _(required)_
    - `signature` `object` _(required)_
  - `calls` `object[]`: Tempo AA batched calls.
    - `input` `string` _(required)_: Call input data (accepts `data` on input).
    - `to` `string` _(required)_
    - `value` `string` _(required)_
  - `feePayerSignature` `object`: Gas-sponsor signature, when fee-payer sponsored.
    - `r` `string` _(required)_
    - `s` `string` _(required)_
    - `v` `string` _(required)_: Recovery id (`0` or `1`); mirrors `yParity`.
    - `yParity` `string` _(required)_
  - `feeToken` `string`: TIP-20 token used to pay fees.
  - `keyAuthorization` `object`: Access-key provisioning authorization.
    - `account` `string`: Target account binding.
    - `allowedCalls` `object[]`: Allowed call scopes; `null` means unrestricted.
      - `selectorRules` `object[]`
        - `recipients` `string[]`
        - `selector` `string` _(required)_
      - `target` `string` _(required)_
    - `chainId` `string` _(required)_
    - `expiry` `string`: Expiry timestamp; `null` means no expiry.
    - `isAdmin` `boolean` _(required)_
    - `keyId` `string` _(required)_
    - `keyType` `string` _(required)_
    - `limits` `object[]`: Spending limits; `null` means unlimited.
      - `limit` `string` _(required)_
      - `period` `string` _(required)_
      - `token` `string` _(required)_
    - `signature` `object` _(required)_
    - `witness` `string`
  - `keyData` `string`: Access-key public key data.
  - `keyId` `string`: Access-key id (address).
  - `keyType` `string`: Access-key signature scheme.
  - `nonceKey` `string`: Tempo 2D nonce key.
  - `validAfter` `string`: Earliest valid timestamp.
  - `validBefore` `string`: Latest valid timestamp.
- `Block` `string`

### Responses

#### `200`: JSON-RPC response.

Body (`application/json`):

- `jsonrpc` `string`
- `id` `integer`
- `result` `string`

### Example request

```bash
curl https://api.tempo.xyz/rpc \
  --request POST \
  --header 'Content-Type: application/json' \
  --data '{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "eth_call",
  "params": [
    {
      "to": "0x69498dd54bd25aa0c886cf1f8b8ae0856d55ff13",
      "value": "0x1"
    },
    "latest"
  ]
}'
```

```ts
fetch('https://api.tempo.xyz/rpc', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    jsonrpc: '2.0',
    id: 1,
    method: 'eth_call',
    params: [
      {
        to: '0x69498dd54bd25aa0c886cf1f8b8ae0856d55ff13',
        value: '0x1'
      },
      'latest'
    ]
  })
})
```

## eth_chainId

`POST /rpc`

Returns the chain ID of the current network.

### Responses

#### `200`: JSON-RPC response.

Body (`application/json`):

- `jsonrpc` `string`
- `id` `integer`
- `result` `string`

### Example request

```bash
curl https://api.tempo.xyz/rpc \
  --request POST \
  --header 'Content-Type: application/json' \
  --data '{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "eth_chainId",
  "params": []
}'
```

```ts
fetch('https://api.tempo.xyz/rpc', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    jsonrpc: '2.0',
    id: 1,
    method: 'eth_chainId',
    params: []
  })
})
```

## eth_createAccessList

`POST /rpc`

Generates an access list for a transaction.

### Parameters

- `Transaction` `object` _(required)_
  - `accessList` `object[]`: EIP-2930 access list
    - `address` `string` _(required)_
    - `storageKeys` `string[]` _(required)_
  - `authorizationList` `object[]`: EIP-7702 authorization list
    - `address` `string` _(required)_
    - `chainId` `string` _(required)_: Chain ID on which this transaction is valid
    - `nonce` `string` _(required)_
    - `r` `string` _(required)_
    - `s` `string` _(required)_
    - `yParity` `string` _(required)_: The parity (0 for even, 1 for odd) of the y-value of the secp256k1 signature
  - `blobVersionedHashes` `string[]`: List of versioned blob hashes associated with the transaction's EIP-4844 data blobs.
  - `blobs` `string[]`: Raw blob data.
  - `chainId` `string`: Chain ID that this transaction is valid on.
  - `from` `string`
  - `gas` `string`
  - `gasPrice` `string`: The gas price willing to be paid by the sender in wei
  - `input` `string`
  - `maxFeePerBlobGas` `string`: The maximum total fee per gas the sender is willing to pay for blob gas in wei
  - `maxFeePerGas` `string`: The maximum total fee per gas the sender is willing to pay (includes the network / base fee and miner / priority fee) in wei
  - `maxPriorityFeePerGas` `string`: Maximum fee per gas the sender is willing to pay to miners in wei
  - `nonce` `string`
  - `to` `string`
  - `type` `string`
  - `value` `string`
  - `aaAuthorizationList` `object[]`: EIP-7702-style authorizations (Tempo AA).
    - `address` `string` _(required)_
    - `chainId` `string` _(required)_
    - `nonce` `string` _(required)_
    - `signature` `object` _(required)_
  - `calls` `object[]`: Tempo AA batched calls.
    - `input` `string` _(required)_: Call input data (accepts `data` on input).
    - `to` `string` _(required)_
    - `value` `string` _(required)_
  - `feePayerSignature` `object`: Gas-sponsor signature, when fee-payer sponsored.
    - `r` `string` _(required)_
    - `s` `string` _(required)_
    - `v` `string` _(required)_: Recovery id (`0` or `1`); mirrors `yParity`.
    - `yParity` `string` _(required)_
  - `feeToken` `string`: TIP-20 token used to pay fees.
  - `keyAuthorization` `object`: Access-key provisioning authorization.
    - `account` `string`: Target account binding.
    - `allowedCalls` `object[]`: Allowed call scopes; `null` means unrestricted.
      - `selectorRules` `object[]`
        - `recipients` `string[]`
        - `selector` `string` _(required)_
      - `target` `string` _(required)_
    - `chainId` `string` _(required)_
    - `expiry` `string`: Expiry timestamp; `null` means no expiry.
    - `isAdmin` `boolean` _(required)_
    - `keyId` `string` _(required)_
    - `keyType` `string` _(required)_
    - `limits` `object[]`: Spending limits; `null` means unlimited.
      - `limit` `string` _(required)_
      - `period` `string` _(required)_
      - `token` `string` _(required)_
    - `signature` `object` _(required)_
    - `witness` `string`
  - `keyData` `string`: Access-key public key data.
  - `keyId` `string`: Access-key id (address).
  - `keyType` `string`: Access-key signature scheme.
  - `nonceKey` `string`: Tempo 2D nonce key.
  - `validAfter` `string`: Earliest valid timestamp.
  - `validBefore` `string`: Latest valid timestamp.
- `Block` `string`

### Responses

#### `200`: JSON-RPC response.

Body (`application/json`):

- `jsonrpc` `string`
- `id` `integer`
- `result` `object`
  - `accessList` `object[]`
    - `address` `string` _(required)_
    - `storageKeys` `string[]` _(required)_
  - `error` `string`
  - `gasUsed` `string`

### Example request

```bash
curl https://api.tempo.xyz/rpc \
  --request POST \
  --header 'Content-Type: application/json' \
  --data '{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "eth_createAccessList",
  "params": [
    {
      "data": "0x608060806080608155",
      "from": "0xaea8f8f781326bfe6a7683c2bd48dd6aa4d3ba63"
    },
    "latest"
  ]
}'
```

```ts
fetch('https://api.tempo.xyz/rpc', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    jsonrpc: '2.0',
    id: 1,
    method: 'eth_createAccessList',
    params: [
      {
        data: '0x608060806080608155',
        from: '0xaea8f8f781326bfe6a7683c2bd48dd6aa4d3ba63'
      },
      'latest'
    ]
  })
})
```

## eth_estimateGas

`POST /rpc`

Generates and returns an estimate of how much gas is necessary to allow the transaction to complete.

### Parameters

- `Transaction` `object` _(required)_
  - `accessList` `object[]`: EIP-2930 access list
    - `address` `string` _(required)_
    - `storageKeys` `string[]` _(required)_
  - `authorizationList` `object[]`: EIP-7702 authorization list
    - `address` `string` _(required)_
    - `chainId` `string` _(required)_: Chain ID on which this transaction is valid
    - `nonce` `string` _(required)_
    - `r` `string` _(required)_
    - `s` `string` _(required)_
    - `yParity` `string` _(required)_: The parity (0 for even, 1 for odd) of the y-value of the secp256k1 signature
  - `blobVersionedHashes` `string[]`: List of versioned blob hashes associated with the transaction's EIP-4844 data blobs.
  - `blobs` `string[]`: Raw blob data.
  - `chainId` `string`: Chain ID that this transaction is valid on.
  - `from` `string`
  - `gas` `string`
  - `gasPrice` `string`: The gas price willing to be paid by the sender in wei
  - `input` `string`
  - `maxFeePerBlobGas` `string`: The maximum total fee per gas the sender is willing to pay for blob gas in wei
  - `maxFeePerGas` `string`: The maximum total fee per gas the sender is willing to pay (includes the network / base fee and miner / priority fee) in wei
  - `maxPriorityFeePerGas` `string`: Maximum fee per gas the sender is willing to pay to miners in wei
  - `nonce` `string`
  - `to` `string`
  - `type` `string`
  - `value` `string`
  - `aaAuthorizationList` `object[]`: EIP-7702-style authorizations (Tempo AA).
    - `address` `string` _(required)_
    - `chainId` `string` _(required)_
    - `nonce` `string` _(required)_
    - `signature` `object` _(required)_
  - `calls` `object[]`: Tempo AA batched calls.
    - `input` `string` _(required)_: Call input data (accepts `data` on input).
    - `to` `string` _(required)_
    - `value` `string` _(required)_
  - `feePayerSignature` `object`: Gas-sponsor signature, when fee-payer sponsored.
    - `r` `string` _(required)_
    - `s` `string` _(required)_
    - `v` `string` _(required)_: Recovery id (`0` or `1`); mirrors `yParity`.
    - `yParity` `string` _(required)_
  - `feeToken` `string`: TIP-20 token used to pay fees.
  - `keyAuthorization` `object`: Access-key provisioning authorization.
    - `account` `string`: Target account binding.
    - `allowedCalls` `object[]`: Allowed call scopes; `null` means unrestricted.
      - `selectorRules` `object[]`
        - `recipients` `string[]`
        - `selector` `string` _(required)_
      - `target` `string` _(required)_
    - `chainId` `string` _(required)_
    - `expiry` `string`: Expiry timestamp; `null` means no expiry.
    - `isAdmin` `boolean` _(required)_
    - `keyId` `string` _(required)_
    - `keyType` `string` _(required)_
    - `limits` `object[]`: Spending limits; `null` means unlimited.
      - `limit` `string` _(required)_
      - `period` `string` _(required)_
      - `token` `string` _(required)_
    - `signature` `object` _(required)_
    - `witness` `string`
  - `keyData` `string`: Access-key public key data.
  - `keyId` `string`: Access-key id (address).
  - `keyType` `string`: Access-key signature scheme.
  - `nonceKey` `string`: Tempo 2D nonce key.
  - `validAfter` `string`: Earliest valid timestamp.
  - `validBefore` `string`: Latest valid timestamp.
- `Block` `string`

### Responses

#### `200`: JSON-RPC response.

Body (`application/json`):

- `jsonrpc` `string`
- `id` `integer`
- `result` `string`

### Example request

```bash
curl https://api.tempo.xyz/rpc \
  --request POST \
  --header 'Content-Type: application/json' \
  --data '{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "eth_estimateGas",
  "params": [
    {
      "from": "0xfe3b557e8fb62b89f4916b721be55ceb828dbd73",
      "to": "0x44aa93095d6749a706051658b970b941c72c1d53",
      "value": "0x1"
    },
    null
  ]
}'
```

```ts
fetch('https://api.tempo.xyz/rpc', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    jsonrpc: '2.0',
    id: 1,
    method: 'eth_estimateGas',
    params: [
      {
        from: '0xfe3b557e8fb62b89f4916b721be55ceb828dbd73',
        to: '0x44aa93095d6749a706051658b970b941c72c1d53',
        value: '0x1'
      },
      null
    ]
  })
})
```

## eth_feeHistory

`POST /rpc`

Transaction fee history

Returns transaction base fee per gas and effective priority fee per gas for the requested/supported block range.

### Parameters

- `blockCount` `string` _(required)_: Requested range of blocks. Clients will return less than the requested range if not all blocks are available.
- `newestBlock` `string` _(required)_: Highest block of the requested range.
- `rewardPercentiles` `number[]` _(required)_: A monotonically increasing list of percentile values. For each block in the requested range, the transactions will be sorted in ascending order by effective tip per gas and the corresponding effective tip for the percentile will be determined, accounting for gas consumed.

### Responses

#### `200`: Fee history for the returned block range. This can be a subsection of the requested range if not all blocks are available.

Body (`application/json`):

- `jsonrpc` `string`
- `id` `integer`
- `result` `object`: Fee history results.
  - `baseFeePerBlobGas` `string[]`: An array of block base fees per blob gas. This includes the next block after the newest of the returned range, because this value can be derived from the newest block. Zeroes are returned for pre-EIP-4844 blocks.
  - `baseFeePerGas` `string[]` _(required)_: An array of block base fees per gas. This includes the next block after the newest of the returned range, because this value can be derived from the newest block. Zeroes are returned for pre-EIP-1559 blocks.
  - `blobGasUsedRatio` `number[]`: An array of block blob gas used ratios. These are calculated as the ratio of blobGasUsed and the max blob gas per block.
  - `gasUsedRatio` `number[]` _(required)_: An array of block gas used ratios. These are calculated as the ratio of gasUsed and gasLimit.
  - `oldestBlock` `string` _(required)_: Lowest number block of returned range.
  - `reward` `string[][]`: A two-dimensional array of effective priority fees per gas at the requested block percentiles.

### Example request

```bash
curl https://api.tempo.xyz/rpc \
  --request POST \
  --header 'Content-Type: application/json' \
  --data '{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "eth_feeHistory",
  "params": [
    "0x5",
    "latest",
    [
      20,
      30
    ]
  ]
}'
```

```ts
fetch('https://api.tempo.xyz/rpc', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    jsonrpc: '2.0',
    id: 1,
    method: 'eth_feeHistory',
    params: [
      '0x5',
      'latest',
      {
        '0': 20,
        '1': 30
      }
    ]
  })
})
```

## eth_fillTransaction

`POST /rpc`

Fills the defaults (nonce, gas, fees, chainId, …) on a given unsigned transaction, returning the filled transaction object and its raw EIP-2718 encoding.

### Parameters

- `Transaction` `object` _(required)_
  - `accessList` `object[]`: EIP-2930 access list
    - `address` `string` _(required)_
    - `storageKeys` `string[]` _(required)_
  - `authorizationList` `object[]`: EIP-7702 authorization list
    - `address` `string` _(required)_
    - `chainId` `string` _(required)_: Chain ID on which this transaction is valid
    - `nonce` `string` _(required)_
    - `r` `string` _(required)_
    - `s` `string` _(required)_
    - `yParity` `string` _(required)_: The parity (0 for even, 1 for odd) of the y-value of the secp256k1 signature
  - `blobVersionedHashes` `string[]`: List of versioned blob hashes associated with the transaction's EIP-4844 data blobs.
  - `blobs` `string[]`: Raw blob data.
  - `chainId` `string`: Chain ID that this transaction is valid on.
  - `from` `string`
  - `gas` `string`
  - `gasPrice` `string`: The gas price willing to be paid by the sender in wei
  - `input` `string`
  - `maxFeePerBlobGas` `string`: The maximum total fee per gas the sender is willing to pay for blob gas in wei
  - `maxFeePerGas` `string`: The maximum total fee per gas the sender is willing to pay (includes the network / base fee and miner / priority fee) in wei
  - `maxPriorityFeePerGas` `string`: Maximum fee per gas the sender is willing to pay to miners in wei
  - `nonce` `string`
  - `to` `string`
  - `type` `string`
  - `value` `string`
  - `aaAuthorizationList` `object[]`: EIP-7702-style authorizations (Tempo AA).
    - `address` `string` _(required)_
    - `chainId` `string` _(required)_
    - `nonce` `string` _(required)_
    - `signature` `object` _(required)_
  - `calls` `object[]`: Tempo AA batched calls.
    - `input` `string` _(required)_: Call input data (accepts `data` on input).
    - `to` `string` _(required)_
    - `value` `string` _(required)_
  - `feePayerSignature` `object`: Gas-sponsor signature, when fee-payer sponsored.
    - `r` `string` _(required)_
    - `s` `string` _(required)_
    - `v` `string` _(required)_: Recovery id (`0` or `1`); mirrors `yParity`.
    - `yParity` `string` _(required)_
  - `feeToken` `string`: TIP-20 token used to pay fees.
  - `keyAuthorization` `object`: Access-key provisioning authorization.
    - `account` `string`: Target account binding.
    - `allowedCalls` `object[]`: Allowed call scopes; `null` means unrestricted.
      - `selectorRules` `object[]`
        - `recipients` `string[]`
        - `selector` `string` _(required)_
      - `target` `string` _(required)_
    - `chainId` `string` _(required)_
    - `expiry` `string`: Expiry timestamp; `null` means no expiry.
    - `isAdmin` `boolean` _(required)_
    - `keyId` `string` _(required)_
    - `keyType` `string` _(required)_
    - `limits` `object[]`: Spending limits; `null` means unlimited.
      - `limit` `string` _(required)_
      - `period` `string` _(required)_
      - `token` `string` _(required)_
    - `signature` `object` _(required)_
    - `witness` `string`
  - `keyData` `string`: Access-key public key data.
  - `keyId` `string`: Access-key id (address).
  - `keyType` `string`: Access-key signature scheme.
  - `nonceKey` `string`: Tempo 2D nonce key.
  - `validAfter` `string`: Earliest valid timestamp.
  - `validBefore` `string`: Latest valid timestamp.

### Responses

#### `200`: JSON-RPC response.

Body (`application/json`):

- `jsonrpc` `string`
- `id` `integer`
- `result` `object`
  - `raw` `string` _(required)_: EIP-2718 typed-envelope encoding of the filled transaction.
  - `tx` `object & object | object` _(required)_: The defaults-filled transaction object.

### Example request

```bash
curl https://api.tempo.xyz/rpc \
  --request POST \
  --header 'Content-Type: application/json' \
  --data '{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "eth_fillTransaction",
  "params": [
    {
      "to": "0x44aa93095d6749a706051658b970b941c72c1d53",
      "input": "0xa9059cbb000000000000000000000000627306090abab3a6e1400e9345bc60c78a8bef570000000000000000000000000000000000000000000000000de0b6b3a7640000"
    }
  ]
}'
```

```ts
fetch('https://api.tempo.xyz/rpc', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    jsonrpc: '2.0',
    id: 1,
    method: 'eth_fillTransaction',
    params: [
      {
        to: '0x44aa93095d6749a706051658b970b941c72c1d53',
        input: '0xa9059cbb000000000000000000000000627306090abab3a6e1400e9345bc60c78a8bef570000000000000000000000000000000000000000000000000de0b6b3a7640000'
      }
    ]
  })
})
```

## eth_gasPrice

`POST /rpc`

Returns the current price per gas in wei.

### Responses

#### `200`: JSON-RPC response.

Body (`application/json`):

- `jsonrpc` `string`
- `id` `integer`
- `result` `string`

### Example request

```bash
curl https://api.tempo.xyz/rpc \
  --request POST \
  --header 'Content-Type: application/json' \
  --data '{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "eth_gasPrice",
  "params": []
}'
```

```ts
fetch('https://api.tempo.xyz/rpc', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    jsonrpc: '2.0',
    id: 1,
    method: 'eth_gasPrice',
    params: []
  })
})
```

## eth_getBlockAccessList

`POST /rpc`

Returns the block access list for a given block.

### Parameters

- `Block` `string` _(required)_

### Responses

#### `200`: JSON-RPC response.

Body (`application/json`):

- `jsonrpc` `string`
- `id` `integer`
- `result` `object[]`
  - `address` `string` _(required)_
  - `balanceChanges` `object[]`
    - `index` `string` _(required)_
    - `value` `string` _(required)_
  - `codeChanges` `object[]`
    - `code` `string` _(required)_
    - `index` `string` _(required)_
  - `nonceChanges` `object[]`
    - `index` `string` _(required)_
    - `value` `string` _(required)_
  - `storageChanges` `object[]`
    - `changes` `object[]` _(required)_
      - `index` `string` _(required)_
      - `value` `string` _(required)_
    - `key` `string` _(required)_
  - `storageReads` `string[]`

### Example request

```bash
curl https://api.tempo.xyz/rpc \
  --request POST \
  --header 'Content-Type: application/json' \
  --data '{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "eth_getBlockAccessList",
  "params": [
    "latest"
  ]
}'
```

```ts
fetch('https://api.tempo.xyz/rpc', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    jsonrpc: '2.0',
    id: 1,
    method: 'eth_getBlockAccessList',
    params: ['latest']
  })
})
```

## eth_getBlockByHash

`POST /rpc`

Returns information about a block by hash.

### Parameters

- `Block hash` `string` _(required)_
- `Hydrated transactions` `boolean` _(required)_

### Responses

#### `200`: JSON-RPC response.

Body (`application/json`):

- `jsonrpc` `string`
- `id` `integer`
- `result` `object`
  - `baseFeePerGas` `string`
  - `blobGasUsed` `string`
  - `blockAccessListHash` `string`
  - `difficulty` `string`
  - `excessBlobGas` `string`
  - `extraData` `string` _(required)_
  - `gasLimit` `string` _(required)_
  - `gasUsed` `string` _(required)_
  - `hash` `string` _(required)_
  - `logsBloom` `string` _(required)_
  - `miner` `string` _(required)_
  - `mixHash` `string` _(required)_
  - `nonce` `string` _(required)_
  - `number` `string` _(required)_
  - `parentBeaconBlockRoot` `string`
  - `parentHash` `string` _(required)_
  - `receiptsRoot` `string` _(required)_
  - `requestsHash` `string`
  - `sha3Uncles` `string` _(required)_
  - `size` `string` _(required)_
  - `stateRoot` `string` _(required)_
  - `timestamp` `string` _(required)_
  - `transactions` `string[] | object & object & object | object[]` _(required)_
  - `transactionsRoot` `string` _(required)_
  - `uncles` `string[]` _(required)_
  - `withdrawals` `object[]`
    - `address` `string` _(required)_
    - `amount` `string` _(required)_
    - `index` `string` _(required)_
    - `validatorIndex` `string` _(required)_
  - `withdrawalsRoot` `string`
  - `consensusContext` `object`: Tempo consensus context.
    - `epoch` `string` _(required)_
    - `parentView` `string` _(required)_
    - `proposer` `string` _(required)_: Proposer consensus public key.
    - `view` `string` _(required)_
  - `mainBlockGeneralGasLimit` `string` _(required)_
  - `sharedGasLimit` `string` _(required)_
  - `timestampMillis` `string` _(required)_
  - `timestampMillisPart` `string` _(required)_

### Example request

```bash
curl https://api.tempo.xyz/rpc \
  --request POST \
  --header 'Content-Type: application/json' \
  --data '{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "eth_getBlockByHash",
  "params": [
    "0xd5f1812548be429cbdc6376b29611fc49e06f1359758c4ceaaa3b393e2239f9c",
    false
  ]
}'
```

```ts
fetch('https://api.tempo.xyz/rpc', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    jsonrpc: '2.0',
    id: 1,
    method: 'eth_getBlockByHash',
    params: ['0xd5f1812548be429cbdc6376b29611fc49e06f1359758c4ceaaa3b393e2239f9c', false]
  })
})
```

## eth_getBlockByNumber

`POST /rpc`

Returns information about a block by number.

### Parameters

- `Block` `string` _(required)_
- `Hydrated transactions` `boolean` _(required)_

### Responses

#### `200`: JSON-RPC response.

Body (`application/json`):

- `jsonrpc` `string`
- `id` `integer`
- `result` `object`
  - `baseFeePerGas` `string`
  - `blobGasUsed` `string`
  - `blockAccessListHash` `string`
  - `difficulty` `string`
  - `excessBlobGas` `string`
  - `extraData` `string` _(required)_
  - `gasLimit` `string` _(required)_
  - `gasUsed` `string` _(required)_
  - `hash` `string` _(required)_
  - `logsBloom` `string` _(required)_
  - `miner` `string` _(required)_
  - `mixHash` `string` _(required)_
  - `nonce` `string` _(required)_
  - `number` `string` _(required)_
  - `parentBeaconBlockRoot` `string`
  - `parentHash` `string` _(required)_
  - `receiptsRoot` `string` _(required)_
  - `requestsHash` `string`
  - `sha3Uncles` `string` _(required)_
  - `size` `string` _(required)_
  - `stateRoot` `string` _(required)_
  - `timestamp` `string` _(required)_
  - `transactions` `string[] | object & object & object | object[]` _(required)_
  - `transactionsRoot` `string` _(required)_
  - `uncles` `string[]` _(required)_
  - `withdrawals` `object[]`
    - `address` `string` _(required)_
    - `amount` `string` _(required)_
    - `index` `string` _(required)_
    - `validatorIndex` `string` _(required)_
  - `withdrawalsRoot` `string`
  - `consensusContext` `object`: Tempo consensus context.
    - `epoch` `string` _(required)_
    - `parentView` `string` _(required)_
    - `proposer` `string` _(required)_: Proposer consensus public key.
    - `view` `string` _(required)_
  - `mainBlockGeneralGasLimit` `string` _(required)_
  - `sharedGasLimit` `string` _(required)_
  - `timestampMillis` `string` _(required)_
  - `timestampMillisPart` `string` _(required)_

### Example request

```bash
curl https://api.tempo.xyz/rpc \
  --request POST \
  --header 'Content-Type: application/json' \
  --data '{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "eth_getBlockByNumber",
  "params": [
    "0x68b3",
    false
  ]
}'
```

```ts
fetch('https://api.tempo.xyz/rpc', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    jsonrpc: '2.0',
    id: 1,
    method: 'eth_getBlockByNumber',
    params: ['0x68b3', false]
  })
})
```

## eth_getBlockReceipts

`POST /rpc`

Returns the receipts of a block by number or hash.

### Parameters

- `Block` `string` _(required)_

### Responses

#### `200`: JSON-RPC response.

Body (`application/json`):

- `jsonrpc` `string`
- `id` `integer`
- `result` `object[]`
  - `blobGasPrice` `string`: The actual value per gas deducted from the sender's account for blob gas. Only specified for blob transactions as defined by EIP-4844.
  - `blobGasUsed` `string`: The amount of blob gas used for this specific transaction. Only specified for blob transactions as defined by EIP-4844.
  - `blockHash` `string` _(required)_
  - `blockNumber` `string` _(required)_
  - `contractAddress` `string`: The contract address created, if the transaction was a contract creation, otherwise null.
  - `cumulativeGasUsed` `string` _(required)_: The sum of gas used by this transaction and all preceding transactions in the same block.
  - `effectiveGasPrice` `string` _(required)_: The actual value per gas deducted from the sender's account. Before EIP-1559, this is equal to the transaction's gas price. After, it is equal to baseFeePerGas + min(maxFeePerGas - baseFeePerGas, maxPriorityFeePerGas).
  - `from` `string` _(required)_
  - `gasUsed` `string` _(required)_: The amount of gas used for this specific transaction alone.
  - `logs` `object[]` _(required)_
    - `address` `string`
    - `blockHash` `string`
    - `blockNumber` `string`
    - `blockTimestamp` `string`
    - `data` `string`
    - `logIndex` `string`
    - `removed` `boolean`
    - `topics` `string[]`
    - `transactionHash` `string` _(required)_
    - `transactionIndex` `string`
  - `logsBloom` `string` _(required)_
  - `root` `string`: The post-transaction state root. Only specified for transactions included before the Byzantium upgrade.
  - `status` `string`: Either 1 (success) or 0 (failure). Only specified for transactions included after the Byzantium upgrade.
  - `to` `string`: Address of the receiver or null in a contract creation transaction.
  - `transactionHash` `string` _(required)_
  - `transactionIndex` `string` _(required)_
  - `type` `string`
  - `feePayer` `string` _(required)_: Address that paid the transaction fee.
  - `feeToken` `string`: TIP-20 token used to pay fees.

### Example request

```bash
curl https://api.tempo.xyz/rpc \
  --request POST \
  --header 'Content-Type: application/json' \
  --data '{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "eth_getBlockReceipts",
  "params": [
    "latest"
  ]
}'
```

```ts
fetch('https://api.tempo.xyz/rpc', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    jsonrpc: '2.0',
    id: 1,
    method: 'eth_getBlockReceipts',
    params: ['latest']
  })
})
```

## eth_getBlockTransactionCountByHash

`POST /rpc`

Returns the number of transactions in a block from a block matching the given block hash.

### Parameters

- `Block hash` `string`

### Responses

#### `200`: JSON-RPC response.

Body (`application/json`):

- `jsonrpc` `string`
- `id` `integer`
- `result` `string`

### Example request

```bash
curl https://api.tempo.xyz/rpc \
  --request POST \
  --header 'Content-Type: application/json' \
  --data '{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "eth_getBlockTransactionCountByHash",
  "params": [
    "0xb903239f8543d04b5dc1ba6579132b143087c68db1b2168786408fcbce568238"
  ]
}'
```

```ts
fetch('https://api.tempo.xyz/rpc', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    jsonrpc: '2.0',
    id: 1,
    method: 'eth_getBlockTransactionCountByHash',
    params: ['0xb903239f8543d04b5dc1ba6579132b143087c68db1b2168786408fcbce568238']
  })
})
```

## eth_getBlockTransactionCountByNumber

`POST /rpc`

Returns the number of transactions in a block matching the given block number.

### Parameters

- `Block` `string`

### Responses

#### `200`: JSON-RPC response.

Body (`application/json`):

- `jsonrpc` `string`
- `id` `integer`
- `result` `string`

### Example request

```bash
curl https://api.tempo.xyz/rpc \
  --request POST \
  --header 'Content-Type: application/json' \
  --data '{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "eth_getBlockTransactionCountByNumber",
  "params": [
    "0xe8"
  ]
}'
```

```ts
fetch('https://api.tempo.xyz/rpc', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    jsonrpc: '2.0',
    id: 1,
    method: 'eth_getBlockTransactionCountByNumber',
    params: ['0xe8']
  })
})
```

## eth_getCode

`POST /rpc`

Returns code at a given address.

### Parameters

- `Address` `string` _(required)_
- `Block` `string` _(required)_

### Responses

#### `200`: JSON-RPC response.

Body (`application/json`):

- `jsonrpc` `string`
- `id` `integer`
- `result` `string`

### Example request

```bash
curl https://api.tempo.xyz/rpc \
  --request POST \
  --header 'Content-Type: application/json' \
  --data '{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "eth_getCode",
  "params": [
    "0xa50a51c09a5c451c52bb714527e1974b686d8e77",
    "latest"
  ]
}'
```

```ts
fetch('https://api.tempo.xyz/rpc', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    jsonrpc: '2.0',
    id: 1,
    method: 'eth_getCode',
    params: ['0xa50a51c09a5c451c52bb714527e1974b686d8e77', 'latest']
  })
})
```

## eth_getFilterChanges

`POST /rpc`

Polling method for the filter with the given ID (created using `eth_newFilter`). Returns an array of logs, block hashes, or transaction hashes since last poll, depending on the installed filter.

### Parameters

- `Filter identifier` `string` _(required)_

### Responses

#### `200`: JSON-RPC response.

Body (`application/json`):

- `jsonrpc` `string`
- `id` `integer`
- `result` `string[] | object[]`

### Example request

```bash
curl https://api.tempo.xyz/rpc \
  --request POST \
  --header 'Content-Type: application/json' \
  --data '{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "eth_getFilterChanges",
  "params": [
    "0x01"
  ]
}'
```

```ts
fetch('https://api.tempo.xyz/rpc', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    jsonrpc: '2.0',
    id: 1,
    method: 'eth_getFilterChanges',
    params: ['0x01']
  })
})
```

## eth_getFilterLogs

`POST /rpc`

Returns an array of all logs matching the filter with the given ID (created using `eth_newFilter`).

### Parameters

- `Filter identifier` `string` _(required)_

### Responses

#### `200`: JSON-RPC response.

Body (`application/json`):

- `jsonrpc` `string`
- `id` `integer`
- `result` `string[] | object[]`

### Example request

```bash
curl https://api.tempo.xyz/rpc \
  --request POST \
  --header 'Content-Type: application/json' \
  --data '{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "eth_getFilterLogs",
  "params": [
    "0x01"
  ]
}'
```

```ts
fetch('https://api.tempo.xyz/rpc', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    jsonrpc: '2.0',
    id: 1,
    method: 'eth_getFilterLogs',
    params: ['0x01']
  })
})
```

## eth_getLogs

`POST /rpc`

Returns an array of all logs matching the specified filter.

### Parameters

- `Filter` `object` _(required)_

### Responses

#### `200`: JSON-RPC response.

Body (`application/json`):

- `jsonrpc` `string`
- `id` `integer`
- `result` `string[] | object[]`

### Example request

```bash
curl https://api.tempo.xyz/rpc \
  --request POST \
  --header 'Content-Type: application/json' \
  --data '{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "eth_getLogs",
  "params": [
    {
      "address": "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2",
      "fromBlock": "0x137d3c2",
      "toBlock": "0x137d3c3",
      "topics": []
    }
  ]
}'
```

```ts
fetch('https://api.tempo.xyz/rpc', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    jsonrpc: '2.0',
    id: 1,
    method: 'eth_getLogs',
    params: [
      {
        address: '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2',
        fromBlock: '0x137d3c2',
        toBlock: '0x137d3c3',
        topics: []
      }
    ]
  })
})
```

## eth_getProof

`POST /rpc`

Returns the merkle proof for a given account and optionally some storage keys.

### Parameters

- `Address` `string` _(required)_
- `StorageKeys` `string[]` _(required)_
- `Block` `string` _(required)_

### Responses

#### `200`: JSON-RPC response.

Body (`application/json`):

- `jsonrpc` `string`
- `id` `integer`
- `result` `object`
  - `accountProof` `string[]` _(required)_
  - `address` `string` _(required)_
  - `balance` `string` _(required)_
  - `codeHash` `string` _(required)_
  - `nonce` `string` _(required)_
  - `storageHash` `string` _(required)_
  - `storageProof` `object[]` _(required)_
    - `key` `string` _(required)_
    - `proof` `string[]` _(required)_
    - `value` `string` _(required)_

### Example request

```bash
curl https://api.tempo.xyz/rpc \
  --request POST \
  --header 'Content-Type: application/json' \
  --data '{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "eth_getProof",
  "params": [
    "0xe5cB067E90D5Cd1F8052B83562Ae670bA4A211a8",
    [
      "0x56e81f171bcc55a6ff8345e692c0f86e5b48e01b996cadc001622fb5e363b421"
    ],
    "latest"
  ]
}'
```

```ts
fetch('https://api.tempo.xyz/rpc', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    jsonrpc: '2.0',
    id: 1,
    method: 'eth_getProof',
    params: [
      '0xe5cB067E90D5Cd1F8052B83562Ae670bA4A211a8',
      {
        '0': '0x56e81f171bcc55a6ff8345e692c0f86e5b48e01b996cadc001622fb5e363b421'
      },
      'latest'
    ]
  })
})
```

## eth_getStorageAt

`POST /rpc`

Returns the value from a storage position at a given address.

### Parameters

- `Address` `string` _(required)_
- `Storage slot` `string` _(required)_
- `Block` `string` _(required)_

### Responses

#### `200`: JSON-RPC response.

Body (`application/json`):

- `jsonrpc` `string`
- `id` `integer`
- `result` `string`

### Example request

```bash
curl https://api.tempo.xyz/rpc \
  --request POST \
  --header 'Content-Type: application/json' \
  --data '{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "eth_getStorageAt",
  "params": [
    "0xfe3b557e8fb62b89f4916b721be55ceb828dbd73",
    "0x0",
    "latest"
  ]
}'
```

```ts
fetch('https://api.tempo.xyz/rpc', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    jsonrpc: '2.0',
    id: 1,
    method: 'eth_getStorageAt',
    params: ['0xfe3b557e8fb62b89f4916b721be55ceb828dbd73', '0x0', 'latest']
  })
})
```

## eth_getStorageValues

`POST /rpc`

Returns the values of multiple storage slots for multiple accounts in a single request.

### Parameters

- `Requests` `object` _(required)_
- `Block` `string` _(required)_

### Responses

#### `200`: JSON-RPC response.

Body (`application/json`):

- `jsonrpc` `string`
- `id` `integer`
- `result` `object`

### Example request

```bash
curl https://api.tempo.xyz/rpc \
  --request POST \
  --header 'Content-Type: application/json' \
  --data '{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "eth_getStorageValues",
  "params": [
    {
      "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48": [
        "0x0000000000000000000000000000000000000000000000000000000000000003"
      ],
      "0xdAC17F958D2ee523a2206206994597C13D831ec7": [
        "0x0000000000000000000000000000000000000000000000000000000000000002",
        "0x0000000000000000000000000000000000000000000000000000000000000006"
      ]
    },
    "latest"
  ]
}'
```

```ts
fetch('https://api.tempo.xyz/rpc', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    jsonrpc: '2.0',
    id: 1,
    method: 'eth_getStorageValues',
    params: [
      {
        '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48': ['0x0000000000000000000000000000000000000000000000000000000000000003'],
        '0xdAC17F958D2ee523a2206206994597C13D831ec7': ['0x0000000000000000000000000000000000000000000000000000000000000002', '0x0000000000000000000000000000000000000000000000000000000000000006']
      },
      'latest'
    ]
  })
})
```

## eth_getTransactionByBlockHashAndIndex

`POST /rpc`

Returns information about a transaction by block hash and transaction index position.

### Parameters

- `Block hash` `string` _(required)_
- `Transaction index` `string` _(required)_

### Responses

#### `200`: JSON-RPC response.

Body (`application/json`):

- `jsonrpc` `string`
- `id` `integer`
- `result` `object & object & object | object`

### Example request

```bash
curl https://api.tempo.xyz/rpc \
  --request POST \
  --header 'Content-Type: application/json' \
  --data '{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "eth_getTransactionByBlockHashAndIndex",
  "params": [
    "0xbf137c3a7a1ebdfac21252765e5d7f40d115c2757e4a4abee929be88c624fdb7",
    "0x2"
  ]
}'
```

```ts
fetch('https://api.tempo.xyz/rpc', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    jsonrpc: '2.0',
    id: 1,
    method: 'eth_getTransactionByBlockHashAndIndex',
    params: ['0xbf137c3a7a1ebdfac21252765e5d7f40d115c2757e4a4abee929be88c624fdb7', '0x2']
  })
})
```

## eth_getTransactionByBlockNumberAndIndex

`POST /rpc`

Returns information about a transaction by block number and transaction index position.

### Parameters

- `Block` `string` _(required)_
- `Transaction index` `string` _(required)_

### Responses

#### `200`: JSON-RPC response.

Body (`application/json`):

- `jsonrpc` `string`
- `id` `integer`
- `result` `object & object & object | object`

### Example request

```bash
curl https://api.tempo.xyz/rpc \
  --request POST \
  --header 'Content-Type: application/json' \
  --data '{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "eth_getTransactionByBlockNumberAndIndex",
  "params": [
    "0x1442e",
    "0x2"
  ]
}'
```

```ts
fetch('https://api.tempo.xyz/rpc', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    jsonrpc: '2.0',
    id: 1,
    method: 'eth_getTransactionByBlockNumberAndIndex',
    params: ['0x1442e', '0x2']
  })
})
```

## eth_getTransactionByHash

`POST /rpc`

Returns the information about a transaction requested by transaction hash.

### Parameters

- `Transaction hash` `string` _(required)_

### Responses

#### `200`: JSON-RPC response.

Body (`application/json`):

- `jsonrpc` `string`
- `id` `integer`
- `result` `object & object & object | object`

### Example request

```bash
curl https://api.tempo.xyz/rpc \
  --request POST \
  --header 'Content-Type: application/json' \
  --data '{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "eth_getTransactionByHash",
  "params": [
    "0xa52be92809541220ee0aaaede6047d9a6c5d0cd96a517c854d944ee70a0ebb44"
  ]
}'
```

```ts
fetch('https://api.tempo.xyz/rpc', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    jsonrpc: '2.0',
    id: 1,
    method: 'eth_getTransactionByHash',
    params: ['0xa52be92809541220ee0aaaede6047d9a6c5d0cd96a517c854d944ee70a0ebb44']
  })
})
```

## eth_getTransactionCount

`POST /rpc`

Returns the nonce of an account in the state. NOTE: The name eth_getTransactionCount reflects the historical fact that an account's nonce and sent transaction count were the same. After the Pectra fork, with the inclusion of EIP-7702, this is no longer true.

### Parameters

- `Address` `string` _(required)_
- `Block` `string` _(required)_

### Responses

#### `200`: JSON-RPC response.

Body (`application/json`):

- `jsonrpc` `string`
- `id` `integer`
- `result` `string`

### Example request

```bash
curl https://api.tempo.xyz/rpc \
  --request POST \
  --header 'Content-Type: application/json' \
  --data '{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "eth_getTransactionCount",
  "params": [
    "0xc94770007dda54cF92009BFF0dE90c06F603a09f",
    "latest"
  ]
}'
```

```ts
fetch('https://api.tempo.xyz/rpc', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    jsonrpc: '2.0',
    id: 1,
    method: 'eth_getTransactionCount',
    params: ['0xc94770007dda54cF92009BFF0dE90c06F603a09f', 'latest']
  })
})
```

## eth_getTransactionReceipt

`POST /rpc`

Returns the receipt of a transaction by transaction hash.

### Parameters

- `Transaction hash` `string` _(required)_

### Responses

#### `200`: JSON-RPC response.

Body (`application/json`):

- `jsonrpc` `string`
- `id` `integer`
- `result` `object`
  - `blobGasPrice` `string`: The actual value per gas deducted from the sender's account for blob gas. Only specified for blob transactions as defined by EIP-4844.
  - `blobGasUsed` `string`: The amount of blob gas used for this specific transaction. Only specified for blob transactions as defined by EIP-4844.
  - `blockHash` `string` _(required)_
  - `blockNumber` `string` _(required)_
  - `contractAddress` `string`: The contract address created, if the transaction was a contract creation, otherwise null.
  - `cumulativeGasUsed` `string` _(required)_: The sum of gas used by this transaction and all preceding transactions in the same block.
  - `effectiveGasPrice` `string` _(required)_: The actual value per gas deducted from the sender's account. Before EIP-1559, this is equal to the transaction's gas price. After, it is equal to baseFeePerGas + min(maxFeePerGas - baseFeePerGas, maxPriorityFeePerGas).
  - `from` `string` _(required)_
  - `gasUsed` `string` _(required)_: The amount of gas used for this specific transaction alone.
  - `logs` `object[]` _(required)_
    - `address` `string`
    - `blockHash` `string`
    - `blockNumber` `string`
    - `blockTimestamp` `string`
    - `data` `string`
    - `logIndex` `string`
    - `removed` `boolean`
    - `topics` `string[]`
    - `transactionHash` `string` _(required)_
    - `transactionIndex` `string`
  - `logsBloom` `string` _(required)_
  - `root` `string`: The post-transaction state root. Only specified for transactions included before the Byzantium upgrade.
  - `status` `string`: Either 1 (success) or 0 (failure). Only specified for transactions included after the Byzantium upgrade.
  - `to` `string`: Address of the receiver or null in a contract creation transaction.
  - `transactionHash` `string` _(required)_
  - `transactionIndex` `string` _(required)_
  - `type` `string`
  - `feePayer` `string` _(required)_: Address that paid the transaction fee.
  - `feeToken` `string`: TIP-20 token used to pay fees.

### Example request

```bash
curl https://api.tempo.xyz/rpc \
  --request POST \
  --header 'Content-Type: application/json' \
  --data '{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "eth_getTransactionReceipt",
  "params": [
    "0x504ce587a65bdbdb6414a0c6c16d86a04dd79bfcc4f2950eec9634b30ce5370f"
  ]
}'
```

```ts
fetch('https://api.tempo.xyz/rpc', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    jsonrpc: '2.0',
    id: 1,
    method: 'eth_getTransactionReceipt',
    params: ['0x504ce587a65bdbdb6414a0c6c16d86a04dd79bfcc4f2950eec9634b30ce5370f']
  })
})
```

## eth_maxPriorityFeePerGas

`POST /rpc`

Returns the current maxPriorityFeePerGas per gas in wei.

### Responses

#### `200`: JSON-RPC response.

Body (`application/json`):

- `jsonrpc` `string`
- `id` `integer`
- `result` `string`

### Example request

```bash
curl https://api.tempo.xyz/rpc \
  --request POST \
  --header 'Content-Type: application/json' \
  --data '{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "eth_maxPriorityFeePerGas",
  "params": []
}'
```

```ts
fetch('https://api.tempo.xyz/rpc', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    jsonrpc: '2.0',
    id: 1,
    method: 'eth_maxPriorityFeePerGas',
    params: []
  })
})
```

## eth_newBlockFilter

`POST /rpc`

Creates a filter in the node, allowing for later polling. Registers client interest in new blocks, and returns an identifier.

### Responses

#### `200`: JSON-RPC response.

Body (`application/json`):

- `jsonrpc` `string`
- `id` `integer`
- `result` `string`

### Example request

```bash
curl https://api.tempo.xyz/rpc \
  --request POST \
  --header 'Content-Type: application/json' \
  --data '{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "eth_newBlockFilter",
  "params": []
}'
```

```ts
fetch('https://api.tempo.xyz/rpc', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    jsonrpc: '2.0',
    id: 1,
    method: 'eth_newBlockFilter',
    params: []
  })
})
```

## eth_newFilter

`POST /rpc`

Install a log filter in the server, allowing for later polling. Registers client interest in logs matching the filter, and returns an identifier.

### Parameters

- `Filter` `object` _(required)_

### Responses

#### `200`: JSON-RPC response.

Body (`application/json`):

- `jsonrpc` `string`
- `id` `integer`
- `result` `string`

### Example request

```bash
curl https://api.tempo.xyz/rpc \
  --request POST \
  --header 'Content-Type: application/json' \
  --data '{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "eth_newFilter",
  "params": [
    {
      "address": "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2",
      "fromBlock": "0x137d3c2",
      "toBlock": "0x137d3c3",
      "topics": []
    }
  ]
}'
```

```ts
fetch('https://api.tempo.xyz/rpc', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    jsonrpc: '2.0',
    id: 1,
    method: 'eth_newFilter',
    params: [
      {
        address: '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2',
        fromBlock: '0x137d3c2',
        toBlock: '0x137d3c3',
        topics: []
      }
    ]
  })
})
```

## eth_newPendingTransactionFilter

`POST /rpc`

Creates a filter in the node, allowing for later polling. Registers client interest in new transactions, and returns an identifier.

### Responses

#### `200`: JSON-RPC response.

Body (`application/json`):

- `jsonrpc` `string`
- `id` `integer`
- `result` `string`

### Example request

```bash
curl https://api.tempo.xyz/rpc \
  --request POST \
  --header 'Content-Type: application/json' \
  --data '{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "eth_newPendingTransactionFilter",
  "params": []
}'
```

```ts
fetch('https://api.tempo.xyz/rpc', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    jsonrpc: '2.0',
    id: 1,
    method: 'eth_newPendingTransactionFilter',
    params: []
  })
})
```

## eth_sendRawTransaction

`POST /rpc`

Submits a raw transaction. You can create and sign a transaction externally using a library such as [web3.js](https://web3js.readthedocs.io/) or [ethers.js](https://docs.ethers.org/). For [EIP-4844](https://eips.ethereum.org/EIPS/eip-4844) transactions, the raw form must be the network form. This means it includes the blobs, KZG commitments, and KZG proofs. For [EIP-7594](https://eips.ethereum.org/EIPS/eip-7594) transactions, the raw format must be the network form. This means it includes the blobs, KZG commitments, and cell proofs. The logic for handling the new transaction during fork boundaries are 1. When receiving an encoded transaction with cell proofs before the PeerDAS fork activates, we reject it. Only blob proofs are accepted into the pool. 2. At the time of fork activation, the implementer could (not mandatory) - Drop all old-format transactions - Convert old proofs to new format (computationally expensive) - Convert only when including in a locally produced block 3. After the fork has activated, only txs with cell proofs are accepted via p2p relay. 4. On RPC (eth_sendRawTransaction), txs with blob proofs may still be accepted and will be auto-converted by the node. At implementer discretion, this facility can be deprecated later when users have switched to new client libraries that can create cell proofs.

### Parameters

- `Transaction` `string` _(required)_

### Responses

#### `200`: JSON-RPC response.

Body (`application/json`):

- `jsonrpc` `string`
- `id` `integer`
- `result` `string`

### Example request

```bash
curl https://api.tempo.xyz/rpc \
  --request POST \
  --header 'Content-Type: application/json' \
  --data '{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "eth_sendRawTransaction",
  "params": [
    "0xf869018203e882520894f17f52151ebef6c7334fad080c5704d77216b732881bc16d674ec80000801ba02da1c48b670996dcb1f447ef9ef00b33033c48a4fe938f420bec3e56bfd24071a062e0aa78a81bf0290afbc3a9d8e9a068e6d74caa66c5e0fa8a46deaae96b0833"
  ]
}'
```

```ts
fetch('https://api.tempo.xyz/rpc', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    jsonrpc: '2.0',
    id: 1,
    method: 'eth_sendRawTransaction',
    params: ['0xf869018203e882520894f17f52151ebef6c7334fad080c5704d77216b732881bc16d674ec80000801ba02da1c48b670996dcb1f447ef9ef00b33033c48a4fe938f420bec3e56bfd24071a062e0aa78a81bf0290afbc3a9d8e9a068e6d74caa66c5e0fa8a46deaae96b0833']
  })
})
```

## eth_sendRawTransactionSync

`POST /rpc`

Submits a raw (signed) transaction and waits for it to be included, returning its receipt. Returns a timeout error if the transaction is not included within the node-configured window.

### Parameters

- `Transaction` `string` _(required)_

### Responses

#### `200`: JSON-RPC response.

Body (`application/json`):

- `jsonrpc` `string`
- `id` `integer`
- `result` `object`
  - `blobGasPrice` `string`: The actual value per gas deducted from the sender's account for blob gas. Only specified for blob transactions as defined by EIP-4844.
  - `blobGasUsed` `string`: The amount of blob gas used for this specific transaction. Only specified for blob transactions as defined by EIP-4844.
  - `blockHash` `string` _(required)_
  - `blockNumber` `string` _(required)_
  - `contractAddress` `string`: The contract address created, if the transaction was a contract creation, otherwise null.
  - `cumulativeGasUsed` `string` _(required)_: The sum of gas used by this transaction and all preceding transactions in the same block.
  - `effectiveGasPrice` `string` _(required)_: The actual value per gas deducted from the sender's account. Before EIP-1559, this is equal to the transaction's gas price. After, it is equal to baseFeePerGas + min(maxFeePerGas - baseFeePerGas, maxPriorityFeePerGas).
  - `from` `string` _(required)_
  - `gasUsed` `string` _(required)_: The amount of gas used for this specific transaction alone.
  - `logs` `object[]` _(required)_
    - `address` `string`
    - `blockHash` `string`
    - `blockNumber` `string`
    - `blockTimestamp` `string`
    - `data` `string`
    - `logIndex` `string`
    - `removed` `boolean`
    - `topics` `string[]`
    - `transactionHash` `string` _(required)_
    - `transactionIndex` `string`
  - `logsBloom` `string` _(required)_
  - `root` `string`: The post-transaction state root. Only specified for transactions included before the Byzantium upgrade.
  - `status` `string`: Either 1 (success) or 0 (failure). Only specified for transactions included after the Byzantium upgrade.
  - `to` `string`: Address of the receiver or null in a contract creation transaction.
  - `transactionHash` `string` _(required)_
  - `transactionIndex` `string` _(required)_
  - `type` `string`
  - `feePayer` `string` _(required)_: Address that paid the transaction fee.
  - `feeToken` `string`: TIP-20 token used to pay fees.

### Example request

```bash
curl https://api.tempo.xyz/rpc \
  --request POST \
  --header 'Content-Type: application/json' \
  --data '{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "eth_sendRawTransactionSync",
  "params": [
    "0xf869018203e882520894f17f52151ebef6c7334fad080c5704d77216b732881bc16d674ec80000801ba02da1c48b670996dcb1f447ef9ef00b33033c48a4fe938f420bec3e56bfd24071a062e0aa78a81bf0290afbc3a9d8e9a068e6d74caa66c5e0fa8a46deaae96b0833"
  ]
}'
```

```ts
fetch('https://api.tempo.xyz/rpc', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    jsonrpc: '2.0',
    id: 1,
    method: 'eth_sendRawTransactionSync',
    params: ['0xf869018203e882520894f17f52151ebef6c7334fad080c5704d77216b732881bc16d674ec80000801ba02da1c48b670996dcb1f447ef9ef00b33033c48a4fe938f420bec3e56bfd24071a062e0aa78a81bf0290afbc3a9d8e9a068e6d74caa66c5e0fa8a46deaae96b0833']
  })
})
```

## eth_simulateV1

`POST /rpc`

Executes a sequence of message calls building on each other's state without creating transactions on the block chain, optionally overriding block and state data

### Parameters

- `Payload` `object` _(required)_
  - `blockStateCalls` `unknown[]` _(required)_: Definition of blocks that can contain calls and overrides
  - `returnFullTransactions` `boolean`: When true, the method returns full transaction objects, otherwise, just hashes are returned.
  - `traceTransfers` `boolean`: Adds ETH transfers as ERC20 transfer events to the logs. These transfers have emitter contract parameter set as address(0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee). Default: false.
  - `validation` `boolean`: When true, the eth_simulateV1 does all validations that a normal EVM would do, except contract sender and signature checks. When false, eth_simulateV1 behaves like eth_call. Default: false.
- `Block tag` `string`: default: 'latest'

### Responses

#### `200`: JSON-RPC response.

Body (`application/json`):

- `jsonrpc` `string`
- `id` `integer`
- `result` `object & object[]`

### Example request

```bash
curl https://api.tempo.xyz/rpc \
  --request POST \
  --header 'Content-Type: application/json' \
  --data '{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "eth_simulateV1",
  "params": [
    null,
    null
  ]
}'
```

```ts
fetch('https://api.tempo.xyz/rpc', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    jsonrpc: '2.0',
    id: 1,
    method: 'eth_simulateV1',
    params: [null, null]
  })
})
```

## eth_syncing

`POST /rpc`

Returns an object with data about the sync status or false.

### Responses

#### `200`: JSON-RPC response.

Body (`application/json`):

- `jsonrpc` `string`
- `id` `integer`
- `result` `object | boolean`

### Example request

```bash
curl https://api.tempo.xyz/rpc \
  --request POST \
  --header 'Content-Type: application/json' \
  --data '{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "eth_syncing",
  "params": []
}'
```

```ts
fetch('https://api.tempo.xyz/rpc', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    jsonrpc: '2.0',
    id: 1,
    method: 'eth_syncing',
    params: []
  })
})
```

## eth_uninstallFilter

`POST /rpc`

Uninstalls a filter with given id.

### Parameters

- `Filter identifier` `string` _(required)_

### Responses

#### `200`: JSON-RPC response.

Body (`application/json`):

- `jsonrpc` `string`
- `id` `integer`
- `result` `boolean`

### Example request

```bash
curl https://api.tempo.xyz/rpc \
  --request POST \
  --header 'Content-Type: application/json' \
  --data '{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "eth_uninstallFilter",
  "params": [
    "0x01"
  ]
}'
```

```ts
fetch('https://api.tempo.xyz/rpc', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    jsonrpc: '2.0',
    id: 1,
    method: 'eth_uninstallFilter',
    params: ['0x01']
  })
})
```

## tempo_forkSchedule

`POST /rpc`

Returns the Tempo fork schedule and the currently active fork at the chain head.

### Responses

#### `200`: JSON-RPC response.

Body (`application/json`):

- `jsonrpc` `string`
- `id` `integer`
- `result` `object`
  - `active` `string` _(required)_
  - `schedule` `object[]` _(required)_
    - `activationTime` `integer` _(required)_
    - `active` `boolean` _(required)_
    - `forkId` `string`: EIP-2124 fork hash at this fork activation point. Omitted until active.
    - `name` `string` _(required)_

### Example request

```bash
curl https://api.tempo.xyz/rpc \
  --request POST \
  --header 'Content-Type: application/json' \
  --data '{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tempo_forkSchedule",
  "params": []
}'
```

```ts
fetch('https://api.tempo.xyz/rpc', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    jsonrpc: '2.0',
    id: 1,
    method: 'tempo_forkSchedule',
    params: []
  })
})
```

## tempo_fundAddress

`POST /rpc`

Mints test stablecoins to an address on faucet-enabled testnet endpoints and returns the transaction hashes.

### Parameters

- `Address` `string` _(required)_

### Responses

#### `200`: JSON-RPC response.

Body (`application/json`):

- `jsonrpc` `string`
- `id` `integer`
- `result` `string[]`

### Example request

```bash
curl https://api.tempo.xyz/rpc \
  --request POST \
  --header 'Content-Type: application/json' \
  --data '{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tempo_fundAddress",
  "params": [
    "0x627306090abab3a6e1400e9345bc60c78a8bef57"
  ]
}'
```

```ts
fetch('https://api.tempo.xyz/rpc', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    jsonrpc: '2.0',
    id: 1,
    method: 'tempo_fundAddress',
    params: ['0x627306090abab3a6e1400e9345bc60c78a8bef57']
  })
})
```

## Call chain JSON-RPC

`POST /rpc/{chain}`

Proxies single or batch Ethereum JSON-RPC calls to a selected Tempo chain. Zone API keys are method restricted; upstream responses pass through unchanged.

### Path parameters

- `chain` `string` _(required)_: Chain selector. Use the alias `mainnet` or `testnet`, or a numeric chain id (mainnet is `4217`).

### Header parameters

- `X-Authorization-Token` `string`: Optional signed Zone credential forwarded only to the selected Zone RPC.

### Request body (required) (`application/json`)

### Responses

#### `200`: JSON-RPC response returned by the upstream endpoint. Empty 200 responses are normalized to null; unexpected empty responses are reported as provider failures.

Headers:

- `RateLimit-Limit` `integer`: How many requests you may make in the current time window. Not sent on cached responses or `402` payment challenges.
- `RateLimit-Remaining` `integer`: How many requests you have left in the current window before you are rate-limited. Not sent on cached responses or `402` payment challenges.
- `RateLimit-Reset` `integer`: When the current window resets, as a Unix timestamp in seconds. Not sent on cached responses or `402` payment challenges.
- `RateLimit-Scope` `string`: Which quota this request counted against (e.g. `data:read`). Not sent on cached responses or `402` payment challenges.
- `tempo-request-id` `string`: A unique id for this request, returned on every response (and as `requestId` in error bodies). Include it when contacting support so we can find your request.

#### `204`: Notification accepted with no response body.

Headers:

- `RateLimit-Limit` `integer`: How many requests you may make in the current time window. Not sent on cached responses or `402` payment challenges.
- `RateLimit-Remaining` `integer`: How many requests you have left in the current window before you are rate-limited. Not sent on cached responses or `402` payment challenges.
- `RateLimit-Reset` `integer`: When the current window resets, as a Unix timestamp in seconds. Not sent on cached responses or `402` payment challenges.
- `RateLimit-Scope` `string`: Which quota this request counted against (e.g. `data:read`). Not sent on cached responses or `402` payment challenges.
- `tempo-request-id` `string`: A unique id for this request, returned on every response (and as `requestId` in error bodies). Include it when contacting support so we can find your request.

#### `400`: The chain id is invalid or this API deployment does not support it.

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

#### `413`: Zone and anonymous RPC requests must not exceed 64 KiB.

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

#### `502`: The Tempo API could not reach the upstream RPC endpoint.

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

#### `default`: An upstream HTTP response passed through unchanged, including its status, headers, content type, and body.

### Example request

```bash
curl https://api.tempo.xyz/rpc/string \
  --request POST \
  --header 'Content-Type: application/json' \
  --data '{
  "id": 1,
  "jsonrpc": "2.0",
  "method": "eth_blockNumber",
  "params": []
}'
```

```ts
fetch('https://api.tempo.xyz/rpc/string', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    id: 1,
    jsonrpc: '2.0',
    method: 'eth_blockNumber',
    params: []
  })
})
```
