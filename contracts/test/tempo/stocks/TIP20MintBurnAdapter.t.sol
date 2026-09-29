// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {SendParam, MessagingFee} from "@layerzerolabs/oft-evm/contracts/interfaces/IOFT.sol";
import {ProxyAdmin} from "@openzeppelin/contracts/proxy/transparent/ProxyAdmin.sol";
import {ITransparentUpgradeableProxy} from "@openzeppelin/contracts/proxy/transparent/TransparentUpgradeableProxy.sol";
import {ITIP20} from "tempo-std/interfaces/ITIP20.sol";
import {ITIP20RolesAuth} from "tempo-std/interfaces/ITIP20RolesAuth.sol";
import {ITIP403Registry} from "tempo-std/interfaces/ITIP403Registry.sol";
import {AdapterFixture} from "./AdapterFixture.sol";
import {TIP20MintBurnAdapter} from "../../../src/stocks/TIP20MintBurnAdapter.sol";
import {DeferReason} from "../../../src/common/BridgeTypes.sol";
import {LzNetworks} from "../../../script/lib/LzNetworks.sol";

contract TIP20MintBurnAdapterTest is AdapterFixture {
    ITIP403Registry constant TIP403 = ITIP403Registry(0x403c000000000000000000000000000000000000);
    uint128 constant GAS = 1_000_000;

    function _assertBacked() internal view {
        assertEq(adapter.mintedNet(), mirror.totalSupply(), "adapter is the only issuer");
        // remote supply (the lock side stand-in) == mirror supply + deferred, in shared units
        assertEq(remote.totalSupply() / 1e12 + mirror.totalSupply() + adapter.totalDeferred(), 100e6);
    }

    function _deliverExpectingDefer(address to, uint256 amount18, DeferReason reason) internal {
        Delivery memory d = _inbound(to, amount18, GAS);
        vm.expectEmit(true, true, false, true, address(adapter));
        emit TIP20MintBurnAdapter.CreditDeferred(to, REMOTE, amount18 / 1e12, reason);
        (bool ok,) = execute(d, d.gas);
        assertTrue(ok, "a refused mint never reverts lzReceive");
        assertFalse(isRetryable(d));
        _assertBacked();
    }

    function test_storageSlotIsErc7201() public pure {
        bytes32 expected = keccak256(abi.encode(uint256(keccak256("mitoshi.storage.TIP20MintBurnAdapter")) - 1))
            & ~bytes32(uint256(0xff));
        assertEq(expected, 0x06ab9501a3b9046c45cce6fe58c93ad0f259e8ee471aaebf21d75ff893b3b000);
    }

    function test_mintToFreshHolder() public {
        _mintTo(bob, 5e18);
        assertEq(mirror.balanceOf(bob), 5e6, "18 -> 6 decimals");
        _assertBacked();
        assertEq(adapter.lzd(), LzNetworks.MODERATO_LZD);
    }

    function test_defer_invalidRecipient() public {
        _deliverExpectingDefer(address(PATH_USD), 1e18, DeferReason.INVALID_RECIPIENT);
        _deliverExpectingDefer(0xB10C000000000000000000000000000000000000, 1e18, DeferReason.INVALID_RECIPIENT);
    }

    function test_defer_tokenPaused() public {
        ITIP20RolesAuth(address(mirror)).grantRole(mirror.PAUSE_ROLE(), address(this));
        mirror.pause();
        _deliverExpectingDefer(bob, 1e18, DeferReason.TOKEN_PAUSED);
    }

    function test_defer_policy() public {
        uint64 wl = TIP403.createPolicy(address(this), ITIP403Registry.PolicyType.WHITELIST);
        TIP403.modifyPolicyWhitelist(wl, address(adapter), true);
        mirror.changeTransferPolicyId(wl);
        _deliverExpectingDefer(bob, 1e18, DeferReason.POLICY);
    }

    function test_defer_supplyCapThenClaimAfterRaise() public {
        mirror.setSupplyCap(3e6);
        _deliverExpectingDefer(bob, 5e18, DeferReason.SUPPLY_CAP);
        assertEq(adapter.deferredOf(bob), 5e6);
        vm.prank(bob);
        vm.expectRevert(abi.encodeWithSelector(TIP20MintBurnAdapter.CannotMint.selector, DeferReason.SUPPLY_CAP));
        adapter.claimDeferred();
        mirror.setSupplyCap(1_000e6);
        vm.prank(bob);
        adapter.claimDeferred();
        assertEq(mirror.balanceOf(bob), 5e6);
        assertEq(adapter.totalDeferred(), 0);
        _assertBacked();
    }

    function test_defer_rateLimit() public {
        adapter.setInboundLimit(2e6, 1 days);
        _deliverExpectingDefer(bob, 3e18, DeferReason.RATE_LIMIT);
    }

    function test_defer_receivePolicy() public {
        uint64 nobody = TIP403.createPolicy(bob, ITIP403Registry.PolicyType.WHITELIST);
        vm.prank(bob);
        TIP403.setReceivePolicy(nobody, 1, bob);
        (bool ok,) = TIP403.validateReceivePolicy(address(mirror), address(adapter), bob);
        assertFalse(ok);
        _deliverExpectingDefer(bob, 1e18, DeferReason.RECEIVE_POLICY);
        assertEq(mirror.balanceOf(0xB10C000000000000000000000000000000000000), 0, "nothing redirected to the guard");
    }

    function test_defer_callRevertedWhenIssuerRevoked() public {
        ITIP20RolesAuth(address(mirror)).revokeRole(mirror.ISSUER_ROLE(), address(adapter));
        _deliverExpectingDefer(bob, 1e18, DeferReason.CALL_REVERTED);
    }

    function test_lowGasIsRetryable() public {
        Delivery memory d = _inbound(bob, 1e18, GAS);
        (bool ok, bytes memory err) = execute(d, 500_000);
        assertFalse(ok);
        assertEq(bytes4(err), TIP20MintBurnAdapter.InsufficientGas.selector);
        assertTrue(isRetryable(d));
        (ok,) = execute(d, GAS);
        assertTrue(ok);
        assertEq(mirror.balanceOf(bob), 1e6);
    }

    /// Enough gas to pass the entry check but not to finish a fresh-holder mint: must revert, not defer.
    function test_mintOutOfGasRevertsNotDefers() public {
        Delivery memory d = _inbound(bob, 1e18, GAS);
        (bool ok,) = execute(d, 700_000);
        assertFalse(ok);
        assertEq(adapter.totalDeferred(), 0);
        assertTrue(isRetryable(d));
    }

    function test_sendBurnsAndPaysLzdInPathUsd() public {
        _mintTo(bob, 5e18);
        SendParam memory p = SendParam(REMOTE, _b32(alice), 2e6, 2e6, _opts(GAS), "", "");
        MessagingFee memory fee = adapter.quoteSend(p, false);
        uint256 usdBefore = PATH_USD.balanceOf(bob);
        uint256 lzdSupply = ITIP20(LzNetworks.MODERATO_LZD).totalSupply();
        vm.startPrank(bob);
        mirror.approve(address(adapter), 2e6);
        PATH_USD.approve(address(adapter), fee.nativeFee);
        adapter.send(p, fee, bob);
        vm.stopPrank();
        assertEq(usdBefore - PATH_USD.balanceOf(bob), fee.nativeFee, "fee in pathUSD, exactly the quote");
        assertEq(ITIP20(LzNetworks.MODERATO_LZD).totalSupply() - lzdSupply, fee.nativeFee, "wrapped into LZD");
        assertEq(mirror.totalSupply(), 3e6, "burned");
        deliver(REMOTE, address(remote));
        assertEq(remote.balanceOf(alice), 95e18 + 2e18);
        _assertBacked();
    }

    function test_sendDeferredWithoutAdmin() public {
        mirror.setSupplyCap(0);
        _deliverExpectingDefer(bob, 4e18, DeferReason.SUPPLY_CAP);
        adapter.pauseSends(true); // even paused sends don't trap deferred funds
        SendParam memory p = SendParam(REMOTE, _b32(bob), 4e6, 0, _opts(GAS), "", "");
        MessagingFee memory fee = adapter.quoteSend(p, false);
        vm.startPrank(bob);
        PATH_USD.approve(address(adapter), fee.nativeFee);
        adapter.sendDeferred(p, fee, bob);
        vm.stopPrank();
        deliver(REMOTE, address(remote));
        assertEq(remote.balanceOf(bob), 4e18);
        assertEq(adapter.deferredOf(bob), 0);
        _assertBacked();
    }

    function test_sendDeferredBeyondDeferredReverts() public {
        SendParam memory p = SendParam(REMOTE, _b32(bob), 1e6, 0, _opts(GAS), "", "");
        vm.prank(bob);
        vm.expectRevert(abi.encodeWithSelector(TIP20MintBurnAdapter.ExceedsDeferred.selector, 1e6, 0));
        adapter.sendDeferred(p, MessagingFee(1, 0), bob);
    }

    function test_rejectsValue() public {
        vm.deal(bob, 1 ether);
        SendParam memory p = SendParam(REMOTE, _b32(bob), 1e6, 0, "", "", "");
        vm.prank(bob);
        vm.expectRevert();
        adapter.send{value: 1}(p, MessagingFee(1, 0), bob);
    }

    function test_sendRejectsZeroRecipientAndPause() public {
        SendParam memory p = SendParam(REMOTE, bytes32(0), 1e6, 0, "", "", "");
        vm.expectRevert(TIP20MintBurnAdapter.InvalidRecipient.selector);
        adapter.send(p, MessagingFee(0, 0), bob);
        vm.prank(guardian);
        adapter.pauseSends(true);
        p.to = _b32(bob);
        vm.expectRevert(TIP20MintBurnAdapter.SendsArePaused.selector);
        adapter.send(p, MessagingFee(0, 0), bob);
    }

    function test_guardianOnlyPausesAndLowers() public {
        vm.startPrank(guardian);
        adapter.lowerLimit(0, 100e6);
        adapter.lowerLimit(REMOTE, 100e6);
        vm.expectRevert(abi.encodeWithSelector(TIP20MintBurnAdapter.OnlyLower.selector, uint128(100e6), uint128(101e6)));
        adapter.lowerLimit(REMOTE, 101e6);
        adapter.pauseSends(true);
        vm.expectRevert();
        adapter.pauseSends(false);
        vm.expectRevert();
        adapter.setInboundLimit(1e30, 1);
        vm.stopPrank();
    }

    function test_upgradeOnlyThroughProxyAdmin() public {
        address admin = address(uint160(uint256(vm.load(address(proxy), 0xb53127684a568b3173ae13b9f8a6016e243e63b6e8ee1178d6a717850b5d6103))));
        assertEq(ProxyAdmin(admin).owner(), safe);
        TIP20MintBurnAdapter next = new TIP20MintBurnAdapter(address(mirror), address(endpoints[TEMPO]));
        vm.expectRevert();
        ProxyAdmin(admin).upgradeAndCall(ITransparentUpgradeableProxy(address(proxy)), address(next), "");
        vm.prank(safe);
        ProxyAdmin(admin).upgradeAndCall(ITransparentUpgradeableProxy(address(proxy)), address(next), "");
        assertEq(adapter.guardian(), guardian, "state survives the upgrade");
        vm.expectRevert();
        impl.initialize(address(this), guardian);
        vm.expectRevert();
        adapter.initialize(address(this), guardian);
    }
}
