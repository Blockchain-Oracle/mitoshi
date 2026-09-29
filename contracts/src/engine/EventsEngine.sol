// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuardTransient} from "@openzeppelin/contracts/utils/ReentrancyGuardTransient.sol";
import {StdPrecompiles} from "tempo-std/StdPrecompiles.sol";
import {EngineStorage} from "./EngineStorage.sol";
import {IEngineErrors} from "./EngineErrors.sol";
import {IEventsEngineEvents} from "./interfaces/IEventsEngineEvents.sol";
import {MatchLib} from "./libs/MatchLib.sol";
import {AdminLib} from "./libs/AdminLib.sol";
import {BookLib} from "./libs/BookLib.sol";
import {Grid} from "./libs/Grid.sol";
import "./EngineTypes.sol";

// Ported from Agari 03b30abbbfe7ddc3cac4927c7c573e52f74d2d49:anchor/programs/agari-events/src/instructions/
// {user_place_order.rs,user_sets.rs,venue_io.rs} and matching/sets.rs (the Solana account plumbing is gone: one engine
// balance of the collateral, one ERC-7201 layout, roles instead of GlobalConfig).

/// @title The market engine (App. A): owns storage, roles, mode, the transient guard, every token movement, complete
///        sets and credit withdrawal; delegates matching, admin and resolution to external libraries.
/// @dev Every write pays `msg.sender` only (AD-5). Accounting never reads `balanceOf`: `totalOwed = Σ pulled − Σ paid`
///      is the donation-safe ledger (`sweepSurplus` sends the difference to the immutable treasury). Every payout
///      pre-checks the receiver's TIP-1028 receive policy (P12): a TIP-20 transfer to a blocking receiver would
///      *succeed* into the ReceivePolicyGuard, so the engine refuses instead (`ReceivePolicyBlocked`).
contract EventsEngine is IEngineErrors, IEventsEngineEvents, ReentrancyGuardTransient {
    using SafeERC20 for IERC20;

    IERC20 private immutable _collateral;
    address private immutable _treasury;
    uint8 internal immutable _decimals;

    modifier onlyAdmin() {
        if (msg.sender != EngineStorage.layout().admin) revert NotAdmin();
        _;
    }

    /// @param collateral_ the TIP-20 every market settles in (pathUSD); immutable (E-06).
    /// @param admin_ constructor-bound admin (E-20); transferable in two steps.
    /// @param treasury_ receives donations only (`sweepSurplus`).
    constructor(address collateral_, address admin_, address treasury_) {
        if (collateral_ == address(0) || admin_ == address(0) || treasury_ == address(0)) revert InvalidOrderArgs();
        _collateral = IERC20(collateral_);
        _treasury = treasury_;
        _decimals = IERC20Metadata(collateral_).decimals();
        EngineStorage.layout().admin = admin_;
        emit AdminTransferred(address(0), admin_);
    }

    // ------------------------------------------------------------------------------------------------ trading

    function placeOrder(PlaceArgs calldata a) external nonReentrant returns (PlaceResult memory r) {
        r = MatchLib.placeOrder(a);
        _pull(msg.sender, r.transferredIn);
        _pay(msg.sender, r.withdrawn);
    }

    function cancelOrders(bytes32 m, uint128[] calldata ids, bool withdraw)
        external
        nonReentrant
        returns (uint256 removed, uint64 withdrawn)
    {
        (removed, withdrawn) = MatchLib.cancelOrders(m, ids, withdraw);
        _pay(msg.sender, withdrawn);
    }

    function reduceOrder(bytes32 m, uint128 id, uint64 newLots) external nonReentrant {
        MatchLib.reduceOrder(m, id, newLots);
    }

    function cancelAll(bytes32 m, uint8 max, bool withdraw) external nonReentrant returns (uint256 removed, uint64 withdrawn) {
        (removed, withdrawn) = MatchLib.cancelAll(m, max, withdraw);
        _pay(msg.sender, withdrawn);
    }

    function sweepExpired(bytes32 m, uint8 max) external nonReentrant returns (uint256 removed) {
        removed = MatchLib.sweepExpired(m, max);
    }

    // ------------------------------------------------------------------------------------------------ sets and cash

    /// @notice Mints `lots` complete sets (E-39): Normal mode, Trading only; pays `lots·1000·cu`, credit-first when
    ///         asked; YES and NO land in the caller's free balances and `backingLots` grows.
    function mintSet(bytes32 m, uint64 lots, bool useCredit) external nonReentrant returns (uint64 transferredIn) {
        EngineStorage.Layout storage l = EngineStorage.layout();
        if (l.cfg.mode != MODE_NORMAL) revert InvalidMode();
        (Market storage mk, Position storage pos, uint64 cu) = _trading(l, m);
        if (lots == 0) revert InvalidQuantity();
        uint64 cash = Grid.pairCash(lots, cu);
        mk.backingLots += lots;
        pos.yesFree += lots;
        pos.noFree += lots;
        uint64 creditUsed;
        if (useCredit) {
            uint64 credit = pos.credit;
            creditUsed = credit < cash ? credit : cash;
            if (creditUsed != 0) pos.credit = credit - creditUsed;
        }
        transferredIn = cash - creditUsed;
        emit CompleteSet(m, ++mk.eventSeq, msg.sender, true, lots, cash, creditUsed, transferredIn, 0, mk.backingLots);
        _pull(msg.sender, transferredIn);
    }

    /// @notice Merges `lots` YES + NO back into `lots·1000·cu` of credit (E-40): Trading only, any mode; the credit is
    ///         optionally withdrawn in the same call.
    function mergeSet(bytes32 m, uint64 lots, bool withdraw) external nonReentrant returns (uint64 cash, uint64 withdrawn) {
        EngineStorage.Layout storage l = EngineStorage.layout();
        (Market storage mk, Position storage pos, uint64 cu) = _trading(l, m);
        if (lots == 0) revert InvalidQuantity();
        if (pos.yesFree < lots || pos.noFree < lots) revert InsufficientOutcome();
        cash = Grid.pairCash(lots, cu);
        pos.yesFree -= lots;
        pos.noFree -= lots;
        uint64 credit = pos.credit + cash;
        if (withdraw) (withdrawn, credit) = (credit, 0);
        pos.credit = credit;
        mk.backingLots -= lots;
        emit CompleteSet(m, ++mk.eventSeq, msg.sender, false, lots, cash, 0, 0, withdrawn, mk.backingLots);
        _pay(msg.sender, withdrawn);
    }

    /// @notice Withdraws `0 < amount ≤ credit` to `msg.sender` (E-41; AD-5: no destination). Every status and mode.
    function withdrawCredit(bytes32 m, uint64 amount) external nonReentrant {
        EngineStorage.Layout storage l = EngineStorage.layout();
        Market storage mk = l.markets[m];
        uint32 mIdx = mk.mIdx;
        if (mIdx == 0) revert UnknownMarket();
        Position storage pos = l.positions[mIdx][msg.sender];
        uint64 credit = pos.credit;
        if (amount == 0 || amount > credit) revert InsufficientCredit();
        pos.credit = credit - amount;
        emit CreditWithdrawn(m, ++mk.eventSeq, msg.sender, amount);
        _pay(msg.sender, amount);
    }

    // ------------------------------------------------------------------------------------------------ roller and admin

    /// @notice Lists a Window (E-26). Roller only; Normal mode only.
    function openWindow(OpenWindowArgs calldata a) external nonReentrant returns (bytes32 marketId) {
        if (!EngineStorage.layout().isRoller[msg.sender]) revert NotRoller();
        marketId = AdminLib.openWindow(a);
    }

    /// @notice Registers a Series (E-23). Admin only.
    function registerSeries(RegisterSeriesArgs calldata a) external onlyAdmin returns (bytes32 seriesId) {
        seriesId = AdminLib.registerSeries(a, _decimals);
    }

    /// @notice Appends an immutable policy version (E-25). Admin only.
    function addPolicyVersion(bytes32 seriesId, uint8 index, PolicyVersion calldata v) external onlyAdmin {
        AdminLib.addPolicyVersion(seriesId, index, v);
    }

    // ------------------------------------------------------------------------------------------------ roles and mode

    function setMode(uint8 mode) external onlyAdmin {
        if (mode > MODE_HALTED) revert InvalidMode();
        EngineStorage.layout().cfg.mode = mode;
        emit ModeSet(mode);
    }

    function setRoller(address roller, bool enabled) external onlyAdmin {
        EngineStorage.layout().isRoller[roller] = enabled;
        emit RollerSet(roller, enabled);
    }

    function transferAdmin(address next) external onlyAdmin {
        EngineStorage.layout().pendingAdmin = next;
        emit AdminTransferStarted(msg.sender, next);
    }

    function acceptAdmin() external {
        EngineStorage.Layout storage l = EngineStorage.layout();
        address pending = l.pendingAdmin;
        if (msg.sender != pending || pending == address(0)) revert NotAdmin();
        emit AdminTransferred(l.admin, pending);
        l.admin = pending;
        l.pendingAdmin = address(0);
    }

    /// @notice Refuse (or allow again) third-party `redeemFor` of the caller's positions (T09, D-015).
    function setCrankOptOut(bool on) external {
        EngineStorage.layout().crankOptOut[msg.sender] = on;
        emit CrankOptOutSet(msg.sender, on);
    }

    // ------------------------------------------------------------------------------------------------ pool, surplus, reads

    /// @notice Permissionless: pre-grows the node pool by `n` freed nodes (A.1.3); the caller pays their new slots once.
    function reserveNodes(uint32 n) external nonReentrant {
        if (n == 0) revert InvalidQuantity();
        uint32 highWater = BookLib.reserve(EngineStorage.layout(), n);
        emit NodesReserved(n, highWater);
    }

    /// @notice Sends donations (`balanceOf(engine) − totalOwed`) to the immutable treasury. Asserts solvency first.
    function sweepSurplus() external nonReentrant returns (uint256 amount) {
        uint256 bal = _collateral.balanceOf(address(this));
        uint256 owed = EngineStorage.layout().cfg.totalOwed;
        if (bal < owed) revert MathOverflow(); // unreachable while the ledger is exact; defence in depth (E-63)
        amount = bal - owed;
        if (amount == 0) return 0;
        _checkReceivePolicy(_treasury);
        emit SurplusSwept(_treasury, amount);
        _collateral.safeTransfer(_treasury, amount);
    }

    function extsload(bytes32 slot) external view returns (bytes32 value) {
        assembly ("memory-safe") {
            value := sload(slot)
        }
    }

    function extsload(bytes32[] calldata slots) external view returns (bytes32[] memory values) {
        values = new bytes32[](slots.length);
        for (uint256 i; i < slots.length; ++i) {
            bytes32 slot = slots[i];
            bytes32 v;
            assembly ("memory-safe") {
                v := sload(slot)
            }
            values[i] = v;
        }
    }

    function collateral() external view returns (address) {
        return address(_collateral);
    }

    function treasury() external view returns (address) {
        return _treasury;
    }

    // ------------------------------------------------------------------------------------------------ token moves

    /// @dev Pulls `amt` from `from` (the caller); pulls and payouts are never netted (E-33).
    function _pull(address from, uint64 amt) internal {
        if (amt == 0) return;
        EngineStorage.layout().cfg.totalOwed += amt;
        _collateral.safeTransferFrom(from, address(this), amt);
    }

    /// @dev Pays `amt` to `to` on the caller's own call: a receive policy that would divert it refuses the call.
    function _pay(address to, uint64 amt) internal {
        if (amt == 0) return;
        _checkReceivePolicy(to);
        EngineStorage.layout().cfg.totalOwed -= amt;
        _collateral.safeTransfer(to, amt);
    }

    /// @dev `redeemFor`'s payout: pays when it can, else returns false and moves nothing (the caller holds the amount
    ///      as the holder's credit): a blocking receive policy (pre-checked) or a reverting transfer (a TIP-403 token
    ///      policy that blacklists the holder).
    function _payOrHold(address to, uint64 amt) internal returns (bool paid) {
        if (amt == 0) return true;
        (bool ok,) = StdPrecompiles.TIP403_REGISTRY.validateReceivePolicy(address(_collateral), address(this), to);
        if (!ok) return false;
        EngineStorage.Layout storage l = EngineStorage.layout();
        l.cfg.totalOwed -= amt;
        try _collateral.transfer(to, amt) returns (bool sent) {
            if (sent) return true;
        } catch {}
        l.cfg.totalOwed += amt;
        return false;
    }

    function _checkReceivePolicy(address to) internal view {
        (bool ok,) = StdPrecompiles.TIP403_REGISTRY.validateReceivePolicy(address(_collateral), address(this), to);
        if (!ok) revert ReceivePolicyBlocked();
    }

    /// @dev The market, the caller's position and the cash unit, for Trading-only calls (sets).
    function _trading(EngineStorage.Layout storage l, bytes32 m)
        internal
        view
        returns (Market storage mk, Position storage pos, uint64 cu)
    {
        mk = l.markets[m];
        uint32 mIdx = mk.mIdx;
        if (mIdx == 0) revert UnknownMarket();
        uint40 nowTs = uint40(block.timestamp);
        if (mk.state != STATE_OPEN || nowTs < mk.tradingStart || nowTs >= mk.lockAt) revert MarketNotTrading();
        pos = l.positions[mIdx][msg.sender];
        cu = l.series[mk.seriesIdx].cashUnit;
    }
}
