// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

/// @notice The reference-price view ThemeRouter reads (plan B.3.2 StockReference + B.1.4 multiplier): the USD value
///         of one whole mirror token, `P_i = sharePrice × uiMultiplier`, when it was observed, whether the mirror is
///         halted, and the current market session. Proof pushes go to `StockReference` directly (ThemeRouter forwards
///         the raw calldata to an allowlisted push selector), so this view stays read-only.
interface IThemeOracle {
    /// @return usdPerTokenE18 USD per whole token × 1e18 (share price × multiplier)
    /// @return observedAt the reference's observation time (unix seconds)
    /// @return halted the mirror is halted, issuer- or oracle-paused, or its multiplier is unsynced
    function tokenPrice(address mirror) external view returns (uint256 usdPerTokenE18, uint64 observedAt, bool halted);

    /// @return session 0 REGULAR, 1 EXTENDED, 2 CLOSED, 3 UNKNOWN
    function currentSession() external view returns (uint8 session);
}
