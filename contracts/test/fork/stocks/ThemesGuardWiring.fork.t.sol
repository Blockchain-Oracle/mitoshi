// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Test} from "forge-std/Test.sol";
import {IHooks} from "v4-core/interfaces/IHooks.sol";
import {PoolKey} from "v4-core/types/PoolKey.sol";
import {Currency} from "v4-core/types/Currency.sol";
import {ThemeRegistry} from "../../../src/themes/ThemeRegistry.sol";
import {ThemeRouter} from "../../../src/themes/ThemeRouter.sol";
import {IThemePoolGuard} from "../../../src/themes/interfaces/IThemePoolGuard.sol";
import {IThemeOracle} from "../../../src/themes/interfaces/IThemeOracle.sol";
import {StockReference} from "../../../src/stocks/StockReference.sol";
import {StockGuardHook} from "../../../src/stocks/hooks/StockGuardHook.sol";

/// The S16 owner steps that wait on S15b–c (stage-16 Handoff 1–4, D-101/D-102), rehearsed with the **deployed**
/// ThemeRegistry/ThemeRouter, StockGuardHook and StockReference on a Moderato fork: exactly the calls the integrator
/// signs with `deployer-themes`. Run: `forge test --match-contract ThemesGuardWiringFork`.
contract ThemesGuardWiringForkTest is Test {
    ThemeRegistry internal constant REGISTRY = ThemeRegistry(0xdAb8A7fb64b561716cbE27CB0Eb9c49FB9414a9B);
    ThemeRouter internal constant ROUTER = ThemeRouter(0x86b12714e58F91762Cb0F00d8830e08d6B642C41);
    address internal constant THEMES_OWNER = 0xb0A5F0389098a8B0F33B9B6d6cf2a5917F8A58D6;
    StockGuardHook internal constant HOOK = StockGuardHook(0xFB0579c1dbFfbBabb05834998b5542B9Bd4FA0C0);
    StockReference internal constant REF = StockReference(0xccBc2E760C22DBBdb3E1C2458C98593942A7Bd90);
    address[5] internal MIRRORS = [
        0x20c000000000000000000000a81E861906820FB7, // TSLA
        0x20c00000000000000000000086081D645cF16774, // AMZN
        0x20C0000000000000000000001edEEA054Ea97549, // PLTR
        0x20c000000000000000000000Abbbf91DE8978A6d, // NFLX
        0x20C000000000000000000000b21134EaB38DfecC //  AMD
    ];

    function setUp() public {
        vm.createSelectFork(vm.envOr("MODERATO_RPC_URL", string("https://rpc.moderato.tempo.xyz")), 37_386_450);
    }

    function test_ownerStepsWithTheRealGuard() public {
        vm.startPrank(THEMES_OWNER);
        REGISTRY.setGuard(IThemePoolGuard(address(HOOK))); // step 1
        for (uint256 i; i < 5; ++i) {
            PoolKey memory k = PoolKey(Currency.wrap(0x20C0000000000000000000000000000000000000), Currency.wrap(MIRRORS[i]), 3000, 60, IHooks(address(HOOK)));
            REGISTRY.setTokenPool(MIRRORS[i], k); // step 2
            assertTrue(REGISTRY.isEligible(MIRRORS[i]));
        }
        ROUTER.setOracle(IThemeOracle(address(HOOK))); // step 3: the hook is the IThemeOracle (D-105 §6)
        ROUTER.setProofTarget(address(REF)); // step 4
        ROUTER.setProofSelector(StockReference.pushRedStone.selector, true);
        vm.stopPrank();
        (uint256 p, uint64 at, bool halted) = IThemeOracle(address(ROUTER.oracle())).tokenPrice(MIRRORS[0]);
        assertEq(p, 357.40677603e18);
        assertGt(at, 0);
        assertTrue(halted, "unsynced until StockSync lands");
        (,, halted) = HOOK.tokenPrice(MIRRORS[3]);
        assertTrue(halted, "NFLX: no reference");
        assertEq(IThemeOracle(address(ROUTER.oracle())).currentSession(), 3);
    }
}
