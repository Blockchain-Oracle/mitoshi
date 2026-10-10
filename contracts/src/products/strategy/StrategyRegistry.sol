// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

// Ported from Masayume 68f7a09:contracts/src/strategy/StrategyRegistry.sol
// Seam edits (docs/specs/engine.md A.4.8; D-019, D-218): metadata moves to SSTORE2 (pointer + hash) and is written by
// the root key only — Tempo refuses CREATE under an access key, so the registry says so first (`MetadataNeedsRootKey`);
// `publish` takes an optional ERC-8004 `agentId` the caller must own; the envelope's `market` is a series id (checked
// on the lens) or any, and `subscribe` refuses a grant pinned to a Window of another series; `subscribe` takes
// `mode` (follow | fade, A-1c) and `maxFee` (`FeeAboveMax`), charges the fee only when a subscription starts, checks
// the creator's receive policy (`FeeRecipientBlocked`), and reads grant 0 as the caller's active STRATEGY grant so the
// copy batch (grant + approve + subscribe) is one transaction. Bound to EventVaultV2 at deploy (D-218.1).

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {SSTORE2} from "solady/utils/SSTORE2.sol";
import {StdPrecompiles} from "tempo-std/StdPrecompiles.sol";
import {IEngineLens} from "../../engine/interfaces/IEngineLens.sol";
import {IEventVault} from "../vault/IEventVault.sol";
import {IStrategyRegistry} from "./IStrategyRegistry.sol";

/// @dev The vault views the registry reads; declared here so the registry needs no vault bytecode.
interface IEventVaultReads {
    function grantOf(uint256 grantId) external view returns (IEventVault.Grant memory);
    function isGrantLive(uint256 grantId) external view returns (bool);
    function activeGrantOf(address owner, IEventVault.GrantKind kind) external view returns (uint256);
    function lens() external view returns (IEngineLens);
}

/// @dev ERC-8004's IdentityRegistry is an ERC-721: an agent id is a token the creator holds.
interface IAgentIdentity {
    function ownerOf(uint256 agentId) external view returns (address);
}

/// @title StrategyRegistry — who may copy-trade whom, under which ceilings, for what fee.
/// @notice A creator publishes a strategy bound to one runner key and a caps envelope; a subscriber proves a live
///         EventVault STRATEGY grant to that runner, inside the envelope, and pays the creator's fee. The registry
///         moves no user funds beyond that fee: execution and every cap live on the vault (AD-5), and the runner can
///         only ever open positions the subscriber owns.
contract StrategyRegistry is IStrategyRegistry, ReentrancyGuard {
    using SafeERC20 for IERC20;

    /// @dev A 2 KB persona is ≈ 2.6M gas as code (D-019); 8 KB bounds a publish well inside a block.
    uint256 public constant MAX_METADATA_BYTES = 8_192;

    IEventVaultReads public immutable vault;
    IERC20 public immutable collateral;
    IEngineLens public immutable lens;
    /// @dev The chain's ERC-8004 IdentityRegistry; zero where there is none (then `agentId` must be 0).
    IAgentIdentity public immutable identity;

    /// @dev `strategyId` is the 1-based index; 0 means "none".
    Strategy[] private _strategies;
    mapping(uint256 strategyId => mapping(address subscriber => Subscription)) private _subscriptions;
    /// @dev Every wallet that ever subscribed, so a runner can page through them; `active` says who still is.
    mapping(uint256 strategyId => address[]) private _subscribersOf;

    constructor(IEventVaultReads vault_, IERC20 collateral_, IAgentIdentity identity_) {
        vault = vault_;
        collateral = collateral_;
        lens = vault_.lens();
        identity = identity_;
    }

    // ------------------------------------------------------------------ creators

    function publish(
        address runner,
        bytes32 specHash,
        bytes calldata metadata,
        IEventVault.Caps calldata envelope,
        uint128 fee,
        uint256 agentId
    ) external returns (uint256 strategyId) {
        if (runner == address(0)) revert ZeroRunner();
        if (envelope.maxStakePerTrade == 0 || envelope.maxDailySpend == 0 || envelope.maxOpenPositions == 0) revert BadEnvelope();
        // A series scope must name a series the engine knows (the lens reverts `UnknownSeries` otherwise).
        if (envelope.market != bytes32(0)) lens.seriesOf(envelope.market);
        if (agentId != 0) _requireAgentOwner(agentId);
        (address pointer, bytes32 hash) = _writeMetadata(metadata);
        _strategies.push(
            Strategy({
                creator: msg.sender,
                runner: runner,
                specHash: specHash,
                metadataPointer: pointer,
                metadataHash: hash,
                agentId: agentId,
                envelope: envelope,
                subscriptionFee: fee,
                active: true,
                createdAtSec: uint64(block.timestamp),
                subscribers: 0,
                revision: 0
            })
        );
        strategyId = _strategies.length;
        emit Published(strategyId, msg.sender, runner, specHash, hash, agentId, envelope, fee);
    }

    /// @notice A new spec revision, metadata or fee. The envelope is fixed for life: subscribers agreed to it, and a
    ///         raised fee reaches only new subscriptions, each bounded by its own `maxFee`.
    function update(uint256 strategyId, bytes32 specHash, bytes calldata metadata, uint128 fee) external {
        Strategy storage s = _owned(strategyId);
        (address pointer, bytes32 hash) = _writeMetadata(metadata);
        s.specHash = specHash;
        s.metadataPointer = pointer;
        s.metadataHash = hash;
        s.subscriptionFee = fee;
        s.revision += 1;
        emit Updated(strategyId, specHash, hash, fee, s.revision);
    }

    /// @notice Rotate the runner key. Existing grants name the old key, so subscribers re-grant to follow.
    function setRunner(uint256 strategyId, address runner) external {
        if (runner == address(0)) revert ZeroRunner();
        _owned(strategyId).runner = runner;
        emit RunnerChanged(strategyId, runner);
    }

    function deactivate(uint256 strategyId) external {
        _owned(strategyId).active = false;
        emit Deactivated(strategyId);
    }

    // ------------------------------------------------------------------ subscribers

    /// @notice Consent to be copied (or faded): the caller's live STRATEGY grant to this strategy's runner, inside the
    ///         envelope. `grantId` 0 reads the caller's active STRATEGY grant, so a batch can grant and subscribe at
    ///         once. The fee goes straight from the caller to the creator when the subscription starts, never more
    ///         than `maxFee`; re-subscribing while active only moves the grant or the mode.
    function subscribe(uint256 strategyId, uint256 grantId, Mode mode, uint128 maxFee) external nonReentrant {
        Strategy storage s = _strategyOf(strategyId);
        if (!s.active) revert StrategyInactive(strategyId);
        if (grantId == 0) grantId = vault.activeGrantOf(msg.sender, IEventVault.GrantKind.STRATEGY);
        _requireEligibleGrant(s, grantId, msg.sender);

        Subscription storage sub = _subscriptions[strategyId][msg.sender];
        bool starting = !sub.active;
        uint128 fee = starting ? s.subscriptionFee : 0;
        if (fee > maxFee) revert FeeAboveMax(strategyId, fee, maxFee);
        if (sub.subscribedAtSec == 0) _subscribersOf[strategyId].push(msg.sender);
        if (starting) s.subscribers += 1;
        sub.grantId = grantId;
        sub.subscribedAtSec = uint64(block.timestamp);
        sub.mode = mode;
        sub.active = true;

        if (fee != 0) {
            // A blocked receive policy doesn't revert a TIP-20 transfer; the fee would land in the guard (F-S2-09).
            (bool receivable,) = StdPrecompiles.TIP403_REGISTRY.validateReceivePolicy(address(collateral), msg.sender, s.creator);
            if (!receivable) revert FeeRecipientBlocked(s.creator);
            collateral.safeTransferFrom(msg.sender, s.creator, fee);
        }
        emit Subscribed(strategyId, msg.sender, grantId, mode, fee, s.subscribers);
    }

    /// @notice Ends the consent record. Revoking the grant on the vault is what actually stops the runner;
    ///         this keeps the registry's count honest either way.
    function unsubscribe(uint256 strategyId) external {
        Strategy storage s = _strategyOf(strategyId);
        Subscription storage sub = _subscriptions[strategyId][msg.sender];
        if (!sub.active) revert NotSubscribed(strategyId, msg.sender);
        sub.active = false;
        s.subscribers -= 1;
        emit Unsubscribed(strategyId, msg.sender, s.subscribers);
    }

    // ------------------------------------------------------------------ views

    function strategyCount() external view returns (uint256) {
        return _strategies.length;
    }

    function strategyOf(uint256 strategyId) external view returns (Strategy memory) {
        return _strategyOf(strategyId);
    }

    /// @notice The metadata bytes as published (empty when none); `keccak256` of them is `metadataHash`.
    function metadataOf(uint256 strategyId) external view returns (bytes memory) {
        address pointer = _strategyOf(strategyId).metadataPointer;
        return pointer == address(0) ? bytes("") : SSTORE2.read(pointer);
    }

    function subscriptionOf(uint256 strategyId, address subscriber) external view returns (Subscription memory) {
        return _subscriptions[strategyId][subscriber];
    }

    function subscriberCountOf(uint256 strategyId) external view returns (uint256) {
        return _subscribersOf[strategyId].length;
    }

    /// @notice Everyone who ever subscribed, oldest first, paged; read `subscriptionOf` for who still is.
    function subscribersOf(uint256 strategyId, uint256 offset, uint256 limit) external view returns (address[] memory page) {
        address[] storage all = _subscribersOf[strategyId];
        if (offset >= all.length) return page;
        uint256 end = offset + limit;
        if (end > all.length) end = all.length;
        page = new address[](end - offset);
        for (uint256 i = offset; i < end; i++) {
            page[i - offset] = all[i];
        }
    }

    /// @notice A subscription the runner may act on right now: consent on record, and a live grant to it.
    function isSubscriptionLive(uint256 strategyId, address subscriber) external view returns (bool) {
        Subscription storage sub = _subscriptions[strategyId][subscriber];
        if (!sub.active || !vault.isGrantLive(sub.grantId)) return false;
        IEventVault.Grant memory g = vault.grantOf(sub.grantId);
        return g.owner == subscriber && g.actor == _strategyOf(strategyId).runner && g.kind == IEventVault.GrantKind.STRATEGY;
    }

    /// @notice Whether `marketId` is a Window this strategy trades: any Window, or one of its series. The vault scopes a
    ///         grant to one Window or any, so a series scope is the runner's to hold — it asks here before each order.
    function inScope(uint256 strategyId, bytes32 marketId) external view returns (bool) {
        bytes32 scope = _strategyOf(strategyId).envelope.market;
        return scope == bytes32(0) || lens.marketRef(marketId).seriesId == scope;
    }

    // ------------------------------------------------------------------ internals

    function _strategyOf(uint256 strategyId) internal view returns (Strategy storage) {
        if (strategyId == 0 || strategyId > _strategies.length) revert NoSuchStrategy(strategyId);
        return _strategies[strategyId - 1];
    }

    function _owned(uint256 strategyId) internal view returns (Strategy storage s) {
        s = _strategyOf(strategyId);
        if (s.creator != msg.sender) revert NotCreator(strategyId, msg.sender);
    }

    /// @dev SSTORE2 is a CREATE; Tempo refuses one in any access-key transaction (D-019), so only the root key writes.
    function _writeMetadata(bytes calldata metadata) internal returns (address pointer, bytes32 hash) {
        if (metadata.length == 0) return (address(0), bytes32(0));
        if (metadata.length > MAX_METADATA_BYTES) revert MetadataTooLarge(metadata.length);
        if (StdPrecompiles.ACCOUNT_KEYCHAIN.getTransactionKey() != address(0)) revert MetadataNeedsRootKey();
        pointer = SSTORE2.write(metadata);
        hash = keccak256(metadata);
    }

    /// @dev An id that was never minted makes `ownerOf` revert; that is "not yours" too.
    function _requireAgentOwner(uint256 agentId) internal view {
        address holder;
        if (address(identity) != address(0)) {
            try identity.ownerOf(agentId) returns (address o) {
                holder = o;
            } catch {}
        }
        if (holder != msg.sender) revert NotAgentOwner(agentId, msg.sender);
    }

    function _requireEligibleGrant(Strategy storage s, uint256 grantId, address subscriber) internal view {
        IEventVault.Grant memory g = vault.grantOf(grantId);
        if (g.owner != subscriber) revert NotGrantOwner(grantId, subscriber);
        if (g.kind != IEventVault.GrantKind.STRATEGY) revert WrongGrantKind(grantId);
        if (g.actor != s.runner) revert WrongActor(grantId, s.runner, g.actor);
        if (!vault.isGrantLive(grantId)) revert GrantNotLive(grantId);
        IEventVault.Caps memory env = s.envelope;
        bool inside = g.caps.maxStakePerTrade <= env.maxStakePerTrade && g.caps.maxDailySpend <= env.maxDailySpend
            && g.caps.maxOpenPositions <= env.maxOpenPositions
            && (env.maxPriceRaw == 0 || (g.caps.maxPriceRaw != 0 && g.caps.maxPriceRaw <= env.maxPriceRaw));
        if (!inside) revert CapsOutsideEnvelope(grantId);
        // A grant pinned to a Window of another series is one this runner can never use.
        if (env.market != bytes32(0) && g.caps.market != bytes32(0) && lens.marketRef(g.caps.market).seriesId != env.market) {
            revert OutsideEnvelopeMarket(grantId, g.caps.market);
        }
    }
}
