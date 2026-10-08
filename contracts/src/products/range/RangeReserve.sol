// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

// Ported from Masayume 68f7a09:contracts/src/range/RangeReserve.sol
// Seam edits (docs/specs/engine.md A.4.7): a round settles on its Window's engine verdict — resolved → the close print
// (`closeE8 / 1e6` → cents, inclusive band), voided → a refund; `openRange` takes one signed spot for the PD-2/D-119
// drift bound; `voidStale` refuses `MustSettle` while the engine has answered the Window (Agari 03b30abbbfe7ddc3cac4927c
// 7c573e52f74d2d49:anchor/programs/agari-range/src/instructions/resolve.rs, D-108); P12: the refund and the claim go
// through `_payOrOwe` (a receive policy that blocks the owner holds it as owed; `claimOwed()`), a supplier's own
// withdrawal refuses instead (`ReceivePolicyBlocked`). `balanceOf(this) == liquid + Σ live escrow + totalOwedPayouts`.

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IEventsEngine} from "../../engine/interfaces/IEventsEngine.sol";
import {IEngineLens, MarketRef} from "../../engine/interfaces/IEngineLens.sol";
import {FairValueGuard} from "../../fair/FairValueGuard.sol";
import {Payouts, PayoutCheck} from "../shared/Payouts.sol";
import {RangeMath} from "./RangeMath.sol";
import {RangePricing} from "./RangePricing.sol";

/// @title RangeReserve — a band on one Window's closing print; the house pre-funds the whole payout.
/// @notice The reference's Range is a both-ends-finite band the venue priced and settled on its own feed
///         (`ticket624.core.ts` §range). Here the band settles on the engine's close print for the Window — the same
///         print its Up/Down settles on, in cents. A Moonshot is a band whose far edge saturates. Suppliers hold
///         shares of `liquid + locked`; they earn lost stakes and pay winning bands.
/// @dev Settlement is permissionless and idempotent: while the engine has no verdict `settle` reverts `NotSettled`.
///      A Window the engine never answers is voidable by anyone after `staleAfterSec`. Storage and events carry market
///      ids only (AD-10). Claim and refund pay `owner`, never the caller (AD-5).
contract RangeReserve is RangePricing, Payouts, ReentrancyGuard {
    using SafeERC20 for IERC20;

    /// @dev Withdrawable supplier capital plus kept stakes. The escrow of LIVE and WON rounds sits outside it.
    uint256 public liquid;
    /// @dev Σ `houseLocked` over LIVE and WON rounds — the reserve's contingent liability.
    uint256 public locked;
    uint256 public supplyShares;
    mapping(address supplier => uint256 shares) public sharesOf;
    /// @dev Contingent liability per settlement instant: every band on one print is decided together.
    mapping(uint64 expirySec => uint256 amount) public lockedByExpiry;

    /// @dev `roundId` is the 1-based index; 0 means "none".
    Round[] private _rounds;
    mapping(uint256 roundId => Basis) private _basisOf;
    mapping(address owner => uint256[] roundIds) private _roundsOf;

    constructor(IERC20 collateral_, IEventsEngine engine_, IEngineLens lens_, FairValueGuard guard_, Params memory params_)
        RangePricing(collateral_, engine_, lens_, guard_, params_)
    {}

    // ------------------------------------------------------------------ suppliers

    /// @notice Capital for the reserve, as shares of its total value. Locked capital is not withdrawable.
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
    function withdraw(uint256 shares) external nonReentrant returns (uint256 amount) {
        if (shares == 0) revert ZeroAmount();
        uint256 held = sharesOf[msg.sender];
        if (held < shares) revert InsufficientShares(shares, held);
        amount = shares * totalValue() / supplyShares;
        if (liquid < amount) revert InsufficientLiquidity(amount, liquid);
        sharesOf[msg.sender] = held - shares;
        supplyShares -= shares;
        liquid -= amount;
        PayoutCheck.payChecked(collateral, msg.sender, amount);
        emit SupplyRedeemed(msg.sender, amount, shares, liquid);
    }

    // ------------------------------------------------------------------ open

    /// @notice Opens a round: prices the band off the engine's opening print, the Window's rested book and the house's
    ///         volatility, bounds the book's centre against `spotProof` (a signed spot for the Window's ticker, PD-2),
    ///         takes the floored stake from the caller (at most `maxStake`) and escrows the whole `maxPayout`.
    function openRange(
        bytes32 marketId,
        string calldata asset,
        Side side,
        int256 lowPrint,
        int256 highPrint,
        uint256 maxPayout,
        uint256 maxStake,
        bytes calldata spotProof
    ) external nonReentrant returns (uint256 roundId, uint256 stake) {
        if (paused) revert IsPaused();
        Priced memory q = _price(marketId, asset, side, lowPrint, highPrint, maxPayout);
        _checkDrift(marketId, q, spotProof);
        stake = q.stake;
        if (stake > maxStake) revert StakeAboveMax(stake, maxStake);
        uint256 houseLocked = maxPayout - stake;
        _requireCapacity(houseLocked, q.expiry);

        collateral.safeTransferFrom(msg.sender, address(this), stake);
        liquid -= houseLocked;
        locked += houseLocked;
        lockedByExpiry[q.expiry] += houseLocked;

        _rounds.push(
            Round({
                owner: msg.sender,
                status: RoundStatus.LIVE,
                side: side,
                marketId: marketId,
                expirySec: q.expiry,
                openedAtSec: uint64(block.timestamp),
                settledAtSec: 0,
                openingPrint: q.openingPrint,
                lowPrint: lowPrint,
                highPrint: highPrint,
                closingPrint: 0,
                stake: stake,
                maxPayout: maxPayout,
                houseLocked: houseLocked,
                probRaw: q.probRaw
            })
        );
        roundId = _rounds.length;
        _basisOf[roundId] = q.basis;
        _roundsOf[msg.sender].push(roundId);
        emit RangeOpened(roundId, msg.sender, marketId, side, lowPrint, highPrint, stake, maxPayout, q.probRaw, q.expiry);
        emit RangeBasis(roundId, q.openingPrint, q.basis.centerQE6, q.basis.sigmaE8, q.basis.tauSec, q.basis.spotE8, q.basis.driftE4);
    }

    /// @notice The reserve's caps for a round that would lock `houseLocked` on `expirySec`: what `openRange` checks after pricing.
    function checkCapacity(uint256 houseLocked, uint64 expirySec) external view {
        _requireCapacity(houseLocked, expirySec);
    }

    // ------------------------------------------------------------------ settlement

    /// @notice Settles a round on the engine's verdict for its Window. Permissionless and idempotent: a settled round
    ///         is a no-op; an unanswered Window reverts — crank again later. A voided Window refunds the stake to the
    ///         owner; a close print inside the band (edges included) pays INSIDE, outside pays OUTSIDE.
    function settle(uint256 roundId) external nonReentrant {
        Round storage r = _roundOf(roundId);
        if (r.status != RoundStatus.LIVE) return;
        (int256 print, bool voided, bool answered) = _answer(r.marketId);
        if (!answered) revert NotSettled(roundId);
        r.settledAtSec = uint64(block.timestamp);
        if (voided) {
            _refund(roundId, r);
            return;
        }
        r.closingPrint = print;
        bool inside = print >= r.lowPrint && print <= r.highPrint;
        bool won = (r.side == Side.INSIDE) == inside;
        if (won) {
            r.status = RoundStatus.WON;
        } else {
            r.status = RoundStatus.LOST;
            liquid += r.stake + r.houseLocked;
            _release(r);
        }
        emit RangeSettled(roundId, r.owner, r.status, print, msg.sender);
    }

    /// @notice Voids a round whose Window the engine still has not answered `staleAfterSec` after expiry, refunding the
    ///         stake to the owner. Anyone may call; a Window the engine has answered must be settled (`MustSettle`).
    function voidStale(uint256 roundId) external nonReentrant {
        Round storage r = _roundOf(roundId);
        if (r.status != RoundStatus.LIVE) return;
        uint64 staleAt = r.expirySec + params.staleAfterSec;
        if (block.timestamp < staleAt) revert NotStale(roundId, staleAt);
        (,, bool answered) = _answer(r.marketId);
        if (answered) revert MustSettle(roundId);
        r.settledAtSec = uint64(block.timestamp);
        _refund(roundId, r);
    }

    /// @notice Pays a won round's whole escrow to its owner. Anyone may call; the money only ever goes to `owner`
    ///         (or is held as owed if the owner's receive policy blocks it, P12).
    function claim(uint256 roundId) external nonReentrant returns (uint256 payout) {
        Round storage r = _roundOf(roundId);
        if (r.status != RoundStatus.WON) revert NotWon(roundId, r.status);
        r.status = RoundStatus.CLAIMED;
        _release(r);
        payout = r.maxPayout;
        _payOrOwe(r.owner, payout);
        emit RangeClaimed(roundId, r.owner, payout, msg.sender);
    }

    // ------------------------------------------------------------------ views

    function totalValue() public view returns (uint256) {
        return liquid + locked;
    }

    function utilizationBps() external view returns (uint256) {
        uint256 tv = totalValue();
        return tv == 0 ? 0 : locked * RangeMath.BPS / tv;
    }

    function roundCount() external view returns (uint256) {
        return _rounds.length;
    }

    function roundOf(uint256 roundId) external view returns (Round memory) {
        return _roundOf(roundId);
    }

    function basisOf(uint256 roundId) external view returns (Basis memory) {
        _roundOf(roundId);
        return _basisOf[roundId];
    }

    function roundCountOf(address owner) external view returns (uint256) {
        return _roundsOf[owner].length;
    }

    /// @notice An owner's rounds, oldest first, paged — readable without an event scan.
    function roundsOf(address owner, uint256 offset, uint256 limit) external view returns (uint256[] memory page) {
        uint256[] storage all = _roundsOf[owner];
        if (offset >= all.length) return page;
        uint256 end = offset + limit;
        if (end > all.length) end = all.length;
        page = new uint256[](end - offset);
        for (uint256 i = offset; i < end; i++) {
            page[i - offset] = all[i];
        }
    }

    /// @notice The engine's verdict for a Window as the reserve reads it: `answered` is false while it has none.
    function answerOf(bytes32 marketId) external view returns (int256 print, bool voided, bool answered) {
        return _answer(marketId);
    }

    // ------------------------------------------------------------------ internals

    function _payoutToken() internal view override returns (IERC20) {
        return collateral;
    }

    /// @dev Voided → no print; resolved → the close in cents (floored from e-8, so a sub-cent remainder never lifts a
    ///      print over an edge); anything else is not yet an answer.
    function _answer(bytes32 marketId) internal view returns (int256 print, bool voided, bool answered) {
        if (lens.isVoided(marketId)) return (0, true, true);
        if (!lens.isResolved(marketId)) return (0, false, false);
        MarketRef memory r = lens.marketRef(marketId);
        return (int256(r.closeE8) / E8_PER_CENT, false, true);
    }

    /// @dev Liquidity first (an empty reserve says so plainly), then the exposure cap, then the per-expiry sub-cap.
    function _requireCapacity(uint256 houseLocked, uint64 expirySec) internal view {
        if (liquid < houseLocked) revert InsufficientLiquidity(houseLocked, liquid);
        uint256 tv = totalValue();
        uint256 wouldBe = locked + houseLocked;
        if (wouldBe * RangeMath.BPS > tv * params.maxExposureBps) revert OverExposure(wouldBe, tv, params.maxExposureBps);
        uint256 next = lockedByExpiry[expirySec] + houseLocked;
        if (next > params.maxExpiryLocked) revert OverExpiryCap(expirySec, next, params.maxExpiryLocked);
    }

    function _refund(uint256 roundId, Round storage r) internal {
        r.status = RoundStatus.VOID;
        liquid += r.houseLocked;
        _release(r);
        _payOrOwe(r.owner, r.stake);
        emit RangeSettled(roundId, r.owner, RoundStatus.VOID, 0, msg.sender);
    }

    /// @dev Releases a round's contingent liability from the aggregate and from its expiry instant.
    function _release(Round storage r) internal {
        uint256 h = r.houseLocked;
        locked = locked > h ? locked - h : 0;
        uint256 cur = lockedByExpiry[r.expirySec];
        lockedByExpiry[r.expirySec] = cur > h ? cur - h : 0;
    }

    function _roundOf(uint256 roundId) internal view returns (Round storage) {
        if (roundId == 0 || roundId > _rounds.length) revert NoSuchRound(roundId);
        return _rounds[roundId - 1];
    }
}
