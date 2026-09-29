// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Test} from "forge-std/Test.sol";
import {StdPrecompiles} from "tempo-std/StdPrecompiles.sol";
import {StorageProbe} from "./StorageProbe.sol";

/// X7, local half: forge's Tempo mode accrues TIP-1060 storage credits to the clearing contract and reports the
/// end-of-tx refund in `lastCallGas().gasRefunded`, so `gasTotalUsed − gasRefunded` reproduces the Moderato receipts
/// exactly (acceptance/S2.md: 1,033,438 cold; 53,450 credited). `Gas.t.sol` snapshots both columns this way.
contract X7LocalCreditsTest is Test {
    function test_localRefundsMatchModerato() public {
        StorageProbe p = new StorageProbe();
        p.fill(0, 4);
        assertEq(vm.lastCallGas().gasTotalUsed, 1_033_438, "4 new slots, as on Moderato");
        p.clear(0, 4);
        assertEq(StdPrecompiles.STORAGE_CREDITS.balanceOf(address(p)), 4);
        p.fill(100, 4);
        uint256 net = vm.lastCallGas().gasTotalUsed - uint256(uint64(vm.lastCallGas().gasRefunded));
        assertEq(net, 53_450, "credited, as on Moderato (receipt gasUsed)");
        assertEq(StdPrecompiles.STORAGE_CREDITS.balanceOf(address(p)), 0);
    }
}
