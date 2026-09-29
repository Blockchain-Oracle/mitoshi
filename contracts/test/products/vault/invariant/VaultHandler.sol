// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Test} from "forge-std/Test.sol";
import {IEventsEngine} from "../../../../src/engine/interfaces/IEventsEngine.sol";
import {IEngineLens} from "../../../../src/engine/interfaces/IEngineLens.sol";
import {EventVault} from "../../../../src/products/vault/EventVault.sol";
import {IEventVault} from "../../../../src/products/vault/IEventVault.sol";
import "../../../../src/engine/EngineTypes.sol";

/// Drives the real vault on the real engine with random owners, grants and trades (Foundry handler pattern: bounded
/// inputs, pranked actors; the fuzzer targets only this contract). A maker keeps a real two-sided book — YES ask at
/// 0.60, YES bid at 0.40 — so crossing orders fill through the engine's real paths and the rest refuse for real.
contract VaultHandler is Test {
    uint256 internal constant ONE = 1e6;

    EventVault public immutable vault;
    IEventsEngine public immutable engine;
    IEngineLens public immutable lens;
    address public immutable maker;
    address[] public owners;
    address[] public actorsOf;
    bytes32[] public markets;
    uint40 public immutable lockAt;

    uint256 public fills;
    uint256 public refusals;
    uint256 public trades;

    constructor(EventVault vault_, IEventsEngine engine_, IEngineLens lens_, address maker_, address[] memory owners_, bytes32[] memory markets_, uint40 lockAt_) {
        vault = vault_;
        engine = engine_;
        lens = lens_;
        maker = maker_;
        owners = owners_;
        markets = markets_;
        lockAt = lockAt_;
        for (uint256 i; i < owners_.length; ++i) actorsOf.push(makeAddr(string.concat("session-", vm.toString(i))));
        for (uint256 i; i < markets_.length; ++i) reseed(i);
    }

    function ownerCount() external view returns (uint256) {
        return owners.length;
    }

    function marketCount() external view returns (uint256) {
        return markets.length;
    }

    /// @notice The fuzzer's one entry (as S2's `EngineHandler`): the op mix lives in the seed so trading dominates —
    ///         place 35 %, placeFor 25 %, deposit 8 %, withdraw 6 %, private 4 %, grant 6 %, fund 4 %, revoke 3 %,
    ///         reseed 5 %, warp 4 %.
    function step(uint256 seed, uint256 a, uint256 b, uint256 c) external {
        uint256 op = seed % 100;
        uint8 outcomeIdx = uint8(a % 2);
        bool isBuy = (b % 3) != 0; // two buys per sell keeps inventory to sell
        uint8 mode = uint8(c);
        if (op < 35) this.place(a, b, outcomeIdx, isBuy, c, mode);
        else if (op < 60) this.placeFor(b, a, outcomeIdx, isBuy, c, mode);
        else if (op < 68) this.deposit(a, b);
        else if (op < 74) this.withdraw(a, b);
        else if (op < 76) this.moveToPrivate(a, b);
        else if (op < 78) this.withdrawPrivate(a, b);
        else if (op < 84) this.grant(a, b, c, seed >> 8, seed >> 16);
        else if (op < 88) this.fundGrant(a, b);
        else if (op < 91) this.revoke(a);
        else if (op < 96) reseed(a);
        else this.warp(b);
    }

    // ---------------------------------------------------------------- funding

    function deposit(uint256 o, uint256 amount) external {
        address who = owners[o % owners.length];
        vm.prank(who);
        _try(abi.encodeCall(vault.deposit, (bound(amount, 1, 500 * ONE))));
    }

    function withdraw(uint256 o, uint256 amount) external {
        address who = owners[o % owners.length];
        uint256 have = vault.accountOf(who).available;
        vm.prank(who);
        _try(abi.encodeCall(vault.withdraw, (bound(amount, 1, have + 1))));
    }

    function moveToPrivate(uint256 o, uint256 amount) external {
        address who = owners[o % owners.length];
        vm.prank(who);
        _try(abi.encodeCall(vault.moveToPrivate, (bound(amount, 1, 100 * ONE))));
    }

    function withdrawPrivate(uint256 o, uint256 amount) external {
        address who = owners[o % owners.length];
        vm.prank(who);
        _try(abi.encodeCall(vault.withdrawPrivate, (bound(amount, 1, 100 * ONE))));
    }

    // ---------------------------------------------------------------- grants

    function grant(uint256 o, uint256 budget, uint256 perTrade, uint256 openCap, uint256 scoped) external {
        uint256 i = o % owners.length;
        bytes32 scope = scoped % 3 == 0 ? markets[scoped % markets.length] : bytes32(0);
        IEventVault.Caps memory c = IEventVault.Caps(
            uint128(bound(perTrade, ONE, 60 * ONE)), uint128(200 * ONE), uint32(bound(openCap, 1, 4)), 0, scope
        );
        vm.prank(owners[i]);
        _try(abi.encodeCall(vault.grant, (IEventVault.GrantKind.SESSION, actorsOf[i], c, uint64(block.timestamp + 1 days), bound(budget, 0, 300 * ONE))));
    }

    function fundGrant(uint256 o, uint256 amount) external {
        uint256 i = o % owners.length;
        uint256 id = vault.activeGrantOf(owners[i], IEventVault.GrantKind.SESSION);
        vm.prank(owners[i]);
        _try(abi.encodeCall(vault.fundGrant, (id, bound(amount, 1, 50 * ONE))));
    }

    function revoke(uint256 o) external {
        uint256 i = o % owners.length;
        uint256 id = vault.activeGrantOf(owners[i], IEventVault.GrantKind.SESSION);
        if (id == 0) return;
        vm.prank(owners[i]);
        vault.revoke(id);
    }

    // ---------------------------------------------------------------- trading

    /// @param mode one in four orders sits inside the spread, so the engine refuses the empty IOC
    function place(uint256 o, uint256 mk, uint8 outcomeIdx, bool isBuy, uint256 lots, uint8 mode) external {
        address who = owners[o % owners.length];
        bytes32 m = markets[mk % markets.length];
        outcomeIdx %= 2;
        uint256 qty = _qty(who, m, outcomeIdx, isBuy, lots);
        vm.prank(who);
        if (_try(abi.encodeCall(vault.place, (m, outcomeIdx, isBuy, _price(outcomeIdx, isBuy, mode % 4 != 0), qty, type(uint64).max)))) ++trades;
    }

    function placeFor(uint256 o, uint256 mk, uint8 outcomeIdx, bool isBuy, uint256 lots, uint8 mode) external {
        uint256 i = o % owners.length;
        bytes32 m = markets[mk % markets.length];
        outcomeIdx %= 2;
        uint256 id = vault.activeGrantOf(owners[i], IEventVault.GrantKind.SESSION);
        uint256 qty = _qty(owners[i], m, outcomeIdx, isBuy, lots);
        vm.prank(actorsOf[i]);
        if (_try(abi.encodeCall(vault.placeFor, (id, m, outcomeIdx, isBuy, _price(outcomeIdx, isBuy, mode % 4 != 0), qty, type(uint64).max)))) ++trades;
    }

    /// @dev The maker refreshes a market's two-sided book (its fills there leave it one-sided over time).
    function reseed(uint256 mk) public {
        bytes32 m = markets[mk % markets.length];
        vm.startPrank(maker);
        if (lens.positionOf(m, maker).openOrders != 0) engine.cancelAll(m, 32, true);
        engine.placeOrder(PlaceArgs(m, KIND_BUY_NO, ORDER_POST_ONLY, SELF_CANCEL_TAKER, 600, 400_000, lockAt, 16, 16, false, false, 0));
        engine.placeOrder(PlaceArgs(m, KIND_BUY_YES, ORDER_POST_ONLY, SELF_CANCEL_TAKER, 400, 400_000, lockAt, 16, 16, false, false, 0));
        vm.stopPrank();
    }

    function warp(uint256 secs) external {
        uint256 next = vm.getBlockTimestamp() + bound(secs, 1, 20);
        if (next < lockAt - 5) vm.warp(next);
    }

    // ---------------------------------------------------------------- helpers

    /// @dev YES asks at 0.60, bids at 0.40 (YES terms). Crossing limits: buy YES 0.70, buy NO 0.30 (NO at 0.70),
    ///      sell YES 0.30, sell NO 0.70 (NO at 0.30). Inside the spread: 0.50 for all.
    function _price(uint8 outcomeIdx, bool isBuy, bool cross) internal pure returns (uint256) {
        if (!cross) return 500_000;
        return (outcomeIdx == 0) == isBuy ? 700_000 : 300_000;
    }

    /// @dev Sells stay within what the owner holds most of the time (an oversell must refuse, and sometimes does).
    function _qty(address who, bytes32 m, uint8 outcomeIdx, bool isBuy, uint256 lots) internal view returns (uint256) {
        if (isBuy) return bound(lots, 1, 50_000) * 1000;
        uint256 held = vault.positionOf(who, vault.outcomeId(m, outcomeIdx));
        return bound(lots, 1, held / 1000 + 1) * 1000;
    }

    function _try(bytes memory data) internal returns (bool ok) {
        (ok,) = address(vault).call(data);
        if (ok) ++fills;
        else ++refusals;
    }
}
