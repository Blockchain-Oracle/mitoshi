// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {EventsEngine} from "../../../src/engine/EventsEngine.sol";
import {EngineStorage} from "../../../src/engine/EngineStorage.sol";
import {PrintLib} from "../../../src/engine/libs/PrintLib.sol";
import "../../../src/engine/EngineTypes.sol";

/// The real engine plus test-only listing, for the steps before `openWindow` (S2.5) and `recordPrint` (S2.6) exist.
/// Everything else — matching, funding, token moves, receive-policy checks — is the production code.
contract EngineTestHook is EventsEngine {
    constructor(address collateral_, address admin_, address treasury_) EventsEngine(collateral_, admin_, treasury_) {}

    function listForTest(uint40 tradingStart, uint40 lockAt, bool openPrint) external returns (bytes32 m) {
        EngineStorage.Layout storage l = EngineStorage.layout();
        if (l.seriesCount == 0) {
            l.seriesCount = 1;
            l.series[1] = Series(1, BASIS_REGULAR, 300, 1000, 1000, 1, 1, 0, 0, 20, 400_000, 32, 16, 0);
        }
        uint32 mIdx = ++l.cfg.nextMIdx;
        m = keccak256(abi.encode("test-market", mIdx));
        Market storage mk = l.markets[m];
        (mk.tradingStart, mk.lockAt, mk.expiry) = (tradingStart, lockAt, lockAt);
        (mk.openDeadline, mk.closeDeadline) = (tradingStart + 900, lockAt + 900);
        (mk.seriesIdx, mk.mIdx, mk.index) = (1, mIdx, mIdx);
        l.marketIdOf[mIdx] = m;
        if (openPrint) mk.open = PrintLib.pack(Print(36_500_000_000, tradingStart, SOURCE_REDSTONE, 5, 0));
    }
}
