// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Test} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {StdTokens} from "tempo-std/StdTokens.sol";
import {IEventVault} from "../../src/products/vault/IEventVault.sol";
import {IStrategyRegistry} from "../../src/products/strategy/IStrategyRegistry.sol";
import {IAgentIdentity, IEventVaultReads, StrategyRegistry} from "../../src/products/strategy/StrategyRegistry.sol";

/// The slice of ERC-8004's IdentityRegistry this test drives (packages/markets/src/agents/erc8004-abi.ts).
interface IIdentityRegistry {
    function register(string calldata agentURI) external returns (uint256 agentId);
    function ownerOf(uint256 agentId) external view returns (address);
}

/// The registry on Moderato as deployed (D-218.1): bound to the live EventVaultV2, the real ERC-8004 IdentityRegistry
/// deciding who owns an `agentId` (AG-1), and a BTC-5m-scoped strategy subscribed with a real STRATEGY grant.
/// Run: `forge test --match-contract ModeratoStrategyRegistryForkTest` (network; excluded from `contracts:test`).
contract ModeratoStrategyRegistryForkTest is Test {
    uint256 internal constant BLOCK = 39_053_939;
    uint256 internal constant ONE = 1e6;
    address internal constant FUNDER = 0x900a0F5260b91Fd65D0C2b03D92Cf8013a1F073e;
    /// ERC-8004 on Moderato (packages/clients/src/pinned.ts); agent 6 is the house agent, owned by FUNDER.
    IIdentityRegistry internal constant IDENTITY = IIdentityRegistry(0x8004A818BFB912233c491871b3d84c89A494BD9e);

    IEventVault.Caps internal envelope;
    StrategyRegistry internal registry;
    address internal vault;
    bytes32 internal btcSeries;
    address internal creator = makeAddr("fork-creator");
    address internal runner = makeAddr("fork-runner");
    address internal owner = makeAddr("fork-subscriber");
    address internal stranger = makeAddr("fork-stranger");

    function setUp() public {
        vm.createSelectFork("https://rpc.moderato.tempo.xyz", BLOCK);
        string memory root = string.concat(vm.projectRoot(), "/deployments/42431/");
        vault = vm.parseJsonAddress(vm.readFile(string.concat(root, "vault2.json")), ".contracts.EventVaultV2.address");
        btcSeries = vm.parseJsonBytes32(vm.readFile(string.concat(root, "engine.json")), ".params['series.BTC-5m']");
        registry = new StrategyRegistry(IEventVaultReads(vault), IERC20(address(StdTokens.PATH_USD)), IAgentIdentity(address(IDENTITY)));
        envelope = IEventVault.Caps({maxStakePerTrade: uint128(5 * ONE), maxDailySpend: uint128(20 * ONE), maxOpenPositions: 2, maxPriceRaw: 0, market: btcSeries});
    }

    function test_boundToTheDeployedVault() public view {
        assertEq(address(registry.vault()), vault);
        assertEq(address(registry.lens()), vm.parseJsonAddress(vm.readFile(string.concat(vm.projectRoot(), "/deployments/42431/engine.json")), ".contracts.EngineLens.address"));
    }

    function test_agentIdMustBeOwned() public {
        vm.prank(creator);
        uint256 agentId = IDENTITY.register("https://testnet.mitoshi.xyz/api/agents/fork-check/registration.json");
        assertEq(IDENTITY.ownerOf(agentId), creator);

        vm.prank(creator);
        uint256 id = registry.publish(runner, keccak256("btc-momentum"), "", envelope, 0, agentId);
        assertEq(registry.strategyOf(id).agentId, agentId);

        vm.prank(stranger);
        vm.expectRevert(abi.encodeWithSelector(IStrategyRegistry.NotAgentOwner.selector, agentId, stranger));
        registry.publish(runner, keccak256("btc-momentum"), "", envelope, 0, agentId);
        // The house agent belongs to someone else; an id never minted belongs to no one.
        vm.prank(creator);
        vm.expectRevert(abi.encodeWithSelector(IStrategyRegistry.NotAgentOwner.selector, uint256(6), creator));
        registry.publish(runner, keccak256("btc-momentum"), "", envelope, 0, 6);
        vm.prank(creator);
        vm.expectRevert(abi.encodeWithSelector(IStrategyRegistry.NotAgentOwner.selector, agentId + 1_000_000, creator));
        registry.publish(runner, keccak256("btc-momentum"), "", envelope, 0, agentId + 1_000_000);
    }

    function test_subscribeWithARealStrategyGrant() public {
        vm.prank(creator);
        uint256 id = registry.publish(runner, keccak256("btc-momentum"), '{"name":"BTC momentum"}', envelope, uint128(ONE), 0);
        vm.prank(FUNDER);
        StdTokens.PATH_USD.transfer(owner, 20 * ONE);
        vm.startPrank(owner);
        StdTokens.PATH_USD.approve(vault, 10 * ONE);
        StdTokens.PATH_USD.approve(address(registry), ONE);
        uint256 grantId = IEventVaultGrants(vault).depositAndGrant(
            10 * ONE,
            IEventVault.GrantKind.STRATEGY,
            runner,
            IEventVault.Caps({maxStakePerTrade: uint128(2 * ONE), maxDailySpend: uint128(10 * ONE), maxOpenPositions: 1, maxPriceRaw: 0, market: bytes32(0)}),
            uint64(vm.getBlockTimestamp() + 7 days),
            10 * ONE
        );
        registry.subscribe(id, 0, IStrategyRegistry.Mode.FADE, uint128(ONE));
        vm.stopPrank();
        assertEq(registry.subscriptionOf(id, owner).grantId, grantId);
        assertTrue(registry.isSubscriptionLive(id, owner));
        assertEq(StdTokens.PATH_USD.balanceOf(creator), ONE, "the fee reached the creator");
        assertEq(registry.metadataOf(id), bytes('{"name":"BTC momentum"}'));
    }
}

interface IEventVaultGrants {
    function depositAndGrant(uint256 amount, IEventVault.GrantKind kind, address actor, IEventVault.Caps calldata caps, uint64 expiresAtSec, uint256 budget)
        external
        returns (uint256 grantId);
}
