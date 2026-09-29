// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

/// @notice Where a reference price came from (plan B.3.2). KEEPER prices are labelled and refused by `requireVerified`.
enum RefSource {
    NONE,
    KEEPER,
    REDSTONE,
    DATASTREAMS
}

/// @notice The market session (numbering shared with `IThemeOracle.currentSession`).
enum SessionState {
    REGULAR,
    EXTENDED,
    CLOSED,
    UNKNOWN
}

/// @notice One mirror's reference: the underlying's USD price per share × 1e18 (no multiplier), when the source observed
///         it, when it was written here, the source, and the keeper's halt flag.
struct Ref {
    uint128 priceE18;
    uint64 observedAt;
    uint64 writtenAt;
    RefSource source;
    bool halted;
}

interface IStockReference {
    function read(address mirror) external view returns (Ref memory);
    function currentSession() external view returns (SessionState);
}
