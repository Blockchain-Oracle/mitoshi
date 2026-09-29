// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {OApp, Origin, MessagingFee, MessagingReceipt} from "@layerzerolabs/oapp-evm/contracts/oapp/OApp.sol";
import {OAppOptionsType3} from "@layerzerolabs/oapp-evm/contracts/oapp/libs/OAppOptionsType3.sol";
import {OptionsBuilder} from "@layerzerolabs/oapp-evm/contracts/oapp/libs/OptionsBuilder.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {StockSyncCodec as C} from "../common/StockSyncCodec.sol";

/// @title StockSyncForwarder — relays StockSync snapshots from RH testnet to Moderato via Base Sepolia (plan B.1.3).
/// @notice Forwards the identical payload (so the Tempo receiver still sees `srcChainId` = 46630) with its own ETH.
///         It never reverts a received sync: when underfunded (or the onward send fails) the payload waits in
///         `pending[guid]` and anyone can `retryForward(guid)` with ETH. Messages from any eid but `srcEid` are ignored.
contract StockSyncForwarder is OApp, OAppOptionsType3 {
    using OptionsBuilder for bytes;

    uint16 public constant MSG_SYNC = 1;
    /// @notice Per record; two records per token, matching StockSyncSender's 50k per token.
    uint128 public constant GAS_PER_RECORD = 25_000;

    uint32 public immutable srcEid;
    uint32 public immutable dstEid;
    mapping(bytes32 guid => bytes payload) public pending;

    event Forwarded(bytes32 indexed guid, bytes32 indexed outGuid, uint256 fee);
    event ForwardDeferred(bytes32 indexed guid, bytes reason);
    event Ignored(bytes32 indexed guid, uint32 srcEid);
    event EthWithdrawn(address to, uint256 amount);

    error OnlySelf();
    error Underfunded(uint256 balance, uint256 fee);
    error NothingPending(bytes32 guid);

    constructor(address endpoint_, address owner_, uint32 srcEid_, uint32 dstEid_) OApp(endpoint_, owner_) Ownable(owner_) {
        srcEid = srcEid_;
        dstEid = dstEid_;
    }

    receive() external payable {}

    function _lzReceive(Origin calldata origin, bytes32 guid, bytes calldata message, address, bytes calldata)
        internal
        override
    {
        if (origin.srcEid != srcEid) {
            emit Ignored(guid, origin.srcEid);
            return;
        }
        try this.forwardNow(message) returns (bytes32 outGuid, uint256 fee) {
            emit Forwarded(guid, outGuid, fee);
        } catch (bytes memory reason) {
            pending[guid] = message;
            emit ForwardDeferred(guid, reason);
        }
    }

    /// @dev Self-call so a failed onward send can be caught without reverting the inbound message.
    function forwardNow(bytes calldata message) external returns (bytes32, uint256) {
        if (msg.sender != address(this)) revert OnlySelf();
        return _forward(message);
    }

    /// @notice Retries a deferred forward; `msg.value` tops up the float first.
    function retryForward(bytes32 guid) external payable returns (bytes32 outGuid) {
        bytes memory message = pending[guid];
        if (message.length == 0) revert NothingPending(guid);
        delete pending[guid];
        uint256 fee;
        (outGuid, fee) = this.forwardNow(message);
        emit Forwarded(guid, outGuid, fee);
    }

    function quoteForward(bytes calldata message) public view returns (MessagingFee memory) {
        return _quote(dstEid, message, _options(message), false);
    }

    function _options(bytes calldata message) internal view returns (bytes memory) {
        uint16 count = C.validate(message).count;
        bytes memory extra = OptionsBuilder.newOptions().addExecutorLzReceiveOption(GAS_PER_RECORD * count, 0);
        return this.combineOptions(dstEid, MSG_SYNC, extra);
    }

    function _forward(bytes calldata message) internal returns (bytes32, uint256) {
        bytes memory options = _options(message);
        MessagingFee memory fee = _quote(dstEid, message, options, false);
        if (address(this).balance < fee.nativeFee) revert Underfunded(address(this).balance, fee.nativeFee);
        MessagingReceipt memory r = _lzSend(dstEid, message, options, fee, address(this));
        return (r.guid, fee.nativeFee);
    }

    /// @dev Pays from the contract's own float, not `msg.value`.
    function _payNative(uint256 nativeFee) internal pure override returns (uint256) {
        return nativeFee;
    }

    function withdrawEth(address payable to, uint256 amount) external onlyOwner {
        (bool ok,) = to.call{value: amount}("");
        require(ok, "withdraw failed");
        emit EthWithdrawn(to, amount);
    }
}
