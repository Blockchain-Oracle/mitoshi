// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

// Ported from Masayume 68f7a09:contracts/src/vault/VaultTally.sol (unchanged but the pragma; A.4.1 "VaultTally kept").

import {IEventVault} from "./IEventVault.sol";

/// @title Per-owner, per-Window tallies — the vault's own history, readable in two calls.
/// @notice Shannon's RPC serves `eth_getLogs` over at most 1,000 blocks at a time and blocks are
///         sub-second, so a portfolio cannot be rebuilt from events in a browser. The vault keeps
///         what a settled round needs in storage: what was bought and sold per side, what it cost
///         and returned, and the settlement payout. Events still carry every fill for auditors.
/// @dev Keyed by the venue's market id; no pool address is stored (AD-10).
abstract contract VaultTally is IEventVault {
    struct Tally {
        uint128 costBase;
        uint128 proceedsBase;
        uint128 payoutBase;
        uint128 boughtUpRaw;
        uint128 boughtDownRaw;
        uint128 soldUpRaw;
        uint128 soldDownRaw;
        uint64 firstAtSec;
        uint64 lastAtSec;
        uint64 settledAtSec;
        uint32 fillCount;
    }

    mapping(address owner => mapping(bytes32 marketId => Tally)) public tallyOf;
    mapping(address owner => bytes32[] marketIds) private _marketsOf;

    function marketCountOf(address owner) external view returns (uint256) {
        return _marketsOf[owner].length;
    }

    /// @notice The Windows an owner has traded through the vault, oldest first, paged.
    function marketsOf(address owner, uint256 offset, uint256 limit) external view returns (bytes32[] memory page) {
        bytes32[] storage all = _marketsOf[owner];
        if (offset >= all.length) return page;
        uint256 end = offset + limit;
        if (end > all.length) end = all.length;
        page = new bytes32[](end - offset);
        for (uint256 i = offset; i < end; i++) {
            page[i - offset] = all[i];
        }
    }

    function _recordFill(address owner, bytes32 marketId, uint8 outcomeIdx, bool isBuy, uint256 cashDelta, uint256 tokenDelta) internal {
        if (tokenDelta == 0 && cashDelta == 0) return;
        Tally storage t = tallyOf[owner][marketId];
        uint64 nowSec = uint64(block.timestamp);
        if (t.fillCount == 0) {
            _marketsOf[owner].push(marketId);
            t.firstAtSec = nowSec;
        }
        t.lastAtSec = nowSec;
        t.fillCount += 1;
        if (isBuy) {
            t.costBase += uint128(cashDelta);
            if (outcomeIdx == 0) t.boughtUpRaw += uint128(tokenDelta);
            else t.boughtDownRaw += uint128(tokenDelta);
        } else {
            t.proceedsBase += uint128(cashDelta);
            if (outcomeIdx == 0) t.soldUpRaw += uint128(tokenDelta);
            else t.soldDownRaw += uint128(tokenDelta);
        }
    }

    function _recordSettlement(address owner, bytes32 marketId, uint256 payout) internal {
        Tally storage t = tallyOf[owner][marketId];
        t.payoutBase += uint128(payout);
        t.settledAtSec = uint64(block.timestamp);
    }
}
