// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

// Ported from Masayume 68f7a09:contracts/src/vault/EventVault.sol — as-is (D-003) except (docs/specs/engine.md A.4.1):
// the ERC-2771 forwarder is removed (`ERC2771Context`, its overrides, `_directSender`, `NoDepositViaForwarder`;
// `msg.sender` everywhere — our fee relay sponsors without changing the sender); the engine seam (VenueGateway);
// D-062 (a side sold to zero frees its grant's `openPositions`; `crankSettle` releases a lingering tag instead of
// reverting); D-091 (`Caps.market`, `OutsideGrantMarket`); P12 on `withdraw`/`withdrawPrivate`.

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IEventsEngine} from "../../engine/interfaces/IEventsEngine.sol";
import {IEngineLens} from "../../engine/interfaces/IEngineLens.sol";
import {PayoutCheck} from "../shared/Payouts.sol";
import {VaultTally} from "./VaultTally.sol";
import {VenueGateway} from "./VenueGateway.sol";

/// @title EventVault — the Trading Balance and its only delegation framework.
/// @notice Deposit once; trade from the balance yourself, or let a bounded actor trade for you.
///         Money leaves only through `withdraw` / `withdrawPrivate`, and only to the owner (`msg.sender`):
///         no function takes a payout destination. A delegate can, at worst, open in-cap
///         positions that belong to the owner (AD-5, the no-divert rule).
/// @dev Ported from Yosuku's `trading_vault.move` buckets (available / private / agent budget)
///      and extended with typed grants. Sponsored actions arrive through the fee relay (the sender is
///      unchanged); capital intake is never sponsored (the relay's `never` list).
contract EventVault is VenueGateway, VaultTally, ReentrancyGuard {
    using SafeERC20 for IERC20;

    /// @dev `grantId` written on an owner's own action.
    uint256 internal constant ATTENDED = 0;

    mapping(address owner => Account) private _accounts;
    /// @dev `grantId` is the 1-based index; 0 means "none".
    Grant[] private _grants;
    mapping(address owner => mapping(GrantKind kind => uint256 grantId)) public activeGrantOf;
    /// @dev Outcome raw units the vault holds for an owner, by `outcomeId(marketId, idx)`.
    mapping(address owner => mapping(uint256 outcomeId => uint256 amount)) public positionOf;
    /// @dev The grant that opened a position, so its `openPositions` count closes with it.
    mapping(address owner => mapping(uint256 outcomeId => uint256 grantId)) public positionGrantOf;

    constructor(IERC20 collateral_, IEventsEngine engine_, IEngineLens lens_) VenueGateway(collateral_, engine_, lens_) {}

    // ------------------------------------------------------------------ funding

    function deposit(uint256 amount) external nonReentrant {
        _deposit(msg.sender, amount);
    }

    /// @notice Credit another account's Trading Balance from the caller's own tokens.
    function creditFor(address owner, uint256 amount) external nonReentrant {
        if (amount == 0) revert ZeroAmount();
        collateral.safeTransferFrom(msg.sender, address(this), amount);
        Account storage a = _accounts[owner];
        a.available += amount;
        emit Credited(owner, msg.sender, amount, a.available);
    }

    function creditPrivateFor(address owner, uint256 amount) external nonReentrant {
        if (amount == 0) revert ZeroAmount();
        collateral.safeTransferFrom(msg.sender, address(this), amount);
        Account storage a = _accounts[owner];
        a.privateAvailable += amount;
        emit PrivateCredited(owner, msg.sender, amount, a.privateAvailable);
    }

    /// @notice Pays the caller from their free balance; refuses while their receive policy would divert it (P12).
    function withdraw(uint256 amount) external nonReentrant {
        address owner = msg.sender;
        Account storage a = _accounts[owner];
        _take(a.available, amount);
        a.available -= amount;
        a.totalWithdrawn += amount;
        PayoutCheck.payChecked(collateral, owner, amount);
        emit Withdrawn(owner, amount, a.available);
    }

    function moveToPrivate(uint256 amount) external nonReentrant {
        address owner = msg.sender;
        Account storage a = _accounts[owner];
        _take(a.available, amount);
        a.available -= amount;
        a.privateAvailable += amount;
        emit PrivateMoved(owner, amount, a.privateAvailable);
    }

    function withdrawPrivate(uint256 amount) external nonReentrant {
        address owner = msg.sender;
        Account storage a = _accounts[owner];
        _take(a.privateAvailable, amount);
        a.privateAvailable -= amount;
        a.totalWithdrawn += amount;
        PayoutCheck.payChecked(collateral, owner, amount);
        emit PrivateWithdrawn(owner, amount, a.privateAvailable);
    }

    // ------------------------------------------------------------------ grants

    function grant(GrantKind kind, address actor, Caps calldata caps, uint64 expiresAtSec, uint256 budget)
        external
        nonReentrant
        returns (uint256 grantId)
    {
        return _grant(msg.sender, kind, actor, caps, expiresAtSec, budget);
    }

    /// @notice Deposit and delegate in one transaction, so a grant never exists without its budget.
    function depositAndGrant(uint256 amount, GrantKind kind, address actor, Caps calldata caps, uint64 expiresAtSec, uint256 budget)
        external
        nonReentrant
        returns (uint256 grantId)
    {
        _deposit(msg.sender, amount);
        return _grant(msg.sender, kind, actor, caps, expiresAtSec, budget);
    }

    function fundGrant(uint256 grantId, uint256 amount) external nonReentrant {
        address owner = msg.sender;
        Grant storage g = _ownedGrant(grantId, owner);
        _requireLive(g, grantId);
        Account storage a = _accounts[owner];
        _take(a.available, amount);
        a.available -= amount;
        g.budget += amount;
        emit GrantFunded(grantId, amount, g.budget);
    }

    /// @notice Ends a grant and returns its unspent budget. Positions it opened stay the owner's.
    function revoke(uint256 grantId) external nonReentrant {
        _ownedGrant(grantId, msg.sender);
        _revoke(msg.sender, grantId);
    }

    // ------------------------------------------------------------------ trading

    /// @notice The owner trades from their own Trading Balance.
    function place(bytes32 marketId, uint8 outcomeIdx, bool isBuy, uint256 priceRaw, uint256 quantityRaw, uint64 expireNs)
        external
        nonReentrant
        returns (uint256 cashDelta, uint256 tokenDelta)
    {
        address owner = msg.sender;
        MarketRef memory ref = _resolve(marketId);
        uint256 id = outcomeId(marketId, outcomeIdx);
        Account storage a = _accounts[owner];
        if (isBuy) _requireEscrow(a.available, outcomeIdx, priceRaw, quantityRaw);
        else _take(positionOf[owner][id], quantityRaw);

        (cashDelta, tokenDelta) = _placeIoc(ref, outcomeIdx, isBuy, priceRaw, quantityRaw, expireNs, ATTENDED);
        if (isBuy) {
            a.available = _debit(a.available, cashDelta);
            _book(owner, id, tokenDelta, ATTENDED);
        } else {
            _bookSale(owner, id, cashDelta, tokenDelta);
        }
        _recordFill(owner, marketId, outcomeIdx, isBuy, cashDelta, tokenDelta);
        emit Executed(owner, marketId, ATTENDED, outcomeIdx, isBuy, cashDelta, tokenDelta, owner, uint64(block.timestamp));
    }

    /// @notice A grant's actor trades for the owner, inside the grant's caps, from its budget.
    ///         Sale proceeds go to the owner's balance, never back to the actor's budget.
    function placeFor(uint256 grantId, bytes32 marketId, uint8 outcomeIdx, bool isBuy, uint256 priceRaw, uint256 quantityRaw, uint64 expireNs)
        external
        nonReentrant
        returns (uint256 cashDelta, uint256 tokenDelta)
    {
        address actor = msg.sender;
        Grant storage g = _grantOf(grantId);
        if (g.actor != actor) revert NotGrantActor(grantId, actor);
        _requireLive(g, grantId);
        bytes32 scope = g.caps.market;
        if (scope != bytes32(0) && scope != marketId) revert OutsideGrantMarket(grantId, marketId);
        address owner = g.owner;
        MarketRef memory ref = _resolve(marketId);
        uint256 id = outcomeId(marketId, outcomeIdx);
        if (isBuy) {
            _requirePrice(g, outcomeIdx, priceRaw);
            _requireEscrow(g.budget, outcomeIdx, priceRaw, quantityRaw);
        } else {
            _take(positionOf[owner][id], quantityRaw);
        }

        (cashDelta, tokenDelta) = _placeIoc(ref, outcomeIdx, isBuy, priceRaw, quantityRaw, expireNs, grantId);
        if (isBuy) _bookDelegatedBuy(g, grantId, owner, id, cashDelta, tokenDelta);
        else _bookSale(owner, id, cashDelta, tokenDelta);
        _recordFill(owner, marketId, outcomeIdx, isBuy, cashDelta, tokenDelta);
        emit Executed(owner, marketId, grantId, outcomeIdx, isBuy, cashDelta, tokenDelta, actor, uint64(block.timestamp));
    }

    // ------------------------------------------------------------------ settlement

    /// @notice Redeems an owner's settled Window into their Trading Balance. Anyone may crank it;
    ///         the credit always lands on the recorded owner (FR-31: liveness is never custody).
    function crankSettle(address owner, bytes32 marketId) external nonReentrant returns (uint256 payout) {
        MarketRef memory ref = _resolve(marketId);
        if (!_isSettled(ref)) revert MarketNotSettled();
        uint256 yesId = outcomeId(marketId, 0);
        uint256 noId = outcomeId(marketId, 1);
        uint256 yes = positionOf[owner][yesId];
        uint256 no = positionOf[owner][noId];
        if (yes == 0 && no == 0) {
            // D-062: nothing to redeem; a tag left on an emptied side is released instead of leaking.
            if (positionGrantOf[owner][yesId] == ATTENDED && positionGrantOf[owner][noId] == ATTENDED) revert NothingToSettle();
        }

        payout += _settleSide(owner, ref, 0, yesId, yes);
        payout += _settleSide(owner, ref, 1, noId, no);
        if (payout != 0) _accounts[owner].available += payout;
        _recordSettlement(owner, marketId, payout);
        emit Settled(owner, marketId, payout, yes, no, msg.sender, uint64(block.timestamp));
    }

    // ------------------------------------------------------------------ views

    function accountOf(address owner) external view returns (Account memory) {
        return _accounts[owner];
    }

    function grantOf(uint256 grantId) external view returns (Grant memory) {
        return _grantOf(grantId);
    }

    function grantCount() external view returns (uint256) {
        return _grants.length;
    }

    function isGrantLive(uint256 grantId) external view returns (bool) {
        if (grantId == 0 || grantId > _grants.length) return false;
        Grant storage g = _grants[grantId - 1];
        return !g.revoked && block.timestamp <= g.expiresAtSec;
    }

    // ------------------------------------------------------------------ internals

    function _deposit(address owner, uint256 amount) internal {
        if (amount == 0) revert ZeroAmount();
        collateral.safeTransferFrom(owner, address(this), amount);
        Account storage a = _accounts[owner];
        a.available += amount;
        a.totalDeposited += amount;
        emit Deposited(owner, amount, a.available);
    }

    function _take(uint256 have, uint256 want) internal pure {
        if (want == 0) revert ZeroAmount();
        if (have < want) revert Insufficient(want, have);
    }

    /// @dev A fill may be smaller than the order (the book moved), so the charge is what filled.
    function _debit(uint256 have, uint256 charge) internal pure returns (uint256) {
        if (have < charge) revert Insufficient(charge, have);
        return have - charge;
    }

    /// @dev The bucket paying for a buy must cover the worst case at its limit up front — the engine
    ///      pulls only the exact cost, but nobody's money is borrowed, even for a block.
    function _requireEscrow(uint256 have, uint8 outcomeIdx, uint256 priceRaw, uint256 quantityRaw) internal view {
        uint256 worst = quantityRaw * _sidePrice(outcomeIdx, priceRaw) / one;
        if (worst == 0) revert ZeroAmount();
        if (have < worst) revert Insufficient(worst, have);
    }

    function _grant(address owner, GrantKind kind, address actor, Caps calldata caps, uint64 expiresAtSec, uint256 budget)
        internal
        returns (uint256 grantId)
    {
        if (actor == address(0)) revert ZeroActor();
        if (expiresAtSec <= block.timestamp) revert BadExpiry(expiresAtSec);
        uint256 previous = activeGrantOf[owner][kind];
        if (previous != 0) _revoke(owner, previous);

        Account storage a = _accounts[owner];
        if (a.available < budget) revert Insufficient(budget, a.available);
        a.available -= budget;
        _grants.push(
            Grant({
                owner: owner,
                actor: actor,
                kind: kind,
                revoked: false,
                expiresAtSec: expiresAtSec,
                spentDay: 0,
                openPositions: 0,
                caps: caps,
                budget: budget,
                spentToday: 0
            })
        );
        grantId = _grants.length;
        activeGrantOf[owner][kind] = grantId;
        emit GrantCreated(grantId, owner, actor, kind, caps, expiresAtSec, budget);
    }

    function _revoke(address owner, uint256 grantId) internal {
        Grant storage g = _grants[grantId - 1];
        if (g.revoked) return;
        g.revoked = true;
        uint256 returned = g.budget;
        g.budget = 0;
        _accounts[owner].available += returned;
        if (activeGrantOf[owner][g.kind] == grantId) activeGrantOf[owner][g.kind] = 0;
        emit GrantRevoked(grantId, owner, returned);
    }

    function _grantOf(uint256 grantId) internal view returns (Grant storage) {
        if (grantId == 0 || grantId > _grants.length) revert NoSuchGrant(grantId);
        return _grants[grantId - 1];
    }

    function _ownedGrant(uint256 grantId, address owner) internal view returns (Grant storage g) {
        g = _grantOf(grantId);
        if (g.owner != owner) revert NotGrantOwner(grantId, owner);
    }

    function _requireLive(Grant storage g, uint256 grantId) internal view {
        if (g.revoked) revert GrantIsRevoked(grantId);
        if (block.timestamp > g.expiresAtSec) revert GrantExpired(grantId, g.expiresAtSec);
    }

    function _requirePrice(Grant storage g, uint8 outcomeIdx, uint256 priceRaw) internal view {
        uint64 cap = g.caps.maxPriceRaw;
        if (cap == 0) return;
        uint256 paid = _sidePrice(outcomeIdx, priceRaw);
        if (paid > cap) revert OverPriceCap(paid, cap);
    }

    /// @dev Charges a delegated buy to the grant: per-trade cap, UTC-day cap, then budget.
    function _spend(Grant storage g, uint256 spent) internal {
        if (spent > g.caps.maxStakePerTrade) revert OverStakeCap(spent, g.caps.maxStakePerTrade);
        uint64 day = uint64(block.timestamp / 1 days);
        uint256 today = g.spentDay == day ? g.spentToday : 0;
        if (today + spent > g.caps.maxDailySpend) revert OverDailyCap(today + spent, g.caps.maxDailySpend);
        g.budget = _debit(g.budget, spent);
        g.spentDay = day;
        g.spentToday = today + spent;
    }

    /// @dev A delegated buy: charge the grant, book the tokens, count a newly opened position against its cap.
    function _bookDelegatedBuy(Grant storage g, uint256 grantId, address owner, uint256 id, uint256 spent, uint256 gained) internal {
        _spend(g, spent);
        if (!_book(owner, id, gained, grantId)) return;
        uint32 open = g.openPositions + 1;
        if (open > g.caps.maxOpenPositions) revert OverPositionCap(open, g.caps.maxOpenPositions);
        g.openPositions = open;
    }

    /// @dev Proceeds of any sale are the owner's, whoever placed it. D-062: a side sold to zero closes
    ///      its grant's open-position count (Masayume kept it, so churn leaked `openPositions`).
    function _bookSale(address owner, uint256 id, uint256 received, uint256 sold) internal {
        uint256 left = positionOf[owner][id] - sold;
        positionOf[owner][id] = left;
        _accounts[owner].available += received;
        if (left == 0) _release(owner, id);
    }

    /// @return opened true when this fill created a position the owner did not have before
    function _book(address owner, uint256 id, uint256 gained, uint256 grantId) internal returns (bool opened) {
        if (gained == 0) return false;
        uint256 before = positionOf[owner][id];
        positionOf[owner][id] = before + gained;
        if (before != 0) return false;
        positionGrantOf[owner][id] = grantId;
        return grantId != ATTENDED;
    }

    /// @dev The position's opening grant stops counting it.
    function _release(address owner, uint256 id) internal {
        uint256 grantId = positionGrantOf[owner][id];
        if (grantId == ATTENDED) return;
        positionGrantOf[owner][id] = ATTENDED;
        Grant storage g = _grants[grantId - 1];
        if (g.openPositions != 0) g.openPositions -= 1;
    }

    function _settleSide(address owner, MarketRef memory ref, uint8 outcomeIdx, uint256 id, uint256 amount)
        internal
        returns (uint256 payout)
    {
        _release(owner, id);
        if (amount == 0) return 0;
        positionOf[owner][id] = 0;
        payout = _redeem(ref, outcomeIdx, amount);
    }
}
