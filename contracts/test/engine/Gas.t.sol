// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {EngineFixture} from "./harness/EngineFixture.sol";
import {Vm} from "forge-std/Vm.sol";
import {PrintSigner as PrintSignerLib} from "./harness/PrintSigner.sol";
import {Policies} from "./harness/Policies.sol";
import "../../src/engine/EngineTypes.sol";

/// S2.10: every A.1.7 row, cold credit pool vs with credits / warm pool, as gas snapshots (`snapshots/GasTest.json`,
/// gated by `forge test --gas-snapshot-check`). Under isolation each call is its own transaction; `gross` is the call's
/// `gasTotalUsed` (what the gas limit must cover) and `net` subtracts the end-of-tx TIP-1060 credit refund (what the
/// receipt charges; X7 proves both match Moderato). Numbers exclude the 21k intrinsic and calldata (receipts in
/// acceptance/S2.md include them).
contract GasTest is EngineFixture {
    function setUp() public override {
        super.setUp();
        require(vm.isIsolateMode(), "gas rows need isolation (per-tx numbers)");
    }

    function _snap(string memory name) internal {
        Vm.Gas memory g = vm.lastCallGas();
        vm.snapshotValue("engine", string.concat(name, ".gross"), g.gasTotalUsed);
        vm.snapshotValue("engine", string.concat(name, ".net"), g.gasTotalUsed - uint256(uint64(g.gasRefunded)));
    }

    /// Fills the engine's credit pool: `n + 1` holders mint in a throwaway Window, it voids, `n` redeem (each position
    /// deleted = storage credits for the engine, A.1.1). One holder stays, so the engine's own TIP-20 balance slot never
    /// empties (in production it never does; an empty one costs the next pull a new slot).
    function _credits(uint256 n) internal {
        bytes32 junk = list(START, LOCK, true);
        for (uint256 i; i <= n; ++i) {
            vm.prank(who(200 + i));
            engine.mintSet(junk, 1, false);
        }
        vm.warp(LOCK + 901);
        engine.voidExpired(junk);
        for (uint256 i; i < n; ++i) {
            vm.prank(who(200 + i));
            engine.redeem(junk);
        }
        vm.warp(START);
    }

    function _restAsks(uint256 count, uint16 firstPrice, uint64 lots) internal {
        for (uint256 i; i < count; ++i) place(10 + i, order(KIND_BUY_NO, uint16(firstPrice + i), lots, ORDER_NORMAL));
    }

    // ---- Row 1: first IOC buy by a new holder (1 partial fill) ----

    function test_gas_firstIocNewHolder_cold() public {
        _restAsks(1, 600, 2_000);
        vm.prank(who(1));
        engine.placeOrder(order(KIND_BUY_YES, 650, 1_000, ORDER_IOC));
        _snap("firstIocNewHolder.cold");
    }

    function test_gas_firstIocNewHolder_credits() public {
        _restAsks(1, 600, 2_000);
        _credits(8);
        vm.prank(who(1));
        engine.placeOrder(order(KIND_BUY_YES, 650, 1_000, ORDER_IOC));
        _snap("firstIocNewHolder.credits");
    }

    // ---- Row 2: repeat IOC, same holder and market ----

    function test_gas_repeatIoc() public {
        _restAsks(1, 600, 5_000);
        place(1, order(KIND_BUY_YES, 650, 1_000, ORDER_IOC));
        vm.prank(who(1));
        engine.placeOrder(order(KIND_BUY_YES, 650, 1_000, ORDER_IOC));
        _snap("repeatIoc");
    }

    // ---- Row 3: each additional fill, partial / full; 16 full fills ----

    function test_gas_fills() public {
        _restAsks(16, 600, 100);
        place(1, order(KIND_BUY_YES, 700, 1, ORDER_IOC)); // warm the taker's position
        vm.prank(who(1));
        engine.placeOrder(order(KIND_BUY_YES, 700, 50, ORDER_IOC)); // 1 partial fill
        _snap("fills.1partial");
        vm.prank(who(1));
        engine.placeOrder(order(KIND_BUY_YES, 700, 49, ORDER_IOC)); // 1 full fill (the rest of the first node)
        _snap("fills.1full");
        vm.prank(who(1));
        engine.placeOrder(order(KIND_BUY_YES, 700, 250, ORDER_IOC)); // 2 full + 1 partial
        _snap("fills.2full1partial");
        _restAsks(16, 650, 100);
        PlaceArgs memory o = order(KIND_BUY_YES, 700, 1_600 + 50, ORDER_IOC);
        vm.prank(who(1));
        engine.placeOrder(o); // 16 fills across the remaining levels (fill cap 16)
        _snap("fills.16");
    }

    // ---- Row 4: eviction ----

    function test_gas_eviction() public {
        PlaceArgs memory stale = order(KIND_BUY_NO, 590, 100, ORDER_NORMAL);
        stale.expireTs = START + 10;
        place(9, stale);
        _restAsks(1, 600, 1_000);
        place(1, order(KIND_BUY_YES, 700, 1, ORDER_IOC));
        vm.warp(START + 10);
        PlaceArgs memory o = order(KIND_BUY_YES, 700, 10, ORDER_IOC);
        vm.prank(who(1));
        engine.placeOrder(o);
        _snap("evict1fill1");
        vm.prank(who(1));
        engine.placeOrder(o);
        _snap("evict0fill1");
    }

    // ---- Row 5: full redeem ----

    function test_gas_redeem() public {
        _restAsks(1, 600, 2_000);
        place(1, order(KIND_BUY_YES, 650, 1_000, ORDER_IOC));
        vm.warp(LOCK);
        recordClose(m, 36_600_000_000);
        engine.settle(m);
        vm.prank(who(1));
        engine.redeem(m);
        _snap("redeem.full");
        vm.prank(who(10)); // the maker: drains its resting remainder first (T05)
        engine.redeem(m);
        _snap("redeem.withDrain");
    }

    // ---- Row 6: first PostOnly rest by a new maker in a new market (6 new slots) ----

    function test_gas_firstPostOnlyRest_cold() public {
        bytes32 fresh = list(START, LOCK, true);
        PlaceArgs memory o = order(KIND_BUY_YES, 480, 1_000, ORDER_POST_ONLY);
        o.marketId = fresh;
        vm.prank(who(1));
        engine.placeOrder(o);
        _snap("firstPostOnlyRest.cold");
    }

    function test_gas_firstPostOnlyRest_warm() public {
        bytes32 fresh = list(START, LOCK, true); // listing first: its own new slots would consume the credits (FCFS)
        engine.reserveNodes(4);
        _snap("reserveNodes.4");
        _credits(8);
        PlaceArgs memory o = order(KIND_BUY_YES, 480, 1_000, ORDER_POST_ONLY);
        o.marketId = fresh;
        vm.prank(who(1));
        engine.placeOrder(o);
        _snap("firstPostOnlyRest.warm");
    }

    // ---- Row 7: openWindow; and the other writes a session makes ----

    function test_gas_openWindow() public {
        vm.startPrank(admin);
        bytes32 sid = engine.registerSeries(RegisterSeriesArgs(700, BASIS_REGULAR, 300, 1000, 1000, 1000, 20, 400_000, 16, 16));
        _snap("registerSeries");
        engine.addPolicyVersion(sid, 0, Policies.launch(address(rsVerifier), 0, OPEN_ENDED));
        _snap("addPolicyVersion");
        vm.stopPrank();
        vm.prank(roller);
        engine.openWindow(OpenWindowArgs(sid, 0, LOCK, LOCK + 300, LOCK + 300, 0, 2));
        _snap("openWindow");
    }

    function test_gas_sessionWrites() public {
        vm.prank(who(1));
        engine.mintSet(m, 1_000, false);
        _snap("mintSet.first");
        vm.prank(who(1));
        engine.mergeSet(m, 500, true);
        _snap("mergeSet.withdraw");
        uint128 id = place(1, order(KIND_BUY_YES, 400, 100, ORDER_NORMAL)).restedOrderId;
        uint128[] memory ids = new uint128[](1);
        ids[0] = id;
        vm.prank(who(1));
        engine.cancelOrders(m, ids, true);
        _snap("cancel1.withdraw");
        vm.warp(LOCK);
        engine.recordPrint(m, WHICH_CLOSE, _five(LOCK));
        _snap("recordPrint.redstone5");
        engine.settle(m);
        _snap("settle");
    }

    function _five(uint40 t) internal pure returns (bytes memory) {
        return PrintSignerLib.five(Policies.TSLA, 36_600_000_000, t);
    }

    /// E-59 / S2.10: the lens walk's cost per node, for on-chain callers choosing `maxNodes`.
    function test_gas_lensWalkPerNode() public {
        _restAsks(16, 600, 10);
        _restAsks(16, 700, 10); // actors 10..25, one order each at 600..615 and a second at 700..715
        lens.levels(m, false, 32, 0, 1);
        uint256 one = vm.lastCallGas().gasTotalUsed;
        lens.levels(m, false, 32, 0, 32);
        uint256 thirtyTwo = vm.lastCallGas().gasTotalUsed;
        vm.snapshotValue("engine", "lens.levels.1node", one);
        vm.snapshotValue("engine", "lens.levels.32nodes", thirtyTwo);
        vm.snapshotValue("engine", "lens.levels.perNode", (thirtyTwo - one) / 31);
    }
}

