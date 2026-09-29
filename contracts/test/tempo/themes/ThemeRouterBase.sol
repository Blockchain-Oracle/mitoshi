// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {IAccountKeychain} from "tempo-std/interfaces/IAccountKeychain.sol";
import {ITIP20} from "tempo-std/interfaces/ITIP20.sol";
import {TempoCall, TempoTransaction, TempoTransactionLib} from "tempo-std/tx/TempoTransactionLib.sol";
import {ThemeRouter} from "../../../src/themes/ThemeRouter.sol";
import {IThemeOracle} from "../../../src/themes/interfaces/IThemeOracle.sol";
import {FollowCaps, Trade} from "../../../src/themes/ThemeTypes.sol";
import {KeychainTx} from "../../lib/KeychainTx.sol";
import {ThemeBase} from "./ThemeBase.sol";

/// ThemeRouter test setup: a published 5-token theme, a follower (secp256k1 root) with pathUSD, and the agent key
/// authorized with the exact B.4.3 shape. Key-signed txs run through Tempo's real handler (`vm.executeTransaction`
/// with a keychain V2 signature, `test/lib/KeychainTx.sol`): scopes, limits and `getTransactionKey()` are real.
abstract contract ThemeRouterBase is ThemeBase {
    using TempoTransactionLib for TempoTransaction;

    IAccountKeychain internal constant KEYCHAIN = IAccountKeychain(0xaAAAaaAA00000000000000000000000000000000);
    string internal constant TX_REVERTED = "vm.executeTransaction: transaction reverted: ";

    ThemeRouter internal router;
    uint64 internal themeId;
    uint256 internal followerPk = 0xF011;
    uint256 internal agentPk = 0xA6E7;
    address internal follower;
    address internal agent;

    function _setUpRouter() internal {
        _setUpThemes(true);
        router = new ThemeRouter(pm, registry, IThemeOracle(address(oracle)), safe);
        vm.prank(creator);
        themeId = registry.publish(_params());
        follower = vm.addr(followerPk);
        agent = vm.addr(agentPk);
        PATH_USD.transfer(follower, 1_000_000e6);
    }

    function _caps() internal view returns (FollowCaps memory) {
        return FollowCaps({
            expiry: uint64(vm.getBlockTimestamp() + 30 days),
            allocationUsd: 10_000e6,
            maxTradeUsd: 2_000e6,
            maxDailyUsd: 5_000e6,
            maxSlippageBps: 300,
            maxFeeBps: 50,
            minIntervalSec: 0
        });
    }

    function _approveScope(address token, address spender) internal pure returns (IAccountKeychain.CallScope memory) {
        address[] memory to = new address[](1);
        to[0] = spender;
        IAccountKeychain.SelectorRule[] memory r = new IAccountKeychain.SelectorRule[](1);
        r[0] = IAccountKeychain.SelectorRule(ITIP20.approve.selector, to);
        return IAccountKeychain.CallScope(token, r);
    }

    /// router.rebalance + approve(router) on pathUSD and every theme token.
    function _scopes() internal view returns (IAccountKeychain.CallScope[] memory s) {
        s = new IAccountKeychain.CallScope[](7);
        IAccountKeychain.SelectorRule[] memory r = new IAccountKeychain.SelectorRule[](1);
        r[0] = IAccountKeychain.SelectorRule(ThemeRouter.rebalance.selector, new address[](0));
        s[0] = IAccountKeychain.CallScope(address(router), r);
        s[1] = _approveScope(address(PATH_USD), address(router));
        for (uint256 i; i < 5; ++i) s[i + 2] = _approveScope(tokens[i], address(router));
    }

    function _limits() internal view returns (IAccountKeychain.TokenLimit[] memory l) {
        l = new IAccountKeychain.TokenLimit[](6);
        l[0] = IAccountKeychain.TokenLimit(address(PATH_USD), 6_000e6, 1 days);
        for (uint256 i; i < 5; ++i) l[i + 1] = IAccountKeychain.TokenLimit(tokens[i], 100e6, 1 days);
    }

    function _authorize(address key, IAccountKeychain.CallScope[] memory scopes, uint64 expiry) internal {
        vm.prank(follower, follower);
        KEYCHAIN.authorizeKey(key, IAccountKeychain.SignatureType.Secp256k1, IAccountKeychain.KeyRestrictions(expiry, true, _limits(), false, scopes));
    }

    function _authorizeAndFollow() internal {
        _authorize(agent, _scopes(), uint64(vm.getBlockTimestamp() + 30 days));
        vm.prank(follower, follower);
        router.follow(themeId, 1, _caps(), agent);
    }

    function _buy(uint256 i, uint128 usd) internal view returns (Trade memory) {
        uint256 fair = uint256(usd) * 1e18 / _poolPriceE18();
        return Trade(address(PATH_USD), tokens[i], usd, uint128(fair * 97 / 100));
    }

    function _sell(uint256 i, uint128 amount) internal view returns (Trade memory) {
        uint256 fair = uint256(amount) * _poolPriceE18() / 1e18;
        return Trade(tokens[i], address(PATH_USD), amount, uint128(fair * 97 / 100));
    }

    function _one(Trade memory t) internal pure returns (Trade[] memory ts) {
        ts = new Trade[](1);
        ts[0] = t;
    }

    function _call(address to, bytes memory data) internal pure returns (TempoCall memory) {
        return TempoCall({to: to, value: 0, data: data});
    }

    /// The agent's batch: exact approvals (pathUSD = buys + fee; each sold token = its amountIn), then rebalance.
    function _agentCalls(Trade[] memory ts, uint16 feeBps) internal view returns (TempoCall[] memory calls) {
        uint256 pathUsd;
        uint256 feeBase;
        uint256 sells;
        for (uint256 i; i < ts.length; ++i) {
            if (ts[i].tokenIn == address(PATH_USD)) {
                pathUsd += ts[i].amountIn;
                feeBase += ts[i].amountIn;
            } else {
                feeBase += ts[i].minAmountOut;
                ++sells;
            }
        }
        pathUsd += feeBase * feeBps / 10_000;
        calls = new TempoCall[]((pathUsd != 0 ? 1 : 0) + sells + 1);
        uint256 n;
        if (pathUsd != 0) calls[n++] = _call(address(PATH_USD), abi.encodeCall(ITIP20.approve, (address(router), pathUsd)));
        for (uint256 i; i < ts.length; ++i) {
            if (ts[i].tokenIn != address(PATH_USD)) calls[n++] = _call(ts[i].tokenIn, abi.encodeCall(ITIP20.approve, (address(router), ts[i].amountIn)));
        }
        calls[n] = _call(address(router), abi.encodeCall(ThemeRouter.rebalance, (themeId, ts, "", keccak256("decision"))));
    }

    function _tx(TempoCall[] memory calls) internal view returns (TempoTransaction memory) {
        return TempoTransactionLib.create().withChainId(uint64(block.chainid)).withGasLimit(29_000_000).withMaxFeePerGas(1e9)
            .withMaxPriorityFeePerGas(1).withNonce(uint64(vm.getNonce(follower))).withFeeToken(address(PATH_USD)).withCalls(calls);
    }

    /// Signed by an access key of the follower (keychain V2).
    function _signed(TempoCall[] memory calls, uint256 keyPk) internal view returns (bytes memory) {
        return KeychainTx.signKey(_tx(calls), keyPk, follower);
    }

    /// Signed by the follower's root key.
    function _rootSigned(TempoCall[] memory calls) internal view returns (bytes memory) {
        return KeychainTx.signRoot(_tx(calls), followerPk);
    }

    function _agentRebalance(Trade[] memory ts) internal returns (bool ok, string memory reason) {
        return KeychainTx.tryExecute(_signed(_agentCalls(ts, 30), agentPk));
    }

    function _assertTxReverted(bool ok, string memory reason, bytes memory err) internal pure {
        assertFalse(ok, "tx should revert");
        assertEq(reason, string.concat(TX_REVERTED, vm.toString(err)));
    }
}
