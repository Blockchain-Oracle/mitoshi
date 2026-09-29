// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Test} from "forge-std/Test.sol";
import {StdPrecompiles} from "tempo-std/StdPrecompiles.sol";
import {StdTokens} from "tempo-std/StdTokens.sol";
import {ITIP20} from "tempo-std/interfaces/ITIP20.sol";
import {ITIP20RolesAuth} from "tempo-std/interfaces/ITIP20RolesAuth.sol";
import {EngineStorage} from "../../../src/engine/EngineStorage.sol";
import {EngineTestHook} from "./EngineTestHook.sol";
import "../../../src/engine/EngineTypes.sol";

/// The real engine over a real TIP-20 created through the factory precompile (A.6), with funded, approved actors and the
/// conservation check (`balanceOf(engine) == totalOwed == backing·1000·cu + Σcredit + ΣlockedCash` per market, summed).
abstract contract EngineFixture is Test {
    uint40 internal constant START = 1_800_000_000;
    uint40 internal constant LOCK = START + 300;
    uint256 internal constant FUND = 1_000_000e6;

    ITIP20 internal usd;
    EngineTestHook internal engine;
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
        engine = new EngineTestHook(address(usd), admin, treasury);
        m = list(START, LOCK, true);
    }

    function list(uint40 tradingStart, uint40 lockAt, bool openPrint) internal returns (bytes32 id) {
        id = engine.listForTest(tradingStart, lockAt, openPrint);
        markets.push(id);
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
    function assertConserved() internal {
        uint256 owed;
        for (uint256 i; i < markets.length; ++i) {
            owed += uint256(backingOf(markets[i])) * 1000;
            for (uint256 j; j < actors.length; ++j) {
                Position memory p = pos(markets[i], _n(actors[j]));
                owed += uint256(p.credit) + p.lockedCash;
            }
        }
        assertEq(totalOwed(), owed, "totalOwed == owed");
        assertEq(usd.balanceOf(address(engine)), totalOwed(), "balance == totalOwed");
    }

    function _n(address a) internal pure returns (uint256) {
        return uint160(a) - 0xB0B0000;
    }
}
