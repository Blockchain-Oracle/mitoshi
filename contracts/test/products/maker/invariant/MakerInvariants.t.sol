// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {PositionView, MarketRef} from "../../../../src/engine/interfaces/IEngineLens.sol";
import {IEventsEngine} from "../../../../src/engine/interfaces/IEventsEngine.sol";
import {IMarketMakerVault} from "../../../../src/products/maker/IMarketMakerVault.sol";
import {MakerTestBase} from "../../harness/MakerTestBase.sol";
import {MakerHandler} from "./MakerHandler.sol";
import "../../../../src/engine/EngineTypes.sol";

/// The maker vault's invariants over random sequences on the real engine (S8 test list + the escrow identity):
/// - `invariant_makerLiquidEqualsWallet`: the vault's wallet is exactly `liquid` plus what was donated — every engine
///   return is collected and booked in the same call, and nothing unbooked (a donation) ever enters `liquid`;
/// - `invariant_escrowAccountedInEngine`: per Window, `escrowOut − escrowBack == lockedCash + credit + fill cost` —
///   every unit of escrow is still resting, sitting as the vault's credit, or spent on a fill;
/// - `invariant_valueIsBookedOnly`: `totalValue == liquid + Σ deployedOf(open)`, settled Windows hold nothing in the
///   engine and are off the open list, plus the engine's own exact conservation over every holder.
/// `afterInvariant` settles every Window (real prints or void), settles the vault on each, and has every supplier
/// withdraw everything: the vault ends holding exactly the donations, in its wallet, and nothing in the engine.
/// forge-config: default.invariant.runs = 256
/// forge-config: default.invariant.depth = 250
contract MakerInvariantsTest is MakerTestBase {
    MakerHandler internal handler;
    address[] internal suppliers;
    bytes32[] internal ws;
    uint256 internal constant HORIZON = START + 2_400;

    function setUp() public override {
        super.setUp();
        ws.push(marketA);
        ws.push(list(START + 300, START + 600, false));
        ws.push(list(START + 600, START + 900, false));
        suppliers.push(house);
        for (uint256 i = 1; i <= 2; ++i) {
            address s = who(i);
            suppliers.push(s);
            vm.startPrank(s);
            usd.approve(address(vault), type(uint256).max);
            vault.supply(500 * ONE);
            vm.stopPrank();
        }
        handler = new MakerHandler(vault, IEventsEngine(address(engine)), lens, maker, who(TAKER), suppliers, ws, HORIZON);
        targetContract(address(handler));
        bytes4[] memory selectors = new bytes4[](1);
        selectors[0] = MakerHandler.step.selector;
        targetSelector(FuzzSelector({addr: address(handler), selectors: selectors}));
    }

    function invariant_makerLiquidEqualsWallet() public view {
        assertEq(usd.balanceOf(address(vault)), vault.liquid() + handler.donated(), "wallet == liquid + donations");
    }

    function invariant_escrowAccountedInEngine() public view {
        for (uint256 k; k < ws.length; ++k) {
            IMarketMakerVault.WindowBook memory b = vault.bookOf(ws[k]);
            PositionView memory p = lens.positionOf(ws[k], address(vault));
            assertEq(
                uint256(b.escrowOut) - b.escrowBack,
                uint256(p.lockedCash) + p.credit + handler.fillCost(ws[k]),
                "escrow out - back == resting + credit + spent on fills"
            );
            assertEq(p.yesLocked + p.noLocked, 0, "the maker only ever buys");
        }
    }

    function invariant_valueIsBookedOnly() public {
        uint256 sum;
        bytes32[] memory open = vault.openWindows();
        for (uint256 i; i < open.length; ++i) sum += vault.deployedOf(open[i]);
        assertEq(vault.totalValue(), vault.liquid() + sum);
        for (uint256 k; k < ws.length; ++k) {
            IMarketMakerVault.WindowBook memory b = vault.bookOf(ws[k]);
            if (!b.settled) continue;
            PositionView memory p = lens.positionOf(ws[k], address(vault));
            assertEq(uint256(p.credit) + p.lockedCash + p.yesFree + p.noFree + p.openOrders, 0, "settled: nothing left");
            assertEq(int256(b.realized), int256(uint256(b.escrowBack) + b.merged + b.payout) - int256(uint256(b.escrowOut)));
        }
        assertConserved();
    }

    function afterInvariant() public {
        emit log_named_uint("vault/engine calls that succeeded", handler.ok());
        emit log_named_uint("calls refused", handler.refused());
        emit log_named_uint("taker fills against the vault", handler.fills());
        vm.warp(HORIZON + 901);
        for (uint256 k; k < ws.length; ++k) {
            MarketRef memory r = lens.marketRef(ws[k]);
            if (r.state == STATE_OPEN) engine.voidExpired(ws[k]); // every close admission has passed
            if (vault.bookOf(ws[k]).quoteCount != 0) vault.settle(ws[k]);
            PositionView memory p = lens.positionOf(ws[k], address(vault));
            assertEq(uint256(p.credit) + p.lockedCash + p.yesFree + p.noFree + p.openOrders, 0, "nothing left in the engine");
        }
        assertEq(vault.openWindows().length, 0);
        assertEq(vault.totalValue(), vault.liquid());
        for (uint256 i; i < suppliers.length; ++i) {
            uint256 s = vault.sharesOf(suppliers[i]);
            if (s == 0) continue;
            vm.prank(suppliers[i]);
            vault.withdraw(s);
        }
        assertEq(vault.supplyShares(), 0);
        assertEq(vault.liquid(), 0, "the last supplier takes exactly what is left");
        assertEq(usd.balanceOf(address(vault)), handler.donated(), "the vault ends holding only the donations");
        assertConserved();
    }
}
