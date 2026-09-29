// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Test} from "forge-std/Test.sol";
import {OptionsBuilder} from "@layerzerolabs/oapp-evm/contracts/oapp/libs/OptionsBuilder.sol";
import {SendParam, MessagingFee, IOFT} from "@layerzerolabs/oft-evm/contracts/interfaces/IOFT.sol";
import {MockStockToken} from "../mocks/MockStockToken.sol";
import {RemoteOFT} from "../helpers/RemoteOFT.sol";
import {StockLockbox} from "../../../src/robinhood/StockLockbox.sol";
import {TransitOFT} from "../../../src/transit/TransitOFT.sol";

interface IHopMesh {
    function pending(uint32 dstEid, address dst) external view returns (uint256);
    function deliverOne(uint32 dstEid, address dst) external returns (bool);
    function pendingComposes() external view returns (uint256);
    function composeOne() external returns (bool);
}

/// Drives the testnet mesh RH lockbox (1) → Base transit + composer (2) → final OFT (3) and back, including refusals
/// on RH (blocked recipient → owed) and composer bounces (bad instructions).
contract HopHandler is Test {
    using OptionsBuilder for bytes;

    uint32 constant RH = 1;
    uint32 constant BASE = 2;
    uint32 constant FINAL = 3;

    IHopMesh immutable mesh;
    MockStockToken public immutable stock;
    StockLockbox public immutable box;
    TransitOFT public immutable transit;
    RemoteOFT public immutable remote;
    address public immutable composer;
    address[3] public actors;
    uint256 public hopsOut;
    uint256 public hopsBack;
    uint256 public bounces;

    constructor(IHopMesh m, MockStockToken s, StockLockbox b, TransitOFT t, RemoteOFT r, address c, address[3] memory who) {
        (mesh, stock, box, transit, remote, composer, actors) = (m, s, b, t, r, c, who);
    }

    function _opts() internal pure returns (bytes memory) {
        return OptionsBuilder.newOptions().addExecutorLzReceiveOption(300_000, 0).addExecutorLzComposeOption(0, 1_500_000, 0);
    }

    function _send(address oft, address from, uint32 finalEid, address to, uint256 amount, bool bad) internal returns (bool ok) {
        bytes memory inner = bad ? bytes(hex"00") : abi.encode(uint256(finalEid), bytes32(uint256(uint160(to))), uint256(0));
        SendParam memory p = SendParam(BASE, bytes32(uint256(uint160(composer))), amount, 0, _opts(), inner, "");
        MessagingFee memory fee = IOFT(oft).quoteSend(p, false);
        vm.deal(from, fee.nativeFee);
        vm.prank(from);
        try IOFT(oft).send{value: fee.nativeFee}(p, fee, from) {
            ok = true;
        } catch {}
    }

    function lockViaHop(uint256 who, uint256 amount, bool bad) external {
        address a = actors[who % 3];
        amount = bound(amount, 1e12, 20e18);
        stock.mint(a, amount);
        vm.prank(a);
        stock.approve(address(box), amount);
        if (_send(address(box), a, FINAL, actors[(who + 1) % 3], amount, bad)) {
            hopsOut++;
            if (bad) bounces++;
        }
    }

    function redeemViaHop(uint256 who, uint256 amount, bool bad) external {
        address a = actors[who % 3];
        uint256 bal = remote.balanceOf(a);
        if (bal < 1e12) return;
        amount = bound(amount, 1e12, bal);
        amount -= amount % 1e12;
        if (_send(address(remote), a, RH, actors[(who + 2) % 3], amount, bad)) {
            hopsBack++;
            if (bad) bounces++;
        }
    }

    function deliverBase() public {
        if (mesh.pending(BASE, address(transit)) > 0) mesh.deliverOne(BASE, address(transit));
    }

    function compose() public {
        if (mesh.pendingComposes() > 0) mesh.composeOne();
    }

    function deliverFinal() public {
        if (mesh.pending(FINAL, address(remote)) > 0) mesh.deliverOne(FINAL, address(remote));
    }

    function deliverRh() public {
        if (mesh.pending(RH, address(box)) > 0) mesh.deliverOne(RH, address(box));
    }

    function blockOnRh(uint256 who, bool b) external {
        stock.ACCESS_CONTROLLED_REGISTRY().setBlocked(actors[who % 3], b);
    }

    function claimOwed(uint256 who) external {
        vm.prank(actors[who % 3]);
        try box.claim() {} catch {}
    }

    function _drain() internal {
        for (uint256 guard; guard < 200; guard++) {
            bool idle = mesh.pending(BASE, address(transit)) == 0 && mesh.pendingComposes() == 0
                && mesh.pending(FINAL, address(remote)) == 0 && mesh.pending(RH, address(box)) == 0;
            if (idle) return;
            deliverBase();
            compose();
            deliverFinal();
            deliverRh();
        }
    }

    function settleAll() external {
        for (uint256 i; i < 3; i++) stock.ACCESS_CONTROLLED_REGISTRY().setBlocked(actors[i], false);
        _drain();
        for (uint256 i; i < 3; i++) {
            uint256 bal = remote.balanceOf(actors[i]);
            if (bal > 0) _send(address(remote), actors[i], RH, actors[i], bal, false);
        }
        _drain();
        for (uint256 i; i < 3; i++) {
            vm.prank(actors[i]);
            try box.claim() {} catch {}
        }
    }
}
