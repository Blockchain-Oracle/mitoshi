// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IHooks} from "v4-core/interfaces/IHooks.sol";
import {PoolKey} from "v4-core/types/PoolKey.sol";
import {Currency} from "v4-core/types/Currency.sol";
import {LPFeeLibrary} from "v4-core/libraries/LPFeeLibrary.sol";
import {SessionState} from "../../../../src/stocks/interfaces/IStockReference.sol";
import {StockGuardHook} from "../../../../src/stocks/hooks/StockGuardHook.sol";
import {GuardTypes as T} from "../../../../src/stocks/hooks/GuardTypes.sol";
import {GuardMath} from "../../../../src/stocks/libs/GuardMath.sol";
import {ThemeRegistry} from "../../../../src/themes/ThemeRegistry.sol";
import {IThemePoolGuard} from "../../../../src/themes/interfaces/IThemePoolGuard.sol";
import {GuardFixture} from "./GuardFixture.sol";

/// B.6 `StockGuardHook.t.sol` (part 2): registration, initialization rules, the themes seams (D-101 `isGuardedPool`
/// with the real ThemeRegistry, D-102 `IThemeOracle`) and the UI view.
contract StockGuardHookAdminTest is GuardFixture {
    function _expectInitRefused(uint160 sqrtP, bytes4 selector) internal {
        try pm.initialize(key, sqrtP) {
            revert("initialized");
        } catch (bytes memory err) {
            assertEq(bytes4(_hookError(err)), selector);
        }
    }

    function test_registerPoolValidatesTheKey() public {
        PoolKey memory k = key;
        vm.startPrank(owner);
        k.currency0 = Currency.wrap(address(0x20C0000000000000000000000000000000000001));
        vm.expectRevert(StockGuardHook.BadPoolKey.selector);
        hook.registerPool(k, T.defaults());
        k = key;
        k.fee = LPFeeLibrary.DYNAMIC_FEE_FLAG;
        vm.expectRevert(StockGuardHook.BadPoolKey.selector);
        hook.registerPool(k, T.defaults());
        k = key;
        k.hooks = IHooks(address(0x20C0));
        vm.expectRevert(StockGuardHook.BadPoolKey.selector);
        hook.registerPool(k, T.defaults());
        T.GuardParams memory p = T.defaults();
        p.bandClosedBps = 2_001;
        vm.expectRevert(T.BadGuardParams.selector);
        hook.registerPool(key, p);
        hook.registerPool(key, T.defaults());
        vm.expectRevert(abi.encodeWithSelector(StockGuardHook.AlreadyRegistered.selector, address(mirror)));
        hook.registerPool(key, T.defaults());
        k = key;
        k.tickSpacing = 10; // a second pool for the same mirror
        vm.expectRevert(abi.encodeWithSelector(StockGuardHook.AlreadyRegistered.selector, address(mirror)));
        hook.registerPool(k, T.defaults());
        vm.stopPrank();
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, address(this)));
        hook.setGuard(key.toId(), T.defaults());
    }

    function test_setGuardNeedsARegisteredPoolAndBoundsBands() public {
        vm.startPrank(owner);
        vm.expectRevert(abi.encodeWithSelector(StockGuardHook.NotRegistered.selector, key.toId()));
        hook.setGuard(key.toId(), T.defaults());
        hook.registerPool(key, T.defaults());
        T.GuardParams memory p = T.defaults();
        p.bandRegularBps = 0;
        vm.expectRevert(T.BadGuardParams.selector);
        hook.setGuard(key.toId(), p);
        p.bandRegularBps = 2_000;
        hook.setGuard(key.toId(), p);
        vm.stopPrank();
        assertEq(hook.guardOf(key.toId()).bandRegularBps, 2_000);
        assertTrue(hook.guardOf(key.toId()).registered);
    }

    function test_initRules() public {
        _expectInitRefused(GuardMath.sqrtFromTokenPrice(SHARE), StockGuardHook.NotRegistered.selector);
        _register();
        _expectInitRefused(GuardMath.sqrtFromTokenPrice(SHARE), StockGuardHook.NoReference.selector);
        _pushPrice(SHARE, block.timestamp);
        (uint160 lo, uint160 hi) = GuardMath.band(SHARE, 500); // the CLOSED band, whatever the session
        _expectInitRefused(lo - 1, StockGuardHook.InitOutOfBand.selector);
        _expectInitRefused(hi + 1, StockGuardHook.InitOutOfBand.selector);
        vm.warp(block.timestamp + 345_601);
        _expectInitRefused(GuardMath.sqrtFromTokenPrice(SHARE), StockGuardHook.StaleReference.selector);
        _pushPrice(SHARE, block.timestamp);
        pm.initialize(key, hi); // the edge of the band is inside
    }

    /// Initialization needs no multiplier sync or inventory (Moderato before the bridge), but prices share × m.
    function test_initMultiplierFour() public {
        _register();
        _sync(4e18, 4e18, 1, 0);
        _pushPrice(SHARE, block.timestamp);
        _expectInitRefused(GuardMath.sqrtFromTokenPrice(SHARE), StockGuardHook.InitOutOfBand.selector); // ÷ or ×1: wrong
        _expectInitRefused(GuardMath.sqrtFromTokenPrice(SHARE / 4), StockGuardHook.InitOutOfBand.selector);
        pm.initialize(key, GuardMath.sqrtFromTokenPrice(SHARE * 4));
    }

    function test_initWithoutSyncUsesTheBoundDefaultMultiplier() public {
        _register();
        _pushPrice(SHARE, block.timestamp);
        assertFalse(receiver.isSynced(address(mirror), 93_600));
        pm.initialize(key, GuardMath.sqrtFromTokenPrice(SHARE));
        _session(SessionState.REGULAR);
        _assertSwapRefused(true, 1e6, StockGuardHook.MultiplierUnsynced.selector);
    }

    function test_isGuardedPoolFeedsTheRealThemeRegistry() public {
        ThemeRegistry registry = new ThemeRegistry(owner);
        vm.prank(owner);
        registry.setGuard(IThemePoolGuard(address(hook)));
        assertFalse(hook.isGuardedPool(key));
        vm.prank(owner);
        vm.expectRevert(abi.encodeWithSelector(ThemeRegistry.PoolNotGuarded.selector, address(mirror)));
        registry.setTokenPool(address(mirror), key);
        _register();
        assertTrue(hook.isGuardedPool(key));
        PoolKey memory other = key;
        other.hooks = IHooks(address(0x20C0));
        assertFalse(hook.isGuardedPool(other));
        vm.prank(owner);
        registry.setTokenPool(address(mirror), key);
        assertTrue(registry.isEligible(address(mirror)));
    }

    function test_themeOracleView() public {
        (uint256 p, uint64 at, bool halted) = hook.tokenPrice(address(mirror));
        assertEq(p, 0);
        assertTrue(halted, "no pool");
        _live(4e18);
        (p, at, halted) = hook.tokenPrice(address(mirror));
        assertEq(p, SHARE * 4);
        assertEq(at, block.timestamp);
        assertFalse(halted);
        assertEq(hook.currentSession(), 0);
        _session(SessionState.CLOSED);
        assertEq(hook.currentSession(), 2);
        vm.prank(keeper);
        ref.setHalted(address(mirror), true);
        (,, halted) = hook.tokenPrice(address(mirror));
        assertTrue(halted);
        vm.prank(keeper);
        ref.setHalted(address(mirror), false);
        vm.warp(block.timestamp + 93_601); // unsynced counts as halted for themes too
        (,, halted) = hook.tokenPrice(address(mirror));
        assertTrue(halted);
    }

    function test_bandNowForTheUi() public {
        (,,,, bool open, T.Block b) = hook.bandNow(address(mirror));
        assertEq(uint8(b), uint8(T.Block.NO_POOL));
        assertFalse(open);
        _live(1e18);
        (uint256 p, uint160 lo, uint160 hi, SessionState s, bool open2, T.Block b2) = hook.bandNow(address(mirror));
        assertEq(p, SHARE);
        (uint160 eLo, uint160 eHi) = GuardMath.band(SHARE, 150);
        assertEq(lo, eLo);
        assertEq(hi, eHi);
        assertEq(uint8(s), uint8(SessionState.REGULAR));
        assertTrue(open2);
        assertEq(uint8(b2), uint8(T.Block.NONE));
    }
}
