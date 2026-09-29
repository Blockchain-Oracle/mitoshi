// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {MarketRef, PositionView} from "../../../src/engine/interfaces/IEngineLens.sol";
import {PlaceArgs, PlaceResult, KIND_BUY_YES, KIND_BUY_NO, KIND_SELL_YES} from "../../../src/engine/EngineTypes.sol";

/// The one mock the product suites keep (A.6, D-018): an engine + lens that trades honestly until told to lie, so each
/// product's `EngineAccountingMismatch` assert is proven against every way a venue's report can disagree with the
/// balances it actually moved. Grid 1000/1000, cu 1; every order fills in full at its own limit.
contract LyingEngine {
    enum Lie {
        None,
        PhantomFill, // reports a fill, credits no position
        OverPull, // pulls more than it reports
        Rested, // reports a rested remainder
        ShortPay, // a sale pays less than it reports
        WithdrawOnBuy, // a buy also "withdraws" credit
        CreditDrift, // moves the product's engine credit
        RedeemShort // a redemption pays less than it reports
    }

    IERC20 public immutable usd;
    Lie public lie;
    uint8 public status = 1;
    bool public optedOut;
    mapping(address holder => PositionView) internal _pos;

    constructor(IERC20 usd_) {
        usd = usd_;
    }

    function setLie(Lie l) external {
        lie = l;
    }

    function setStatus(uint8 s) external {
        status = s;
    }

    // ---- the engine surface products call ----

    function collateral() external view returns (address) {
        return address(usd);
    }

    function setCrankOptOut(bool on) external {
        optedOut = on;
    }

    function placeOrder(PlaceArgs calldata a) external returns (PlaceResult memory r) {
        PositionView storage p = _pos[msg.sender];
        bool yes = a.kind < KIND_BUY_NO;
        bool buy = a.kind == KIND_BUY_YES || a.kind == KIND_BUY_NO;
        uint64 ticks = yes ? a.priceTicks : 1000 - a.priceTicks;
        uint64 cash = a.lots * ticks;
        r.filledLots = a.lots;
        if (buy) {
            r.cashSpent = cash;
            r.transferredIn = cash;
            usd.transferFrom(msg.sender, address(this), lie == Lie.OverPull ? cash + 1 : cash);
            if (lie != Lie.PhantomFill) {
                if (yes) p.yesFree += a.lots;
                else p.noFree += a.lots;
            }
            if (lie == Lie.WithdrawOnBuy) {
                r.withdrawn = 1;
                usd.transfer(msg.sender, 1);
            }
        } else {
            if (a.kind == KIND_SELL_YES) p.yesFree -= a.lots;
            else p.noFree -= a.lots;
            r.cashReceived = cash;
            r.withdrawn = cash;
            usd.transfer(msg.sender, lie == Lie.ShortPay ? cash - 1 : cash);
        }
        if (lie == Lie.Rested) r.restedLots = 1;
        if (lie == Lie.CreditDrift) p.credit += 1;
    }

    function redeemPartial(bytes32, uint8 outcome, uint64 lots) external returns (uint64 payout) {
        PositionView storage p = _pos[msg.sender];
        if (outcome == 0) p.yesFree -= lots;
        else p.noFree -= lots;
        payout = lots * 1000;
        usd.transfer(msg.sender, lie == Lie.RedeemShort ? payout - 1 : payout);
    }

    function withdrawCredit(bytes32, uint64 amount) external {
        _pos[msg.sender].credit -= amount;
        usd.transfer(msg.sender, amount);
    }

    // ---- the lens surface products read ----

    function engine() external view returns (address) {
        return address(this);
    }

    function marketRef(bytes32) external view returns (MarketRef memory r) {
        r.lockAt = type(uint32).max;
        r.expiry = type(uint32).max;
        r.status = status;
        r.lotBase = 1000;
        r.tickBase = 1000;
        r.minLots = 1;
    }

    function positionOf(bytes32, address holder) external view returns (PositionView memory) {
        return _pos[holder];
    }

    function creditOf(bytes32, address holder) external view returns (uint64) {
        return _pos[holder].credit;
    }
}
