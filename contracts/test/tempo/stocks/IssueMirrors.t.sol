// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Test} from "forge-std/Test.sol";
import {ITIP20} from "tempo-std/interfaces/ITIP20.sol";
import {ITIP20RolesAuth} from "tempo-std/interfaces/ITIP20RolesAuth.sol";
import {MirrorIssuer} from "../../../script/stocks/MirrorIssuer.sol";
import {IssueMirrors} from "../../../script/stocks/IssueMirrors.s.sol";

contract IssuerHarness is MirrorIssuer {
    function doIssue(string memory t) external returns (address) {
        return issue(t, address(this));
    }

    function doHandOver(address m, address adapter, address safe, uint256 cap) external {
        handOver(m, adapter, safe, address(this), cap);
    }

    function logo(string memory t) external pure returns (string memory) {
        return mirrorLogo(t);
    }
}

/// Plan B.2 in the local Tempo VM (real TIP-20 factory).
contract IssueMirrorsTest is Test {
    IssuerHarness h;
    address adapter = makeAddr("adapterProxy");
    address safe = makeAddr("safe");

    function setUp() public {
        h = new IssuerHarness();
    }

    function _has(address m, address who, bytes32 role) internal view returns (bool) {
        return ITIP20RolesAuth(m).hasRole(who, role);
    }

    function test_issuesAllFiveWithTheRightShape() public {
        string[5] memory t = new IssueMirrors().tickers();
        for (uint256 i; i < 5; i++) {
            ITIP20 m = ITIP20(h.doIssue(t[i]));
            assertEq(m.symbol(), string.concat("b", t[i]));
            assertEq(m.name(), string.concat("Bridged ", t[i], " Stock Token (unofficial)"));
            assertEq(m.currency(), t[i]);
            assertEq(address(m.quoteToken()), 0x20C0000000000000000000000000000000000000);
            assertEq(m.decimals(), 6);
            assertEq(m.transferPolicyId(), 1);
            assertEq(m.logoURI(), h.logo(t[i]));
            assertLe(bytes(m.logoURI()).length, 256);
            assertEq(vm.indexOf(string.concat(m.name(), m.symbol(), m.logoURI()), "Robinhood"), type(uint256).max);
        }
    }

    function test_idempotentAtPredictedAddress() public {
        address a = h.doIssue("TSLA");
        assertEq(h.doIssue("TSLA"), a);
    }

    function test_handOverRoles() public {
        address m = h.doIssue("AMD");
        ITIP20 t = ITIP20(m);
        h.doHandOver(m, adapter, safe, 1_000e6);
        assertEq(t.supplyCap(), 1_000e6);
        assertTrue(_has(m, adapter, t.ISSUER_ROLE()), "adapter issues");
        assertFalse(_has(m, address(h), t.ISSUER_ROLE()), "nobody else issues");
        assertTrue(_has(m, safe, t.PAUSE_ROLE()));
        assertTrue(_has(m, safe, t.UNPAUSE_ROLE()));
        assertTrue(_has(m, safe, t.BURN_BLOCKED_ROLE()));
        assertTrue(_has(m, safe, bytes32(0)), "Safe is admin");
        assertFalse(_has(m, address(h), bytes32(0)), "issuer renounced");
        assertFalse(_has(m, adapter, t.PAUSE_ROLE()));
    }

    function test_handOverWhenSafeIsIssuerKeepsAdmin() public {
        address m = h.doIssue("NFLX");
        h.doHandOver(m, adapter, address(h), 1_000e6);
        assertTrue(_has(m, address(h), bytes32(0)));
        assertTrue(_has(m, adapter, ITIP20(m).ISSUER_ROLE()));
        h.doHandOver(m, adapter, address(h), 1_000e6); // idempotent re-run
    }
}
