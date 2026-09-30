// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

// Ported from Masayume 68f7a09:contracts/src/leverage/LeverageMath.sol — unchanged but for the level type: the lens's
// `LevelRaw` is `IBinaryPool.Level` field for field (A.2.7), so the arithmetic and the golden vectors are bit-exact.

import {LevelRaw} from "../../engine/interfaces/IEngineLens.sol";

/// @title The boost's arithmetic, pure — mirrored line for line by `@masayume/core/leverage`.
/// @dev Prices are collateral per whole contract, scaled by `one` (10^decimals); a contract pays `one`
///      when its side lands, so a raw quantity is also its payout in base units. Every rounding is in
///      the reserve's favour: the owner's stake rounds up, the reserve's front rounds down.
library LeverageMath {
    uint256 internal constant BPS = 10_000;

    function ceilDiv(uint256 a, uint256 b) internal pure returns (uint256) {
        return a == 0 ? 0 : (a - 1) / b + 1;
    }

    /// @dev One level's price in the taken side's own terms: a NO level is the YES level inverted.
    function sidePrice(uint256 yesPriceRaw, bool invert, uint256 one) internal pure returns (uint256) {
        return invert ? one - yesPriceRaw : yesPriceRaw;
    }

    /// @notice Takes the first `quantityRaw` contracts resting on `levels`, in the order they rest.
    /// @return costRaw collateral for what filled, rounded up once
    /// @return filledRaw how much of `quantityRaw` the levels could supply
    /// @return limitYesRaw the last level touched, in the venue's YES terms — the IOC's limit
    function walkQuantity(LevelRaw[] memory levels, bool invert, uint256 one, uint256 quantityRaw)
        internal
        pure
        returns (uint256 costRaw, uint256 filledRaw, uint256 limitYesRaw)
    {
        uint256 weighted;
        for (uint256 i = 0; i < levels.length && filledRaw < quantityRaw; i++) {
            uint256 take = quantityRaw - filledRaw;
            if (levels[i].quantity < take) take = levels[i].quantity;
            if (take == 0) continue;
            weighted += take * sidePrice(levels[i].price, invert, one);
            filledRaw += take;
            limitYesRaw = levels[i].price;
        }
        costRaw = ceilDiv(weighted, one);
    }

    /// @notice The most contracts `budgetRaw` buys off `levels`, floored to `lotRaw` — the size a stake affords.
    function walkBudget(LevelRaw[] memory levels, bool invert, uint256 one, uint256 budgetRaw, uint256 lotRaw)
        internal
        pure
        returns (uint256 quantityRaw)
    {
        uint256 weighted;
        uint256 cap = budgetRaw * one;
        for (uint256 i = 0; i < levels.length; i++) {
            uint256 price = sidePrice(levels[i].price, invert, one);
            if (price == 0) continue;
            uint256 room = cap - weighted;
            uint256 take = room / price;
            if (levels[i].quantity < take) take = levels[i].quantity;
            weighted += take * price;
            quantityRaw += take;
            if (take < levels[i].quantity) break;
        }
        if (lotRaw > 1) quantityRaw = (quantityRaw / lotRaw) * lotRaw;
    }

    /// @dev `leverage − (leverage − 1) × premium`, scaled BPS²: the notional a whole unit of stake deploys.
    function deployScale(uint32 leverageBps, uint16 premiumBps) internal pure returns (uint256) {
        return uint256(leverageBps) * BPS - uint256(leverageBps - BPS) * premiumBps;
    }

    /// @notice The notional `stake` deploys at `leverageBps`: the stake, plus the front, less the premium.
    function budgetFor(uint256 stake, uint32 leverageBps, uint16 premiumBps) internal pure returns (uint256) {
        return stake * deployScale(leverageBps, premiumBps) / (BPS * BPS);
    }

    /// @notice The terms behind a fill that cost `costRaw`: the owner's cash, the reserve's front and its
    ///         premium, holding `stake + fronted − premium == costRaw` exactly.
    function terms(uint256 costRaw, uint32 leverageBps, uint16 premiumBps)
        internal
        pure
        returns (uint256 stake, uint256 fronted, uint256 premium)
    {
        uint256 nominal = ceilDiv(costRaw * BPS * BPS, deployScale(leverageBps, premiumBps));
        fronted = nominal * (leverageBps - BPS) / BPS;
        premium = fronted * premiumBps / BPS;
        stake = costRaw + premium - fronted;
    }

    /// @notice What the owner collects if the side lands: the contracts pay one each, the reserve is repaid first.
    function winIfRight(uint256 quantityRaw, uint256 fronted) internal pure returns (uint256) {
        return quantityRaw > fronted ? quantityRaw - fronted : 0;
    }

    /// @notice True once the mark has fallen to the maintenance line — the reserve's claim is at risk.
    function isKnockable(uint256 markRaw, uint256 fronted, uint16 maintenanceBps) internal pure returns (bool) {
        return fronted != 0 && markRaw * BPS < fronted * maintenanceBps;
    }

    /// @dev What `proceeds` repay of the front, and what is left for the owner.
    function split(uint256 proceeds, uint256 fronted) internal pure returns (uint256 reclaimed, uint256 returned) {
        reclaimed = proceeds < fronted ? proceeds : fronted;
        returned = proceeds - reclaimed;
    }
}
