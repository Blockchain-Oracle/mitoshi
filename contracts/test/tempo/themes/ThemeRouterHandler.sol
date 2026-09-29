// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {CommonBase} from "forge-std/Base.sol";
import {StdUtils} from "forge-std/StdUtils.sol";
import {ITIP20} from "tempo-std/interfaces/ITIP20.sol";
import {TempoCall, TempoTransaction, TempoTransactionLib} from "tempo-std/tx/TempoTransactionLib.sol";
import {ThemeRouter} from "../../../src/themes/ThemeRouter.sol";
import {Trade} from "../../../src/themes/ThemeTypes.sol";
import {KeychainTx} from "../../lib/KeychainTx.sol";
import {FixtureOracle} from "./ThemeFixtures.sol";

/// Drives ThemeRouter with random buys, sells (root- and key-signed), clock moves and creator claims. Each "tx" is
/// atomic like a Tempo batch: when the rebalance reverts, the approvals made for it are withdrawn.
contract ThemeRouterHandler is CommonBase, StdUtils {
    using TempoTransactionLib for TempoTransaction;

    ITIP20 internal constant PATH_USD = ITIP20(0x20C0000000000000000000000000000000000000);
    ThemeRouter internal immutable router;
    FixtureOracle internal immutable oracle;
    uint256 internal immutable priceE18;
    address[] internal tokens;
    address[] internal followers;
    uint256[] internal agentPks; // agent key per follower (same index)
    uint64[] internal themeOf; // theme each follower follows
    address[] public creators;
    uint16 internal immutable feeBps;

    uint256 public ghostFeesCharged;
    uint256 public ghostFeesClaimed;
    uint256 public okRebalances;
    uint256 public okByKey;
    string public lastKeyFailure;

    constructor(ThemeRouter router_, FixtureOracle oracle_, uint256 priceE18_, address[] memory tokens_, address[] memory followers_, uint256[] memory agentPks_, uint64[] memory themeOf_, address[] memory creators_, uint16 feeBps_) {
        router = router_;
        oracle = oracle_;
        priceE18 = priceE18_;
        tokens = tokens_;
        followers = followers_;
        agentPks = agentPks_;
        themeOf = themeOf_;
        creators = creators_;
        feeBps = feeBps_;
    }

    function buy(uint256 who, uint256 tok, uint256 usd, bool byKey) external {
        who = bound(who, 0, followers.length - 1);
        Trade[] memory ts = new Trade[](1);
        ts[0] = Trade(address(PATH_USD), tokens[bound(tok, 0, tokens.length - 1)], uint128(bound(usd, 1e6, 3_000e6)), 0);
        _run(who, ts, byKey);
    }

    function sell(uint256 who, uint256 tok, uint256 pct, bool byKey) external {
        who = bound(who, 0, followers.length - 1);
        address token = tokens[bound(tok, 0, tokens.length - 1)];
        uint256 bal = ITIP20(token).balanceOf(followers[who]);
        uint256 amount = bal * bound(pct, 1, 100) / 100;
        if (amount == 0) return;
        Trade[] memory ts = new Trade[](1);
        ts[0] = Trade(token, address(PATH_USD), uint128(amount), uint128(amount * priceE18 / 1e18 * 90 / 100));
        _run(who, ts, byKey);
    }

    function wait(uint256 secs) external {
        vm.warp(vm.getBlockTimestamp() + bound(secs, 1, 2 days));
        for (uint256 i; i < tokens.length; ++i) oracle.push(tokens[i], priceE18, uint64(vm.getBlockTimestamp()));
    }

    function claim(uint256 c) external {
        address creator = creators[bound(c, 0, creators.length - 1)];
        uint256 owed = router.feesOwed(creator);
        if (owed == 0) return;
        vm.prank(creator);
        router.claimFees();
        ghostFeesClaimed += owed;
    }

    function _run(uint256 who, Trade[] memory ts, bool byKey) internal {
        address f = followers[who];
        (uint256 approvePath, address sold, uint256 approveSold, uint256 fee) = _approvals(ts);
        uint256 owedBefore = router.totalFeesOwed();
        bool ok;
        if (byKey) {
            TempoCall[] memory calls = new TempoCall[]((approvePath != 0 ? 1 : 0) + (approveSold != 0 ? 1 : 0) + 1);
            uint256 n;
            if (approvePath != 0) calls[n++] = TempoCall(address(PATH_USD), 0, abi.encodeCall(ITIP20.approve, (address(router), approvePath)));
            if (approveSold != 0) calls[n++] = TempoCall(sold, 0, abi.encodeCall(ITIP20.approve, (address(router), approveSold)));
            calls[n] = TempoCall(address(router), 0, abi.encodeCall(ThemeRouter.rebalance, (themeOf[who], ts, "", bytes32(0))));
            TempoTransaction memory t = TempoTransactionLib.create().withChainId(uint64(block.chainid)).withGasLimit(29_000_000)
                .withMaxFeePerGas(1e9).withMaxPriorityFeePerGas(1).withNonce(uint64(vm.getNonce(f))).withFeeToken(address(PATH_USD))
                .withCalls(calls);
            (ok, lastKeyFailure) = KeychainTx.tryExecute(KeychainTx.signKey(t, agentPks[who], f));
        } else {
            vm.startPrank(f, f);
            if (approvePath != 0) PATH_USD.approve(address(router), approvePath);
            if (approveSold != 0) ITIP20(sold).approve(address(router), approveSold);
            try router.rebalance(themeOf[who], ts, "", bytes32(0)) {
                ok = true;
            } catch {
                if (approvePath != 0) PATH_USD.approve(address(router), 0);
                if (approveSold != 0) ITIP20(sold).approve(address(router), 0);
            }
            vm.stopPrank();
        }
        if (ok) {
            ++okRebalances;
            if (byKey) ++okByKey;
            require(router.totalFeesOwed() - owedBefore == fee, "fee accounting");
            ghostFeesCharged += fee;
        }
    }

    function _approvals(Trade[] memory ts) internal view returns (uint256 path, address sold, uint256 soldAmt, uint256 fee) {
        uint256 feeBase;
        for (uint256 i; i < ts.length; ++i) {
            if (ts[i].tokenIn == address(PATH_USD)) {
                path += ts[i].amountIn;
                feeBase += ts[i].amountIn;
            } else {
                sold = ts[i].tokenIn;
                soldAmt += ts[i].amountIn;
                feeBase += ts[i].minAmountOut;
            }
        }
        fee = feeBase * feeBps / 10_000;
        path += fee;
    }

    function followerCount() external view returns (uint256) {
        return followers.length;
    }

    function followerAt(uint256 i) external view returns (address) {
        return followers[i];
    }
}
