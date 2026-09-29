// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {EngineWorld} from "./invariant/EngineWorld.sol";

// Ported from Agari 03b30abbbfe7ddc3cac4927c7c573e52f74d2d49:anchor/programs/agari-events/src/matching/tests/random.rs
// (`random_operation_sequences_keep_every_invariant`, `random_sequences_then_settle_and_redeem_every_seat_conserve_exactly`).
/// Deterministic randomized sequences: 12 seeds × 2,500 ops with every invariant checked after every op (refused ops
/// included), then settle and redeem every seat with exact conservation. A failure names the seed and the op index.
contract EngineRandomTest is EngineWorld {
    uint256 internal constant OPS = 2_500;

    /// xorshift64* (Agari's RNG): deterministic, dependency-free.
    function _next(uint256 x) internal pure returns (uint256) {
        x ^= x >> 12;
        x ^= (x << 25) & type(uint64).max;
        x ^= x >> 27;
        return (x * 0x2545F4914F6CDD1D) & type(uint64).max;
    }

    function _run(uint256 seed) internal {
        vm.pauseGasMetering(); // 2,500 real-engine ops at Tempo slot prices exceed any test gas limit
        _buildWorld(keccak256(abi.encode("engine-random", seed)));
        uint256 x = (seed * 0x9E3779B97F4A7C15 | 1) & type(uint64).max;
        for (uint256 i; i < OPS; ++i) {
            x = _next(x);
            handler.step(uint256(keccak256(abi.encode(x))));
            string memory err = checks.check(markets, actors);
            if (bytes(err).length != 0) revert(string.concat("seed ", vm.toString(seed), ", op ", vm.toString(i), ": ", err));
        }
        _assertAll("end of sequence");
        assertGt(handler.ok(), OPS / 4, "enough successful ops");
        emit log_named_uint("fills", handler.fills());
        _settleAndRedeemEveryone(x);
    }

    function test_random_seed01() public { _run(1); }
    function test_random_seed02() public { _run(2); }
    function test_random_seed03() public { _run(3); }
    function test_random_seed04() public { _run(4); }
    function test_random_seed05() public { _run(5); }
    function test_random_seed06() public { _run(6); }
    function test_random_seed07() public { _run(7); }
    function test_random_seed08() public { _run(8); }
    function test_random_seed09() public { _run(9); }
    function test_random_seed10() public { _run(10); }
    function test_random_seed11() public { _run(11); }
    function test_random_seed12() public { _run(12); }
}
