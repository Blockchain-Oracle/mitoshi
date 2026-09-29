// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

/// @title BridgeRateLimiter — a decaying bucket per endpoint id (plan B.1.1).
/// @notice `inFlight` drains linearly at `capacity / window` per second. Outbound paths call `consume` (reverts when the
///         bucket can't take the amount); inbound paths call `tryConsume` (returns false so the caller can defer instead
///         of reverting inside `lzReceive`). A bucket with capacity 0 admits nothing, so an unset limit is closed.
/// @dev A library over caller-owned storage so the immutable lockbox and the ERC-7201 adapter share one implementation.
library BridgeRateLimiter {
    struct Bucket {
        uint128 capacity;
        uint128 inFlight;
        uint64 lastUpdated;
        uint64 window;
    }

    error RateLimitExceeded(uint256 requested, uint256 available);
    error InvalidWindow();

    /// @notice The in-flight amount after decay at `block.timestamp`.
    function currentInFlight(Bucket storage b) internal view returns (uint256) {
        uint256 inFlight = b.inFlight;
        if (inFlight == 0 || b.window == 0) return inFlight;
        uint256 decay = (uint256(b.capacity) * (block.timestamp - b.lastUpdated)) / b.window;
        return decay >= inFlight ? 0 : inFlight - decay;
    }

    function available(Bucket storage b) internal view returns (uint256) {
        uint256 inFlight = currentInFlight(b);
        return inFlight >= b.capacity ? 0 : b.capacity - inFlight;
    }

    function consume(Bucket storage b, uint256 amount) internal {
        if (!tryConsume(b, amount)) revert RateLimitExceeded(amount, available(b));
    }

    function tryConsume(Bucket storage b, uint256 amount) internal returns (bool) {
        uint256 inFlight = currentInFlight(b);
        uint256 cap = b.capacity;
        if (amount > cap || inFlight > cap - amount) return false;
        b.inFlight = uint128(inFlight + amount);
        b.lastUpdated = uint64(block.timestamp);
        return true;
    }

    /// @notice Sets capacity and window, keeping the decayed in-flight amount (clamped to the new capacity).
    function set(Bucket storage b, uint128 capacity, uint64 window) internal {
        if (window == 0) revert InvalidWindow();
        uint256 inFlight = currentInFlight(b);
        b.inFlight = uint128(inFlight > capacity ? capacity : inFlight);
        b.lastUpdated = uint64(block.timestamp);
        b.capacity = capacity;
        b.window = window;
    }
}
