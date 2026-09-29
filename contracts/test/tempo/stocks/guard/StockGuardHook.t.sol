// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {IPoolManager} from "v4-core/interfaces/IPoolManager.sol";
import {Hooks} from "v4-core/libraries/Hooks.sol";
import {StateLibrary} from "v4-core/libraries/StateLibrary.sol";
import {ITIP20RolesAuth} from "tempo-std/interfaces/ITIP20RolesAuth.sol";
import {SyncFlags} from "../../../../src/common/BridgeTypes.sol";
import {SessionState} from "../../../../src/stocks/interfaces/IStockReference.sol";
import {StockGuardHook} from "../../../../src/stocks/hooks/StockGuardHook.sol";
import {GuardTypes as T} from "../../../../src/stocks/hooks/GuardTypes.sol";
import {GuardMath} from "../../../../src/stocks/libs/GuardMath.sol";
import {GuardFixture} from "./GuardFixture.sol";

/// B.6 `StockGuardHook.t.sol` — swap rules over the real PoolManager runtime: in band, out of band (nothing moves),
/// corrective swaps never deadlocked, overshoot, stale reference, sessions (regular / extended / closed refuse or widen),
/// issuer/oracle/mirror pause, corporate-action window, unsynced multiplier, keeper halt, liquidity never blocked,
/// multiplier 4.
contract StockGuardHookTest is GuardFixture {
    using StateLibrary for IPoolManager;

    function _sqrt() internal view returns (uint160 s) {
        (s,,,) = pm.getSlot0(key.toId());
    }

    function test_permissionBitsAre0x20C0() public view {
        assertEq(uint160(address(hook)) & Hooks.ALL_HOOK_MASK, 0x20C0);
        Hooks.Permissions memory p = hook.getHookPermissions();
        assertTrue(p.beforeInitialize && p.beforeSwap && p.afterSwap);
        assertFalse(p.beforeAddLiquidity || p.beforeRemoveLiquidity || p.afterAddLiquidity || p.afterRemoveLiquidity);
        assertFalse(p.beforeSwapReturnDelta || p.afterSwapReturnDelta || p.beforeDonate || p.afterDonate);
    }

    function test_inBandSwapsBothWays() public {
        _live(1e18);
        assertEq(_swap(true, 10_000e6), ""); // buy the mirror with pathUSD
        assertEq(_swap(false, 40e6), ""); // sell 40 mirror tokens
    }

    function test_outOfBandRevertsAndNothingMoves() public {
        _live(1e18);
        uint160 before = _sqrt();
        uint256 usd = PATH_USD.balanceOf(address(router));
        uint256 m = mirror.balanceOf(address(router));
        bytes memory inner = _swap(true, 400_000e6);
        assertEq(bytes4(inner), StockGuardHook.OutOfBand.selector);
        (uint160 pre, uint160 post, uint160 lo, uint160 hi) = abi.decode(_tail(inner), (uint160, uint160, uint160, uint160));
        assertEq(pre, before);
        assertLt(post, lo, "the buy pushed the token above P(1+1.5%)");
        (uint160 bLo, uint160 bHi) = GuardMath.band(_tokenPrice(), 150);
        assertEq(lo, bLo);
        assertEq(hi, bHi);
        assertEq(_sqrt(), before, "nothing moved");
        assertEq(PATH_USD.balanceOf(address(router)), usd);
        assertEq(mirror.balanceOf(address(router)), m);
        assertEq(bytes4(_swap(false, 3_000e6)), StockGuardHook.OutOfBand.selector, "a big sell is refused too");
    }

    /// The reference jumps 5 %: the pool is now outside the band. Moving toward it is allowed (even if it stays
    /// outside), moving away or overshooting the far edge is not.
    function test_correctiveSwapsNeverDeadlocked() public {
        _live(1e18);
        vm.warp(block.timestamp + 10);
        _pushPrice(SHARE * 105 / 100, block.timestamp);
        (uint160 lo, uint160 hi) = GuardMath.band(_tokenPrice(), 150);
        uint160 s0 = _sqrt();
        assertGt(s0, hi, "pool is cheaper than the band");
        assertEq(bytes4(_swap(false, 1e6)), StockGuardHook.OutOfBand.selector, "selling moves away");
        assertEq(_swap(true, 1_000e6), "", "a small corrective buy");
        uint160 s1 = _sqrt();
        assertLt(s1, s0);
        assertGt(s1, hi, "still outside, but closer");
        assertEq(bytes4(_swap(true, 2_000_000e6)), StockGuardHook.OutOfBand.selector, "overshoot past the far edge");
        assertEq(_swap(true, 190_000e6), "", "into the band");
        assertTrue(_sqrt() >= lo && _sqrt() <= hi);
    }

    function test_staleReferenceRefused() public {
        _live(1e18);
        vm.warp(block.timestamp + 121);
        _assertSwapRefused(true, 1e6, StockGuardHook.StaleReference.selector);
        _pushPrice(SHARE, block.timestamp);
        assertEq(_swap(true, 1e6), "");
    }

    function test_closedWidensToTheClosedBand() public {
        _live(1e18);
        _session(SessionState.CLOSED);
        vm.warp(block.timestamp + 3 days); // the closed max age (4 d) still accepts the last print
        _session(SessionState.CLOSED);
        _sync(1e18, 1e18, 1, 0);
        uint256 amount = 150_000e6; // ≈ 2–4 % move: out of the 150 bps band, inside 500 bps
        assertEq(_swap(true, amount), "");
        assertLt(GuardMath.tokenPriceFromSqrt(_sqrt()), _tokenPrice() * 10_500 / 10_000);
        assertGt(GuardMath.tokenPriceFromSqrt(_sqrt()), _tokenPrice() * 10_150 / 10_000);
    }

    function test_closedRefusesWhenConfigured_unknownCountsAsClosed() public {
        _live(1e18);
        T.GuardParams memory p = T.defaults();
        p.offHoursMode = T.OffHoursMode.REFUSE;
        vm.prank(owner);
        hook.setGuard(key.toId(), p);
        _session(SessionState.CLOSED);
        _assertSwapRefused(true, 1e6, StockGuardHook.MarketClosed.selector);
        vm.warp(block.timestamp + 1 hours + 1); // keeper flag expired, no Data Streams status → UNKNOWN
        _pushPrice(SHARE, block.timestamp);
        assertEq(uint8(ref.currentSession()), uint8(SessionState.UNKNOWN));
        _assertSwapRefused(true, 1e6, StockGuardHook.MarketClosed.selector);
    }

    function test_regularBandOutOfBand_extendedBandAllows() public {
        _live(1e18);
        uint256 amount = 100_000e6; // ≈ 2 % move
        assertEq(bytes4(_swap(true, amount)), StockGuardHook.OutOfBand.selector);
        _session(SessionState.EXTENDED);
        assertEq(_swap(true, amount), "");
    }

    function test_issuerAndOraclePauseRefuse() public {
        _live(1e18);
        _sync(1e18, 1e18, 1, SyncFlags.TOKEN_PAUSED);
        _assertSwapRefused(true, 1e6, StockGuardHook.IssuerPaused.selector);
        _sync(1e18, 1e18, 1, SyncFlags.REGISTRY_PAUSED);
        _assertSwapRefused(true, 1e6, StockGuardHook.IssuerPaused.selector);
        _sync(1e18, 1e18, 1, SyncFlags.ORACLE_SUPPORTED | SyncFlags.ORACLE_PAUSED);
        _assertSwapRefused(true, 1e6, StockGuardHook.OraclePaused.selector);
        _sync(1e18, 1e18, 1, SyncFlags.ORACLE_SUPPORTED);
        assertEq(_swap(true, 1e6), "");
    }

    function test_mirrorPauseRefuses() public {
        _live(1e18);
        ITIP20RolesAuth(address(mirror)).grantRole(mirror.PAUSE_ROLE(), address(this));
        mirror.pause();
        _assertSwapRefused(true, 1e6, StockGuardHook.MirrorPaused.selector);
    }

    function test_corporateActionWindowRefusesBothSides() public {
        _live(1e18);
        uint64 at = uint64(block.timestamp + 600);
        _sync(1e18, 2e18, at, 0);
        _assertSwapRefused(true, 1e6, StockGuardHook.CorporateActionWindow.selector);
        vm.warp(at + 899);
        _pushPrice(SHARE, block.timestamp);
        _assertSwapRefused(true, 1e6, StockGuardHook.CorporateActionWindow.selector);
        vm.warp(at + 900);
        _pushPrice(SHARE, block.timestamp);
        // after the switch the token is worth 2 shares: the pool is far below the band, only buys move toward it
        assertEq(_tokenPrice(), SHARE * 2);
        assertEq(bytes4(_swap(false, 1e6)), StockGuardHook.OutOfBand.selector);
        assertEq(_swap(true, 1_000e6), "");
    }

    function test_unsyncedMultiplierRefuses() public {
        _live(1e18);
        vm.warp(block.timestamp + 93_601);
        _pushPrice(SHARE, block.timestamp);
        _session(SessionState.REGULAR);
        _assertSwapRefused(true, 1e6, StockGuardHook.MultiplierUnsynced.selector);
        _sync(1e18, 1e18, 1, 0);
        assertEq(_swap(true, 1e6), "");
    }

    function test_keeperHaltRefusesSwaps_liquidityNeverBlocked() public {
        _live(1e18);
        vm.prank(keeper);
        ref.setHalted(address(mirror), true);
        _assertSwapRefused(true, 1e6, StockGuardHook.Halted.selector);
        int24 t = _tick();
        int24 lower = t - 1200 - t % 60;
        int24 upper = t + 1200 - t % 60;
        router.removeLiquidity(key, lower, upper, 4e11); // exits stay open while halted
        router.addLiquidity(key, lower, upper, 1e11);
        vm.warp(block.timestamp + 30 days); // stale, unsynced and halted at once: removal still works
        router.removeLiquidity(key, lower, upper, 2e11);
    }

    function test_keeperPriceRefusedWhenVerifiedRequired() public {
        _live(1e18);
        vm.prank(keeper);
        ref.pushKeeper(address(mirror), SHARE, uint64(block.timestamp + 1));
        vm.warp(block.timestamp + 1);
        _assertSwapRefused(true, 1e6, StockGuardHook.UnverifiedReference.selector);
        T.GuardParams memory p = T.defaults();
        p.requireVerified = false;
        vm.prank(owner);
        hook.setGuard(key.toId(), p);
        assertEq(_swap(true, 1e6), "");
    }

    /// CRWD-style multiplier 4: the pool trades at share × 4 and the band sits around it.
    function test_multiplierFour() public {
        _live(4e18);
        assertEq(_tokenPrice(), SHARE * 4);
        assertApproxEqRel(GuardMath.tokenPriceFromSqrt(_sqrt()), SHARE * 4, 1e9);
        (uint256 p,, bool halted) = hook.tokenPrice(address(mirror));
        assertEq(p, 1_000e18);
        assertFalse(halted);
        assertEq(_swap(true, 10_000e6), "");
        assertEq(bytes4(_swap(true, 1_000_000e6)), StockGuardHook.OutOfBand.selector);
    }
}
