// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Vm} from "forge-std/Vm.sol";
import {IAccountKeychain} from "tempo-std/interfaces/IAccountKeychain.sol";
import {ITIP20} from "tempo-std/interfaces/ITIP20.sol";
import {TempoCall} from "tempo-std/tx/TempoTransactionLib.sol";
import {ThemeRouter} from "../../../src/themes/ThemeRouter.sol";
import {FollowCaps, Trade} from "../../../src/themes/ThemeTypes.sol";
import {KeychainTx} from "../../lib/KeychainTx.sol";
import {ThemeRouterBase} from "./ThemeRouterBase.sol";

/// ThemeRouter rebalances signed by the agent's key (plan B.4.2, B.6): outputs to the follower, exact approvals,
/// fees, the follower's caps, and the theme's rules.
contract ThemeRouterRebalanceTest is ThemeRouterBase {
    function setUp() public {
        _setUpRouter();
        _authorizeAndFollow();
    }

    function test_rebalance_byKey_buyAndSell_outputsToFollower_routerHoldsOnlyFees() public {
        Trade[] memory ts = new Trade[](2);
        ts[0] = _buy(0, 1_000e6);
        ts[1] = _buy(1, 500e6);
        uint256 path0 = PATH_USD.balanceOf(follower);
        vm.recordLogs();
        (bool ok, string memory reason) = _agentRebalance(ts);
        assertTrue(ok, reason);
        uint256 got0 = ITIP20(tokens[0]).balanceOf(follower);
        uint256 got1 = ITIP20(tokens[1]).balanceOf(follower);
        assertGe(got0, ts[0].minAmountOut);
        assertGe(got1, ts[1].minAmountOut);
        uint256 fee = (1_500e6 * 30) / 10_000;
        assertEq(path0 - PATH_USD.balanceOf(follower), 1_500e6 + fee, "paid buys + fee (tx fee is 0 locally)");
        assertEq(router.feesOwed(creator), fee);
        assertEq(PATH_USD.balanceOf(address(router)), router.totalFeesOwed());
        assertEq(ITIP20(tokens[0]).balanceOf(address(router)), 0);
        assertEq(PATH_USD.allowance(follower, address(router)), 0, "exact approval consumed");
        _assertRebalancedEvent(1_500e6, fee);
        // the key's approve counted against its TIP-1011 daily limit (6,000 − 1,504.5)
        (uint256 remaining,) = KEYCHAIN.getRemainingLimitWithPeriod(follower, agent, address(PATH_USD));
        assertEq(remaining, 6_000e6 - 1_500e6 - fee);

        // sell part back
        vm.warp(vm.getBlockTimestamp() + 61);
        _refreshOracle();
        uint256 pathBefore = PATH_USD.balanceOf(follower);
        (ok, reason) = _agentRebalance(_one(_sell(0, uint128(got0 / 2))));
        assertTrue(ok, reason);
        assertEq(ITIP20(tokens[0]).balanceOf(follower), got0 - got0 / 2);
        assertGt(PATH_USD.balanceOf(follower), pathBefore);
        assertEq(ITIP20(tokens[0]).allowance(follower, address(router)), 0);
        assertEq(PATH_USD.balanceOf(address(router)), router.totalFeesOwed());
    }

    function _assertRebalancedEvent(uint256 notional, uint256 fee) internal {
        Vm.Log[] memory logs = vm.getRecordedLogs();
        for (uint256 i; i < logs.length; ++i) {
            if (logs[i].emitter == address(router) && logs[i].topics[0] == ThemeRouter.Rebalanced.selector) {
                assertEq(address(uint160(uint256(logs[i].topics[1]))), follower);
                assertEq(logs[i].topics[3], keccak256("decision"));
                (uint32 version, address txKey, uint256 n, uint256 f) = abi.decode(logs[i].data, (uint32, address, uint256, uint256));
                assertEq(version, 1);
                assertEq(txKey, agent, "signed by the agent key");
                assertEq(n, notional);
                assertEq(f, fee);
                return;
            }
        }
        fail();
    }

    function _refreshOracle() internal {
        for (uint256 i; i < 5; ++i) oracle.push(tokens[i], _poolPriceE18(), uint64(vm.getBlockTimestamp()));
    }

    function test_rebalance_wrongKey() public {
        uint256 otherPk = 0x0DD;
        _authorize(vm.addr(otherPk), _scopes(), uint64(vm.getBlockTimestamp() + 30 days)); // valid, same scope, not the follow key
        (bool ok, string memory reason) = KeychainTx.tryExecute(_signed(_agentCalls(_one(_buy(0, 100e6)), 30), otherPk));
        _assertTxReverted(ok, reason, abi.encodeWithSelector(ThemeRouter.WrongKey.selector));
    }

    function test_rebalance_expiredFollow() public {
        vm.prank(follower, follower);
        router.updateCaps(themeId, _capsExpiring(block.timestamp + 1 hours));
        vm.warp(vm.getBlockTimestamp() + 2 hours);
        _refreshOracle();
        (bool ok, string memory reason) = _agentRebalance(_one(_buy(0, 100e6)));
        _assertTxReverted(ok, reason, abi.encodeWithSelector(ThemeRouter.FollowExpired.selector));
    }

    function _capsExpiring(uint256 at) internal view returns (FollowCaps memory c) {
        c = _caps();
        c.expiry = uint64(at);
    }

    function test_rebalance_tokenAllowlist() public {
        Trade memory bad = _buy(0, 100e6);
        bad.tokenIn = tokens[1]; // mirror → mirror
        (bool ok, string memory reason) = _agentRebalance(_one(bad));
        _assertTxReverted(ok, reason, abi.encodeWithSelector(ThemeRouter.BadTrades.selector));
    }

    function test_rebalance_perLegCap_dailyCap_dailyReset() public {
        (bool ok, string memory reason) = _agentRebalance(_one(_buy(0, 2_001e6)));
        _assertTxReverted(ok, reason, abi.encodeWithSelector(ThemeRouter.TradeCap.selector, 0));
        Trade[] memory ts = new Trade[](2);
        ts[0] = _buy(0, 2_000e6);
        ts[1] = _buy(1, 2_000e6);
        (ok, reason) = _agentRebalance(ts);
        assertTrue(ok, reason); // 4,000 of 5,000
        vm.warp(vm.getBlockTimestamp() + 61);
        _refreshOracle();
        (ok, reason) = _agentRebalance(_one(_buy(2, 1_001e6)));
        _assertTxReverted(ok, reason, abi.encodeWithSelector(ThemeRouter.DailyCap.selector));
        (ok, reason) = _agentRebalance(_one(_buy(2, 1_000e6)));
        assertTrue(ok, reason); // exactly 5,000
        vm.warp(vm.getBlockTimestamp() + 1 days);
        _refreshOracle();
        (ok, reason) = _agentRebalance(_one(_buy(3, 1_000e6)));
        assertTrue(ok, reason); // the day rolled
        assertEq(router.followOf(follower, themeId).daySpentUsd, 1_000e6);
    }

    function test_rebalance_minInterval() public {
        (bool ok, string memory reason) = _agentRebalance(_one(_buy(0, 100e6)));
        assertTrue(ok, reason);
        vm.warp(vm.getBlockTimestamp() + 59);
        (ok, reason) = _agentRebalance(_one(_buy(0, 100e6)));
        _assertTxReverted(ok, reason, abi.encodeWithSelector(ThemeRouter.TooSoon.selector));
        vm.warp(vm.getBlockTimestamp() + 1);
        (ok, reason) = _agentRebalance(_one(_buy(0, 100e6)));
        assertTrue(ok, reason);
    }

    function test_rebalance_slippageAgainstReference_andMinOut() public {
        // the reference says the token is worth 5 % less than the pool charges → buying is > 3 % worse than P_i
        oracle.push(tokens[0], _poolPriceE18() * 95 / 100, uint64(vm.getBlockTimestamp() + 1));
        Trade memory t = _buy(0, 100e6);
        t.minAmountOut = 0;
        (bool ok, string memory reason) = _agentRebalance(_one(t));
        _assertTxReverted(ok, reason, abi.encodeWithSelector(ThemeRouter.SlippageExceeded.selector, 0));
        t = _buy(1, 100e6);
        t.minAmountOut = uint128(uint256(100e6) * 1e18 / _poolPriceE18()); // above what the pool's fee leaves
        (ok, reason) = _agentRebalance(_one(t));
        _assertTxReverted(ok, reason, abi.encodeWithSelector(ThemeRouter.BelowMinOut.selector, 0));
    }

    function test_rebalance_receivePolicyBlockedFollowerRefused() public {
        // follower refuses everything from anyone (built-in policy 0 = reject all) → the take would be held, so refuse
        vm.prank(follower, follower);
        (bool okSet,) = address(0x403c000000000000000000000000000000000000).call(abi.encodeWithSignature("setReceivePolicy(uint64,uint64,address)", uint64(0), uint64(1), address(0)));
        assertTrue(okSet);
        (bool ok, string memory reason) = _agentRebalance(_one(_buy(0, 100e6)));
        _assertTxReverted(ok, reason, abi.encodeWithSelector(ThemeRouter.ReceiveBlocked.selector, tokens[0]));
    }

    function test_rebalance_overApprovalRefused() public {
        TempoCall[] memory calls = _agentCalls(_one(_buy(0, 100e6)), 30);
        calls[0] = _call(address(PATH_USD), abi.encodeCall(ITIP20.approve, (address(router), 101e6)));
        (bool ok, string memory reason) = KeychainTx.tryExecute(_signed(calls, agentPk));
        _assertTxReverted(ok, reason, abi.encodeWithSelector(ThemeRouter.AllowanceLeft.selector, address(PATH_USD)));
    }

    function test_rebalance_keyLimitBindsTheApproval() public {
        // The router's daily cap is raised to 50,000, but the key's own TIP-1011 limit (6,000/day on pathUSD) still
        // binds: after 4,000 + fees, a 2,000 approval is refused by the protocol.
        Trade[] memory ts = new Trade[](2);
        ts[0] = _buy(0, 2_000e6);
        ts[1] = _buy(1, 2_000e6);
        (bool ok, string memory reason) = _agentRebalance(ts);
        assertTrue(ok, reason);
        vm.prank(follower, follower);
        router.updateCaps(themeId, _bigCaps());
        vm.warp(vm.getBlockTimestamp() + 61);
        _refreshOracle();
        (ok, reason) = _agentRebalance(_one(_buy(2, 2_000e6)));
        _assertTxReverted(ok, reason, abi.encodeWithSignature("SpendingLimitExceeded()"));
    }

    function _bigCaps() internal view returns (FollowCaps memory c) {
        c = _caps();
        c.maxDailyUsd = 50_000e6;
    }

    function test_rebalance_versionMismatchAfterNewVersion() public {
        vm.prank(creator);
        registry.publishVersion(themeId, _params());
        (bool ok, string memory reason) = _agentRebalance(_one(_buy(0, 100e6)));
        _assertTxReverted(ok, reason, abi.encodeWithSelector(ThemeRouter.VersionMismatch.selector));
    }

    function test_rebalance_afterUnfollowAndAfterRevoke() public {
        vm.prank(follower, follower);
        router.unfollow(themeId);
        (bool ok, string memory reason) = _agentRebalance(_one(_buy(0, 100e6)));
        _assertTxReverted(ok, reason, abi.encodeWithSelector(ThemeRouter.NotFollowing.selector));
        vm.prank(follower, follower);
        router.follow(themeId, 1, _caps(), agent);
        vm.prank(follower, follower);
        KEYCHAIN.revokeKey(agent);
        (ok, reason) = _agentRebalance(_one(_buy(0, 100e6)));
        assertFalse(ok, "a revoked key can't sign at all");
    }

    function test_claimFees_payCreatorOnly() public {
        (bool ok, string memory reason) = _agentRebalance(_one(_buy(0, 1_000e6)));
        assertTrue(ok, reason);
        uint256 owed = router.feesOwed(creator);
        assertEq(owed, 3e6);
        vm.expectRevert(ThemeRouter.NothingOwed.selector);
        router.claimFees();
        uint256 before = PATH_USD.balanceOf(creator);
        vm.prank(creator);
        router.claimFees();
        assertEq(PATH_USD.balanceOf(creator) - before, owed);
        assertEq(router.totalFeesOwed(), 0);
        assertEq(PATH_USD.balanceOf(address(router)), 0);
    }
}
