// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Test} from "forge-std/Test.sol";
import {OptionsBuilder} from "@layerzerolabs/oapp-evm/contracts/oapp/libs/OptionsBuilder.sol";
import {SendParam, MessagingFee} from "@layerzerolabs/oft-evm/contracts/interfaces/IOFT.sol";
import {ITIP20} from "tempo-std/interfaces/ITIP20.sol";
import {ITIP20RolesAuth} from "tempo-std/interfaces/ITIP20RolesAuth.sol";
import {MockStockToken} from "../../evm/mocks/MockStockToken.sol";
import {LockboxAlt} from "./LockboxAlt.sol";
import {TIP20MintBurnAdapter} from "../../../src/stocks/TIP20MintBurnAdapter.sol";

interface IDeliverer {
    function deliverOne(uint32 dstEid, address dst) external returns (bool delivered);
    function pending(uint32 dstEid, address dst) external view returns (uint256);
}

/// Drives the direct bridge (RH lockbox ⇄ Tempo adapter) with random locks, burns, deliveries and every refusal the
/// design defers on (mirror paused, supply cap, recipient blocked on RH), tracking what is in flight.
contract BridgeHandler is Test {
    using OptionsBuilder for bytes;

    uint32 constant RH = 1;
    uint32 constant TEMPO = 2;
    ITIP20 constant PATH_USD = ITIP20(0x20C0000000000000000000000000000000000000);

    IDeliverer immutable lz;
    MockStockToken public immutable stock;
    LockboxAlt public immutable box;
    TIP20MintBurnAdapter public immutable adapter;
    ITIP20 public immutable mirror;
    address[3] public actors;

    uint256 public inFlightToTempoSD;
    uint256 public inFlightToRhSD;
    /// Coverage ghosts: how often each money path actually ran.
    uint256 public locks;
    uint256 public burns;
    uint256 public defersSeen;
    uint256 public owedSeen;

    constructor(IDeliverer lz_, MockStockToken s, LockboxAlt b, TIP20MintBurnAdapter a, ITIP20 m, address[3] memory who) {
        (lz, stock, box, adapter, mirror, actors) = (lz_, s, b, a, m, who);
    }

    function _actor(uint256 seed) internal view returns (address) {
        return actors[seed % 3];
    }

    function _opts() internal pure returns (bytes memory) {
        return OptionsBuilder.newOptions().addExecutorLzReceiveOption(1_000_000, 0);
    }

    function lock(uint256 who, uint256 amount) external {
        address a = _actor(who);
        amount = bound(amount, 1e12, 50e18);
        stock.mint(a, amount);
        SendParam memory p = SendParam(TEMPO, bytes32(uint256(uint160(_actor(who + 1)))), amount, 0, _opts(), "", "");
        MessagingFee memory fee = box.quoteSend(p, false);
        vm.startPrank(a);
        stock.approve(address(box), amount);
        PATH_USD.approve(address(box), fee.nativeFee);
        try box.send(p, fee, a) {
            inFlightToTempoSD += amount / 1e12;
            locks++;
        } catch {}
        vm.stopPrank();
    }

    function burn(uint256 who, uint256 amountSD) external {
        address a = _actor(who);
        uint256 bal = mirror.balanceOf(a);
        if (bal == 0 || adapter.sendsPaused()) return;
        amountSD = bound(amountSD, 1, bal);
        SendParam memory p = SendParam(RH, bytes32(uint256(uint160(_actor(who + 2)))), amountSD, 0, _opts(), "", "");
        MessagingFee memory fee = adapter.quoteSend(p, false);
        vm.startPrank(a);
        mirror.approve(address(adapter), amountSD);
        PATH_USD.approve(address(adapter), fee.nativeFee);
        try adapter.send(p, fee, a) {
            inFlightToRhSD += amountSD;
            burns++;
        } catch {}
        vm.stopPrank();
    }

    function deliverToTempo() public {
        if (lz.pending(TEMPO, address(adapter)) == 0) return;
        uint256 before = lz.pending(TEMPO, address(adapter));
        // amount is read back from what changed: supply + deferred
        uint256 s0 = mirror.totalSupply() + adapter.totalDeferred();
        uint256 d0 = adapter.totalDeferred();
        if (lz.deliverOne(TEMPO, address(adapter))) inFlightToTempoSD -= mirror.totalSupply() + adapter.totalDeferred() - s0;
        if (adapter.totalDeferred() > d0) defersSeen++;
        assertEq(lz.pending(TEMPO, address(adapter)), before - 1);
    }

    function deliverToRh() public {
        if (lz.pending(RH, address(box)) == 0) return;
        uint256 out0 = box.totalOutstanding();
        uint256 o0 = box.totalOwed();
        if (lz.deliverOne(RH, address(box))) inFlightToRhSD -= (out0 - box.totalOutstanding()) / 1e12;
        if (box.totalOwed() > o0) owedSeen++;
    }

    function claimDeferred(uint256 who) external {
        vm.prank(_actor(who));
        try adapter.claimDeferred() {} catch {}
    }

    function claimOwed(uint256 who) external {
        vm.prank(_actor(who));
        try box.claim() {} catch {}
    }

    function toggleMirrorPause(bool p) external {
        if (p && !mirror.paused()) mirror.pause();
        else if (!p && mirror.paused()) mirror.unpause();
    }

    function setCap(uint256 cap) external {
        cap = bound(cap, mirror.totalSupply(), 1_000e6);
        mirror.setSupplyCap(cap);
    }

    function blockOnRh(uint256 who, bool b) external {
        stock.ACCESS_CONTROLLED_REGISTRY().setBlocked(_actor(who), b);
    }

    /// Settle everything: lift every refusal, deliver, claim, send all mirrors home, deliver, claim.
    function settleAll() external {
        if (mirror.paused()) mirror.unpause();
        mirror.setSupplyCap(type(uint128).max);
        for (uint256 i; i < 3; i++) stock.ACCESS_CONTROLLED_REGISTRY().setBlocked(actors[i], false);
        while (lz.pending(TEMPO, address(adapter)) > 0) deliverToTempo();
        for (uint256 i; i < 3; i++) {
            vm.prank(actors[i]);
            try adapter.claimDeferred() {} catch {}
            uint256 bal = mirror.balanceOf(actors[i]);
            if (bal > 0) this.burn(i, bal);
        }
        while (lz.pending(RH, address(box)) > 0) deliverToRh();
        for (uint256 i; i < 3; i++) {
            vm.prank(actors[i]);
            try box.claim() {} catch {}
        }
    }
}
