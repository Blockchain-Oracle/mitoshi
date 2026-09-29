// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {ILayerZeroComposer} from "@layerzerolabs/lz-evm-protocol-v2/contracts/interfaces/ILayerZeroComposer.sol";
import {OFTComposeMsgCodec} from "@layerzerolabs/oft-evm/contracts/libs/OFTComposeMsgCodec.sol";
import {IOFT, SendParam, MessagingFee, MessagingReceipt} from "@layerzerolabs/oft-evm/contracts/interfaces/IOFT.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// @title HopComposer — forwards a transit OFT credit to its final chain (plan B.1.3).
/// @notice A lock on RH testnet is sent to Base Sepolia with `to = HopComposer` and
///         `composeMsg = abi.encode(uint32 finalEid, bytes32 finalTo, uint256 minLD)`; `lzCompose` re-sends the credited
///         transit tokens to `finalEid`, paying the LayerZero fee from its own ETH float. The reverse path mirrors it.
///         Invalid instructions (unknown final eid, back to the source, zero recipient, below `minHopLD`, `minLD` above
///         the amount, malformed bytes) bounce the tokens back to the sender on the source chain. An empty float reverts,
///         which leaves the compose stored at the endpoint so anyone can retry after a top-up.
contract HopComposer is ILayerZeroComposer, Ownable {
    address public immutable endpoint;
    IOFT public immutable transit;
    uint32 public immutable eidA;
    uint32 public immutable eidB;

    uint256 public minHopLD;

    event Hopped(bytes32 indexed guid, uint32 srcEid, uint32 indexed finalEid, bytes32 finalTo, uint256 amountLD, bytes32 outGuid, uint256 fee);
    event Bounced(bytes32 indexed guid, uint32 indexed srcEid, bytes32 to, uint256 amountLD, bytes32 outGuid, uint256 fee);
    event MinHopSet(uint256 minHopLD);
    event EthWithdrawn(address to, uint256 amount);

    error OnlyEndpoint(address caller);
    error OnlyTransit(address from);
    error InsufficientFloat(uint256 balance, uint256 fee);

    constructor(address endpoint_, address transit_, uint32 eidA_, uint32 eidB_, uint256 minHopLD_, address owner_)
        Ownable(owner_)
    {
        endpoint = endpoint_;
        transit = IOFT(transit_);
        eidA = eidA_;
        eidB = eidB_;
        minHopLD = minHopLD_;
    }

    receive() external payable {}

    function lzCompose(address from, bytes32 guid, bytes calldata message, address, bytes calldata)
        external
        payable
        override
    {
        if (msg.sender != endpoint) revert OnlyEndpoint(msg.sender);
        if (from != address(transit)) revert OnlyTransit(from);
        uint32 srcEid = OFTComposeMsgCodec.srcEid(message);
        uint256 amountLD = OFTComposeMsgCodec.amountLD(message);
        bytes memory inner = OFTComposeMsgCodec.composeMsg(message);

        (bool valid, uint32 finalEid, bytes32 finalTo, uint256 minLD) = _parse(inner, srcEid, amountLD);
        SendParam memory p = valid
            ? SendParam(finalEid, finalTo, amountLD, minLD, "", "", "")
            : SendParam(srcEid, OFTComposeMsgCodec.composeFrom(message), amountLD, 0, "", "", "");
        MessagingFee memory fee = transit.quoteSend(p, false);
        if (address(this).balance < fee.nativeFee) revert InsufficientFloat(address(this).balance, fee.nativeFee);
        bytes32 outGuid = _send(p, fee);
        if (valid) emit Hopped(guid, srcEid, finalEid, finalTo, amountLD, outGuid, fee.nativeFee);
        else emit Bounced(guid, srcEid, p.to, amountLD, outGuid, fee.nativeFee);
    }

    function _send(SendParam memory p, MessagingFee memory fee) internal returns (bytes32) {
        (MessagingReceipt memory r,) = transit.send{value: fee.nativeFee}(p, fee, address(this));
        return r.guid;
    }

    function _parse(bytes memory inner, uint32 srcEid, uint256 amountLD)
        internal
        view
        returns (bool valid, uint32 finalEid, bytes32 finalTo, uint256 minLD)
    {
        if (inner.length != 96) return (false, 0, 0, 0);
        uint256 rawEid;
        (rawEid, finalTo, minLD) = abi.decode(inner, (uint256, bytes32, uint256));
        if (rawEid > type(uint32).max) return (false, 0, 0, 0);
        finalEid = uint32(rawEid);
        bool knownEid = finalEid == eidA || finalEid == eidB;
        valid = knownEid && finalEid != srcEid && finalTo != bytes32(0) && amountLD >= minHopLD && amountLD >= minLD;
    }

    function setMinHopLD(uint256 minHopLD_) external onlyOwner {
        minHopLD = minHopLD_;
        emit MinHopSet(minHopLD_);
    }

    function withdrawEth(address payable to, uint256 amount) external onlyOwner {
        (bool ok,) = to.call{value: amount}("");
        require(ok, "withdraw failed");
        emit EthWithdrawn(to, amount);
    }
}
