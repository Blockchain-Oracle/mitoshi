// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {EngineFixture} from "../../engine/harness/EngineFixture.sol";
import "../../../src/engine/EngineTypes.sol";

/// Rests real maker orders on the real engine where Masayume's mocks had knobs (A.6: "Book seeder replaces mock
/// knobs", D-018). A dedicated maker (`who(MAKER)`, funded and approved by the fixture) quotes PostOnly, so every
/// product fill is a real match at the maker's price through one of the engine's four paths.
abstract contract BookSeeder is EngineFixture {
    uint256 internal constant MAKER = 90;
    /// Masayume's MockVenue filled YES at 0.60 and NO at 0.40 — the price every ported vector assumes.
    uint16 internal constant BOOK_TICKS = 600;
    uint64 internal constant BOOK_DEPTH = 1_000_000; // lots (1,000 whole outcome units)

    /// @dev The side an order takes: YES buyers and NO sellers take asks; NO buyers and YES sellers take bids.
    function takesAsk(uint8 outcomeIdx, bool isBuy) internal pure returns (bool) {
        return (outcomeIdx == 0) == isBuy;
    }

    /// @dev Masayume's book for the next order: the side it takes at 0.60 YES, deep enough to fill in full.
    function book(bytes32 mk, uint8 outcomeIdx, bool isBuy) internal {
        seed(mk, takesAsk(outcomeIdx, isBuy), BOOK_TICKS, BOOK_DEPTH);
    }

    /// @dev Replaces the maker's quotes in `mk` with one PostOnly level: an ask (BUY_NO at `ticks`, which rests as a
    ///      YES ask) or a bid (BUY_YES at `ticks`). Cancelling first keeps the book uncrossed (PostOnly never crosses).
    function seed(bytes32 mk, bool ask, uint16 ticks, uint64 lots) internal {
        address mm = who(MAKER);
        clearSeeds(mk);
        (, uint40 lockAt) = _lockOf(mk);
        vm.prank(mm);
        engine.placeOrder(
            PlaceArgs(mk, ask ? KIND_BUY_NO : KIND_BUY_YES, ORDER_POST_ONLY, SELF_CANCEL_TAKER, ticks, lots, lockAt, 16, 16, false, false, 0)
        );
    }

    function clearSeeds(bytes32 mk) internal {
        address mm = who(MAKER);
        if (lens.positionOf(mk, mm).openOrders == 0) return;
        vm.prank(mm);
        engine.cancelAll(mk, 32, true);
    }

    function _lockOf(bytes32 mk) internal view returns (uint40 tradingStart, uint40 lockAt) {
        (tradingStart, lockAt) = (lens.marketRef(mk).tradingStart, lens.marketRef(mk).lockAt);
    }
}
