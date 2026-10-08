// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

// Ported from Masayume 68f7a09:contracts/src/parlay/ParlayReserve.sol
// Seam edits (docs/specs/engine.md A.4.6): legs settle on the engine's lens (status, payout numerators); `openParlay`
// takes one signed spot per leg for the PD-2 bound; D-108 (Agari): legs are decided in close order (`LegOutOfOrder`),
// finished tickets and decided legs stay no-ops; L-38: a boundary's `lockedByExpiry` is released the moment its last
// pending leg is decided and won (and at the ticket's end for every boundary not released yet); P12: the void refund
// and the claim go through `_payOrOwe` (a receive policy that blocks the owner holds it as owed; `claimOwed()`), a
// supplier's own withdrawal refuses instead (`ReceivePolicyBlocked`). `balanceOf(this) == liquid + Σ live escrow +
// totalOwedPayouts`.

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IEventsEngine} from "../../engine/interfaces/IEventsEngine.sol";
import {IEngineLens} from "../../engine/interfaces/IEngineLens.sol";
import {FairValueGuard} from "../../fair/FairValueGuard.sol";
import {Payouts, PayoutCheck} from "../shared/Payouts.sol";
import {ParlayMath} from "./ParlayMath.sol";
import {ParlayPricing} from "./ParlayPricing.sol";

/// @title ParlayReserve — one ticket, many Windows; the house pre-funds the whole payout.
/// @notice Ported from Yosuku's `parlay624.move`: escrow both sides at open, resolve leg by leg
///         as each Window settles, kill the ticket on the first losing leg, force-pay the owner
///         on a full streak. Suppliers hold shares of `liquid + locked`; they earn lost stakes
///         and pay winning streaks.
/// @dev A leg settles on the engine's own resolution. A voided Window voids the ticket and refunds the stake, and
///      `voidExpired()` on the engine is permissionless, so no admin void exists — nothing can trap a refund (AD-5).
///      Storage and events carry market ids only (AD-10). Claim and void pay `owner`, never the caller.
contract ParlayReserve is ParlayPricing, Payouts, ReentrancyGuard {
    using SafeERC20 for IERC20;

    /// @dev Withdrawable supplier capital plus kept stakes. The escrow of LIVE and WON tickets sits
    ///      outside it: `balanceOf(this) == liquid + Σ (stake + houseLocked) + totalOwedPayouts`.
    uint256 public liquid;
    /// @dev Σ `houseLocked` over LIVE and WON tickets — the reserve's contingent liability.
    uint256 public locked;
    uint256 public supplyShares;
    mapping(address supplier => uint256 shares) public sharesOf;
    /// @dev Contingent liability per settlement instant (the same-print correlation sub-cap).
    mapping(uint64 expirySec => uint256 amount) public lockedByExpiry;

    /// @dev `parlayId` is the 1-based index; 0 means "none".
    Parlay[] private _parlays;
    mapping(uint256 parlayId => Leg[]) private _legs;
    mapping(address owner => uint256[] parlayIds) private _parlaysOf;

    constructor(IERC20 collateral_, IEventsEngine engine_, IEngineLens lens_, FairValueGuard guard_, Params memory params_)
        ParlayPricing(collateral_, engine_, lens_, guard_, params_)
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

    /// @notice Opens a ticket: prices every leg off the venue's rested book, bounds each against the fair-value
    ///         model on `spotProofs[i]` (a signed spot for leg i's ticker, PD-2), takes the floored stake from the
    ///         caller (at most `maxStake`) and escrows the whole `maxPayout` — stake plus the house's part.
    function openParlay(LegInput[] calldata legs, uint256 maxPayout, uint256 maxStake, bytes[] calldata spotProofs)
        external
        nonReentrant
        returns (uint256 parlayId, uint256 stake)
    {
        if (paused) revert IsPaused();
        Priced memory q = _price(legs, maxPayout);
        _checkFair(legs, q.pricesRaw, spotProofs);
        stake = q.stake;
        if (stake > maxStake) revert StakeAboveMax(stake, maxStake);
        uint256 houseLocked = maxPayout - stake;
        _requireCapacity(houseLocked, q.expiries);

        collateral.safeTransferFrom(msg.sender, address(this), stake);
        liquid -= houseLocked;
        locked += houseLocked;
        for (uint256 i = 0; i < q.expiries.length; i++) {
            if (!ParlayMath.seenBefore(q.expiries, i)) lockedByExpiry[q.expiries[i]] += houseLocked;
        }

        _parlays.push(
            Parlay({
                owner: msg.sender,
                status: ParlayStatus.LIVE,
                legCount: uint8(legs.length),
                wonCount: 0,
                openedAtSec: uint64(block.timestamp),
                lastExpirySec: q.lastExpirySec,
                stake: stake,
                maxPayout: maxPayout,
                houseLocked: houseLocked,
                combinedProbRaw: q.combinedProbRaw
            })
        );
        parlayId = _parlays.length;
        _parlaysOf[msg.sender].push(parlayId);
        Leg[] storage stored = _legs[parlayId];
        for (uint256 i = 0; i < legs.length; i++) {
            stored.push(
                Leg({
                    marketId: legs[i].marketId,
                    outcomeIdx: legs[i].outcomeIdx,
                    status: LegStatus.PENDING,
                    expirySec: q.expiries[i],
                    resolvedAtSec: 0,
                    priceRaw: q.pricesRaw[i]
                })
            );
            emit LegPriced(parlayId, uint8(i), legs[i].marketId, legs[i].outcomeIdx, q.pricesRaw[i], q.expiries[i]);
        }
        emit ParlayOpened(parlayId, msg.sender, uint8(legs.length), stake, maxPayout, q.combinedProbRaw, q.lastExpirySec);
    }

    /// @notice The reserve's caps for a ticket that would lock `houseLocked`: what `openParlay` checks after pricing.
    function checkCapacity(uint256 houseLocked, uint64[] calldata expiries) external view {
        _requireCapacity(houseLocked, expiries);
    }

    // ------------------------------------------------------------------ settlement

    /// @notice Settles one leg on the venue's resolution. Permissionless and idempotent: a finished
    ///         ticket or a settled leg is a no-op; only the next leg in close order may be decided (D-108);
    ///         an unsettled Window reverts — crank again later.
    ///         A losing leg kills the ticket and keeps the escrow; a voided Window voids the ticket
    ///         and refunds the stake to the owner; the last winning leg makes it claimable.
    function resolveLeg(uint256 parlayId, uint256 legIdx) external nonReentrant {
        Parlay storage p = _parlayOf(parlayId);
        Leg[] storage legs = _legs[parlayId];
        if (legIdx >= legs.length) revert NoSuchLeg(parlayId, legIdx);
        if (p.status != ParlayStatus.LIVE) return;
        Leg storage leg = legs[legIdx];
        if (leg.status != LegStatus.PENDING) return;
        uint256 next = _nextLeg(legs);
        if (legIdx != next) revert LegOutOfOrder(parlayId, legIdx, next);

        LegStatus outcome = _outcomeOf(leg.marketId, leg.outcomeIdx);
        leg.status = outcome;
        leg.resolvedAtSec = uint64(block.timestamp);
        emit LegResolved(parlayId, uint8(legIdx), leg.marketId, outcome, msg.sender);

        if (outcome == LegStatus.WON) {
            p.wonCount += 1;
            if (!_pendingAt(legs, leg.expirySec)) _releaseExpiry(parlayId, leg.expirySec, p.houseLocked);
            if (p.wonCount == p.legCount) {
                p.status = ParlayStatus.WON;
                emit ParlayWon(parlayId, p.owner, p.maxPayout);
            }
        } else if (outcome == LegStatus.LOST) {
            p.status = ParlayStatus.LOST;
            liquid += p.stake + p.houseLocked;
            _release(parlayId, p, legs);
            emit ParlayLost(parlayId, p.owner, p.stake, uint8(legIdx));
        } else {
            p.status = ParlayStatus.VOID;
            liquid += p.houseLocked;
            _release(parlayId, p, legs);
            _payOrOwe(p.owner, p.stake);
            emit ParlayVoided(parlayId, p.owner, p.stake, uint8(legIdx));
        }
    }

    /// @notice Pays a won ticket's whole escrow to its owner. Anyone may call; the money only ever
    ///         goes to `owner`, so a payout never waits on a keeper (FR-31) — or is held as owed if the owner's
    ///         receive policy blocks it (P12).
    function claim(uint256 parlayId) external nonReentrant returns (uint256 payout) {
        Parlay storage p = _parlayOf(parlayId);
        if (p.status != ParlayStatus.WON) revert NotWon(parlayId, p.status);
        p.status = ParlayStatus.CLAIMED;
        _release(parlayId, p, _legs[parlayId]);
        payout = p.maxPayout;
        _payOrOwe(p.owner, payout);
        emit ParlayClaimed(parlayId, p.owner, payout, msg.sender);
    }

    // ------------------------------------------------------------------ views

    function totalValue() public view returns (uint256) {
        return liquid + locked;
    }

    function utilizationBps() external view returns (uint256) {
        uint256 tv = totalValue();
        return tv == 0 ? 0 : locked * ParlayMath.BPS / tv;
    }

    function parlayCount() external view returns (uint256) {
        return _parlays.length;
    }

    function parlayOf(uint256 parlayId) external view returns (Parlay memory) {
        return _parlayOf(parlayId);
    }

    function legsOf(uint256 parlayId) external view returns (Leg[] memory) {
        _parlayOf(parlayId);
        return _legs[parlayId];
    }

    /// @notice D-108: the one leg `resolveLeg` accepts next (`legCount` when none is pending).
    function nextLegOf(uint256 parlayId) external view returns (uint256) {
        _parlayOf(parlayId);
        return _nextLeg(_legs[parlayId]);
    }

    function parlayCountOf(address owner) external view returns (uint256) {
        return _parlaysOf[owner].length;
    }

    /// @notice An owner's tickets, oldest first, paged — readable without an event scan.
    function parlaysOf(address owner, uint256 offset, uint256 limit) external view returns (uint256[] memory page) {
        uint256[] storage all = _parlaysOf[owner];
        if (offset >= all.length) return page;
        uint256 end = offset + limit;
        if (end > all.length) end = all.length;
        page = new uint256[](end - offset);
        for (uint256 i = offset; i < end; i++) {
            page[i - offset] = all[i];
        }
    }

    // ------------------------------------------------------------------ internals

    function _payoutToken() internal view override returns (IERC20) {
        return collateral;
    }

    /// @dev Liquidity first (an empty reserve says so plainly), then the exposure cap, then the per-expiry sub-cap.
    function _requireCapacity(uint256 houseLocked, uint64[] memory expiries) internal view {
        if (liquid < houseLocked) revert InsufficientLiquidity(houseLocked, liquid);
        uint256 tv = totalValue();
        uint256 wouldBe = locked + houseLocked;
        if (wouldBe * ParlayMath.BPS > tv * params.maxExposureBps) revert OverExposure(wouldBe, tv, params.maxExposureBps);
        for (uint256 i = 0; i < expiries.length; i++) {
            if (ParlayMath.seenBefore(expiries, i)) continue;
            uint256 next = lockedByExpiry[expiries[i]] + houseLocked;
            if (next > params.maxExpiryLocked) revert OverExpiryCap(expiries[i], next, params.maxExpiryLocked);
        }
    }

    /// @dev The venue's verdict for one side: void when the Window voided, won when its payout beats
    ///      the other side's, lost when the other's beats it. A vector that names no winner is a void.
    function _outcomeOf(bytes32 marketId, uint8 outcomeIdx) internal view returns (LegStatus) {
        if (lens.isVoided(marketId)) return LegStatus.VOID;
        if (!lens.isResolved(marketId)) revert MarketNotSettled(marketId);
        uint256[] memory numerators = lens.payoutNumerators(marketId);
        if (numerators.length < 2) return LegStatus.VOID;
        uint256 mine = numerators[outcomeIdx];
        uint256 other = numerators[1 - outcomeIdx];
        if (mine > other) return LegStatus.WON;
        if (other > mine) return LegStatus.LOST;
        return LegStatus.VOID;
    }

    /// @dev D-108: the pending leg with the earliest settlement instant, the lowest index on a tie.
    function _nextLeg(Leg[] storage legs) internal view returns (uint256 next) {
        next = legs.length;
        uint64 best = type(uint64).max;
        for (uint256 i = 0; i < legs.length; i++) {
            if (legs[i].status == LegStatus.PENDING && legs[i].expirySec < best) (next, best) = (i, legs[i].expirySec);
        }
    }

    function _pendingAt(Leg[] storage legs, uint64 expirySec) internal view returns (bool) {
        for (uint256 i = 0; i < legs.length; i++) {
            if (legs[i].expirySec == expirySec && legs[i].status == LegStatus.PENDING) return true;
        }
        return false;
    }

    /// @dev True once every leg at `expirySec` has won — its lock was released then (L-38).
    function _allWonAt(Leg[] storage legs, uint64 expirySec) internal view returns (bool) {
        for (uint256 i = 0; i < legs.length; i++) {
            if (legs[i].expirySec == expirySec && legs[i].status != LegStatus.WON) return false;
        }
        return true;
    }

    function _releaseExpiry(uint256 parlayId, uint64 expirySec, uint256 h) internal {
        uint256 cur = lockedByExpiry[expirySec];
        uint256 amount = cur > h ? h : cur;
        lockedByExpiry[expirySec] = cur - amount;
        emit ExpiryReleased(parlayId, expirySec, amount);
    }

    /// @dev Releases a ticket's contingent liability from the aggregate and from each distinct expiry not already
    ///      released by its last leg winning (L-38).
    function _release(uint256 parlayId, Parlay storage p, Leg[] storage legs) internal {
        uint256 h = p.houseLocked;
        locked = locked > h ? locked - h : 0;
        uint64[] memory expiries = new uint64[](legs.length);
        for (uint256 i = 0; i < legs.length; i++) {
            expiries[i] = legs[i].expirySec;
            if (ParlayMath.seenBefore(expiries, i) || _allWonAt(legs, expiries[i])) continue;
            _releaseExpiry(parlayId, expiries[i], h);
        }
    }

    function _parlayOf(uint256 parlayId) internal view returns (Parlay storage) {
        if (parlayId == 0 || parlayId > _parlays.length) revert NoSuchParlay(parlayId);
        return _parlays[parlayId - 1];
    }
}
