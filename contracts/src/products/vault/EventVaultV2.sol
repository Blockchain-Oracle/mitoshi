// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IEventsEngine} from "../../engine/interfaces/IEventsEngine.sol";
import {IEngineLens} from "../../engine/interfaces/IEngineLens.sol";
import {FairValueGuard} from "../../fair/FairValueGuard.sol";
import {EventVault} from "./EventVault.sol";
import {VaultExits} from "./VaultExits.sol";

/// @title EventVault v2 — the Trading Balance with the EXIT grant (S24.1, D-193): v1's funding, grants, trading and
///        settlement unchanged, plus a sell-only delegation that sells only at or above a signed fair-value floor.
/// @dev A fresh deploy; v1 balances move with the owner's own withdraw → deposit (S24.2, the migration).
contract EventVaultV2 is VaultExits {
    constructor(IERC20 collateral_, IEventsEngine engine_, IEngineLens lens_, FairValueGuard guard_)
        EventVault(collateral_, engine_, lens_)
        VaultExits(guard_)
    {}
}
