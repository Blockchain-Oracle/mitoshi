// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Test} from "forge-std/Test.sol";
import {EndpointV2Mock} from "@layerzerolabs/test-devtools-evm-foundry/contracts/mocks/EndpointV2Mock.sol";
import {Origin} from "@layerzerolabs/oapp-evm/contracts/oapp/OAppReceiver.sol";
import {StdPrecompiles} from "tempo-std/StdPrecompiles.sol";
import {ITIP20} from "tempo-std/interfaces/ITIP20.sol";
import {ITIP20RolesAuth} from "tempo-std/interfaces/ITIP20RolesAuth.sol";
import {IHooks} from "v4-core/interfaces/IHooks.sol";
import {IPoolManager} from "v4-core/interfaces/IPoolManager.sol";
import {PoolKey} from "v4-core/types/PoolKey.sol";
import {Currency} from "v4-core/types/Currency.sol";
import {Hooks} from "v4-core/libraries/Hooks.sol";
import {StateLibrary} from "v4-core/libraries/StateLibrary.sol";
import {PrintSigner as S} from "../../engine/harness/PrintSigner.sol";
import {RedStonePrintVerifier} from "../../../src/engine/verifiers/RedStonePrintVerifier.sol";
import {IPrintVerifier} from "../../../src/engine/interfaces/IPrintVerifier.sol";
import {IDataStreamsVerifierProxy} from "../../../src/engine/verifiers/DataStreamsPrintVerifier.sol";
import {StockSyncCodec as C} from "../../../src/common/StockSyncCodec.sol";
import {StockSyncReceiver} from "../../../src/stocks/StockSyncReceiver.sol";
import {ScaledUIView} from "../../../src/stocks/ScaledUIView.sol";
import {StockReference} from "../../../src/stocks/StockReference.sol";
import {SessionState} from "../../../src/stocks/interfaces/IStockReference.sol";
import {StockGuardHook} from "../../../src/stocks/hooks/StockGuardHook.sol";
import {GuardTypes as T} from "../../../src/stocks/hooks/GuardTypes.sol";
import {GuardMath} from "../../../src/stocks/libs/GuardMath.sol";
import {GuardRouter} from "../../tempo/stocks/guard/GuardRouter.sol";

interface IScaledUI {
    function uiMultiplier() external view returns (uint256);
    function newUIMultiplier() external view returns (uint256);
    function effectiveAt() external view returns (uint256);
}

/// The S15 gate's "CRWD ×4 fork test": CRWD's live 4-for-1 multiplier is read from the Robinhood Stock Token on an RH
/// mainnet fork, carried as the exact StockSync record the bridge sends, applied by a StockSyncReceiver on a Moderato
/// fork, and the StockGuardHook on Moderato's replayed PoolManager then prices the pool at share × 4: initializing at
/// the share price (×1, or ÷4) is refused, share × 4 is accepted, and swaps are banded around share × 4.
/// RH is read at its head (the public RPC keeps no archive state; the value has been 4e18 since 2026-07-02, so a change
/// here is news, not flakiness). Run: `forge test --match-contract CrwdMultiplierFork` (two networks).
contract CrwdMultiplierForkTest is Test {
    using StateLibrary for IPoolManager;

    address internal constant CRWD = 0xea72Ecca2d0f6bFA1394DBBCff85b52CD4233931;
    uint256 internal constant MODERATO_BLOCK = 37_380_600;
    IPoolManager internal constant PM = IPoolManager(0x33620f62C5b9B2086dD6b62F4A297A9f30347029);
    ITIP20 internal constant PATH_USD = ITIP20(0x20C0000000000000000000000000000000000000);
    address internal constant FUNDED = 0x900a0F5260b91Fd65D0C2b03D92Cf8013a1F073e;
    uint256 internal constant SHARE = 120.5125e18; // a post-split CRWD share price; the token is four of them

    uint256 internal mult;
    uint256 internal pending;
    uint256 internal effectiveAt;

    function setUp() public {
        vm.createSelectFork(vm.envOr("RH_RPC_HTTP_URL", string("https://rpc.mainnet.chain.robinhood.com")));
        mult = IScaledUI(CRWD).uiMultiplier();
        pending = IScaledUI(CRWD).newUIMultiplier();
        effectiveAt = IScaledUI(CRWD).effectiveAt();
        vm.createSelectFork(vm.envOr("MODERATO_RPC_URL", string("https://rpc.moderato.tempo.xyz")), MODERATO_BLOCK);
    }

    function test_crwdMultiplierFourPricesThePoolAtShareTimesFour() public {
        assertEq(mult, 4e18, "RH mainnet CRWD uiMultiplier");
        assertEq(pending, 4e18);
        assertEq(effectiveAt, 1_782_999_000);

        // Moderato: receiver + mirror + reference + hook on the replayed PoolManager.
        EndpointV2Mock endpoint = new EndpointV2Mock(40444, address(this));
        StockSyncReceiver receiver = new StockSyncReceiver(address(endpoint), address(this), 4663);
        receiver.setPeer(30416, bytes32(uint256(0x5E4D)));
        ITIP20 mirror = ITIP20(StdPrecompiles.TIP20_FACTORY.createToken("Bridged CRWD Stock Token (unofficial)", "bCRWD", "CRWD", PATH_USD, address(this), keccak256("crwd-fork")));
        receiver.bindToken(CRWD, address(mirror), new ScaledUIView(address(mirror), address(receiver)));
        bytes memory m = bytes.concat(
            C.encodeHeader(C.Header(4663, uint64(block.timestamp), 1, 2)),
            C.encodeMultiplier(C.Multiplier(CRWD, uint128(mult), uint128(pending), uint64(effectiveAt))),
            C.encodeStatus(C.Status(CRWD, 0))
        );
        vm.prank(address(endpoint));
        receiver.lzReceive(Origin(30416, bytes32(uint256(0x5E4D)), 1), bytes32(uint256(1)), m, address(0), "");
        assertEq(receiver.uiMultiplierOf(address(mirror)), 4e18);

        StockReference ref = new StockReference(address(this), IPrintVerifier(address(new RedStonePrintVerifier(S.signers(5), 3))), IDataStreamsVerifierProxy(address(0)));
        ref.setFeeds(address(mirror), bytes32("CRWD"), bytes32(0));
        ref.grantRole(ref.KEEPER_ROLE(), address(this));
        ref.setSession(SessionState.REGULAR, uint64(block.timestamp + 600));
        address[] memory ms = new address[](1);
        ms[0] = address(mirror);
        bytes[] memory ps = new bytes[](1);
        ps[0] = S.five(bytes32("CRWD"), SHARE / 1e10, block.timestamp);
        ref.pushRedStone(ms, ps);

        address at = address(uint160(uint256(keccak256("crwd-guard"))) & ~uint160(Hooks.ALL_HOOK_MASK) | uint160(0x20C0));
        deployCodeTo("StockGuardHook.sol:StockGuardHook", abi.encode(PM, ref, receiver, address(this)), at);
        StockGuardHook hook = StockGuardHook(at);
        PoolKey memory key = PoolKey(Currency.wrap(address(PATH_USD)), Currency.wrap(address(mirror)), 3000, 60, IHooks(at));
        hook.registerPool(key, T.defaults());

        vm.expectRevert(); // ×1 (the share price) is outside the closed band around share × 4
        PM.initialize(key, GuardMath.sqrtFromTokenPrice(SHARE));
        vm.expectRevert(); // ÷4 even more so
        PM.initialize(key, GuardMath.sqrtFromTokenPrice(SHARE / 4));
        PM.initialize(key, GuardMath.sqrtFromTokenPrice(SHARE * 4));
        (uint256 p,, bool halted) = hook.tokenPrice(address(mirror));
        assertEq(p, 482.05e18);
        assertFalse(halted);

        GuardRouter router = new GuardRouter(PM);
        vm.prank(FUNDED);
        PATH_USD.transfer(address(router), 400_000e6);
        ITIP20RolesAuth(address(mirror)).grantRole(mirror.ISSUER_ROLE(), address(this));
        mirror.mint(address(router), 1_000e6);
        (, int24 tick,,) = PM.getSlot0(key.toId());
        int24 base = tick - tick % 60;
        router.addLiquidity(key, base - 1200, base + 1200, 1e11);
        uint256 before = mirror.balanceOf(address(router));
        router.swapExactIn(key, true, 1_000e6); // buy ~2 CRWD tokens at ≈ $482 each
        assertApproxEqRel(mirror.balanceOf(address(router)) - before, uint256(1_000e6) * 1e18 / 482.05e18, 0.01e18, "$1,000 buys ~2.07 tokens (0.3 % fee)");
        assertApproxEqRel(GuardMath.tokenPriceFromSqrt(_sqrtNow(hook, key)), 482.05e18, 0.015e18, "inside the 150 bps band");
        vm.expectRevert();
        router.swapExactIn(key, true, 200_000e6); // pushes the token far above share × 4 × 1.015
    }

    function _sqrtNow(StockGuardHook, PoolKey memory key) internal view returns (uint160 s) {
        (s,,,) = PM.getSlot0(key.toId());
    }
}
