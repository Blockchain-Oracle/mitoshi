// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Test} from "forge-std/Test.sol";
import {AttestedPrintVerifier} from "../../../src/engine/verifiers/AttestedPrintVerifier.sol";
import {PrintQuery} from "../../../src/engine/interfaces/IPrintVerifier.sol";
import {IEngineErrors as E} from "../../../src/engine/EngineErrors.sol";
import {PrintSigner as S} from "../harness/PrintSigner.sol";

// Ported from Agari 03b30abbbfe7ddc3cac4927c7c573e52f74d2d49:anchor/crates/agari-common/src/print/attested/tests.rs
// (rules and order; the ed25519 message becomes EIP-712, E-46).
/// A.5.3: domain = chain + the calling engine; the struct binds market and slot; replay across engines, markets and slots
/// is refused; bar alignment, correction cutoff, attestor membership, low-s, value bounds.
contract AttestedVerifierTest is Test {
    uint40 internal constant T = 1_789_156_800;
    uint256 internal constant ATTESTOR = 0xA77E57;
    AttestedPrintVerifier internal v;
    address internal engineA = makeAddr("engine-a");
    address internal engineB = makeAddr("engine-b");

    function setUp() public {
        address[] memory a = new address[](2);
        a[0] = vm.addr(ATTESTOR);
        a[1] = makeAddr("second-attestor");
        v = new AttestedPrintVerifier(a);
        vm.warp(T + 120);
    }

    function q(bytes32 market, uint8 which) internal pure returns (PrintQuery memory) {
        return PrintQuery(market, which, T, keccak256("jupiter-price-v3-median3:TSLAx"), 0, 0, 10, 60, 0, 0);
    }

    function test_verifiesForTheSigningEngineOnly() public {
        PrintQuery memory p = q(keccak256("m1"), 1);
        bytes memory proof = S.attested(v, ATTESTOR, engineA, p, 36_547_600, -5, T + 30);
        vm.prank(engineA);
        (int256 price, int8 expo, uint40 ts, uint8 n) = v.verifyPrint(proof, p);
        assertEq(price, 36_547_600);
        assertEq(expo, -5);
        assertEq(ts, T);
        assertEq(n, 1);
        vm.prank(engineB); // another engine: another domain → another signer
        vm.expectRevert(E.UnknownAttestor.selector);
        v.verifyPrint(proof, p);
        vm.prank(engineA); // another market
        vm.expectRevert(E.UnknownAttestor.selector);
        v.verifyPrint(proof, q(keccak256("m2"), 1));
        vm.prank(engineA); // another slot
        vm.expectRevert(E.UnknownAttestor.selector);
        v.verifyPrint(proof, q(keccak256("m1"), 0));
        vm.chainId(4217); // another chain
        vm.prank(engineA);
        vm.expectRevert(E.UnknownAttestor.selector);
        v.verifyPrint(proof, p);
    }

    function test_barAndCutoffRules() public {
        PrintQuery memory p = q(keccak256("m1"), 1);
        bytes memory early = S.attested(v, ATTESTOR, engineA, p, 1, 0, T + 9);
        vm.prank(engineA);
        vm.expectRevert(E.BadAttestation.selector); // fetched before the correction cutoff
        v.verifyPrint(early, p);
        bytes memory future = S.attested(v, ATTESTOR, engineA, p, 1, 0, T + 121);
        vm.prank(engineA);
        vm.expectRevert(E.BadAttestation.selector); // fetched in the future
        v.verifyPrint(future, p);
        (int64 price, int8 expo,, uint40 fetchedAt, bytes memory sig) =
            abi.decode(S.attested(v, ATTESTOR, engineA, p, 1, 0, T + 30), (int64, int8, uint40, uint40, bytes));
        bytes memory misaligned = abi.encode(price, expo, T - 59, fetchedAt, sig);
        vm.prank(engineA);
        vm.expectRevert(E.BadAttestation.selector); // bar must end at T
        v.verifyPrint(misaligned, p);
    }

    function test_signerAndValueRules() public {
        PrintQuery memory p = q(keccak256("m1"), 1);
        bytes memory stranger = S.attested(v, 0xBAD, engineA, p, 1, 0, T + 30);
        vm.prank(engineA);
        vm.expectRevert(E.UnknownAttestor.selector);
        v.verifyPrint(stranger, p);
        bytes memory zero = S.attested(v, ATTESTOR, engineA, p, 0, 0, T + 30);
        vm.prank(engineA);
        vm.expectRevert(E.InvalidPrintValue.selector);
        v.verifyPrint(zero, p);
        bytes memory expo = S.attested(v, ATTESTOR, engineA, p, 1, 1, T + 30);
        vm.prank(engineA);
        vm.expectRevert(E.InvalidPrintValue.selector);
        v.verifyPrint(expo, p);
        // A high-s twin is refused (OZ tryRecover), never accepted as a second valid encoding.
        (int64 pr, int8 ex, uint40 bs, uint40 fa, bytes memory sig) =
            abi.decode(S.attested(v, ATTESTOR, engineA, p, 5, 0, T + 30), (int64, int8, uint40, uint40, bytes));
        (bytes32 r, bytes32 s) = (bytes32(_word(sig, 0)), bytes32(_word(sig, 32)));
        uint8 vv = uint8(sig[64]);
        bytes32 highS = bytes32(0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141 - uint256(s));
        bytes memory twin = abi.encode(pr, ex, bs, fa, abi.encodePacked(r, highS, vv == 27 ? uint8(28) : uint8(27)));
        vm.prank(engineA);
        vm.expectRevert(E.BadAttestation.selector);
        v.verifyPrint(twin, p);
    }

    function test_constructorRefusesBadSets() public {
        address[] memory none = new address[](0);
        vm.expectRevert(E.BadSignerSet.selector);
        new AttestedPrintVerifier(none);
        address[] memory five = S.signers(5);
        vm.expectRevert(E.BadSignerSet.selector);
        new AttestedPrintVerifier(five);
        address[] memory dup = S.signers(2);
        dup[1] = dup[0];
        vm.expectRevert(E.BadSignerSet.selector);
        new AttestedPrintVerifier(dup);
        assertEq(v.attestors().length, 2);
        assertEq(v.source(), 4);
    }

    function test_verifySpot() public {
        bytes32 feed = keccak256("jupiter-price-v3-median3:TSLAx");
        bytes32 digest = keccak256(
            abi.encodePacked("\x19\x01", v.domainSeparator(engineA), keccak256(abi.encode(v.SPOT_TYPEHASH(), feed, int64(358_99), int8(-2), uint40(T + 100))))
        );
        (uint8 vv, bytes32 r, bytes32 s) = vm.sign(ATTESTOR, digest);
        bytes memory proof = abi.encode(int64(358_99), int8(-2), uint40(T + 100), abi.encodePacked(r, s, vv));
        vm.prank(engineA);
        (int256 price,, uint40 ts,) = v.verifySpot(proof, feed, 60);
        assertEq(price, 358_99);
        assertEq(ts, T + 100);
        vm.warp(T + 161);
        vm.prank(engineA);
        vm.expectRevert(E.SpotTooOld.selector);
        v.verifySpot(proof, feed, 60);
    }

    function _word(bytes memory b, uint256 at) internal pure returns (uint256 w) {
        assembly {
            w := mload(add(add(b, 32), at))
        }
    }
}
