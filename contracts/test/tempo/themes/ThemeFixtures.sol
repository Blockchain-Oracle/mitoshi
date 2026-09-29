// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {IHooks} from "v4-core/interfaces/IHooks.sol";
import {IPoolManager} from "v4-core/interfaces/IPoolManager.sol";
import {IUnlockCallback} from "v4-core/interfaces/callback/IUnlockCallback.sol";
import {PoolKey} from "v4-core/types/PoolKey.sol";
import {PoolId} from "v4-core/types/PoolId.sol";
import {Currency} from "v4-core/types/Currency.sol";
import {BalanceDelta} from "v4-core/types/BalanceDelta.sol";
import {BeforeSwapDelta} from "v4-core/types/BeforeSwapDelta.sol";
import {ModifyLiquidityParams, SwapParams} from "v4-core/types/PoolOperation.sol";
import {ITIP20} from "tempo-std/interfaces/ITIP20.sol";
import {IThemeOracle} from "../../../src/themes/interfaces/IThemeOracle.sol";

/// Stand-in for the StockGuardHook (S15b) in theme tests: the real hook's permission bits (0x20C0: beforeInitialize,
/// beforeSwap, afterSwap) so PoolManager calls it on every swap, `registerPool` → `isGuardedPool`, and a switch that
/// refuses swaps the way an out-of-band or halted guard does.
contract FixtureGuard {
    mapping(PoolId => bool) public registered;
    bool public refuse;

    error GuardRefused();

    function registerPool(PoolKey calldata key) external {
        registered[key.toId()] = true;
    }

    function setRefuse(bool refuse_) external {
        refuse = refuse_;
    }

    function isGuardedPool(PoolKey calldata key) external view returns (bool) {
        return registered[key.toId()];
    }

    function beforeInitialize(address, PoolKey calldata key, uint160) external view returns (bytes4) {
        if (!registered[key.toId()]) revert GuardRefused();
        return IHooks.beforeInitialize.selector;
    }

    function beforeSwap(address, PoolKey calldata, SwapParams calldata, bytes calldata)
        external
        view
        returns (bytes4, BeforeSwapDelta, uint24)
    {
        if (refuse) revert GuardRefused();
        return (IHooks.beforeSwap.selector, BeforeSwapDelta.wrap(0), 0);
    }

    function afterSwap(address, PoolKey calldata, SwapParams calldata, BalanceDelta, bytes calldata)
        external
        pure
        returns (bytes4, int128)
    {
        return (IHooks.afterSwap.selector, 0);
    }
}

/// Stand-in for StockReference + the multiplier (IThemeOracle). `push` is its permissionless proof entry point.
contract FixtureOracle is IThemeOracle {
    struct Ref {
        uint256 priceE18;
        uint64 observedAt;
        bool halted;
    }

    mapping(address => Ref) public refs;
    uint8 public session;

    function push(address mirror, uint256 priceE18, uint64 observedAt) external {
        if (observedAt <= refs[mirror].observedAt) return; // older ignored, like StockReference
        refs[mirror].priceE18 = priceE18;
        refs[mirror].observedAt = observedAt;
    }

    function setHalted(address mirror, bool halted) external {
        refs[mirror].halted = halted;
    }

    function setSession(uint8 s) external {
        session = s;
    }

    function tokenPrice(address mirror) external view returns (uint256, uint64, bool) {
        Ref memory r = refs[mirror];
        return (r.priceE18, r.observedAt, r.halted);
    }

    function currentSession() external view returns (uint8) {
        return session;
    }
}

/// Adds full-range-ish liquidity from its own balances (settle = sync → transfer → settle, v4 docs).
contract LiquidityHelper is IUnlockCallback {
    IPoolManager internal immutable pm;

    constructor(IPoolManager pm_) {
        pm = pm_;
    }

    function add(PoolKey calldata key, int24 lower, int24 upper, int256 liquidity) external {
        pm.unlock(abi.encode(key, lower, upper, liquidity));
    }

    function unlockCallback(bytes calldata data) external returns (bytes memory) {
        require(msg.sender == address(pm), "only PM");
        (PoolKey memory key, int24 lower, int24 upper, int256 liquidity) = abi.decode(data, (PoolKey, int24, int24, int256));
        (BalanceDelta d,) = pm.modifyLiquidity(key, ModifyLiquidityParams(lower, upper, liquidity, 0), "");
        _pay(key.currency0, d.amount0());
        _pay(key.currency1, d.amount1());
        return "";
    }

    function _pay(Currency c, int128 delta) internal {
        if (delta >= 0) return;
        pm.sync(c);
        ITIP20(Currency.unwrap(c)).transfer(address(pm), uint128(-delta));
        pm.settle();
    }
}
