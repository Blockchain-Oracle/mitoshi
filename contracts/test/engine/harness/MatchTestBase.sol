// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Test} from "forge-std/Test.sol";
import {MatchHarness} from "./MatchHarness.sol";
import {IEngineErrors} from "../../../src/engine/EngineErrors.sol";
import "../../../src/engine/EngineTypes.sol";

// Ported from Agari 03b30abbbfe7ddc3cac4927c7c573e52f74d2d49:anchor/programs/agari-events/src/matching/tests/support.rs
// (`order(...)`, `OrderExt`, the actor numbering).
abstract contract MatchTestBase is Test {
    uint40 internal constant START = 1_000_000;
    MatchHarness internal h;
    bytes32 internal m;
    address[] internal actors;

    function setUp() public virtual {
        vm.warp(START);
        h = new MatchHarness();
        m = h.openTestMarket(START, START + 100_000, true);
    }

    /// Actor `n` (Agari numbers its seats; the holder address is the key here).
    function who(uint256 n) internal returns (address a) {
        a = address(uint160(0xA11CE0000 + n));
        for (uint256 i; i < actors.length; ++i) if (actors[i] == a) return a;
        actors.push(a);
    }

    /// An order with test defaults: expires 500 s out, CancelTaker, 16 fills, 16 evictions.
    function order(uint8 kind, uint16 price, uint64 lots, uint8 orderType) internal view returns (PlaceArgs memory) {
        return PlaceArgs({
            marketId: m,
            kind: kind,
            orderType: orderType,
            selfMatch: SELF_CANCEL_TAKER,
            priceTicks: price,
            lots: lots,
            expireTs: uint40(START + 500),
            maxFills: 16,
            maxEvictions: 16,
            useCredit: false,
            withdrawProceeds: false,
            clientId: 0
        });
    }

    function place(uint256 n, PlaceArgs memory a) internal returns (PlaceResult memory r) {
        address actor = who(n);
        vm.prank(actor);
        r = h.place(a);
        assertInvariants();
    }

    function placeRevert(uint256 n, PlaceArgs memory a, bytes4 err) internal {
        address actor = who(n);
        uint256 vaultBefore = h.mvault();
        vm.prank(actor);
        vm.expectRevert(err);
        h.place(a);
        assertEq(h.mvault(), vaultBefore);
        assertInvariants();
    }

    function seedPair(uint256 yesTo, uint256 noTo, uint64 lots) internal {
        h.seedPair(m, who(yesTo), who(noTo), lots);
    }

    function pos(uint256 n) internal returns (Position memory) {
        return h.position(m, who(n));
    }

    function assertInvariants() internal view {
        string memory err = h.check(m, actors);
        assertEq(err, "", "invariant");
    }

    function mask(uint8 path) internal pure returns (uint8) {
        return uint8(1 << path);
    }
}
