// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import "../../../src/engine/EngineTypes.sol";

/// Launch policy shapes (venue-spec: RedStone strict 300 / admission 900; check admission 120, divergence 25 bp).
library Policies {
    bytes32 internal constant TSLA = bytes32("TSLA");

    function redstone(address verifier, uint32 admission, uint32 strict) internal pure returns (PrintPolicy memory p) {
        p.verifier = verifier;
        p.source = SOURCE_REDSTONE;
        p.feedId = TSLA;
        p.strictSec = strict;
        p.openAdmissionSec = admission;
        p.closeAdmissionSec = admission;
    }

    function attested(address verifier, uint32 admission) internal pure returns (PrintPolicy memory p) {
        p.verifier = verifier;
        p.source = SOURCE_ATTESTED;
        p.feedId = keccak256("jupiter-price-v3-median3:TSLAx");
        p.barLenSec = 60;
        p.minDelaySec = 10;
        p.openAdmissionSec = admission;
        p.closeAdmissionSec = admission;
    }

    function dataStreams(address verifier, uint32 admission) internal pure returns (PrintPolicy memory p) {
        p.verifier = verifier;
        p.source = SOURCE_DATA_STREAMS;
        p.feedId = 0x000bc7e431fcd497f06b9e1dea869bcda3d05049d0601f3d1e56e64c8cdd05ac; // SPY RegularHours v11
        p.graceSec = 5;
        p.statusMask = uint8(1 << 2);
        p.openAdmissionSec = admission;
        p.closeAdmissionSec = admission;
    }

    /// RedStone primary only (the testnet launch version).
    function launch(address rs, uint40 from, uint40 until) internal pure returns (PolicyVersion memory v) {
        v.validFrom = from;
        v.validUntil = until;
        v.primary = redstone(rs, 900, 300);
    }

    /// RedStone primary + a checked second source (120 s window, 25 bp).
    function checked(PolicyVersion memory v, PrintPolicy memory check) internal pure returns (PolicyVersion memory) {
        v.check = check;
        v.maxDivergenceBps = 25;
        v.checkAdmissionSec = 120;
        return v;
    }
}
