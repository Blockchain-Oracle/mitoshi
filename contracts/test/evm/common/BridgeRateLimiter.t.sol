// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Test} from "forge-std/Test.sol";
import {BridgeRateLimiter as RL} from "../../../src/common/BridgeRateLimiter.sol";

contract LimiterHarness {
    using RL for RL.Bucket;

    RL.Bucket public b;

    function set(uint128 c, uint64 w) external {
        b.set(c, w);
    }

    function consume(uint256 a) external {
        b.consume(a);
    }

    function tryConsume(uint256 a) external returns (bool) {
        return b.tryConsume(a);
    }

    function available() external view returns (uint256) {
        return b.available();
    }

    function inFlight() external view returns (uint256) {
        return b.currentInFlight();
    }
}

contract BridgeRateLimiterTest is Test {
    LimiterHarness h;

    function setUp() public {
        h = new LimiterHarness();
        vm.warp(1_000_000);
    }

    function test_unsetBucketAdmitsNothing() public {
        assertEq(h.available(), 0);
        assertFalse(h.tryConsume(1));
        vm.expectRevert(abi.encodeWithSelector(RL.RateLimitExceeded.selector, 1, 0));
        h.consume(1);
        assertTrue(h.tryConsume(0));
    }

    function test_consumeUpToCapacityThenRevert() public {
        h.set(100e6, 1 days);
        h.consume(60e6);
        h.consume(40e6);
        assertEq(h.available(), 0);
        vm.expectRevert(abi.encodeWithSelector(RL.RateLimitExceeded.selector, 1, 0));
        h.consume(1);
    }

    function test_linearDecay() public {
        h.set(100e6, 100);
        h.consume(100e6);
        vm.warp(vm.getBlockTimestamp() + 25);
        assertEq(h.inFlight(), 75e6);
        assertEq(h.available(), 25e6);
        vm.warp(vm.getBlockTimestamp() + 1000);
        assertEq(h.available(), 100e6);
    }

    function test_tryConsumeDoesNotMutateOnFailure() public {
        h.set(10, 100);
        h.consume(8);
        assertFalse(h.tryConsume(3));
        assertEq(h.inFlight(), 8);
    }

    function test_lowerCapacityClampsInFlight() public {
        h.set(100, 100);
        h.consume(90);
        h.set(50, 100);
        assertEq(h.inFlight(), 50);
        assertEq(h.available(), 0);
    }

    function test_zeroWindowRejected() public {
        vm.expectRevert(RL.InvalidWindow.selector);
        h.set(1, 0);
    }

    /// Whatever happens, the bucket never admits more than capacity + decay over any interval.
    function testFuzz_neverExceedsCapacityPlusDecay(uint128 cap, uint64 window, uint256[8] memory amounts, uint32[8] memory gaps)
        public
    {
        cap = uint128(bound(cap, 1, 1e30));
        window = uint64(bound(window, 1, 30 days));
        h.set(cap, window);
        uint256 start = vm.getBlockTimestamp();
        uint256 admitted;
        for (uint256 i; i < 8; i++) {
            vm.warp(vm.getBlockTimestamp() + gaps[i] % (2 * uint256(window)));
            uint256 a = bound(amounts[i], 0, uint256(cap));
            if (h.tryConsume(a)) admitted += a;
            assertLe(h.inFlight(), cap);
        }
        uint256 elapsed = vm.getBlockTimestamp() - start;
        assertLe(admitted, uint256(cap) + (uint256(cap) * elapsed) / window + 8);
    }
}
