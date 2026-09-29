// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Test, console2} from "forge-std/Test.sol";
import {StdPrecompiles} from "tempo-std/StdPrecompiles.sol";
import {IAccountKeychain} from "tempo-std/interfaces/IAccountKeychain.sol";
import {ITIP20} from "tempo-std/interfaces/ITIP20.sol";
import {KeyAuthorization, KeyAuthorizationLib} from "tempo-std/tx/KeyAuthorizationLib.sol";
import {TempoTransaction, TempoTransactionLib} from "tempo-std/tx/TempoTransactionLib.sol";
import {KeychainTx} from "../lib/KeychainTx.sol";
import {X4Probe} from "./X4Probe.sol";

/// Spike X4, local half (forge Tempo mode runs the real keychain precompile and handler). The live half is
/// `scripts/drive/x4-key-auth.ts` on Moderato; acceptance/S16.md records both.
contract X4KeyAuthTest is Test {
    using KeyAuthorizationLib for KeyAuthorization;
    using TempoTransactionLib for TempoTransaction;

    IAccountKeychain constant KEYCHAIN = IAccountKeychain(0xaAAAaaAA00000000000000000000000000000000);
    ITIP20 constant PATH_USD = ITIP20(0x20C0000000000000000000000000000000000000);
    bytes4 constant REBALANCE = X4Probe.rebalance.selector;
    bytes4 constant APPROVE = ITIP20.approve.selector;

    X4Probe probe;
    address[5] tokens;
    uint256 rootPk = 0xA11CE;
    uint256 keyPk = 0xB0B;
    address root;
    address key;

    function setUp() public {
        probe = new X4Probe();
        root = vm.addr(rootPk);
        key = vm.addr(keyPk);
        PATH_USD.transfer(root, 1_000e6);
        for (uint256 i; i < 5; ++i) {
            tokens[i] = StdPrecompiles.TIP20_FACTORY.createToken("Mirror", "MIR", "USD", PATH_USD, address(this), keccak256(abi.encode("x4", i)));
        }
    }

    function _limits(uint256 n) internal view returns (IAccountKeychain.TokenLimit[] memory l) {
        l = new IAccountKeychain.TokenLimit[](n + 1);
        l[0] = IAccountKeychain.TokenLimit(address(PATH_USD), 500e6, 86_400);
        for (uint256 i; i < n; ++i) l[i + 1] = IAccountKeychain.TokenLimit(tokens[i], 10e6, 86_400);
    }

    function _approveScope(address token) internal view returns (IAccountKeychain.CallScope memory s) {
        address[] memory to = new address[](1);
        to[0] = address(probe);
        IAccountKeychain.SelectorRule[] memory r = new IAccountKeychain.SelectorRule[](1);
        r[0] = IAccountKeychain.SelectorRule(APPROVE, to);
        s = IAccountKeychain.CallScope(token, r);
    }

    /// router rebalance + pathUSD approve + `n` token approves (the B.4.3 shape).
    function _scopes(uint256 n) internal view returns (IAccountKeychain.CallScope[] memory s) {
        s = new IAccountKeychain.CallScope[](n + 2);
        IAccountKeychain.SelectorRule[] memory r = new IAccountKeychain.SelectorRule[](1);
        r[0] = IAccountKeychain.SelectorRule(REBALANCE, new address[](0));
        s[0] = IAccountKeychain.CallScope(address(probe), r);
        s[1] = _approveScope(address(PATH_USD));
        for (uint256 i; i < n; ++i) s[i + 2] = _approveScope(tokens[i]);
    }

    function _tx(bytes memory data, address to) internal view returns (TempoTransaction memory t) {
        t = TempoTransactionLib.create().withChainId(uint64(block.chainid)).withGasLimit(29_000_000)
            .withMaxFeePerGas(block.basefee + 1e9).withMaxPriorityFeePerGas(1).withNonce(uint64(vm.getNonce(root)))
            .withFeeToken(address(PATH_USD)).withCall(to, 0, data);
    }

    function test_directAuthorize_fiveTokens_thenFollowSeesKey() public {
        IAccountKeychain.KeyRestrictions memory cfg = IAccountKeychain.KeyRestrictions(uint64(block.timestamp + 30 days), true, _limits(5), false, _scopes(5));
        vm.prank(root, root);
        KEYCHAIN.authorizeKey(key, IAccountKeychain.SignatureType.Secp256k1, cfg);
        console2.log("direct authorizeKey (6 limits, 7 targets, 6 recipients) gas", vm.lastFrameGas().gasTotalUsed);
        vm.prank(root, root);
        probe.check(key);
    }

    function test_keyAuthorizationField_rootSigned_sameTxVisible() public {
        KeyAuthorization memory a = KeyAuthorizationLib.create(uint64(block.chainid), IAccountKeychain.SignatureType.Secp256k1, key)
            .withExpiry(uint64(block.timestamp + 30 days)).withLimits(_limits(5)).withAllowedCalls(_scopes(5));
        TempoTransaction memory t = _tx(abi.encodeCall(X4Probe.check, (key)), address(probe)).withKeyAuthorization(a.sign(rootPk));
        uint256 before = PATH_USD.balanceOf(root);
        vm.executeTransaction(KeychainTx.signRoot(t, rootPk));
        console2.log("root-signed tx with key_authorization + check: fee units", before - PATH_USD.balanceOf(root));
        assertEq(KEYCHAIN.getKey(root, key).keyId, key);
    }

    function test_keySigned_scopesEnforced() public {
        IAccountKeychain.KeyRestrictions memory cfg = IAccountKeychain.KeyRestrictions(uint64(block.timestamp + 30 days), true, _limits(5), false, _scopes(5));
        vm.prank(root, root);
        KEYCHAIN.authorizeKey(key, IAccountKeychain.SignatureType.Secp256k1, cfg);
        TempoTransaction memory t = _tx(abi.encodeCall(ITIP20.approve, (address(probe), 5e6)), address(PATH_USD));
        vm.executeTransaction(KeychainTx.signKey(t, keyPk, root));
        assertEq(PATH_USD.allowance(root, address(probe)), 5e6, "scoped approve landed");
        (uint256 rem,) = KEYCHAIN.getRemainingLimitWithPeriod(root, key, address(PATH_USD));
        console2.log("remaining pathUSD limit after approve 5e6 + self-paid fee", rem);
        TempoTransaction memory bad = _tx(abi.encodeCall(ITIP20.approve, (address(0xBEEF), 1)), address(PATH_USD));
        (bool ok, string memory reason) = KeychainTx.tryExecute(KeychainTx.signKey(bad, keyPk, root));
        assertFalse(ok);
        assertEq(reason, "vm.executeTransaction: transaction reverted: 0x576b38b4", "CallNotAllowed()");
    }
}
