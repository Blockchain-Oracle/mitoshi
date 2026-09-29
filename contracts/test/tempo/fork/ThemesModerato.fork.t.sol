// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {console} from "forge-std/Test.sol";
import {ITIP20} from "tempo-std/interfaces/ITIP20.sol";
import {IAccountKeychain} from "tempo-std/interfaces/IAccountKeychain.sol";
import {IPoolManager} from "v4-core/interfaces/IPoolManager.sol";
import {PoolKey} from "v4-core/types/PoolKey.sol";
import {TickMath} from "v4-core/libraries/TickMath.sol";
import {ThemeRegistry} from "../../../src/themes/ThemeRegistry.sol";
import {ThemeRouter} from "../../../src/themes/ThemeRouter.sol";
import {IThemePoolGuard} from "../../../src/themes/interfaces/IThemePoolGuard.sol";
import {IThemeOracle} from "../../../src/themes/interfaces/IThemeOracle.sol";
import {Trade} from "../../../src/themes/ThemeTypes.sol";
import {FixtureGuard, FixtureOracle, LiquidityHelper} from "../themes/ThemeFixtures.sol";
import {ThemeRouterBase} from "../themes/ThemeRouterBase.sol";

/// S16c.4 against the *deployed* ThemeRegistry/ThemeRouter on a Moderato fork, the replayed PoolManager and the five
/// live mirror TIP-20s: the owner step that waits for S15b–c (setGuard, setTokenPool, setOracle) is rehearsed with the
/// guard/oracle stand-ins, then a follower authorizes the 5-token key and follows (gas measured, D-100) and the agent's
/// key rebalances through Tempo's handler.
contract ThemesModeratoForkTest is ThemeRouterBase {
    ThemeRegistry constant REGISTRY = ThemeRegistry(0xdAb8A7fb64b561716cbE27CB0Eb9c49FB9414a9B);
    ThemeRouter constant ROUTER = ThemeRouter(0x86b12714e58F91762Cb0F00d8830e08d6B642C41);
    address constant OWNER = 0xb0A5F0389098a8B0F33B9B6d6cf2a5917F8A58D6;
    address constant FUNDED = 0x900a0F5260b91Fd65D0C2b03D92Cf8013a1F073e;
    address[5] internal MIRRORS = [
        0x20c000000000000000000000a81E861906820FB7, // TSLA
        0x20c00000000000000000000086081D645cF16774, // AMZN
        0x20C0000000000000000000001edEEA054Ea97549, // PLTR
        0x20C000000000000000000000b21134EaB38DfecC, // AMD
        0x20c000000000000000000000Abbbf91DE8978A6d //  NFLX
    ];
    address[5] internal ADAPTERS = [
        0x5c1069C9F9912D5B8f6250359b5f2FB6F6a426b3,
        0x48A9873c3B376D2fE54ea2C1A38da1EB2C25C862,
        0x8F859355d347b5C03d8E94F6519AdB117bf94a6c,
        0x535aFE496eAEE0736570Cc4Abe2db7D18CF41023,
        0x1546e137E4FaFa52c0E83CED103322AD3B62E801
    ];

    function setUp() public {
        vm.createSelectFork(vm.envOr("MODERATO_RPC_URL", string("https://rpc.moderato.tempo.xyz")), 37380600);
        pm = IPoolManager(0x33620f62C5b9B2086dD6b62F4A297A9f30347029);
        registry = REGISTRY;
        router = ROUTER;
        address guardAt = address(uint160(uint256(keccak256("theme-guard-fork"))) & ~uint160(0x3FFF) | uint160(0x20C0));
        deployCodeTo("ThemeFixtures.sol:FixtureGuard", guardAt);
        guard = FixtureGuard(guardAt);
        oracle = new FixtureOracle();
        lp = new LiquidityHelper(pm);
        vm.startPrank(OWNER);
        REGISTRY.setGuard(IThemePoolGuard(guardAt));
        ROUTER.setOracle(IThemeOracle(address(oracle)));
        vm.stopPrank();
        vm.prank(FUNDED);
        PATH_USD.transfer(address(lp), 200_000e6);
        for (uint256 i; i < 5; ++i) {
            tokens[i] = MIRRORS[i];
            vm.prank(ADAPTERS[i]); // the adapter holds ISSUER_ROLE (bridge mint)
            ITIP20(MIRRORS[i]).mint(address(lp), 400e6);
            PoolKey memory key = _key(MIRRORS[i]);
            guard.registerPool(key);
            pm.initialize(key, TickMath.getSqrtPriceAtTick(TICK));
            lp.add(key, TICK - 2400, TICK + 2400, 1e10); // ≈ 18k pathUSD + 66 mirrors each
            vm.prank(OWNER);
            REGISTRY.setTokenPool(MIRRORS[i], key);
            oracle.push(MIRRORS[i], _poolPriceE18(), uint64(vm.getBlockTimestamp()));
        }
        vm.prank(creator);
        themeId = REGISTRY.publish(_params());
        follower = vm.addr(followerPk);
        agent = vm.addr(agentPk);
        vm.prank(FUNDED);
        PATH_USD.transfer(follower, 10_000e6);
    }

    function test_deployedWiring() public view {
        assertEq(address(ROUTER.poolManager()), address(pm));
        assertEq(address(ROUTER.registry()), address(REGISTRY));
        assertEq(ROUTER.owner(), OWNER);
        assertEq(REGISTRY.owner(), OWNER);
        for (uint256 i; i < 5; ++i) assertTrue(REGISTRY.isEligible(MIRRORS[i]));
    }

    function test_followGas_thenAgentRebalances() public {
        vm.prank(follower, follower);
        KEYCHAIN.authorizeKey(agent, IAccountKeychain.SignatureType.Secp256k1, IAccountKeychain.KeyRestrictions(uint64(vm.getBlockTimestamp() + 30 days), true, _limits(), false, _scopes()));
        uint256 authGas = vm.lastFrameGas().gasTotalUsed;
        vm.prank(follower, follower);
        router.follow(themeId, 1, _caps(), agent);
        uint256 followGas = vm.lastFrameGas().gasTotalUsed;
        console.log("authorizeKey (5 mirrors) gas", authGas);
        console.log("follow gas", followGas);
        assertLt(authGas + followGas, 22_000_000, "fits the relay's follow maxGas (themes policy)");

        Trade[] memory ts = new Trade[](3);
        ts[0] = _buy(0, 500e6);
        ts[1] = _buy(2, 500e6);
        ts[2] = _buy(4, 500e6);
        (bool ok, string memory reason) = _agentRebalance(ts);
        assertTrue(ok, reason);
        for (uint256 i; i < 3; ++i) assertGt(ITIP20(ts[i].tokenOut).balanceOf(follower), 0);
        assertEq(PATH_USD.balanceOf(address(router)), router.totalFeesOwed());
        assertEq(router.feesOwed(creator), 1_500e6 * 30 / 10_000);
    }
}
