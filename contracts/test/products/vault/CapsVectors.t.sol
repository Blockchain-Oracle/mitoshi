// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

// Ported from Masayume 68f7a09:contracts/test/CapsVectors.t.sol — the golden vectors are copied unchanged
// (`packages/core/src/vault/caps.vectors.json`, same sha256) and now run against the real engine: before each
// placement the seeder rests Masayume's book (YES at 0.60, NO at 0.40) on the side that order takes.

import {IEventVault} from "../../../src/products/vault/IEventVault.sol";
import {IEngineErrors} from "../../../src/engine/EngineErrors.sol";
import {VaultTestBase} from "../harness/VaultTestBase.sol";

/// @notice Every row of `packages/core/src/vault/caps.vectors.json`, applied to the real contract over a real book.
///         The browser's pre-check asserts the same rows, so its verdict and the chain's never quietly diverge (AD-5).
contract CapsVectorsTest is VaultTestBase {
    string internal json;

    function setUp() public override {
        super.setUp();
        json = vm.readFile("../packages/core/src/vault/caps.vectors.json");
        depositAs(owner, 5_000 * ONE);
    }

    function _u(string memory path) internal view returns (uint256) {
        return vm.parseJsonUint(json, path);
    }

    function _b(string memory path) internal view returns (bool) {
        return vm.parseJsonBool(json, path);
    }

    function _s(string memory path) internal view returns (string memory) {
        return vm.parseJsonString(json, path);
    }

    function _has(string memory path) internal view returns (bool) {
        return vm.keyExistsJson(json, path);
    }

    function test_caps_vectors() public {
        uint256 count = _u(".count");
        assertEq(count, 10);
        for (uint256 i = 0; i < count; i++) {
            uint256 snap = vm.snapshotState();
            _runVector(string.concat(".vectors[", vm.toString(i), "]"));
            vm.revertToState(snap);
        }
    }

    function _runVector(string memory v) internal {
        IEventVault.Caps memory c = caps(
            _u(string.concat(v, ".caps.maxStakePerTrade")),
            _u(string.concat(v, ".caps.maxDailySpend")),
            uint32(_u(string.concat(v, ".caps.maxOpenPositions"))),
            uint64(_u(string.concat(v, ".caps.maxPriceRaw")))
        );
        bool expired = _b(string.concat(v, ".expired"));
        vm.prank(owner);
        uint256 id = vault.grant(
            IEventVault.GrantKind.STRATEGY, actor, c, uint64(vm.getBlockTimestamp() + (expired ? 1 : 1 days)), _u(string.concat(v, ".budget"))
        );
        if (expired) vm.warp(vm.getBlockTimestamp() + 2);

        if (_has(string.concat(v, ".prior.quantityRaw"))) {
            uint8 priorIdx = uint8(_u(string.concat(v, ".prior.outcomeIdx")));
            book(market, priorIdx, true);
            vm.prank(actor);
            vault.placeFor(
                id, market, priorIdx, true, _u(string.concat(v, ".prior.priceRaw")), _u(string.concat(v, ".prior.quantityRaw")), EXPIRE_NS
            );
        }

        uint8 outcomeIdx = uint8(_u(string.concat(v, ".order.outcomeIdx")));
        uint256 priceRaw = _u(string.concat(v, ".order.priceRaw"));
        uint256 quantityRaw = _u(string.concat(v, ".order.quantityRaw"));
        bool expectOk = _b(string.concat(v, ".expect.ok"));
        string memory name = _s(string.concat(v, ".name"));

        if (!expired) book(market, outcomeIdx, true);
        vm.prank(actor);
        if (expectOk) {
            (uint256 spent,) = vault.placeFor(id, market, outcomeIdx, true, priceRaw, quantityRaw, EXPIRE_NS);
            assertEq(spent, _u(string.concat(v, ".expect.spendBase")), name);
            assertConserved();
        } else {
            bytes4 selector = _selectorOf(_s(string.concat(v, ".expect.error")));
            vm.expectPartialRevert(selector);
            vault.placeFor(id, market, outcomeIdx, true, priceRaw, quantityRaw, EXPIRE_NS);
        }
    }

    function _selectorOf(string memory errorName) internal pure returns (bytes4) {
        bytes32 h = keccak256(bytes(errorName));
        if (h == keccak256("OverStakeCap")) return IEventVault.OverStakeCap.selector;
        if (h == keccak256("Insufficient")) return IEventVault.Insufficient.selector;
        if (h == keccak256("OverDailyCap")) return IEventVault.OverDailyCap.selector;
        if (h == keccak256("OverPriceCap")) return IEventVault.OverPriceCap.selector;
        if (h == keccak256("OverPositionCap")) return IEventVault.OverPositionCap.selector;
        if (h == keccak256("GrantExpired")) return IEventVault.GrantExpired.selector;
        if (h == keccak256("GrantIsRevoked")) return IEventVault.GrantIsRevoked.selector;
        // The engine's own error, same name as DreamDEX's (interface-checklist §2).
        if (h == keccak256("ImmediateOrCancelNoFill")) return IEngineErrors.ImmediateOrCancelNoFill.selector;
        revert(string.concat("unknown error name in vector: ", errorName));
    }
}
