// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Position, KIND_BUY_YES, KIND_SELL_YES, KIND_BUY_NO} from "../EngineTypes.sol";
import {Grid} from "./Grid.sol";

// Ported from Agari 03b30abbbfe7ddc3cac4927c7c573e52f74d2d49:anchor/programs/agari-events/src/matching/paths.rs
// (`apply_maker`, `apply_taker`, `lock_escrow`, `refund_escrow`).

/// @title The fill-kind matrix and escrow per kind (E-03, E-32, E-34, E-35). The maker's update depends only on the
///        maker's kind, the taker's only on the taker's kind; a YES kind trades at `p`, a NO kind at `1000 − p`, so the
///        two sides of any fill sum to `q × 1000 × cu`, the backing of `q` pairs.
library PositionLib {
    function isBuy(uint8 kind) internal pure returns (bool) {
        return kind == KIND_BUY_YES || kind == KIND_BUY_NO;
    }

    /// @notice The maker side of a fill of `q` at its own price: a resting buy releases escrow and receives outcome;
    ///         a resting sell releases locked outcome and is credited cash (never pushed a transfer, E-34).
    function applyMaker(Position storage p, uint8 kind, uint16 price, uint64 q, uint64 cu) internal returns (uint64 cash) {
        cash = Grid.cashOf(kind, price, q, cu);
        if (kind == KIND_BUY_YES) {
            p.lockedCash -= cash;
            p.yesFree += q;
        } else if (kind == KIND_BUY_NO) {
            p.lockedCash -= cash;
            p.noFree += q;
        } else if (kind == KIND_SELL_YES) {
            p.yesLocked -= q;
            p.credit += cash;
        } else {
            p.noLocked -= q;
            p.credit += cash;
        }
    }

    /// @notice The taker side's outcome movement for `lots` filled in total (cash settles once, after matching:
    ///         buys pay through funding, sells are credited).
    function applyTaker(Position storage p, uint8 kind, uint64 lots) internal {
        if (lots == 0) return;
        if (kind == KIND_BUY_YES) p.yesFree += lots;
        else if (kind == KIND_BUY_NO) p.noFree += lots;
        else if (kind == KIND_SELL_YES) p.yesFree -= lots;
        else p.noFree -= lots;
    }

    /// @notice Locks what a resting order escrows: cash for buys, outcome (free → locked) for sells.
    function lockEscrow(Position storage p, uint8 kind, uint16 price, uint64 lots, uint64 cu) internal {
        if (kind == KIND_BUY_YES || kind == KIND_BUY_NO) {
            p.lockedCash += Grid.cashOf(kind, price, lots, cu);
        } else if (kind == KIND_SELL_YES) {
            p.yesFree -= lots;
            p.yesLocked += lots;
        } else {
            p.noFree -= lots;
            p.noLocked += lots;
        }
    }

    /// @notice Returns a removed order's escrow to its owner: buy escrow to `credit`, sell lots back to free.
    function refundEscrow(Position storage p, uint8 kind, uint16 price, uint64 lots, uint64 cu) internal {
        if (kind == KIND_BUY_YES || kind == KIND_BUY_NO) {
            uint64 cash = Grid.cashOf(kind, price, lots, cu);
            p.lockedCash -= cash;
            p.credit += cash;
        } else if (kind == KIND_SELL_YES) {
            p.yesLocked -= lots;
            p.yesFree += lots;
        } else {
            p.noLocked -= lots;
            p.noFree += lots;
        }
    }
}
