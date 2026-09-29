// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Test} from "forge-std/Test.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {StdPrecompiles} from "tempo-std/StdPrecompiles.sol";
import {ITIP20} from "tempo-std/interfaces/ITIP20.sol";
import {LaunchRegistry} from "../../../src/launch/LaunchRegistry.sol";
import {ReservedCodes} from "../../../src/launch/ReservedCodes.sol";

/// LaunchRegistry beyond the stablecoin batch: the reserved-code guard (and its TS twin's data), memecoin recording,
/// owner powers and paging.
contract LaunchRegistryTest is Test {
    ITIP20 constant PATH_USD = ITIP20(0x20C0000000000000000000000000000000000000);
    string constant CODES_JSON = "../packages/core/src/launch/reserved-codes.json";

    LaunchRegistry registry;
    address launchpad = makeAddr("launchpad");

    function setUp() public {
        registry = new LaunchRegistry(address(this));
    }

    // ── reserved codes ─────────────────────────────────────────────────────────────────────────────────────────────

    /// Every code in the JSON (the TS guard's data) is reserved on chain, and the table has exactly that many.
    function test_reservedTable_matchesTheJsonTwin() public view {
        string[] memory all = vm.parseJsonStringArray(vm.readFile(CODES_JSON), ".all");
        assertEq(all.length, ReservedCodes.COUNT);
        for (uint256 i; i < all.length; i++) assertTrue(registry.isReservedCode(all[i]), all[i]);
    }

    function test_reserved_isoStockAndUsd_caseInsensitive() public view {
        string[10] memory yes = ["USD", "usd", "EUR", "Jpy", "XAU", "TSLA", "tsla", "GOOGL", "SPY", ""];
        for (uint256 i; i < yes.length; i++) assertTrue(registry.isReservedCode(yes[i]), yes[i]);
    }

    function test_reserved_freeCodesAndTooLong() public view {
        string[5] memory no = ["MEOW", "PEPE", "USDX", "TSLAX", "ABCDEFGHI"];
        for (uint256 i; i < no.length; i++) assertFalse(registry.isReservedCode(no[i]), no[i]);
    }

    function test_reserveCodes_ownerOnlyAndGrows() public {
        string[] memory add = new string[](1);
        add[0] = "btsla";
        assertFalse(registry.isReservedCode("BTSLA"));
        vm.prank(makeAddr("stranger"));
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, makeAddr("stranger")));
        registry.reserveCodes(add);
        registry.reserveCodes(add);
        assertTrue(registry.isReservedCode("BTSLA"));
        assertTrue(registry.isReservedCode("bTSLA"));

        add[0] = "TOOLONGCODE";
        vm.expectRevert(abi.encodeWithSelector(LaunchRegistry.ReservedCode.selector, "TOOLONGCODE"));
        registry.reserveCodes(add);
    }

    // ── memecoins (S17b's CurveLaunchpad) ──────────────────────────────────────────────────────────────────────────

    function _meme(string memory currency, bytes32 salt) internal returns (address) {
        return StdPrecompiles.TIP20_FACTORY.createToken("Meow", "MEOW", currency, PATH_USD, launchpad, salt);
    }

    function test_memecoin_onlyTheLaunchpadRecords() public {
        address meme = _meme("MEOW", keccak256("m1"));
        vm.expectRevert(abi.encodeWithSelector(LaunchRegistry.NotCurveLaunchpad.selector, address(this)));
        registry.recordMemecoin(meme, address(this), "");

        registry.setCurveLaunchpad(launchpad);
        vm.prank(makeAddr("x"));
        vm.expectRevert(abi.encodeWithSelector(LaunchRegistry.NotCurveLaunchpad.selector, makeAddr("x")));
        registry.recordMemecoin(meme, address(this), "");

        address creator = makeAddr("creator");
        vm.prank(launchpad);
        registry.recordMemecoin(meme, creator, "ipfs://meow");
        LaunchRegistry.Launch memory l = registry.launchOf(meme);
        assertEq(uint8(l.kind), uint8(LaunchRegistry.Kind.Memecoin));
        assertEq(l.creator, creator);
    }

    function test_memecoin_reservedCurrencyRefused() public {
        registry.setCurveLaunchpad(launchpad);
        address fake = _meme("TSLA", keccak256("m2"));
        vm.prank(launchpad);
        vm.expectRevert(abi.encodeWithSelector(LaunchRegistry.ReservedCode.selector, "TSLA"));
        registry.recordMemecoin(fake, launchpad, "");
    }

    function test_setCurveLaunchpad_onceByOwner() public {
        vm.prank(makeAddr("stranger"));
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, makeAddr("stranger")));
        registry.setCurveLaunchpad(launchpad);
        vm.expectRevert(LaunchRegistry.ZeroAddress.selector);
        registry.setCurveLaunchpad(address(0));
        registry.setCurveLaunchpad(launchpad);
        vm.expectRevert(abi.encodeWithSelector(LaunchRegistry.CurveLaunchpadAlreadySet.selector, launchpad));
        registry.setCurveLaunchpad(makeAddr("other"));
    }

    // ── paging and limits ──────────────────────────────────────────────────────────────────────────────────────────

    function test_tokensSlice_pages() public {
        registry.setCurveLaunchpad(launchpad);
        address[] memory made = new address[](3);
        for (uint256 i; i < 3; i++) {
            made[i] = _meme(string.concat("MEW", vm.toString(i)), keccak256(abi.encode("p", i)));
            vm.prank(launchpad);
            registry.recordMemecoin(made[i], launchpad, "");
        }
        address[] memory page = registry.tokensSlice(1, 5);
        assertEq(page.length, 2);
        assertEq(page[0], made[1]);
        assertEq(page[1], made[2]);
        assertEq(registry.tokensSlice(3, 5).length, 0);
        assertEq(registry.tokensSlice(9, 5).length, 0);
    }

    function test_metadataUriCap() public {
        address creator = makeAddr("creator");
        vm.prank(creator);
        address t = StdPrecompiles.TIP20_FACTORY.createToken("Long", "LONG", "USD", PATH_USD, creator, keccak256("long"));
        bytes memory uri = new bytes(257);
        for (uint256 i; i < uri.length; i++) uri[i] = "a";
        vm.prank(creator);
        vm.expectRevert(abi.encodeWithSelector(LaunchRegistry.MetadataURITooLong.selector, 257));
        registry.recordStablecoin(t, string(uri));
    }
}
