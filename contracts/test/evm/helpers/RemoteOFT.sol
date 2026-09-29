// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {OFT} from "@layerzerolabs/oft-evm/contracts/OFT.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// @notice The remote end of a lockbox mesh in unit tests: a plain LayerZero OFT. `forgeMint` exists only to model a
///         compromised remote that tries to release more than was locked.
contract RemoteOFT is OFT {
    constructor(address endpoint_, address owner_) OFT("Remote", "RMT", endpoint_, owner_) Ownable(owner_) {}

    function forgeMint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}
