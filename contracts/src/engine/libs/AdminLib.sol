// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {EngineStorage} from "../EngineStorage.sol";
import {IEngineErrors as E} from "../EngineErrors.sol";
import {IEventsEngineEvents as Ev} from "../interfaces/IEventsEngineEvents.sol";
import {IPrintVerifier} from "../interfaces/IPrintVerifier.sol";
import {Grid} from "./Grid.sol";
import "../EngineTypes.sol";

// Ported from Agari 03b30abbbfe7ddc3cac4927c7c573e52f74d2d49:anchor/programs/agari-events/src/instructions/
// {admin_series.rs,policy_rules.rs,window_rules.rs,roller_open_window.rs}.

/// @title Series registration, append-only policy versions (PD-1) and the roller's `openWindow` (E-20…E-26).
/// @dev External library, delegatecalled by `EventsEngine`, which checks the caller's role first (admin / roller).
library AdminLib {
    // ------------------------------------------------------------------------------------------------ series

    /// @notice E-23: cadence, grid, caps. `decimals` is the collateral's (6 for pathUSD).
    function registerSeries(RegisterSeriesArgs calldata a, uint8 decimals) external returns (bytes32 seriesId) {
        EngineStorage.Layout storage l = EngineStorage.layout();
        if (!_cadenceValid(a.basis, a.cadenceSec)) revert E.BadAlignment();
        if (a.minLots == 0) revert E.BadGrid();
        uint64 cu = Grid.cashUnit(a.lotBase, a.tickBase, decimals);
        if (a.fillsCap == 0 || a.fillsCap > MAX_FILLS_CAP || a.evictionsCap > MAX_EVICTIONS_CAP || a.maxLeadSec == 0) {
            revert E.BadSeriesParams();
        }
        seriesId = EngineStorage.seriesIdOf(a.ticker, a.cadenceSec, a.basis);
        if (l.seriesIdxOf[seriesId] != 0) revert E.SeriesExists();
        uint32 idx = ++l.seriesCount;
        l.seriesIdxOf[seriesId] = idx;
        l.seriesIdOf[idx] = seriesId;
        l.series[idx] = Series({
            ticker: a.ticker,
            basis: a.basis,
            cadenceSec: a.cadenceSec,
            lotBase: a.lotBase,
            tickBase: a.tickBase,
            cashUnit: cu,
            minLots: a.minLots,
            nextIndex: 0,
            lastExpiry: 0,
            minRestSec: a.minRestSec,
            maxLeadSec: a.maxLeadSec,
            fillsCap: a.fillsCap,
            evictionsCap: a.evictionsCap,
            versionCount: 0
        });
        emit Ev.SeriesRegistered(seriesId, a.ticker, a.basis, a.cadenceSec, a.lotBase, a.tickBase, cu);
    }

    /// Regular/Token cadences divide one hour (a boundary is `ts % cadence == 0` on the clock); the Gap is one week.
    function _cadenceValid(uint8 basis, uint32 cadenceSec) private pure returns (bool) {
        if (basis == BASIS_REGULAR || basis == BASIS_TOKEN_24X7) {
            return cadenceSec >= 60 && cadenceSec % 60 == 0 && CADENCE_DIVIDES_SEC % cadenceSec == 0;
        }
        return basis == BASIS_GAP && cadenceSec == GAP_CADENCE_SEC;
    }

    // ------------------------------------------------------------------------------------------------ policy versions

    /// @notice E-25: append-only (`index == versionCount`, ≤ 8) and validated (E-09); a written version never changes.
    function addPolicyVersion(bytes32 seriesId, uint8 index, PolicyVersion calldata v) external {
        EngineStorage.Layout storage l = EngineStorage.layout();
        uint32 sIdx = l.seriesIdxOf[seriesId];
        if (sIdx == 0) revert E.UnknownSeries();
        Series storage s = l.series[sIdx];
        uint8 count = s.versionCount;
        if (index < count) revert E.PolicyVersionImmutable();
        if (index != count || index >= MAX_POLICY_VERSIONS) revert E.UnknownPolicyVersion();
        _validate(v, s.basis);
        l.versions[sIdx][index] = v;
        s.versionCount = count + 1;
        emit Ev.PolicyVersionAdded(seriesId, index, v.validFrom, v.validUntil, v.primary.source, v.check.source);
    }

    /// Agari `validate_policy_version` (prints.md §2.2 + D-013); every refusal is `BadPolicy`.
    function _validate(PolicyVersion calldata v, uint8 basis) private view {
        // 1. Validity range.
        _ok(v.validFrom < v.validUntil);
        // 2. Primary admissions; ADMIT_UNTIL_LOCK only for the Gap open.
        PrintPolicy calldata p = v.primary;
        _ok(p.closeAdmissionSec >= 1 && p.closeAdmissionSec != ADMIT_UNTIL_LOCK && p.openAdmissionSec >= 1);
        if (p.openAdmissionSec == ADMIT_UNTIL_LOCK) _ok(basis == BASIS_GAP);
        // 3. Primary per-source rules (also refuses source None, reserved sources and a zero feed).
        _sourceRules(p);
        // 4. Check policy: none at all, or a different source with its own window and a divergence bound.
        PrintPolicy calldata c = v.check;
        if (c.source == SOURCE_NONE) {
            _ok(_isZero(c) && v.maxDivergenceBps == 0 && v.checkAdmissionSec == 0);
            return;
        }
        _ok(c.source != p.source);
        _sourceRules(c);
        _ok(
            v.checkAdmissionSec >= 1 && v.checkAdmissionSec != ADMIT_UNTIL_LOCK && c.openAdmissionSec == v.checkAdmissionSec
                && c.closeAdmissionSec == v.checkAdmissionSec && v.maxDivergenceBps >= 1 && v.maxDivergenceBps <= 10_000
        );
        // D-013: the RedStone liveness threshold must be reachable inside the check window.
        if (c.source == SOURCE_REDSTONE) _ok(c.strictSec < v.checkAdmissionSec);
    }

    /// Per-source rules shared by the primary and the check policy. The verifier is the immutable contract that will
    /// prove this source's prints (D-016); it must say it proves this source.
    function _sourceRules(PrintPolicy calldata p) private view {
        _ok(p.feedId != bytes32(0) && p.verifier.code.length != 0);
        uint8 s = p.source;
        if (s == SOURCE_REDSTONE) {
            // ASCII feed id left-aligned ("TSLA" + zeros); all signers required inside strictSec (PD-1 anti-selection).
            _ok(p.strictSec >= 1 && p.minDelaySec == 0 && p.feedId[0] != 0);
        } else if (s == SOURCE_ATTESTED) {
            _ok(
                p.barLenSec >= 1 && p.minDelaySec >= 1 && p.openAdmissionSec > p.minDelaySec
                    && p.closeAdmissionSec > p.minDelaySec
            );
        } else if (s == SOURCE_DATA_STREAMS) {
            // Report window: validFrom ≤ T ≤ observations ≤ T + grace; a market-status mask; optional spread bound.
            uint16 version = uint16(bytes2(p.feedId));
            _ok(
                p.graceSec >= 1 && p.minDelaySec == 0 && p.statusMask != 0 && p.maxConfBps <= 10_000
                    && (version == 3 || version == 11)
            );
        } else {
            revert E.BadPolicy(); // None, and the reserved Pyth (1) / Switchboard (3) ids
        }
        try IPrintVerifier(p.verifier).source() returns (uint8 proves) {
            _ok(proves == s);
        } catch {
            revert E.BadPolicy();
        }
    }

    function _isZero(PrintPolicy calldata c) private pure returns (bool) {
        return c.verifier == address(0) && c.graceSec == 0 && c.minDelaySec == 0 && c.barLenSec == 0
            && c.openAdmissionSec == 0 && c.feedId == bytes32(0) && c.closeAdmissionSec == 0 && c.strictSec == 0
            && c.maxConfBps == 0 && c.maxAgeSec == 0 && c.statusMask == 0;
    }

    function _ok(bool cond) private pure {
        if (!cond) revert E.BadPolicy();
    }

    // ------------------------------------------------------------------------------------------------ roller

    /// @notice E-26: lists Window `index` of a Series with frozen admission deadlines. The engine has checked the
    ///         roller role; the mode must be Normal. Checks in Agari's order; the version is the highest covering both
    ///         boundaries (F-S2-07).
    function openWindow(OpenWindowArgs calldata a) external returns (bytes32 marketId) {
        EngineStorage.Layout storage l = EngineStorage.layout();
        if (l.cfg.mode != MODE_NORMAL) revert E.InvalidMode();
        uint32 sIdx = l.seriesIdxOf[a.seriesId];
        if (sIdx == 0) revert E.UnknownSeries();
        Series storage s = l.series[sIdx];
        uint8 version = _checkWindow(l, s, sIdx, a);

        PrintPolicy storage primary = l.versions[sIdx][version].primary;
        uint40 openDeadline = primary.openAdmissionSec == ADMIT_UNTIL_LOCK
            ? a.lockAt
            : a.tradingStart + uint40(primary.openAdmissionSec);
        uint40 closeDeadline = a.expiry + uint40(primary.closeAdmissionSec);

        marketId = EngineStorage.marketIdOf(a.seriesId, a.index);
        uint32 mIdx = ++l.cfg.nextMIdx;
        Market storage mk = l.markets[marketId];
        // Only the non-zero slots are written (s0, s4, s5): each new slot costs 250k gas on Tempo (A.1.7).
        mk.tradingStart = a.tradingStart;
        mk.lockAt = a.lockAt;
        mk.expiry = a.expiry;
        mk.openDeadline = openDeadline;
        mk.closeDeadline = closeDeadline;
        mk.seriesIdx = sIdx;
        mk.policyVersion = version;
        mk.basis = s.basis;
        mk.eventSeq = 1;
        mk.openKind = a.openKind;
        mk.closeKind = a.closeKind;
        mk.index = a.index;
        mk.mIdx = mIdx;
        l.marketIdOf[mIdx] = marketId;
        s.nextIndex = a.index + 1;
        s.lastExpiry = a.expiry;
        emit Ev.WindowOpened(
            marketId,
            1,
            a.seriesId,
            a.index,
            mIdx,
            a.tradingStart,
            a.lockAt,
            a.expiry,
            openDeadline,
            closeDeadline,
            version,
            a.openKind,
            a.closeKind,
            s.basis
        );
    }

    /// Agari `check_window` steps 4–10; returns the highest policy version covering both boundaries.
    function _checkWindow(EngineStorage.Layout storage l, Series storage s, uint32 sIdx, OpenWindowArgs calldata a)
        private
        view
        returns (uint8)
    {
        uint256 nowTs = block.timestamp;
        // 4. Index.
        if (a.index != s.nextIndex) revert E.BadWindowIndex();
        // 5. Ordering and a lock still ahead (and within the node pool's uint32 expiry).
        if (!(a.tradingStart < a.lockAt && a.lockAt <= a.expiry && a.lockAt > nowTs && a.lockAt <= type(uint32).max)) {
            revert E.BadHorizon();
        }
        // 6. Back-to-back at most.
        if (a.tradingStart < s.lastExpiry) revert E.WindowOverlap();
        // 7. Alignment: full clock-aligned Windows only; the Gap span is bounded.
        uint256 span = a.expiry - a.tradingStart;
        if (s.basis == BASIS_GAP) {
            if (span > MAX_GAP_DURATION_SEC) revert E.BadHorizon();
        } else if (a.tradingStart % s.cadenceSec != 0 || span != s.cadenceSec || a.lockAt != a.expiry) {
            revert E.BadAlignment();
        }
        // 8. Listing horizon.
        if (a.tradingStart > nowTs + s.maxLeadSec) revert E.BadHorizon();
        // 9. Boundary kinds (Intraday 0 / SessionOpen 1 / SessionClose 2).
        if (a.openKind > 2 || a.closeKind > 2) revert E.BadAlignment();
        // 10. The highest version covering both boundaries.
        for (uint256 i = s.versionCount; i > 0; --i) {
            PolicyVersion storage v = l.versions[sIdx][uint8(i - 1)];
            if (v.validFrom <= a.tradingStart && a.expiry <= v.validUntil) return uint8(i - 1);
        }
        revert E.SourceNotCovered();
    }
}
