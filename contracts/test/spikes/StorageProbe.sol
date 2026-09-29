// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

/// Spike X7 (S2.0) probe, deployed on Moderato: creates, clears and recreates slots so the receipts show what Tempo
/// charges for a new slot, what clearing earns (TIP-1060 storage credits) and what a credited recreate costs net.
contract StorageProbe {
    mapping(uint256 => uint256) public v;

    function fill(uint256 from, uint256 n) external {
        for (uint256 i; i < n; ++i) v[from + i] = 1;
    }

    function clear(uint256 from, uint256 n) external {
        for (uint256 i; i < n; ++i) v[from + i] = 0;
    }

    function bump(uint256 from, uint256 n) external {
        for (uint256 i; i < n; ++i) v[from + i] += 1;
    }
}
