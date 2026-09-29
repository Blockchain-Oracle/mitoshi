// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Test} from "forge-std/Test.sol";
import {StdPrecompiles} from "tempo-std/StdPrecompiles.sol";
import {ITIP20} from "tempo-std/interfaces/ITIP20.sol";
import {ITIP20RolesAuth} from "tempo-std/interfaces/ITIP20RolesAuth.sol";
import {ITIP403Registry} from "tempo-std/interfaces/ITIP403Registry.sol";
import {IPoolManager} from "v4-core/interfaces/IPoolManager.sol";
import {IUnlockCallback} from "v4-core/interfaces/callback/IUnlockCallback.sol";
import {Currency} from "v4-core/types/Currency.sol";
import {PoolManagerFixture} from "../lib/PoolManagerFixture.sol";

/// Pays `amount` of `token` into the PoolManager the v4 way (`sync → transfer → settle`), then takes it back.
contract SettleProbe is IUnlockCallback {
    IPoolManager immutable pm;

    constructor(IPoolManager pm_) {
        pm = pm_;
    }

    function run(address token, uint256 amount) external {
        pm.unlock(abi.encode(token, amount));
    }

    function unlockCallback(bytes calldata data) external returns (bytes memory) {
        (address token, uint256 amount) = abi.decode(data, (address, uint256));
        pm.sync(Currency.wrap(token));
        ITIP20(token).transfer(address(pm), amount);
        pm.settle();
        pm.take(Currency.wrap(token), address(this), amount);
        return "";
    }
}

/// Spike X5 (plan §X5, D-024): does the compound TIP-403 policy `(1, blacklist{PoolManager}, 1)` block a coin from
/// reaching the PoolManager (so nobody can seed the migration pool before graduation) while still allowing mints to
/// buyers and transfers into the launchpad? Run on the local Tempo EVM; the same checks run live on Moderato by
/// `scripts/drive/launch-meme.ts` (answer in D-095).
contract X5CompoundPolicyTest is Test {
    ITIP403Registry constant REG = StdPrecompiles.TIP403_REGISTRY;
    ITIP20 constant PATH_USD = ITIP20(0x20C0000000000000000000000000000000000000);
    address alice = makeAddr("alice");
    address launchpad = makeAddr("launchpad");
    IPoolManager pm;
    ITIP20 coin;
    uint64 blacklist;
    uint64 compound;

    function setUp() public {
        pm = IPoolManager(PoolManagerFixture.etch());
        coin = ITIP20(
            StdPrecompiles.TIP20_FACTORY.createToken("X5 Coin", "XFIVE", "XFIVE", PATH_USD, address(this), keccak256("x5"))
        );
        ITIP20RolesAuth(address(coin)).grantRole(coin.ISSUER_ROLE(), address(this));
        address[] memory pmOnly = new address[](1);
        pmOnly[0] = address(pm);
        blacklist = REG.createPolicyWithAccounts(address(this), ITIP403Registry.PolicyType.BLACKLIST, pmOnly);
        compound = REG.createCompoundPolicy(1, blacklist, 1);
        coin.changeTransferPolicyId(compound);
    }

    function test_policyShape() public view {
        (uint64 s, uint64 r, uint64 m) = REG.compoundPolicyData(compound);
        assertEq(s, 1);
        assertEq(r, blacklist);
        assertEq(m, 1);
        assertFalse(REG.isAuthorizedRecipient(compound, address(pm)), "PM refused as recipient");
        assertTrue(REG.isAuthorizedSender(compound, address(pm)), "PM may still send");
        assertTrue(REG.isAuthorizedRecipient(compound, alice));
        assertTrue(REG.isAuthorizedMintRecipient(compound, alice));
    }

    function test_mintToBuyer_andTransferToLaunchpad_allowed() public {
        coin.mint(alice, 1_000e6);
        vm.prank(alice);
        coin.transfer(launchpad, 400e6);
        assertEq(coin.balanceOf(launchpad), 400e6);
        vm.prank(launchpad);
        coin.transfer(alice, 1e6); // launchpad can pay out
        coin.mint(address(this), 10e6);
        coin.burn(10e6); // the issuer burns what it holds (sell path)
    }

    function test_transferToPoolManager_refused() public {
        coin.mint(alice, 1_000e6);
        vm.prank(alice);
        vm.expectRevert(ITIP20.PolicyForbids.selector);
        coin.transfer(address(pm), 1e6);
    }

    function test_transferFromToPoolManager_refused() public {
        coin.mint(alice, 1_000e6);
        vm.prank(alice);
        coin.approve(address(this), 1e6);
        vm.expectRevert(ITIP20.PolicyForbids.selector);
        coin.transferFrom(alice, address(pm), 1e6);
    }

    function test_v4Settle_refused_thenAllowedAfterFlip() public {
        SettleProbe probe = new SettleProbe(pm);
        coin.mint(address(probe), 5e6);
        vm.expectRevert(ITIP20.PolicyForbids.selector);
        probe.run(address(coin), 5e6);

        coin.changeTransferPolicyId(1); // graduation flips to always-allow
        probe.run(address(coin), 5e6);
        assertEq(coin.balanceOf(address(probe)), 5e6, "settled into the PM and taken back");
    }

    /// Minting straight to the PoolManager is allowed by `(…, 1)` — the launchpad never mints to anyone but
    /// `msg.sender` (and the PoolManager never calls `buy`), so this is not a path to seed a pool.
    function test_mintToPoolManager_isNotBlocked() public {
        coin.mint(address(pm), 1e6);
        assertEq(coin.balanceOf(address(pm)), 1e6);
    }
}
