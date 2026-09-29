// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Test} from "forge-std/Test.sol";
import {HookMiner} from "v4-hooks-public/utils/HookMiner.sol";
import {DeployStockGuardHook} from "../../../../script/v4/DeployStockGuardHook.s.sol";

/// The hook-address rules of `script/v4/DeployStockGuardHook.s.sol`: flags exactly 0x20C0, never a `0x91…` address
/// (Uniswap's routing allowlist) nor a `0x20c0…` one (TIP-20 space); the mined salt reproduces through HookMiner.
contract DeployStockGuardHookTest is Test {
    DeployStockGuardHook internal s = new DeployStockGuardHook();

    /// An address whose top two bytes are `top` and whose low 14 bits are `low`.
    function _a(uint16 top, uint160 low) internal pure returns (address) {
        return address((uint160(top) << 144) | low);
    }

    function test_acceptableAddresses() public view {
        assertTrue(s.acceptable(_a(0x1234, 0x20C0)));
        assertFalse(s.acceptable(_a(0x1234, 0x20C1)), "an extra flag bit");
        assertFalse(s.acceptable(_a(0x1234, 0x00C0)), "beforeInitialize missing");
        assertFalse(s.acceptable(_a(0x9134, 0x20C0)), "0x91 prefix");
        assertFalse(s.acceptable(_a(0x20c0, 0x20C0)), "TIP-20 prefix");
        assertTrue(s.acceptable(_a(0x2091, 0x20C0)));
    }

    function test_minedSaltReproducesThroughHookMiner() public view {
        bytes memory initCode = abi.encodePacked(type(Dummy).creationCode, abi.encode(uint256(42)));
        (address at, uint256 salt) = s.mine(keccak256(initCode), 0);
        assertEq(HookMiner.computeAddress(0x4e59b44847b379578588920cA78FbF26c0B4956C, salt, initCode), at);
        assertTrue(s.acceptable(at));
        (address next,) = s.mine(keccak256(initCode), salt + 1);
        assertTrue(next != at);
    }
}

contract Dummy {
    uint256 public x;

    constructor(uint256 x_) {
        x = x_;
    }
}
