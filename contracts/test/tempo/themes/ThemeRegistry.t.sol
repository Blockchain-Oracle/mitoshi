// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {StdPrecompiles} from "tempo-std/StdPrecompiles.sol";
import {PoolKey} from "v4-core/types/PoolKey.sol";
import {Currency} from "v4-core/types/Currency.sol";
import {IHooks} from "v4-core/interfaces/IHooks.sol";
import {ThemeRegistry} from "../../../src/themes/ThemeRegistry.sol";
import {Band, Theme, ThemeParams} from "../../../src/themes/ThemeTypes.sol";
import {IThemePoolGuard} from "../../../src/themes/interfaces/IThemePoolGuard.sol";
import {FixtureGuard} from "./ThemeFixtures.sol";
import {ThemeBase} from "./ThemeBase.sol";

/// ThemeRegistry (plan B.4.1, B.6): publish/version/agent/delist rules, band arithmetic, and the guarded-pool gate.
contract ThemeRegistryTest is ThemeBase {
    function setUp() public {
        _setUpThemes(true);
    }

    function _publish(ThemeParams memory p) internal returns (uint64 id) {
        vm.prank(creator);
        id = registry.publish(p);
    }

    function _expectPublishRevert(ThemeParams memory p, bytes memory err) internal {
        vm.expectRevert(err);
        vm.prank(creator);
        registry.publish(p);
    }

    function test_publish_storesThemeTokensAndBands() public {
        ThemeParams memory p = _params();
        vm.expectEmit(true, true, false, true, address(registry));
        emit ThemeRegistry.ThemePublished(1, creator, 1, p.specHash, p.specURI);
        uint64 id = _publish(p);
        assertEq(id, 1);
        Theme memory t = registry.theme(id);
        assertEq(t.creator, creator);
        assertEq(t.version, 1);
        assertEq(t.createdAt, block.timestamp);
        assertEq(t.creatorFeeBps, 30);
        assertEq(t.maxSlippageBps, 200);
        assertEq(t.minIntervalSec, 60);
        assertEq(t.maxRefAgeSec, 600);
        assertEq(t.tokenCount, 5);
        assertEq(t.sessionsMask, 0x7);
        assertEq(t.specHash, keccak256("spec-v1"));
        assertEq(t.specURI, p.specURI);
        assertFalse(t.delisted);
        address[] memory listed = registry.tokensOf(id, 1);
        assertEq(listed.length, 5);
        for (uint256 i; i < 5; ++i) {
            assertEq(listed[i], tokens[i]);
            (bool ok, Band memory b) = registry.bandOf(id, 1, tokens[i]);
            assertTrue(ok);
            assertEq(abi.encode(b), abi.encode(_band(1_000, 1_800, 2_600)));
        }
        (bool cashListed, Band memory cash) = registry.bandOf(id, 1, address(PATH_USD));
        assertTrue(cashListed);
        assertEq(cash.targetBps, 1_000);
        (bool stranger,) = registry.bandOf(id, 1, makeAddr("stranger"));
        assertFalse(stranger);
        (bool future,) = registry.bandOf(id, 2, address(PATH_USD));
        assertFalse(future, "no cash band for an unpublished version");
    }

    function test_publish_fullyInvestedCashBandIsStillListed() public {
        ThemeParams memory p = _params();
        for (uint256 i; i < 5; ++i) p.bands[i] = _band(1_000, 2_000, 3_000);
        p.cashBand = _band(0, 0, 0);
        uint64 id = _publish(p);
        (bool listed, Band memory cash) = registry.bandOf(id, 1, address(PATH_USD));
        assertTrue(listed);
        assertEq(cash.maxBps, 0);
    }

    function test_publish_refusesFeeAboveCap() public {
        ThemeParams memory p = _params();
        p.creatorFeeBps = 51;
        _expectPublishRevert(p, abi.encodeWithSelector(ThemeRegistry.BadFee.selector));
        p.creatorFeeBps = 50;
        _publish(p);
    }

    function test_publish_refusesBadLimits() public {
        ThemeParams memory p = _params();
        p.maxSlippageBps = 0;
        _expectPublishRevert(p, abi.encodeWithSelector(ThemeRegistry.BadSlippage.selector));
        p = _params();
        p.maxSlippageBps = 1_001;
        _expectPublishRevert(p, abi.encodeWithSelector(ThemeRegistry.BadSlippage.selector));
        p = _params();
        p.minIntervalSec = 59;
        _expectPublishRevert(p, abi.encodeWithSelector(ThemeRegistry.BadInterval.selector));
        p = _params();
        p.maxRefAgeSec = 0;
        _expectPublishRevert(p, abi.encodeWithSelector(ThemeRegistry.BadRefAge.selector));
        p = _params();
        p.maxRefAgeSec = 345_601;
        _expectPublishRevert(p, abi.encodeWithSelector(ThemeRegistry.BadRefAge.selector));
        p = _params();
        p.sessionsMask = 0;
        _expectPublishRevert(p, abi.encodeWithSelector(ThemeRegistry.BadSessions.selector));
        p = _params();
        p.sessionsMask = 0x10;
        _expectPublishRevert(p, abi.encodeWithSelector(ThemeRegistry.BadSessions.selector));
        p = _params();
        p.specHash = bytes32(0);
        _expectPublishRevert(p, abi.encodeWithSelector(ThemeRegistry.BadSpec.selector));
        p = _params();
        p.specURI = "";
        _expectPublishRevert(p, abi.encodeWithSelector(ThemeRegistry.BadSpec.selector));
    }

    function test_publish_refusesTokenCountAndDuplicates() public {
        ThemeParams memory p = _params();
        p.tokens = new address[](0);
        p.bands = new Band[](0);
        _expectPublishRevert(p, abi.encodeWithSelector(ThemeRegistry.BadTokenCount.selector));
        p = _params();
        p.bands = new Band[](4);
        _expectPublishRevert(p, abi.encodeWithSelector(ThemeRegistry.BadTokenCount.selector));
        p = _params();
        p.tokens = new address[](17);
        p.bands = new Band[](17);
        _expectPublishRevert(p, abi.encodeWithSelector(ThemeRegistry.BadTokenCount.selector));
        p = _params();
        p.tokens[4] = tokens[1];
        _expectPublishRevert(p, abi.encodeWithSelector(ThemeRegistry.DuplicateToken.selector, tokens[1]));
        p = _params();
        p.tokens[0] = address(PATH_USD);
        _expectPublishRevert(p, abi.encodeWithSelector(ThemeRegistry.DuplicateToken.selector, address(PATH_USD)));
    }

    function test_publish_refusesTokenWithoutGuardedPool() public {
        address bare = StdPrecompiles.TIP20_FACTORY.createToken("Bare", "BARE", "USD", PATH_USD, address(this), keccak256("bare"));
        ThemeParams memory p = _params();
        p.tokens[2] = bare;
        _expectPublishRevert(p, abi.encodeWithSelector(ThemeRegistry.PoolNotGuarded.selector, bare));
        assertFalse(registry.isEligible(bare));
    }

    function test_publish_refusesBadBandsAndWeights() public {
        ThemeParams memory p = _params();
        p.bands[1] = _band(1_900, 1_800, 2_600); // min > target
        _expectPublishRevert(p, abi.encodeWithSelector(ThemeRegistry.BadBand.selector, tokens[1]));
        p = _params();
        p.bands[1] = _band(1_000, 2_700, 2_600); // target > max
        _expectPublishRevert(p, abi.encodeWithSelector(ThemeRegistry.BadBand.selector, tokens[1]));
        p = _params();
        p.cashBand = _band(0, 1_000, 10_001); // max > 100 %
        _expectPublishRevert(p, abi.encodeWithSelector(ThemeRegistry.BadBand.selector, address(PATH_USD)));
        p = _params();
        p.bands[3] = _band(0, 0, 0); // a listed token must be allowed some weight
        _expectPublishRevert(p, abi.encodeWithSelector(ThemeRegistry.BadBand.selector, tokens[3]));
        p = _params();
        p.cashBand = _band(0, 900, 2_000); // targets sum to 99 %
        _expectPublishRevert(p, abi.encodeWithSelector(ThemeRegistry.WeightsNot100.selector));
        p = _params();
        for (uint256 i; i < 5; ++i) p.bands[i] = _band(1_800, 1_800, 1_800);
        p.cashBand = _band(1_000, 1_000, 1_000);
        _publish(p); // exact, zero-width bands are fine
    }

    function test_publishVersion_bumpsVersionKeepsHistory_creatorOnly() public {
        uint64 id = _publish(_params());
        ThemeParams memory p = _params();
        p.tokens = new address[](2);
        p.bands = new Band[](2);
        p.tokens[0] = tokens[0];
        p.tokens[1] = tokens[4];
        p.bands[0] = _band(3_000, 4_500, 6_000);
        p.bands[1] = _band(3_000, 4_500, 6_000);
        p.specHash = keccak256("spec-v2");
        p.creatorFeeBps = 10;
        vm.expectRevert(ThemeRegistry.NotCreator.selector);
        registry.publishVersion(id, p);
        vm.prank(creator);
        registry.publishVersion(id, p);
        Theme memory t = registry.theme(id);
        assertEq(t.version, 2);
        assertEq(t.tokenCount, 2);
        assertEq(t.creatorFeeBps, 10);
        assertEq(t.specHash, keccak256("spec-v2"));
        assertEq(registry.tokensOf(id, 1).length, 5, "v1 history kept");
        (bool inV2,) = registry.bandOf(id, 2, tokens[2]);
        assertFalse(inV2, "dropped token not in v2");
        (bool inV1,) = registry.bandOf(id, 1, tokens[2]);
        assertTrue(inV1);
        (, Band memory b) = registry.bandOf(id, 2, tokens[4]);
        assertEq(b.targetBps, 4_500);
    }

    function test_setAgent_creatorOnly() public {
        uint64 id = _publish(_params());
        vm.expectRevert(ThemeRegistry.NotCreator.selector);
        registry.setAgent(id, 42);
        vm.expectEmit(address(registry));
        emit ThemeRegistry.AgentSet(id, 42);
        vm.prank(creator);
        registry.setAgent(id, 42);
        assertEq(registry.theme(id).erc8004AgentId, 42);
    }

    function test_delist_ownerOnly_visibilityOnly() public {
        uint64 id = _publish(_params());
        vm.prank(creator);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, creator));
        registry.delist(id, true);
        vm.prank(safe);
        registry.delist(id, true);
        assertTrue(registry.theme(id).delisted);
        vm.prank(creator);
        registry.publishVersion(id, _params()); // the creator's data is untouched
        vm.prank(safe);
        registry.delist(id, false);
        assertFalse(registry.theme(id).delisted);
    }

    function test_unknownTheme() public {
        vm.expectRevert(abi.encodeWithSelector(ThemeRegistry.UnknownTheme.selector, 7));
        registry.theme(7);
        vm.prank(safe);
        vm.expectRevert(abi.encodeWithSelector(ThemeRegistry.UnknownTheme.selector, 7));
        registry.delist(7, true);
    }

    function test_setTokenPool_checksKeyGuardAndOwner() public {
        address fresh = StdPrecompiles.TIP20_FACTORY.createToken("Fresh", "FRSH", "USD", PATH_USD, address(this), keccak256("fresh"));
        PoolKey memory key = _key(fresh);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, address(this)));
        registry.setTokenPool(fresh, key);
        vm.startPrank(safe);
        vm.expectRevert(abi.encodeWithSelector(ThemeRegistry.PoolNotGuarded.selector, fresh));
        registry.setTokenPool(fresh, key); // guard hasn't registered it
        PoolKey memory wrong = _key(fresh); // memory structs alias: build a fresh copy each time
        wrong.currency0 = Currency.wrap(tokens[0]);
        vm.expectRevert(ThemeRegistry.BadPoolKey.selector);
        registry.setTokenPool(fresh, wrong);
        wrong = _key(fresh);
        wrong.currency1 = Currency.wrap(tokens[0]);
        vm.expectRevert(ThemeRegistry.BadPoolKey.selector);
        registry.setTokenPool(fresh, wrong);
        wrong = _key(fresh);
        wrong.hooks = IHooks(address(0));
        vm.expectRevert(ThemeRegistry.BadPoolKey.selector);
        registry.setTokenPool(fresh, wrong);
        vm.stopPrank();
        guard.registerPool(key);
        vm.prank(safe);
        registry.setTokenPool(fresh, key);
        assertTrue(registry.isEligible(fresh));
        assertEq(abi.encode(registry.poolKeyOf(fresh)), abi.encode(key));
    }

    function test_noGuard_nothingEligible() public {
        ThemeRegistry bare = new ThemeRegistry(safe);
        vm.prank(safe);
        vm.expectRevert(ThemeRegistry.NoGuard.selector);
        bare.setTokenPool(tokens[0], _key(tokens[0]));
        assertFalse(bare.isEligible(tokens[0]));
    }

    function test_guardSwap_oldPoolsIneligible() public {
        FixtureGuard other = new FixtureGuard();
        vm.prank(safe);
        registry.setGuard(IThemePoolGuard(address(other)));
        assertFalse(registry.isEligible(tokens[0]));
        _expectPublishRevert(_params(), abi.encodeWithSelector(ThemeRegistry.PoolNotGuarded.selector, tokens[0]));
    }
}
