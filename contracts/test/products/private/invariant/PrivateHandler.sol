// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Test} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IEventsEngine} from "../../../../src/engine/interfaces/IEventsEngine.sol";
import {IEngineLens, MarketRef} from "../../../../src/engine/interfaces/IEngineLens.sol";
import {IPrivateDesk} from "../../../../src/products/private/IPrivateDesk.sol";
import {PrivateDesk} from "../../../../src/products/private/PrivateDesk.sol";
import {PrintSigner} from "../../../engine/harness/PrintSigner.sol";
import {Policies} from "../../../engine/harness/Policies.sol";
import "../../../../src/engine/EngineTypes.sol";

/// Drives the real private desk on the real engine (Foundry handler pattern: bounded inputs, pranked actors; the fuzzer
/// targets only `step`) — Agari's D-117 randomized balance sheet: owners deposit, allow, revoke and withdraw; the desk
/// charges, funds slots, mints, sweeps and credits (sometimes dishonestly: more than the pool, an owner without a
/// budget, a used key); anyone settles; the clock moves and Windows print or void on the engine.
contract PrivateHandler is Test {
    uint256 internal constant ONE = 1e6;

    PrivateDesk public immutable desk;
    IEventsEngine public immutable engine;
    IEngineLens public immutable lens;
    IERC20 public immutable usd;
    address public immutable deskKey;
    address[] public owners;
    bytes32[] public markets;
    bytes32[] public slots;
    uint256 public immutable horizon;
    uint256 public ok;
    uint256 public refused;
    uint256 internal nonce;

    constructor(PrivateDesk desk_, IEventsEngine engine_, IEngineLens lens_, address deskKey_, address[] memory owners_, bytes32[] memory markets_, uint256 horizon_) {
        desk = desk_;
        engine = engine_;
        lens = lens_;
        usd = IERC20(engine_.collateral());
        deskKey = deskKey_;
        owners = owners_;
        markets = markets_;
        horizon = horizon_;
    }

    function slotCount() external view returns (uint256) {
        return slots.length;
    }

    function ownerCount() external view returns (uint256) {
        return owners.length;
    }

    function step(uint256 op, uint256 a, uint256 b, uint256 c) external {
        op = op % 11;
        address o = owners[a % owners.length];
        bool done;
        if (op == 0) done = _as(o, abi.encodeCall(PrivateDesk.depositAndAllow, (bound(b, 1, 60) * ONE, bound(c, 0, 60) * ONE)));
        else if (op == 1) done = _as(o, abi.encodeCall(PrivateDesk.withdraw, (bound(b, 1, 60) * ONE)));
        else if (op == 2) done = _as(o, abi.encodeCall(PrivateDesk.revoke, ()));
        else if (op == 3) done = _as(deskKey, abi.encodeCall(PrivateDesk.chargeToPool, (o, bound(b, 1, 25) * ONE, _key(c))));
        else if (op == 4) {
            bytes32 slot = keccak256(abi.encode("slot", ++nonce));
            done = _as(deskKey, abi.encodeCall(PrivateDesk.fundSlot, (slot, bound(b, 1, 25) * ONE)));
            if (done) slots.push(slot);
        } else if (op == 5 && slots.length != 0) {
            done = _as(deskKey, abi.encodeCall(PrivateDesk.mintInSlot, (slots[a % slots.length], markets[b % markets.length], uint8(c % 2), 0)));
        } else if (op == 6 && slots.length != 0) done = _as(o, abi.encodeCall(PrivateDesk.settleSlot, (slots[b % slots.length])));
        else if (op == 7 && slots.length != 0) done = _as(deskKey, abi.encodeCall(PrivateDesk.sweepSlotToPool, (slots[b % slots.length])));
        else if (op == 8) {
            // Honest (what the pool holds) or not (more than it, a key reused, an address with no budget).
            uint256 amount = c % 4 == 0 ? desk.pool() + 1 : bound(b, 1, desk.pool() == 0 ? 1 : desk.pool());
            address to = c % 5 == 0 ? makeAddr("no-budget") : o;
            done = _as(deskKey, abi.encodeCall(PrivateDesk.creditFromPool, (to, amount, c % 3 == 0 ? _key(1) : _key(c))));
        } else if (op == 9) {
            vm.warp(bound(vm.getBlockTimestamp() + bound(b, 1, 240), 0, horizon));
        } else if (op == 10) _resolveSome(b, c);
        if (done) ++ok;
        else ++refused;
    }

    function _key(uint256 c) internal pure returns (bytes32) {
        return keccak256(abi.encode("key", c % 64));
    }

    function _as(address who, bytes memory data) internal returns (bool success) {
        vm.prank(who);
        (success,) = address(desk).call(data);
    }

    /// Prints the close of a Window whose expiry has passed (Up or Down), or voids one past its admission.
    function _resolveSome(uint256 b, uint256 c) internal {
        bytes32 m = markets[b % markets.length];
        MarketRef memory r = lens.marketRef(m);
        if (r.state != STATE_OPEN) return;
        uint256 nowTs = vm.getBlockTimestamp();
        if (nowTs >= uint256(r.expiry) + 901) {
            engine.voidExpired(m);
        } else if (nowTs >= r.expiry && c % 3 != 0) {
            engine.recordPrint(m, WHICH_CLOSE, PrintSigner.five(Policies.TSLA, c % 2 == 0 ? 366e8 : 364e8, r.expiry));
            engine.settle(m);
        }
    }
}
