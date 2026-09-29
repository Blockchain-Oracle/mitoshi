// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Test} from "forge-std/Test.sol";
import {StdPrecompiles} from "tempo-std/StdPrecompiles.sol";
import {ReentrancyGuardTransient} from "@openzeppelin/contracts/utils/ReentrancyGuardTransient.sol";
import {TransparentUpgradeableProxy} from "@openzeppelin/contracts/proxy/transparent/TransparentUpgradeableProxy.sol";
import {LibBit} from "solady/utils/LibBit.sol";
import {FixedPointMathLib} from "solady/utils/FixedPointMathLib.sol";
import {IPoolManager} from "v4-core/interfaces/IPoolManager.sol";
import {Hooks} from "v4-core/libraries/Hooks.sol";
import {BaseHook} from "@openzeppelin/uniswap-hooks/base/BaseHook.sol";
import {IPositionManager} from "v4-periphery/interfaces/IPositionManager.sol";

/// S0.5 setup proof: every Tempo-profile library resolves, and the library behaviours the plan relies on hold (D-054).
contract SetupTest is Test {
    function test_precompileAddressesMatchThePlan() public pure {
        assertEq(StdPrecompiles.TIP20_FACTORY_ADDRESS, 0x20Fc000000000000000000000000000000000000);
        assertEq(StdPrecompiles.TIP403_REGISTRY_ADDRESS, 0x403c000000000000000000000000000000000000);
        assertEq(StdPrecompiles.RECEIVE_POLICY_GUARD_ADDRESS, 0xB10C000000000000000000000000000000000000);
        assertEq(StdPrecompiles.ACCOUNT_KEYCHAIN_ADDRESS, 0xaAAAaaAA00000000000000000000000000000000);
        assertEq(StdPrecompiles.SIGNATURE_VERIFIER_ADDRESS, 0x5165300000000000000000000000000000000000);
    }

    /// The engine's bitmap scans must guard empty words: Solady returns 256 for zero (D-054).
    function test_libBitScansReturn256OnZero() public pure {
        assertEq(LibBit.ffs(0), 256);
        assertEq(LibBit.fls(0), 256);
        assertEq(LibBit.ffs(1 << 255), 255);
    }

    /// FairValue must refuse non-positive inputs before `lnWad` (D-054).
    function test_lnWadRevertsOnZero() public {
        vm.expectRevert();
        this.ln(0);
    }

    function ln(int256 x) external pure returns (int256) {
        return FixedPointMathLib.lnWad(x);
    }

    /// StockGuardHook's flags (plan D-022): beforeInitialize | beforeSwap | afterSwap = 0x20C0.
    function test_guardHookFlags() public pure {
        uint160 flags = Hooks.BEFORE_INITIALIZE_FLAG | Hooks.BEFORE_SWAP_FLAG | Hooks.AFTER_SWAP_FLAG;
        assertEq(flags, 0x20C0);
    }

    /// Every library the Tempo profile builds against resolves through the remappings.
    function test_librariesResolve() public pure {
        assertTrue(type(IPoolManager).interfaceId != bytes4(0));
        assertTrue(type(IPositionManager).interfaceId != bytes4(0));
        assertGt(type(TransparentUpgradeableProxy).creationCode.length, 0);
        assertGt(bytes(type(ReentrancyGuardTransient).name).length, 0);
        assertGt(bytes(type(BaseHook).name).length, 0);
    }
}
