// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

// Ported from Masayume 68f7a09:contracts/src/private/IPrivateDesk.sol
// Seam edits (docs/specs/engine.md A.4.4): errors `WrongLens` (the venue pin is structural) and `NoBudget` (Agari
// 03b30abbbfe7ddc3cac4927c7c573e52f74d2d49:anchor/programs/agari-private, D-117: a credit needs an owner who has
// deposited); `TooLate` counts to `lockAt` (T08); `Swept` books a collected engine credit into the pool.

/// @title PrivateDesk's public vocabulary — budgets, slots, keys, events and errors.
/// @notice One interface so the desk service, the adapter, the tests and the contract read the same ABI.
/// @dev The two halves of a private bet meet at a pool that neither half names (Yosuku's `private_budget`,
///      context/14 §7): an OWNER-side call carries the owner and an opaque key; a SLOT-side call carries the
///      slot and the market. Nothing on chain holds an owner and a slot at the same time.
interface IPrivateDesk {
    /// @dev One bet's throwaway account. Funded from the pool, minted on the venue, settled, swept back.
    struct Slot {
        bytes32 marketId;
        uint8 outcomeIdx;
        uint64 fundedAtSec;
        uint64 mintedAtSec;
        uint64 settledAtSec;
        uint64 expirySec;
        /// @dev Contracts the slot holds on the venue, raw; zero once redeemed.
        uint256 quantityRaw;
        /// @dev Cash in the slot: the stake before the mint, the dust after it, the payout after settlement.
        uint256 balance;
        uint256 costRaw;
        uint256 payout;
        /// @dev Cumulative: what left the slot for the pool.
        uint256 swept;
    }

    struct Params {
        /// @dev Stake band per slot, in collateral base units — the desk's beta cap made public.
        uint256 minStake;
        uint256 maxStake;
        /// @dev No mints inside the last seconds of a Window: the three-transaction open needs room to land.
        uint32 minTimeLeftSec;
    }

    /// @dev What a book walk decides before any money moves — the contract's own quote for a stake.
    struct Preview {
        uint256 quantityRaw;
        uint256 costRaw;
        /// @dev The worst level the walk touched, in the venue's YES terms — the IOC's limit.
        uint256 limitYesRaw;
        /// @dev Cost-weighted price per whole contract, in the bought side's own terms.
        uint256 priceRaw;
    }

    // owner side — names the owner, never a slot
    event Deposited(address indexed owner, uint256 amount, uint256 balance);
    event Allowed(address indexed owner, uint256 allowance);
    event Withdrawn(address indexed owner, uint256 amount, uint256 balance);
    event Charged(address indexed owner, bytes32 indexed chargeKey, uint256 amount);
    event Credited(address indexed owner, bytes32 indexed creditKey, uint256 amount);
    // slot side — names the slot and the market, never an owner
    event SlotFunded(bytes32 indexed slotId, uint256 amount);
    event SlotMinted(bytes32 indexed slotId, bytes32 indexed marketId, uint8 outcomeIdx, uint256 quantityRaw, uint256 costRaw);
    event SlotSettled(bytes32 indexed slotId, bytes32 indexed marketId, uint256 payout, address by);
    event SlotSwept(bytes32 indexed slotId, uint256 amount);
    // admin
    event DeskChanged(address indexed desk);
    event ParamsUpdated(Params params);
    event PausedSet(bool paused);
    event AdminChanged(address indexed admin);
    event Swept(uint256 amount);

    error NotAdmin(address caller);
    error NotDesk(address caller);
    error ZeroAddress();
    error ZeroAmount();
    error BadParams();
    error IsPaused();
    error Insufficient(uint256 requested, uint256 available);
    error OverAllowance(uint256 requested, uint256 allowance);
    error PoolShort(uint256 requested, uint256 pool);
    error KeyUsed(bytes32 key);
    error SlotAlreadyFunded(bytes32 slotId);
    error SlotNotFunded(bytes32 slotId);
    error SlotAlreadyMinted(bytes32 slotId);
    error SlotHoldsContracts(bytes32 slotId, uint256 quantityRaw);
    error SlotEmpty(bytes32 slotId);
    error StakeOutsideBand(uint256 stake, uint256 minStake, uint256 maxStake);
    error UnknownMarket(bytes32 marketId);
    error WrongCollateral(address got);
    error BadOutcome(uint8 outcomeIdx);
    error MarketNotTrading(bytes32 marketId, uint8 status);
    error TooLate(bytes32 marketId, uint64 lockAtSec);
    error WrongLens(address lens);
    /// @dev D-117: the desk may credit only an owner with a budget (one who has deposited) — never an arbitrary address.
    error NoBudget(address owner);
    error BelowMinQuantity(uint256 quantityRaw, uint256 minQuantityRaw);
    error StakeAboveMax(uint256 cost, uint256 stake);
    error NothingFilled(bytes32 marketId);
    error MarketNotSettled(bytes32 marketId);
    error NothingToSettle(bytes32 slotId);
}
