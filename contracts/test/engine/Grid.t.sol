// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Test} from "forge-std/Test.sol";
import {Grid} from "../../src/engine/libs/Grid.sol";
import {IEngineErrors} from "../../src/engine/EngineErrors.sol";
import {PAYOUT_DENOMINATOR, PAYOUT_VOID, KIND_BUY_YES, KIND_SELL_YES, KIND_BUY_NO, KIND_SELL_NO} from
    "../../src/engine/EngineTypes.sol";

// Ported from Agari 03b30abbbfe7ddc3cac4927c7c573e52f74d2d49:anchor/crates/agari-common/src/grid.rs (tests).
contract GridTest is Test {
    function cashUnit(uint64 lotBase, uint64 tickBase, uint8 dec) external pure returns (uint64) {
        return Grid.cashUnit(lotBase, tickBase, dec);
    }

    function yesCash(uint64 lots, uint16 p, uint64 cu) external pure returns (uint64) {
        return Grid.yesCash(lots, p, cu);
    }

    function pairCash(uint64 lots, uint64 cu) external pure returns (uint64) {
        return Grid.pairCash(lots, cu);
    }

    function redeemPayout(uint64 y, uint64 n, uint64 cu, uint32 yN, uint32 nN) external pure returns (uint64) {
        return Grid.redeemPayout(y, n, cu, yN, nN);
    }

    function test_cashUnitRegistrationRules() public {
        assertEq(this.cashUnit(1_000, 1_000, 6), 1);
        assertEq(this.cashUnit(1_000, 1_000_000, 9), 1);
        assertEq(this.cashUnit(10_000, 1_000, 6), 10);
        vm.expectRevert(IEngineErrors.BadGrid.selector); // tick × 1000 ≠ 10^dec
        this.cashUnit(1_000, 1, 6);
        vm.expectRevert(IEngineErrors.BadGrid.selector); // lot × tick not whole
        this.cashUnit(1, 1_000, 6);
        vm.expectRevert(IEngineErrors.BadGrid.selector);
        this.cashUnit(0, 1_000, 6);
        vm.expectRevert(IEngineErrors.BadGrid.selector); // 10^30 does not fit
        this.cashUnit(1_000, 1_000, 30);
    }

    function testFuzz_pairCostsExactlyItsBacking(uint16 p, uint64 lots) public pure {
        p = uint16(bound(p, 1, 999));
        lots = uint64(bound(lots, 1, 1e12));
        assertEq(uint256(Grid.yesCash(lots, p, 1)) + Grid.noCash(lots, p, 1), Grid.pairCash(lots, 1));
        // Every kind's own ticks and its complement form one pair.
        assertEq(Grid.cashOf(KIND_BUY_YES, p, lots, 1) + Grid.cashOf(KIND_BUY_NO, p, lots, 1), Grid.pairCash(lots, 1));
        assertEq(Grid.cashOf(KIND_SELL_YES, p, lots, 1) + Grid.cashOf(KIND_SELL_NO, p, lots, 1), Grid.pairCash(lots, 1));
    }

    function test_validPrices() public pure {
        assertTrue(Grid.isValidPrice(1) && Grid.isValidPrice(999));
        assertFalse(Grid.isValidPrice(0) || Grid.isValidPrice(1_000));
    }

    /// events-engine.md §2.2 worked numbers (Agari `spec_worked_numbers`).
    function test_specWorkedNumbers() public pure {
        assertEq(Grid.yesCash(3_000, 540, 1), 1_620_000);
        assertEq(Grid.noCash(2_000, 450, 1), 1_100_000);
        assertEq(Grid.noCash(4_000, 620, 1), 1_520_000);
        assertEq(Grid.yesCash(10_000, 600, 1) - 1_110_000, 4_890_000);
        assertEq(Grid.redeemPayout(4_000, 0, 1, PAYOUT_DENOMINATOR, 0), 4_000_000);
        assertEq(Grid.redeemPayout(0, 4_000, 1, PAYOUT_VOID, PAYOUT_VOID), 2_000_000);
        assertEq(Grid.partialPayout(4_000, 1, PAYOUT_VOID), 2_000_000);
    }

    /// The only rounding is the redeem floor; on the launch grid a void pays exactly ½ per lot-unit.
    function test_redeemPayoutFloors() public pure {
        assertEq(Grid.redeemPayout(1, 0, 1, PAYOUT_VOID, PAYOUT_VOID), 500);
        assertEq(Grid.redeemPayout(3, 1, 1, PAYOUT_VOID, PAYOUT_VOID), 2_000);
        // A non-launch numerator floors: 1 lot × 1000 × 3,333,333 / 1e7 = 333.3333 → 333.
        assertEq(Grid.redeemPayout(1, 0, 1, 3_333_333, 0), 333);
    }

    function test_overflowRefusesNeverWraps() public {
        vm.expectRevert(IEngineErrors.MathOverflow.selector);
        this.yesCash(type(uint64).max, 2, 1);
        vm.expectRevert(IEngineErrors.MathOverflow.selector);
        this.pairCash(type(uint64).max / 999, 1);
        vm.expectRevert(IEngineErrors.MathOverflow.selector);
        this.redeemPayout(type(uint64).max, type(uint64).max, type(uint64).max, PAYOUT_DENOMINATOR, PAYOUT_DENOMINATOR);
    }

    /// A.2.7: DreamDEX raw units convert exactly at the seam on the launch grid (tick = lot = 1,000, cu = 1, one = 1e6):
    /// `lots·ticks·cu == qty·price/one` for every on-grid price and quantity.
    function testFuzz_dreamDexUnitsConvertExactly(uint16 ticks, uint64 lots) public pure {
        ticks = uint16(bound(ticks, 1, 999));
        lots = uint64(bound(lots, 1, 1e12));
        uint256 price = uint256(ticks) * 1_000; // raw YES price, 6 dp
        uint256 qty = uint256(lots) * 1_000; // raw quantity
        assertEq(uint256(Grid.yesCash(lots, ticks, 1)), qty * price / 1e6);
        assertEq((qty * price) % 1e6, 0, "never a remainder on grid");
    }
}
