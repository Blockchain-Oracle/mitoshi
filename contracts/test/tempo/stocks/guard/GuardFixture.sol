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
import {CustomRevert} from "v4-core/libraries/CustomRevert.sol";
import {PoolManagerFixture} from "../../../lib/PoolManagerFixture.sol";
import {PrintSigner as S} from "../../../engine/harness/PrintSigner.sol";
import {RedStonePrintVerifier} from "../../../../src/engine/verifiers/RedStonePrintVerifier.sol";
import {IPrintVerifier} from "../../../../src/engine/interfaces/IPrintVerifier.sol";
import {IDataStreamsVerifierProxy} from "../../../../src/engine/verifiers/DataStreamsPrintVerifier.sol";
import {StockSyncCodec as C} from "../../../../src/common/StockSyncCodec.sol";
import {StockSyncReceiver} from "../../../../src/stocks/StockSyncReceiver.sol";
import {ScaledUIView} from "../../../../src/stocks/ScaledUIView.sol";
import {StockReference} from "../../../../src/stocks/StockReference.sol";
import {SessionState} from "../../../../src/stocks/interfaces/IStockReference.sol";
import {IStockSyncView} from "../../../../src/stocks/interfaces/IStockSyncView.sol";
import {StockGuardHook} from "../../../../src/stocks/hooks/StockGuardHook.sol";
import {GuardTypes as T} from "../../../../src/stocks/hooks/GuardTypes.sol";
import {GuardMath} from "../../../../src/stocks/libs/GuardMath.sol";
import {GuardRouter} from "./GuardRouter.sol";

/// Local Tempo VM with every real piece but the network: the Tempo-mainnet PoolManager runtime (fixture), the S2
/// RedStone verifier (5 test signers, threshold 3 — the production verifier's code), a real StockSyncReceiver fed
/// through its LayerZero entry point, a mirror TIP-20 from the real factory, StockReference and the hook at a
/// 0x20C0-flag address. Prices enter only through signed RedStone payloads (`pushRedStone`), as on Moderato.
abstract contract GuardFixture is Test {
    using StateLibrary for IPoolManager;

    ITIP20 internal constant PATH_USD = ITIP20(0x20C0000000000000000000000000000000000000);
    bytes32 internal constant FEED = bytes32("TSLA");
    address internal constant RH_TOKEN = 0x0000000000000000000000000000000000007E5A;
    uint32 internal constant PEER_EID = 40245;
    bytes32 internal constant PEER = bytes32(uint256(0xF0F0));
    uint256 internal constant T0 = 1_790_000_000;
    uint256 internal constant SHARE = 250e18; // $250 per share

    IPoolManager internal pm;
    RedStonePrintVerifier internal verifier;
    EndpointV2Mock internal endpoint;
    StockSyncReceiver internal receiver;
    StockReference internal ref;
    StockGuardHook internal hook;
    GuardRouter internal router;
    ITIP20 internal mirror;
    PoolKey internal key;
    address internal owner = makeAddr("owner");
    address internal keeper = makeAddr("keeper");
    uint64 internal syncSeq;
    uint64 internal lzNonce;

    function setUp() public virtual {
        vm.warp(T0);
        pm = IPoolManager(PoolManagerFixture.etch());
        verifier = new RedStonePrintVerifier(S.signers(5), 3);
        endpoint = new EndpointV2Mock(40444, address(this));
        receiver = new StockSyncReceiver(address(endpoint), address(this), 46630);
        receiver.setPeer(PEER_EID, PEER);
        mirror = ITIP20(StdPrecompiles.TIP20_FACTORY.createToken("Bridged TSLA Stock Token (unofficial)", "bTSLA", "TSLA", PATH_USD, address(this), keccak256("guard-mirror")));
        ITIP20RolesAuth(address(mirror)).grantRole(mirror.ISSUER_ROLE(), address(this));
        receiver.bindToken(RH_TOKEN, address(mirror), new ScaledUIView(address(mirror), address(receiver)));

        ref = new StockReference(owner, IPrintVerifier(address(verifier)), IDataStreamsVerifierProxy(address(0)));
        vm.startPrank(owner);
        ref.grantRole(ref.KEEPER_ROLE(), keeper);
        ref.setFeeds(address(mirror), FEED, bytes32(0));
        vm.stopPrank();

        address at = address(uint160(uint256(keccak256("stock-guard"))) & ~uint160(Hooks.ALL_HOOK_MASK) | uint160(0x20C0));
        deployCodeTo("StockGuardHook.sol:StockGuardHook", abi.encode(pm, ref, receiver, owner), at);
        hook = StockGuardHook(at);
        key = PoolKey(Currency.wrap(address(PATH_USD)), Currency.wrap(address(mirror)), 3000, 60, IHooks(at));

        router = new GuardRouter(pm);
        PATH_USD.transfer(address(router), 50_000_000e6);
        mirror.mint(address(router), 200_000e6);
    }

    // ─── state drivers ───────────────────────────────────────────────────

    /// A signed RedStone "latest" payload at `ts` with median `shareE18` (e-8 on the wire), pushed permissionlessly.
    function _pushPrice(uint256 shareE18, uint256 ts) internal {
        address[] memory ms = new address[](1);
        ms[0] = address(mirror);
        bytes[] memory ps = new bytes[](1);
        ps[0] = S.five(FEED, shareE18 / 1e10, ts);
        ref.pushRedStone(ms, ps);
    }

    function _sync(uint128 current, uint128 pending, uint64 effectiveAt, uint8 flags) internal {
        bytes memory m = bytes.concat(
            C.encodeHeader(C.Header(46630, uint64(block.timestamp), ++syncSeq, 2)),
            C.encodeMultiplier(C.Multiplier(RH_TOKEN, current, pending, effectiveAt)),
            C.encodeStatus(C.Status(RH_TOKEN, flags))
        );
        vm.prank(address(endpoint));
        receiver.lzReceive(Origin(PEER_EID, PEER, ++lzNonce), keccak256(abi.encode(lzNonce)), m, address(0), "");
    }

    function _session(SessionState s) internal {
        vm.prank(keeper);
        ref.setSession(s, uint64(block.timestamp + 1 hours));
    }

    function _register() internal {
        vm.prank(owner);
        hook.registerPool(key, T.defaults());
    }

    /// Registered, synced ×`mult`, priced at SHARE, REGULAR, initialized at the reference, ±~12 % liquidity.
    function _live(uint128 mult) internal {
        _register();
        _sync(mult, mult, 1, 0);
        _pushPrice(SHARE, block.timestamp);
        _session(SessionState.REGULAR);
        pm.initialize(key, _sqrtRef());
        int24 t = _tick();
        router.addLiquidity(key, t - 1200 - t % 60, t + 1200 - t % 60, 5e11);
    }

    function _tokenPrice() internal view returns (uint256) {
        return GuardMath.tokenPriceE18(ref.read(address(mirror)).priceE18, receiver.uiMultiplierOf(address(mirror)));
    }

    function _sqrtRef() internal view returns (uint160) {
        return GuardMath.sqrtFromTokenPrice(_tokenPrice());
    }

    function _tick() internal view returns (int24 t) {
        (, t,,) = pm.getSlot0(key.toId());
    }

    // ─── expectations ────────────────────────────────────────────────────

    /// The hook's own revert data from inside PoolManager's ERC-7751 `WrappedError(hook, selector, reason, HookCallFailed)`.
    function _hookError(bytes memory err) internal view returns (bytes memory inner) {
        require(bytes4(err) == CustomRevert.WrappedError.selector, "not a wrapped hook error");
        address target;
        bytes memory details;
        (target,, inner, details) = abi.decode(_tail(err), (address, bytes4, bytes, bytes));
        require(target == address(hook) && bytes4(details) == Hooks.HookCallFailed.selector, "not from the hook");
    }

    function _tail(bytes memory b) internal pure returns (bytes memory out) {
        out = new bytes(b.length - 4);
        for (uint256 i; i < out.length; ++i) out[i] = b[i + 4];
    }

    /// Swaps `amountIn` exact-in and returns the hook error (empty on success).
    function _swap(bool zeroForOne, uint256 amountIn) internal returns (bytes memory) {
        try router.swapExactIn(key, zeroForOne, amountIn) {
            return "";
        } catch (bytes memory err) {
            return _hookError(err);
        }
    }

    function _assertSwapRefused(bool zeroForOne, uint256 amountIn, bytes4 selector) internal {
        bytes memory inner = _swap(zeroForOne, amountIn);
        assertEq(bytes4(inner), selector);
    }
}
