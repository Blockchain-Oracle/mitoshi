// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {console} from "forge-std/Test.sol";
import {Vm} from "forge-std/Vm.sol";
import {OptionsBuilder} from "@layerzerolabs/oapp-evm/contracts/oapp/libs/OptionsBuilder.sol";
import {Origin} from "@layerzerolabs/oapp-evm/contracts/oapp/OApp.sol";
import {SendParam, MessagingFee} from "@layerzerolabs/oft-evm/contracts/interfaces/IOFT.sol";
import {ITIP20} from "tempo-std/interfaces/ITIP20.sol";
import {ForkHelpers} from "../../shared/ForkHelpers.sol";
import {LzNetworks} from "../../../script/lib/LzNetworks.sol";
import {TIP20MintBurnAdapter} from "../../../src/stocks/TIP20MintBurnAdapter.sol";

/// 14c.12 Moderato fork against the *deployed* AdapterTSLA proxy + bTSLA and the real EndpointV2Alt/LZD: a credit from
/// the live Base transit peer mints to a fresh address (gas measured: the spike's "fresh-address mint gas"), and the
/// holder bridges back through the live endpoint paying the real LZD fee in pathUSD.
contract ModeratoAdapterForkTest is ForkHelpers {
    using OptionsBuilder for bytes;

    TIP20MintBurnAdapter constant ADAPTER = TIP20MintBurnAdapter(0x5c1069C9F9912D5B8f6250359b5f2FB6F6a426b3);
    ITIP20 constant BTSLA = ITIP20(0x20c000000000000000000000a81E861906820FB7);
    ITIP20 constant PATH_USD = ITIP20(0x20C0000000000000000000000000000000000000);
    address constant TRANSIT_TSLA = 0x6477350b26d9c44c8c3caE0B7284523d050f4064;
    address constant FUNDED = 0x900a0F5260b91Fd65D0C2b03D92Cf8013a1F073e;

    function setUp() public {
        vm.createSelectFork(vm.envOr("MODERATO_RPC_URL", string("https://rpc.moderato.tempo.xyz")), 37373557);
        assertEq(ADAPTER.peers(LzNetworks.BASE_SEPOLIA_EID), _b32(TRANSIT_TSLA), "live peer");
    }

    function _credit(address to, uint64 amountSD) internal returns (uint256 used) {
        bytes memory message = abi.encodePacked(_b32(to), amountSD);
        vm.prank(LzNetworks.MODERATO_ENDPOINT);
        uint256 g = gasleft();
        ADAPTER.lzReceive{gas: 1_000_000}(Origin(LzNetworks.BASE_SEPOLIA_EID, _b32(TRANSIT_TSLA), 1), keccak256("m"), message, address(this), "");
        used = g - gasleft();
    }

    function test_freshAddressMintGas() public {
        address fresh = makeAddr("fresh-holder");
        uint256 used = _credit(fresh, 5e6);
        console.log("Moderato adapter lzReceive, fresh holder (gas)", used);
        assertEq(BTSLA.balanceOf(fresh), 5e6);
        assertEq(ADAPTER.mintedNet(), BTSLA.totalSupply());
        assertLt(used, 1_000_000, "fits the D-080 enforced 1M");
        uint256 warm = _credit(fresh, 1e6);
        console.log("Moderato adapter lzReceive, warm holder (gas)", warm);
    }

    function test_bridgeBackPaysRealLzdInPathUsd() public {
        address holder = makeAddr("holder");
        _credit(holder, 5e6);
        vm.prank(FUNDED);
        PATH_USD.transfer(holder, 10e6);
        bytes memory hop = abi.encode(uint256(LzNetworks.RH_TESTNET_EID), _b32(holder), uint256(0));
        SendParam memory p = SendParam(LzNetworks.BASE_SEPOLIA_EID, _b32(address(0x984d9E7DDfC041e539CaE85c98627662193dc72F)), 2e6, 2e6, "", hop, "");
        MessagingFee memory fee = ADAPTER.quoteSend(p, false);
        console.log("Moderato -> Base (hop to RH) fee, LZD 6dp", fee.nativeFee);
        uint256 usd0 = PATH_USD.balanceOf(holder);
        vm.startPrank(holder);
        BTSLA.approve(address(ADAPTER), 2e6);
        PATH_USD.approve(address(ADAPTER), fee.nativeFee);
        vm.recordLogs();
        ADAPTER.send(p, fee, holder);
        vm.stopPrank();
        assertEq(_packetsSent(vm.getRecordedLogs(), LzNetworks.MODERATO_ENDPOINT), 1);
        assertEq(usd0 - PATH_USD.balanceOf(holder), fee.nativeFee, "fee = quote, paid in pathUSD via LZD");
        assertEq(BTSLA.balanceOf(holder), 3e6);
        assertEq(ADAPTER.mintedNet(), BTSLA.totalSupply(), "burned");
    }
}
