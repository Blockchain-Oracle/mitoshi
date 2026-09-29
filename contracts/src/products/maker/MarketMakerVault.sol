// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

// Ported from Masayume 68f7a09:contracts/src/maker/MarketMakerVault.sol
// Seam edits (docs/specs/engine.md A.4.2): the engine + lens through `MakerGateway`; `quote` books the measured
// escrow and, through `_collectBooked`, every credit the engine hands back (the vault's own expired quotes evicted by
// its cross walk, D-017) as the Window's `escrowBack`; `pull` = `cancelAll` + `_collectBooked`, open to anyone once
// the Window is past `lockAt` (Masayume: `expiry`), and it also books a third-party `sweepExpired`; `merge` is
// Trading-only (the engine's `mergeSet`); `settle` = pull + one full `redeem` (pairs redeem at par after lock);
// trading-time checks (`TooLate`, `BadExpiry`) use `lockAt`, the settlement gate (`unsettledExpired`) uses `expiry`
// (T08); `WindowBook.realized` is booked at settlement; `withdraw` pre-checks the supplier's receive policy (P12,
// refusing like D-112). No inflation guard: value is the internal `liquid`, never `balanceOf`, so a donation moves
// nothing.

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IEventsEngine} from "../../engine/interfaces/IEventsEngine.sol";
import {IEngineLens, MarketRef as LensRef} from "../../engine/interfaces/IEngineLens.sol";
import {STATUS_TRADING} from "../../engine/EngineTypes.sol";
import {PayoutCheck} from "../shared/Payouts.sol";
import {MakerGateway} from "./MakerGateway.sol";

/// @title MarketMakerVault — pooled capital that makes markets on engine Windows, bounded on-chain.
/// @notice The reference's Earn ("be the house") supplied a venue-run vault that took the other side
///         of every bet. The engine has no house: the other side is the order book. So this vault IS
///         the maker. It rests one post-only order on each side of a Window — a YES bid and a YES ask,
///         the ask being a NO buy in the engine's terms — at least the minimum spread apart, so the only
///         thing it can ever buy is a complete set at a discount; it never takes, never sells what it
///         holds and never quotes one side alone. Fills land as outcome lots; pairs are merged back
///         into collateral (the spread), and what is left settles on the engine's resolution. Suppliers
///         hold shares of `liquid + deployed` and may withdraw from `liquid` once every expired Window is
///         settled — so no one can exit ahead of a loss the crank has not yet booked.
/// @dev The maker actor is one key the admin names; every bound it works under is a public param.
///      Pull (after lock), merge and settle are permissionless. Storage and events carry market ids only
///      (AD-10). Nothing takes a payout destination (AD-5): every collateral flow is the vault's own.
contract MarketMakerVault is MakerGateway, ReentrancyGuard {
    using SafeERC20 for IERC20;

    uint256 internal constant BPS = 10_000;

    address public admin;
    address public maker;
    bool public paused;
    Params public params;

    /// @dev Withdrawable supplier capital plus everything the engine has handed back. Never `balanceOf`.
    uint256 public liquid;
    uint256 public supplyShares;
    mapping(address supplier => uint256 shares) public sharesOf;

    mapping(bytes32 marketId => WindowBook) private _books;
    /// @dev Windows quoted and not yet settled; bounded by `maxOpenWindows`, so the valuation loop is too.
    bytes32[] private _open;
    mapping(bytes32 marketId => uint256 indexPlusOne) private _openAt;
    /// @dev Every Window ever quoted, oldest first — the vault's own history, readable without an event scan.
    bytes32[] private _history;

    constructor(IERC20 collateral_, IEventsEngine engine_, IEngineLens lens_, Params memory params_)
        MakerGateway(collateral_, engine_, lens_)
    {
        admin = msg.sender;
        _setParams(params_);
    }

    // ------------------------------------------------------------------ admin

    modifier onlyAdmin() {
        if (msg.sender != admin) revert NotAdmin(msg.sender);
        _;
    }

    /// @notice Tunables only; resting quotes keep the terms they were placed on.
    function setParams(Params calldata next) external onlyAdmin {
        _setParams(next);
    }

    /// @notice The one key that may quote. Zero disarms quoting; pull, merge and settle stay open.
    function setMaker(address next) external onlyAdmin {
        maker = next;
        emit MakerChanged(next);
    }

    /// @notice Pauses new quotes and new supply. Pull, merge, settle and withdrawals never pause.
    function setPaused(bool next) external onlyAdmin {
        paused = next;
        emit PausedSet(next);
    }

    function setAdmin(address next) external onlyAdmin {
        if (next == address(0)) revert ZeroAddress();
        admin = next;
        emit AdminChanged(next);
    }

    function _setParams(Params memory p) internal {
        if (p.maxExposureBps > BPS || p.minPriceRaw == 0 || p.maxPriceRaw <= p.minPriceRaw || p.maxPriceRaw >= one) revert BadParams();
        if (p.minSpreadRaw == 0 || p.minSpreadRaw >= one || p.maxQuantityRaw == 0 || p.maxWindowDeployed == 0) revert BadParams();
        if (p.maxOpenWindows == 0 || p.maxOpenWindows > 64 || p.minTimeLeftSec == 0) revert BadParams();
        params = p;
        emit ParamsUpdated(p);
    }

    // ------------------------------------------------------------------ suppliers

    /// @notice Capital for the vault, as shares of its total value.
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

    /// @notice Redeems shares for their part of the total value, from `liquid` only, to the caller.
    ///         Refused while a Window past its expiry is still unsettled — settle it first (anyone may) —
    ///         and while the caller's receive policy would not let the payment in (P12).
    function withdraw(uint256 shares) external nonReentrant returns (uint256 amount) {
        if (shares == 0) revert ZeroAmount();
        uint256 held = sharesOf[msg.sender];
        if (held < shares) revert InsufficientShares(shares, held);
        bytes32 stale = unsettledExpired();
        if (stale != bytes32(0)) revert UnsettledWindow(stale);
        amount = shares * totalValue() / supplyShares;
        if (liquid < amount) revert InsufficientLiquidity(amount, liquid);
        sharesOf[msg.sender] = held - shares;
        supplyShares -= shares;
        liquid -= amount;
        PayoutCheck.payChecked(collateral, msg.sender, amount);
        emit SupplyRedeemed(msg.sender, amount, shares, liquid);
    }

    // ------------------------------------------------------------------ the maker

    /// @notice Rests a YES bid and a YES ask on a Window, post-only, as one quote — both in the engine's own
    ///         YES terms; the ask is a NO buy at `one − askYes`. The ask must sit `minSpreadRaw` above the
    ///         bid, so a double fill buys a complete set for `one − (askYes − bidYes)` and nothing else is
    ///         possible. The escrow both orders took from the wallet is what the vault books.
    function quote(bytes32 marketId, uint256 bidYesRaw, uint256 askYesRaw, uint256 quantityRaw, uint64 expireNs)
        external
        nonReentrant
        returns (uint256 escrow)
    {
        if (msg.sender != maker) revert NotMaker(msg.sender);
        if (paused) revert IsPaused();
        Params memory p = params;
        if (quantityRaw == 0 || quantityRaw > p.maxQuantityRaw) revert OverQuantity(quantityRaw, p.maxQuantityRaw);
        if (bidYesRaw < p.minPriceRaw || bidYesRaw > p.maxPriceRaw) revert BadPrice(bidYesRaw);
        if (askYesRaw < p.minPriceRaw || askYesRaw > p.maxPriceRaw) revert BadPrice(askYesRaw);
        if (askYesRaw < bidYesRaw + p.minSpreadRaw) revert SpreadTooThin(bidYesRaw, askYesRaw, p.minSpreadRaw);

        MarketRef memory ref = _resolve(marketId);
        if (ref.status != STATUS_TRADING) revert MarketNotTrading(marketId, ref.status);
        if (ref.lockAt < block.timestamp + p.minTimeLeftSec) revert TooLate(marketId, ref.lockAt);
        if (expireNs <= uint64(block.timestamp) * NS || expireNs > uint64(ref.lockAt) * NS) revert BadExpiry(expireNs, ref.lockAt);

        WindowBook storage b = _books[marketId];
        if (b.settled) revert MarketNotTrading(marketId, ref.status);
        if (b.quoteCount == 0) {
            if (_open.length >= p.maxOpenWindows) revert TooManyWindows(uint32(_open.length), p.maxOpenWindows);
            _open.push(marketId);
            _openAt[marketId] = _open.length;
            _history.push(marketId);
            b.openedAtSec = uint64(block.timestamp);
        }

        uint256 expected = (bidYesRaw + (one - askYesRaw)) * quantityRaw / one;
        if (liquid < expected) revert InsufficientLiquidity(expected, liquid);
        (uint256 escrowBid, uint128 bidId) = _rest(ref, BUY_YES, bidYesRaw, quantityRaw, expireNs);
        (uint256 escrowAsk, uint128 askId) = _rest(ref, BUY_NO, askYesRaw, quantityRaw, expireNs);
        escrow = escrowBid + escrowAsk;
        // The cross walk may have evicted this Window's own expired quotes into credit: collected and booked as back.
        _collectBooked(ref);
        if (liquid < escrow) revert InsufficientLiquidity(escrow, liquid);

        b.escrowOut += uint128(escrow);
        b.quoteCount += 1;
        liquid -= escrow;
        uint256 windowDeployed = deployedOf(marketId);
        if (windowDeployed > p.maxWindowDeployed) revert OverWindowCap(marketId, windowDeployed, p.maxWindowDeployed);
        uint256 tv = totalValue();
        uint256 deployed = tv - liquid;
        if (deployed * BPS > tv * p.maxExposureBps) revert OverExposure(deployed, tv, p.maxExposureBps);
        emit Quoted(marketId, bidYesRaw, askYesRaw, quantityRaw, escrow, bidId, askId);
    }

    /// @notice Cancels every quote the vault has resting on a Window and books what came back — including
    ///         anything a third party's `sweepExpired` or a taker's eviction already returned. The maker may
    ///         pull any time; anyone may once the Window is past `lockAt` (its orders are dead weight then).
    function pull(bytes32 marketId) external nonReentrant returns (uint256 orders, uint256 returned) {
        MarketRef memory ref = _resolve(marketId);
        if (msg.sender != maker && block.timestamp < ref.lockAt) revert NotMaker(msg.sender);
        orders = _pullAll(ref);
        returned = _collectBooked(ref);
        emit Pulled(marketId, orders, returned, msg.sender);
    }

    /// @notice Merges every complete set the vault holds on a Window back into collateral — the spread,
    ///         realized. Anyone may call while the Window trades; the collateral only ever lands in the vault.
    ///         After `lockAt` the engine merges nothing: `settle` redeems the pairs at par instead.
    function merge(bytes32 marketId) external nonReentrant returns (uint256 pairs, uint256 returned) {
        MarketRef memory ref = _resolve(marketId);
        if (ref.status != STATUS_TRADING) revert MarketNotTrading(marketId, ref.status);
        (uint256 yes, uint256 no) = _held(ref);
        pairs = yes < no ? yes : no;
        if (pairs == 0) revert NothingToMerge(marketId);
        _collectBooked(ref);
        returned = _merge(ref, pairs);
        _books[marketId].merged += uint128(returned);
        liquid += returned;
        emit Merged(marketId, pairs, returned, msg.sender);
    }

    /// @notice Settles a Window the engine has resolved or voided: pulls any dead quotes, redeems what the
    ///         vault holds on either side in one full redeem, books the Window's realized result and closes
    ///         the book. Permissionless; a second call is a no-op.
    function settle(bytes32 marketId) external nonReentrant returns (uint256 payout) {
        WindowBook storage b = _books[marketId];
        if (b.quoteCount == 0) revert NotQuoted(marketId);
        if (b.settled) return 0;
        MarketRef memory ref = _resolve(marketId);
        if (!_isSettled(ref)) revert MarketNotSettled(marketId);

        _pullAll(ref);
        _collectBooked(ref);
        (uint256 yes, uint256 no) = _held(ref);
        if (yes + no != 0) payout = _redeemAll(ref);

        b.payout += uint128(payout);
        b.settled = true;
        b.settledAtSec = uint64(block.timestamp);
        liquid += payout;
        _removeOpen(marketId);
        int256 realized = int256(uint256(b.escrowBack) + b.merged + b.payout) - int256(uint256(b.escrowOut));
        b.realized = int128(realized);
        emit WindowSettled(marketId, payout, yes, no, realized, msg.sender);
    }

    // ------------------------------------------------------------------ views

    /// @notice Capital the engine still holds for the vault on a Window: resting escrow, credit not yet
    ///         collected, plus the cost of whatever filled and has not been merged or settled. Floored at
    ///         zero, so the value never counts a spread before it is realized.
    function deployedOf(bytes32 marketId) public view returns (uint256) {
        WindowBook storage b = _books[marketId];
        uint256 back = uint256(b.escrowBack) + b.merged + b.payout;
        return b.escrowOut > back ? b.escrowOut - back : 0;
    }

    function totalDeployed() public view returns (uint256 sum) {
        for (uint256 i = 0; i < _open.length; i++) {
            sum += deployedOf(_open[i]);
        }
    }

    function totalValue() public view returns (uint256) {
        return liquid + totalDeployed();
    }

    /// @notice Collateral per share, scaled by `one`; `one` before any supply.
    function sharePriceRaw() external view returns (uint256) {
        return supplyShares == 0 ? one : totalValue() * one / supplyShares;
    }

    function utilizationBps() external view returns (uint256) {
        uint256 tv = totalValue();
        return tv == 0 ? 0 : totalDeployed() * BPS / tv;
    }

    /// @notice The first open Window past its expiry (settlement time), or zero — what blocks a withdrawal until settled.
    function unsettledExpired() public view returns (bytes32) {
        if (_open.length == 0) return bytes32(0);
        LensRef[] memory refs = lens.marketsOf(_open);
        for (uint256 i = 0; i < refs.length; i++) {
            if (refs[i].expiry != 0 && refs[i].expiry <= block.timestamp) return _open[i];
        }
        return bytes32(0);
    }

    function openWindows() external view returns (bytes32[] memory) {
        return _open;
    }

    function bookOf(bytes32 marketId) external view returns (WindowBook memory) {
        return _books[marketId];
    }

    /// @notice What the vault holds on a Window right now, both sides — the inventory its fills left.
    function inventoryOf(bytes32 marketId) external view returns (uint256 yes, uint256 no) {
        return _held(_resolve(marketId));
    }

    function windowCount() external view returns (uint256) {
        return _history.length;
    }

    /// @notice Every Window quoted, oldest first, paged.
    function windowsAt(uint256 offset, uint256 limit) external view returns (bytes32[] memory page) {
        if (offset >= _history.length) return page;
        uint256 end = offset + limit;
        if (end > _history.length) end = _history.length;
        page = new bytes32[](end - offset);
        for (uint256 i = offset; i < end; i++) {
            page[i - offset] = _history[i];
        }
    }

    // ------------------------------------------------------------------ internals

    /// @dev Collects the vault's engine credit on a Window and books it as that Window's escrow back (A.4.2): the
    ///      maker's credit only ever comes from its own escrow — cancels, evictions, anyone's `sweepExpired`.
    function _collectBooked(MarketRef memory ref) internal returns (uint256 amount) {
        amount = _collect(ref);
        if (amount == 0) return 0;
        _books[ref.marketId].escrowBack += uint128(amount);
        liquid += amount;
    }

    function _removeOpen(bytes32 marketId) internal {
        uint256 at = _openAt[marketId];
        if (at == 0) return;
        uint256 last = _open.length - 1;
        if (at - 1 != last) {
            bytes32 moved = _open[last];
            _open[at - 1] = moved;
            _openAt[moved] = at;
        }
        _open.pop();
        delete _openAt[marketId];
    }
}
