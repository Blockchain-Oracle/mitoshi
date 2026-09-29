// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Test} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IEventsEngine} from "../../../../src/engine/interfaces/IEventsEngine.sol";
import {IEngineLens, MarketRef, OrderView, PositionView} from "../../../../src/engine/interfaces/IEngineLens.sol";
import {MarketMakerVault} from "../../../../src/products/maker/MarketMakerVault.sol";
import {PrintSigner} from "../../../engine/harness/PrintSigner.sol";
import {Policies} from "../../../engine/harness/Policies.sol";
import "../../../../src/engine/EngineTypes.sol";

/// Drives the real maker vault on the real engine (Foundry handler pattern: bounded inputs, pranked actors; the fuzzer
/// targets only `step`). Three back-to-back 5-minute Windows; the maker quotes random pairs (some short-lived), a real
/// taker crosses whatever the vault rests, suppliers come and go, anyone pulls after lock, merges, sweeps expired
/// orders or donates, the clock moves, and Windows get their real RedStone prints and settle (or void) on the engine.
contract MakerHandler is Test {
    uint256 internal constant ONE = 1e6;

    MarketMakerVault public immutable vault;
    IEventsEngine public immutable engine;
    IEngineLens public immutable lens;
    IERC20 public immutable usd;
    address public immutable maker;
    address public immutable taker;
    address public immutable stranger;
    address[] public suppliers;
    bytes32[] public markets;
    uint256 public immutable horizon;

    /// @dev Escrow the vault's resting bids spent on fills, per Window (Δ(lockedCash + credit) across each take).
    mapping(bytes32 => uint256) public fillCost;
    uint256 public donated;
    uint256 public ok;
    uint256 public refused;
    uint256 public fills;

    constructor(
        MarketMakerVault vault_,
        IEventsEngine engine_,
        IEngineLens lens_,
        address maker_,
        address taker_,
        address[] memory suppliers_,
        bytes32[] memory markets_,
        uint256 horizon_
    ) {
        vault = vault_;
        engine = engine_;
        lens = lens_;
        usd = IERC20(engine_.collateral());
        maker = maker_;
        taker = taker_;
        stranger = makeAddr("handler-stranger");
        suppliers = suppliers_;
        markets = markets_;
        horizon = horizon_;
    }

    function marketCount() external view returns (uint256) {
        return markets.length;
    }

    /// @notice The op mix: quote 25 %, take 25 %, supply 7 %, withdraw 7 %, pull 6 %, merge 6 %, sweep 4 %, donate 2 %,
    ///         warp 10 %, settle 8 %.
    function step(uint256 seed, uint256 a, uint256 b, uint256 c) external {
        uint256 op = seed % 100;
        bytes32 m = markets[a % markets.length];
        _prints(m);
        if (op < 25) _quote(m, b, c);
        else if (op < 50) _take(m, b, c);
        else if (op < 57) _supply(b, c);
        else if (op < 64) _withdraw(b, c);
        else if (op < 70) _pull(m, b);
        else if (op < 76) _merge(m);
        else if (op < 80) _sweep(m);
        else if (op < 82) _donate(c);
        else if (op < 92) _warp(b);
        else _settle(m, b);
    }

    function _merge(bytes32 m) internal {
        vm.prank(stranger);
        _call(address(vault), abi.encodeCall(vault.merge, (m)));
    }

    // ------------------------------------------------------------------------------------------------ ops

    function _quote(bytes32 m, uint256 b, uint256 c) internal {
        uint256 bid = 300 + (b % 30) * 10; // 0.30 … 0.59
        uint256 ask = bid + 20 + (c % 8) * 10; // at least the 0.02 minimum spread
        uint256 qty = (1 + (c >> 8) % 20) * ONE;
        uint40 lockAt = lens.marketRef(m).lockAt;
        uint256 exp = (b >> 8) % 3 == 0 ? block.timestamp + 20 + (b >> 16) % 100 : lockAt; // some quotes die early
        if (exp > lockAt) exp = lockAt;
        vm.prank(maker);
        _call(address(vault), abi.encodeCall(vault.quote, (m, bid * 1000, ask * 1000, qty, uint64(exp) * 1e9)));
    }

    /// @dev A real taker crosses one of the vault's live orders at its price (it may sweep better vault orders and
    ///      evict dead ones on the way). The vault's fill cost is the drop in its escrow plus credit (evictions only
    ///      move locked cash to credit).
    function _take(bytes32 m, uint256 b, uint256 c) internal {
        OrderView[] memory os = lens.openOrdersOf(m, address(vault));
        uint256 live;
        for (uint256 i; i < os.length; ++i) if (os[i].expireTs > block.timestamp) os[live++] = os[i];
        if (live == 0) return;
        OrderView memory o = os[b % live];
        uint8 kind = o.kind == KIND_BUY_YES ? KIND_BUY_NO : KIND_BUY_YES;
        uint64 lots = uint64(1 + c % o.lots);
        PositionView memory p0 = lens.positionOf(m, address(vault));
        PlaceArgs memory a = PlaceArgs(m, kind, ORDER_IOC, SELF_CANCEL_TAKER, o.priceTicks, lots, lens.marketRef(m).lockAt, 16, 16, false, true, 0);
        vm.prank(taker); // after every argument is read: a prank is spent on the next external call
        try engine.placeOrder(a) {
            PositionView memory p1 = lens.positionOf(m, address(vault));
            fillCost[m] += (uint256(p0.lockedCash) + p0.credit) - (uint256(p1.lockedCash) + p1.credit);
            ++fills;
        } catch {
            ++refused;
        }
    }

    function _supply(uint256 b, uint256 c) internal {
        vm.prank(suppliers[b % suppliers.length]);
        _call(address(vault), abi.encodeCall(vault.supply, (bound(c, 1, 300 * ONE))));
    }

    function _withdraw(uint256 b, uint256 c) internal {
        address s = suppliers[b % suppliers.length];
        uint256 held = vault.sharesOf(s);
        if (held == 0) return;
        vm.prank(s);
        _call(address(vault), abi.encodeCall(vault.withdraw, (bound(c, 1, held))));
    }

    function _pull(bytes32 m, uint256 b) internal {
        vm.prank(b % 2 == 0 ? maker : stranger); // a stranger only succeeds once the Window is past lockAt
        _call(address(vault), abi.encodeCall(vault.pull, (m)));
    }

    function _sweep(bytes32 m) internal {
        vm.prank(stranger);
        _call(address(engine), abi.encodeCall(engine.sweepExpired, (m, 32)));
    }

    function _donate(uint256 c) internal {
        uint256 amount = bound(c, 1, 50 * ONE);
        address s = suppliers[0];
        if (usd.balanceOf(s) < amount) return;
        vm.prank(s);
        usd.transfer(address(vault), amount);
        donated += amount;
    }

    function _warp(uint256 b) internal {
        uint256 t = block.timestamp + 1 + b % 90;
        if (t > horizon) t = horizon;
        vm.warp(t);
    }

    /// @dev A Window past its close gets a real close print (Up or Down) and settles, or — its close admission missed —
    ///      is voided by anyone; then the vault settles it (permissionless).
    function _settle(bytes32 m, uint256 b) internal {
        MarketRef memory r = lens.marketRef(m);
        if (block.timestamp < r.expiry) return;
        if (r.state == STATE_OPEN) {
            if (r.closeE8 == 0 && r.openE8 != 0 && block.timestamp <= uint256(r.expiry) + 900) {
                uint256 price = b % 2 == 0 ? 36_600_000_000 : 36_400_000_000;
                _call(address(engine), abi.encodeCall(engine.recordPrint, (m, WHICH_CLOSE, PrintSigner.five(Policies.TSLA, price, r.expiry))));
                _call(address(engine), abi.encodeCall(engine.settle, (m)));
            } else {
                _call(address(engine), abi.encodeCall(engine.voidExpired, (m)));
            }
        }
        vm.prank(stranger);
        _call(address(vault), abi.encodeCall(vault.settle, (m)));
    }

    /// @dev The open print is recorded as soon as it is admissible (the house relay does this within seconds live).
    function _prints(bytes32 m) internal {
        MarketRef memory r = lens.marketRef(m);
        if (r.openE8 != 0 || r.state != STATE_OPEN || block.timestamp < r.tradingStart || block.timestamp > uint256(r.tradingStart) + 900) return;
        engine.recordPrint(m, WHICH_OPEN, PrintSigner.five(Policies.TSLA, 36_500_000_000, r.tradingStart));
    }

    function _call(address to, bytes memory data) internal {
        (bool success,) = to.call(data);
        if (success) ++ok;
        else ++refused;
    }
}
