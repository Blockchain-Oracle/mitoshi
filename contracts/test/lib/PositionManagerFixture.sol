// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Vm} from "forge-std/Vm.sol";

/// @notice The v4 PositionManager runtime fixture (S17b): the exact runtime of the replayed PositionManager on Moderato
///         (`0x3fc7…ce11`, mainnet initcode; differs from mainnet only in its EIP-712 chain id and domain separator,
///         D-064), read with `cast code` into `test/fixtures/v4/PositionManager.moderato.runtime.hex`. The contract is
///         never compiled here; unit tests etch these bytes so the launchpad's graduation runs against the real code.
///         `test/fork/v4/CurveGraduation.fork.t.sol` checks the fixture against Moderato.
/// @dev Etch only at `ADDRESS` next to `PoolManagerFixture` (its immutables name the PoolManager `0x3362…7029` and
///      Permit2 `0x0000…78BA3`, which the local Tempo genesis already has). Permits are not used, so the chain id
///      baked into its domain separator does not matter locally.
library PositionManagerFixture {
    address internal constant ADDRESS = 0x3Fc79444F8EACc1894775493Ff3Fa41f1e35Ce11;
    bytes32 internal constant CODEHASH = 0xae0f8bc29d3e3e7d65755b600d28695d66db0933a030bdae53f5600585935d54;
    string internal constant PATH = "test/fixtures/v4/PositionManager.moderato.runtime.hex";
    Vm private constant vm = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));

    function runtime() internal view returns (bytes memory code) {
        code = vm.parseBytes(vm.trim(vm.readFile(PATH)));
        require(keccak256(code) == CODEHASH, "PositionManagerFixture: fixture drifted from the Moderato runtime");
    }

    /// @dev Etching skips the constructor, so the storage it would have written is set here, read from Moderato:
    ///      slots 0/1 = ERC-721 name/symbol (short strings), slot 8 = `nextTokenId` (starts at 1).
    function etch() internal returns (address posm) {
        vm.etch(ADDRESS, runtime());
        vm.store(ADDRESS, bytes32(uint256(0)), 0x556e697377617020763420506f736974696f6e73204e46540000000000000030);
        vm.store(ADDRESS, bytes32(uint256(1)), 0x554e492d56342d504f534d000000000000000000000000000000000000000016);
        vm.store(ADDRESS, bytes32(uint256(8)), bytes32(uint256(1)));
        return ADDRESS;
    }
}
