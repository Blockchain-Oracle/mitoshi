// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {OFT} from "@layerzerolabs/oft-evm/contracts/OFT.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IEndpointV2Alt} from "../../src/lz/ILZEndpointDollar.sol";
import {LzdFee} from "../../src/lz/LzdFee.sol";

/// @notice The remote end of a mesh when a test runs on Tempo (no native value): a plain OFT whose endpoint is an
///         EndpointV2Alt paid in LZD, exactly like our Tempo OApps. `forgeMint` models a compromised remote.
contract RemoteOFTAlt is OFT {
    address public immutable lzd;

    constructor(address endpoint_, address owner_) OFT("Remote", "RMT", endpoint_, owner_) Ownable(owner_) {
        lzd = IEndpointV2Alt(endpoint_).nativeToken();
    }

    function forgeMint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    function _payNative(uint256 fee) internal override returns (uint256) {
        return LzdFee.pay(msg.sender, lzd, address(endpoint), fee);
    }
}
