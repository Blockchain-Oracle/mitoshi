/**
 * ABI fragments the generated clients don't carry yet (S14w; D-227 R4-12). `pnpm codegen` emits an ABI only for a
 * contract some deployment fragment records, and nothing is deployed on Robinhood testnet 46630 yet — so the lockbox
 * and sync-sender functions the bridge calls are declared here, copied from `contracts/src/robinhood/*.sol`. The OFT
 * calls (`quoteOFT`, `quoteSend`, `send`) are IOFT's and come from the generated `TransitOFT` ABI. When the 46630
 * fragment lands, codegen writes `StockLockbox`/`StockSyncSender` and these can be swapped for the generated ones.
 */
import { parseAbi } from "viem";

/** contracts/src/robinhood/StockLockbox.sol — the views and exits beyond IOFT. */
export const lockboxExtraAbi = parseAbi([
  "function token() view returns (address)",
  "function locksPaused() view returns (bool)",
  "function minLockLD() view returns (uint256)",
  "function owed(address) view returns (uint256)",
  "function totalOwed() view returns (uint256)",
  "function outstanding(uint32) view returns (uint256)",
  "function totalOutstanding() view returns (uint256)",
  "function outboundLimit(uint32 eid) view returns (uint128 capacity, uint256 inFlight, uint256 available, uint64 window)",
  "function reserveView() view returns (uint256 locked, uint256 outstandingLD, uint256 owedLD)",
  "function peers(uint32) view returns (bytes32)",
  "function claim()",
  "event UnlockDeferred(address indexed to, uint32 indexed srcEid, uint256 amountLD, bytes reason)",
  "event OwedClaimed(address indexed to, uint256 amountLD)",
]);

/** contracts/src/robinhood/StockSyncSender.sol — the permissionless corporate-action push. */
export const stockSyncSenderAbi = parseAbi([
  "function seq() view returns (uint64)",
  "function lockboxOf(address) view returns (address)",
  "function quoteSync(address[] stocks, uint32 dstEid) view returns ((uint256 nativeFee, uint256 lzTokenFee))",
  "function sync(address[] stocks, uint32 dstEid) payable returns ((bytes32 guid, uint64 nonce, (uint256 nativeFee, uint256 lzTokenFee) fee))",
  "event Synced(bytes32 indexed guid, uint32 indexed dstEid, uint64 seq, uint256 tokens)",
]);

/** The Robinhood Stock Token's ERC-8056 face (what StockSyncSender reads). */
export const scaledUiAbi = parseAbi([
  "function uiMultiplier() view returns (uint256)",
  "function newUIMultiplier() view returns (uint256)",
  "function effectiveAt() view returns (uint256)",
]);

/** TIP-20 roles (tempo-std ITIP20RolesAuth): `hasRole` and the membership event the reserve check scans. */
export const tip20RolesAbi = parseAbi([
  "function hasRole(address account, bytes32 role) view returns (bool)",
  "event RoleMembershipUpdated(bytes32 indexed role, address indexed account, address indexed sender, bool hasRole)",
]);

/** LayerZero EndpointV2: re-running a stored compose (`HopComposer` reverted on an empty float) and its record. */
export const endpointComposeAbi = parseAbi([
  "function composeQueue(address from, address to, bytes32 guid, uint16 index) view returns (bytes32 messageHash)",
  "function lzCompose(address from, address to, bytes32 guid, uint16 index, bytes message, bytes extraData) payable",
  "event ComposeSent(address from, address to, bytes32 guid, uint16 index, bytes message)",
]);
