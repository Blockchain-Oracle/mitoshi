// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

// Ported from Masayume 68f7a09:contracts/src/vault/IEventVault.sol
// Seam edits (docs/specs/engine.md A.4.1): `Caps.market` + `OutsideGrantMarket` (D-091); `WrongLens` (constructor
// pin); `NoDepositViaForwarder` removed with the ERC-2771 forwarder (D-003). Everything else is unchanged.

/// @title EventVault's public vocabulary — grant kinds, caps, records, events and errors.
/// @notice One interface so the adapter, the tests and the contract read the same ABI.
interface IEventVault {
    /// @dev The three delegated powers (AD-5). Each owner holds at most one live grant per kind.
    enum GrantKind {
        SESSION,
        EXECUTOR,
        STRATEGY
    }

    /// @dev Every cap is in collateral base units except `maxOpenPositions`. `maxPriceRaw` is the
    ///      dearest price the actor may pay for a side, in that side's own terms; 0 means no limit.
    ///      `market` scopes the grant to one Window (D-091); zero means any Window.
    struct Caps {
        uint128 maxStakePerTrade;
        uint128 maxDailySpend;
        uint32 maxOpenPositions;
        uint64 maxPriceRaw;
        bytes32 market;
    }

    struct Grant {
        address owner;
        address actor;
        GrantKind kind;
        bool revoked;
        uint64 expiresAtSec;
        /// @dev UTC day (`timestamp / 1 days`) that `spentToday` belongs to.
        uint64 spentDay;
        uint32 openPositions;
        Caps caps;
        /// @dev The owner's allocation the actor may still spend. Proceeds never flow back here.
        uint256 budget;
        uint256 spentToday;
    }

    struct Account {
        uint256 available;
        uint256 privateAvailable;
        uint256 totalDeposited;
        uint256 totalWithdrawn;
    }

    event Deposited(address indexed owner, uint256 amount, uint256 available);
    event Credited(address indexed owner, address indexed from, uint256 amount, uint256 available);
    event Withdrawn(address indexed owner, uint256 amount, uint256 available);
    event PrivateMoved(address indexed owner, uint256 amount, uint256 privateAvailable);
    event PrivateCredited(address indexed owner, address indexed from, uint256 amount, uint256 privateAvailable);
    event PrivateWithdrawn(address indexed owner, uint256 amount, uint256 privateAvailable);
    event GrantCreated(
        uint256 indexed grantId, address indexed owner, address indexed actor, GrantKind kind, Caps caps, uint64 expiresAtSec, uint256 budget
    );
    event GrantFunded(uint256 indexed grantId, uint256 amount, uint256 budget);
    event GrantRevoked(uint256 indexed grantId, address indexed owner, uint256 returned);
    /// @dev Carries the venue's market id only — never a pool address (AD-10). `grantId` 0 is the owner acting alone.
    event Executed(
        address indexed owner,
        bytes32 indexed marketId,
        uint256 indexed grantId,
        uint8 outcomeIdx,
        bool isBuy,
        uint256 cashDelta,
        uint256 tokenDelta,
        address actor,
        uint64 atSec
    );
    event Settled(
        address indexed owner, bytes32 indexed marketId, uint256 payout, uint256 yesRedeemed, uint256 noRedeemed, address by, uint64 atSec
    );
    event Swept(uint256 amount);

    error ZeroAmount();
    error Insufficient(uint256 requested, uint256 available);
    error UnknownMarket(bytes32 marketId);
    error WrongCollateral(address got);
    error WrongLens(address lens);
    error MarketNotTrading(uint8 status);
    error MarketNotSettled();
    error NothingToSettle();
    error BadOutcome(uint8 outcomeIdx);
    error NoSuchGrant(uint256 grantId);
    error NotGrantActor(uint256 grantId, address caller);
    error NotGrantOwner(uint256 grantId, address caller);
    error GrantIsRevoked(uint256 grantId);
    error GrantExpired(uint256 grantId, uint64 expiresAtSec);
    error BadExpiry(uint64 expiresAtSec);
    error ZeroActor();
    error OverStakeCap(uint256 spent, uint128 cap);
    error OverDailyCap(uint256 wouldBe, uint128 cap);
    error OverPositionCap(uint32 wouldBe, uint32 cap);
    error OverPriceCap(uint256 priceRaw, uint64 cap);
    error OutsideGrantMarket(uint256 grantId, bytes32 marketId);
}
