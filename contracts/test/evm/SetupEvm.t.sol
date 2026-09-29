// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Test} from "forge-std/Test.sol";
import {OFTAdapter} from "@layerzerolabs/oft-evm/contracts/OFTAdapter.sol";
import {OFT} from "@layerzerolabs/oft-evm/contracts/OFT.sol";
import {OptionsBuilder} from "@layerzerolabs/oapp-evm/contracts/oapp/libs/OptionsBuilder.sol";

/// S0.5 setup proof for the `evm` profile (Robinhood Chain + Base Sepolia side): LayerZero V2 resolves from npm.
contract SetupEvmTest is Test {
    using OptionsBuilder for bytes;

    function test_layerZeroResolves() public pure {
        bytes memory options = OptionsBuilder.newOptions().addExecutorLzReceiveOption(550_000, 0);
        assertGt(options.length, 0);
        assertGt(bytes(type(OFTAdapter).name).length, 0);
        assertGt(bytes(type(OFT).name).length, 0);
    }
}
