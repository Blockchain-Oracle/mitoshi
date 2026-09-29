// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Test} from "forge-std/Test.sol";
import {StdPrecompiles} from "tempo-std/StdPrecompiles.sol";
import {ITIP20} from "tempo-std/interfaces/ITIP20.sol";
import {ITIP20RolesAuth} from "tempo-std/interfaces/ITIP20RolesAuth.sol";
import {IHooks} from "v4-core/interfaces/IHooks.sol";
import {IPoolManager} from "v4-core/interfaces/IPoolManager.sol";
import {PoolKey} from "v4-core/types/PoolKey.sol";
import {Currency} from "v4-core/types/Currency.sol";
import {TickMath} from "v4-core/libraries/TickMath.sol";
import {PoolManagerFixture} from "../../lib/PoolManagerFixture.sol";
import {ThemeRegistry} from "../../../src/themes/ThemeRegistry.sol";
import {Band, ThemeParams} from "../../../src/themes/ThemeTypes.sol";
import {IThemePoolGuard} from "../../../src/themes/interfaces/IThemePoolGuard.sol";
import {FixtureGuard, FixtureOracle, LiquidityHelper} from "./ThemeFixtures.sol";

/// Shared setup for theme tests on the local Tempo EVM: five 6-decimal mirror TIP-20s from the real factory, the real
/// Tempo-mainnet PoolManager runtime (fixture), a guard stand-in at a 0x20C0-flag address, one guarded pathUSD/mirror
/// pool per token (fee 3000, tick spacing 60, B.3.4) seeded with liquidity, and a registry that lists them.
abstract contract ThemeBase is Test {
    ITIP20 internal constant PATH_USD = ITIP20(0x20C0000000000000000000000000000000000000);
    bytes32 internal constant ISSUER_ROLE = keccak256("ISSUER_ROLE");
    int24 internal constant TICK = -55_200; // ≈ $249.6 per token (pathUSD is currency0; price = mirror per pathUSD)
    uint24 internal constant FEE = 3000;
    int24 internal constant SPACING = 60;

    IPoolManager internal pm;
    FixtureGuard internal guard;
    FixtureOracle internal oracle;
    LiquidityHelper internal lp;
    ThemeRegistry internal registry;
    address[5] internal tokens;
    address internal safe = makeAddr("safe");
    address internal creator = makeAddr("creator");

    function _setUpThemes(bool seedPools) internal {
        pm = IPoolManager(PoolManagerFixture.etch());
        address guardAt = address(uint160(uint256(keccak256("theme-guard"))) & ~uint160(0x3FFF) | uint160(0x20C0));
        deployCodeTo("ThemeFixtures.sol:FixtureGuard", guardAt);
        guard = FixtureGuard(guardAt);
        oracle = new FixtureOracle();
        lp = new LiquidityHelper(pm);
        registry = new ThemeRegistry(safe);
        vm.prank(safe);
        registry.setGuard(IThemePoolGuard(address(guard)));
        PATH_USD.transfer(address(lp), 100_000_000e6);
        for (uint256 i; i < 5; ++i) {
            address t = StdPrecompiles.TIP20_FACTORY.createToken("Bridged Stock (unofficial)", "bSTK", "USD", PATH_USD, address(this), keccak256(abi.encode("mirror", i)));
            ITIP20RolesAuth(t).grantRole(ISSUER_ROLE, address(this));
            ITIP20(t).mint(address(lp), 1_000_000e6);
            tokens[i] = t;
            if (seedPools) _pool(t, true);
        }
    }

    function _key(address token) internal view returns (PoolKey memory) {
        return PoolKey(Currency.wrap(address(PATH_USD)), Currency.wrap(token), FEE, SPACING, IHooks(address(guard)));
    }

    /// Registers the pool with the guard, initializes it at TICK, adds ±~24% liquidity, records it in the registry and
    /// sets the oracle to the pool's own price.
    function _pool(address token, bool record) internal {
        PoolKey memory key = _key(token);
        guard.registerPool(key);
        pm.initialize(key, TickMath.getSqrtPriceAtTick(TICK));
        lp.add(key, TICK - 2400, TICK + 2400, 1e12);
        if (record) {
            vm.prank(safe);
            registry.setTokenPool(token, key);
        }
        oracle.push(token, _poolPriceE18(), uint64(block.timestamp));
    }

    /// USD per whole mirror token × 1e18 at TICK (both sides 6 decimals): 2^192 / sqrtP².
    function _poolPriceE18() internal pure returns (uint256) {
        uint256 s = TickMath.getSqrtPriceAtTick(TICK);
        return (uint256(1e18) << 192) / (s * s);
    }

    function _band(uint16 min, uint16 target, uint16 max) internal pure returns (Band memory) {
        return Band(min, max, target, true);
    }

    /// A 5-token theme, 18 % each ±8 %, cash 10 % (0–20 %).
    function _params() internal view returns (ThemeParams memory p) {
        p.creatorFeeBps = 30;
        p.maxSlippageBps = 200;
        p.minIntervalSec = 60;
        p.maxRefAgeSec = 600;
        p.sessionsMask = 0x7; // REGULAR | EXTENDED | CLOSED
        p.specHash = keccak256("spec-v1");
        p.specURI = "https://testnet.mitoshi.xyz/themes/ai-stack/v1.json";
        p.tokens = new address[](5);
        p.bands = new Band[](5);
        for (uint256 i; i < 5; ++i) {
            p.tokens[i] = tokens[i];
            p.bands[i] = _band(1_000, 1_800, 2_600);
        }
        p.cashBand = _band(0, 1_000, 2_000);
    }
}
