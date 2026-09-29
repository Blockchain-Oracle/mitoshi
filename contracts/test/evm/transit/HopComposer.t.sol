// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {OptionsBuilder} from "@layerzerolabs/oapp-evm/contracts/oapp/libs/OptionsBuilder.sol";
import {SendParam, MessagingFee, MessagingReceipt, OFTReceipt} from "@layerzerolabs/oft-evm/contracts/interfaces/IOFT.sol";
import {OFTComposeMsgCodec} from "@layerzerolabs/oft-evm/contracts/libs/OFTComposeMsgCodec.sol";
import {EnforcedOptionParam} from "@layerzerolabs/oapp-evm/contracts/oapp/interfaces/IOAppOptionsType3.sol";
import {ILayerZeroEndpointV2} from "@layerzerolabs/lz-evm-protocol-v2/contracts/interfaces/ILayerZeroEndpointV2.sol";
import {LzTestBase} from "../../shared/LzTestBase.sol";
import {RemoteOFT} from "../helpers/RemoteOFT.sol";
import {MockStockToken} from "../mocks/MockStockToken.sol";
import {StockLockbox} from "../../../src/robinhood/StockLockbox.sol";
import {TransitOFT} from "../../../src/transit/TransitOFT.sol";
import {HopComposer} from "../../../src/transit/HopComposer.sol";

interface IComposeQueue {
    function composeQueue(address from, address to, bytes32 guid, uint16 index) external view returns (bytes32);
}

/// The testnet mesh in miniature: RH lockbox (1) → Base transit + composer (2) → final OFT (3), and back.
contract HopComposerTest is LzTestBase {
    using OptionsBuilder for bytes;

    uint32 constant RH = 1;
    uint32 constant BASE = 2;
    uint32 constant TEMPO = 3;
    /// The devtools mock ULN/executor/DVN cost far more gas than the live ones; the live figure comes from the Base fork.
    uint128 constant COMPOSE_GAS = 1_500_000;
    address alice = makeAddr("alice");

    MockStockToken stock;
    StockLockbox box;
    TransitOFT transit;
    HopComposer composer;
    RemoteOFT mirror;

    function setUp() public override {
        super.setUp();
        setUpEndpoints(3, LibraryType.UltraLightNode);
        stock = new MockStockToken("TSLA");
        box = new StockLockbox(address(stock), address(endpoints[RH]), address(this), address(this), 1e12);
        transit = new TransitOFT("Transit TSLA", "tTSLA", address(endpoints[BASE]), address(this));
        mirror = new RemoteOFT(address(endpoints[TEMPO]), address(this));
        composer = new HopComposer(address(endpoints[BASE]), address(transit), RH, TEMPO, 1e12, address(this));
        box.setPeer(BASE, _b32(address(transit)));
        transit.setPeer(RH, _b32(address(box)));
        transit.setPeer(TEMPO, _b32(address(mirror)));
        mirror.setPeer(BASE, _b32(address(transit)));
        EnforcedOptionParam[] memory e = new EnforcedOptionParam[](2);
        e[0] = EnforcedOptionParam(TEMPO, 1, OptionsBuilder.newOptions().addExecutorLzReceiveOption(200_000, 0));
        e[1] = EnforcedOptionParam(RH, 1, OptionsBuilder.newOptions().addExecutorLzReceiveOption(200_000, 0));
        transit.setEnforcedOptions(e);
        box.setRateLimits(BASE, 1_000e18, 1 days);
        stock.mint(alice, 100e18);
        vm.deal(alice, 10 ether);
        vm.deal(address(composer), 1 ether);
        vm.prank(alice);
        stock.approve(address(box), type(uint256).max);
    }

    function _hopOptions() internal pure returns (bytes memory) {
        return OptionsBuilder.newOptions().addExecutorLzReceiveOption(150_000, 0).addExecutorLzComposeOption(0, COMPOSE_GAS, 0);
    }

    /// Sends from `oft` to BASE with the hop instructions, delivers the lzReceive, returns what lzCompose needs.
    function _toComposer(address oft, uint32 srcEid, bytes memory inner, uint256 amount)
        internal
        returns (bytes32 guid, bytes memory composeMsg)
    {
        SendParam memory p = SendParam(BASE, _b32(address(composer)), amount, 0, _hopOptions(), inner, "");
        MessagingFee memory fee = StockLockbox(oft).quoteSend(p, false);
        vm.prank(alice);
        (MessagingReceipt memory r, OFTReceipt memory o) = StockLockbox(oft).send{value: fee.nativeFee}(p, fee, alice);
        deliver(BASE, address(transit));
        guid = r.guid;
        composeMsg = OFTComposeMsgCodec.encode(r.nonce, srcEid, o.amountReceivedLD, abi.encodePacked(_b32(alice), inner));
    }

    function _compose(bytes32 guid, bytes memory composeMsg) internal returns (bool ok, bytes memory err) {
        try ILayerZeroEndpointV2(endpoints[BASE]).lzCompose{gas: COMPOSE_GAS}(
            address(transit), address(composer), guid, 0, composeMsg, ""
        ) {
            ok = true;
        } catch (bytes memory e) {
            err = e;
        }
    }

    function test_hopRhToTempo() public {
        (bytes32 guid, bytes memory cm) = _toComposer(address(box), RH, abi.encode(uint256(TEMPO), _b32(alice), 5e18), 5e18);
        assertEq(transit.balanceOf(address(composer)), 5e18, "credited to the composer");
        (bool ok,) = _compose(guid, cm);
        assertTrue(ok);
        assertEq(transit.totalSupply(), 0, "transit supply only exists in flight");
        deliver(TEMPO, address(mirror));
        assertEq(mirror.balanceOf(alice), 5e18);
        assertEq(box.outstanding(BASE), 5e18);
    }

    function test_hopTempoToRh() public {
        (bytes32 g1, bytes memory c1) = _toComposer(address(box), RH, abi.encode(uint256(TEMPO), _b32(alice), 0), 5e18);
        _compose(g1, c1);
        deliver(TEMPO, address(mirror));
        (bytes32 g2, bytes memory c2) = _toComposer(address(mirror), TEMPO, abi.encode(uint256(RH), _b32(alice), 2e18), 2e18);
        (bool ok,) = _compose(g2, c2);
        assertTrue(ok);
        deliver(RH, address(box));
        assertEq(stock.balanceOf(alice), 97e18);
        assertEq(box.outstanding(BASE), 3e18);
        (uint256 locked, uint256 out, uint256 owedLD) = box.reserveView();
        assertEq(locked, out + owedLD);
        assertEq(out, mirror.totalSupply() + transit.totalSupply());
    }

    function test_emptyFloatRevertsAndStaysRetryable() public {
        composer.withdrawEth(payable(address(this)), 1 ether);
        (bytes32 guid, bytes memory cm) = _toComposer(address(box), RH, abi.encode(uint256(TEMPO), _b32(alice), 0), 5e18);
        (bool ok, bytes memory err) = _compose(guid, cm);
        assertFalse(ok);
        assertEq(bytes4(err), HopComposer.InsufficientFloat.selector);
        bytes32 h = IComposeQueue(endpoints[BASE]).composeQueue(address(transit), address(composer), guid, 0);
        assertEq(h, keccak256(cm), "compose still stored");
        vm.deal(address(composer), 1 ether); // anyone tops up and retries
        (ok,) = _compose(guid, cm);
        assertTrue(ok);
        deliver(TEMPO, address(mirror));
        assertEq(mirror.balanceOf(alice), 5e18);
    }

    function test_invalidInstructionsBounceToSource() public {
        bytes[4] memory bad = [
            abi.encode(uint256(99), _b32(alice), 0), // unknown final eid
            abi.encode(uint256(RH), _b32(alice), 0), // back to the source
            abi.encode(uint256(TEMPO), bytes32(0), 0), // zero recipient
            bytes(hex"deadbeef") // malformed
        ];
        for (uint256 i; i < bad.length; i++) {
            (bytes32 guid, bytes memory cm) = _toComposer(address(box), RH, bad[i], 1e18);
            (bool ok,) = _compose(guid, cm);
            assertTrue(ok);
            deliver(RH, address(box));
        }
        assertEq(stock.balanceOf(alice), 100e18, "every bounce came home");
        assertEq(box.outstanding(BASE), 0);
    }

    function test_minLdAboveAmountBounces() public {
        (bytes32 guid, bytes memory cm) = _toComposer(address(box), RH, abi.encode(uint256(TEMPO), _b32(alice), 6e18), 5e18);
        vm.expectEmit(true, true, false, false, address(composer));
        emit HopComposer.Bounced(guid, RH, bytes32(0), 0, bytes32(0), 0);
        _compose(guid, cm);
    }

    function test_onlyEndpointAndTransit() public {
        vm.expectRevert(abi.encodeWithSelector(HopComposer.OnlyEndpoint.selector, address(this)));
        composer.lzCompose(address(transit), bytes32(0), "", address(0), "");
        vm.prank(endpoints[BASE]);
        vm.expectRevert(abi.encodeWithSelector(HopComposer.OnlyTransit.selector, address(mirror)));
        composer.lzCompose(address(mirror), bytes32(0), "", address(0), "");
    }

    function test_withdrawOnlyOwner() public {
        vm.prank(alice);
        vm.expectRevert();
        composer.withdrawEth(payable(alice), 1);
    }

}
