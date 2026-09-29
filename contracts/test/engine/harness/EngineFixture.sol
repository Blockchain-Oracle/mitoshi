// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Test} from "forge-std/Test.sol";
import {StdPrecompiles} from "tempo-std/StdPrecompiles.sol";
import {StdTokens} from "tempo-std/StdTokens.sol";
import {ITIP20} from "tempo-std/interfaces/ITIP20.sol";
import {ITIP20RolesAuth} from "tempo-std/interfaces/ITIP20RolesAuth.sol";
import {EngineStorage} from "../../../src/engine/EngineStorage.sol";
import {EventsEngine} from "../../../src/engine/EventsEngine.sol";
import {RedStonePrintVerifier} from "../../../src/engine/verifiers/RedStonePrintVerifier.sol";
import {AttestedPrintVerifier} from "../../../src/engine/verifiers/AttestedPrintVerifier.sol";
import {PrintQuery} from "../../../src/engine/interfaces/IPrintVerifier.sol";
import {PrintSigner} from "./PrintSigner.sol";
import {Policies} from "./Policies.sol";
import "../../../src/engine/EngineTypes.sol";

/// The real engine over a real TIP-20 created through the factory precompile (A.6), with funded, approved actors and the
/// conservation check (`balanceOf(engine) == totalOwed == backing·1000·cu + Σcredit + ΣlockedCash` per market, summed).
abstract contract EngineFixture is Test {
    uint40 internal constant START = 1_800_000_000;
    uint40 internal constant LOCK = START + 300;
    uint256 internal constant FUND = 1_000_000e6;

    ITIP20 internal usd;
    EventsEngine internal engine;
    RedStonePrintVerifier internal rsVerifier;
    AttestedPrintVerifier internal attVerifier;
    uint256 internal constant ATTESTOR_KEY = 0xA77E57;
    address internal roller = makeAddr("roller");
    uint16 internal nextTicker;
    address internal admin = makeAddr("admin");
    address internal treasury = makeAddr("treasury");
    bytes32 internal m;
    bytes32[] internal markets;
    address[] internal actors;

    function setUp() public virtual {
        vm.warp(START);
        usd = ITIP20(
            StdPrecompiles.TIP20_FACTORY.createToken("Test USD", "tUSD", "USD", StdTokens.PATH_USD, address(this), keccak256("engine-fixture"))
        );
        ITIP20RolesAuth(address(usd)).grantRole(usd.ISSUER_ROLE(), address(this));
        engine = new EventsEngine(address(usd), admin, treasury);
        rsVerifier = new RedStonePrintVerifier(PrintSigner.signers(5), 3);
        address[] memory attestors = new address[](1);
        attestors[0] = vm.addr(ATTESTOR_KEY);
        attVerifier = new AttestedPrintVerifier(attestors);
        vm.prank(admin);
        engine.setRoller(roller, true);
        m = list(START, LOCK, true);
    }

    /// Lists a Window the production way: a fresh Regular Series (cadence = the Window's span, minLots 1, caps 32/16,
    /// the RedStone launch policy), `openWindow` by the roller, and — when asked — its open print through `recordPrint`.
    function list(uint40 tradingStart, uint40 lockAt, bool openPrint) internal returns (bytes32 id) {
        vm.startPrank(admin);
        bytes32 sid = engine.registerSeries(
            RegisterSeriesArgs(++nextTicker, BASIS_REGULAR, uint32(lockAt - tradingStart), 1000, 1000, 1, 20, 400_000, 32, 16)
        );
        engine.addPolicyVersion(sid, 0, Policies.launch(address(rsVerifier), 0, OPEN_ENDED));
        vm.stopPrank();
        vm.prank(roller);
        id = engine.openWindow(OpenWindowArgs(sid, 0, tradingStart, lockAt, lockAt, 0, 2));
        markets.push(id);
        if (openPrint) recordOpen(id, 36_500_000_000);
    }

    /// A real RedStone print: five packages signed by the fixture's signer keys at the slot's boundary, median `priceE8`.
    function recordOpen(bytes32 id, int256 priceE8) internal {
        (uint40 tradingStart,) = times(id);
        engine.recordPrint(id, WHICH_OPEN, PrintSigner.five(Policies.TSLA, uint256(priceE8), tradingStart));
    }

    function recordClose(bytes32 id, int256 priceE8) internal {
        (, uint40 expiry) = times(id);
        engine.recordPrint(id, WHICH_CLOSE, PrintSigner.five(Policies.TSLA, uint256(priceE8), expiry));
    }

    /// A real EIP-712 attested print for slot `which` (fetched now), for versions whose source there is Attested.
    function attest(bytes32 id, uint8 which, int64 priceE8) internal {
        (uint40 tradingStart, uint40 expiry) = times(id);
        uint40 t = (which == WHICH_OPEN || which == WHICH_CHECK_OPEN) ? tradingStart : expiry;
        PrintQuery memory q = PrintQuery(id, which, t, Policies.attested(address(0), 0).feedId, 0, 0, 10, 60, 0, 0);
        // vm.getBlockTimestamp(): under via-IR a test's block.timestamp can be a stale value after vm.warp.
        bytes memory proof = PrintSigner.attested(attVerifier, ATTESTOR_KEY, address(engine), q, priceE8, -8, uint40(vm.getBlockTimestamp()));
        engine.recordPrint(id, which, proof);
    }

    function times(bytes32 id) internal view returns (uint40 tradingStart, uint40 expiry) {
        uint256 s0 = uint256(engine.extsload(keccak256(abi.encode(id, uint256(EngineStorage.SLOT) + EngineStorage.OFF_MARKETS))));
        (tradingStart, expiry) = (uint40(s0), uint40(s0 >> 80));
    }

    function who(uint256 n) internal returns (address a) {
        a = address(uint160(0xB0B0000 + n));
        for (uint256 i; i < actors.length; ++i) if (actors[i] == a) return a;
        actors.push(a);
        usd.mint(a, FUND);
        vm.prank(a);
        usd.approve(address(engine), type(uint256).max);
    }

    function order(uint8 kind, uint16 price, uint64 lots, uint8 orderType) internal view returns (PlaceArgs memory) {
        return PlaceArgs(m, kind, orderType, SELF_CANCEL_TAKER, price, lots, LOCK, 16, 16, false, false, 0);
    }

    function place(uint256 n, PlaceArgs memory a) internal returns (PlaceResult memory r) {
        address actor = who(n);
        vm.prank(actor);
        r = engine.placeOrder(a);
        assertConserved();
    }

    function mint(uint256 n, uint64 lots) internal returns (uint64 t) {
        address actor = who(n);
        vm.prank(actor);
        t = engine.mintSet(m, lots, false);
        assertConserved();
    }

    function pos(bytes32 mkt, uint256 n) internal returns (Position memory p) {
        address actor = who(n);
        (uint32 mIdx) = _mIdx(mkt);
        bytes32 base = keccak256(abi.encode(actor, keccak256(abi.encode(uint256(mIdx), uint256(EngineStorage.SLOT) + EngineStorage.OFF_POSITIONS))));
        uint256 a = uint256(engine.extsload(base));
        uint256 b = uint256(engine.extsload(bytes32(uint256(base) + 1)));
        p.credit = uint64(a);
        p.lockedCash = uint64(a >> 64);
        p.yesFree = uint64(a >> 128);
        p.noFree = uint64(a >> 192);
        p.yesLocked = uint64(b);
        p.noLocked = uint64(b >> 64);
        p.openOrders = uint16(b >> 128);
        p.orderHead = uint32(b >> 144);
        p.flags = uint8(b >> 176);
    }

    function pos(uint256 n) internal returns (Position memory) {
        return pos(m, n);
    }

    function totalOwed() internal view returns (uint256) {
        uint256 cfg = uint256(engine.extsload(EngineStorage.SLOT));
        return uint96(cfg >> 152);
    }

    function backingOf(bytes32 mkt) internal view returns (uint64) {
        bytes32 s3 = bytes32(uint256(keccak256(abi.encode(mkt, uint256(EngineStorage.SLOT) + EngineStorage.OFF_MARKETS))) + 3);
        return uint64(uint256(engine.extsload(s3)));
    }

    function _mIdx(bytes32 mkt) internal view returns (uint32) {
        bytes32 s5 = bytes32(uint256(keccak256(abi.encode(mkt, uint256(EngineStorage.SLOT) + EngineStorage.OFF_MARKETS))) + 5);
        return uint32(uint256(engine.extsload(s5)) >> 64);
    }

    /// Conservation as equality (A.6): the engine's balance, its ledger and what every holder is owed agree exactly.
    /// Before settlement a market owes `backing·1000·cu + Σcredit + ΣlockedCash`; once terminal it owes every holder's
    /// `credit + lockedCash + payout(outcome lots)` (Agari `owed_after_settlement`).
    function assertConserved() internal {
        uint256 owed;
        for (uint256 i; i < markets.length; ++i) {
            (uint8 state, uint32 py, uint32 pn) = _resolution(markets[i]);
            if (state == STATE_OPEN) owed += uint256(backingOf(markets[i])) * 1000;
            for (uint256 j; j < actors.length; ++j) {
                Position memory p = pos(markets[i], _n(actors[j]));
                owed += uint256(p.credit) + p.lockedCash;
                if (state != STATE_OPEN) {
                    owed += (uint256(p.yesFree + p.yesLocked) * 1000 * py + uint256(p.noFree + p.noLocked) * 1000 * pn) / PAYOUT_DENOMINATOR;
                }
            }
        }
        assertEq(totalOwed(), owed, "totalOwed == owed");
        assertEq(usd.balanceOf(address(engine)), totalOwed(), "balance == totalOwed");
    }

    function _resolution(bytes32 mkt) internal view returns (uint8 state, uint32 py, uint32 pn) {
        bytes32 s4 = bytes32(uint256(keccak256(abi.encode(mkt, uint256(EngineStorage.SLOT) + EngineStorage.OFF_MARKETS))) + 4);
        uint256 v = uint256(engine.extsload(s4));
        (py, pn, state) = (uint32(v >> 144), uint32(v >> 176), uint8(v >> 208));
    }

    function _n(address a) internal pure returns (uint256) {
        return uint160(a) - 0xB0B0000;
    }
}
