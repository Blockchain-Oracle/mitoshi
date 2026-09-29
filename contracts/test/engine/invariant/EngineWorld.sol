// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Test} from "forge-std/Test.sol";
import {StdPrecompiles} from "tempo-std/StdPrecompiles.sol";
import {StdTokens} from "tempo-std/StdTokens.sol";
import {ITIP20} from "tempo-std/interfaces/ITIP20.sol";
import {ITIP20RolesAuth} from "tempo-std/interfaces/ITIP20RolesAuth.sol";
import {EventsEngine} from "../../../src/engine/EventsEngine.sol";
import {EngineLens} from "../../../src/engine/EngineLens.sol";
import {RedStonePrintVerifier} from "../../../src/engine/verifiers/RedStonePrintVerifier.sol";
import {EngineHandler} from "./EngineHandler.sol";
import {EngineChecks} from "./EngineChecks.sol";
import {PrintSigner} from "../harness/PrintSigner.sol";
import {Policies} from "../harness/Policies.sol";
import "../../../src/engine/EngineTypes.sol";

/// The invariant world: the real engine, lens and RedStone verifier over a factory TIP-20; 3 hour-long Windows (one per
/// Series, open prints recorded with signed payloads) and 6 funded, approved actors.
abstract contract EngineWorld is Test {
    uint40 internal constant START = 1_800_000_000; // a multiple of 3,600
    ITIP20 internal usd;
    EventsEngine internal engine;
    EngineLens internal lens;
    EngineHandler internal handler;
    EngineChecks internal checks;
    bytes32[] internal markets;
    address[] internal actors;

    function _buildWorld(bytes32 salt) internal {
        vm.warp(START);
        usd = ITIP20(StdPrecompiles.TIP20_FACTORY.createToken("Test USD", "tUSD", "USD", StdTokens.PATH_USD, address(this), salt));
        ITIP20RolesAuth(address(usd)).grantRole(usd.ISSUER_ROLE(), address(this));
        engine = new EventsEngine(address(usd), address(this), makeAddr("treasury"));
        lens = new EngineLens(address(engine));
        RedStonePrintVerifier rs = new RedStonePrintVerifier(PrintSigner.signers(5), 3);
        engine.setRoller(address(this), true);
        delete markets;
        delete actors;
        for (uint16 i; i < 3; ++i) {
            bytes32 sid = engine.registerSeries(RegisterSeriesArgs(i + 1, BASIS_REGULAR, 3_600, 1000, 1000, 1, 20, 400_000, 32, 16));
            engine.addPolicyVersion(sid, 0, Policies.launch(address(rs), 0, OPEN_ENDED));
            bytes32 m = engine.openWindow(OpenWindowArgs(sid, 0, START, START + 3_600, START + 3_600, 0, 2));
            engine.recordPrint(m, WHICH_OPEN, PrintSigner.five(Policies.TSLA, 36_500_000_000, START));
            markets.push(m);
        }
        for (uint256 i; i < 6; ++i) {
            address a = address(uint160(0xAC7000 + i));
            actors.push(a);
            usd.mint(a, 1_000_000e6);
            vm.prank(a);
            usd.approve(address(engine), type(uint256).max);
        }
        handler = new EngineHandler(engine, lens, usd, markets, actors);
        checks = new EngineChecks(engine, usd);
    }

    function _assertAll(string memory context) internal view {
        assertEq(checks.check(markets, actors), "", context);
        assertFalse(handler.isolationBroken(), "cross-market isolation");
    }

    /// Settles every market (Up, Down or void by `seed`), redeems every holder (own or cranked), and requires the
    /// engine to end holding exactly nothing: every base unit owed was paid, nothing more (E-63 after settlement).
    function _settleAndRedeemEveryone(uint256 seed) internal {
        handler.settleAll(seed);
        _assertAll("after settlement");
        uint256 before = usd.balanceOf(address(engine));
        uint256 paid = handler.redeemAll(seed);
        assertEq(paid, before, "paid exactly what was held");
        assertEq(usd.balanceOf(address(engine)), 0, "nothing left");
        assertEq(lens.config().totalOwed, 0, "ledger empty");
        _assertAll("after redeeming everyone");
        for (uint256 i; i < markets.length; ++i) {
            for (uint256 j; j < actors.length; ++j) {
                assertEq(keccak256(abi.encode(lens.positionOf(markets[i], actors[j]))), keccak256(abi.encode(_zeroView())));
            }
        }
    }

    function _zeroView() private pure returns (PositionViewZero memory z) {}
}

struct PositionViewZero {
    uint64 credit;
    uint64 lockedCash;
    uint64 yesFree;
    uint64 noFree;
    uint64 yesLocked;
    uint64 noLocked;
    uint16 openOrders;
}
