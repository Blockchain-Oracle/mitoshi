// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {FairValueGuard} from "../../fair/FairValueGuard.sol";
import {EventVault} from "./EventVault.sol";

/// @title The EXIT grant — a Trading Balance's sell-only delegation for exits that run with the app closed (S24, D-193).
/// @notice An owner names an actor (Mitoshi's exit keeper) that may sell the owner's position in a Window, and nothing
///         else: no budget, no buy, no withdraw. The keeper decides *when* (a trailing stop, a take-profit or a
///         stop-loss on the display feed); the contract decides the *lowest price*: every sale's limit must be at or
///         above the Window's fair value at a signed RedStone spot (`FairValueGuard.fairUpE6`, the proof — never the
///         preview) less the wider of the owner's two stated allowances: a share of the fair value (`toleranceBps`) or
///         an absolute slack (`slackBps` of a whole token's payout, D-213). Proceeds land in the owner's balance, as
///         every sale's do.
/// @dev Split from `EventVault` (file size); uses its two hooks so an EXIT grant has no budget path and `placeFor`
///      refuses it — an EXIT actor can only ever sell through `exitFor`, at the floor.
abstract contract VaultExits is EventVault {
    /// @notice The widest tolerance an owner may give, in bps under the fair value (20 %).
    uint16 public constant MAX_EXIT_TOLERANCE_BPS = 2_000;
    /// @notice The widest absolute slack an owner may give, in bps of a whole token's payout (15¢: the house's widest
    ///         fixed half spread, its quote across RedStone's daily gap).
    uint16 public constant MAX_EXIT_SLACK_BPS = 1_500;
    uint256 internal constant E6 = 1_000_000;
    uint256 internal constant BPS = 10_000;

    /// @dev What an EXIT grant may sell under the fair value at: the wider of a share of it and an absolute slack (D-213).
    ///      Zero for a grant made through `grant` (its floor is the fair value itself).
    struct ExitTerms {
        uint16 toleranceBps;
        uint16 slackBps;
    }

    FairValueGuard public immutable fairGuard;
    mapping(uint256 grantId => ExitTerms) private _exitTerms;

    event ExitGranted(uint256 indexed grantId, address indexed owner, address indexed actor, bytes32 market, uint64 expiresAtSec, uint16 toleranceBps, uint16 slackBps);

    error ZeroGuard();
    error BadTolerance(uint16 toleranceBps);
    error BadSlack(uint16 slackBps);
    error ExitGrantHasNoBudget(uint256 budget);
    error NotExitGrant(uint256 grantId);
    error ExitGrantSellsOnly(uint256 grantId);
    error BelowFairFloor(uint256 sidePriceRaw, uint256 floorRaw);

    constructor(FairValueGuard guard_) {
        if (address(guard_) == address(0)) revert ZeroGuard();
        fairGuard = guard_;
    }

    /// @notice Gives `actor` the right to sell this owner's positions (in `market`, or any Window when zero) at no less
    ///         than the fair value less the wider of `toleranceBps` of it and `slackBps` of a whole token's payout,
    ///         until `expiresAtSec`. Replaces a live EXIT grant.
    function grantExit(address actor, bytes32 market, uint64 expiresAtSec, uint16 toleranceBps, uint16 slackBps) external nonReentrant returns (uint256 grantId) {
        if (toleranceBps > MAX_EXIT_TOLERANCE_BPS) revert BadTolerance(toleranceBps);
        if (slackBps > MAX_EXIT_SLACK_BPS) revert BadSlack(slackBps);
        Caps memory scope = Caps({maxStakePerTrade: 0, maxDailySpend: 0, maxOpenPositions: 0, maxPriceRaw: 0, market: market});
        grantId = _grant(msg.sender, GrantKind.EXIT, actor, scope, expiresAtSec, 0);
        _exitTerms[grantId] = ExitTerms(toleranceBps, slackBps);
        emit ExitGranted(grantId, msg.sender, actor, market, expiresAtSec, toleranceBps, slackBps);
    }

    /// @notice The share of the fair value an EXIT grant may sell under it at, in bps (0 for one made through `grant`).
    function exitToleranceBps(uint256 grantId) external view returns (uint16) {
        return _exitTerms[grantId].toleranceBps;
    }

    /// @notice The absolute slack an EXIT grant may sell under the fair value at, in bps of a whole token's payout.
    function exitSlackBps(uint256 grantId) external view returns (uint16) {
        return _exitTerms[grantId].slackBps;
    }

    /// @notice The EXIT actor sells `quantityRaw` of the owner's `outcomeIdx` in `marketId` (an IOC at `priceRaw`, YES
    ///         terms, as `place`), refused unless that limit is at or above the fair-value floor at `spotProof`.
    function exitFor(uint256 grantId, bytes32 marketId, uint8 outcomeIdx, uint256 priceRaw, uint256 quantityRaw, uint64 expireNs, bytes calldata spotProof)
        external
        nonReentrant
        returns (uint256 cashDelta, uint256 tokenDelta)
    {
        Grant storage g = _grantOf(grantId);
        if (g.kind != GrantKind.EXIT) revert NotExitGrant(grantId);
        if (g.actor != msg.sender) revert NotGrantActor(grantId, msg.sender);
        _requireLive(g, grantId);
        bytes32 scope = g.caps.market;
        if (scope != bytes32(0) && scope != marketId) revert OutsideGrantMarket(grantId, marketId);
        uint256 id = outcomeId(marketId, outcomeIdx);
        uint256 floorRaw = exitFloorRaw(grantId, marketId, outcomeIdx, spotProof);
        uint256 side = _sidePrice(outcomeIdx, priceRaw);
        if (side < floorRaw) revert BelowFairFloor(side, floorRaw);

        address owner = g.owner;
        MarketRef memory ref = _resolve(marketId);
        _take(positionOf[owner][id], quantityRaw);
        (cashDelta, tokenDelta) = _placeIoc(ref, outcomeIdx, false, priceRaw, quantityRaw, expireNs, grantId);
        _bookSale(owner, id, cashDelta, tokenDelta);
        _recordFill(owner, marketId, outcomeIdx, false, cashDelta, tokenDelta);
        emit Executed(owner, marketId, grantId, outcomeIdx, false, cashDelta, tokenDelta, msg.sender, uint64(block.timestamp));
    }

    /// @notice The lowest side price (own terms, per `one`) grant `grantId` may sell `outcomeIdx` at, from the proof:
    ///         the side's fair value less the wider of the grant's tolerance share and its absolute slack, never under 0.
    /// @dev Not `view`: the guard verifies the signed spot. `SigmaNotSet`, `OpenPrintMissing` and `NoSpotSource` refuse.
    ///      The slack is what lets a stop-loss on a cheap side clear the house's bid (F-S24-01): 15 % of a 41¢ side is
    ///      6.2¢, inside a widened half spread; it bounds the most a sale can give up per token in money, as the
    ///      tolerance bounds it in share.
    function exitFloorRaw(uint256 grantId, bytes32 marketId, uint8 outcomeIdx, bytes calldata spotProof) public returns (uint256) {
        outcomeId(marketId, outcomeIdx);
        (uint256 upE6,) = fairGuard.fairUpE6(marketId, spotProof);
        uint256 fair = (outcomeIdx == 0 ? upE6 : E6 - upE6) * one / E6;
        ExitTerms memory t = _exitTerms[grantId];
        uint256 share = fair * t.toleranceBps / BPS;
        uint256 slack = one * t.slackBps / BPS;
        uint256 under = share > slack ? share : slack;
        return fair > under ? fair - under : 0;
    }

    /// @dev An EXIT grant never holds a budget, whichever function makes it.
    function _beforeGrant(GrantKind kind, uint256 budget) internal view override {
        if (kind == GrantKind.EXIT && budget != 0) revert ExitGrantHasNoBudget(budget);
    }

    /// @dev An EXIT actor sells only through `exitFor`, at the floor.
    function _beforePlaceFor(Grant storage g, uint256 grantId) internal view override {
        if (g.kind == GrantKind.EXIT) revert ExitGrantSellsOnly(grantId);
    }
}
