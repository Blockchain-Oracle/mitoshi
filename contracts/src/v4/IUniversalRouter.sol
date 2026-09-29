// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice The two entry points of the pinned UniversalRouter `0xa2dc7d0266f0cc50b3eeaf36c9bfcecff1beea91` (plan D-021)
///         and its errors we decode. Written from the router's public ABI; the router's own GPL source is not vendored,
///         and its bytecode is only ever replayed (docs/specs/v4-replay.md), never compiled here.
interface IUniversalRouter {
    error ExecutionFailed(uint256 commandIndex, bytes message);
    error TransactionDeadlinePassed();
    error LengthMismatch();
    error InvalidCommandType(uint256 commandType);

    /// @param commands one byte per command (V4_SWAP = 0x10)
    /// @param inputs   one ABI-encoded input per command
    /// @param deadline unix seconds after which the call reverts
    function execute(bytes calldata commands, bytes[] calldata inputs, uint256 deadline) external;

    function execute(bytes calldata commands, bytes[] calldata inputs) external;
}
