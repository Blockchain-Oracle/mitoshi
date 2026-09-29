// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Vm} from "forge-std/Vm.sol";

/// @notice The PoolManager runtime fixture (plan S15a): the exact Tempo mainnet PoolManager runtime, read from the
///         chain into `test/fixtures/v4/PoolManager.runtime.hex` and checked against both networks by
///         `test/fork/v4/ReplayParity.fork.t.sol`. PoolManager is BUSL-1.1, so it is never compiled here; unit tests
///         (e.g. the StockGuardHook tests of S15b) `etch` these bytes instead.
/// @dev Etch only at `ADDRESS`: the runtime's one immutable is its own address (NoDelegateCall), so any other address
///      makes every call revert `DelegateCallNotAllowed`. `owner` (slot 0) starts at zero; set it with `vm.store` if a
///      test needs protocol-fee calls.
library PoolManagerFixture {
    address internal constant ADDRESS = 0x33620f62C5b9B2086dD6b62F4A297A9f30347029;
    bytes32 internal constant CODEHASH = 0xa799e0b85df402e6122bf76fdd94a910b8c509fd882ce3c567e00f0ba020dfa7;
    string internal constant PATH = "test/fixtures/v4/PoolManager.runtime.hex";
    Vm private constant vm = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));

    function runtime() internal view returns (bytes memory code) {
        code = vm.parseBytes(vm.trim(vm.readFile(PATH)));
        require(keccak256(code) == CODEHASH, "PoolManagerFixture: fixture drifted from the mainnet runtime");
    }

    /// @return pm the fixture PoolManager, live at `ADDRESS`
    function etch() internal returns (address pm) {
        vm.etch(ADDRESS, runtime());
        return ADDRESS;
    }
}
