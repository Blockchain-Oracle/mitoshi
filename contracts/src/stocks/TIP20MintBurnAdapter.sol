// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {OFTAdapterUpgradeable} from "@layerzerolabs/oft-evm-upgradeable/contracts/oft/OFTAdapterUpgradeable.sol";
import {SendParam, MessagingFee, MessagingReceipt, OFTReceipt} from "@layerzerolabs/oft-evm/contracts/interfaces/IOFT.sol";
import {ITIP20} from "tempo-std/interfaces/ITIP20.sol";
import {ITIP403Registry} from "tempo-std/interfaces/ITIP403Registry.sol";
import {BridgeRateLimiter} from "../common/BridgeRateLimiter.sol";
import {DeferReason} from "../common/BridgeTypes.sol";
import {IEndpointV2Alt} from "../lz/ILZEndpointDollar.sol";
import {LzdFee} from "../lz/LzdFee.sol";

// Pattern from FraxFinance/frax-oft-upgradeable@981a7b96:contracts/FraxOFTMintableAdapterUpgradeableTIP20.sol
// (UNLICENSED; only the shape is reused: reject msg.value, _debit = transferFrom + burn, _credit = mint, _payNative → LZD).

/// @title TIP20MintBurnAdapter — mints and burns a bridged mirror TIP-20 on Tempo (plan B.1.4, ST-04, D-020).
/// @notice Holds `ISSUER_ROLE` on its mirror (and nothing else does). Inbound credits never revert on a refusal: the
///         adapter pre-checks every reason a TIP-20 mint can fail, in a fixed order, and defers instead; the recipient
///         later `claimDeferred()`s, or `sendDeferred()`s the amount back without admin help. Only a gas shortfall
///         reverts (so the executor retries). Fees are paid in pathUSD wrapped into LZEndpointDollar; Tempo itself
///         refuses native value, so `send` stays `payable` only to match IOFT. Deployed behind `TransparentUpgradeableProxy(impl, SAFE, initData)` (D-054).
contract TIP20MintBurnAdapter is OFTAdapterUpgradeable {
    using BridgeRateLimiter for BridgeRateLimiter.Bucket;

    ITIP403Registry internal constant TIP403 = ITIP403Registry(0x403c000000000000000000000000000000000000);
    address internal constant RECEIVE_POLICY_GUARD = 0xB10C000000000000000000000000000000000000;
    /// @notice Below this, `_credit` reverts so the message stays retryable (a fresh-holder mint costs ~0.54M on Tempo).
    uint256 public constant MIN_CREDIT_GAS = 600_000;

    /// @custom:storage-location erc7201:mitoshi.storage.TIP20MintBurnAdapter
    struct AdapterStorage {
        address guardian;
        bool sendsPaused;
        mapping(address => uint256) deferred;
        /// @dev Stored +1 (set in `initialize`): on Tempo a zero→non-zero write costs 250k (TIP-1000), so the counters
        ///      touched on every credit are pre-warmed and each later write is a cheap non-zero→non-zero update.
        uint256 totalDeferredPlusOne;
        uint256 mintedNetPlusOne;
        mapping(uint32 eid => BridgeRateLimiter.Bucket) outboundLimit;
        BridgeRateLimiter.Bucket inboundLimit;
    }

    // keccak256(abi.encode(uint256(keccak256("mitoshi.storage.TIP20MintBurnAdapter")) - 1)) & ~bytes32(uint256(0xff))
    bytes32 private constant STORAGE_LOCATION = 0x06ab9501a3b9046c45cce6fe58c93ad0f259e8ee471aaebf21d75ff893b3b000;

    address public immutable lzd;

    event CreditDeferred(address indexed to, uint32 indexed srcEid, uint256 amountLD, DeferReason reason);
    event DeferredClaimed(address indexed to, uint256 amountLD);
    event DeferredSent(address indexed from, bytes32 indexed guid, uint32 indexed dstEid, uint256 amountLD);
    event GuardianSet(address guardian);
    event SendsPaused(bool paused, address by);
    event RateLimitSet(uint32 indexed eid, bool inbound, uint128 capacity, uint64 window);

    error SendsArePaused();
    error InvalidRecipient();
    error InsufficientGas(uint256 left, uint256 needed);
    error CannotMint(DeferReason reason);
    error NothingDeferred();
    error ExceedsDeferred(uint256 amountLD, uint256 deferredLD);
    error NotGuardian();
    error OnlyLower(uint128 current, uint128 requested);
    error TransferFromFailed();

    constructor(address mirror, address endpoint_) OFTAdapterUpgradeable(mirror, endpoint_) {
        lzd = IEndpointV2Alt(endpoint_).nativeToken();
        _disableInitializers();
    }

    function initialize(address owner_, address guardian_) external initializer {
        __OFTAdapter_init(owner_);
        __Ownable_init(owner_);
        AdapterStorage storage $ = _s();
        $.guardian = guardian_;
        $.totalDeferredPlusOne = 1;
        $.mintedNetPlusOne = 1;
        emit GuardianSet(guardian_);
    }

    function _s() private pure returns (AdapterStorage storage $) {
        assembly {
            $.slot := STORAGE_LOCATION
        }
    }

    modifier onlyGuardianOrOwner() {
        if (msg.sender != _s().guardian && msg.sender != owner()) revert NotGuardian();
        _;
    }

    // ─── outbound: burn ──────────────────────────────────────────────────

    function send(SendParam calldata sendParam, MessagingFee calldata fee, address refundAddress)
        external
        payable
        override
        returns (MessagingReceipt memory, OFTReceipt memory)
    {
        if (_s().sendsPaused) revert SendsArePaused();
        if (sendParam.to == bytes32(0)) revert InvalidRecipient();
        return _send(sendParam, fee, refundAddress);
    }

    /// @dev TIP-20 burns only the caller's own balance (no burnFrom), hence transferFrom then burn.
    function _debit(address from, uint256 amountLD, uint256 minAmountLD, uint32 dstEid)
        internal
        override
        returns (uint256 amountSentLD, uint256 amountReceivedLD)
    {
        (amountSentLD, amountReceivedLD) = _debitView(amountLD, minAmountLD, dstEid);
        AdapterStorage storage $ = _s();
        $.outboundLimit[dstEid].consume(amountSentLD);
        ITIP20 mirror = ITIP20(address(innerToken));
        if (!mirror.transferFrom(from, address(this), amountSentLD)) revert TransferFromFailed();
        mirror.burn(amountSentLD);
        $.mintedNetPlusOne -= amountSentLD;
    }

    function _payNative(uint256 nativeFee) internal override returns (uint256) {
        return LzdFee.pay(msg.sender, lzd, address(endpoint), nativeFee);
    }

    // ─── inbound: mint or defer ──────────────────────────────────────────

    /// @notice The first reason (B.1.4 order) a mint of `amountLD` to `to` would fail now; NONE if it would succeed.
    function mintBlockReason(address to, uint256 amountLD) public view returns (DeferReason) {
        if (to == address(0) || uint160(to) >> 64 == 0x20c000000000000000000000 || to == RECEIVE_POLICY_GUARD) {
            return DeferReason.INVALID_RECIPIENT;
        }
        ITIP20 mirror = ITIP20(address(innerToken));
        if (mirror.paused()) return DeferReason.TOKEN_PAUSED;
        if (!TIP403.isAuthorizedMintRecipient(mirror.transferPolicyId(), to)) return DeferReason.POLICY;
        if (mirror.totalSupply() + amountLD > mirror.supplyCap()) return DeferReason.SUPPLY_CAP;
        if (_s().inboundLimit.available() < amountLD) return DeferReason.RATE_LIMIT;
        try TIP403.validateReceivePolicy(address(mirror), address(this), to) returns (bool ok, ITIP403Registry.BlockedReason) {
            if (!ok) return DeferReason.RECEIVE_POLICY;
        } catch {}
        return DeferReason.NONE;
    }

    function _credit(address to, uint256 amountLD, uint32 srcEid) internal override returns (uint256) {
        if (gasleft() < MIN_CREDIT_GAS) revert InsufficientGas(gasleft(), MIN_CREDIT_GAS);
        DeferReason reason = mintBlockReason(to, amountLD);
        if (reason == DeferReason.NONE) {
            if (_tryMint(to, amountLD)) return amountLD;
            reason = DeferReason.CALL_REVERTED;
        }
        AdapterStorage storage $ = _s();
        $.deferred[to] += amountLD;
        $.totalDeferredPlusOne += amountLD;
        emit CreditDeferred(to, srcEid, amountLD, reason);
        return amountLD;
    }

    /// @dev A mint that ran out of gas reverts the whole receive (retryable) instead of deferring.
    function _tryMint(address to, uint256 amountLD) internal returns (bool) {
        uint256 before = gasleft();
        try ITIP20(address(innerToken)).mint(to, amountLD) {
            AdapterStorage storage $ = _s();
            $.inboundLimit.consume(amountLD);
            $.mintedNetPlusOne += amountLD;
            return true;
        } catch {
            if (gasleft() <= before / 63) revert InsufficientGas(gasleft(), MIN_CREDIT_GAS);
            return false;
        }
    }

    /// @notice Mint what an earlier credit deferred, once nothing blocks it (e.g. after a supply-cap raise).
    function claimDeferred() external {
        AdapterStorage storage $ = _s();
        uint256 amount = $.deferred[msg.sender];
        if (amount == 0) revert NothingDeferred();
        DeferReason reason = mintBlockReason(msg.sender, amount);
        if (reason != DeferReason.NONE) revert CannotMint(reason);
        $.deferred[msg.sender] = 0;
        $.totalDeferredPlusOne -= amount;
        $.inboundLimit.consume(amount);
        $.mintedNetPlusOne += amount;
        ITIP20(address(innerToken)).mint(msg.sender, amount);
        emit DeferredClaimed(msg.sender, amount);
    }

    /// @notice Send a deferred amount straight back across (the exit that never needs an admin). Not blocked by
    ///         `sendsPaused`; the outbound rate limit still applies. Fee in pathUSD, as for `send`.
    function sendDeferred(SendParam calldata sendParam, MessagingFee calldata fee, address refundAddress)
        external
        returns (MessagingReceipt memory msgReceipt, OFTReceipt memory oftReceipt)
    {
        if (sendParam.to == bytes32(0)) revert InvalidRecipient();
        (uint256 sent, uint256 received) = _debitView(sendParam.amountLD, sendParam.minAmountLD, sendParam.dstEid);
        AdapterStorage storage $ = _s();
        uint256 have = $.deferred[msg.sender];
        if (sent > have) revert ExceedsDeferred(sent, have);
        $.deferred[msg.sender] = have - sent;
        $.totalDeferredPlusOne -= sent;
        $.outboundLimit[sendParam.dstEid].consume(sent);
        (bytes memory message, bytes memory options) = _buildMsgAndOptions(sendParam, received);
        msgReceipt = _lzSend(sendParam.dstEid, message, options, fee, refundAddress);
        oftReceipt = OFTReceipt(sent, received);
        emit OFTSent(msgReceipt.guid, sendParam.dstEid, msg.sender, sent, received);
        emit DeferredSent(msg.sender, msgReceipt.guid, sendParam.dstEid, sent);
    }

    // ─── admin ───────────────────────────────────────────────────────────

    function setGuardian(address guardian_) external onlyOwner {
        _s().guardian = guardian_;
        emit GuardianSet(guardian_);
    }

    function pauseSends(bool paused) external onlyGuardianOrOwner {
        if (!paused && msg.sender != owner()) revert OwnableUnauthorizedAccount(msg.sender);
        _s().sendsPaused = paused;
        emit SendsPaused(paused, msg.sender);
    }

    function setOutboundLimit(uint32 eid, uint128 capacity, uint64 window) external onlyOwner {
        _s().outboundLimit[eid].set(capacity, window);
        emit RateLimitSet(eid, false, capacity, window);
    }

    function setInboundLimit(uint128 capacity, uint64 window) external onlyOwner {
        _s().inboundLimit.set(capacity, window);
        emit RateLimitSet(0, true, capacity, window);
    }

    /// @notice Guardian (or owner) may only lower a limit; `eid` 0 means the inbound limit.
    function lowerLimit(uint32 eid, uint128 capacity) external onlyGuardianOrOwner {
        BridgeRateLimiter.Bucket storage b = eid == 0 ? _s().inboundLimit : _s().outboundLimit[eid];
        if (capacity > b.capacity) revert OnlyLower(b.capacity, capacity);
        b.set(capacity, b.window);
        emit RateLimitSet(eid, eid == 0, capacity, b.window);
    }

    // ─── views ───────────────────────────────────────────────────────────

    function guardian() external view returns (address) {
        return _s().guardian;
    }

    function sendsPaused() external view returns (bool) {
        return _s().sendsPaused;
    }

    function deferredOf(address account) external view returns (uint256) {
        return _s().deferred[account];
    }

    function totalDeferred() external view returns (uint256) {
        return _s().totalDeferredPlusOne - 1;
    }

    function mintedNet() external view returns (uint256) {
        return _s().mintedNetPlusOne - 1;
    }

    function outboundLimit(uint32 eid) external view returns (uint128 capacity, uint256 available, uint64 window) {
        BridgeRateLimiter.Bucket storage b = _s().outboundLimit[eid];
        return (b.capacity, b.available(), b.window);
    }

    function inboundLimit() external view returns (uint128 capacity, uint256 available, uint64 window) {
        BridgeRateLimiter.Bucket storage b = _s().inboundLimit;
        return (b.capacity, b.available(), b.window);
    }
}
