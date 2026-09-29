// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {LzPing} from "./LzPing.sol";
import {IEndpointV2Alt} from "./ILZEndpointDollar.sol";
import {LzdFee} from "./LzdFee.sol";

/// @title LzPingTempo — LzPing on Tempo, where the endpoint is EndpointV2Alt and fees are LZEndpointDollar.
/// @notice The caller approves pathUSD to this contract for the quoted fee (6 dp); no `msg.value` is accepted.
contract LzPingTempo is LzPing {
    address public immutable lzd;

    error ValueNotAccepted();

    constructor(address endpoint_, address owner_) LzPing(endpoint_, owner_) {
        lzd = IEndpointV2Alt(endpoint_).nativeToken();
    }

    function _payNative(uint256 nativeFee) internal override returns (uint256) {
        if (msg.value != 0) revert ValueNotAccepted();
        return LzdFee.pay(msg.sender, lzd, address(endpoint), nativeFee);
    }
}
