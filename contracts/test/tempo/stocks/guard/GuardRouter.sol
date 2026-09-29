// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {IPoolManager} from "v4-core/interfaces/IPoolManager.sol";
import {IUnlockCallback} from "v4-core/interfaces/callback/IUnlockCallback.sol";
import {PoolKey} from "v4-core/types/PoolKey.sol";
import {Currency} from "v4-core/types/Currency.sol";
import {BalanceDelta} from "v4-core/types/BalanceDelta.sol";
import {ModifyLiquidityParams, SwapParams} from "v4-core/types/PoolOperation.sol";
import {TickMath} from "v4-core/libraries/TickMath.sol";
import {ITIP20} from "tempo-std/interfaces/ITIP20.sol";

/// Test router over the real PoolManager runtime (our MIT stand-in for v4-core's UNLICENSED PoolSwapTest /
/// PoolModifyLiquidityTest): swaps with the extreme price limits UniversalRouter uses (the reason the guard needs an
/// afterSwap check, F-C) and adds/removes liquidity from its own balances; settlement is sync → transfer → settle.
contract GuardRouter is IUnlockCallback {
    IPoolManager internal immutable pm;

    enum Op {
        SWAP,
        LIQUIDITY
    }

    constructor(IPoolManager pm_) {
        pm = pm_;
    }

    function swapExactIn(PoolKey calldata key, bool zeroForOne, uint256 amountIn) external returns (BalanceDelta) {
        uint160 limit = zeroForOne ? TickMath.MIN_SQRT_PRICE + 1 : TickMath.MAX_SQRT_PRICE - 1;
        // forge-lint: disable-next-line(unsafe-typecast)
        SwapParams memory p = SwapParams(zeroForOne, -int256(amountIn), limit);
        return abi.decode(pm.unlock(abi.encode(Op.SWAP, key, abi.encode(p))), (BalanceDelta));
    }

    function addLiquidity(PoolKey calldata key, int24 lower, int24 upper, int256 liquidity) external returns (BalanceDelta) {
        return _modify(key, lower, upper, liquidity);
    }

    function removeLiquidity(PoolKey calldata key, int24 lower, int24 upper, int256 liquidity) external returns (BalanceDelta) {
        return _modify(key, lower, upper, -liquidity);
    }

    function _modify(PoolKey calldata key, int24 lower, int24 upper, int256 liquidity) internal returns (BalanceDelta) {
        ModifyLiquidityParams memory p = ModifyLiquidityParams(lower, upper, liquidity, 0);
        return abi.decode(pm.unlock(abi.encode(Op.LIQUIDITY, key, abi.encode(p))), (BalanceDelta));
    }

    function unlockCallback(bytes calldata data) external returns (bytes memory) {
        require(msg.sender == address(pm), "only PM");
        (Op op, PoolKey memory key, bytes memory inner) = abi.decode(data, (Op, PoolKey, bytes));
        BalanceDelta d;
        if (op == Op.SWAP) d = pm.swap(key, abi.decode(inner, (SwapParams)), "");
        else (d,) = pm.modifyLiquidity(key, abi.decode(inner, (ModifyLiquidityParams)), "");
        _settle(key.currency0, d.amount0());
        _settle(key.currency1, d.amount1());
        return abi.encode(d);
    }

    function _settle(Currency c, int128 delta) internal {
        if (delta < 0) {
            pm.sync(c);
            ITIP20(Currency.unwrap(c)).transfer(address(pm), uint128(-delta));
            pm.settle();
        } else if (delta > 0) {
            pm.take(c, address(this), uint128(delta));
        }
    }
}
