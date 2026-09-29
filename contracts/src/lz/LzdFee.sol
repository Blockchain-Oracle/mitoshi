// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {ILZEndpointDollar} from "./ILZEndpointDollar.sol";

interface IERC20Min {
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function approve(address spender, uint256 amount) external returns (bool);
}

// Pattern from FraxFinance/frax-oft-upgradeable@981a7b96:contracts/base/TempoAltTokenBase.sol `_payNativeAltToken`
// (direct-whitelisted branch only).

/// @notice Pays a LayerZero fee on Tempo: the endpoint's native token is LZEndpointDollar (6 dp, 1:1 with whitelisted
///         stablecoins), so `msg.value` is never used. Pull pathUSD from the payer, approve LZD, wrap into the endpoint.
/// @dev We always pay in pathUSD, which LZD whitelists on both networks (plan F-E).
library LzdFee {
    address internal constant PATH_USD = 0x20C0000000000000000000000000000000000000;

    error LzdTransferFailed();

    /// @return 0 — the value `_payNative` must hand to `endpoint.send{value: ...}` on Tempo.
    function pay(address payer, address lzd, address endpoint, uint256 fee) internal returns (uint256) {
        if (fee == 0) return 0;
        if (!IERC20Min(PATH_USD).transferFrom(payer, address(this), fee)) revert LzdTransferFailed();
        IERC20Min(PATH_USD).approve(lzd, fee);
        ILZEndpointDollar(lzd).wrap(PATH_USD, endpoint, fee);
        return 0;
    }
}
