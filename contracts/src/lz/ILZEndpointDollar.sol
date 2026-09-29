// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

// Pattern from FraxFinance/frax-oft-upgradeable@981a7b96:contracts/base/TempoAltTokenBase.sol (UNLICENSED; only the
// call sequence is reused, no code).

/// @notice The subset of LayerZero's `LZEndpointDollar` (Tempo's EndpointV2Alt native token) this repo calls.
/// @dev Selectors checked against the Moderato implementation `0xc7039b97b44eb493b105d9ae67ecc885bc809add` behind
///      proxy `0x0e81579b25c9c458a2030824b7fdbd0194900803` (wrap 0x62355638, isWhitelistedToken 0xab37f486).
interface ILZEndpointDollar {
    function wrap(address token, address to, uint256 amount) external;
    function isWhitelistedToken(address token) external view returns (bool);
    function getWhitelistedTokens() external view returns (address[] memory);
}

/// @notice `EndpointV2Alt.nativeToken()` (lz-evm-protocol-v2 `EndpointV2Alt.sol:49`).
interface IEndpointV2Alt {
    function nativeToken() external view returns (address);
}
