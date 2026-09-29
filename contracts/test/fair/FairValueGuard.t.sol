// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {EngineFixture} from "../engine/harness/EngineFixture.sol";
import {PrintSigner} from "../engine/harness/PrintSigner.sol";
import {Policies} from "../engine/harness/Policies.sol";
import {IEngineErrors as E} from "../../src/engine/EngineErrors.sol";
import {IPrintVerifier} from "../../src/engine/interfaces/IPrintVerifier.sol";
import {FairValueGuard} from "../../src/fair/FairValueGuard.sol";
import {FairValue} from "../../src/fair/FairValue.sol";

/// A.5.4: the guard over the real engine's Window (open print recorded through `recordPrint`) and the real RedStone
/// verifier's `verifySpot`, with packages signed by the fixture's five signer keys.
contract FairValueGuardTest is EngineFixture {
    FairValueGuard internal guard;
    address internal owner_ = makeAddr("guard-owner");
    uint64 internal constant SIGMA = 18_531; // 4,500 bp over a trading year
    uint16 internal constant TICKER = 1; // the fixture's first Series

    function setUp() public override {
        super.setUp();
        guard = new FairValueGuard(lens, owner_, 120);
        vm.startPrank(owner_);
        guard.setSigma(lens.marketRef(m).seriesId, SIGMA);
        guard.setSpotSource(TICKER, IPrintVerifier(address(rsVerifier)), Policies.TSLA);
        vm.stopPrank();
        vm.warp(START + 150); // 150 s before the Window's expiry
    }

    function spot(uint256 e8) internal view returns (bytes memory) {
        return PrintSigner.five(Policies.TSLA, e8, vm.getBlockTimestamp());
    }

    function test_fairUp_isTheModelOnTheWindowsOpenAndTheVerifiedSpot() public {
        (uint256 up, int64 s) = guard.fairUpE6(m, spot(366e8));
        assertEq(s, 366e8, "median of the five packages");
        assertEq(up, FairValue.probUpE6(366e8, 365e8, SIGMA, 150), "open 365 (the fixture's print), 150 s left");
        assertGt(up, 500_000);
        assertEq(guard.previewFairUpE6(m, 366e8), up, "the view preview agrees without a proof");
        (uint256 even,) = guard.fairUpE6(m, spot(365e8));
        assertEq(even, 500_000, "an unmoved spot is even odds");
    }

    function test_spot_refusedWhenStaleTamperedOrForAnotherFeed() public {
        bytes memory old = PrintSigner.five(Policies.TSLA, 366e8, vm.getBlockTimestamp() - 121);
        vm.expectRevert(E.SpotTooOld.selector);
        guard.fairUpE6(m, old);
        bytes memory other = PrintSigner.five(bytes32("BTC"), 366e8, vm.getBlockTimestamp());
        vm.expectRevert(E.FeedIdMismatch.selector);
        guard.fairUpE6(m, other);
        bytes memory p = spot(366e8);
        p[40] = p[40] ^ 0x01; // a byte of the first package's value: its signature no longer recovers a signer
        vm.expectRevert(E.UnknownRedStoneSigner.selector);
        guard.fairUpE6(m, p);
    }

    function test_refusals_namedForEveryMissingInput() public {
        bytes32 bare = list(START + 600, START + 900, false);
        vm.expectRevert(abi.encodeWithSelector(FairValueGuard.OpenPrintMissing.selector, bare));
        guard.previewFairUpE6(bare, 366e8);
        vm.warp(START + 600);
        recordOpen(bare, 36_500_000_000);
        bytes32 sid = lens.marketRef(bare).seriesId;
        vm.expectRevert(abi.encodeWithSelector(FairValueGuard.SigmaNotSet.selector, sid));
        guard.previewFairUpE6(bare, 366e8);
        vm.prank(owner_);
        guard.setSigma(sid, SIGMA);
        uint16 ticker = lens.marketRef(bare).ticker;
        vm.expectRevert(abi.encodeWithSelector(FairValueGuard.NoSpotSource.selector, ticker));
        guard.fairUpE6(bare, spot(366e8));
        vm.expectRevert(abi.encodeWithSelector(FairValue.NonPositivePrice.selector, int256(0), int256(365e8)));
        guard.previewFairUpE6(bare, 0);
    }

    function test_parameters_ownerOnly_twoStepTransfer() public {
        address mallory = makeAddr("mallory");
        vm.startPrank(mallory);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, mallory));
        guard.setSigma(bytes32(0), 1);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, mallory));
        guard.setSpotSource(TICKER, IPrintVerifier(address(0)), 0);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, mallory));
        guard.setMaxSpotAge(1);
        vm.stopPrank();
        vm.prank(owner_);
        vm.expectRevert(FairValueGuard.BadSpotAge.selector);
        guard.setMaxSpotAge(0);
        vm.prank(owner_);
        guard.transferOwnership(mallory);
        assertEq(guard.owner(), owner_, "pending until accepted");
        vm.prank(mallory);
        guard.acceptOwnership();
        assertEq(guard.owner(), mallory);
    }

    function test_afterExpiry_tauFloorsAtFiveSeconds() public {
        vm.warp(START + 400);
        (uint256 up,) = guard.fairUpE6(m, spot(366e8));
        assertEq(up, FairValue.probUpE6(366e8, 365e8, SIGMA, 5));
    }
}
