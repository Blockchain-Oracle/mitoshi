// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {StockLockbox} from "../../../src/robinhood/StockLockbox.sol";
import {IEndpointV2Alt} from "../../../src/lz/ILZEndpointDollar.sol";
import {LzdFee} from "../../../src/lz/LzdFee.sol";

/// @notice StockLockbox with its fee paid in LZD instead of `msg.value`, so the whole lock → mint → burn → unlock loop
///         can run inside one Tempo VM (which has no native value). Only `_payNative` differs; every accounting path is
///         the production contract's.
contract LockboxAlt is StockLockbox {
    address public immutable lzd;

    constructor(address stock, address endpoint_, address owner_, address guardian_, uint256 minLockLD_)
        StockLockbox(stock, endpoint_, owner_, guardian_, minLockLD_)
    {
        lzd = IEndpointV2Alt(endpoint_).nativeToken();
    }

    function _payNative(uint256 fee) internal override returns (uint256) {
        return LzdFee.pay(msg.sender, lzd, address(endpoint), fee);
    }
}
