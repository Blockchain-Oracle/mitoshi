// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Test} from "forge-std/Test.sol";
import {StdPrecompiles} from "tempo-std/StdPrecompiles.sol";
import {StdTokens} from "tempo-std/StdTokens.sol";
import {ITIP20} from "tempo-std/interfaces/ITIP20.sol";
import {ITIP20RolesAuth} from "tempo-std/interfaces/ITIP20RolesAuth.sol";
import {ITIP403Registry} from "tempo-std/interfaces/ITIP403Registry.sol";

/// Spike X6 (plan §5, S2.0): forge `network = "tempo"` on a pinned Tempo mainnet fork. Proves the precompiles answer
/// on the fork (pathUSD, TIP-20 factory, TIP-403 registry incl. TIP-1028 receive policies, storage credits), that a
/// real pathUSD holder can be pranked, and whether forge `deal` can write a TIP-20 balance.
/// Run: `forge test --match-contract X6TempoMainnetForkTest -vv` (needs network access; excluded from `contracts:test`).
contract X6TempoMainnetForkTest is Test {
    uint256 internal constant BLOCK = 41_742_739;
    /// A contract holding ≈ 36.3M pathUSD at `BLOCK` (largest recent non-fee-manager recipient of pathUSD transfers).
    address internal constant HOLDER = 0x9a044AE05E5e6290DcF56afd69548565e957a626;
    ITIP20 internal constant PATH_USD = StdTokens.PATH_USD;

    function setUp() public {
        vm.createSelectFork("https://rpc.tempo.xyz", BLOCK);
    }

    function test_chainAndPathUsdAnswerOnTheFork() public view {
        assertEq(block.chainid, 4217);
        assertEq(PATH_USD.decimals(), 6);
        assertGt(PATH_USD.totalSupply(), 0);
        assertTrue(StdPrecompiles.TIP20_FACTORY.isTIP20(address(PATH_USD)));
    }

    function test_aPrankedRealHolderTransfersPathUsd() public {
        uint256 held = PATH_USD.balanceOf(HOLDER);
        assertGt(held, 1_000_000e6);
        address to = makeAddr("x6-recipient");
        vm.prank(HOLDER);
        PATH_USD.transfer(to, 1_234_567);
        assertEq(PATH_USD.balanceOf(to), 1_234_567);
        assertEq(PATH_USD.balanceOf(HOLDER), held - 1_234_567);
    }

    function test_factoryCreatesAndMintsATokenOnTheFork() public {
        address admin = makeAddr("x6-admin");
        vm.startPrank(admin);
        ITIP20 t = ITIP20(StdPrecompiles.TIP20_FACTORY.createToken("X6", "X6", "USD", PATH_USD, admin, keccak256("x6")));
        ITIP20RolesAuth(address(t)).grantRole(t.ISSUER_ROLE(), admin);
        t.mint(admin, 5e6);
        vm.stopPrank();
        assertEq(t.balanceOf(admin), 5e6);
        assertEq(t.decimals(), 6);
    }

    function test_receivePolicyRegistryAnswersOnTheFork() public {
        (bool ok, ITIP403Registry.BlockedReason why) =
            StdPrecompiles.TIP403_REGISTRY.validateReceivePolicy(address(PATH_USD), HOLDER, makeAddr("x6-any"));
        assertTrue(ok);
        assertEq(uint8(why), uint8(ITIP403Registry.BlockedReason.NONE));
    }

    function test_storageCreditsPrecompileIsLive() public {
        // TIP-1060 (T7): the precompile answers; a fresh account has no credits and the default mode is Refund.
        assertEq(StdPrecompiles.STORAGE_CREDITS.balanceOf(makeAddr("x6-fresh")), 0);
        assertEq(uint8(StdPrecompiles.STORAGE_CREDITS.modeOf(makeAddr("x6-fresh"))), 0);
    }

    /// forge `deal` cannot write a TIP-20 precompile balance on the fork (stdStorage finds no storage use), so fork
    /// tests fund actors by pranking a real holder (above) — recorded as the X6 result.
    function test_dealCannotWritePathUsdOnTheFork() public {
        vm.expectRevert(bytes("stdStorage find(StdStorage): No storage use detected for target."));
        this.dealExternal(makeAddr("x6-deal"), 7e6);
    }

    function dealExternal(address who, uint256 amount) external {
        deal(address(PATH_USD), who, amount);
    }
}
