// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {StdTokens} from "tempo-std/StdTokens.sol";
import {StdPrecompiles} from "tempo-std/StdPrecompiles.sol";
import {IAccountKeychain} from "tempo-std/interfaces/IAccountKeychain.sol";
import {TempoCall, TempoTransaction, TempoTransactionLib} from "tempo-std/tx/TempoTransactionLib.sol";
import {IEventVault} from "../../../src/products/vault/IEventVault.sol";
import {IStrategyRegistry} from "../../../src/products/strategy/IStrategyRegistry.sol";
import {KeychainTx} from "../../lib/KeychainTx.sol";
import {StrategyTestBase} from "../harness/StrategyTestBase.sol";

/// Real Tempo transactions through the protocol's handler (`vm.executeTransaction`, `test/lib/KeychainTx.sol`): copy is
/// one root-signed batch (grant + approve + subscribe, L-53), and a strategy's metadata — an SSTORE2 CREATE — is written
/// by the root key only (D-019): an access key, even an unrestricted one, is refused by name.
contract StrategyRegistryKeysTest is StrategyTestBase {
    using TempoTransactionLib for TempoTransaction;

    string internal constant TX_REVERTED = "vm.executeTransaction: transaction reverted: ";
    uint256 internal ownerPk = uint256(keccak256(abi.encodePacked("owner")));
    uint256 internal creatorPk = uint256(keccak256(abi.encodePacked("creator")));
    uint256 internal keyPk = 0x5EC0;

    function setUp() public override {
        super.setUp();
        assertEq(vm.addr(ownerPk), owner);
        assertEq(vm.addr(creatorPk), creator);
        // Fees are paid in pathUSD.
        StdTokens.PATH_USD.transfer(owner, 1_000e6);
        StdTokens.PATH_USD.transfer(creator, 1_000e6);
    }

    function _tx(address from, TempoCall[] memory calls) internal view returns (TempoTransaction memory) {
        return TempoTransactionLib.create().withChainId(uint64(block.chainid)).withGasLimit(29_000_000).withMaxFeePerGas(1e9)
            .withMaxPriorityFeePerGas(1).withNonce(uint64(vm.getNonce(from))).withFeeToken(address(StdTokens.PATH_USD)).withCalls(calls);
    }

    function _one(address to, bytes memory data) internal pure returns (TempoCall[] memory calls) {
        calls = new TempoCall[](1);
        calls[0] = TempoCall({to: to, value: 0, data: data});
    }

    function _publish(bytes memory metadata) internal view returns (TempoCall[] memory) {
        return _one(address(registry), abi.encodeCall(registry.publish, (runner, keccak256("k"), metadata, caps(5 * ONE, 20 * ONE, 1, 0), 0, 0)));
    }

    function test_copyIsOneRootSignedTransaction() public {
        TempoCall[] memory calls = new TempoCall[](3);
        calls[0] = TempoCall({
            to: address(vault),
            value: 0,
            data: abi.encodeCall(vault.grant, (IEventVault.GrantKind.STRATEGY, runner, caps(20 * ONE, 100 * ONE, 2, 0), uint64(block.timestamp + 7 days), 100 * ONE))
        });
        calls[1] = TempoCall({to: address(usd), value: 0, data: abi.encodeCall(IERC20.approve, (address(registry), FEE))});
        // Grant 0: the STRATEGY grant this same batch just made.
        calls[2] = TempoCall({to: address(registry), value: 0, data: abi.encodeCall(registry.subscribe, (strategyId, 0, IStrategyRegistry.Mode.FOLLOW, FEE))});
        uint256 creatorBefore = usd.balanceOf(creator);
        (bool ok, string memory reason) = KeychainTx.tryExecute(KeychainTx.signRoot(_tx(owner, calls), ownerPk));
        assertTrue(ok, reason);
        uint256 grantId = vault.activeGrantOf(owner, IEventVault.GrantKind.STRATEGY);
        assertGt(grantId, 0);
        assertEq(registry.subscriptionOf(strategyId, owner).grantId, grantId);
        assertTrue(registry.isSubscriptionLive(strategyId, owner));
        assertEq(usd.balanceOf(creator), creatorBefore + FEE);
    }

    function test_metadataWriteRefusedUnderAccessKey() public {
        vm.prank(creator, creator);
        StdPrecompiles.ACCOUNT_KEYCHAIN.authorizeKey(
            vm.addr(keyPk),
            IAccountKeychain.SignatureType.Secp256k1,
            IAccountKeychain.KeyRestrictions(uint64(vm.getBlockTimestamp() + 30 days), false, new IAccountKeychain.TokenLimit[](0), true, new IAccountKeychain.CallScope[](0))
        );
        uint256 before = registry.strategyCount();

        (bool ok, string memory reason) = KeychainTx.tryExecute(KeychainTx.signKey(_tx(creator, _publish(META)), keyPk, creator));
        assertFalse(ok, "an access key must not write metadata");
        assertEq(reason, string.concat(TX_REVERTED, vm.toString(abi.encodeWithSelector(IStrategyRegistry.MetadataNeedsRootKey.selector))));
        assertEq(registry.strategyCount(), before);

        // The same key may publish without metadata (no CREATE) ...
        (ok, reason) = KeychainTx.tryExecute(KeychainTx.signKey(_tx(creator, _publish("")), keyPk, creator));
        assertTrue(ok, reason);
        assertEq(registry.strategyOf(before + 1).metadataPointer, address(0));
        // ... and the root key writes it.
        (ok, reason) = KeychainTx.tryExecute(KeychainTx.signRoot(_tx(creator, _publish(META)), creatorPk));
        assertTrue(ok, reason);
        assertEq(registry.metadataOf(before + 2), META);
    }
}
