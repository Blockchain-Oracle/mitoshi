// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {console} from "forge-std/Test.sol";
import {Vm} from "forge-std/Vm.sol";
import {Origin} from "@layerzerolabs/oapp-evm/contracts/oapp/OApp.sol";
import {ILayerZeroEndpointV2} from "@layerzerolabs/lz-evm-protocol-v2/contracts/interfaces/ILayerZeroEndpointV2.sol";
import {ForkHelpers} from "../../shared/ForkHelpers.sol";
import {LzNetworks} from "../../../script/lib/LzNetworks.sol";
import {TransitOFT} from "../../../src/transit/TransitOFT.sol";
import {HopComposer} from "../../../src/transit/HopComposer.sol";

/// 14c.12 Base Sepolia fork against the *deployed* TransitTSLA + HopComposerTSLA (peered to the live Moderato adapter by
/// EnsureLzConfig). A credit from RH testnet arrives as the endpoint would deliver it; the real endpoint stores the
/// compose; `lzCompose` through the real endpoint makes the composer quote and send the onward leg to Moderato.
/// Measures the compose gas and the onward fee the composer's float must cover.
contract BaseHopForkTest is ForkHelpers {
    TransitOFT constant TRANSIT = TransitOFT(0x6477350b26d9c44c8c3caE0B7284523d050f4064);
    HopComposer constant COMPOSER = HopComposer(payable(0x984d9E7DDfC041e539CaE85c98627662193dc72F));
    address constant DEPLOYER = 0x900a0F5260b91Fd65D0C2b03D92Cf8013a1F073e;
    address constant ADAPTER_TSLA = 0x5c1069C9F9912D5B8f6250359b5f2FB6F6a426b3;
    address constant LOCKBOX_STANDIN = address(0x10CB0);
    address alice = makeAddr("alice");
    address bob = makeAddr("bob");

    function setUp() public {
        vm.createSelectFork(vm.envOr("BASE_SEPOLIA_RPC_URL", string("https://sepolia.base.org")), 47445913);
        assertEq(TRANSIT.peers(LzNetworks.MODERATO_EID), _b32(ADAPTER_TSLA), "live peer to the Moderato adapter");
        vm.prank(DEPLOYER); // the RH lockbox isn't deployed yet (no RH ETH): stand in for its peer on the fork
        TRANSIT.setPeer(LzNetworks.RH_TESTNET_EID, _b32(LOCKBOX_STANDIN));
    }

    function _arrive(bytes memory inner, uint256 amountSD) internal returns (bytes32 guid, bytes memory composeMsg) {
        bytes memory message = abi.encodePacked(_b32(address(COMPOSER)), uint64(amountSD), _b32(alice), inner);
        vm.recordLogs();
        vm.prank(LzNetworks.BASE_SEPOLIA_ENDPOINT);
        TRANSIT.lzReceive(Origin(LzNetworks.RH_TESTNET_EID, _b32(LOCKBOX_STANDIN), 1), keccak256("hop"), message, address(this), "");
        (guid, composeMsg) = _composeMsg(vm.getRecordedLogs());
    }

    function test_hopToModeratoThroughTheLiveEndpoint() public {
        (bytes32 guid, bytes memory cm) = _arrive(abi.encode(uint256(LzNetworks.MODERATO_EID), _b32(bob), uint256(0)), 5e6);
        assertEq(TRANSIT.balanceOf(address(COMPOSER)), 5e18);
        vm.deal(address(COMPOSER), 0.01 ether);
        vm.recordLogs();
        uint256 g = gasleft();
        ILayerZeroEndpointV2(LzNetworks.BASE_SEPOLIA_ENDPOINT).lzCompose{gas: 400_000}(
            address(TRANSIT), address(COMPOSER), guid, 0, cm, ""
        );
        uint256 used = g - gasleft();
        uint256 fee = 0.01 ether - address(COMPOSER).balance;
        console.log("Base compose gas (endpoint + composer + onward send)", used);
        console.log("Base -> Moderato onward fee, 1M lzReceive gas (wei)", fee);
        assertLt(used, 400_000, "the B.1.5 400k lzCompose budget holds on the live endpoint");
        assertEq(_packetsSent(vm.getRecordedLogs(), LzNetworks.BASE_SEPOLIA_ENDPOINT), 1);
        assertEq(TRANSIT.totalSupply(), 0, "transit supply only in flight");
    }

    function test_emptyFloatLeavesComposeStored() public {
        (bytes32 guid, bytes memory cm) = _arrive(abi.encode(uint256(LzNetworks.MODERATO_EID), _b32(bob), uint256(0)), 1e6);
        vm.deal(address(COMPOSER), 0);
        vm.expectRevert();
        ILayerZeroEndpointV2(LzNetworks.BASE_SEPOLIA_ENDPOINT).lzCompose{gas: 400_000}(
            address(TRANSIT), address(COMPOSER), guid, 0, cm, ""
        );
        (bool ok, bytes memory ret) = LzNetworks.BASE_SEPOLIA_ENDPOINT.staticcall(
            abi.encodeWithSignature("composeQueue(address,address,bytes32,uint16)", address(TRANSIT), address(COMPOSER), guid, uint16(0))
        );
        assertTrue(ok);
        assertEq(abi.decode(ret, (bytes32)), keccak256(cm), "retryable after a top-up");
    }
}
