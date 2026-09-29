// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Test} from "forge-std/Test.sol";
import {IPoolManager} from "v4-core/interfaces/IPoolManager.sol";
import {IPositionManager} from "v4-periphery/interfaces/IPositionManager.sol";
import {IPositionDescriptor} from "v4-periphery/interfaces/IPositionDescriptor.sol";
import {IV4Quoter} from "v4-periphery/interfaces/IV4Quoter.sol";
import {IStateView} from "v4-periphery/interfaces/IStateView.sol";
import {PoolManagerFixture} from "../../lib/PoolManagerFixture.sol";

interface IEip712Domain {
    function eip712Domain()
        external
        view
        returns (bytes1, string memory, string memory, uint256, address, bytes32, uint256[] memory);
}

/// Replay parity (plan S15a, docs/specs/v4-replay.md): the seven contracts replayed onto Moderato carry mainnet's
/// runtime. Rows 1–3, 5, 6 are byte-identical; PositionManager (row 4) and UniversalRouter (row 7) differ only in
/// their EIP-712 immutables (cached chain id + domain separator). Also pins the PoolManager runtime fixture.
contract ReplayParityForkTest is Test {
    address constant POOL_MANAGER = 0x33620f62C5b9B2086dD6b62F4A297A9f30347029;
    address constant DESCRIPTOR_IMPL = 0x269AC84585A8c1012AD913573aDf8a6c9df48897;
    address constant DESCRIPTOR = 0xc73ED2cBa8C347593d1d9120AA0bE8fF88C6FF77;
    address constant POSITION_MANAGER = 0x3Fc79444F8EACc1894775493Ff3Fa41f1e35Ce11;
    address constant QUOTER = 0x20E6487C371a2086F841eF453F85378223DF4f4E;
    address constant STATE_VIEW = 0x21B954fBa3F5ddEbe77Ef2D47A3100c066908B2A;
    address constant UR = 0xA2Dc7d0266f0CC50b3eEaF36c9BFCeCFF1BEea91;

    uint256 mainnetFork;
    uint256 moderatoFork;

    function setUp() public {
        mainnetFork = vm.createFork(vm.envOr("TEMPO_MAINNET_RPC_HTTP_URL", string("https://rpc.tempo.xyz")));
        moderatoFork = vm.createFork(vm.envOr("TEMPO_RPC_HTTP_URL", string("https://rpc.moderato.tempo.xyz")));
    }

    function _code(uint256 fork, address a) internal returns (bytes memory) {
        vm.selectFork(fork);
        return a.code;
    }

    function test_identicalRuntimes() public {
        address[5] memory rows = [POOL_MANAGER, DESCRIPTOR_IMPL, DESCRIPTOR, QUOTER, STATE_VIEW];
        for (uint256 i; i < rows.length; i++) {
            bytes memory mod = _code(moderatoFork, rows[i]);
            assertGt(mod.length, 0, "replayed contract has code on Moderato");
            assertEq(keccak256(mod), keccak256(_code(mainnetFork, rows[i])), "runtime equal on both networks");
        }
    }

    function test_positionManagerDiffersOnlyInEip712() public {
        vm.selectFork(moderatoFork);
        bytes32 dsMod = IPositionManager(POSITION_MANAGER).DOMAIN_SEPARATOR();
        vm.selectFork(mainnetFork);
        bytes32 dsMain = IPositionManager(POSITION_MANAGER).DOMAIN_SEPARATOR();
        assertEq(dsMod, _domain("Uniswap v4 Positions NFT", "", 42431, POSITION_MANAGER));
        assertEq(dsMain, _domain("Uniswap v4 Positions NFT", "", 4217, POSITION_MANAGER));
        _assertEqualAfterMask(POSITION_MANAGER, dsMod, dsMain);
    }

    function test_universalRouterDiffersOnlyInEip712() public {
        vm.selectFork(moderatoFork);
        (, string memory name, string memory version, uint256 idMod,,,) = IEip712Domain(UR).eip712Domain();
        vm.selectFork(mainnetFork);
        (,,, uint256 idMain,,,) = IEip712Domain(UR).eip712Domain();
        assertEq(idMod, 42431);
        assertEq(idMain, 4217);
        assertEq(name, "UniversalRouter");
        assertEq(version, "2");
        _assertEqualAfterMask(UR, _domain(name, version, 42431, UR), _domain(name, version, 4217, UR));
    }

    function test_immutablesPointAtTheReplayedSet() public {
        vm.selectFork(moderatoFork);
        assertEq(address(IPositionManager(POSITION_MANAGER).poolManager()), POOL_MANAGER);
        assertEq(address(IV4Quoter(QUOTER).poolManager()), POOL_MANAGER);
        assertEq(address(IStateView(STATE_VIEW).poolManager()), POOL_MANAGER);
        assertEq(address(IPositionDescriptor(DESCRIPTOR).poolManager()), POOL_MANAGER);
        assertEq(_addr(POSITION_MANAGER, "tokenDescriptor()"), DESCRIPTOR);
        bytes32 impl = vm.load(DESCRIPTOR, 0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc);
        assertEq(address(uint160(uint256(impl))), DESCRIPTOR_IMPL);
        assertEq(_addr(UR, "poolManager()"), POOL_MANAGER);
        // Fresh replay: no pools yet is not assumed; the PoolManager answers its own state reads.
        assertEq(IPoolManager(POOL_MANAGER).protocolFeeController(), address(0));
    }

    function test_poolManagerFixtureMatchesBothNetworks() public {
        bytes memory fixture = PoolManagerFixture.runtime();
        assertEq(keccak256(fixture), keccak256(_code(mainnetFork, POOL_MANAGER)));
        assertEq(keccak256(fixture), keccak256(_code(moderatoFork, POOL_MANAGER)));
    }

    // ── helpers ────────────────────────────────────────────────────────────────────────────────────────────────────

    function _addr(address target, string memory sig) internal view returns (address) {
        (bool ok, bytes memory ret) = target.staticcall(abi.encodeWithSignature(sig));
        require(ok, sig);
        return abi.decode(ret, (address));
    }

    /// EIP-712 domain separator; an empty `version` means the domain has no version field (EIP712_v4).
    function _domain(string memory name, string memory version, uint256 chainId, address verifying)
        internal
        pure
        returns (bytes32)
    {
        if (bytes(version).length == 0) {
            return keccak256(
                abi.encode(
                    keccak256("EIP712Domain(string name,uint256 chainId,address verifyingContract)"),
                    keccak256(bytes(name)),
                    chainId,
                    verifying
                )
            );
        }
        return keccak256(
            abi.encode(
                keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
                keccak256(bytes(name)),
                keccak256(bytes(version)),
                chainId,
                verifying
            )
        );
    }

    /// Zeroes each aligned (Moderato word, mainnet word) pair of the two EIP-712 immutables, then requires equality.
    function _assertEqualAfterMask(address a, bytes32 dsMod, bytes32 dsMain) internal {
        bytes memory modCode = _code(moderatoFork, a);
        bytes memory mainCode = _code(mainnetFork, a);
        assertEq(modCode.length, mainCode.length);
        uint256 masked = _mask(modCode, mainCode, bytes32(uint256(42431)), bytes32(uint256(4217)))
            + _mask(modCode, mainCode, dsMod, dsMain);
        assertGe(masked, 2, "both immutables found");
        assertTrue(keccak256(modCode) != keccak256(_code(mainnetFork, a)), "raw runtimes do differ");
        assertEq(keccak256(modCode), keccak256(mainCode), "equal once the EIP-712 immutables are masked");
    }

    function _mask(bytes memory modCode, bytes memory mainCode, bytes32 wMod, bytes32 wMain) internal pure returns (uint256 n) {
        for (uint256 i; i + 32 <= modCode.length; i++) {
            bytes32 x;
            bytes32 y;
            assembly {
                x := mload(add(add(modCode, 32), i))
                y := mload(add(add(mainCode, 32), i))
            }
            if (x == wMod && y == wMain) {
                assembly {
                    mstore(add(add(modCode, 32), i), 0)
                    mstore(add(add(mainCode, 32), i), 0)
                }
                n++;
                i += 31;
            }
        }
    }
}
