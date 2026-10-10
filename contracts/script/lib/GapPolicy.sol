// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import "../../src/engine/EngineTypes.sol";

/// @title The weekend Gap on Chainlink Data Streams (S6, G-03, D-217).
/// @notice Version 0 of a Gap Series where Data Streams is configured (mainnet): the ticker's RegularHours v11 stream is
///         the primary — Friday's close report can still be fetched and verified on Monday, so the open print admits until
///         the lock (`ADMIT_UNTIL_LOCK`, the Gap's own rule) — and RedStone is the check source inside the spec's check
///         window, recorded live at each boundary; a check missed past its window settles single-source (the engine's
///         `SINGLE_SOURCE` flag), never a void. Where Data Streams isn't configured (Moderato, Q-011) the Gap stays on
///         RedStone with the print archive behind its Friday print (D-035; `EngineCheck.launchPolicy`).
library GapPolicy {
    /// v11 `marketStatus` the Gap's two prints may carry: 2 Open (Monday's 09:30:00 print) and 5 Closed (a report just
    /// after Friday's close); 0 Unknown is refused. Boundary statuses are unconfirmed until a credentialed report (D-217).
    uint8 internal constant STATUS_OPEN_OR_CLOSED = uint8((1 << 2) | (1 << 5));

    struct Params {
        address dataStreams;
        bytes32 dataStreamsFeed;
        uint16 graceSec;
        address redstone;
        bytes32 redstoneFeed;
        uint32 strictSec;
        uint32 admissionSec;
        uint32 checkAdmissionSec;
        uint16 maxDivergenceBps;
    }

    function dataStreamsPrimary(Params memory p) internal pure returns (PolicyVersion memory v) {
        v.validFrom = 0;
        v.validUntil = OPEN_ENDED;
        v.primary.verifier = p.dataStreams;
        v.primary.source = SOURCE_DATA_STREAMS;
        v.primary.feedId = p.dataStreamsFeed;
        v.primary.graceSec = p.graceSec;
        v.primary.statusMask = STATUS_OPEN_OR_CLOSED;
        v.primary.openAdmissionSec = ADMIT_UNTIL_LOCK;
        v.primary.closeAdmissionSec = p.admissionSec;
        v.check.verifier = p.redstone;
        v.check.source = SOURCE_REDSTONE;
        v.check.feedId = p.redstoneFeed;
        v.check.strictSec = p.strictSec;
        v.check.openAdmissionSec = p.checkAdmissionSec;
        v.check.closeAdmissionSec = p.checkAdmissionSec;
        v.checkAdmissionSec = p.checkAdmissionSec;
        v.maxDivergenceBps = p.maxDivergenceBps;
    }
}
