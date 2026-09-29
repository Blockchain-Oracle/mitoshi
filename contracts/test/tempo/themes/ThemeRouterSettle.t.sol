// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Vm, VmSafe} from "forge-std/Vm.sol";
import {ITIP20} from "tempo-std/interfaces/ITIP20.sol";
import {IPoolManager} from "v4-core/interfaces/IPoolManager.sol";
import {Currency} from "v4-core/types/Currency.sol";
import {ThemeRouter} from "../../../src/themes/ThemeRouter.sol";
import {ThemeRegistry} from "../../../src/themes/ThemeRegistry.sol";
import {IThemeOracle} from "../../../src/themes/interfaces/IThemeOracle.sol";
import {Trade} from "../../../src/themes/ThemeTypes.sol";
import {ThemeRouterBase} from "./ThemeRouterBase.sol";

/// A router that forgets `sync` (the plan's original B.4.2 text): proves the order is load-bearing.
contract ThemeRouterNoSync is ThemeRouter {
    constructor(IPoolManager pm_, ThemeRegistry r_, IThemeOracle o_, address owner_) ThemeRouter(pm_, r_, o_, owner_) {}

    function _settle(address token, address follower, uint256 amount) internal override {
        ITIP20(token).transferFrom(follower, address(poolManager), amount);
        poolManager.settle();
    }
}

/// D-023 / research chain-libs §0.3: settlement per currency is `PM.sync(c)` → `transferFrom(follower, PM)` →
/// `PM.settle()`, every take happens before any settle, and takes pay the follower only.
contract ThemeRouterSettleTest is ThemeRouterBase {
    function setUp() public {
        _setUpRouter();
        _authorizeAndFollow();
    }

    function _twoLegs() internal returns (Trade[] memory ts) {
        ITIP20(tokens[1]).mint(follower, 2e6);
        ts = new Trade[](2);
        ts[0] = _buy(0, 500e6);
        ts[1] = _sell(1, 2e6);
    }

    function test_settlement_syncBeforeEachTransfer_takesBeforeSettles() public {
        Trade[] memory ts = _twoLegs();
        vm.startStateDiffRecording();
        (bool ok, string memory reason) = _agentRebalance(ts);
        Vm.AccountAccess[] memory acc = vm.stopAndReturnStateDiff();
        assertTrue(ok, reason);

        // The router's own outgoing calls, in execution order.
        uint256 n;
        for (uint256 i; i < acc.length; ++i) if (_routerCall(acc[i])) ++n;
        Vm.AccountAccess[] memory calls = new Vm.AccountAccess[](n);
        n = 0;
        for (uint256 i; i < acc.length; ++i) if (_routerCall(acc[i])) calls[n++] = acc[i];

        uint256 transfersIn;
        uint256 takes;
        bool settling;
        for (uint256 i; i < calls.length; ++i) {
            bytes4 sel = bytes4(calls[i].data);
            if (calls[i].account == address(pm) && sel == IPoolManager.take.selector) {
                assertFalse(settling, "a take after a settle");
                (, address to,) = abi.decode(_args(calls[i].data), (Currency, address, uint256));
                assertEq(to, follower, "takes pay the follower only");
                ++takes;
            }
            if (calls[i].account == address(pm) && sel == IPoolManager.sync.selector) settling = true;
            if (sel != ITIP20.transferFrom.selector) continue;
            (address from, address to,) = abi.decode(_args(calls[i].data), (address, address, uint256));
            if (to != address(pm)) continue; // the fee pull goes to the router, after unlock
            assertEq(from, follower);
            ++transfersIn;
            // the router's previous PoolManager call is sync(this token) …
            Vm.AccountAccess memory prev = _prevPm(calls, i);
            assertEq(bytes4(prev.data), IPoolManager.sync.selector, "sync precedes the transfer");
            assertEq(Currency.unwrap(abi.decode(_args(prev.data), (Currency))), calls[i].account, "synced the same token");
            // … and its next one is settle()
            assertEq(bytes4(_nextPm(calls, i).data), IPoolManager.settle.selector, "settle follows the transfer");
        }
        assertEq(transfersIn, 2, "one settlement per input");
        assertEq(takes, 2, "one take per output");
    }

    function test_settlement_withoutSync_reverts() public {
        ThemeRouterNoSync bad = new ThemeRouterNoSync(pm, registry, IThemeOracle(address(oracle)), safe);
        router = bad; // scopes and follow now point at the sync-less router
        address key = makeAddr("badKey");
        _authorize(key, _scopes(), uint64(vm.getBlockTimestamp() + 30 days));
        vm.prank(follower, follower);
        bad.follow(themeId, 1, _caps(), key);
        Trade[] memory ts = _one(_buy(0, 100e6));
        vm.startPrank(follower, follower);
        PATH_USD.approve(address(bad), 100e6);
        vm.expectRevert(IPoolManager.CurrencyNotSettled.selector);
        bad.rebalance(themeId, ts, "", bytes32(0));
        vm.stopPrank();
    }

    function _routerCall(Vm.AccountAccess memory a) internal view returns (bool) {
        return a.accessor == address(router) && a.kind == VmSafe.AccountAccessKind.Call && a.data.length >= 4;
    }

    function _prevPm(Vm.AccountAccess[] memory calls, uint256 i) internal view returns (Vm.AccountAccess memory) {
        while (i > 0) {
            --i;
            if (calls[i].account == address(pm)) return calls[i];
        }
        revert("no earlier PoolManager call");
    }

    function _nextPm(Vm.AccountAccess[] memory calls, uint256 i) internal view returns (Vm.AccountAccess memory) {
        for (++i; i < calls.length; ++i) if (calls[i].account == address(pm)) return calls[i];
        revert("no later PoolManager call");
    }

    function _args(bytes memory data) internal pure returns (bytes memory out) {
        out = new bytes(data.length - 4);
        for (uint256 i; i < out.length; ++i) out[i] = data[i + 4];
    }
}
