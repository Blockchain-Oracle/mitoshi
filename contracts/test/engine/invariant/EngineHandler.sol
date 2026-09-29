// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {CommonBase} from "forge-std/Base.sol";
import {StdUtils} from "forge-std/StdUtils.sol";
import {ITIP20} from "tempo-std/interfaces/ITIP20.sol";
import {EventsEngine} from "../../../src/engine/EventsEngine.sol";
import {EngineLens} from "../../../src/engine/EngineLens.sol";
import {OrderView, PositionView} from "../../../src/engine/interfaces/IEngineLens.sol";
import {PrintSigner} from "../harness/PrintSigner.sol";
import {Policies} from "../harness/Policies.sol";
import "../../../src/engine/EngineTypes.sol";

// Ported from Agari 03b30abbbfe7ddc3cac4927c7c573e52f74d2d49:anchor/programs/agari-events/src/matching/tests/random.rs
// (`step`, the op mix, the xorshift RNG) — here over the real engine, token and verifiers, 3 markets × 6 actors.
/// The invariant handler (A.6): one `step(seed)` entry picks an op with Agari's mix (place 55 %, cancel 10 %, reduce
/// 5 %, cancel-all 3 %, sweep 5 %, mint 8 %, merge 5 %, withdraw 5 %, warp 4 %). Refusals are expected and counted;
/// each op records whether it touched any market other than its own (cross-market isolation).
contract EngineHandler is CommonBase, StdUtils {
    uint256 public constant USERS = 6;
    uint256 public constant MARKETS = 3;

    EventsEngine public immutable engine;
    EngineLens public immutable lens;
    ITIP20 public immutable usd;
    bytes32[] public markets;
    address[] public actors;

    uint256 public ok;
    uint256 public refused;
    uint256 public fills;
    bool public isolationBroken;

    constructor(EventsEngine engine_, EngineLens lens_, ITIP20 usd_, bytes32[] memory markets_, address[] memory actors_) {
        (engine, lens, usd, markets, actors) = (engine_, lens_, usd_, markets_, actors_);
    }

    function marketCount() external view returns (uint256) {
        return markets.length;
    }

    function actorCount() external view returns (uint256) {
        return actors.length;
    }

    // ------------------------------------------------------------------------------------------------ the op mix

    /// One random operation. `seed` drives every choice (the invariant fuzzer and `EngineRandom`'s xorshift both call it).
    function step(uint256 seed) public {
        uint256 r = seed;
        uint256 mi = _take(r, MARKETS);
        r = uint256(keccak256(abi.encode(r)));
        address who = actors[_take(r, USERS)];
        r = uint256(keccak256(abi.encode(r)));
        uint256 op = _take(r, 100);
        r = uint256(keccak256(abi.encode(r)));
        bytes32 m = markets[mi];
        bytes32[] memory before = _others(mi);
        bool done;
        if (op < 55) done = _place(m, who, r);
        else if (op < 65) done = _cancel(m, who, r);
        else if (op < 70) done = _reduce(m, r);
        else if (op < 73) done = _call(who, abi.encodeCall(engine.cancelAll, (m, uint8(1 + _take(r, 32)), _take(r >> 8, 2) == 1)));
        else if (op < 78) done = _call(who, abi.encodeCall(engine.sweepExpired, (m, uint8(1 + _take(r, 32)))));
        else if (op < 86) done = _call(who, abi.encodeCall(engine.mintSet, (m, uint64(1 + _take(r, 40)), _take(r >> 8, 2) == 1)));
        else if (op < 91) done = _merge(m, who, r);
        else if (op < 96) done = _withdraw(m, who, r);
        else {
            vm.warp(vm.getBlockTimestamp() + 1 + _take(r, 90));
            done = true;
        }
        if (done) ++ok;
        else ++refused;
        bytes32[] memory afterOp = _others(mi);
        for (uint256 i; i < before.length; ++i) if (before[i] != afterOp[i]) isolationBroken = true;
    }

    function _place(bytes32 m, address who, uint256 r) private returns (bool) {
        uint40 lockAt = lens.marketRef(m).lockAt;
        uint256 nowTs = vm.getBlockTimestamp();
        uint256 expire = nowTs + 1 + _take(r, 180);
        if (expire > lockAt) expire = lockAt;
        PlaceArgs memory a = PlaceArgs({
            marketId: m,
            kind: uint8(_take(r >> 8, 4)),
            orderType: uint8(_take(r >> 16, 4)),
            selfMatch: uint8(_take(r >> 24, 2)),
            priceTicks: uint16(470 + _take(r >> 32, 61)),
            lots: uint64(1 + _take(r >> 48, 60)),
            expireTs: uint40(expire),
            maxFills: uint8(1 + _take(r >> 64, 8)),
            maxEvictions: uint8(_take(r >> 72, 5)),
            useCredit: _take(r >> 80, 2) == 1,
            withdrawProceeds: _take(r >> 88, 4) == 0,
            clientId: 0
        });
        vm.prank(who);
        try engine.placeOrder(a) returns (PlaceResult memory res) {
            fills += res.fills;
            return true;
        } catch {
            return false;
        }
    }

    /// Cancels a live order as its owner (or, one time in (live + 1), a random stale id as `who`).
    function _cancel(bytes32 m, address who, uint256 r) private returns (bool) {
        (uint128 id, address owner) = _pickLive(m, r);
        if (id == 0) (id, owner) = (uint128(_take(r >> 40, 1 << 40)), who);
        uint128[] memory ids = new uint128[](1);
        ids[0] = id;
        return _call(owner, abi.encodeCall(engine.cancelOrders, (m, ids, _take(r >> 8, 2) == 1)));
    }

    function _reduce(bytes32 m, uint256 r) private returns (bool) {
        (uint128 id, address owner) = _pickLive(m, r);
        if (id == 0) return true; // nothing to reduce: a no-op, as in Agari
        uint64 lots = lens.orderOf(id).lots;
        return _call(owner, abi.encodeCall(engine.reduceOrder, (m, id, uint64(_take(r >> 8, uint256(lots) + 1)))));
    }

    function _merge(bytes32 m, address who, uint256 r) private returns (bool) {
        PositionView memory p = lens.positionOf(m, who);
        uint256 cap = (p.yesFree < p.noFree ? p.yesFree : p.noFree) + 1;
        return _call(who, abi.encodeCall(engine.mergeSet, (m, uint64(1 + _take(r, cap)), _take(r >> 8, 2) == 1)));
    }

    function _withdraw(bytes32 m, address who, uint256 r) private returns (bool) {
        uint64 credit = lens.creditOf(m, who);
        return _call(who, abi.encodeCall(engine.withdrawCredit, (m, uint64(1 + _take(r, uint256(credit) + 1)))));
    }

    /// A live order of a random actor in `m` (0 when the chosen actor has none).
    function _pickLive(bytes32 m, uint256 r) private view returns (uint128 id, address owner) {
        owner = actors[_take(r >> 100, USERS)];
        OrderView[] memory os = lens.openOrdersOf(m, owner);
        if (os.length == 0) return (0, owner);
        id = os[_take(r >> 120, os.length)].orderId;
    }

    function _call(address who, bytes memory data) private returns (bool success) {
        vm.prank(who);
        (success,) = address(engine).call(data);
    }

    // ------------------------------------------------------------------------------------------------ settlement

    /// Locks every market and resolves it by `seed`: Up, Down (a close print either side of the open) or void by the
    /// clock (no close print, past the deadline).
    function settleAll(uint256 seed) external {
        uint40 lastExpiry;
        for (uint256 i; i < markets.length; ++i) {
            uint40 e = lens.marketRef(markets[i]).expiry;
            if (e > lastExpiry) lastExpiry = e;
        }
        if (vm.getBlockTimestamp() < lastExpiry) vm.warp(lastExpiry);
        uint256 outcome = seed % 3;
        for (uint256 i; i < markets.length; ++i) {
            bytes32 m = markets[i];
            if (lens.marketRef(m).state != STATE_OPEN) continue;
            if (outcome == 2) continue;
            uint256 close = outcome == 0 ? 36_600_000_000 : 36_400_000_000;
            if (vm.getBlockTimestamp() <= lens.marketOf(m).closeDeadline) {
                engine.recordPrint(m, WHICH_CLOSE, PrintSigner.five(Policies.TSLA, close, lens.marketRef(m).expiry));
                engine.settle(m);
            }
        }
        vm.warp(vm.getBlockTimestamp() + 2_000);
        for (uint256 i; i < markets.length; ++i) {
            if (lens.marketRef(markets[i]).state == STATE_OPEN) engine.voidExpired(markets[i]);
        }
    }

    /// Redeems every holder of every market: own `redeem` or a third-party `redeemFor` (both pay the holder).
    function redeemAll(uint256 seed) external returns (uint256 paid) {
        for (uint256 i; i < markets.length; ++i) {
            for (uint256 j; j < actors.length; ++j) {
                PositionView memory p = lens.positionOf(markets[i], actors[j]);
                if (p.credit + p.lockedCash + p.yesFree + p.noFree + p.yesLocked + p.noLocked == 0 && p.openOrders == 0) continue;
                uint256 before = usd.balanceOf(actors[j]);
                if ((seed >> (i * 8 + j)) & 1 == 1) {
                    engine.redeemFor(markets[i], actors[j]);
                } else {
                    vm.prank(actors[j]);
                    engine.redeem(markets[i]);
                }
                paid += usd.balanceOf(actors[j]) - before;
            }
        }
    }

    // ------------------------------------------------------------------------------------------------ helpers

    /// A digest of every other market's state and its holders' positions (the isolation check's before/after).
    function _others(uint256 mi) private view returns (bytes32[] memory out) {
        out = new bytes32[](markets.length - 1);
        uint256 k;
        for (uint256 i; i < markets.length; ++i) {
            if (i == mi) continue;
            bytes32 h = keccak256(abi.encode(lens.marketOf(markets[i])));
            for (uint256 j; j < actors.length; ++j) h = keccak256(abi.encode(h, lens.positionOf(markets[i], actors[j])));
            out[k++] = h;
        }
    }

    function _take(uint256 r, uint256 n) private pure returns (uint256) {
        return n == 0 ? 0 : r % n;
    }
}
