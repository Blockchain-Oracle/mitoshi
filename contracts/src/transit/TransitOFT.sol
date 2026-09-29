// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {OFT} from "@layerzerolabs/oft-evm/contracts/OFT.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// @title TransitOFT — the Base Sepolia leg of the testnet mesh (plan B.1.3, ST-06; testnet only).
/// @notice A plain 18-dp burn/mint OFT per ticker (shared decimals 6). Its peers are the RH testnet lockbox (40451) and
///         the Moderato adapter (40444). Supply is non-zero only while a hop is in flight through `HopComposer`.
contract TransitOFT is OFT {
    constructor(string memory name_, string memory symbol_, address endpoint_, address owner_)
        OFT(name_, symbol_, endpoint_, owner_)
        Ownable(owner_)
    {}
}
