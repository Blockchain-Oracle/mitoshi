// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

// Ported from Masayume 68f7a09:contracts/src/leverage/LeverageReserve.sol
// Seam edits (docs/specs/engine.md A.4.3) and Agari's fixes (03b30abbbfe7ddc3cac4927c7c573e52f74d2d49:
// anchor/programs/agari-leverage, D-114, D-116): `open(…, spotProof)` refuses an entry above the fair-value model
// (PD-2), a front a void would not repay (`VoidWouldShort`) on the quote and on the fill, and a position that is not
// healthy and sellable at birth over rested depth (`ThinBook` / `UnhealthyAtEntry`); `knockOut(id, spotProof)` judges
// the whole position over rested depth (a thinned book refuses rather than sells cheap), sells with the last rested
// level as its limit, and also needs the fair-value mark to breach the line (`FairValueHealthy`, Q-022); every exit
// pays the owner through `_payOrOwe` (never waits on their receive policy) and a supplier's withdrawal is P12-checked.
// `balanceOf(this) == liquid + totalOwedPayouts` after every call.

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IEventsEngine} from "../../engine/interfaces/IEventsEngine.sol";
import {IEngineLens, MarketRef} from "../../engine/interfaces/IEngineLens.sol";
import {FairValueGuard} from "../../fair/FairValueGuard.sol";
import {EngineSeam} from "../shared/EngineSeam.sol";
import {Payouts, PayoutCheck} from "../shared/Payouts.sol";
import {LeverageGateway} from "./LeverageGateway.sol";
import {LeverageMath} from "./LeverageMath.sol";

/// @title LeverageReserve — prefunded, capped leverage on engine Windows: a knock-out certificate on the venue's own
///        contracts.
/// @notice Ported from the Ticket's arithmetic in Yosuku (`ticket624.core.ts`: a stake at L× buys `stake·L / price`
///         contracts, a win pays that quantity less the financed `stake·(L−1)`). The reserve fronts `(L−1)·stake` for a
///         premium, buys the contracts off the book as the venue's taker, and holds them as its own hedge. Its claim is
///         repaid first out of whatever the contracts fetch: at settlement, at the owner's cash-out, or at the knock-out
///         anyone may trigger once rested depth and the fair-value model both put the mark under the maintenance line.
/// @dev Storage and events carry market ids only (AD-10). Every exit pays `owner`, never the caller (AD-5).
contract LeverageReserve is LeverageGateway, Payouts, ReentrancyGuard {
    using SafeERC20 for IERC20;

    /// @dev Withdrawable supplier capital plus premiums kept and fronts reclaimed.
    uint256 public liquid;
    /// @dev Σ `fronted` over LIVE positions — the reserve's capital out on the venue, at cost.
    uint256 public outstanding;
    uint256 public supplyShares;
    mapping(address supplier => uint256 shares) public sharesOf;
    /// @dev Fronted capital per Window (the same-print correlation sub-cap).
    mapping(bytes32 marketId => uint256 amount) public frontedByMarket;

    /// @dev `positionId` is the 1-based index; 0 means "none".
    Position[] private _positions;
    mapping(address owner => uint256[] positionIds) private _positionsOf;
    /// @dev LIVE positions, bounded by `maxOpenPositions`, so the keeper's scan and `unsettledExpired` are too.
    uint256[] private _open;
    mapping(uint256 positionId => uint256 indexPlusOne) private _openAt;

    constructor(IERC20 collateral_, IEventsEngine engine_, IEngineLens lens_, FairValueGuard guard_, Params memory params_)
        LeverageGateway(collateral_, engine_, lens_, guard_, params_)
    {}

    // ------------------------------------------------------------------ suppliers

    /// @notice Capital for the reserve, as shares of its total value.
    function supply(uint256 amount) external nonReentrant returns (uint256 shares) {
        if (paused) revert IsPaused();
        if (amount == 0) revert ZeroAmount();
        uint256 tv = totalValue();
        shares = (supplyShares == 0 || tv == 0) ? amount : amount * supplyShares / tv;
        if (shares == 0) revert ZeroAmount();
        collateral.safeTransferFrom(msg.sender, address(this), amount);
        supplyShares += shares;
        sharesOf[msg.sender] += shares;
        liquid += amount;
        emit Supplied(msg.sender, amount, shares, liquid);
    }

    /// @notice Redeems shares for their part of the total value, from `liquid` only, to the caller (P12 pre-checked).
    ///         Refused while a position past its Window's expiry is unsettled — settle it first (anyone may).
    function withdraw(uint256 shares) external nonReentrant returns (uint256 amount) {
        if (shares == 0) revert ZeroAmount();
        uint256 held = sharesOf[msg.sender];
        if (held < shares) revert InsufficientShares(shares, held);
        uint256 stale = unsettledExpired();
        if (stale != 0) revert UnsettledPosition(stale);
        amount = shares * totalValue() / supplyShares;
        if (liquid < amount) revert InsufficientLiquidity(amount, liquid);
        sharesOf[msg.sender] = held - shares;
        supplyShares -= shares;
        liquid -= amount;
        PayoutCheck.payChecked(collateral, msg.sender, amount);
        emit SupplyRedeemed(msg.sender, amount, shares, liquid);
    }

    // ------------------------------------------------------------------ open

    /// @notice Stakes `stake` on a side at `leverageBps`: the reserve sizes the boost off the live book at execution,
    ///         bounds its price by the fair-value model on `spotProof` (PD-2), buys it as a measured IOC taker, proves it
    ///         healthy and sellable over rested depth (D-114), and charges the stake the fill implies — never more than
    ///         `stake`; the change comes straight back. `minQuantityRaw` is the caller's guard against a moved book.
    function open(bytes32 marketId, uint8 outcomeIdx, uint256 stake, uint32 leverageBps, uint256 minQuantityRaw, bytes calldata spotProof)
        external
        nonReentrant
        returns (uint256 positionId, uint256 charged)
    {
        if (paused) revert IsPaused();
        if (stake == 0) revert ZeroAmount();
        MarketRef memory r = _resolve(marketId);
        Preview memory q = _sizeEntry(marketId, r, outcomeIdx, stake, leverageBps);
        if (q.quantityRaw < minQuantityRaw) revert BelowMinQuantity(q.quantityRaw, minQuantityRaw);
        if (_open.length >= params.maxOpenPositions) revert TooManyOpen(uint32(_open.length), params.maxOpenPositions);
        _checkEntry(marketId, outcomeIdx, q.priceRaw, spotProof);
        // An IOC may fill up to its limit; the wallet covers that beyond the stake.
        uint256 worst = LeverageMath.ceilDiv(q.quantityRaw * LeverageMath.sidePrice(q.limitYesRaw, outcomeIdx == 1, one), one);
        if (liquid + stake < worst) revert InsufficientLiquidity(worst - stake, liquid);

        collateral.safeTransferFrom(msg.sender, address(this), stake);
        (uint256 cost, uint256 got) = _placeIoc(marketId, r, outcomeIdx, true, q.limitYesRaw, q.quantityRaw);
        if (got < minQuantityRaw || got == 0) revert BelowMinQuantity(got, minQuantityRaw);
        uint256 fronted;
        uint256 premium;
        (charged, fronted, premium) = LeverageMath.terms(cost, leverageBps, params.premiumBps);
        if (charged > stake) revert StakeAboveMax(charged, stake);
        _requireVoidCovers(fronted, got);
        _requireHealthyAtBirth(marketId, r, outcomeIdx, got, fronted);
        if (liquid + premium < fronted) revert InsufficientLiquidity(fronted, liquid + premium);
        liquid = liquid + premium - fronted;
        outstanding += fronted;
        frontedByMarket[marketId] += fronted;
        _requireCapacity(marketId, fronted);
        if (charged < stake) _payOrOwe(msg.sender, stake - charged);

        _positions.push(
            Position({
                owner: msg.sender,
                status: PositionStatus.LIVE,
                outcomeIdx: outcomeIdx,
                leverageBps: leverageBps,
                marketId: marketId,
                openedAtSec: uint64(block.timestamp),
                expirySec: r.expiry,
                exitedAtSec: 0,
                quantityRaw: got,
                stake: charged,
                fronted: fronted,
                premium: premium,
                entryPriceRaw: LeverageMath.ceilDiv(cost * one, got),
                proceeds: 0,
                reclaimed: 0,
                returned: 0
            })
        );
        positionId = _positions.length;
        _positionsOf[msg.sender].push(positionId);
        _open.push(positionId);
        _openAt[positionId] = _open.length;
        emit Opened(positionId, msg.sender, marketId, outcomeIdx, leverageBps, got, charged, fronted, premium, cost);
    }

    // ------------------------------------------------------------------ exits

    /// @notice The owner's cash-out: sells what the book will take (everything live — the owner meets whatever rests,
    ///         with their own `minProceeds`), repays the reserve first and pays the rest to the owner.
    function close(uint256 positionId, uint256 minProceeds) external nonReentrant returns (uint256 proceeds, uint256 returned) {
        Position storage p = _live(positionId);
        if (p.owner != msg.sender) revert NotOwner(positionId, msg.sender);
        MarketRef memory r = _resolve(p.marketId);
        (, uint256 filled, uint256 limit) = _markOver(p.marketId, r, p.outcomeIdx, p.quantityRaw, false);
        if (filled == 0) revert NothingFilled(p.marketId);
        uint256 sold;
        (proceeds, sold) = _placeIoc(p.marketId, r, p.outcomeIdx, false, limit, filled);
        if (sold == 0) revert NothingFilled(p.marketId);
        if (proceeds < minProceeds) revert Slippage(proceeds, minProceeds);
        (, returned) = _exit(positionId, p, PositionStatus.CLOSED, sold, proceeds);
    }

    /// @notice The knock-out anyone may trigger once the mark has fallen to the maintenance line — judged on the whole
    ///         position over rested depth (D-114) and on the fair-value model at `spotProof` (PD-2): sells into rested
    ///         bids with the last rested level as its limit, repays the reserve first, pays the rest to the owner.
    function knockOut(uint256 positionId, bytes calldata spotProof)
        external
        nonReentrant
        returns (uint256 proceeds, uint256 reclaimed, uint256 returned)
    {
        Position storage p = _live(positionId);
        MarketRef memory r = _resolve(p.marketId);
        (uint256 mark, uint256 filled, uint256 limit) = _markOver(p.marketId, r, p.outcomeIdx, p.quantityRaw, true);
        uint16 maintenance = params.maintenanceBps;
        uint256 line = p.fronted * maintenance / BPS;
        if (filled < p.quantityRaw) revert ThinBook(p.marketId, filled, p.quantityRaw);
        if (!LeverageMath.isKnockable(mark, p.fronted, maintenance)) revert StillHealthy(positionId, mark, line);
        uint256 fairMark = _fairSideRaw(p.marketId, p.outcomeIdx, spotProof) * p.quantityRaw / one;
        if (!LeverageMath.isKnockable(fairMark, p.fronted, maintenance)) revert FairValueHealthy(positionId, fairMark, line);
        uint256 sold;
        (proceeds, sold) = _placeIoc(p.marketId, r, p.outcomeIdx, false, limit, p.quantityRaw);
        if (sold == 0) revert NothingFilled(p.marketId);
        (reclaimed, returned) = _exit(positionId, p, PositionStatus.KNOCKED_OUT, sold, proceeds);
    }

    /// @notice Settles a position whose Window the engine has resolved or voided: redeems its contracts (measured),
    ///         repays the reserve first, pays the rest to the owner. Permissionless.
    function settle(uint256 positionId) external nonReentrant returns (uint256 payout, uint256 reclaimed, uint256 returned) {
        Position storage p = _live(positionId);
        MarketRef memory r = _resolve(p.marketId);
        if (!lens.isResolved(p.marketId) && !lens.isVoided(p.marketId)) revert MarketNotSettled(p.marketId);
        uint256 quantity = p.quantityRaw;
        payout = EngineSeam.redeemPartialMeasured(engine, lens, collateral, p.marketId, p.outcomeIdx, EngineSeam.toLots(quantity, r.lotBase));
        (reclaimed, returned) = _exit(positionId, p, PositionStatus.SETTLED, quantity, payout);
    }

    // ------------------------------------------------------------------ views

    function totalValue() public view returns (uint256) {
        return liquid + outstanding;
    }

    function utilizationBps() external view returns (uint256) {
        uint256 tv = totalValue();
        return tv == 0 ? 0 : outstanding * BPS / tv;
    }

    function positionCount() external view returns (uint256) {
        return _positions.length;
    }

    function positionOf(uint256 positionId) external view returns (Position memory) {
        return _positionOf(positionId);
    }

    function positionCountOf(address owner) external view returns (uint256) {
        return _positionsOf[owner].length;
    }

    /// @notice An owner's positions, oldest first, paged — readable without an event scan.
    function positionsOf(address owner, uint256 offset, uint256 limit) external view returns (uint256[] memory page) {
        uint256[] storage all = _positionsOf[owner];
        if (offset >= all.length) return page;
        uint256 end = offset + limit;
        if (end > all.length) end = all.length;
        page = new uint256[](end - offset);
        for (uint256 i = offset; i < end; i++) {
            page[i - offset] = all[i];
        }
    }

    /// @notice Every LIVE position — what the keeper watches.
    function openPositions() external view returns (uint256[] memory) {
        return _open;
    }

    /// @notice The first LIVE position whose Window has expired, or zero — what blocks a withdrawal until settled.
    function unsettledExpired() public view returns (uint256) {
        for (uint256 i = 0; i < _open.length; i++) {
            if (_positions[_open[i] - 1].expirySec <= block.timestamp) return _open[i];
        }
        return 0;
    }

    /// @notice What rested depth would pay for a position right now, the line, and whether the book alone puts it under
    ///         (the knock-out also needs the whole size to fill and the fair-value mark to breach — see `fairMarkOf`).
    function markOf(uint256 positionId) external view returns (uint256 markRaw, uint256 filledRaw, uint256 lineRaw, bool knockable) {
        Position storage p = _positionOf(positionId);
        if (p.status != PositionStatus.LIVE) return (0, 0, 0, false);
        (markRaw, filledRaw,) = _markOver(p.marketId, _resolve(p.marketId), p.outcomeIdx, p.quantityRaw, true);
        lineRaw = p.fronted * params.maintenanceBps / BPS;
        knockable = filledRaw >= p.quantityRaw && LeverageMath.isKnockable(markRaw, p.fronted, params.maintenanceBps);
    }

    /// @notice The fair-value model's mark for a position at a spot the caller supplies (a preview; never the bound).
    function fairMarkOf(uint256 positionId, int64 spotE8) external view returns (uint256 fairMarkRaw, bool knockable) {
        Position storage p = _positionOf(positionId);
        if (p.status != PositionStatus.LIVE) return (0, false);
        uint256 upE6 = guard.previewFairUpE6(p.marketId, spotE8);
        uint256 sideE6 = p.outcomeIdx == 0 ? upE6 : 1_000_000 - upE6;
        fairMarkRaw = sideE6 * one / 1_000_000 * p.quantityRaw / one;
        knockable = LeverageMath.isKnockable(fairMarkRaw, p.fronted, params.maintenanceBps);
    }

    // ------------------------------------------------------------------ internals

    function _payoutToken() internal view override returns (IERC20) {
        return collateral;
    }

    function _booked(uint256 amount) internal override {
        liquid += amount;
    }

    /// @dev D-114: right after the fill, rested depth must take the whole size at a mark above the knock-out line.
    function _requireHealthyAtBirth(bytes32 marketId, MarketRef memory r, uint8 outcomeIdx, uint256 quantityRaw, uint256 fronted) internal view {
        (uint256 mark, uint256 filled,) = _markOver(marketId, r, outcomeIdx, quantityRaw, true);
        if (filled < quantityRaw) revert ThinBook(marketId, filled, quantityRaw);
        if (LeverageMath.isKnockable(mark, fronted, params.maintenanceBps)) revert UnhealthyAtEntry(mark, fronted * params.maintenanceBps / BPS);
    }

    /// @dev Books what a sale or redemption fetched: the reserve's claim first, the rest to the owner (pay or owe). A
    ///      partial sale leaves the position LIVE with fewer contracts and a smaller claim; a full exit books whatever
    ///      claim went unrecovered as the reserve's loss and closes the position.
    function _exit(uint256 positionId, Position storage p, PositionStatus status, uint256 sold, uint256 proceeds)
        internal
        returns (uint256 reclaimed, uint256 returned)
    {
        (reclaimed, returned) = LeverageMath.split(proceeds, p.fronted);
        p.quantityRaw -= sold;
        p.fronted -= reclaimed;
        p.proceeds += proceeds;
        p.reclaimed += reclaimed;
        p.returned += returned;
        liquid += reclaimed;
        uint256 released = reclaimed;
        if (p.quantityRaw == 0) {
            released += p.fronted;
            p.fronted = 0;
            p.status = status;
            p.exitedAtSec = uint64(block.timestamp);
            _removeOpen(positionId);
        }
        outstanding -= released;
        frontedByMarket[p.marketId] -= released;
        _payOrOwe(p.owner, returned);
        emit Exited(positionId, p.owner, p.quantityRaw == 0 ? status : PositionStatus.LIVE, sold, proceeds, reclaimed, returned, msg.sender);
    }

    /// @dev The per-position cap, then the per-Window sub-cap, then the exposure cap — after the front is booked.
    function _requireCapacity(bytes32 marketId, uint256 fronted) internal view {
        Params memory p = params;
        if (fronted > p.maxFrontedPerPosition) revert OverPositionCap(fronted, p.maxFrontedPerPosition);
        if (frontedByMarket[marketId] > p.maxWindowFronted) revert OverWindowCap(marketId, frontedByMarket[marketId], p.maxWindowFronted);
        uint256 tv = totalValue();
        if (outstanding * BPS > tv * p.maxExposureBps) revert OverExposure(outstanding, tv, p.maxExposureBps);
    }

    function _live(uint256 positionId) internal view returns (Position storage p) {
        p = _positionOf(positionId);
        if (p.status != PositionStatus.LIVE) revert NotLive(positionId, p.status);
    }

    function _positionOf(uint256 positionId) internal view returns (Position storage) {
        if (positionId == 0 || positionId > _positions.length) revert NoSuchPosition(positionId);
        return _positions[positionId - 1];
    }

    function _removeOpen(uint256 positionId) internal {
        uint256 at = _openAt[positionId];
        if (at == 0) return;
        uint256 last = _open.length - 1;
        if (at - 1 != last) {
            uint256 moved = _open[last];
            _open[at - 1] = moved;
            _openAt[moved] = at;
        }
        _open.pop();
        delete _openAt[positionId];
    }
}
