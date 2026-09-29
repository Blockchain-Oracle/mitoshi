// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {IAccountKeychain} from "tempo-std/interfaces/IAccountKeychain.sol";
import {ITIP20} from "tempo-std/interfaces/ITIP20.sol";
import {StdPrecompiles} from "tempo-std/StdPrecompiles.sol";
import {TempoCall} from "tempo-std/tx/TempoTransactionLib.sol";
import {ThemeRouter} from "../../../src/themes/ThemeRouter.sol";
import {FollowCaps, ThemeParams} from "../../../src/themes/ThemeTypes.sol";
import {KeychainTx} from "../../lib/KeychainTx.sol";
import {ThemeRouterBase} from "./ThemeRouterBase.sol";

/// ThemeRouter consent (plan B.4.2 follow/updateCaps/unfollow, B.6): root only, the key's scope must be exactly the
/// router's, caps and fee consent, key validity, version.
contract ThemeRouterFollowTest is ThemeRouterBase {
    function setUp() public {
        _setUpRouter();
    }

    function test_follow_storesConsent() public {
        _authorize(agent, _scopes(), uint64(vm.getBlockTimestamp() + 30 days));
        FollowCaps memory caps = _caps();
        vm.expectEmit(address(router));
        emit ThemeRouter.Followed(follower, themeId, 1, agent, caps);
        vm.prank(follower, follower);
        router.follow(themeId, 1, caps, agent);
        ThemeRouter.Follow memory f = router.followOf(follower, themeId);
        assertEq(f.keyId, agent);
        assertEq(f.version, 1);
        assertTrue(f.active);
        assertEq(abi.encode(f.caps), abi.encode(caps));
    }

    /// X4/D-100 one-tx shape: `[authorizeKey, follow]` from the root in one Tempo tx — follow sees the new key.
    function test_follow_sameTxAsAuthorize_rootSigned() public {
        IAccountKeychain.KeyRestrictions memory r = IAccountKeychain.KeyRestrictions(uint64(vm.getBlockTimestamp() + 30 days), true, _limits(), false, _scopes());
        TempoCall[] memory calls = new TempoCall[](2);
        calls[0] = _call(address(KEYCHAIN), abi.encodeWithSignature("authorizeKey(address,uint8,(uint64,bool,(address,uint256,uint64)[],bool,(address,(bytes4,address[])[])[]))", agent, uint8(0), r));
        calls[1] = _call(address(router), abi.encodeCall(ThemeRouter.follow, (themeId, 1, _caps(), agent)));
        (bool ok, string memory reason) = KeychainTx.tryExecute(_rootSigned(calls));
        assertTrue(ok, reason);
        assertEq(router.followOf(follower, themeId).keyId, agent);
    }

    function test_follow_rootOnly_keySignedRefused() public {
        // An unrestricted second key can reach `follow`; the router still refuses anything but the root.
        uint256 otherPk = 0x0B0E;
        vm.prank(follower, follower);
        KEYCHAIN.authorizeKey(vm.addr(otherPk), IAccountKeychain.SignatureType.Secp256k1, IAccountKeychain.KeyRestrictions(uint64(vm.getBlockTimestamp() + 30 days), false, new IAccountKeychain.TokenLimit[](0), true, new IAccountKeychain.CallScope[](0)));
        _authorize(agent, _scopes(), uint64(vm.getBlockTimestamp() + 30 days));
        TempoCall[] memory calls = new TempoCall[](1);
        calls[0] = _call(address(router), abi.encodeCall(ThemeRouter.follow, (themeId, 1, _caps(), agent)));
        (bool ok, string memory reason) = KeychainTx.tryExecute(_signed(calls, otherPk));
        _assertTxReverted(ok, reason, abi.encodeWithSelector(ThemeRouter.RootOnly.selector));
    }

    function test_follow_unscopedKeyRefused() public {
        vm.prank(follower, follower);
        KEYCHAIN.authorizeKey(agent, IAccountKeychain.SignatureType.Secp256k1, IAccountKeychain.KeyRestrictions(uint64(vm.getBlockTimestamp() + 30 days), true, _limits(), true, new IAccountKeychain.CallScope[](0)));
        vm.prank(follower, follower);
        vm.expectRevert(ThemeRouter.KeyUnscoped.selector);
        router.follow(themeId, 1, _caps(), agent);
    }

    function test_follow_refusesScopesBeyondTheRouter() public {
        IAccountKeychain.CallScope[] memory s = _scopes();
        // transfer on pathUSD (even to self) is never allowed
        address[] memory self = new address[](1);
        self[0] = follower;
        s[1].selectorRules[0] = IAccountKeychain.SelectorRule(ITIP20.transfer.selector, self);
        _expectScopeRefused(s, address(PATH_USD), 0xA1);
        // approve to another spender
        s = _scopes();
        s[2] = _approveScope(tokens[0], makeAddr("elsewhere"));
        _expectScopeRefused(s, tokens[0], 0xA2);
        // approve on a token outside the theme
        address outsider = StdPrecompiles.TIP20_FACTORY.createToken("Out", "OUT", "USD", PATH_USD, address(this), keccak256("out"));
        s = _scopes();
        s[3] = _approveScope(outsider, address(router));
        _expectScopeRefused(s, outsider, 0xA3);
        // any-selector on the router
        s = _scopes();
        s[0].selectorRules = new IAccountKeychain.SelectorRule[](0);
        _expectScopeRefused(s, address(router), 0xA4);
        // a non-rebalance selector on the router
        s = _scopes();
        s[0].selectorRules[0].selector = ThemeRouter.unfollow.selector;
        _expectScopeRefused(s, address(router), 0xA5);
    }

    function _expectScopeRefused(IAccountKeychain.CallScope[] memory s, address target, uint256 keyPk) internal {
        address key = vm.addr(keyPk);
        _authorize(key, s, uint64(vm.getBlockTimestamp() + 30 days));
        vm.prank(follower, follower);
        vm.expectRevert(abi.encodeWithSelector(ThemeRouter.ScopeNotAllowed.selector, target));
        router.follow(themeId, 1, _caps(), key);
    }

    /// D-100 split shape: follow may run before the later token scopes arrive (a subset is fine).
    function test_follow_acceptsSubsetScopes() public {
        IAccountKeychain.CallScope[] memory s = _scopes();
        IAccountKeychain.CallScope[] memory first = new IAccountKeychain.CallScope[](2);
        first[0] = s[0];
        first[1] = s[1];
        _authorize(agent, first, uint64(vm.getBlockTimestamp() + 30 days));
        vm.prank(follower, follower);
        router.follow(themeId, 1, _caps(), agent);
        assertTrue(router.followOf(follower, themeId).active);
    }

    function test_follow_keyValidity() public {
        vm.startPrank(follower, follower);
        vm.expectRevert(ThemeRouter.KeyInvalid.selector);
        router.follow(themeId, 1, _caps(), agent); // not authorized
        vm.stopPrank();
        _authorize(agent, _scopes(), uint64(vm.getBlockTimestamp() + 1 days));
        vm.prank(follower, follower);
        vm.expectRevert(ThemeRouter.KeyInvalid.selector);
        router.follow(themeId, 1, _caps(), agent); // key expires before the consent
        address noLimits = makeAddr("noLimits");
        vm.prank(follower, follower);
        KEYCHAIN.authorizeKey(noLimits, IAccountKeychain.SignatureType.Secp256k1, IAccountKeychain.KeyRestrictions(uint64(vm.getBlockTimestamp() + 30 days), false, new IAccountKeychain.TokenLimit[](0), false, _scopes()));
        vm.prank(follower, follower);
        vm.expectRevert(ThemeRouter.KeyInvalid.selector);
        router.follow(themeId, 1, _caps(), noLimits); // limits not enforced
        address revoked = makeAddr("revoked");
        _authorize(revoked, _scopes(), uint64(vm.getBlockTimestamp() + 30 days));
        vm.startPrank(follower, follower);
        KEYCHAIN.revokeKey(revoked);
        vm.expectRevert(ThemeRouter.KeyInvalid.selector);
        router.follow(themeId, 1, _caps(), revoked);
        vm.expectRevert(ThemeRouter.KeyInvalid.selector);
        router.follow(themeId, 1, _caps(), address(0));
        vm.stopPrank();
    }

    function test_follow_capsFeeAndVersion() public {
        _authorize(agent, _scopes(), uint64(vm.getBlockTimestamp() + 30 days));
        vm.startPrank(follower, follower);
        FollowCaps memory c = _caps();
        c.maxFeeBps = 29; // theme charges 30
        vm.expectRevert(ThemeRouter.FeeNotAccepted.selector);
        router.follow(themeId, 1, c, agent);
        c = _caps();
        c.maxTradeUsd = c.maxDailyUsd + 1;
        vm.expectRevert(ThemeRouter.BadCaps.selector);
        router.follow(themeId, 1, c, agent);
        c = _caps();
        c.expiry = uint64(vm.getBlockTimestamp());
        vm.expectRevert(ThemeRouter.BadCaps.selector);
        router.follow(themeId, 1, c, agent);
        c = _caps();
        c.allocationUsd = 0;
        vm.expectRevert(ThemeRouter.BadCaps.selector);
        router.follow(themeId, 1, c, agent);
        c = _caps();
        c.maxSlippageBps = 1_001;
        vm.expectRevert(ThemeRouter.BadCaps.selector);
        router.follow(themeId, 1, c, agent);
        vm.expectRevert(ThemeRouter.VersionMismatch.selector);
        router.follow(themeId, 2, _caps(), agent);
        vm.stopPrank();
    }

    function test_updateCaps_andUnfollow_rootOnly() public {
        _authorizeAndFollow();
        FollowCaps memory c = _caps();
        c.maxDailyUsd = 9_000e6;
        vm.prank(follower, follower);
        router.updateCaps(themeId, c);
        assertEq(router.followOf(follower, themeId).caps.maxDailyUsd, 9_000e6);
        // the agent's key can't reach either (not in its scope → protocol refuses before the router runs)
        TempoCall[] memory calls = new TempoCall[](1);
        calls[0] = _call(address(router), abi.encodeCall(ThemeRouter.unfollow, (themeId)));
        (bool ok, string memory reason) = KeychainTx.tryExecute(_signed(calls, agentPk));
        _assertTxReverted(ok, reason, abi.encodeWithSignature("CallNotAllowed()"));
        vm.prank(follower, follower);
        router.unfollow(themeId);
        assertFalse(router.followOf(follower, themeId).active);
        assertEq(router.followOf(follower, themeId).keyId, agent, "slots never zeroed");
        vm.startPrank(follower, follower);
        vm.expectRevert(ThemeRouter.NotFollowing.selector);
        router.unfollow(themeId);
        vm.expectRevert(ThemeRouter.NotFollowing.selector);
        router.updateCaps(themeId, c);
        router.follow(themeId, 1, _caps(), agent); // re-follow
        vm.stopPrank();
        assertTrue(router.followOf(follower, themeId).active);
    }

    function test_publishVersion_requiresReconsent() public {
        _authorizeAndFollow();
        ThemeParams memory p = _params();
        p.specHash = keccak256("spec-v2");
        vm.prank(creator);
        registry.publishVersion(themeId, p);
        vm.prank(follower, follower);
        vm.expectRevert(ThemeRouter.VersionMismatch.selector);
        router.updateCaps(themeId, _caps());
        vm.prank(follower, follower);
        router.follow(themeId, 2, _caps(), agent);
        assertEq(router.followOf(follower, themeId).version, 2);
    }
}
