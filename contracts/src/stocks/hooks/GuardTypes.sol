// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {SessionState} from "../interfaces/IStockReference.sol";

/// @notice StockGuardHook's per-pool configuration and its pure rules (plan B.3.3; defaults Q-024).
library GuardTypes {
    uint16 internal constant MAX_BAND_BPS = 2_000;

    enum OffHoursMode {
        REFUSE,
        WIDEN
    }

    /// Why a mirror can't trade, in the order the guard checks (NO_POOL only from views).
    enum Block {
        NONE,
        HALTED,
        NO_REFERENCE,
        UNSYNCED,
        ISSUER_PAUSED,
        ORACLE_PAUSED,
        MIRROR_PAUSED,
        CA_WINDOW,
        NO_POOL
    }

    struct GuardParams {
        uint16 bandRegularBps;
        uint16 bandExtendedBps;
        uint16 bandClosedBps;
        uint32 maxAgeRegular;
        uint32 maxAgeClosed;
        uint32 caWindow;
        uint32 maxSyncAge;
        OffHoursMode offHoursMode;
        bool requireVerified;
    }

    struct Guard {
        address mirror;
        uint16 bandRegularBps;
        uint16 bandExtendedBps;
        uint16 bandClosedBps;
        uint32 maxAgeRegular;
        uint32 maxAgeClosed;
        uint32 caWindow;
        uint32 maxSyncAge;
        OffHoursMode offHoursMode;
        bool requireVerified;
        bool registered;
    }

    error BadGuardParams();

    /// @notice Q-024: 150/300/500 bps, 120 s regular age, 4 d closed age, 900 s CA window, 26 h sync age, WIDEN.
    function defaults() internal pure returns (GuardParams memory) {
        return GuardParams(150, 300, 500, 120, 345_600, 900, 93_600, OffHoursMode.WIDEN, true);
    }

    function validate(GuardParams calldata p) internal pure {
        if (
            p.bandRegularBps == 0 || p.bandExtendedBps == 0 || p.bandClosedBps == 0 || p.bandRegularBps > MAX_BAND_BPS
                || p.bandExtendedBps > MAX_BAND_BPS || p.bandClosedBps > MAX_BAND_BPS || p.maxAgeRegular == 0
                || p.maxAgeClosed == 0 || p.maxSyncAge == 0
        ) revert BadGuardParams();
    }

    function fromParams(address mirror, GuardParams calldata p) internal pure returns (Guard memory) {
        return Guard(
            mirror,
            p.bandRegularBps,
            p.bandExtendedBps,
            p.bandClosedBps,
            p.maxAgeRegular,
            p.maxAgeClosed,
            p.caWindow,
            p.maxSyncAge,
            p.offHoursMode,
            p.requireVerified,
            true
        );
    }

    /// @return bps the band for `s`, maxAge the reference age allowed, open false when the session refuses swaps.
    ///         REGULAR → regular band; EXTENDED → extended band (regular age); CLOSED/UNKNOWN → REFUSE, or WIDEN to
    ///         the closed band with the closed age.
    function sessionRule(Guard memory g, SessionState s) internal pure returns (uint16 bps, uint32 maxAge, bool open) {
        if (s == SessionState.REGULAR) return (g.bandRegularBps, g.maxAgeRegular, true);
        if (s == SessionState.EXTENDED) return (g.bandExtendedBps, g.maxAgeRegular, true);
        return (g.bandClosedBps, g.maxAgeClosed, g.offHoursMode == OffHoursMode.WIDEN);
    }

    /// @notice Inside `window` seconds either side of a scheduled multiplier switch (1 = none ever scheduled).
    function inWindow(uint256 effectiveAt, uint32 window) internal view returns (bool) {
        if (effectiveAt <= 1 || window == 0) return false;
        uint256 d = block.timestamp > effectiveAt ? block.timestamp - effectiveAt : effectiveAt - block.timestamp;
        return d < window;
    }
}
