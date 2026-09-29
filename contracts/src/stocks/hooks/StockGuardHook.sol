// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {BaseHook} from "@openzeppelin/uniswap-hooks/base/BaseHook.sol";
import {Ownable, Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {IPoolManager} from "v4-core/interfaces/IPoolManager.sol";
import {Hooks} from "v4-core/libraries/Hooks.sol";
import {LPFeeLibrary} from "v4-core/libraries/LPFeeLibrary.sol";
import {StateLibrary} from "v4-core/libraries/StateLibrary.sol";
import {PoolKey} from "v4-core/types/PoolKey.sol";
import {PoolId} from "v4-core/types/PoolId.sol";
import {Currency} from "v4-core/types/Currency.sol";
import {BalanceDelta} from "v4-core/types/BalanceDelta.sol";
import {BeforeSwapDelta, BeforeSwapDeltaLibrary} from "v4-core/types/BeforeSwapDelta.sol";
import {SwapParams} from "v4-core/types/PoolOperation.sol";
import {ITIP20} from "tempo-std/interfaces/ITIP20.sol";
import {SyncFlags} from "../../common/BridgeTypes.sol";
import {IThemePoolGuard} from "../../themes/interfaces/IThemePoolGuard.sol";
import {IThemeOracle} from "../../themes/interfaces/IThemeOracle.sol";
import {IStockReference, Ref, RefSource, SessionState} from "../interfaces/IStockReference.sol";
import {IStockSyncView} from "../interfaces/IStockSyncView.sol";
import {GuardMath} from "../libs/GuardMath.sol";
import {GuardTypes as T} from "./GuardTypes.sol";

/// @title StockGuardHook — keeps every guarded `(pathUSD, mirror)` pool inside a band around the reference (plan B.3.3).
/// @notice Flags 0x20C0 = beforeInitialize + beforeSwap + afterSwap (D-022; the router passes extreme price limits, so
///         only an after-swap check can bound the post-swap price). No liquidity hooks: adding and removing liquidity
///         are never blocked, so exits are always open. Static fee, no return deltas.
///         - `beforeInitialize`: the pool is registered and its first price is inside the CLOSED band.
///         - `beforeSwap`: not halted · multiplier synced · not issuer-paused · not oracle-paused · mirror not paused ·
///           outside the corporate-action window · session → band + max age (CLOSED/UNKNOWN: REFUSE, or WIDEN to the
///           closed band) · reference fresh · verified source when required; stores (lo, hi, pre) transiently.
///         - `afterSwap`: `GuardMath.allowed(pre, post, lo, hi)` or `OutOfBand`.
///         Reference price = share × `uiMultiplier` (× never ÷). It also serves the themes contracts: `isGuardedPool`
///         (ThemeRegistry, D-101) and `IThemeOracle` (ThemeRouter, D-102) over the same checks.
contract StockGuardHook is BaseHook, Ownable2Step, IThemePoolGuard, IThemeOracle {
    using StateLibrary for IPoolManager;

    address public constant PATH_USD = 0x20C0000000000000000000000000000000000000;
    bytes32 internal constant TSLOT = keccak256("cwf.StockGuardHook.swap");

    IStockReference public immutable stockReference;
    IStockSyncView public immutable sync;

    mapping(PoolId => T.Guard) internal _guards;
    mapping(address mirror => PoolId) public poolOf;

    event PoolRegistered(PoolId indexed id, address indexed mirror);
    event GuardSet(PoolId indexed id, T.GuardParams params);

    error BadPoolKey();
    error AlreadyRegistered(address mirror);
    error NotRegistered(PoolId id);
    error Halted(address mirror);
    error NoReference(address mirror);
    error MultiplierUnsynced(address mirror);
    error IssuerPaused(address mirror);
    error OraclePaused(address mirror);
    error MirrorPaused(address mirror);
    error CorporateActionWindow(address mirror, uint256 effectiveAt);
    error MarketClosed(SessionState session);
    error StaleReference(uint64 observedAt, uint32 maxAge);
    error UnverifiedReference(RefSource source);
    error InitOutOfBand(uint160 sqrtPriceX96, uint160 lo, uint160 hi);
    error OutOfBand(uint160 pre, uint160 post, uint160 lo, uint160 hi);

    constructor(IPoolManager pm, IStockReference stockReference_, IStockSyncView sync_, address owner_)
        BaseHook(pm)
        Ownable(owner_)
    {
        stockReference = stockReference_;
        sync = sync_;
    }

    function getHookPermissions() public pure override returns (Hooks.Permissions memory p) {
        p.beforeInitialize = true;
        p.beforeSwap = true;
        p.afterSwap = true;
    }

    // ─── owner ───────────────────────────────────────────────────────────

    /// @notice Registers `(pathUSD, mirror, static fee, spacing, this)` with its guard (one pool per mirror).
    function registerPool(PoolKey calldata key, T.GuardParams calldata p) external onlyOwner {
        address mirror = Currency.unwrap(key.currency1);
        if (
            Currency.unwrap(key.currency0) != PATH_USD || mirror == PATH_USD || address(key.hooks) != address(this)
                || LPFeeLibrary.isDynamicFee(key.fee)
        ) revert BadPoolKey();
        PoolId id = key.toId();
        if (_guards[id].registered || _guards[poolOf[mirror]].registered) revert AlreadyRegistered(mirror);
        T.validate(p);
        _guards[id] = T.fromParams(mirror, p);
        poolOf[mirror] = id;
        emit PoolRegistered(id, mirror);
        emit GuardSet(id, p);
    }

    /// @notice Retunes a registered pool's guard (bands ≤ 2,000 bps). There is no unregister.
    function setGuard(PoolId id, T.GuardParams calldata p) external onlyOwner {
        T.Guard storage g = _guards[id];
        if (!g.registered) revert NotRegistered(id);
        T.validate(p);
        _guards[id] = T.fromParams(g.mirror, p);
        emit GuardSet(id, p);
    }

    // ─── hook callbacks ──────────────────────────────────────────────────

    function _beforeInitialize(address, PoolKey calldata key, uint160 sqrtPriceX96) internal view override returns (bytes4) {
        T.Guard memory g = _registered(key.toId());
        Ref memory r = stockReference.read(g.mirror);
        if (r.priceE18 == 0) revert NoReference(g.mirror);
        _checkFreshAndVerified(g, r, g.maxAgeClosed);
        uint256 price = GuardMath.tokenPriceE18(r.priceE18, sync.uiMultiplierOf(g.mirror));
        (uint160 lo, uint160 hi) = GuardMath.band(price, g.bandClosedBps);
        if (sqrtPriceX96 < lo || sqrtPriceX96 > hi) revert InitOutOfBand(sqrtPriceX96, lo, hi);
        return this.beforeInitialize.selector;
    }

    function _beforeSwap(address, PoolKey calldata key, SwapParams calldata, bytes calldata)
        internal
        override
        returns (bytes4, BeforeSwapDelta, uint24)
    {
        PoolId id = key.toId();
        T.Guard memory g = _registered(id);
        (uint160 lo, uint160 hi) = _bandOrRevert(g);
        (uint160 pre,,,) = poolManager.getSlot0(id);
        bytes32 s = _slot(id);
        assembly ("memory-safe") {
            tstore(s, lo)
            tstore(add(s, 1), hi)
            tstore(add(s, 2), pre)
        }
        return (this.beforeSwap.selector, BeforeSwapDeltaLibrary.ZERO_DELTA, 0);
    }

    function _afterSwap(address, PoolKey calldata key, SwapParams calldata, BalanceDelta, bytes calldata)
        internal
        override
        returns (bytes4, int128)
    {
        PoolId id = key.toId();
        bytes32 s = _slot(id);
        uint160 lo;
        uint160 hi;
        uint160 pre;
        assembly ("memory-safe") {
            lo := tload(s)
            hi := tload(add(s, 1))
            pre := tload(add(s, 2))
        }
        (uint160 post,,,) = poolManager.getSlot0(id);
        if (!GuardMath.allowed(pre, post, lo, hi)) revert OutOfBand(pre, post, lo, hi);
        return (this.afterSwap.selector, 0);
    }

    // ─── checks ──────────────────────────────────────────────────────────

    /// The beforeSwap order of B.3.3; returns the band the swap must end in (or move toward).
    function _bandOrRevert(T.Guard memory g) internal view returns (uint160 lo, uint160 hi) {
        Ref memory r = stockReference.read(g.mirror);
        _revertIfBlocked(g, r);
        SessionState session = stockReference.currentSession();
        (uint16 bps, uint32 maxAge, bool open) = T.sessionRule(g, session);
        if (!open) revert MarketClosed(session);
        _checkFreshAndVerified(g, r, maxAge);
        return GuardMath.band(GuardMath.tokenPriceE18(r.priceE18, sync.uiMultiplierOf(g.mirror)), bps);
    }

    function _revertIfBlocked(T.Guard memory g, Ref memory r) internal view {
        (T.Block b, uint256 at) = _blocker(g, r);
        if (b == T.Block.NONE) return;
        address m = g.mirror;
        if (b == T.Block.HALTED) revert Halted(m);
        if (b == T.Block.NO_REFERENCE) revert NoReference(m);
        if (b == T.Block.UNSYNCED) revert MultiplierUnsynced(m);
        if (b == T.Block.ISSUER_PAUSED) revert IssuerPaused(m);
        if (b == T.Block.ORACLE_PAUSED) revert OraclePaused(m);
        if (b == T.Block.MIRROR_PAUSED) revert MirrorPaused(m);
        revert CorporateActionWindow(m, at);
    }

    /// The first state-based reason the mirror can't trade (NONE if it can), in B.3.3 order.
    function _blocker(T.Guard memory g, Ref memory r) internal view returns (T.Block, uint256 effectiveAt) {
        if (r.halted) return (T.Block.HALTED, 0);
        if (r.priceE18 == 0) return (T.Block.NO_REFERENCE, 0);
        if (!sync.isSynced(g.mirror, g.maxSyncAge)) return (T.Block.UNSYNCED, 0);
        uint8 flags = sync.flagsOf(g.mirror);
        if (SyncFlags.isPaused(flags)) return (T.Block.ISSUER_PAUSED, 0);
        if (flags & SyncFlags.ORACLE_PAUSED != 0) return (T.Block.ORACLE_PAUSED, 0);
        if (ITIP20(g.mirror).paused()) return (T.Block.MIRROR_PAUSED, 0);
        (, effectiveAt) = sync.pendingOf(g.mirror);
        if (T.inWindow(effectiveAt, g.caWindow)) return (T.Block.CA_WINDOW, effectiveAt);
        return (T.Block.NONE, 0);
    }

    function _checkFreshAndVerified(T.Guard memory g, Ref memory r, uint32 maxAge) internal view {
        if (block.timestamp > uint256(r.observedAt) + maxAge) revert StaleReference(r.observedAt, maxAge);
        if (g.requireVerified && r.source != RefSource.REDSTONE && r.source != RefSource.DATASTREAMS) {
            revert UnverifiedReference(r.source);
        }
    }

    function _registered(PoolId id) internal view returns (T.Guard memory g) {
        g = _guards[id];
        if (!g.registered) revert NotRegistered(id);
    }

    function _slot(PoolId id) internal pure returns (bytes32) {
        return keccak256(abi.encode(TSLOT, id));
    }

    // ─── views (UI, themes) ──────────────────────────────────────────────

    function guardOf(PoolId id) external view returns (T.Guard memory) {
        return _guards[id];
    }

    /// @inheritdoc IThemePoolGuard
    function isGuardedPool(PoolKey calldata key) external view returns (bool) {
        return address(key.hooks) == address(this) && _guards[key.toId()].registered;
    }

    /// @notice What a swap on `mirror`'s pool faces right now, without reverting: the token price (share × m), the
    ///         band in sqrt prices, the session, whether the session allows trading, and the first blocking reason.
    function bandNow(address mirror)
        external
        view
        returns (uint256 tokenPriceE18, uint160 lo, uint160 hi, SessionState session, bool open, T.Block blocker)
    {
        T.Guard memory g = _guards[poolOf[mirror]];
        if (!g.registered) return (0, 0, 0, SessionState.UNKNOWN, false, T.Block.NO_POOL);
        Ref memory r = stockReference.read(mirror);
        (blocker,) = _blocker(g, r);
        session = stockReference.currentSession();
        uint16 bps;
        (bps,, open) = T.sessionRule(g, session);
        if (r.priceE18 == 0) return (0, 0, 0, session, open, blocker);
        tokenPriceE18 = GuardMath.tokenPriceE18(r.priceE18, sync.uiMultiplierOf(mirror));
        (lo, hi) = GuardMath.band(tokenPriceE18, bps);
    }

    /// @inheritdoc IThemeOracle
    /// @dev `halted` = any state-based block (keeper halt, no reference, unsynced multiplier, issuer/oracle/mirror
    ///      pause, corporate-action window) or no guarded pool; session and age are the router's own checks.
    function tokenPrice(address mirror) external view returns (uint256 usdPerTokenE18, uint64 observedAt, bool halted) {
        T.Guard memory g = _guards[poolOf[mirror]];
        if (!g.registered) return (0, 0, true);
        Ref memory r = stockReference.read(mirror);
        (T.Block b,) = _blocker(g, r);
        if (r.priceE18 == 0) return (0, 0, true);
        return (GuardMath.tokenPriceE18(r.priceE18, sync.uiMultiplierOf(mirror)), r.observedAt, b != T.Block.NONE);
    }

    /// @inheritdoc IThemeOracle
    function currentSession() external view returns (uint8) {
        return uint8(stockReference.currentSession());
    }
}
