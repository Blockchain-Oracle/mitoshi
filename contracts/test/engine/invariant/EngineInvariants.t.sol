// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {EngineWorld} from "./EngineWorld.sol";

// Ported from Agari 03b30abbbfe7ddc3cac4927c7c573e52f74d2d49:anchor/programs/agari-events/src/matching/tests/random.rs
// as a Foundry invariant suite (Foundry book: handler + ghost state + afterInvariant).
/// A.6 invariants: after every handler call Agari's 8 families hold over 3 markets × 6 actors and no op touched another
/// market; `afterInvariant` settles and redeems every seat and checks exact conservation in every run (D-054).
/// Profile: runs 256 × depth 500 (foundry.toml `[invariant]`).
contract EngineInvariantsTest is EngineWorld {
    function setUp() public {
        _buildWorld(keccak256("engine-invariants"));
        targetContract(address(handler));
        bytes4[] memory selectors = new bytes4[](1);
        selectors[0] = handler.step.selector;
        targetSelector(FuzzSelector({addr: address(handler), selectors: selectors}));
    }

    function invariant_engine() public view {
        _assertAll("after a handler call");
    }

    function afterInvariant() public {
        _settleAndRedeemEveryone(handler.ok() + handler.refused());
    }
}
