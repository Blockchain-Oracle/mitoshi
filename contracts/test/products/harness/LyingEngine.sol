// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {MarketRef, PositionView, LevelRaw} from "../../../src/engine/interfaces/IEngineLens.sol";
import {PlaceArgs, PlaceResult, KIND_BUY_YES, KIND_BUY_NO, KIND_SELL_YES, ORDER_POST_ONLY} from "../../../src/engine/EngineTypes.sol";

/// The one mock the product suites keep (A.6, D-018): an engine + lens that trades honestly until told to lie, so each
/// product's `EngineAccountingMismatch` assert is proven against every way a venue's report can disagree with the
/// balances it actually moved. Grid 1000/1000, cu 1; every taker order fills in full at its own limit; a PostOnly buy
/// rests in full (the maker surface, S8: rest, cancel-all, credit, merge, full redeem; YES wins every redeem).
contract LyingEngine {
    enum Lie {
        None,
        PhantomFill, // reports a fill, credits no position
        OverPull, // pulls more than it reports
        Rested, // reports a rested remainder
        ShortPay, // a sale pays less than it reports
        WithdrawOnBuy, // a buy also "withdraws" credit
        CreditDrift, // moves the product's engine credit
        RedeemShort, // a redemption pays less than it reports
        CreditShort, // a credit withdrawal pays less than it debits
        MergeShort, // a merge pays less than it reports
        RedeemAllShort // a full redeem pays less than it reports
    }

    IERC20 public immutable usd;
    Lie public lie;
    uint8 public status = 1;
    bool public optedOut;
    /// @dev The one-level book the lens reports (S10c: the leverage reserve walks it), YES ticks, deep.
    uint16 public askTicks = 520;
    uint16 public bidTicks = 480;
    mapping(address holder => PositionView) internal _pos;
    uint128 internal _nextId;

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

    /// @dev Test knob: the fills a maker's resting bids would have left it (lots on each side, escrow released).
    function give(address holder, uint64 yesLots, uint64 noLots) external {
        _pos[holder].yesFree += yesLots;
        _pos[holder].noFree += noLots;
    }

    function placeOrder(PlaceArgs calldata a) external returns (PlaceResult memory r) {
        PositionView storage p = _pos[msg.sender];
        bool yes = a.kind < KIND_BUY_NO;
        bool buy = a.kind == KIND_BUY_YES || a.kind == KIND_BUY_NO;
        uint64 ticks = yes ? a.priceTicks : 1000 - a.priceTicks;
        uint64 cash = a.lots * ticks;
        if (a.orderType == ORDER_POST_ONLY) return _rest(p, a, cash);
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

    function _rest(PositionView storage p, PlaceArgs calldata a, uint64 cash) internal returns (PlaceResult memory r) {
        usd.transferFrom(msg.sender, address(this), lie == Lie.OverPull ? cash + 1 : cash);
        p.lockedCash += cash;
        p.openOrders += 1;
        r.transferredIn = cash;
        r.restedLots = lie == Lie.Rested ? a.lots - 1 : a.lots;
        r.restedOrderId = ++_nextId;
        if (lie == Lie.PhantomFill) r.filledLots = a.lots;
        if (lie == Lie.WithdrawOnBuy) {
            r.withdrawn = 1;
            usd.transfer(msg.sender, 1);
        }
    }

    function cancelAll(bytes32, uint8, bool) external returns (uint256 removed, uint64 withdrawn) {
        PositionView storage p = _pos[msg.sender];
        removed = p.openOrders;
        p.credit += p.lockedCash;
        p.lockedCash = 0;
        p.openOrders = 0;
        withdrawn = 0;
    }

    function mergeSet(bytes32, uint64 lots, bool) external returns (uint64 cash, uint64 withdrawn) {
        PositionView storage p = _pos[msg.sender];
        p.yesFree -= lots;
        p.noFree -= lots;
        cash = lots * 1000;
        withdrawn = cash;
        usd.transfer(msg.sender, lie == Lie.MergeShort ? cash - 1 : cash);
    }

    function redeem(bytes32) external returns (uint64 total) {
        PositionView storage p = _pos[msg.sender];
        total = p.yesFree * 1000 + p.credit + p.lockedCash;
        delete _pos[msg.sender];
        usd.transfer(msg.sender, lie == Lie.RedeemAllShort ? total - 1 : total);
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
        usd.transfer(msg.sender, lie == Lie.CreditShort ? amount - 1 : amount);
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
        // S10c: a ticker, a Series and an open print, so the FairValueGuard can model a Window of this lens.
        r.ticker = 1;
        r.seriesId = keccak256("lying-series");
        r.openE8 = 365e8;
    }

    function levelsRaw(bytes32, bool isBid, uint256, uint32, uint256) external view returns (LevelRaw[] memory out) {
        out = new LevelRaw[](1);
        out[0] = LevelRaw(uint256(isBid ? bidTicks : askTicks) * 1000, 1e12);
    }

    function grid(bytes32) external pure returns (uint256 tickSize, uint256 minQuantity, uint256 lotSize) {
        return (1000, 1000, 1000);
    }

    function isResolved(bytes32) external view returns (bool) {
        return status == 4;
    }

    function isVoided(bytes32) external view returns (bool) {
        return status == 5;
    }

    function marketsOf(bytes32[] calldata ids) external view returns (MarketRef[] memory out) {
        out = new MarketRef[](ids.length);
        for (uint256 i; i < ids.length; ++i) out[i] = this.marketRef(ids[i]);
    }

    function positionOf(bytes32, address holder) external view returns (PositionView memory) {
        return _pos[holder];
    }

    function creditOf(bytes32, address holder) external view returns (uint64) {
        return _pos[holder].credit;
    }
}
