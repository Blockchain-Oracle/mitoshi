// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {ITIP20} from "tempo-std/interfaces/ITIP20.sol";
import {ITIP20Factory} from "tempo-std/interfaces/ITIP20Factory.sol";
import {ITIP20RolesAuth} from "tempo-std/interfaces/ITIP20RolesAuth.sol";

/// @title MirrorIssuer — plan B.2 mirror issuance, shared by `IssueMirrors` and the Tempo bridge deploy.
/// @notice Phase 1 `issue`: `TIP20_FACTORY.createToken` with `salt = keccak256("cwf.mirror.v1:" ‖ TICKER)`, name
///         "Bridged <T> Stock Token (unofficial)", symbol "b<T>", currency "<T>", quote pathUSD, own lettermark logo
///         (no Robinhood marks, Q-023), then asserts currency/quote/decimals 6/policy 1. Idempotent: an existing token at
///         the predicted address is reused. Phase 2 `handOver`: supply cap, `ISSUER_ROLE` → the adapter proxy only,
///         PAUSE/UNPAUSE/BURN_BLOCKED → Safe, admin → Safe and the issuer renounces (skipped when Safe == issuer, the
///         testnet default of Q-016).
abstract contract MirrorIssuer {
    ITIP20Factory internal constant FACTORY = ITIP20Factory(0x20Fc000000000000000000000000000000000000);
    ITIP20 internal constant PATH_USD = ITIP20(0x20C0000000000000000000000000000000000000);
    bytes32 internal constant DEFAULT_ADMIN_ROLE = bytes32(0);

    error MirrorMismatch(string what);

    function mirrorSalt(string memory ticker) internal pure returns (bytes32) {
        return keccak256(bytes(string.concat("cwf.mirror.v1:", ticker)));
    }

    function mirrorName(string memory ticker) internal pure returns (string memory) {
        return string.concat("Bridged ", ticker, " Stock Token (unofficial)");
    }

    function mirrorLogo(string memory ticker) internal pure returns (string memory) {
        return string.concat(
            "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'><rect width='64' height='64' ",
            "rx='14' fill='%2311151C'/><text x='32' y='39' font-family='monospace' font-size='15' fill='%23E8ECF1' ",
            "text-anchor='middle'>b", ticker, "</text></svg>"
        );
    }

    /// @param issuer The account that sends the factory call (the script's broadcaster).
    function issue(string memory ticker, address issuer) internal returns (address mirror) {
        bytes32 salt = mirrorSalt(ticker);
        mirror = FACTORY.getTokenAddress(issuer, salt);
        if (!FACTORY.isTIP20(mirror)) {
            address created = FACTORY.createToken(
                mirrorName(ticker), string.concat("b", ticker), ticker, PATH_USD, issuer, salt, mirrorLogo(ticker)
            );
            if (created != mirror) revert MirrorMismatch("address");
        }
        assertMirror(mirror, ticker);
    }

    function assertMirror(address mirror, string memory ticker) internal view {
        ITIP20 t = ITIP20(mirror);
        if (keccak256(bytes(t.currency())) != keccak256(bytes(ticker))) revert MirrorMismatch("currency");
        if (address(t.quoteToken()) != address(PATH_USD)) revert MirrorMismatch("quote");
        if (t.decimals() != 6) revert MirrorMismatch("decimals");
        if (t.transferPolicyId() != 1) revert MirrorMismatch("policy");
    }

    function handOver(address mirror, address adapter, address safe, address issuer, uint256 supplyCap) internal {
        ITIP20 t = ITIP20(mirror);
        ITIP20RolesAuth r = ITIP20RolesAuth(mirror);
        if (t.supplyCap() != supplyCap) t.setSupplyCap(supplyCap);
        if (!r.hasRole(adapter, t.ISSUER_ROLE())) r.grantRole(t.ISSUER_ROLE(), adapter);
        if (issuer != adapter && r.hasRole(issuer, t.ISSUER_ROLE())) r.revokeRole(t.ISSUER_ROLE(), issuer);
        bytes32[3] memory safeRoles = [t.PAUSE_ROLE(), t.UNPAUSE_ROLE(), t.BURN_BLOCKED_ROLE()];
        for (uint256 i; i < 3; i++) {
            if (!r.hasRole(safe, safeRoles[i])) r.grantRole(safeRoles[i], safe);
        }
        if (safe != issuer) {
            if (!r.hasRole(safe, DEFAULT_ADMIN_ROLE)) r.grantRole(DEFAULT_ADMIN_ROLE, safe);
            r.renounceRole(DEFAULT_ADMIN_ROLE);
        }
    }
}
