// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Ownable, Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {ReentrancyGuardTransient} from "@openzeppelin/contracts/utils/ReentrancyGuardTransient.sol";
import {ITIP20} from "tempo-std/interfaces/ITIP20.sol";
import {ITIP403Registry} from "tempo-std/interfaces/ITIP403Registry.sol";
import {StdPrecompiles} from "tempo-std/StdPrecompiles.sol";
import {LpSplit} from "./CurveTypes.sol";
import {IPositionManagerLite, ILiquidityLocker} from "./interfaces/ILaunchDeps.sol";

/// @title LiquidityLocker
/// @notice Holds each graduated memecoin's full-range Uniswap v4 position (one NFT per coin) and splits it into six
///         buckets (plan B.5.2, DBC's model): partner and creator × unlocked | permanently locked | vesting. Locked
///         liquidity is never withdrawable; vesting unlocks linearly from graduation once the cliff has passed. LP fees
///         of the whole position accrue to partner and creator in proportion to the liquidity each still has in it.
/// @dev Fees are collected with `DECREASE_LIQUIDITY(0) + TAKE_PAIR` (v4-periphery PositionManager docs), principal with
///      `DECREASE_LIQUIDITY(n) + TAKE_PAIR`, both into this contract; payouts go to `msg.sender` only, each after a
///      receive-policy pre-check. Nothing is payable.
contract LiquidityLocker is ILiquidityLocker, Ownable2Step, ReentrancyGuardTransient {
    address public constant PATH_USD = 0x20C0000000000000000000000000000000000000;
    IPositionManagerLite public constant POSITION_MANAGER = IPositionManagerLite(0x3Fc79444F8EACc1894775493Ff3Fa41f1e35Ce11);
    ITIP403Registry internal constant TIP403 = StdPrecompiles.TIP403_REGISTRY;
    uint8 internal constant DECREASE_LIQUIDITY = 0x01;
    uint8 internal constant TAKE_PAIR = 0x11;
    uint256 internal constant BPS = 10_000;

    /// Buckets: 0 partner unlocked, 1 partner locked, 2 partner vesting, 3 creator unlocked, 4 creator locked,
    /// 5 creator vesting.
    enum Bucket {
        PartnerUnlocked,
        PartnerLocked,
        PartnerVesting,
        CreatorUnlocked,
        CreatorLocked,
        CreatorVesting
    }

    struct Lock {
        uint256 positionId;
        address partner;
        address creator;
        uint40 start;
        uint32 cliff;
        uint32 duration;
        uint128[6] allotted;
        uint128[6] withdrawn;
    }

    struct Owed {
        uint256 quote;
        uint256 coin;
    }

    address public launchpad;
    mapping(address coin => Lock) internal _locks;
    mapping(address coin => mapping(address account => Owed)) public feesOwed;

    event LaunchpadSet(address launchpad);
    event Registered(address indexed coin, uint256 positionId, uint128 liquidity, address partner, address creator);
    event FeesCollected(address indexed coin, uint256 quote, uint256 coin_);
    event Withdrawn(address indexed coin, address indexed account, Bucket bucket, uint128 liquidity, uint256 quote, uint256 coin_);
    event FeesClaimed(address indexed coin, address indexed account, uint256 quote, uint256 coin_);

    error NotLaunchpad(address caller);
    error LaunchpadAlreadySet();
    error AlreadyRegistered(address coin);
    error NotRegistered(address coin);
    error NotPositionOwner(uint256 positionId);
    error NotBucketOwner(address caller, Bucket bucket);
    error BucketLocked(Bucket bucket);
    error NothingToWithdraw();
    error NothingToClaim();
    error ReceivePolicyBlocks(address token, address recipient);
    error ZeroAddress();

    constructor(address initialOwner) Ownable(initialOwner) {}

    /// @notice Binds the CurveLaunchpad, once (the launchpad takes this locker in its constructor).
    function setLaunchpad(address launchpad_) external onlyOwner {
        if (launchpad_ == address(0)) revert ZeroAddress();
        if (launchpad != address(0)) revert LaunchpadAlreadySet();
        launchpad = launchpad_;
        emit LaunchpadSet(launchpad_);
    }

    /// @inheritdoc ILiquidityLocker
    function register(
        address coin,
        uint256 positionId,
        uint128 liquidity,
        address partner,
        address creator,
        LpSplit calldata split,
        uint32 vestingCliff,
        uint32 vestingDuration
    ) external {
        if (msg.sender != launchpad) revert NotLaunchpad(msg.sender);
        if (_locks[coin].positionId != 0) revert AlreadyRegistered(coin);
        if (POSITION_MANAGER.ownerOf(positionId) != address(this)) revert NotPositionOwner(positionId);
        Lock storage k = _locks[coin];
        k.positionId = positionId;
        k.partner = partner;
        k.creator = creator;
        k.start = uint40(block.timestamp);
        k.cliff = vestingCliff;
        k.duration = vestingDuration;
        uint16[6] memory bps = [
            split.partnerUnlocked, split.partnerLocked, split.partnerVesting, split.creatorUnlocked, split.creatorLocked, split.creatorVesting
        ];
        // Floors; the rounding dust stays in the position for good (it behaves like locked liquidity).
        for (uint256 i; i < 6; i++) k.allotted[i] = uint128(uint256(liquidity) * bps[i] / BPS);
        emit Registered(coin, positionId, liquidity, partner, creator);
    }

    /// @notice Withdraws what `bucket` has unlocked so far to the caller (the bucket's partner or creator).
    function withdraw(address coin, Bucket bucket) external nonReentrant returns (uint256 quote, uint256 coinOut) {
        Lock storage k = _lock(coin);
        if (msg.sender != _ownerOf(k, bucket)) revert NotBucketOwner(msg.sender, bucket);
        if (bucket == Bucket.PartnerLocked || bucket == Bucket.CreatorLocked) revert BucketLocked(bucket);
        uint128 amount = withdrawable(coin, bucket);
        if (amount == 0) revert NothingToWithdraw();
        _checkReceive(PATH_USD, msg.sender);
        _checkReceive(coin, msg.sender);
        _collect(coin, k); // fees first, split by the liquidity each party had until now
        k.withdrawn[uint8(bucket)] += amount;
        (quote, coinOut) = _modify(coin, k.positionId, amount);
        ITIP20(PATH_USD).transfer(msg.sender, quote);
        ITIP20(coin).transfer(msg.sender, coinOut);
        emit Withdrawn(coin, msg.sender, bucket, amount, quote, coinOut);
    }

    /// @notice Collects the position's LP fees and pays the caller's share (both currencies).
    function claimFees(address coin) external nonReentrant returns (uint256 quote, uint256 coinOut) {
        Lock storage k = _lock(coin);
        _collect(coin, k);
        Owed memory o = feesOwed[coin][msg.sender];
        if (o.quote == 0 && o.coin == 0) revert NothingToClaim();
        _checkReceive(PATH_USD, msg.sender);
        _checkReceive(coin, msg.sender);
        delete feesOwed[coin][msg.sender];
        if (o.quote != 0) ITIP20(PATH_USD).transfer(msg.sender, o.quote);
        if (o.coin != 0) ITIP20(coin).transfer(msg.sender, o.coin);
        emit FeesClaimed(coin, msg.sender, o.quote, o.coin);
        return (o.quote, o.coin);
    }

    // ── views ─────────────────────────────────────────────────────────────────────────────────────────────────────

    function lockOf(address coin) external view returns (Lock memory) {
        return _locks[coin];
    }

    /// @notice Liquidity `bucket` can withdraw now (0 for locked buckets).
    function withdrawable(address coin, Bucket bucket) public view returns (uint128) {
        Lock storage k = _locks[coin];
        uint8 b = uint8(bucket);
        if (bucket == Bucket.PartnerLocked || bucket == Bucket.CreatorLocked) return 0;
        uint256 unlocked = k.allotted[b];
        if (bucket == Bucket.PartnerVesting || bucket == Bucket.CreatorVesting) {
            uint256 elapsed = block.timestamp - k.start;
            if (elapsed < k.cliff) return 0;
            if (elapsed < k.duration) unlocked = unlocked * elapsed / k.duration;
        }
        return uint128(unlocked - k.withdrawn[b]);
    }

    /// @notice Liquidity partner and creator still have in the position (fees accrue pro rata).
    function remaining(address coin) public view returns (uint256 partner, uint256 creator) {
        Lock storage k = _locks[coin];
        for (uint256 i; i < 3; i++) partner += k.allotted[i] - k.withdrawn[i];
        for (uint256 i = 3; i < 6; i++) creator += k.allotted[i] - k.withdrawn[i];
    }

    // ── internals ─────────────────────────────────────────────────────────────────────────────────────────────────

    function _lock(address coin) internal view returns (Lock storage k) {
        k = _locks[coin];
        if (k.positionId == 0) revert NotRegistered(coin);
    }

    function _ownerOf(Lock storage k, Bucket bucket) internal view returns (address) {
        return uint8(bucket) < 3 ? k.partner : k.creator;
    }

    function _collect(address coin, Lock storage k) internal {
        (uint256 quote, uint256 coinFees) = _modify(coin, k.positionId, 0);
        if (quote == 0 && coinFees == 0) return;
        (uint256 p, uint256 c) = remaining(coin);
        uint256 total = p + c;
        uint256 pq = total == 0 ? quote : quote * p / total;
        uint256 pc = total == 0 ? coinFees : coinFees * p / total;
        feesOwed[coin][k.partner].quote += pq;
        feesOwed[coin][k.partner].coin += pc;
        feesOwed[coin][k.creator].quote += quote - pq;
        feesOwed[coin][k.creator].coin += coinFees - pc;
        emit FeesCollected(coin, quote, coinFees);
    }

    /// @dev `DECREASE_LIQUIDITY(positionId, liquidity) + TAKE_PAIR(pathUSD, coin, this)`; returns what arrived.
    function _modify(address coin, uint256 positionId, uint128 liquidity) internal returns (uint256 quote, uint256 coinOut) {
        bytes[] memory params = new bytes[](2);
        params[0] = abi.encode(positionId, uint256(liquidity), uint128(0), uint128(0), bytes(""));
        params[1] = abi.encode(PATH_USD, coin, address(this));
        uint256 q0 = ITIP20(PATH_USD).balanceOf(address(this));
        uint256 c0 = ITIP20(coin).balanceOf(address(this));
        POSITION_MANAGER.modifyLiquidities(abi.encode(abi.encodePacked(DECREASE_LIQUIDITY, TAKE_PAIR), params), block.timestamp);
        quote = ITIP20(PATH_USD).balanceOf(address(this)) - q0;
        coinOut = ITIP20(coin).balanceOf(address(this)) - c0;
    }

    function _checkReceive(address token, address recipient) internal view {
        (bool ok,) = TIP403.validateReceivePolicy(token, address(this), recipient);
        if (!ok) revert ReceivePolicyBlocks(token, recipient);
    }
}
