# Tempo API

Version: `1.0.0`

REST API for reading and interacting with Tempo

## Servers

- `https://api.tempo.xyz`: Relative to the host serving this document.

## Endpoints

### Activities

A readable feed of what an account did onchain.

- [`GET /v1/addresses/{address}/activities`](https://tempo.xyz/developers/docs/api/activities#getaddressactivities): List address activities
- [`GET /v1/transactions/{transactionHash}/activities`](https://tempo.xyz/developers/docs/api/activities#gettransactionactivities): List transaction activities

### Balances

How much of each token an account holds.

- [`GET /v1/addresses/{address}/balances`](https://tempo.xyz/developers/docs/api/balances#getaddressbalances): List address balances
- [`GET /v1/addresses/{address}/valuation`](https://tempo.xyz/developers/docs/api/balances#getaddressvaluation): Get address valuation
- [`GET /v1/addresses/{address}/balances/{token}`](https://tempo.xyz/developers/docs/api/balances#getaddressbalance): Get address balance

### Blocks

The ordered batches of transactions making up the chain.

- [`GET /v1/blocks`](https://tempo.xyz/developers/docs/api/blocks#getblocks): List blocks
- [`GET /v1/blocks/{block}`](https://tempo.xyz/developers/docs/api/blocks#getblock): Get a block by selector

### Earn

Vaults that earn yield from assets deposited on Tempo.

- [`GET /v1/earn/vaults`](https://tempo.xyz/developers/docs/api/earn#getearnvaults): List vaults
- [`GET /v1/earn/vaults/verified`](https://tempo.xyz/developers/docs/api/earn#getverifiedearnvaults): List verified vaults
- [`GET /v1/earn/addresses/{address}/positions`](https://tempo.xyz/developers/docs/api/earn#getearnaddresspositions): List account positions
- [`GET /v1/earn/vaults/{vaultId}/share-prices`](https://tempo.xyz/developers/docs/api/earn#getearnvaultshareprices): List share prices
- [`GET /v1/earn/vaults/{vaultId}`](https://tempo.xyz/developers/docs/api/earn#getearnvault): Get vault
- [`GET /v1/earn/vaults/{vaultId}/positions/{address}`](https://tempo.xyz/developers/docs/api/earn#getearnvaultposition): Get account position
- [`GET /v1/earn/vaults/{vaultId}/earnings/{address}`](https://tempo.xyz/developers/docs/api/earn#getearnvaultearnings): Get vault earnings

### Exchange

Tempo's built-in stablecoin exchange: pairs, swaps, orders, prices.

- [`GET /v1/exchange/swaps`](https://tempo.xyz/developers/docs/api/exchange#getswaps): List swaps
- [`GET /v1/exchange/pairs`](https://tempo.xyz/developers/docs/api/exchange#getpairs): List pairs
- [`GET /v1/exchange/orders`](https://tempo.xyz/developers/docs/api/exchange#getorders): List orders
- [`GET /v1/exchange/orders/{orderId}/fills`](https://tempo.xyz/developers/docs/api/exchange#getorderfills): List order fills
- [`GET /v1/exchange/pairs/{base}`](https://tempo.xyz/developers/docs/api/exchange#getpair): Get pair
- [`GET /v1/exchange/orders/{orderId}`](https://tempo.xyz/developers/docs/api/exchange#getorder): Get order
- [`GET /v1/exchange/pairs/{base}/ohlc`](https://tempo.xyz/developers/docs/api/exchange#getpairohlc): Get pair OHLC
- [`GET /v1/exchange/pairs/{base}/depth`](https://tempo.xyz/developers/docs/api/exchange#getpairdepth): Get pair depth
- [`POST /v1/exchange/quotes`](https://tempo.xyz/developers/docs/api/exchange#createexchangequote): Create quote
- [`POST /v1/exchange/quotes/execute`](https://tempo.xyz/developers/docs/api/exchange#finalizeexchangequote): Finalize quote

### Fee AMM

Pools that convert stablecoins to pay fees.

- [`GET /v1/fee-amm/pools`](https://tempo.xyz/developers/docs/api/fee-amm#getfeeammpools): List pools
- [`GET /v1/fee-amm/mints`](https://tempo.xyz/developers/docs/api/fee-amm#getfeeammmints): List mints

### Tokens

TIP-20 token details, supply, and holders.

- [`GET /v1/tokens`](https://tempo.xyz/developers/docs/api/tokens#gettokens): List tokens
- [`GET /v1/tokens/{token}/holders`](https://tempo.xyz/developers/docs/api/tokens#gettokenholders): List token holders
- [`GET /v1/tokens/{symbol}`](https://tempo.xyz/developers/docs/api/tokens#gettokenbysymbol): Get token by symbol
- [`GET /v1/tokens/{token}`](https://tempo.xyz/developers/docs/api/tokens#gettoken): Get token by address
- [`GET /v1/tokens/{token}/logo`](https://tempo.xyz/developers/docs/api/tokens#gettokenlogo): Get token logo

### Transactions

Transactions submitted to Tempo, and their receipts.

- [`GET /v1/transactions`](https://tempo.xyz/developers/docs/api/transactions#gettransactions): List transactions
- [`GET /v1/transactions/receipts`](https://tempo.xyz/developers/docs/api/transactions#getreceipts): List transaction receipts
- [`GET /v1/tokens/{token}/transactions`](https://tempo.xyz/developers/docs/api/transactions#gettokentransactions): List token transactions
- [`GET /v1/transactions/{transactionHash}`](https://tempo.xyz/developers/docs/api/transactions#gettransaction): Get a transaction by hash
- [`GET /v1/transactions/{transactionHash}/receipt`](https://tempo.xyz/developers/docs/api/transactions#getreceipt): Get a transaction receipt

### Transfers

Token movements from executing transactions.

- [`GET /v1/transfers`](https://tempo.xyz/developers/docs/api/transfers#gettransfers): List transfers

### Verified Tokens

A curated, trusted list of TIP-20 tokens.

- [`GET /v1/verified-tokens`](https://tempo.xyz/developers/docs/api/verified-tokens#listverifiedtokens): List verified tokens
- [`GET /v1/verified-tokens/currencies`](https://tempo.xyz/developers/docs/api/verified-tokens#getverifiedtokencurrencies): List verified currencies
- [`GET /v1/tokenlist`](https://tempo.xyz/developers/docs/api/verified-tokens#gettokenlist): Get token list
- [`GET /v1/verified-tokens/{address}`](https://tempo.xyz/developers/docs/api/verified-tokens#getverifiedtoken): Get verified token

### Webhooks

Organization webhook subscriptions.

- [`GET /v1/webhooks`](https://tempo.xyz/developers/docs/api/webhooks#listwebhooks): List webhooks
- [`POST /v1/webhooks`](https://tempo.xyz/developers/docs/api/webhooks#createwebhook): Create webhook
- [`GET /v1/orgs/{orgId}/webhooks`](https://tempo.xyz/developers/docs/api/webhooks#listorgwebhooks): List webhooks
- [`POST /v1/orgs/{orgId}/webhooks`](https://tempo.xyz/developers/docs/api/webhooks#createorgwebhook): Create webhook
- [`GET /v1/webhooks/{id}`](https://tempo.xyz/developers/docs/api/webhooks#getwebhook): Get webhook
- [`PATCH /v1/webhooks/{id}`](https://tempo.xyz/developers/docs/api/webhooks#updatewebhook): Update webhook
- [`DELETE /v1/webhooks/{id}`](https://tempo.xyz/developers/docs/api/webhooks#deletewebhook): Delete webhook
- [`GET /v1/orgs/{orgId}/webhooks/{id}/deliveries/{deliveryId}`](https://tempo.xyz/developers/docs/api/webhooks#getorgwebhookdelivery): Get webhook delivery
- [`GET /v1/webhooks/event-types`](https://tempo.xyz/developers/docs/api/webhooks#getwebhookeventtypes): List webhook event types
- [`GET /v1/webhooks/{id}/deliveries`](https://tempo.xyz/developers/docs/api/webhooks#listwebhookdeliveries): List webhook deliveries
- [`GET /v1/orgs/{orgId}/webhooks/{id}/deliveries`](https://tempo.xyz/developers/docs/api/webhooks#listorgwebhookdeliveries): List webhook deliveries
- [`POST /v1/webhooks/{id}/ping`](https://tempo.xyz/developers/docs/api/webhooks#pingwebhook): Ping webhook
- [`PATCH /v1/orgs/{orgId}/webhooks/{id}`](https://tempo.xyz/developers/docs/api/webhooks#updateorgwebhook): Update webhook
- [`DELETE /v1/orgs/{orgId}/webhooks/{id}`](https://tempo.xyz/developers/docs/api/webhooks#deleteorgwebhook): Delete webhook
- [`POST /v1/webhooks/{id}/deliveries/{deliveryId}/retry`](https://tempo.xyz/developers/docs/api/webhooks#retrywebhookdelivery): Retry webhook delivery
- [`POST /v1/orgs/{orgId}/webhooks/{id}/deliveries/{deliveryId}/retry`](https://tempo.xyz/developers/docs/api/webhooks#retryorgwebhookdelivery): Retry webhook delivery
- [`POST event`](https://tempo.xyz/developers/docs/api/webhooks#receivewebhookevent): Webhook event delivery

### Zones

Private chain operations anchored to Tempo.

- [`GET /v1/zones/withdrawals/{senderTag}`](https://tempo.xyz/developers/docs/api/zones#listzonewithdrawals): List Zone withdrawals

### Indexer

Run read-only SQL queries against Tempo's indexed data.

- [`GET /v1/indexer/query`](https://tempo.xyz/developers/docs/api/indexer#indexerquery): Query indexed chain data

### RPC

Direct access to the chain over Ethereum JSON-RPC. Not part of the stable API contract; best-effort support only. No compatibility, latency, availability, or data-freshness guarantees. Breaking changes may happen with limited notice.

- [`POST /rpc`](https://tempo.xyz/developers/docs/api/rpc#admin_validatorkey): admin_validatorKey
- [`POST /rpc`](https://tempo.xyz/developers/docs/api/rpc#consensus_getfinalization): consensus_getFinalization
- [`POST /rpc`](https://tempo.xyz/developers/docs/api/rpc#consensus_getidentitytransitionproof): consensus_getIdentityTransitionProof
- [`POST /rpc`](https://tempo.xyz/developers/docs/api/rpc#consensus_getlatest): consensus_getLatest
- [`POST /rpc`](https://tempo.xyz/developers/docs/api/rpc#consensus_subscribe): consensus_subscribe
- [`POST /rpc`](https://tempo.xyz/developers/docs/api/rpc#consensus_unsubscribe): consensus_unsubscribe
- [`POST /rpc`](https://tempo.xyz/developers/docs/api/rpc#eth_blocknumber): eth_blockNumber
- [`POST /rpc`](https://tempo.xyz/developers/docs/api/rpc#eth_call): eth_call
- [`POST /rpc`](https://tempo.xyz/developers/docs/api/rpc#eth_chainid): eth_chainId
- [`POST /rpc`](https://tempo.xyz/developers/docs/api/rpc#eth_createaccesslist): eth_createAccessList
- [`POST /rpc`](https://tempo.xyz/developers/docs/api/rpc#eth_estimategas): eth_estimateGas
- [`POST /rpc`](https://tempo.xyz/developers/docs/api/rpc#eth_feehistory): eth_feeHistory
- [`POST /rpc`](https://tempo.xyz/developers/docs/api/rpc#eth_filltransaction): eth_fillTransaction
- [`POST /rpc`](https://tempo.xyz/developers/docs/api/rpc#eth_gasprice): eth_gasPrice
- [`POST /rpc`](https://tempo.xyz/developers/docs/api/rpc#eth_getblockaccesslist): eth_getBlockAccessList
- [`POST /rpc`](https://tempo.xyz/developers/docs/api/rpc#eth_getblockbyhash): eth_getBlockByHash
- [`POST /rpc`](https://tempo.xyz/developers/docs/api/rpc#eth_getblockbynumber): eth_getBlockByNumber
- [`POST /rpc`](https://tempo.xyz/developers/docs/api/rpc#eth_getblockreceipts): eth_getBlockReceipts
- [`POST /rpc`](https://tempo.xyz/developers/docs/api/rpc#eth_getblocktransactioncountbyhash): eth_getBlockTransactionCountByHash
- [`POST /rpc`](https://tempo.xyz/developers/docs/api/rpc#eth_getblocktransactioncountbynumber): eth_getBlockTransactionCountByNumber
- [`POST /rpc`](https://tempo.xyz/developers/docs/api/rpc#eth_getcode): eth_getCode
- [`POST /rpc`](https://tempo.xyz/developers/docs/api/rpc#eth_getfilterchanges): eth_getFilterChanges
- [`POST /rpc`](https://tempo.xyz/developers/docs/api/rpc#eth_getfilterlogs): eth_getFilterLogs
- [`POST /rpc`](https://tempo.xyz/developers/docs/api/rpc#eth_getlogs): eth_getLogs
- [`POST /rpc`](https://tempo.xyz/developers/docs/api/rpc#eth_getproof): eth_getProof
- [`POST /rpc`](https://tempo.xyz/developers/docs/api/rpc#eth_getstorageat): eth_getStorageAt
- [`POST /rpc`](https://tempo.xyz/developers/docs/api/rpc#eth_getstoragevalues): eth_getStorageValues
- [`POST /rpc`](https://tempo.xyz/developers/docs/api/rpc#eth_gettransactionbyblockhashandindex): eth_getTransactionByBlockHashAndIndex
- [`POST /rpc`](https://tempo.xyz/developers/docs/api/rpc#eth_gettransactionbyblocknumberandindex): eth_getTransactionByBlockNumberAndIndex
- [`POST /rpc`](https://tempo.xyz/developers/docs/api/rpc#eth_gettransactionbyhash): eth_getTransactionByHash
- [`POST /rpc`](https://tempo.xyz/developers/docs/api/rpc#eth_gettransactioncount): eth_getTransactionCount
- [`POST /rpc`](https://tempo.xyz/developers/docs/api/rpc#eth_gettransactionreceipt): eth_getTransactionReceipt
- [`POST /rpc`](https://tempo.xyz/developers/docs/api/rpc#eth_maxpriorityfeepergas): eth_maxPriorityFeePerGas
- [`POST /rpc`](https://tempo.xyz/developers/docs/api/rpc#eth_newblockfilter): eth_newBlockFilter
- [`POST /rpc`](https://tempo.xyz/developers/docs/api/rpc#eth_newfilter): eth_newFilter
- [`POST /rpc`](https://tempo.xyz/developers/docs/api/rpc#eth_newpendingtransactionfilter): eth_newPendingTransactionFilter
- [`POST /rpc`](https://tempo.xyz/developers/docs/api/rpc#eth_sendrawtransaction): eth_sendRawTransaction
- [`POST /rpc`](https://tempo.xyz/developers/docs/api/rpc#eth_sendrawtransactionsync): eth_sendRawTransactionSync
- [`POST /rpc`](https://tempo.xyz/developers/docs/api/rpc#eth_simulatev1): eth_simulateV1
- [`POST /rpc`](https://tempo.xyz/developers/docs/api/rpc#eth_syncing): eth_syncing
- [`POST /rpc`](https://tempo.xyz/developers/docs/api/rpc#eth_uninstallfilter): eth_uninstallFilter
- [`POST /rpc`](https://tempo.xyz/developers/docs/api/rpc#tempo_forkschedule): tempo_forkSchedule
- [`POST /rpc`](https://tempo.xyz/developers/docs/api/rpc#tempo_fundaddress): tempo_fundAddress
- [`POST /rpc/{chain}`](https://tempo.xyz/developers/docs/api/rpc#rpcrequestbychain): Call chain JSON-RPC

### CoinGecko

Exchange data in CoinGecko's GeckoTerminal format.

- [`GET /gecko/{chainId}/pairs`](https://tempo.xyz/developers/docs/api/coingecko#coingeckopairs): List trading pairs
- [`GET /gecko/{chainId}/events`](https://tempo.xyz/developers/docs/api/coingecko#coingeckoevents): List swap events
- [`GET /gecko/{chainId}/latest-block`](https://tempo.xyz/developers/docs/api/coingecko#coingeckolatestblock): Get latest indexed block
- [`GET /gecko/{chainId}/assets/{address}`](https://tempo.xyz/developers/docs/api/coingecko#coingeckoasset): Get asset
- [`GET /gecko/{chainId}/pairs/{pairId}`](https://tempo.xyz/developers/docs/api/coingecko#coingeckopair): Get trading pair

### Chains

Source chains and stablecoins supported by Routes.

- [`GET /v1/routes/chains`](https://tempo.xyz/developers/docs/api/routes/chains#getrouteschains): Get chains

### Deposit Addresses

Reusable route addresses and deposits detected at those addresses.

- [`GET /v1/routes/deposit-addresses`](https://tempo.xyz/developers/docs/api/routes/deposit-addresses#listroutesdepositaddresses): List deposit addresses
- [`POST /v1/routes/deposit-addresses`](https://tempo.xyz/developers/docs/api/routes/deposit-addresses#createroutesdepositaddress): Create deposit address
- [`POST /v1/routes/deposit-addresses/{id}/reconcile`](https://tempo.xyz/developers/docs/api/routes/deposit-addresses#reconcileroutesdepositaddress): Reconcile deposit address
- [`GET /v1/routes/deposit-addresses/{id}`](https://tempo.xyz/developers/docs/api/routes/deposit-addresses#getroutesdepositaddress): Get deposit address
- [`GET /v1/routes/deposits/{id}`](https://tempo.xyz/developers/docs/api/routes/deposit-addresses#getroutesdeposit): Get deposit
- [`GET /v1/routes/deposits`](https://tempo.xyz/developers/docs/api/routes/deposit-addresses#listroutesdeposits): List deposits

### Providers

Providers available through Routes.

- [`GET /v1/routes/providers`](https://tempo.xyz/developers/docs/api/routes/providers#getroutesproviders): Get providers

### Quotes

Live quotes for routing assets between supported chains.

- [`GET /v1/routes/quotes`](https://tempo.xyz/developers/docs/api/routes/quotes#quoteroutes): Get quotes

### Transfers

Transfers routed between supported chains.

- [`POST /v1/routes/transfers/{id}/source-transactions`](https://tempo.xyz/developers/docs/api/routes/transfers#registerroutestransfersourcetransaction): Register source transaction
- [`GET /v1/routes/transfers`](https://tempo.xyz/developers/docs/api/routes/transfers#listroutestransfers): List transfers
- [`POST /v1/routes/transfers`](https://tempo.xyz/developers/docs/api/routes/transfers#createroutestransfer): Create transfer
- [`POST /v1/routes/transfers/vault`](https://tempo.xyz/developers/docs/api/routes/transfers#createroutestransfervault): Create transfer into vault
- [`POST /v1/routes/transfers/zone`](https://tempo.xyz/developers/docs/api/routes/transfers#createroutestransferzone): Create transfer into zone
- [`GET /v1/routes/transfers/{id}`](https://tempo.xyz/developers/docs/api/routes/transfers#getroutestransfer): Get transfer

### API Keys

Credentials for accessing the Tempo API.

- [`GET /v1/scopes`](https://tempo.xyz/developers/docs/api/api-keys#getscopes): List scopes
- [`GET /v1/orgs/{orgId}/api-keys`](https://tempo.xyz/developers/docs/api/api-keys#listorgapikeys): List organization API keys
- [`GET /v1/orgs/{orgId}/projects/{projectId}/api-keys`](https://tempo.xyz/developers/docs/api/api-keys#listapikeys): List API keys
- [`POST /v1/orgs/{orgId}/projects/{projectId}/api-keys`](https://tempo.xyz/developers/docs/api/api-keys#createapikey): Create API key
- [`DELETE /v1/orgs/{orgId}/api-keys/{keyId}`](https://tempo.xyz/developers/docs/api/api-keys#revokeorgapikey): Revoke organization API key
- [`POST /v1/orgs/{orgId}/api-keys/{keyId}/rotate`](https://tempo.xyz/developers/docs/api/api-keys#rotateorgapikey): Rotate organization API key
- [`PATCH /v1/orgs/{orgId}/projects/{projectId}/api-keys/{keyId}`](https://tempo.xyz/developers/docs/api/api-keys#updateapikey): Update API key
- [`DELETE /v1/orgs/{orgId}/projects/{projectId}/api-keys/{keyId}`](https://tempo.xyz/developers/docs/api/api-keys#revokeapikey): Revoke API key
- [`POST /v1/orgs/{orgId}/projects/{projectId}/api-keys/{keyId}/rotate`](https://tempo.xyz/developers/docs/api/api-keys#rotateapikey): Rotate API key

### Billing

Organization billing backed by Stripe.

- [`GET /v1/orgs/{orgId}/billing`](https://tempo.xyz/developers/docs/api/billing#getbilling): Get billing
- [`PATCH /v1/orgs/{orgId}/billing`](https://tempo.xyz/developers/docs/api/billing#updatebilling): Update billing
- [`GET /v1/orgs/{orgId}/billing/payment-methods`](https://tempo.xyz/developers/docs/api/billing#getbillingpaymentmethods): Get payment methods
- [`POST /v1/orgs/{orgId}/billing/stripe/checkout`](https://tempo.xyz/developers/docs/api/billing#createstripecheckout): Create checkout session
- [`POST /v1/orgs/{orgId}/billing/stripe/manage`](https://tempo.xyz/developers/docs/api/billing#createstripemanage): Create manage session
- [`GET /v1/orgs/{orgId}/billing/invoice-preview`](https://tempo.xyz/developers/docs/api/billing#getbillinginvoicepreview): Preview billing invoice
- [`DELETE /v1/orgs/{orgId}/billing/payment-methods/{methodId}`](https://tempo.xyz/developers/docs/api/billing#deletebillingpaymentmethod): Remove payment method

### Faucet

Test token routes for Tempo testnet accounts.

- [`POST /v1/orgs/{orgId}/faucet`](https://tempo.xyz/developers/docs/api/faucet#fundtestnetaccount): Fund testnet account

### Invitations

Pending organization invitations.

- [`GET /v1/invitations`](https://tempo.xyz/developers/docs/api/invitations#listmyinvitations): List my invitations
- [`GET /v1/orgs/{orgId}/invitations`](https://tempo.xyz/developers/docs/api/invitations#listinvitations): List invitations
- [`POST /v1/orgs/{orgId}/invitations`](https://tempo.xyz/developers/docs/api/invitations#createinvitation): Create invitation
- [`POST /v1/invitations/{invitationId}/accept`](https://tempo.xyz/developers/docs/api/invitations#acceptinvitation): Accept invitation
- [`POST /v1/invitations/{invitationId}/decline`](https://tempo.xyz/developers/docs/api/invitations#declineinvitation): Decline invitation
- [`DELETE /v1/orgs/{orgId}/invitations/{invitationId}`](https://tempo.xyz/developers/docs/api/invitations#revokeinvitation): Revoke invitation

### Invite Links

Reusable organization invite links.

- [`GET /v1/orgs/{orgId}/invite-links/{inviteLinkId}/redemptions`](https://tempo.xyz/developers/docs/api/invite-links#listinvitelinkredemptions): List link redemptions
- [`GET /v1/orgs/{orgId}/invite-links`](https://tempo.xyz/developers/docs/api/invite-links#listinvitelinks): List invite links
- [`POST /v1/orgs/{orgId}/invite-links`](https://tempo.xyz/developers/docs/api/invite-links#createinvitelink): Create invite link
- [`POST /v1/invite-links/resolve`](https://tempo.xyz/developers/docs/api/invite-links#resolveinvitelink): Resolve invite link
- [`POST /v1/invite-links/accept`](https://tempo.xyz/developers/docs/api/invite-links#acceptinvitelink): Accept invite link
- [`PATCH /v1/orgs/{orgId}/invite-links/{inviteLinkId}`](https://tempo.xyz/developers/docs/api/invite-links#updateinvitelink): Update invite link
- [`DELETE /v1/orgs/{orgId}/invite-links/{inviteLinkId}`](https://tempo.xyz/developers/docs/api/invite-links#deleteinvitelink): Delete invite link

### Members

Organization team membership.

- [`GET /v1/orgs/{orgId}/members`](https://tempo.xyz/developers/docs/api/members#listmembers): List members
- [`PATCH /v1/orgs/{orgId}/members/{userId}`](https://tempo.xyz/developers/docs/api/members#updatemember): Update member
- [`DELETE /v1/orgs/{orgId}/members/{userId}`](https://tempo.xyz/developers/docs/api/members#removemember): Remove member

### Organizations

Teams that own application workspaces and members.

- [`GET /v1/orgs`](https://tempo.xyz/developers/docs/api/organizations#listorganizations): List organizations
- [`POST /v1/orgs`](https://tempo.xyz/developers/docs/api/organizations#createorganization): Create organization
- [`GET /v1/orgs/{orgId}`](https://tempo.xyz/developers/docs/api/organizations#getorganization): Get organization
- [`PATCH /v1/orgs/{orgId}`](https://tempo.xyz/developers/docs/api/organizations#updateorganization): Update organization
- [`DELETE /v1/orgs/{orgId}`](https://tempo.xyz/developers/docs/api/organizations#deleteorganization): Delete organization

### Projects

Application workspaces within an organization.

- [`GET /v1/orgs/{orgId}/projects`](https://tempo.xyz/developers/docs/api/projects#listprojects): List projects
- [`POST /v1/orgs/{orgId}/projects`](https://tempo.xyz/developers/docs/api/projects#createproject): Create project
- [`GET /v1/orgs/{orgId}/projects/{projectId}`](https://tempo.xyz/developers/docs/api/projects#getproject): Get project
- [`PATCH /v1/orgs/{orgId}/projects/{projectId}`](https://tempo.xyz/developers/docs/api/projects#updateproject): Update project
- [`DELETE /v1/orgs/{orgId}/projects/{projectId}`](https://tempo.xyz/developers/docs/api/projects#deleteproject): Delete project

### Usage

Request and sponsorship usage for organizations.

- [`GET /v1/orgs/{orgId}/usage/requests`](https://tempo.xyz/developers/docs/api/usage#getrequestusage): Get request usage
- [`GET /v1/orgs/{orgId}/usage/sponsorships`](https://tempo.xyz/developers/docs/api/usage#getsponsorshipusage): Get sponsorship usage

### Users

Users on the Tempo Platform.

- [`GET /v1/me`](https://tempo.xyz/developers/docs/api/users#getme): Get current user

### Verified Token Requests

Organization requests to add tokens to the curated verified list.

- [`GET /v1/orgs/{orgId}/verified-token-requests`](https://tempo.xyz/developers/docs/api/verified-token-requests#listverifiedtokenrequests): List token requests
- [`POST /v1/orgs/{orgId}/verified-token-requests`](https://tempo.xyz/developers/docs/api/verified-token-requests#createverifiedtokenrequest): Create token request
- [`DELETE /v1/orgs/{orgId}/verified-token-requests/{requestId}`](https://tempo.xyz/developers/docs/api/verified-token-requests#cancelverifiedtokenrequest): Cancel token request

### MPP

Submit completed MPP credentials to Tempo. Validate checks a credential without settling it; Broadcast validates, screens, and submits it. Both require `mpp:write`.

- [`POST /v1/mpp/validate`](https://tempo.xyz/developers/docs/api/mpp#validatemppcredential): Validate MPP credential
- [`POST /v1/mpp/broadcast`](https://tempo.xyz/developers/docs/api/mpp#broadcastmppcredential): Broadcast MPP credential

### MCP

A hosted Model Context Protocol server: the data domain and Tempo docs exposed as tools.

- [`POST /mcp`](https://tempo.xyz/developers/docs/api/mcp#mcprequest): Call MCP

### Authentication

Authenticate into the Tempo Platform.

- [`POST /v1/auth/siwe/challenge`](https://tempo.xyz/developers/docs/api/authentication#createsiwechallenge): Create challenge (SIWE)
- [`POST /v1/auth/siwe`](https://tempo.xyz/developers/docs/api/authentication#verifysiwe): Authenticate (SIWE)
- [`POST /v1/auth/identity`](https://tempo.xyz/developers/docs/api/authentication#verifyidentity): Authenticate identity
- [`POST /v1/auth/logout`](https://tempo.xyz/developers/docs/api/authentication#logout): Sign out
