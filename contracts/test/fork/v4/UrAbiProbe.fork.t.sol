// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Test} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IAllowanceTransfer} from "permit2/src/interfaces/IAllowanceTransfer.sol";


/// Spike X3 (plan S15a): which `V4_SWAP` parameter layout does the pinned UniversalRouter `0xa2dc…ea91` decode?
/// v4-periphery HEAD adds `minHopPriceX36` to every swap struct (2026-03-17, #516); the router was deployed on
/// 2026-02-24 from an earlier periphery. Three layouts are candidates:
///   V0      — the original: single = (key, zeroForOne, amountIn, amountOutMin, hookData);
///             multi  = (currencyIn, path, amountIn, amountOutMin)
///   MAX_HOP — periphery #497 (2025-11): multi gains `uint256[] maxHopSlippage` before amountIn; single unchanged
///   X36     — periphery #516 (2026-03): single gains `uint256 minHopPriceX36` before hookData; multi's array renamed
/// Each layout is executed for real on a Tempo mainnet fork against live hookless pools and the TempoExchange
/// aggregator hook. Answer (2026-09-29): **MAX_HOP** — single = V0's 5 fields, multi carries the per-hop max-price
/// array. `packages/markets/src/v4/encode.ts` freezes exactly this; its golden vectors are real 0xa2dc calldata.
contract UrAbiProbeForkTest is Test {
    address constant UR = 0xA2Dc7d0266f0CC50b3eEaF36c9BFCeCFF1BEea91;
    address constant PERMIT2 = 0x000000000022D473030F116dDEE9F6B43aC78BA3;
    address constant POOL_MANAGER = 0x33620f62C5b9B2086dD6b62F4A297A9f30347029;
    address constant PATH_USD = 0x20C0000000000000000000000000000000000000;
    address constant USDC_E = 0x20C000000000000000000000b9537d11c60E8b50;
    address constant USDT0 = 0x20C00000000000000000000014f22CA97301EB73;
    address constant AGGREGATOR_HOOK = 0x7169A78A59f136876e724b648fbb339A42F46888;
    /// Pinned so the probe is reproducible (Tempo mainnet, 2026-09-29).
    uint256 constant FORK_BLOCK = 41_744_000;

    uint8 constant V4_SWAP = 0x10;
    uint8 constant SWAP_EXACT_IN_SINGLE = 0x06;
    uint8 constant SWAP_EXACT_IN = 0x07;
    uint8 constant SETTLE_ALL = 0x0c;
    uint8 constant TAKE_ALL = 0x0f;

    struct PoolKey {
        address currency0;
        address currency1;
        uint24 fee;
        int24 tickSpacing;
        address hooks;
    }

    struct PathKey {
        address intermediateCurrency;
        uint24 fee;
        int24 tickSpacing;
        address hooks;
        bytes hookData;
    }

    struct SingleV0 {
        PoolKey poolKey;
        bool zeroForOne;
        uint128 amountIn;
        uint128 amountOutMinimum;
        bytes hookData;
    }

    struct SingleX36 {
        PoolKey poolKey;
        bool zeroForOne;
        uint128 amountIn;
        uint128 amountOutMinimum;
        uint256 minHopPriceX36;
        bytes hookData;
    }

    struct MultiV0 {
        address currencyIn;
        PathKey[] path;
        uint128 amountIn;
        uint128 amountOutMinimum;
    }

    struct MultiHopArray {
        address currencyIn;
        PathKey[] path;
        uint256[] perHop;
        uint128 amountIn;
        uint128 amountOutMinimum;
    }

    address trader = makeAddr("trader");

    function setUp() public {
        vm.createSelectFork(vm.envOr("TEMPO_MAINNET_RPC_HTTP_URL", string("https://rpc.tempo.xyz")), FORK_BLOCK);
        // Fund the trader from the PoolManager's own pathUSD (≈ 10.5M): a fork-only transfer, no mainnet write.
        vm.prank(POOL_MANAGER);
        IERC20(PATH_USD).transfer(trader, 10_000e6);
        vm.startPrank(trader);
        IERC20(PATH_USD).approve(PERMIT2, type(uint256).max);
        IAllowanceTransfer(PERMIT2).approve(PATH_USD, UR, type(uint160).max, uint48(block.timestamp + 1 days));
        vm.stopPrank();
    }

    // ── single hop: pathUSD → USDC.e, hookless 1 bp pool ────────────────────────────────────────────────────────────

    function _hookless() internal pure returns (PoolKey memory) {
        return PoolKey(PATH_USD, USDC_E, 100, 1, address(0));
    }

    function _run(bytes memory actions, bytes memory swapParams, address currencyIn, address currencyOut, uint128 amountIn)
        internal
        returns (bool ok, uint256 out)
    {
        bytes[] memory params = new bytes[](3);
        params[0] = swapParams;
        params[1] = abi.encode(currencyIn, uint256(amountIn));
        params[2] = abi.encode(currencyOut, uint256(0));
        bytes[] memory inputs = new bytes[](1);
        inputs[0] = abi.encode(actions, params);
        uint256 before = IERC20(currencyOut).balanceOf(trader);
        vm.prank(trader);
        (ok,) = UR.call(abi.encodeWithSignature("execute(bytes,bytes[],uint256)", abi.encodePacked(V4_SWAP), inputs, block.timestamp + 60));
        out = IERC20(currencyOut).balanceOf(trader) - before;
    }

    function _single(bytes memory swapParams, address outCurrency) internal returns (bool, uint256) {
        return _run(abi.encodePacked(SWAP_EXACT_IN_SINGLE, SETTLE_ALL, TAKE_ALL), swapParams, PATH_USD, outCurrency, 100e6);
    }

    function test_single_V0_layoutSwaps() public {
        (bool ok, uint256 out) = _single(abi.encode(SingleV0(_hookless(), true, 100e6, 99e6, "")), USDC_E);
        assertTrue(ok, "5-field ExactInputSingleParams must execute");
        assertGe(out, 99e6);
        assertLe(out, 101e6);
    }

    function test_single_X36_layoutReverts() public {
        (bool ok, uint256 out) = _single(abi.encode(SingleX36(_hookless(), true, 100e6, 99e6, 0, "")), USDC_E);
        assertFalse(ok, "6-field (minHopPriceX36) layout must not decode on 0xa2dc");
        assertEq(out, 0);
    }

    /// The mainnet USDC.e route of S15d goes through Uniswap's TempoExchange aggregator hook; same layout.
    function test_single_V0_throughAggregatorHook() public {
        PoolKey memory key = PoolKey(PATH_USD, USDC_E, 500, 10, AGGREGATOR_HOOK);
        assertEq(keccak256(abi.encode(key)), 0x00cdb9b18686cc49430bd3ea24a241633baf4af84029a014f2be22ec5e295588);
        (bool ok, uint256 out) = _single(abi.encode(SingleV0(key, true, 100e6, 99e6, "")), USDC_E);
        assertTrue(ok, "aggregator-hook pool swaps with the 5-field layout");
        assertGe(out, 99e6);
    }

    /// The minimum is enforced by the router, not ignored: an impossible minimum reverts.
    function test_single_V0_minimumEnforced() public {
        (bool ok,) = _single(abi.encode(SingleV0(_hookless(), true, 100e6, 101e6, "")), USDC_E);
        assertFalse(ok);
    }

    // ── multi hop: pathUSD → USDC.e (1 bp) → USDT0 (1 bp) ───────────────────────────────────────────────────────────

    function _path() internal pure returns (PathKey[] memory path) {
        path = new PathKey[](2);
        path[0] = PathKey(USDC_E, 100, 1, address(0), "");
        path[1] = PathKey(USDT0, 100, 1, address(0), "");
    }

    function _multi(bytes memory swapParams) internal returns (bool, uint256) {
        return _run(abi.encodePacked(SWAP_EXACT_IN, SETTLE_ALL, TAKE_ALL), swapParams, PATH_USD, USDT0, 100e6);
    }

    function test_multi_V0_layoutReverts() public {
        (bool ok, uint256 out) = _multi(abi.encode(MultiV0(PATH_USD, _path(), 100e6, 98e6)));
        assertFalse(ok, "multi-hop without the per-hop array must not decode on 0xa2dc");
        assertEq(out, 0);
    }

    function test_multi_perHopArray_emptySwaps() public {
        (bool ok, uint256 out) = _multi(abi.encode(MultiHopArray(PATH_USD, _path(), new uint256[](0), 100e6, 98e6)));
        assertTrue(ok, "multi-hop with an empty per-hop array executes");
        assertGe(out, 98e6);
    }

    /// Semantics at periphery #497: `maxHopSlippage[i]` is the maximum hop price `amountIn * 1e18 / amountOut`.
    function test_multi_perHopArray_isMaxPricePerHop() public {
        uint256[] memory loose = new uint256[](2);
        (loose[0], loose[1]) = (1.02e18, 1.02e18);
        (bool ok, uint256 out) = _multi(abi.encode(MultiHopArray(PATH_USD, _path(), loose, 100e6, 98e6)));
        assertTrue(ok, "a 2 % max hop price passes");
        assertGe(out, 98e6);

        uint256[] memory tight = new uint256[](2);
        (tight[0], tight[1]) = (0.9e18, 0.9e18);
        (ok,) = _multi(abi.encode(MultiHopArray(PATH_USD, _path(), tight, 100e6, 98e6)));
        assertFalse(ok, "a max hop price below 1 reverts V4TooLittleReceivedPerHop");

        uint256[] memory wrongLength = new uint256[](1);
        wrongLength[0] = 2e18;
        (ok,) = _multi(abi.encode(MultiHopArray(PATH_USD, _path(), wrongLength, 100e6, 98e6)));
        assertFalse(ok, "a per-hop array of the wrong length reverts InvalidHopSlippageLength");
    }

    // ── the TS encoder's own bytes (packages/markets/src/v4/encode.vectors.json → probe) ──────────────────────────────

    function _executeVector(string memory key, address currencyOut) internal returns (uint256 out) {
        string memory json = vm.readFile("../packages/markets/src/v4/encode.vectors.json");
        bytes memory data = vm.parseJsonBytes(json, string.concat(".probe.", key));
        uint256 before = IERC20(currencyOut).balanceOf(trader);
        vm.prank(trader);
        (bool ok, bytes memory err) = UR.call(data);
        assertTrue(ok, string(err));
        out = IERC20(currencyOut).balanceOf(trader) - before;
    }

    function test_encodeTs_singleHookless() public {
        assertGe(_executeVector("singleHookless", USDC_E), 99e6);
    }

    function test_encodeTs_singleAggregatorHook() public {
        assertGe(_executeVector("singleAggregatorHook", USDC_E), 99e6);
    }

    function test_encodeTs_multiHopMaxPrice() public {
        assertGe(_executeVector("multiHopMaxPrice", USDT0), 98e6);
    }
}
