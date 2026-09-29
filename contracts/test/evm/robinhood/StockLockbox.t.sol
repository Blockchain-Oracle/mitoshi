// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {OptionsBuilder} from "@layerzerolabs/oapp-evm/contracts/oapp/libs/OptionsBuilder.sol";
import {SendParam, MessagingFee} from "@layerzerolabs/oft-evm/contracts/interfaces/IOFT.sol";
import {IOFT} from "@layerzerolabs/oft-evm/contracts/interfaces/IOFT.sol";
import {LzTestBase} from "../helpers/LzTestBase.sol";
import {RemoteOFT} from "../helpers/RemoteOFT.sol";
import {MockStockToken} from "../mocks/MockStockToken.sol";
import {StockLockbox} from "../../../src/robinhood/StockLockbox.sol";
import {BridgeRateLimiter} from "../../../src/common/BridgeRateLimiter.sol";

contract StockLockboxTest is LzTestBase {
    using OptionsBuilder for bytes;

    uint32 constant RH = 1;
    uint32 constant REMOTE = 2;
    address alice = makeAddr("alice");
    address bob = makeAddr("bob");
    address guardian = makeAddr("guardian");

    MockStockToken stock;
    StockLockbox box;
    RemoteOFT remote;

    function setUp() public override {
        super.setUp();
        setUpEndpoints(2, LibraryType.UltraLightNode);
        stock = new MockStockToken("TSLA");
        box = new StockLockbox(address(stock), address(endpoints[RH]), address(this), guardian, 1e12);
        remote = new RemoteOFT(address(endpoints[REMOTE]), address(this));
        address[] memory oapps = new address[](2);
        oapps[0] = address(box);
        oapps[1] = address(remote);
        this.wireOApps(oapps);
        box.setRateLimits(REMOTE, 1_000e18, 1 days);
        stock.mint(alice, 100e18);
        vm.deal(alice, 10 ether);
        vm.deal(bob, 10 ether);
        vm.prank(alice);
        stock.approve(address(box), type(uint256).max);
    }

    function _param(uint32 dst, address to, uint256 amount) internal pure returns (SendParam memory) {
        return SendParam(dst, bytes32(uint256(uint160(to))), amount, 0,
            OptionsBuilder.newOptions().addExecutorLzReceiveOption(200_000, 0), "", "");
    }

    function _lock(address from, uint256 amount) internal {
        SendParam memory p = _param(REMOTE, from, amount);
        MessagingFee memory fee = box.quoteSend(p, false);
        vm.prank(from);
        box.send{value: fee.nativeFee}(p, fee, from);
        deliver(REMOTE, address(remote));
    }

    function _unlockMsg(address from, address to, uint256 amount) internal returns (Delivery memory) {
        SendParam memory p = _param(RH, to, amount);
        MessagingFee memory fee = remote.quoteSend(p, false);
        vm.prank(from);
        remote.send{value: fee.nativeFee}(p, fee, from);
        return commitNext(RH, address(box));
    }

    function _assertConserved() internal view {
        (uint256 locked, uint256 out, uint256 owedLD) = box.reserveView();
        assertEq(locked, out + owedLD, "locked == outstanding + owed");
        assertEq(out, remote.totalSupply(), "outstanding == remote supply");
    }

    function test_lockMintsRemote() public {
        _lock(alice, 10e18);
        assertEq(stock.balanceOf(address(box)), 10e18);
        assertEq(remote.balanceOf(alice), 10e18);
        assertEq(box.outstanding(REMOTE), 10e18);
        _assertConserved();
    }

    function test_dustStaysWithSender() public {
        _lock(alice, 10e18 + 123);
        assertEq(stock.balanceOf(alice), 90e18, "dust below 1e12 never leaves");
        assertEq(stock.balanceOf(address(box)), 10e18);
        _assertConserved();
    }

    function test_belowMinLockReverts() public {
        SendParam memory p = _param(REMOTE, alice, 1e12 - 1);
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(StockLockbox.BelowMinLock.selector, 1e12 - 1, 1e12));
        box.send{value: 1 ether}(p, MessagingFee(1 ether, 0), alice);
    }

    function test_pausedLocksRevert() public {
        vm.prank(guardian);
        box.pauseLocks(true);
        SendParam memory p = _param(REMOTE, alice, 1e18);
        vm.prank(alice);
        vm.expectRevert(StockLockbox.LocksArePaused.selector);
        box.send{value: 1 ether}(p, MessagingFee(1 ether, 0), alice);
    }

    function test_rateLimitReverts() public {
        box.setRateLimits(REMOTE, 5e18, 1 days);
        _lock(alice, 5e18);
        SendParam memory p = _param(REMOTE, alice, 1e18);
        MessagingFee memory fee = box.quoteSend(p, false);
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(BridgeRateLimiter.RateLimitExceeded.selector, 1e18, 0));
        box.send{value: fee.nativeFee}(p, fee, alice);
    }

    function test_unlockReturnsTokens() public {
        _lock(alice, 10e18);
        Delivery memory d = _unlockMsg(alice, bob, 4e18);
        (bool ok,) = execute(d, d.gas);
        assertTrue(ok);
        assertEq(stock.balanceOf(bob), 4e18);
        assertEq(box.outstanding(REMOTE), 6e18);
        _assertConserved();
    }

    function test_pauseNeverBlocksUnlock() public {
        _lock(alice, 10e18);
        vm.prank(guardian);
        box.pauseLocks(true);
        Delivery memory d = _unlockMsg(alice, alice, 10e18);
        (bool ok,) = execute(d, d.gas);
        assertTrue(ok);
        assertEq(stock.balanceOf(alice), 100e18);
    }

    function test_deferOnPausedTokenThenClaim() public {
        _lock(alice, 10e18);
        stock.setTokenPaused(true);
        Delivery memory d = _unlockMsg(alice, bob, 3e18);
        vm.expectEmit(true, true, false, false, address(box));
        emit StockLockbox.UnlockDeferred(bob, REMOTE, 3e18, "");
        (bool ok,) = execute(d, d.gas);
        assertTrue(ok, "lzReceive never reverts on a refused transfer");
        assertFalse(isRetryable(d));
        assertEq(box.owed(bob), 3e18);
        _assertConserved();
        vm.prank(bob);
        vm.expectRevert(); // still paused: claim is the user's own call and may revert
        box.claim();
        stock.setTokenPaused(false);
        vm.prank(bob);
        box.claim();
        assertEq(stock.balanceOf(bob), 3e18);
        assertEq(box.totalOwed(), 0);
        _assertConserved();
    }

    function test_deferOnBlockedRecipientThenResendOwed() public {
        _lock(alice, 10e18);
        stock.ACCESS_CONTROLLED_REGISTRY().setBlocked(bob, true);
        Delivery memory d = _unlockMsg(alice, bob, 5e18);
        (bool ok,) = execute(d, d.gas);
        assertTrue(ok);
        assertEq(box.owed(bob), 5e18);
        // bob sends the owed amount back to the remote side (to alice), never touching his blocked wallet
        SendParam memory p = _param(REMOTE, alice, 5e18);
        MessagingFee memory fee = box.quoteSend(p, false);
        vm.prank(bob);
        box.resendOwed{value: fee.nativeFee}(p, fee, bob);
        deliver(REMOTE, address(remote));
        assertEq(box.owed(bob), 0);
        assertEq(remote.balanceOf(alice), 10e18);
        _assertConserved();
    }

    function test_resendOwedBeyondOwedReverts() public {
        SendParam memory p = _param(REMOTE, alice, 1e18);
        vm.prank(bob);
        vm.expectRevert(abi.encodeWithSelector(StockLockbox.ExceedsOwed.selector, 1e18, 0));
        box.resendOwed{value: 1 ether}(p, MessagingFee(1 ether, 0), bob);
    }

    function test_overReleaseRevertsAndStaysStuck() public {
        _lock(alice, 10e18);
        remote.forgeMint(alice, 50e18); // a compromised remote
        Delivery memory d = _unlockMsg(alice, alice, 20e18);
        (bool ok, bytes memory err) = execute(d, d.gas);
        assertFalse(ok);
        assertEq(err, abi.encodeWithSelector(StockLockbox.OverRelease.selector, REMOTE, 20e18, 10e18));
        assertTrue(isRetryable(d), "stays stuck in the endpoint, nothing drained");
        assertEq(stock.balanceOf(address(box)), 10e18);
    }

    function test_lowGasIsRetryable() public {
        _lock(alice, 10e18);
        Delivery memory d = _unlockMsg(alice, bob, 1e18);
        (bool ok, bytes memory err) = execute(d, 110_000);
        assertFalse(ok);
        assertEq(bytes4(err), StockLockbox.InsufficientGas.selector);
        assertTrue(isRetryable(d));
        (ok,) = execute(d, 300_000);
        assertTrue(ok);
        assertEq(stock.balanceOf(bob), 1e18);
    }

    function test_guardianOnlyLowers() public {
        vm.startPrank(guardian);
        box.lowerRateLimit(REMOTE, 10e18);
        vm.expectRevert(abi.encodeWithSelector(StockLockbox.OnlyLower.selector, uint128(10e18), uint128(11e18)));
        box.lowerRateLimit(REMOTE, 11e18);
        vm.expectRevert();
        box.setRateLimits(REMOTE, 1e30, 1 days);
        box.pauseLocks(true);
        vm.expectRevert();
        box.pauseLocks(false);
        vm.stopPrank();
        box.pauseLocks(false);
        assertFalse(box.locksPaused());
        vm.prank(alice);
        vm.expectRevert(StockLockbox.NotGuardian.selector);
        box.pauseLocks(true);
    }

    function test_immutableNoProxy() public view {
        assertEq(box.token(), address(stock));
        assertEq(box.decimalConversionRate(), 1e12);
        assertTrue(box.approvalRequired());
        (bytes4 id,) = box.oftVersion();
        assertEq(id, type(IOFT).interfaceId);
    }
}
