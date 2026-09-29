// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {OAppReceiver, Origin} from "@layerzerolabs/oapp-evm/contracts/oapp/OAppReceiver.sol";
import {OAppCore} from "@layerzerolabs/oapp-evm/contracts/oapp/OAppCore.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ITIP20} from "tempo-std/interfaces/ITIP20.sol";
import {StockSyncCodec as C} from "../common/StockSyncCodec.sol";
import {SyncFlags} from "../common/BridgeTypes.sol";
import {ScaledUIView} from "./ScaledUIView.sol";

/// @title StockSyncReceiver — applies Robinhood corporate-action snapshots to the Tempo mirrors (plan B.1.4, ST-05).
/// @notice One per network. Peers: mainnet 30416 → StockSyncSender; testnet 40245 → StockSyncForwarder (payload
///         unchanged, so `srcChainId` is still the Robinhood chain). Never reverts on content: wrong source chain,
///         malformed bytes, unknown tokens, stale or duplicate records are ignored with an event. A record applies iff
///         its `(srcTimestamp, seq)` key beats the last applied key for that (mirror, record type). Each mirror's state
///         sits in three slots pre-warmed by `bindToken`, so a sync costs ~5k per slot on Tempo instead of 250k.
contract StockSyncReceiver is OAppReceiver {
    struct TokenSync {
        uint128 current; // slot 1
        uint128 pending;
        uint64 effectiveAt; // slot 2
        uint64 syncedAt; // srcTimestamp of the last applied MULTIPLIER record (1 = never)
        uint64 statusAt; // srcTimestamp of the last applied STATUS record (1 = never)
        uint8 flags;
        uint128 lastMultKey; // slot 3
        uint128 lastStatusKey;
    }

    enum Ignore {
        WRONG_CHAIN,
        MALFORMED,
        UNKNOWN_TOKEN,
        STALE
    }

    uint256 public immutable srcChainId;
    bool public autoPause;
    mapping(address rhToken => address mirror) public mirrorOf;
    mapping(address mirror => ScaledUIView) public viewOf;
    mapping(address mirror => TokenSync) internal _sync;

    event TokenBound(address indexed rhToken, address indexed mirror, address uiView);
    event MultiplierSynced(address indexed mirror, uint128 current, uint128 pending, uint64 effectiveAt, uint128 key);
    event StatusSynced(address indexed mirror, uint8 flags, uint128 key);
    event SyncIgnored(bytes32 indexed guid, address indexed rhToken, Ignore reason);
    event AutoPauseSet(bool enabled);
    event AutoPauseAttempted(address indexed mirror, bool paused);

    error NotBound(address mirror);

    constructor(address endpoint_, address owner_, uint256 srcChainId_) OAppCore(endpoint_, owner_) Ownable(owner_) {
        srcChainId = srcChainId_;
    }

    // ─── admin ───────────────────────────────────────────────────────────

    /// @notice Binds a Robinhood token to its mirror and ScaledUIView, pre-warming the mirror's three slots.
    function bindToken(address rhToken, address mirror, ScaledUIView view_) external onlyOwner {
        mirrorOf[rhToken] = mirror;
        viewOf[mirror] = view_;
        TokenSync storage s = _sync[mirror];
        if (s.lastMultKey == 0) {
            s.current = 1e18;
            s.pending = 1e18;
            s.effectiveAt = 1;
            s.syncedAt = 1;
            s.statusAt = 1;
            s.lastMultKey = 1;
            s.lastStatusKey = 1;
        }
        emit TokenBound(rhToken, mirror, address(view_));
    }

    /// @notice Q-010 default false: a Robinhood pause is displayed only. When true the receiver tries `mirror.pause()`
    ///         (it needs PAUSE_ROLE); a failed attempt never reverts the sync.
    function setAutoPause(bool enabled) external onlyOwner {
        autoPause = enabled;
        emit AutoPauseSet(enabled);
    }

    // ─── receive ─────────────────────────────────────────────────────────

    function validateMessage(bytes calldata m) external pure returns (C.Header memory) {
        return C.validate(m);
    }

    function _lzReceive(Origin calldata, bytes32 guid, bytes calldata message, address, bytes calldata)
        internal
        override
    {
        C.Header memory h;
        try this.validateMessage(message) returns (C.Header memory parsed) {
            h = parsed;
        } catch {
            emit SyncIgnored(guid, address(0), Ignore.MALFORMED);
            return;
        }
        if (h.srcChainId != srcChainId) {
            emit SyncIgnored(guid, address(0), Ignore.WRONG_CHAIN);
            return;
        }
        uint128 key = C.orderingKey(h.srcTimestamp, h.seq);
        uint256 offset = C.HEADER_LEN;
        for (uint256 i; i < h.count; i++) {
            (uint8 t, uint256 next) = C.recordAt(message, offset);
            if (t == C.T_MULTIPLIER) _applyMultiplier(guid, C.decodeMultiplier(message, offset), key, h.srcTimestamp);
            else _applyStatus(guid, C.decodeStatus(message, offset), key, h.srcTimestamp);
            offset = next;
        }
    }

    function _applyMultiplier(bytes32 guid, C.Multiplier memory r, uint128 key, uint64 srcTs) internal {
        address mirror = mirrorOf[r.rhToken];
        if (mirror == address(0)) return _ignore(guid, r.rhToken, Ignore.UNKNOWN_TOKEN);
        TokenSync storage s = _sync[mirror];
        if (key <= s.lastMultKey) return _ignore(guid, r.rhToken, Ignore.STALE);
        bool changed = s.current != r.current || s.pending != r.pending || s.effectiveAt != r.effectiveAt;
        uint256 before = uiMultiplierOf(mirror);
        bool supersedes = changed && s.effectiveAt > block.timestamp && s.syncedAt > 1
            && (s.pending != r.pending || s.effectiveAt != r.effectiveAt);
        (uint128 oldPending, uint64 oldAt) = (s.pending, s.effectiveAt);
        s.current = r.current;
        s.pending = r.pending;
        s.effectiveAt = r.effectiveAt;
        s.syncedAt = srcTs;
        s.lastMultKey = key;
        emit MultiplierSynced(mirror, r.current, r.pending, r.effectiveAt, key);
        if (!changed) return; // e.g. Robinhood re-sending CRWD's split: idempotent, no ERC-8056 event
        ScaledUIView v = viewOf[mirror];
        if (address(v) == address(0)) return;
        if (supersedes) v.notifyCancelled(oldPending, oldAt);
        v.notifyUpdated(before, r.pending, r.effectiveAt);
    }

    function _applyStatus(bytes32 guid, C.Status memory r, uint128 key, uint64 srcTs) internal {
        address mirror = mirrorOf[r.rhToken];
        if (mirror == address(0)) return _ignore(guid, r.rhToken, Ignore.UNKNOWN_TOKEN);
        TokenSync storage s = _sync[mirror];
        if (key <= s.lastStatusKey) return _ignore(guid, r.rhToken, Ignore.STALE);
        s.flags = r.flags;
        s.statusAt = srcTs;
        s.lastStatusKey = key;
        emit StatusSynced(mirror, r.flags, key);
        if (autoPause && SyncFlags.isPaused(r.flags)) {
            bool paused;
            try ITIP20(mirror).pause() {
                paused = true;
            } catch {}
            emit AutoPauseAttempted(mirror, paused);
        }
    }

    function _ignore(bytes32 guid, address rhToken, Ignore reason) internal {
        emit SyncIgnored(guid, rhToken, reason);
    }

    // ─── views ───────────────────────────────────────────────────────────

    /// @notice The multiplier in effect now: the pending value once `effectiveAt` has passed (Robinhood's semantics).
    function uiMultiplierOf(address mirror) public view returns (uint256) {
        TokenSync storage s = _sync[mirror];
        if (s.lastMultKey == 0) revert NotBound(mirror);
        return block.timestamp >= s.effectiveAt ? s.pending : s.current;
    }

    function pendingOf(address mirror) external view returns (uint256 pending, uint256 effectiveAt) {
        TokenSync storage s = _sync[mirror];
        if (s.lastMultKey == 0) revert NotBound(mirror);
        return (s.pending, s.effectiveAt);
    }

    function flagsOf(address mirror) external view returns (uint8) {
        return _sync[mirror].flags;
    }

    function syncOf(address mirror) external view returns (TokenSync memory) {
        return _sync[mirror];
    }

    /// @notice True when a multiplier snapshot read on Robinhood at most `maxAge` seconds ago has been applied.
    function isSynced(address mirror, uint256 maxAge) external view returns (bool) {
        uint64 at = _sync[mirror].syncedAt;
        return at > 1 && block.timestamp <= uint256(at) + maxAge;
    }
}
