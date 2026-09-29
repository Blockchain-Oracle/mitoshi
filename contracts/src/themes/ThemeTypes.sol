// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

/// @notice Shared theme types (plan B.4.1–B.4.2, D-002, D-023, D-100–D-102). Weights are basis points of the
///         follower's allocation; money is integer base units (pathUSD and every mirror are 6-decimal TIP-20s).

/// @dev One target band. The cash band is stored under the pathUSD address.
struct Band {
    uint16 minBps;
    uint16 maxBps;
    uint16 targetBps;
    bool allowed; // may the agent buy this token (false = hold or sell down only)
}

/// @dev What a creator publishes (a new theme or a new version). `specHash` = keccak256 of the RFC 8785 (JCS)
///      canonical spec JSON at `specURI`; the on-chain fields must equal the spec (checked off-chain, TH-02).
struct ThemeParams {
    uint16 creatorFeeBps;
    uint16 maxSlippageBps;
    uint32 minIntervalSec;
    uint32 maxRefAgeSec;
    uint8 sessionsMask; // bit s set = rebalancing allowed in oracle session s
    bytes32 specHash;
    string specURI;
    address[] tokens;
    Band[] bands; // one per token, same order
    Band cashBand;
}

/// @dev The current version's parameters (one read for the router).
struct Theme {
    address creator;
    uint40 createdAt;
    uint32 version;
    uint16 creatorFeeBps;
    bool delisted;
    uint16 maxSlippageBps;
    uint32 minIntervalSec;
    uint32 maxRefAgeSec;
    uint8 tokenCount;
    uint8 sessionsMask;
    uint256 erc8004AgentId;
    bytes32 specHash;
    string specURI;
}

/// @dev A follower's consent (B.4.2). USD amounts are pathUSD base units.
struct FollowCaps {
    uint64 expiry; // unix seconds; ≤ the key's expiry
    uint64 allocationUsd;
    uint64 maxTradeUsd;
    uint64 maxDailyUsd;
    uint16 maxSlippageBps;
    uint16 maxFeeBps;
    uint32 minIntervalSec;
}

/// @dev One leg: exactly one side is pathUSD. Exact input; `minAmountOut` is the follower's floor.
struct Trade {
    address tokenIn;
    address tokenOut;
    uint128 amountIn;
    uint128 minAmountOut;
}

library ThemeConstants {
    address internal constant PATH_USD = 0x20C0000000000000000000000000000000000000;
    uint16 internal constant BPS = 10_000;
    uint16 internal constant MAX_CREATOR_FEE_BPS = 50; // Q-025
    uint16 internal constant MAX_SLIPPAGE_BPS = 1_000;
    uint8 internal constant MAX_TOKENS = 16;
    uint32 internal constant MIN_INTERVAL_SEC = 60; // the agent's fastest tick (B.4.4)
    uint32 internal constant MAX_REF_AGE_SEC = 345_600; // StockGuard maxAgeClosed default (Q-024)
    uint8 internal constant SESSION_BITS = 4; // REGULAR, EXTENDED, CLOSED, UNKNOWN (B.3.2)
}
