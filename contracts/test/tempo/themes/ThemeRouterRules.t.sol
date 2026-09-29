// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {StdPrecompiles} from "tempo-std/StdPrecompiles.sol";
import {ITIP20} from "tempo-std/interfaces/ITIP20.sol";
import {ITIP20RolesAuth} from "tempo-std/interfaces/ITIP20RolesAuth.sol";
import {ThemeRouter} from "../../../src/themes/ThemeRouter.sol";
import {FollowCaps, ThemeParams, Trade} from "../../../src/themes/ThemeTypes.sol";
import {IHooks} from "v4-core/interfaces/IHooks.sol";
import {CustomRevert} from "v4-core/libraries/CustomRevert.sol";
import {Hooks} from "v4-core/libraries/Hooks.sol";
import {FixtureGuard, FixtureOracle} from "./ThemeFixtures.sol";
import {ThemeRouterBase} from "./ThemeRouterBase.sol";

/// The theme's own rules, which bind even the follower's root key (plan B.4.2 "root skips caps, not theme checks"),
/// plus proofs, sessions, references, the guard and the envelope.
contract ThemeRouterRulesTest is ThemeRouterBase {
    function setUp() public {
        _setUpRouter();
        _authorizeAndFollow();
    }

    /// Root-signed: approve exactly, then rebalance, as the follower's own key.
    function _rootRebalance(Trade[] memory ts, bytes memory proof) internal {
        uint256 pathUsd;
        uint256 feeBase;
        vm.startPrank(follower, follower);
        for (uint256 i; i < ts.length; ++i) {
            if (ts[i].tokenIn == address(PATH_USD)) {
                pathUsd += ts[i].amountIn;
                feeBase += ts[i].amountIn;
            } else {
                feeBase += ts[i].minAmountOut;
                ITIP20(ts[i].tokenIn).approve(address(router), ts[i].amountIn);
            }
        }
        PATH_USD.approve(address(router), pathUsd + feeBase * 30 / 10_000);
        router.rebalance(themeId, ts, proof, keccak256("root"));
        vm.stopPrank();
    }

    function test_rootSelfRebalance_skipsFollowCaps() public {
        _rootRebalance(_one(_buy(0, 3_000e6)), ""); // above maxTradeUsd 2,000 and fine for the root
        assertGt(ITIP20(tokens[0]).balanceOf(follower), 0);
        assertEq(router.followOf(follower, themeId).daySpentUsd, 0, "root trades don't use the agent's budget");
        assertEq(PATH_USD.balanceOf(address(router)), router.totalFeesOwed());
    }

    function test_rootSelfRebalance_stillBoundByThemeSlippage() public {
        oracle.push(tokens[0], _poolPriceE18() * 97 / 100, uint64(vm.getBlockTimestamp() + 1)); // theme allows 2 %
        Trade memory t = _buy(0, 100e6);
        t.minAmountOut = 0;
        vm.expectRevert(abi.encodeWithSelector(ThemeRouter.SlippageExceeded.selector, 0));
        this.rootRebalanceExternal(_one(t));
    }

    function rootRebalanceExternal(Trade[] memory ts) external {
        _rootRebalance(ts, "");
    }

    function test_tokenNotInTheme_andBuyNotAllowed() public {
        // a guarded, recorded pool whose token is not in this theme
        address extra = StdPrecompiles.TIP20_FACTORY.createToken("Extra", "EXT", "USD", PATH_USD, address(this), keccak256("extra"));
        ITIP20RolesAuth(extra).grantRole(ISSUER_ROLE, address(this));
        ITIP20(extra).mint(address(lp), 1_000_000e6);
        _pool(extra, true);
        Trade memory t = _buy(0, 100e6);
        t.tokenOut = extra;
        vm.expectRevert(abi.encodeWithSelector(ThemeRouter.TokenNotInTheme.selector, extra));
        this.rootRebalanceExternal(_one(t));
        // v2 marks token 0 hold-only
        ThemeParams memory p = _params();
        p.bands[0].allowed = false;
        vm.prank(creator);
        registry.publishVersion(themeId, p);
        vm.prank(follower, follower);
        router.follow(themeId, 2, _caps(), agent);
        vm.expectRevert(abi.encodeWithSelector(ThemeRouter.BuyNotAllowed.selector, tokens[0]));
        this.rootRebalanceExternal(_one(_buy(0, 100e6)));
    }

    function test_sessionAndReference() public {
        oracle.setSession(3); // UNKNOWN is outside the theme's mask 0x7
        vm.expectRevert(abi.encodeWithSelector(ThemeRouter.SessionNotAllowed.selector, 3));
        this.rootRebalanceExternal(_one(_buy(0, 100e6)));
        oracle.setSession(2);
        vm.warp(vm.getBlockTimestamp() + 601); // theme maxRefAgeSec 600
        vm.expectRevert(abi.encodeWithSelector(ThemeRouter.ReferenceUnusable.selector, tokens[0]));
        this.rootRebalanceExternal(_one(_buy(0, 100e6)));
        oracle.push(tokens[0], _poolPriceE18(), uint64(vm.getBlockTimestamp()));
        oracle.setHalted(tokens[0], true);
        vm.expectRevert(abi.encodeWithSelector(ThemeRouter.ReferenceUnusable.selector, tokens[0]));
        this.rootRebalanceExternal(_one(_buy(0, 100e6)));
        oracle.setHalted(tokens[0], false);
        this.rootRebalanceExternal(_one(_buy(0, 100e6)));
    }

    function test_priceProof_forwardedOnlyToAllowlistedSelector() public {
        vm.warp(vm.getBlockTimestamp() + 601); // every reference is stale
        bytes memory proof = abi.encodeCall(FixtureOracle.push, (tokens[0], _poolPriceE18(), uint64(vm.getBlockTimestamp())));
        vm.expectRevert(ThemeRouter.ProofRefused.selector);
        this.rootRebalanceWithProof(_one(_buy(0, 100e6)), proof); // no target yet
        vm.startPrank(safe);
        router.setProofTarget(address(oracle));
        router.setProofSelector(FixtureOracle.push.selector, true);
        vm.stopPrank();
        vm.expectRevert(ThemeRouter.ProofRefused.selector);
        this.rootRebalanceWithProof(_one(_buy(0, 100e6)), abi.encodeCall(FixtureOracle.setHalted, (tokens[0], true)));
        this.rootRebalanceWithProof(_one(_buy(0, 100e6)), proof); // the push made the reference fresh
        (, uint64 observedAt,) = oracle.tokenPrice(tokens[0]);
        assertEq(observedAt, vm.getBlockTimestamp());
    }

    function rootRebalanceWithProof(Trade[] memory ts, bytes memory proof) external {
        _rootRebalance(ts, proof);
    }

    function test_guardRefusalBubbles() public {
        guard.setRefuse(true);
        // PoolManager wraps the hook's revert: WrappedError(hook, beforeSwap, GuardRefused(), HookCallFailed())
        vm.expectRevert(
            abi.encodeWithSelector(
                CustomRevert.WrappedError.selector,
                address(guard),
                IHooks.beforeSwap.selector,
                abi.encodeWithSelector(FixtureGuard.GuardRefused.selector),
                abi.encodeWithSelector(Hooks.HookCallFailed.selector)
            )
        );
        this.rootRebalanceExternal(_one(_buy(0, 100e6)));
        guard.setRefuse(false);
        this.rootRebalanceExternal(_one(_buy(0, 100e6)));
    }

    function test_envelope_boughtWeightBounded() public {
        FollowCaps memory c = _caps();
        c.allocationUsd = 1_000e6; // token band max 26 % → ≤ $265.2 of token 0 after the buy
        vm.prank(follower, follower);
        router.updateCaps(themeId, c);
        (bool ok, string memory reason) = _agentRebalance(_one(_buy(0, 300e6)));
        _assertTxReverted(ok, reason, abi.encodeWithSelector(ThemeRouter.Envelope.selector, tokens[0]));
        (ok, reason) = _agentRebalance(_one(_buy(0, 250e6)));
        assertTrue(ok, reason);
    }

    function test_partialFillRefused() public {
        // far more than the ±24 % range can absorb: the swap stops at the range edge
        ITIP20(tokens[0]).mint(follower, 100_000e6);
        Trade memory t = _sell(0, 100_000e6);
        t.minAmountOut = 0;
        vm.expectRevert(abi.encodeWithSelector(ThemeRouter.PartialFill.selector, 0));
        this.rootRebalanceExternal(_one(t));
    }

    function test_emptyTradesAndDirectCallback() public {
        vm.expectRevert(ThemeRouter.BadTrades.selector);
        this.rootRebalanceExternal(new Trade[](0));
        vm.expectRevert(ThemeRouter.OnlyPoolManager.selector);
        router.unlockCallback(abi.encode(follower, new Trade[](0), new bytes(0)));
    }

    function test_ownerOnlyConfig() public {
        vm.expectRevert();
        router.setOracle(FixtureOracle(address(0)));
        vm.expectRevert();
        router.setProofTarget(address(oracle));
        vm.expectRevert();
        router.setProofSelector(bytes4(0x12345678), true);
    }
}
