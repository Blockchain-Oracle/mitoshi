// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {MatchTestBase} from "./harness/MatchTestBase.sol";
import "../../src/engine/EngineTypes.sol";

// Ported from Agari 03b30abbbfe7ddc3cac4927c7c573e52f74d2d49:anchor/programs/agari-events/src/matching/tests/paths.rs.
/// One test per row of the fill-kind matrix (E-03): the maker rests at M = 400, the taker crosses with room to spare,
/// 100 lots fill at the maker's price. Position deltas, backing and the path bit are exact.
contract PathsTest is MatchTestBase {
    uint256 internal constant MAKER = 1;
    uint256 internal constant TAKER = 2;
    uint256 internal constant SEED = 9;
    uint16 internal constant M = 400;
    uint64 internal constant Q = 100;

    function balances(uint256 n) internal returns (uint64[6] memory b) {
        Position memory p = pos(n);
        b = [p.credit, p.lockedCash, p.yesFree, p.yesLocked, p.noFree, p.noLocked];
    }

    function cross(uint8 maker, uint8 taker, uint16 takerLimit, uint8 path) internal returns (PlaceResult memory r) {
        uint8[2] memory kinds = [maker, taker];
        for (uint256 i; i < 2; ++i) {
            uint256 n = i == 0 ? MAKER : TAKER;
            if (kinds[i] == KIND_SELL_YES) seedPair(n, SEED, Q);
            else if (kinds[i] == KIND_SELL_NO) seedPair(SEED, n, Q);
        }
        place(MAKER, order(maker, M, Q, ORDER_NORMAL));
        r = place(TAKER, order(taker, takerLimit, Q, ORDER_IOC));
        assertEq(r.filledLots, Q);
        assertEq(r.pathMask, mask(path));
        assertEq(h.market(m).orderCount, 0);
    }

    function _eq(uint64[6] memory a, uint64[6] memory b) internal pure {
        for (uint256 i; i < 6; ++i) assertEq(a[i], b[i]);
    }

    function test_buyYesTakesSellYes_directYes() public {
        PlaceResult memory r = cross(KIND_SELL_YES, KIND_BUY_YES, 450, PATH_DIRECT_YES);
        assertEq(r.cashSpent, Q * 400);
        assertEq(r.refunded, Q * 50);
        _eq(balances(TAKER), [uint64(0), 0, Q, 0, 0, 0]);
        _eq(balances(MAKER), [uint64(Q * 400), 0, 0, 0, 0, 0]);
        assertEq(h.market(m).backingLots, Q);
    }

    function test_sellYesHitsBuyYes_directYes() public {
        PlaceResult memory r = cross(KIND_BUY_YES, KIND_SELL_YES, 350, PATH_DIRECT_YES);
        assertEq(r.cashReceived, Q * 400);
        _eq(balances(TAKER), [uint64(Q * 400), 0, 0, 0, 0, 0]);
        _eq(balances(MAKER), [uint64(0), 0, Q, 0, 0, 0]);
        assertEq(h.market(m).backingLots, Q);
    }

    function test_buyNoTakesSellNo_directNo() public {
        PlaceResult memory r = cross(KIND_SELL_NO, KIND_BUY_NO, 350, PATH_DIRECT_NO);
        assertEq(r.cashSpent, Q * 600);
        assertEq(r.refunded, Q * 50);
        _eq(balances(TAKER), [uint64(0), 0, 0, 0, Q, 0]);
        _eq(balances(MAKER), [uint64(Q * 600), 0, 0, 0, 0, 0]);
    }

    function test_sellNoHitsBuyNo_directNo() public {
        PlaceResult memory r = cross(KIND_BUY_NO, KIND_SELL_NO, 450, PATH_DIRECT_NO);
        assertEq(r.cashReceived, Q * 600);
        _eq(balances(TAKER), [uint64(Q * 600), 0, 0, 0, 0, 0]);
        _eq(balances(MAKER), [uint64(0), 0, 0, 0, Q, 0]);
    }

    function test_buyYesTakesBuyNo_mintPair() public {
        PlaceResult memory r = cross(KIND_BUY_NO, KIND_BUY_YES, 450, PATH_MINT_PAIR);
        assertEq(r.cashSpent, Q * 400);
        _eq(balances(TAKER), [uint64(0), 0, Q, 0, 0, 0]);
        _eq(balances(MAKER), [uint64(0), 0, 0, 0, Q, 0]);
        assertEq(h.market(m).backingLots, Q);
        assertEq(h.mvault(), Q * 1_000);
    }

    function test_buyNoTakesBuyYes_mintPair() public {
        PlaceResult memory r = cross(KIND_BUY_YES, KIND_BUY_NO, 350, PATH_MINT_PAIR);
        assertEq(r.cashSpent, Q * 600);
        _eq(balances(TAKER), [uint64(0), 0, 0, 0, Q, 0]);
        _eq(balances(MAKER), [uint64(0), 0, Q, 0, 0, 0]);
        assertEq(h.market(m).backingLots, Q);
        assertEq(h.mvault(), Q * 1_000);
    }

    function test_sellYesHitsSellNo_burnPair() public {
        PlaceResult memory r = cross(KIND_SELL_NO, KIND_SELL_YES, 350, PATH_BURN_PAIR);
        assertEq(r.cashReceived, Q * 400);
        _eq(balances(TAKER), [uint64(Q * 400), 0, 0, 0, 0, 0]);
        _eq(balances(MAKER), [uint64(Q * 600), 0, 0, 0, 0, 0]);
        assertEq(h.market(m).backingLots, Q, "2Q seeded against the seed actor, Q burned");
    }

    function test_sellNoHitsSellYes_burnPair() public {
        PlaceResult memory r = cross(KIND_SELL_YES, KIND_SELL_NO, 450, PATH_BURN_PAIR);
        assertEq(r.cashReceived, Q * 600);
        _eq(balances(TAKER), [uint64(Q * 600), 0, 0, 0, 0, 0]);
        _eq(balances(MAKER), [uint64(Q * 400), 0, 0, 0, 0, 0]);
        assertEq(h.market(m).backingLots, Q, "2Q seeded against the seed actor, Q burned");
    }
}
