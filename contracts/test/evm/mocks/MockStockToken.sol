// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @notice Test stand-in for Robinhood's `AccessControlsRegistry` (context/tempo/14 §3.1): global pause + blocklist.
contract MockAccessRegistry {
    bool public paused;
    mapping(address => bool) public isBlocked;

    function setPaused(bool p) external {
        paused = p;
    }

    function setBlocked(address a, bool b) external {
        isBlocked[a] = b;
    }
}

/// @title MockStockToken — our MIT stand-in for Robinhood's `Stock` (plan B.6 names it; behaviour from the verified
///        source summarised in context/tempo/14-bridging-stock-tokens.md §3.2–3.3).
/// @notice 18 dp; `paused()` = token flag OR registry flag; transfers check the blocklist on from, to and msg.sender;
///         `adminBurn` ignores pause and blocklist; ERC-8056 multiplier with Robinhood's "switch at effectiveAt" view and
///         silent supersede; `oraclePaused()` can be made to revert with empty data like the testnet implementation.
contract MockStockToken is ERC20 {
    MockAccessRegistry public immutable ACCESS_CONTROLLED_REGISTRY;
    bool public tokenPaused;
    bool public oracleSupported = true;
    bool internal _oraclePaused;
    uint256 internal _multiplier = 1e18;
    uint256 internal _newMultiplier = 1e18;
    uint256 internal _effectiveAt;

    error Paused();
    error Blocked(address account);

    constructor(string memory symbol_) ERC20(symbol_, symbol_) {
        ACCESS_CONTROLLED_REGISTRY = new MockAccessRegistry();
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    function adminBurn(address from, uint256 amount) external {
        _burn(from, amount);
    }

    function setTokenPaused(bool p) external {
        tokenPaused = p;
    }

    function setOracle(bool supported, bool paused_) external {
        oracleSupported = supported;
        _oraclePaused = paused_;
    }

    function paused() public view returns (bool) {
        return tokenPaused || ACCESS_CONTROLLED_REGISTRY.paused();
    }

    function oraclePaused() external view returns (bool) {
        if (!oracleSupported) {
            assembly {
                revert(0, 0)
            }
        }
        return _oraclePaused;
    }

    function uiMultiplier() public view returns (uint256) {
        return block.timestamp >= _effectiveAt ? _newMultiplier : _multiplier;
    }

    function newUIMultiplier() external view returns (uint256) {
        return _newMultiplier;
    }

    function effectiveAt() external view returns (uint256) {
        return _effectiveAt;
    }

    /// @notice Schedules (or, with `at <= now`, applies) a multiplier; a new schedule silently supersedes a pending one.
    function updateMultiplier(uint256 newMultiplier, uint256 at) external {
        _multiplier = uiMultiplier();
        _newMultiplier = newMultiplier;
        _effectiveAt = at;
    }

    function _update(address from, address to, uint256 value) internal override {
        bool isAdminBurn = to == address(0) && msg.sig == this.adminBurn.selector;
        if (!isAdminBurn) {
            if (paused()) revert Paused();
            MockAccessRegistry r = ACCESS_CONTROLLED_REGISTRY;
            if (r.isBlocked(from)) revert Blocked(from);
            if (r.isBlocked(to)) revert Blocked(to);
            if (r.isBlocked(msg.sender)) revert Blocked(msg.sender);
        }
        super._update(from, to, value);
    }
}
