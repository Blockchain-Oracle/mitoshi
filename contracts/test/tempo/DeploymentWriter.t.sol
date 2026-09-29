// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Test} from "forge-std/Test.sol";
import {DeploymentWriter} from "../../script/lib/DeploymentWriter.sol";

contract WriterHarness is DeploymentWriter {
    function run(address a, address b) external {
        recordContract("Alpha", a, "Alpha.sol:Alpha", false);
        recordContract("Beta", b, "Beta.sol:Beta", true);
        recordParam("lotBase", uint256(1000));
        recordRole("ROLLER", a);
        writePending("s0-writer-test");
    }
}

/// The pending file is what `scripts/deploy/finalize.ts` merges into a fragment, so its shape must hold.
contract DeploymentWriterTest is Test {
    function test_writesPendingFragment() public {
        WriterHarness h = new WriterHarness();
        h.run(address(0xA11CE), address(0xB0B));
        string memory path = string.concat("deployments/", vm.toString(block.chainid), "/s0-writer-test.pending.json");
        string memory json = vm.readFile(path);
        assertEq(vm.parseJsonUint(json, ".schema"), 1);
        assertEq(vm.parseJsonUint(json, ".chainId"), block.chainid);
        assertEq(vm.parseJsonString(json, ".area"), "s0-writer-test");
        assertEq(vm.parseJsonAddress(json, ".contracts.Alpha.address"), address(0xA11CE));
        assertEq(vm.parseJsonString(json, ".contracts.Beta.artifact"), "Beta.sol:Beta");
        assertTrue(vm.parseJsonBool(json, ".contracts.Beta.proxy"));
        assertEq(vm.parseJsonUint(json, ".params.lotBase"), 1000);
        assertEq(vm.parseJsonAddress(json, ".roles.ROLLER"), address(0xA11CE));
        vm.removeFile(path);
    }
}
