// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {ITIP20} from "tempo-std/interfaces/ITIP20.sol";
import {ITIP20RolesAuth} from "tempo-std/interfaces/ITIP20RolesAuth.sol";
import {IAllowanceTransfer} from "permit2/src/interfaces/IAllowanceTransfer.sol";
import {IPoolManager} from "v4-core/interfaces/IPoolManager.sol";
import {IHooks} from "v4-core/interfaces/IHooks.sol";
import {PoolKey} from "v4-core/types/PoolKey.sol";
import {PoolId} from "v4-core/types/PoolId.sol";
import {Currency} from "v4-core/types/Currency.sol";
import {BalanceDelta} from "v4-core/types/BalanceDelta.sol";
import {SwapParams} from "v4-core/types/PoolOperation.sol";
import {StateLibrary} from "v4-core/libraries/StateLibrary.sol";
import {TickMath} from "v4-core/libraries/TickMath.sol";
import {SqrtPriceMath} from "v4-core/libraries/SqrtPriceMath.sol";
import {LiquidityAmounts} from "v4-periphery/libraries/LiquidityAmounts.sol";
import {Config, Launch, LaunchState, Graduation} from "./CurveTypes.sol";
import {CurveConfigLib} from "./CurveConfigLib.sol";
import {IPositionManagerLite, PoolKeyLite, ILiquidityLocker} from "./interfaces/ILaunchDeps.sol";

/// @notice The launchpad's pathUSD books: fees owed per account and the totals the invariants check.
struct Ledger {
    mapping(address account => uint256) owed;
    uint256 totalOwed;
    uint256 totalReserve;
}

/// @title CurveGraduationLib
/// @notice `graduate` for the CurveLaunchpad (plan B.5.2), delegatecalled so its bytecode lives outside the launchpad.
///         Order: state guard → 0.2 % protocol + migration fee → policy → 1 → target `sqrtV4 = 2^192 / sqrtCurve` →
///         pick a tier: a fresh pool, or an already-initialised one pushed to the target by a corrective swap that
///         spends ≤ 10 % of the migration coin (else the next tier; all three poisoned → `PoolPoisoned`) → Permit2
///         approvals → `PositionManager.multicall([initializePool, modifyLiquidities(MINT_POSITION full range → locker,
///         SETTLE_PAIR)])` → `locker.register` → leftover minted for its receiver → renounce ISSUER + admin → Graduated.
/// @dev v4 flow per chain-libs.md §4 (`sync → transfer → settle`, `take`); PositionManager actions per the v4-periphery
///      docs (MINT_POSITION + SETTLE_PAIR, real `amount0Max/amount1Max`). Before graduation the coin's compound policy
///      keeps it out of the PoolManager, so a pre-initialised pool can only hold pathUSD above its price: raising the
///      price sells coin into that liquidity (the squatter buys at worse than the curve price), lowering it crosses no
///      liquidity at all.
library CurveGraduationLib {
    using StateLibrary for IPoolManager;

    address internal constant POOL_MANAGER = 0x33620f62C5b9B2086dD6b62F4A297A9f30347029;
    address internal constant POSITION_MANAGER = 0x3Fc79444F8EACc1894775493Ff3Fa41f1e35Ce11;
    IAllowanceTransfer internal constant PERMIT2 = IAllowanceTransfer(0x000000000022D473030F116dDEE9F6B43aC78BA3);
    address internal constant PATH_USD = 0x20C0000000000000000000000000000000000000;
    uint256 internal constant BPS = 10_000;
    uint8 internal constant MINT_POSITION = 0x02;
    uint8 internal constant SETTLE_PAIR = 0x0d;
    /// @dev Transient flag: a corrective unlock is in flight (set by `graduate`, checked by `onUnlock`).
    bytes32 private constant EXPECT_UNLOCK = keccak256("mitoshi.curve.graduation.expectUnlock");

    event PoolCorrected(address indexed token, uint8 tier, uint256 quotePaid, uint256 quoteReceived, uint256 coinPaid);
    event TierSkipped(address indexed token, uint8 tier, bytes reason);
    event Graduated(
        address indexed token, uint8 tier, uint256 positionId, uint128 liquidity, uint160 sqrtPriceX96, uint256 quoteToPool, uint256 coinToPool, uint256 leftover
    );

    error PoolPoisoned(address token);
    error UnexpectedUnlock();
    error CorrectionShort(uint160 reached, uint160 target);
    error LockerNotOwner(uint256 positionId);
    error PositionOverspent();

    struct Step {
        address token;
        uint160 target;
        uint256 avail;
        uint8 tier;
        bool fresh;
    }

    function graduate(
        Launch storage l,
        Config storage c,
        Graduation storage g,
        Ledger storage ledger,
        address treasury,
        address locker
    ) external returns (uint256 positionId) {
        Step memory s;
        s.token = l.token;
        uint256 quote = l.quoteReserve;
        l.quoteReserve = 0;
        l.state = LaunchState.Graduated;
        ledger.totalReserve -= quote;

        // Fees out of the migration quote: 0.2 % protocol + the config's migration fee (partner/creator by share).
        uint256 protocolCut = quote * CurveConfigLib.PROTOCOL_MIGRATION_BPS / BPS;
        uint256 migrationCut = quote * c.migrationFeeBps / BPS;
        _owe(ledger, treasury, protocolCut);
        _splitPartnerCreator(ledger, c, l.creator, migrationCut);
        s.avail = quote - protocolCut - migrationCut;

        ITIP20(s.token).changeTransferPolicyId(1);
        s.target = CurveConfigLib.v4SqrtPrice(l.sqrtPriceX96);
        _pickTier(c, s);

        uint128 liquidity;
        uint256 quoteUsed;
        uint256 coinUsed;
        (positionId, liquidity, quoteUsed, coinUsed) = _mintPosition(c, s, locker);
        ILiquidityLocker(locker).register(
            s.token, positionId, liquidity, c.partner, l.creator, c.split, c.vestingCliff, c.vestingDuration
        );
        // pathUSD the position did not take (ratio rounding, corrective-swap proceeds) goes to partner/creator.
        _splitPartnerCreator(ledger, c, l.creator, s.avail - quoteUsed);

        uint256 leftover = c.totalSupply - ITIP20(s.token).totalSupply();
        if (leftover != 0) ITIP20(s.token).mint(address(this), leftover);
        ITIP20RolesAuth(s.token).renounceRole(ITIP20(s.token).ISSUER_ROLE());
        ITIP20RolesAuth(s.token).renounceRole(bytes32(0));

        g.tier = s.tier;
        g.graduatedAt = uint40(block.timestamp);
        g.positionId = positionId;
        g.liquidity = liquidity;
        g.leftover = leftover;
        emit Graduated(s.token, s.tier, positionId, liquidity, s.target, quoteUsed, coinUsed, leftover);
    }

    /// @notice The corrective swap inside `PoolManager.unlock` (reached via the launchpad's `unlockCallback`).
    function onUnlock(bytes calldata data) external returns (bytes memory) {
        if (_tload(EXPECT_UNLOCK) == 0) revert UnexpectedUnlock();
        (PoolKey memory key, uint160 target, uint256 maxCoin, uint256 maxQuote) =
            abi.decode(data, (PoolKey, uint160, uint256, uint256));
        IPoolManager pm = IPoolManager(POOL_MANAGER);
        (uint160 sqrtNow,,,) = pm.getSlot0(key.toId());
        bool zeroForOne = target < sqrtNow; // pathUSD in lowers the v4 price (coin per pathUSD)
        uint256 amountIn = zeroForOne ? maxQuote : maxCoin;
        BalanceDelta d = pm.swap(key, SwapParams(zeroForOne, -int256(amountIn), target), "");
        (uint160 reached,,,) = pm.getSlot0(key.toId());
        if (reached != target) revert CorrectionShort(reached, target);

        address coin = Currency.unwrap(key.currency1);
        (uint256 quotePaid, uint256 quoteGot) = _settleOrTake(pm, PATH_USD, d.amount0(), false);
        (uint256 coinPaid, uint256 coinGot) = _settleOrTake(pm, coin, d.amount1(), true);
        if (coinGot != 0) ITIP20(coin).burn(coinGot);
        return abi.encode(quotePaid, quoteGot, coinPaid);
    }

    // ── internals ─────────────────────────────────────────────────────────────────────────────────────────────────

    function _pickTier(Config storage c, Step memory s) private {
        IPoolManager pm = IPoolManager(POOL_MANAGER);
        for (uint8 t; t < 3; t++) {
            PoolKey memory key = _key(s.token, c.poolFees[t], c.tickSpacings[t]);
            (uint160 sqrtNow,,,) = pm.getSlot0(key.toId());
            if (sqrtNow == 0 || sqrtNow == s.target) {
                (s.tier, s.fresh) = (t, sqrtNow == 0);
                return;
            }
            uint256 maxCoin = c.migrationCoinAmount / CurveConfigLib.CORRECTION_DIVISOR;
            uint256 maxQuote = s.avail / CurveConfigLib.CORRECTION_DIVISOR;
            _tstore(EXPECT_UNLOCK, 1);
            try pm.unlock(abi.encode(key, s.target, maxCoin, maxQuote)) returns (bytes memory r) {
                _tstore(EXPECT_UNLOCK, 0);
                (uint256 quotePaid, uint256 quoteGot, uint256 coinPaid) = abi.decode(r, (uint256, uint256, uint256));
                s.avail = s.avail + quoteGot - quotePaid;
                s.tier = t;
                emit PoolCorrected(s.token, t, quotePaid, quoteGot, coinPaid);
                return;
            } catch (bytes memory reason) {
                _tstore(EXPECT_UNLOCK, 0);
                emit TierSkipped(s.token, t, reason);
            }
        }
        revert PoolPoisoned(s.token);
    }

    function _mintPosition(Config storage c, Step memory s, address locker)
        private
        returns (uint256 positionId, uint128 liquidity, uint256 quoteUsed, uint256 coinUsed)
    {
        int24 ts = c.tickSpacings[s.tier];
        PoolKey memory key = _key(s.token, c.poolFees[s.tier], ts);
        int24 tickLower = TickMath.minUsableTick(ts);
        int24 tickUpper = TickMath.maxUsableTick(ts);
        uint160 sqrtA = TickMath.getSqrtPriceAtTick(tickLower);
        uint160 sqrtB = TickMath.getSqrtPriceAtTick(tickUpper);
        uint256 coinBudget = c.migrationCoinAmount;
        liquidity = LiquidityAmounts.getLiquidityForAmounts(s.target, sqrtA, sqrtB, s.avail, coinBudget);
        uint256 amount0 = SqrtPriceMath.getAmount0Delta(s.target, sqrtB, liquidity, true);
        uint256 amount1 = SqrtPriceMath.getAmount1Delta(sqrtA, s.target, liquidity, true);
        while (amount0 > s.avail || amount1 > coinBudget) {
            liquidity--;
            amount0 = SqrtPriceMath.getAmount0Delta(s.target, sqrtB, liquidity, true);
            amount1 = SqrtPriceMath.getAmount1Delta(sqrtA, s.target, liquidity, true);
        }

        ITIP20(s.token).mint(address(this), amount1);
        ITIP20(PATH_USD).approve(address(PERMIT2), amount0);
        ITIP20(s.token).approve(address(PERMIT2), amount1);
        PERMIT2.approve(PATH_USD, POSITION_MANAGER, uint160(amount0), 0); // expires this block
        PERMIT2.approve(s.token, POSITION_MANAGER, uint160(amount1), 0);

        IPositionManagerLite posm = IPositionManagerLite(POSITION_MANAGER);
        positionId = posm.nextTokenId();
        bytes[] memory params = new bytes[](2);
        params[0] = abi.encode(key, tickLower, tickUpper, uint256(liquidity), uint128(amount0), uint128(amount1), locker, bytes(""));
        params[1] = abi.encode(key.currency0, key.currency1);
        bytes memory unlockData = abi.encode(abi.encodePacked(MINT_POSITION, SETTLE_PAIR), params);
        bytes[] memory calls = new bytes[](s.fresh ? 2 : 1);
        if (s.fresh) {
            calls[0] = abi.encodeCall(IPositionManagerLite.initializePool, (_lite(key), s.target));
        }
        calls[calls.length - 1] = abi.encodeCall(IPositionManagerLite.modifyLiquidities, (unlockData, block.timestamp));

        uint256 quoteBefore = ITIP20(PATH_USD).balanceOf(address(this));
        uint256 coinBefore = ITIP20(s.token).balanceOf(address(this));
        posm.multicall(calls);
        quoteUsed = quoteBefore - ITIP20(PATH_USD).balanceOf(address(this));
        coinUsed = coinBefore - ITIP20(s.token).balanceOf(address(this));
        if (quoteUsed > amount0 || coinUsed > amount1) revert PositionOverspent();
        if (posm.ownerOf(positionId) != locker) revert LockerNotOwner(positionId);
        if (coinUsed < amount1) ITIP20(s.token).burn(amount1 - coinUsed);
        (uint160 sqrtAfter,,,) = IPoolManager(POOL_MANAGER).getSlot0(key.toId());
        if (sqrtAfter != s.target) revert CorrectionShort(sqrtAfter, s.target);
    }

    /// @dev Pays a negative delta (`sync → transfer → settle`; coin is minted first) or takes a positive one.
    function _settleOrTake(IPoolManager pm, address currency, int128 delta, bool mintFirst)
        private
        returns (uint256 paid, uint256 got)
    {
        if (delta < 0) {
            paid = uint256(uint128(-delta));
            if (mintFirst) ITIP20(currency).mint(address(this), paid);
            pm.sync(Currency.wrap(currency));
            ITIP20(currency).transfer(POOL_MANAGER, paid);
            pm.settle();
        } else if (delta > 0) {
            got = uint256(uint128(delta));
            pm.take(Currency.wrap(currency), address(this), got);
        }
    }

    function _splitPartnerCreator(Ledger storage ledger, Config storage c, address creator, uint256 amount) private {
        if (amount == 0) return;
        uint256 shares = uint256(c.partnerShareBps) + c.creatorShareBps;
        uint256 toPartner = shares == 0 ? amount : amount * c.partnerShareBps / shares;
        _owe(ledger, c.partner, toPartner);
        _owe(ledger, creator, amount - toPartner);
    }

    function _owe(Ledger storage ledger, address account, uint256 amount) private {
        if (amount == 0) return;
        ledger.owed[account] += amount;
        ledger.totalOwed += amount;
    }

    function _key(address coin, uint24 fee, int24 tickSpacing) private pure returns (PoolKey memory) {
        return PoolKey(Currency.wrap(PATH_USD), Currency.wrap(coin), fee, tickSpacing, IHooks(address(0)));
    }

    function _lite(PoolKey memory k) private pure returns (PoolKeyLite memory) {
        return PoolKeyLite(Currency.unwrap(k.currency0), Currency.unwrap(k.currency1), k.fee, k.tickSpacing, address(k.hooks));
    }

    function _tstore(bytes32 slot, uint256 v) private {
        assembly ("memory-safe") {
            tstore(slot, v)
        }
    }

    function _tload(bytes32 slot) private view returns (uint256 v) {
        assembly ("memory-safe") {
            v := tload(slot)
        }
    }
}
