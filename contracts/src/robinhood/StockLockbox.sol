// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {OFTAdapter} from "@layerzerolabs/oft-evm/contracts/OFTAdapter.sol";
import {SendParam, MessagingFee, MessagingReceipt, OFTReceipt} from "@layerzerolabs/oft-evm/contracts/interfaces/IOFT.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {BridgeRateLimiter} from "../common/BridgeRateLimiter.sol";

/// @title StockLockbox — holds real Robinhood Stock Tokens while their mirrors exist elsewhere (plan B.1.2, D-020).
/// @notice Immutable (no proxy on the side that holds real assets); one per ticker. Locks go out as standard OFT
///         messages (18 dp → shared 6, dust stays with the sender). Unlocks never strand: if the Stock Token refuses the
///         transfer (paused, recipient blocked) the amount becomes `owed` to the recipient, who can `claim` it later or
///         `resendOwed` it back across. Unlocks are bounded per source eid by what was locked towards it (`outstanding`);
///         a forged over-release reverts and stays stuck in the endpoint — intended.
contract StockLockbox is OFTAdapter {
    using SafeERC20 for IERC20;
    using BridgeRateLimiter for BridgeRateLimiter.Bucket;

    uint256 public constant MIN_UNLOCK_GAS = 120_000;

    address public guardian;
    bool public locksPaused;
    uint256 public minLockLD;
    mapping(address => uint256) public owed;
    uint256 public totalOwed;
    mapping(uint32 eid => uint256) public outstanding;
    uint256 public totalOutstanding;
    mapping(uint32 eid => BridgeRateLimiter.Bucket) internal _outboundLimit;

    event UnlockDeferred(address indexed to, uint32 indexed srcEid, uint256 amountLD, bytes reason);
    event OwedClaimed(address indexed to, uint256 amountLD);
    event OwedResent(address indexed from, bytes32 indexed guid, uint32 indexed dstEid, uint256 amountLD);
    event LocksPaused(bool paused, address by);
    event GuardianSet(address guardian);
    event RateLimitSet(uint32 indexed eid, uint128 capacity, uint64 window);
    event MinLockSet(uint256 minLockLD);

    error NotGuardian();
    error LocksArePaused();
    error BelowMinLock(uint256 amountLD, uint256 minLD);
    error InsufficientGas(uint256 left, uint256 needed);
    error OverRelease(uint32 srcEid, uint256 amountLD, uint256 outstandingLD);
    error NothingOwed();
    error ExceedsOwed(uint256 amountLD, uint256 owedLD);
    error OnlyLower(uint128 current, uint128 requested);

    constructor(address stock, address endpoint_, address owner_, address guardian_, uint256 minLockLD_)
        OFTAdapter(stock, endpoint_, owner_)
        Ownable(owner_)
    {
        guardian = guardian_;
        minLockLD = minLockLD_;
        emit GuardianSet(guardian_);
    }

    modifier onlyGuardianOrOwner() {
        if (msg.sender != guardian && msg.sender != owner()) revert NotGuardian();
        _;
    }

    // ─── lock (outbound) ─────────────────────────────────────────────────

    function _debit(address from, uint256 amountLD, uint256 minAmountLD, uint32 dstEid)
        internal
        override
        returns (uint256 amountSentLD, uint256 amountReceivedLD)
    {
        if (locksPaused) revert LocksArePaused();
        if (amountLD < minLockLD) revert BelowMinLock(amountLD, minLockLD);
        (amountSentLD, amountReceivedLD) = _debitView(amountLD, minAmountLD, dstEid);
        _outboundLimit[dstEid].consume(amountSentLD);
        outstanding[dstEid] += amountSentLD;
        totalOutstanding += amountSentLD;
        innerToken.safeTransferFrom(from, address(this), amountSentLD);
    }

    // ─── unlock (inbound) ────────────────────────────────────────────────

    function _credit(address to, uint256 amountLD, uint32 srcEid) internal override returns (uint256) {
        if (gasleft() < MIN_UNLOCK_GAS) revert InsufficientGas(gasleft(), MIN_UNLOCK_GAS);
        uint256 out = outstanding[srcEid];
        if (amountLD > out) revert OverRelease(srcEid, amountLD, out);
        outstanding[srcEid] = out - amountLD;
        totalOutstanding -= amountLD;
        (bool ok, bytes memory ret) =
            address(innerToken).call(abi.encodeCall(IERC20.transfer, (to, amountLD)));
        if (!ok || (ret.length != 0 && (ret.length != 32 || !abi.decode(ret, (bool))))) {
            owed[to] += amountLD;
            totalOwed += amountLD;
            emit UnlockDeferred(to, srcEid, amountLD, ret);
        }
        return amountLD;
    }

    /// @notice Pull what an unlock could not deliver (e.g. after the token unpauses or the block is lifted).
    function claim() external {
        uint256 amount = owed[msg.sender];
        if (amount == 0) revert NothingOwed();
        owed[msg.sender] = 0;
        totalOwed -= amount;
        innerToken.safeTransfer(msg.sender, amount);
        emit OwedClaimed(msg.sender, amount);
    }

    /// @notice Send an owed amount back across without it ever touching the (blocked) caller's wallet here.
    /// @dev Mirrors OFTCore `_send`, minus the debit: the tokens already sit in the lockbox. Rate limit and
    ///      `outstanding` apply exactly as for a fresh lock; pausing locks does not trap owed funds.
    function resendOwed(SendParam calldata sendParam, MessagingFee calldata fee, address refundAddress)
        external
        payable
        returns (MessagingReceipt memory msgReceipt, OFTReceipt memory oftReceipt)
    {
        (uint256 sent, uint256 received) = _debitView(sendParam.amountLD, sendParam.minAmountLD, sendParam.dstEid);
        uint256 have = owed[msg.sender];
        if (sent > have) revert ExceedsOwed(sent, have);
        owed[msg.sender] = have - sent;
        totalOwed -= sent;
        _outboundLimit[sendParam.dstEid].consume(sent);
        outstanding[sendParam.dstEid] += sent;
        totalOutstanding += sent;
        (bytes memory message, bytes memory options) = _buildMsgAndOptions(sendParam, received);
        msgReceipt = _lzSend(sendParam.dstEid, message, options, fee, refundAddress);
        oftReceipt = OFTReceipt(sent, received);
        emit OFTSent(msgReceipt.guid, sendParam.dstEid, msg.sender, sent, received);
        emit OwedResent(msg.sender, msgReceipt.guid, sendParam.dstEid, sent);
    }

    // ─── admin ───────────────────────────────────────────────────────────

    function setGuardian(address guardian_) external onlyOwner {
        guardian = guardian_;
        emit GuardianSet(guardian_);
    }

    /// @notice The guardian can only pause; unpausing is the owner's. Pausing never blocks unlocks.
    function pauseLocks(bool paused) external onlyGuardianOrOwner {
        if (!paused && msg.sender != owner()) revert OwnableUnauthorizedAccount(msg.sender);
        locksPaused = paused;
        emit LocksPaused(paused, msg.sender);
    }

    function setRateLimits(uint32 eid, uint128 capacity, uint64 window) external onlyOwner {
        _outboundLimit[eid].set(capacity, window);
        emit RateLimitSet(eid, capacity, window);
    }

    function lowerRateLimit(uint32 eid, uint128 capacity) external onlyGuardianOrOwner {
        BridgeRateLimiter.Bucket storage b = _outboundLimit[eid];
        if (capacity > b.capacity) revert OnlyLower(b.capacity, capacity);
        b.set(capacity, b.window);
        emit RateLimitSet(eid, capacity, b.window);
    }

    function setMinLock(uint256 minLockLD_) external onlyOwner {
        minLockLD = minLockLD_;
        emit MinLockSet(minLockLD_);
    }

    // ─── views ───────────────────────────────────────────────────────────

    function outboundLimit(uint32 eid)
        external
        view
        returns (uint128 capacity, uint256 inFlight, uint256 available, uint64 window)
    {
        BridgeRateLimiter.Bucket storage b = _outboundLimit[eid];
        return (b.capacity, b.currentInFlight(), b.available(), b.window);
    }

    /// @notice Conservation view: `locked` must be ≥ `totalOutstanding + totalOwed` (donations make it larger).
    function reserveView() external view returns (uint256 locked, uint256 outstandingLD, uint256 owedLD) {
        return (innerToken.balanceOf(address(this)), totalOutstanding, totalOwed);
    }
}
