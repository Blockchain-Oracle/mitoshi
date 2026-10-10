// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

// Ported from Masayume 68f7a09:contracts/src/strategy/IStrategyRegistry.sol
// Seam edits (docs/specs/engine.md A.4.8, D-019, D-218): metadata is an SSTORE2 pointer + hash written by the root key
// only; an optional ERC-8004 `agentId` the creator owns; the envelope's `market` is a series id or any; a subscription
// carries `follow | fade` and is guarded by the subscriber's `maxFee`; the fee recipient's receive policy is checked.

import {IEventVault} from "../vault/IEventVault.sol";

/// @title The registry's vocabulary — records, events and errors.
interface IStrategyRegistry {
    /// @dev What a subscriber consents to: the runner's side (FOLLOW) or the opposite side (FADE, A-1c).
    enum Mode {
        FOLLOW,
        FADE
    }

    /// @dev A published, copyable strategy. `envelope` is the widest caps a subscriber's STRATEGY grant may carry; the
    ///      grant itself lives on the EventVault and does the enforcing. `envelope.market` is a series id (every Window
    ///      of that series) or zero (any Window).
    struct Strategy {
        address creator;
        /// @dev The actor every subscriber's grant must name — the one key that trades this strategy.
        address runner;
        /// @dev keccak256 of the canonical spec encoding the runner evaluates (data, never code).
        bytes32 specHash;
        /// @dev SSTORE2 pointer to the metadata bytes (name, description, the spec itself); zero when none.
        address metadataPointer;
        /// @dev keccak256 of the metadata bytes, so a reader can check what it fetched.
        bytes32 metadataHash;
        /// @dev The creator's ERC-8004 agent id (AG-1), or zero.
        uint256 agentId;
        IEventVault.Caps envelope;
        /// @dev Flat fee in collateral base units, paid to the creator when a subscription starts.
        uint128 subscriptionFee;
        bool active;
        uint64 createdAtSec;
        uint32 subscribers;
        uint32 revision;
    }

    /// @dev One wallet's standing consent to be copied: which grant on the vault backs it, and which way.
    struct Subscription {
        uint256 grantId;
        uint64 subscribedAtSec;
        Mode mode;
        bool active;
    }

    event Published(
        uint256 indexed strategyId,
        address indexed creator,
        address indexed runner,
        bytes32 specHash,
        bytes32 metadataHash,
        uint256 agentId,
        IEventVault.Caps envelope,
        uint128 fee
    );
    event Updated(uint256 indexed strategyId, bytes32 specHash, bytes32 metadataHash, uint128 fee, uint32 revision);
    event RunnerChanged(uint256 indexed strategyId, address indexed runner);
    event Deactivated(uint256 indexed strategyId);
    event Subscribed(
        uint256 indexed strategyId, address indexed subscriber, uint256 indexed grantId, Mode mode, uint128 feePaid, uint32 subscribers
    );
    event Unsubscribed(uint256 indexed strategyId, address indexed subscriber, uint32 subscribers);

    error ZeroRunner();
    error BadEnvelope();
    error NoSuchStrategy(uint256 strategyId);
    error NotCreator(uint256 strategyId, address caller);
    error StrategyInactive(uint256 strategyId);
    error NotGrantOwner(uint256 grantId, address caller);
    error WrongGrantKind(uint256 grantId);
    error WrongActor(uint256 grantId, address expected, address got);
    error GrantNotLive(uint256 grantId);
    error CapsOutsideEnvelope(uint256 grantId);
    error NotSubscribed(uint256 strategyId, address subscriber);
    error NotAgentOwner(uint256 agentId, address caller);
    error MetadataNeedsRootKey();
    error MetadataTooLarge(uint256 length);
    error FeeAboveMax(uint256 strategyId, uint128 fee, uint128 maxFee);
    error FeeRecipientBlocked(address creator);
    error OutsideEnvelopeMarket(uint256 grantId, bytes32 market);
}
