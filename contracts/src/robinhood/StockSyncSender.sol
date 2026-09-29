// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {OApp, Origin, MessagingFee, MessagingReceipt} from "@layerzerolabs/oapp-evm/contracts/oapp/OApp.sol";
import {OAppOptionsType3} from "@layerzerolabs/oapp-evm/contracts/oapp/libs/OAppOptionsType3.sol";
import {OptionsBuilder} from "@layerzerolabs/oapp-evm/contracts/oapp/libs/OptionsBuilder.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {StockSyncCodec as C} from "../common/StockSyncCodec.sol";
import {SyncFlags} from "../common/BridgeTypes.sol";

interface IStockState {
    function uiMultiplier() external view returns (uint256);
    function newUIMultiplier() external view returns (uint256);
    function effectiveAt() external view returns (uint256);
}

/// @title StockSyncSender — mirrors Robinhood corporate-action state to Tempo (plan B.1.2, ST-05).
/// @notice Permissionless: anyone may `sync` registered Stock Tokens and pay the fee; the content is read on chain
///         from the Stock Token itself, so only the relay (DVNs) is trusted. Each message is a full snapshot (one
///         MULTIPLIER + one STATUS record per token) ordered by `(block.timestamp, seq)`.
/// @dev Optional reads (`tokenPaused`, `oraclePaused`, the access registry's `paused`/`isBlocked`) go through
///      staticcall + `ret.length == 32`: the testnet Stock's `oraclePaused()` reverts with empty data (plan F-G).
contract StockSyncSender is OApp, OAppOptionsType3 {
    using OptionsBuilder for bytes;

    uint16 public constant MSG_SYNC = 1;
    uint128 public constant GAS_BASE = 150_000;
    uint128 public constant GAS_PER_TOKEN = 50_000;
    uint256 public constant MAX_TOKENS = 32;

    uint64 public seq;
    /// @notice The lockbox of each registered Stock Token (its registry-blocked state is mirrored).
    mapping(address stock => address lockbox) public lockboxOf;

    event TokenRegistered(address indexed stock, address indexed lockbox);
    event Synced(bytes32 indexed guid, uint32 indexed dstEid, uint64 seq, uint256 tokens);

    error UnknownStock(address stock);
    error NoTokens();
    error TooManyTokens(uint256 n);
    error NoEnforcedOptions(uint32 dstEid);
    error ValueTooLarge(uint256 value);
    error NoInbound();

    constructor(address endpoint_, address owner_) OApp(endpoint_, owner_) Ownable(owner_) {}

    function registerToken(address stock, address lockbox) external onlyOwner {
        lockboxOf[stock] = lockbox;
        emit TokenRegistered(stock, lockbox);
    }

    // ─── reads ───────────────────────────────────────────────────────────

    function readState(address stock) public view returns (C.Multiplier memory m, C.Status memory s) {
        address lockbox = lockboxOf[stock];
        if (lockbox == address(0)) revert UnknownStock(stock);
        IStockState t = IStockState(stock);
        m = C.Multiplier(stock, _u128(t.uiMultiplier()), _u128(t.newUIMultiplier()), uint64(_u128(t.effectiveAt())));
        uint8 flags;
        (bool ok, bool v) = _optBool(stock, abi.encodeWithSignature("tokenPaused()"));
        if (ok) flags |= SyncFlags.TOKEN_PAUSED_SUPPORTED | (v ? SyncFlags.TOKEN_PAUSED : 0);
        (ok, v) = _optBool(stock, abi.encodeWithSignature("oraclePaused()"));
        if (ok) flags |= SyncFlags.ORACLE_SUPPORTED | (v ? SyncFlags.ORACLE_PAUSED : 0);
        address registry = _optAddress(stock, abi.encodeWithSignature("ACCESS_CONTROLLED_REGISTRY()"));
        if (registry != address(0)) {
            (ok, v) = _optBool(registry, abi.encodeWithSignature("paused()"));
            if (ok && v) flags |= SyncFlags.REGISTRY_PAUSED;
            (ok, v) = _optBool(registry, abi.encodeWithSignature("isBlocked(address)", lockbox));
            if (ok && v) flags |= SyncFlags.LOCKBOX_BLOCKED;
        }
        s = C.Status(stock, flags);
    }

    function _optBool(address target, bytes memory data) internal view returns (bool ok, bool value) {
        (bool success, bytes memory ret) = target.staticcall(data);
        if (!success || ret.length != 32) return (false, false);
        uint256 word = abi.decode(ret, (uint256));
        if (word > 1) return (false, false);
        return (true, word == 1);
    }

    function _optAddress(address target, bytes memory data) internal view returns (address) {
        (bool success, bytes memory ret) = target.staticcall(data);
        if (!success || ret.length != 32) return address(0);
        uint256 word = abi.decode(ret, (uint256));
        return word >> 160 == 0 ? address(uint160(word)) : address(0);
    }

    function _u128(uint256 v) internal pure returns (uint128) {
        if (v > type(uint128).max) revert ValueTooLarge(v);
        return uint128(v);
    }

    // ─── send ────────────────────────────────────────────────────────────

    function buildMessage(address[] calldata stocks, uint64 seq_) public view returns (bytes memory message) {
        if (stocks.length == 0) revert NoTokens();
        if (stocks.length > MAX_TOKENS) revert TooManyTokens(stocks.length);
        message = C.encodeHeader(C.Header(uint32(block.chainid), uint64(block.timestamp), seq_, uint16(stocks.length * 2)));
        for (uint256 i; i < stocks.length; i++) {
            (C.Multiplier memory m, C.Status memory s) = readState(stocks[i]);
            message = bytes.concat(message, C.encodeMultiplier(m), C.encodeStatus(s));
        }
    }

    function _options(uint32 dstEid, uint256 n) internal view returns (bytes memory) {
        if (enforcedOptions[dstEid][MSG_SYNC].length == 0) revert NoEnforcedOptions(dstEid);
        bytes memory extra = OptionsBuilder.newOptions().addExecutorLzReceiveOption(uint128(GAS_PER_TOKEN * n), 0);
        return this.combineOptions(dstEid, MSG_SYNC, extra);
    }

    function quoteSync(address[] calldata stocks, uint32 dstEid) external view returns (MessagingFee memory) {
        return _quote(dstEid, buildMessage(stocks, seq + 1), _options(dstEid, stocks.length), false);
    }

    /// @notice Anyone may sync; excess `msg.value` is refunded to the caller by the endpoint.
    function sync(address[] calldata stocks, uint32 dstEid) external payable returns (MessagingReceipt memory r) {
        uint64 s = ++seq;
        bytes memory message = buildMessage(stocks, s);
        bytes memory options = _options(dstEid, stocks.length);
        MessagingFee memory fee = _quote(dstEid, message, options, false);
        r = _lzSend(dstEid, message, options, fee, msg.sender);
        emit Synced(r.guid, dstEid, s, stocks.length);
    }

    function _payNative(uint256 nativeFee) internal override returns (uint256) {
        if (msg.value < nativeFee) revert NotEnoughNative(msg.value);
        return msg.value;
    }

    function _lzReceive(Origin calldata, bytes32, bytes calldata, address, bytes calldata) internal pure override {
        revert NoInbound();
    }
}
