// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Vm} from "forge-std/Vm.sol";
import {FixedPointMathLib} from "solady/utils/FixedPointMathLib.sol";
import {IEngineLens} from "../../src/engine/interfaces/IEngineLens.sol";

/// @notice `packages/core/src/fair/guard-spec.json` joined to `venue-spec.json` (S24.1): a Series' id, ticker and σ on
///         its clock, and the RedStone feed the guard verifies for a ticker. Shared by the guard's deploy and its updates.
library GuardSpec {
    Vm private constant vm = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));

    function count(string memory spec) internal view returns (uint256 n) {
        while (vm.keyExistsJson(spec, string.concat(".series[", vm.toString(n), "]"))) ++n;
    }

    /// The spec's i-th Series: its id, ticker, symbol, and σE8 — `trading` on the trading year, `calendar` on the calendar
    /// year, `gap` so the whole weekend span carries one session's variance.
    function series(string memory venue, string memory spec, IEngineLens lens, uint256 i)
        internal
        view
        returns (bytes32 sid, uint16 ticker, string memory symbol, uint64 sigma)
    {
        string memory at = string.concat(".series[", vm.toString(i), "]");
        string memory key = vm.parseJsonString(spec, string.concat(at, ".key"));
        uint256 j;
        while (keccak256(bytes(vm.parseJsonString(venue, string.concat(".series[", vm.toString(j), "].key")))) != keccak256(bytes(key))) ++j;
        string memory v = string.concat(".series[", vm.toString(j), "]");
        ticker = uint16(vm.parseJsonUint(venue, string.concat(v, ".ticker")));
        symbol = vm.parseJsonString(venue, string.concat(v, ".symbol"));
        sid = lens.seriesIdOf(ticker, uint32(vm.parseJsonUint(venue, string.concat(v, ".cadenceSec"))), uint8(vm.parseJsonUint(venue, string.concat(v, ".basis"))));
        uint256 bps = vm.parseJsonUint(spec, string.concat(at, ".sigmaBps"));
        bytes32 clock = keccak256(bytes(vm.parseJsonString(spec, string.concat(at, ".clock"))));
        uint256 trading = vm.parseJsonUint(spec, ".tradingYearSec");
        if (clock == keccak256("calendar")) sigma = uint64(FixedPointMathLib.sqrt(bps * bps * 1e8 / vm.parseJsonUint(spec, ".calendarYearSec")));
        else if (clock == keccak256("gap")) sigma = uint64(FixedPointMathLib.sqrt(bps * bps * 1e8 * vm.parseJsonUint(spec, ".sessionSec") / (trading * vm.parseJsonUint(spec, ".gapSpanSec"))));
        else sigma = uint64(FixedPointMathLib.sqrt(bps * bps * 1e8 / trading));
    }

    /// The RedStone feed id the guard verifies for `symbol` (one per ticker).
    function spotFeed(string memory spec, string memory symbol) internal pure returns (bytes32) {
        return bytes32(bytes(vm.parseJsonString(spec, string.concat(".spotFeeds.", symbol))));
    }
}
