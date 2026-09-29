// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Ownable, Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {ITIP20} from "tempo-std/interfaces/ITIP20.sol";
import {ITIP20Factory} from "tempo-std/interfaces/ITIP20Factory.sol";
import {ITIP20RolesAuth} from "tempo-std/interfaces/ITIP20RolesAuth.sol";
import {ReservedCodes} from "./ReservedCodes.sol";

/// @title LaunchRegistry
/// @notice The list of tokens launched through Mitoshi (plan B.5.1, D-025). A stablecoin creator records their coin as
///         the last call of their own creation batch; memecoins are recorded by the CurveLaunchpad (S17b). The registry
///         holds no funds and no token roles: it only refuses what must never be listed — a non-TIP-20, a caller who is
///         not the token's admin, a currency other than "USD", or a quote token other than pathUSD — and answers
///         `isReservedCode` for the memecoin currency guard.
contract LaunchRegistry is Ownable2Step {
    enum Kind {
        None,
        Stablecoin,
        Memecoin
    }

    struct Launch {
        Kind kind;
        address creator;
        uint64 recordedAt;
        uint32 index;
        string metadataURI;
    }

    ITIP20Factory public constant TIP20_FACTORY = ITIP20Factory(0x20Fc000000000000000000000000000000000000);
    address public constant PATH_USD = 0x20C0000000000000000000000000000000000000;
    /// @dev TIP-20 roles follow OpenZeppelin AccessControl: the admin role is bytes32(0).
    bytes32 public constant DEFAULT_ADMIN_ROLE = bytes32(0);
    uint256 public constant MAX_METADATA_URI = 256;

    /// @notice The CurveLaunchpad allowed to record memecoins; set once (S17b).
    address public curveLaunchpad;

    mapping(address token => Launch) private _launches;
    address[] private _tokens;
    /// @notice Codes the owner reserved after deployment (e.g. a newly listed Stock Token), on top of the table.
    mapping(bytes8 code => bool) public extraReserved;

    event StablecoinRecorded(address indexed token, address indexed creator, uint256 index, string metadataURI);
    event MemecoinRecorded(address indexed token, address indexed creator, uint256 index, string metadataURI);
    event CurveLaunchpadSet(address launchpad);
    event CodeReserved(string code);

    error NotTIP20(address token);
    error AlreadyRecorded(address token);
    error NotTokenAdmin(address token, address caller);
    error CurrencyNotUSD(address token, string currency);
    error QuoteNotPathUSD(address token, address quote);
    error NotCurveLaunchpad(address caller);
    error CurveLaunchpadAlreadySet(address launchpad);
    error ZeroAddress();
    error ReservedCode(string code);
    error MetadataURITooLong(uint256 length);

    constructor(address initialOwner) Ownable(initialOwner) {}

    // ── records ────────────────────────────────────────────────────────────────────────────────────────────────────

    /// @notice Records a stablecoin the caller administers. Meant as call 9 of the creator's batch (B.5.1).
    function recordStablecoin(address token, string calldata metadataURI) external returns (uint256 index) {
        _checkTIP20(token);
        if (!ITIP20RolesAuth(token).hasRole(msg.sender, DEFAULT_ADMIN_ROLE)) revert NotTokenAdmin(token, msg.sender);
        string memory currency = ITIP20(token).currency();
        if (keccak256(bytes(currency)) != keccak256("USD")) revert CurrencyNotUSD(token, currency);
        address quote = address(ITIP20(token).quoteToken());
        if (quote != PATH_USD) revert QuoteNotPathUSD(token, quote);
        index = _record(token, Kind.Stablecoin, msg.sender, metadataURI);
        emit StablecoinRecorded(token, msg.sender, index, metadataURI);
    }

    /// @notice Records a memecoin; only the CurveLaunchpad, which has already applied the currency guard.
    function recordMemecoin(address token, address creator, string calldata metadataURI) external returns (uint256 index) {
        if (msg.sender != curveLaunchpad) revert NotCurveLaunchpad(msg.sender);
        _checkTIP20(token);
        string memory currency = ITIP20(token).currency();
        if (isReservedCode(currency)) revert ReservedCode(currency);
        index = _record(token, Kind.Memecoin, creator, metadataURI);
        emit MemecoinRecorded(token, creator, index, metadataURI);
    }

    // ── admin ──────────────────────────────────────────────────────────────────────────────────────────────────────

    function setCurveLaunchpad(address launchpad) external onlyOwner {
        if (launchpad == address(0)) revert ZeroAddress();
        if (curveLaunchpad != address(0)) revert CurveLaunchpadAlreadySet(curveLaunchpad);
        curveLaunchpad = launchpad;
        emit CurveLaunchpadSet(launchpad);
    }

    /// @notice Adds reserved codes (only ever grows). Codes longer than 8 bytes cannot be matched and are refused.
    function reserveCodes(string[] calldata codes) external onlyOwner {
        for (uint256 i; i < codes.length; i++) {
            (bytes8 key, bool fits) = _key(codes[i]);
            if (!fits) revert ReservedCode(codes[i]);
            extraReserved[key] = true;
            emit CodeReserved(codes[i]);
        }
    }

    // ── views ──────────────────────────────────────────────────────────────────────────────────────────────────────

    /// @notice True for ISO 4217 codes, the Robinhood Stock Token tickers, "USD" and owner additions, compared
    ///         case-insensitively (ASCII). The empty code is reserved too: a TIP-20 needs a currency.
    function isReservedCode(string memory code) public view returns (bool) {
        (bytes8 key, bool fits) = _key(code);
        if (!fits) return false;
        if (key == bytes8(0)) return true;
        return ReservedCodes.contains(key) || extraReserved[key];
    }

    function launchOf(address token) external view returns (Launch memory) {
        return _launches[token];
    }

    function tokensLength() external view returns (uint256) {
        return _tokens.length;
    }

    function tokens(uint256 index) external view returns (address) {
        return _tokens[index];
    }

    /// @notice A page of launched tokens, oldest first.
    function tokensSlice(uint256 offset, uint256 limit) external view returns (address[] memory page) {
        uint256 end = offset + limit;
        if (end > _tokens.length) end = _tokens.length;
        if (offset >= end) return new address[](0);
        page = new address[](end - offset);
        for (uint256 i = offset; i < end; i++) page[i - offset] = _tokens[i];
    }

    // ── internals ──────────────────────────────────────────────────────────────────────────────────────────────────

    function _checkTIP20(address token) private view {
        if (!TIP20_FACTORY.isTIP20(token)) revert NotTIP20(token);
        if (_launches[token].kind != Kind.None) revert AlreadyRecorded(token);
    }

    function _record(address token, Kind kind, address creator, string calldata metadataURI) private returns (uint256 index) {
        if (bytes(metadataURI).length > MAX_METADATA_URI) revert MetadataURITooLong(bytes(metadataURI).length);
        index = _tokens.length;
        _tokens.push(token);
        _launches[token] = Launch(kind, creator, uint64(block.timestamp), uint32(index), metadataURI);
    }

    /// @dev Uppercases ASCII a–z and left-aligns into 8 bytes; `fits` is false beyond 8 bytes.
    function _key(string memory code) private pure returns (bytes8 key, bool fits) {
        bytes memory b = bytes(code);
        if (b.length > 8) return (bytes8(0), false);
        bytes memory up = new bytes(8);
        for (uint256 i; i < b.length; i++) {
            bytes1 c = b[i];
            up[i] = (c >= 0x61 && c <= 0x7a) ? bytes1(uint8(c) - 32) : c;
        }
        return (bytes8(up), true);
    }
}
