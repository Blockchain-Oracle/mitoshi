// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

// Ported from Masayume 68f7a09:contracts/src/private/PrivateDesk.sol
// Seam edits (docs/specs/engine.md A.4.4) and Agari's D-117 (03b30abbbfe7ddc3cac4927c7c573e52f74d2d49:
// anchor/programs/agari-private): a slot's mint is a measured engine IOC and its settlement a measured partial redeem of
// exactly its lots (the desk's engine position pools every slot's contracts); `creditFromPool` requires the owner to
// hold a budget (`hasBudget`, set by a first deposit — the desk can credit nobody who never deposited); the three
// counters `owed + pool + inSlots` equal the wallet after every call; P12 on `withdraw` (`ReceivePolicyBlocked`, the
// owner's own call); `sweep(marketId)` books a collected engine credit (never arises for an IOC taker) into the pool.

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IEventsEngine} from "../../engine/interfaces/IEventsEngine.sol";
import {IEngineLens, MarketRef} from "../../engine/interfaces/IEngineLens.sol";
import {EngineSeam} from "../shared/EngineSeam.sol";
import {PayoutCheck} from "../shared/Payouts.sol";
import {PrivateGateway} from "./PrivateGateway.sol";

/// @title PrivateDesk — link-private bets on engine Windows: a budget only its owner can withdraw, a
///        throwaway slot per bet, and a pool in between that neither half names.
/// @notice Ported from Yosuku's `private_budget` module and its executor (`services/private-bet-executor`,
///         context/14 §7). An owner deposits and sets an allowance the desk may spend. A bet is then three
///         transactions from the desk key, never fewer: `chargeToPool` names the owner and an opaque key;
///         `fundSlot` names the slot; `mintInSlot` names the slot and the market. Settlement is permissionless.
///         The way home is the same split in reverse: `sweepSlotToPool` names the slot, `creditFromPool`
///         names the owner and another opaque key. Only the owner's own `withdraw` ever pays out, and only to
///         `msg.sender`. The desk moves an allowance into a bet and a payout back to a balance; a compromised desk
///         key could credit an address of its choosing, so the allowance an owner sets is the blast radius, and the
///         pool it could raid holds only what was just charged or just won.
/// @dev What this is NOT: anonymity. `Charged` and `SlotFunded` land seconds apart for the same figure, and a
///      determined observer can line them up; the desk process sees both halves while it works. The claim of
///      ownership is the desk's signed ticket, held by the owner alone — the chain keeps no owner on any slot.
///      Storage and events carry market ids only (AD-10).
contract PrivateDesk is PrivateGateway, ReentrancyGuard {
    using SafeERC20 for IERC20;

    /// @dev Money nobody has claimed yet: charged and not yet in a slot, or swept and not yet credited.
    uint256 public pool;
    /// @dev Σ owner balances and Σ slot balances — the wallet equals `owed + pool + inSlots` after every call.
    uint256 public owed;
    uint256 public inSlots;

    mapping(address owner => uint256) public balanceOf;
    mapping(address owner => uint256) public allowanceOf;
    /// @dev D-117: an owner the desk may credit — set by the first deposit, never cleared.
    mapping(address owner => bool) public hasBudget;
    /// @dev One charge per key, so a desk that resumes after a crash can see what already landed without a record.
    mapping(address owner => mapping(bytes32 chargeKey => uint256)) public chargedOf;
    mapping(address owner => mapping(bytes32 creditKey => uint256)) public creditedOf;
    mapping(bytes32 slotId => Slot) private _slots;

    constructor(IERC20 collateral_, IEventsEngine engine_, IEngineLens lens_, address desk_, Params memory params_)
        PrivateGateway(collateral_, engine_, lens_, desk_, params_)
    {}

    // ------------------------------------------------------------------ the owner

    /// @notice Money for private bets. Withdrawable by the depositor alone; the desk spends it only inside the allowance.
    function deposit(uint256 amount) external nonReentrant {
        _deposit(msg.sender, amount);
    }

    /// @notice What the desk may still spend of the balance. Zero refuses every private bet.
    function allow(uint256 allowance) external {
        _allow(msg.sender, allowance);
    }

    /// @notice Top up and authorise in one transaction, so no state exists where the money is in but the desk
    ///         cannot touch it (the reference's `buildFundPrivateBudgetTx`). A zero deposit is a plain re-allow.
    function depositAndAllow(uint256 amount, uint256 allowance) external nonReentrant {
        if (amount != 0) _deposit(msg.sender, amount);
        _allow(msg.sender, allowance);
    }

    /// @notice Cancel the desk's permission outright, leaving the balance untouched.
    function revoke() external {
        _allow(msg.sender, 0);
    }

    /// @notice Take it back. Pays the caller and nobody else (P12 pre-checked); needs no cooperation from the desk.
    function withdraw(uint256 amount) external nonReentrant {
        if (amount == 0) revert ZeroAmount();
        uint256 have = balanceOf[msg.sender];
        if (have < amount) revert Insufficient(amount, have);
        balanceOf[msg.sender] = have - amount;
        owed -= amount;
        PayoutCheck.payChecked(collateral, msg.sender, amount);
        emit Withdrawn(msg.sender, amount, have - amount);
    }

    // ------------------------------------------------------------------ the desk: opening

    /// @notice OWNER SIDE. Debits the bettor into the pool's float. Names them, and nothing else.
    /// @dev `chargeKey` is opaque to the chain and single-use: the desk derives it from a secret it shares with
    ///      the owner, so a resumed open can tell a landed charge from a lost one without keeping a record.
    function chargeToPool(address owner, uint256 amount, bytes32 chargeKey) external onlyDesk nonReentrant {
        if (paused) revert IsPaused();
        if (amount == 0) revert ZeroAmount();
        Params memory p = params;
        // The band is checked here too, so a stake the mint would refuse never costs the desk three sends.
        if (amount < p.minStake || amount > p.maxStake) revert StakeOutsideBand(amount, p.minStake, p.maxStake);
        if (chargedOf[owner][chargeKey] != 0) revert KeyUsed(chargeKey);
        uint256 have = balanceOf[owner];
        if (have < amount) revert Insufficient(amount, have);
        uint256 allowance = allowanceOf[owner];
        if (allowance < amount) revert OverAllowance(amount, allowance);
        balanceOf[owner] = have - amount;
        allowanceOf[owner] = allowance - amount;
        owed -= amount;
        pool += amount;
        chargedOf[owner][chargeKey] = amount;
        emit Charged(owner, chargeKey, amount);
    }

    /// @notice SLOT SIDE. Float into this bet's slot. Carries no owner.
    function fundSlot(bytes32 slotId, uint256 amount) external onlyDesk nonReentrant {
        if (amount == 0) revert ZeroAmount();
        Slot storage s = _slots[slotId];
        if (s.fundedAtSec != 0) revert SlotAlreadyFunded(slotId);
        if (pool < amount) revert PoolShort(amount, pool);
        pool -= amount;
        inSlots += amount;
        s.balance = amount;
        s.fundedAtSec = uint64(block.timestamp);
        emit SlotFunded(slotId, amount);
    }

    /// @notice SLOT SIDE. Buys the side off the live book with what the slot holds: sized at execution to the
    ///         stake, never charged more than it, the dust left in the slot. `minQuantityRaw` is the guard against
    ///         a book that moved since the quote. No owner argument exists on this call.
    function mintInSlot(bytes32 slotId, bytes32 marketId, uint8 outcomeIdx, uint256 minQuantityRaw)
        external
        onlyDesk
        nonReentrant
        returns (uint256 quantityRaw, uint256 costRaw)
    {
        if (paused) revert IsPaused();
        Slot storage s = _slots[slotId];
        if (s.fundedAtSec == 0) revert SlotNotFunded(slotId);
        if (s.mintedAtSec != 0) revert SlotAlreadyMinted(slotId);
        uint256 stake = s.balance;
        MarketRef memory ref = _resolve(marketId);
        Preview memory q = _sizeEntry(marketId, ref, outcomeIdx, stake);
        if (q.quantityRaw < minQuantityRaw) revert BelowMinQuantity(q.quantityRaw, minQuantityRaw);

        (costRaw, quantityRaw) = _buyIoc(marketId, ref, outcomeIdx, q.limitYesRaw, q.quantityRaw);
        if (quantityRaw == 0 || quantityRaw < minQuantityRaw) revert BelowMinQuantity(quantityRaw, minQuantityRaw);
        // A fill can only cost the walk's price or less; a venue fee on top would land here and is refused.
        if (costRaw > stake) revert StakeAboveMax(costRaw, stake);
        s.balance = stake - costRaw;
        inSlots -= costRaw;
        s.marketId = marketId;
        s.outcomeIdx = outcomeIdx;
        s.quantityRaw = quantityRaw;
        s.costRaw = costRaw;
        s.expirySec = ref.expiry;
        s.mintedAtSec = uint64(block.timestamp);
        emit SlotMinted(slotId, marketId, outcomeIdx, quantityRaw, costRaw);
    }

    // ------------------------------------------------------------------ settlement and the way home

    /// @notice Redeems a slot whose Window the engine has resolved or voided, into the slot. Permissionless:
    ///         the proceeds stay in the slot whoever cranks it (FR-31).
    function settleSlot(bytes32 slotId) external nonReentrant returns (uint256 payout) {
        Slot storage s = _slots[slotId];
        if (s.quantityRaw == 0) revert NothingToSettle(slotId);
        MarketRef memory ref = _resolve(s.marketId);
        if (!lens.isResolved(s.marketId) && !lens.isVoided(s.marketId)) revert MarketNotSettled(s.marketId);
        uint256 quantity = s.quantityRaw;
        s.quantityRaw = 0;
        payout = EngineSeam.redeemPartialMeasured(engine, lens, collateral, s.marketId, s.outcomeIdx, EngineSeam.toLots(quantity, ref.lotBase));
        s.payout = payout;
        s.balance += payout;
        inSlots += payout;
        s.settledAtSec = uint64(block.timestamp);
        emit SlotSettled(slotId, s.marketId, payout, msg.sender);
    }

    /// @notice SLOT SIDE. Whatever cash a slot holds — an unminted stake, the dust, a payout — back into the
    ///         pool. Refused while the slot still holds contracts: settle first.
    function sweepSlotToPool(bytes32 slotId) external onlyDesk nonReentrant returns (uint256 amount) {
        Slot storage s = _slots[slotId];
        if (s.quantityRaw != 0) revert SlotHoldsContracts(slotId, s.quantityRaw);
        amount = s.balance;
        if (amount == 0) revert SlotEmpty(slotId);
        s.balance = 0;
        s.swept += amount;
        inSlots -= amount;
        pool += amount;
        emit SlotSwept(slotId, amount);
    }

    /// @notice OWNER SIDE. Pool float into an owner's balance, ready for the next private bet or a withdrawal.
    ///         Names the owner and an opaque key, never a slot. Bounded by what the pool actually holds, and one
    ///         credit per key: two desk processes racing on one claim cannot pay it twice.
    function creditFromPool(address owner, uint256 amount, bytes32 creditKey) external onlyDesk nonReentrant {
        if (amount == 0) revert ZeroAmount();
        if (!hasBudget[owner]) revert NoBudget(owner);
        if (creditedOf[owner][creditKey] != 0) revert KeyUsed(creditKey);
        if (pool < amount) revert PoolShort(amount, pool);
        pool -= amount;
        owed += amount;
        balanceOf[owner] += amount;
        creditedOf[owner][creditKey] = amount;
        emit Credited(owner, creditKey, amount);
    }

    /// @notice Moves the desk's own engine credit on a Window into its wallet, booked into the pool (unclaimed float).
    ///         Anyone may call; the credit is the desk's either way (an IOC taker never accrues one on the real engine).
    function sweep(bytes32 marketId) external nonReentrant returns (uint256 amount) {
        amount = EngineSeam.collectCreditMeasured(engine, lens, collateral, marketId);
        if (amount != 0) {
            pool += amount;
            emit Swept(amount);
        }
    }

    // ------------------------------------------------------------------ views

    function budgetOf(address owner) external view returns (uint256 balance, uint256 allowance) {
        return (balanceOf[owner], allowanceOf[owner]);
    }

    function slotOf(bytes32 slotId) external view returns (Slot memory) {
        return _slots[slotId];
    }

    /// @notice What the desk owes everyone: balances, the pool's float and every slot's cash. Equals the wallet.
    function totalOwed() external view returns (uint256) {
        return owed + pool + inSlots;
    }

    // ------------------------------------------------------------------ internals

    function _deposit(address owner, uint256 amount) internal {
        if (amount == 0) revert ZeroAmount();
        collateral.safeTransferFrom(owner, address(this), amount);
        hasBudget[owner] = true;
        balanceOf[owner] += amount;
        owed += amount;
        emit Deposited(owner, amount, balanceOf[owner]);
    }

    function _allow(address owner, uint256 allowance) internal {
        allowanceOf[owner] = allowance;
        emit Allowed(owner, allowance);
    }
}
