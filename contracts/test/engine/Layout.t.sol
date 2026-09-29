// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {EngineFixture} from "./harness/EngineFixture.sol";
import {EngineStorage} from "../../src/engine/EngineStorage.sol";
import {Policies} from "./harness/Policies.sol";
import {OrderView} from "../../src/engine/interfaces/IEngineLens.sol";
import "../../src/engine/EngineTypes.sol";

/// A.1.1: the ERC-7201 namespace, the identities, and the lens's slot maths — every struct the engine writes reads back
/// through `EngineLens` (over `extsload`) field for field.
contract LayoutTest is EngineFixture {
    function test_erc7201Slot() public pure {
        bytes32 expected = keccak256(abi.encode(uint256(keccak256("tempo.events.engine.v1")) - 1)) & ~bytes32(uint256(0xff));
        assertEq(EngineStorage.SLOT, expected);
    }

    function test_identities() public {
        bytes32 sid = keccak256(abi.encode(uint16(1), uint32(300), uint8(BASIS_REGULAR)));
        assertEq(lens.seriesIdOf(1, 300, BASIS_REGULAR), sid);
        assertEq(m, keccak256(abi.encode(sid, uint64(0))), "marketId = keccak(seriesId, index)");
        assertEq(lens.marketIdOf(sid, 0), m);
        assertEq(lens.marketIdAt(1), m);
        assertEq(lens.seriesIdAt(1), sid);
        assertEq(lens.seriesCount(), 1);
        uint128 id = place(1, order(KIND_BUY_YES, 400, 10, ORDER_NORMAL)).restedOrderId;
        (uint32 mIdx, uint48 seq, uint32 idx) = EngineStorage.decodeOrderId(id);
        assertEq(mIdx, 1);
        assertEq(seq, 1);
        assertEq(idx, 1);
        assertEq(id, (uint128(1) << 80) | (uint128(1) << 32) | 1);
    }

    function test_configAndRoles() public {
        place(1, order(KIND_BUY_YES, 400, 10, ORDER_NORMAL));
        vm.prank(admin);
        engine.setMode(MODE_REDUCE_ONLY);
        vm.prank(admin);
        engine.transferAdmin(address(0xBEEF));
        Config memory c = lens.config();
        assertEq(c.mode, MODE_REDUCE_ONLY);
        assertEq(c.nextMIdx, 1);
        assertEq(c.highWater, 1);
        assertEq(c.freeHead, 0);
        assertEq(c.nextSeq, 1);
        assertEq(c.totalOwed, 4_000);
        assertEq(lens.admin(), admin);
        assertEq(lens.pendingAdmin(), address(0xBEEF));
        assertTrue(lens.isRoller(roller));
        assertFalse(lens.isRoller(admin));
        vm.prank(who(1));
        engine.setCrankOptOut(true);
        assertTrue(lens.crankOptedOut(who(1)));
    }

    function test_seriesAndPolicyRoundTrip() public {
        Series memory s = lens.seriesOf(lens.seriesIdAt(1));
        assertEq(s.ticker, 1);
        assertEq(s.basis, BASIS_REGULAR);
        assertEq(s.cadenceSec, 300);
        assertEq(s.lotBase, 1000);
        assertEq(s.tickBase, 1000);
        assertEq(s.cashUnit, 1);
        assertEq(s.minLots, 1);
        assertEq(s.nextIndex, 1);
        assertEq(s.lastExpiry, LOCK);
        assertEq(s.minRestSec, 20);
        assertEq(s.maxLeadSec, 400_000);
        assertEq(s.fillsCap, 32);
        assertEq(s.evictionsCap, 16);
        assertEq(s.versionCount, 1);
        // A full policy version with a check, every field distinct.
        vm.startPrank(admin);
        bytes32 sid = engine.registerSeries(RegisterSeriesArgs(77, BASIS_REGULAR, 60, 1000, 1000, 5, 7, 99, 9, 3));
        PolicyVersion memory v = Policies.checked(Policies.launch(address(rsVerifier), 11, 22), Policies.attested(address(attVerifier), 120));
        engine.addPolicyVersion(sid, 0, v);
        vm.stopPrank();
        assertEq(keccak256(abi.encode(lens.policyOf(sid, 0))), keccak256(abi.encode(v)), "PolicyVersion round-trips");
        Series memory s2 = lens.seriesOf(sid);
        assertEq(s2.minLots, 5);
        assertEq(s2.minRestSec, 7);
        assertEq(s2.maxLeadSec, 99);
        assertEq(s2.fillsCap, 9);
        assertEq(s2.evictionsCap, 3);
    }

    function test_marketPacking() public {
        mint(1, 100);
        place(1, order(KIND_SELL_YES, 555, 40, ORDER_NORMAL));
        place(2, order(KIND_BUY_YES, 555, 15, ORDER_IOC));
        Market memory mk = lens.marketOf(m);
        assertEq(mk.tradingStart, START);
        assertEq(mk.lockAt, LOCK);
        assertEq(mk.expiry, LOCK);
        assertEq(mk.openDeadline, START + 900);
        assertEq(mk.closeDeadline, LOCK + 900);
        assertEq(mk.seriesIdx, 1);
        assertEq(mk.policyVersion, 0);
        assertEq(mk.basis, BASIS_REGULAR);
        assertEq(mk.backingLots, 100);
        assertEq(mk.volumeLots, 15);
        assertEq(mk.volumeCash, 15 * 555);
        assertEq(mk.tradeCount, 1);
        assertEq(mk.lastPrice, 555);
        assertEq(mk.lastTradeTs, START);
        assertEq(mk.eventSeq, 5);
        assertEq(mk.state, STATE_OPEN);
        assertEq(mk.closeKind, 2);
        assertEq(mk.index, 0);
        assertEq(mk.mIdx, 1);
        assertEq(mk.orderCount, 1);
        assertEq(lens.printOf(m, WHICH_OPEN).priceE8, 36_500_000_000);
    }

    function test_nodeAndPositionPacking() public {
        mint(1, 100);
        uint128 id = place(1, order(KIND_SELL_NO, 321, 60, ORDER_NORMAL)).restedOrderId;
        OrderView memory o = lens.orderOf(id);
        assertEq(o.owner, who(1));
        assertEq(o.kind, KIND_SELL_NO);
        assertTrue(o.isBid);
        assertEq(o.priceTicks, 321);
        assertEq(o.lots, 60);
        assertEq(o.expireTs, LOCK);
        assertEq(o.placedAt, START);
        Position memory p = pos(1); // raw slots decoded by the fixture
        assertEq(p.noLocked, 60);
        assertEq(p.noFree, 40);
        assertEq(p.yesFree, 100);
        assertEq(p.openOrders, 1);
        assertEq(p.orderHead, uint32(id));
        assertEq(lens.positionOf(m, who(1)).noLocked, p.noLocked);
    }
}
