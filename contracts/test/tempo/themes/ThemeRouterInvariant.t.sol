// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {ITIP20} from "tempo-std/interfaces/ITIP20.sol";
import {ThemeParams} from "../../../src/themes/ThemeTypes.sol";
import {ThemeRouterBase} from "./ThemeRouterBase.sol";
import {ThemeRouterHandler} from "./ThemeRouterHandler.sol";

/// Plan B.4.2 invariants under random root- and key-signed rebalances and claims across two themes and three
/// followers: the router's pathUSD equals the fees it owes creators, it holds no mirror, fee accounting is conserved,
/// and no approval outlives a rebalance.
contract ThemeRouterInvariantTest is ThemeRouterBase {
    ThemeRouterHandler internal handler;
    address[] internal followersList;

    function setUp() public {
        _setUpRouter();
        address creator2 = makeAddr("creator2");
        ThemeParams memory p = _params();
        p.specHash = keccak256("theme-2");
        vm.prank(creator2);
        uint64 theme2 = registry.publish(p);

        address[] memory fs = new address[](3);
        uint256[] memory pks = new uint256[](3);
        uint64[] memory themes = new uint64[](3);
        for (uint256 i; i < 3; ++i) {
            followerPk = 0xF0110 + i;
            agentPk = 0xA6E70 + i;
            follower = vm.addr(followerPk);
            agent = vm.addr(agentPk);
            PATH_USD.transfer(follower, 1_000_000e6);
            themeId = i == 2 ? theme2 : 1;
            _authorizeAndFollow();
            (fs[i], pks[i], themes[i]) = (follower, agentPk, themeId);
        }
        followersList = fs;
        address[] memory ts = new address[](5);
        for (uint256 i; i < 5; ++i) ts[i] = tokens[i];
        address[] memory cs = new address[](2);
        (cs[0], cs[1]) = (creator, creator2);
        handler = new ThemeRouterHandler(router, oracle, _poolPriceE18(), ts, fs, pks, themes, cs, 30);
        targetContract(address(handler));
    }

    function invariant_routerHoldsOnlyOwedFees() public view {
        assertEq(PATH_USD.balanceOf(address(router)), router.totalFeesOwed(), "router pathUSD == fees owed");
        assertEq(router.totalFeesOwed(), router.feesOwed(handler.creators(0)) + router.feesOwed(handler.creators(1)));
        assertEq(handler.ghostFeesCharged(), router.totalFeesOwed() + handler.ghostFeesClaimed(), "fees conserved");
        for (uint256 i; i < 5; ++i) assertEq(ITIP20(tokens[i]).balanceOf(address(router)), 0, "no mirror held");
    }

    function invariant_noStandingAllowances() public view {
        for (uint256 f; f < followersList.length; ++f) {
            assertEq(PATH_USD.allowance(followersList[f], address(router)), 0);
            for (uint256 i; i < 5; ++i) assertEq(ITIP20(tokens[i]).allowance(followersList[f], address(router)), 0);
        }
    }

    /// The handler's two paths really land (so the invariants aren't vacuous): one root-signed and one key-signed buy
    /// through Tempo's handler, then a key-signed sell.
    function test_handlerPathsLand() public {
        handler.buy(0, 0, 500e6, false);
        vm.warp(vm.getBlockTimestamp() + 61);
        handler.wait(0);
        handler.buy(1, 1, 500e6, true);
        assertEq(handler.okByKey(), 1, handler.lastKeyFailure());
        vm.warp(vm.getBlockTimestamp() + 61);
        handler.wait(0);
        handler.sell(1, 1, 50, true);
        assertEq(handler.okRebalances(), 3, handler.lastKeyFailure());
        assertEq(handler.okByKey(), 2);
        assertGt(router.totalFeesOwed(), 0);
        invariant_routerHoldsOnlyOwedFees();
        invariant_noStandingAllowances();
    }
}
