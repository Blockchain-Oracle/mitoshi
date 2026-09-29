// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Test, console} from "forge-std/Test.sol";
import {OptionsBuilder} from "@layerzerolabs/oapp-evm/contracts/oapp/libs/OptionsBuilder.sol";
import {MessagingFee} from "@layerzerolabs/oapp-evm/contracts/oapp/OApp.sol";
import {ITIP20} from "tempo-std/interfaces/ITIP20.sol";
import {LzNetworks} from "../../../script/lib/LzNetworks.sol";
import {LzPingTempo} from "../../../src/lz/LzPingTempo.sol";

/// Spike X1 on a Moderato fork: the real EndpointV2Alt (40444) and the real LZEndpointDollar take the fee in pathUSD;
/// a quote to Base Sepolia (40245) is priced by the real executor and LayerZero Labs DVN.
contract LzPingTempoForkTest is Test {
    using OptionsBuilder for bytes;

    address constant ENDPOINT = LzNetworks.MODERATO_ENDPOINT;
    address constant LZD = LzNetworks.MODERATO_LZD;
    ITIP20 constant PATH_USD = ITIP20(0x20C0000000000000000000000000000000000000);
    /// Funded testnet deployer (acceptance/S0.md); only impersonated on the fork.
    address constant FUNDED = 0x900a0F5260b91Fd65D0C2b03D92Cf8013a1F073e;
    uint32 constant BASE_SEPOLIA = 40245;

    LzPingTempo ping;

    function setUp() public {
        vm.createSelectFork(vm.envOr("MODERATO_RPC_URL", string("https://rpc.moderato.tempo.xyz")), 37363418);
        ping = new LzPingTempo(ENDPOINT, address(this));
        ping.setPeer(BASE_SEPOLIA, bytes32(uint256(uint160(address(0xB0B)))));
    }

    function test_nativeTokenIsLzd() public view {
        assertEq(ping.lzd(), LZD);
    }

    function test_pingPaysInPathUsdThroughLzd() public {
        bytes memory opts = OptionsBuilder.newOptions().addExecutorLzReceiveOption(100_000, 0);
        MessagingFee memory fee = ping.quotePing(BASE_SEPOLIA, opts);
        console.log("Moderato->BaseSepolia LZD fee (6dp)", fee.nativeFee);
        assertGt(fee.nativeFee, 0);
        uint256 before = PATH_USD.balanceOf(FUNDED);
        uint256 lzdSupply = ITIP20(LZD).totalSupply();
        uint256 pingBefore = PATH_USD.balanceOf(address(ping)); // the fork's default deploy address may hold pathUSD
        vm.startPrank(FUNDED);
        PATH_USD.approve(address(ping), fee.nativeFee);
        ping.ping(BASE_SEPOLIA, opts);
        vm.stopPrank();
        assertEq(before - PATH_USD.balanceOf(FUNDED), fee.nativeFee, "exactly the quoted fee in pathUSD");
        assertEq(ITIP20(LZD).totalSupply() - lzdSupply, fee.nativeFee, "wrapped 1:1 into LZD");
        assertEq(PATH_USD.balanceOf(address(ping)), pingBefore, "nothing stays in the OApp");
    }

    /// Tempo has no native value; the call reverts (at the protocol level on Tempo, or `ValueNotAccepted` elsewhere).
    function test_valueRejected() public {
        vm.deal(address(this), 1 ether);
        vm.expectRevert();
        ping.ping{value: 1}(BASE_SEPOLIA, "");
    }
}
