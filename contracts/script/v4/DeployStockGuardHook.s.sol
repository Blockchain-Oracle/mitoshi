// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {HookMiner} from "v4-hooks-public/utils/HookMiner.sol";
import {IHooks} from "v4-core/interfaces/IHooks.sol";
import {IPoolManager} from "v4-core/interfaces/IPoolManager.sol";
import {PoolKey} from "v4-core/types/PoolKey.sol";
import {Currency} from "v4-core/types/Currency.sol";
import {DeploymentWriter} from "../lib/DeploymentWriter.sol";
import {Tickers} from "../stocks/Tickers.sol";
import {IPrintVerifier} from "../../src/engine/interfaces/IPrintVerifier.sol";
import {IDataStreamsVerifierProxy} from "../../src/engine/verifiers/DataStreamsPrintVerifier.sol";
import {StockReference} from "../../src/stocks/StockReference.sol";
import {IStockReference} from "../../src/stocks/interfaces/IStockReference.sol";
import {IStockSyncView} from "../../src/stocks/interfaces/IStockSyncView.sol";
import {StockGuardHook} from "../../src/stocks/hooks/StockGuardHook.sol";
import {GuardTypes as T} from "../../src/stocks/hooks/GuardTypes.sol";

/// @notice Deploys StockReference and the StockGuardHook (plan B.3.2–B.3.3, S15b) and registers the five mirror pools
///         `(pathUSD, mirror, 3000, 60, hook)` with the Q-024 defaults (B.3.4). Records the `guard` fragment.
///   forge script script/v4/DeployStockGuardHook.s.sol --rpc-url moderato --broadcast --slow \
///     --private-key <deployer-products> --tempo.fee-token 0x20C0000000000000000000000000000000000000 --priority-gas-price 1
///   tsx scripts/deploy/finalize.ts 42431 guard DeployStockGuardHook.s.sol && pnpm codegen
/// The hook address is mined (HookMiner's CREATE2 formula) for flags exactly 0x20C0 and deployed by calling the
/// Arachnid factory directly (as Uniswap's own Tempo hook script does, so the 0x76 tx path can't change the deployer).
/// Mining skips a `0x91…` address (Uniswap routes those hooks only after allowlisting, research 13 F30) and a
/// `0x20c0…` one (TIP-20 address space). The via-IR build must match the one mined against, which it does within one run.
/// Feeds (Moderato): RedStone TSLA/AMZN/PLTR/AMD regular feeds; NFLX has no signed source on Tempo (Q-011) so it gets
/// no feed — its pool is registered but can't initialize until one exists. Data Streams: the chain's VerifierProxy
/// (`DS_PROXY`, default 0 = none) with no stream pinned until credentials exist.
contract DeployStockGuardHook is DeploymentWriter {
    address internal constant ARACHNID = 0x4e59b44847b379578588920cA78FbF26c0B4956C;
    address internal constant POOL_MANAGER = 0x33620f62C5b9B2086dD6b62F4A297A9f30347029;
    address internal constant PATH_USD = 0x20C0000000000000000000000000000000000000;
    uint160 internal constant FLAGS = 0x20C0;
    uint24 internal constant FEE = 3000;
    int24 internal constant SPACING = 60;

    function run() external {
        string memory stocks = vm.readFile(string.concat("deployments/", vm.toString(block.chainid), "/stocks.json"));
        string memory engine = vm.readFile(string.concat("deployments/", vm.toString(block.chainid), "/engine.json"));
        address receiver = vm.envOr("SYNC_RECEIVER", vm.parseJsonAddress(stocks, ".contracts.StockSyncReceiver.address"));
        address redstone = vm.envOr("REDSTONE_VERIFIER", vm.parseJsonAddress(engine, ".contracts.RedStonePrintVerifier.address"));
        address dsProxy = vm.envOr("DS_PROXY", address(0));
        address owner = vm.envOr("GUARD_OWNER", msg.sender);
        address keeper = vm.envAddress("GUARD_KEEPER");
        require(POOL_MANAGER.code.length > 0, "PoolManager not on this chain");

        vm.startBroadcast();
        StockReference ref = new StockReference(msg.sender, IPrintVerifier(redstone), IDataStreamsVerifierProxy(dsProxy));
        ref.grantRole(ref.KEEPER_ROLE(), keeper);
        vm.stopBroadcast();

        bytes memory initCode = abi.encodePacked(
            type(StockGuardHook).creationCode, abi.encode(IPoolManager(POOL_MANAGER), IStockReference(address(ref)), IStockSyncView(receiver), msg.sender)
        );
        (address hookAt, uint256 salt) = mine(keccak256(initCode), vm.envOr("SALT_START", uint256(0)));
        require(HookMiner.computeAddress(ARACHNID, salt, initCode) == hookAt, "miner formula drift");

        vm.startBroadcast();
        (bool ok,) = ARACHNID.call(abi.encodePacked(bytes32(salt), initCode));
        require(ok && hookAt.code.length > 0, "hook not deployed at the mined address");
        StockGuardHook hook = StockGuardHook(hookAt);
        string[5] memory tickers = Tickers.testnet();
        for (uint256 i; i < 5; ++i) {
            address mirror = vm.parseJsonAddress(stocks, string.concat(".contracts.Mirror", tickers[i], ".address"));
            hook.registerPool(PoolKey(Currency.wrap(PATH_USD), Currency.wrap(mirror), FEE, SPACING, IHooks(hookAt)), T.defaults());
            bytes32 feed = keccak256(bytes(tickers[i])) == keccak256("NFLX") ? bytes32(0) : bytes32(bytes(tickers[i]));
            ref.setFeeds(mirror, feed, bytes32(0));
        }
        if (owner != msg.sender) {
            ref.grantRole(ref.DEFAULT_ADMIN_ROLE(), owner);
            ref.renounceRole(ref.DEFAULT_ADMIN_ROLE(), msg.sender);
            hook.transferOwnership(owner); // Ownable2Step: the owner accepts
        }
        vm.stopBroadcast();

        recordContract("StockReference", address(ref), "StockReference.sol:StockReference", false);
        recordContract("StockGuardHook", hookAt, "StockGuardHook.sol:StockGuardHook", false);
        recordRole("owner", owner);
        recordRole("KEEPER", keeper);
        recordParam("hookSalt", vm.toString(bytes32(salt)));
        recordParam("hookFlags", "0x20C0 (beforeInitialize | beforeSwap | afterSwap)");
        recordParam("create2Deployer", vm.toString(ARACHNID));
        recordParam("poolManager", vm.toString(POOL_MANAGER));
        recordParam("syncReceiver", vm.toString(receiver));
        recordParam("redstoneVerifier", vm.toString(redstone));
        recordParam("dataStreamsProxy", vm.toString(dsProxy));
        recordParam("poolFee", uint256(FEE));
        recordParam("poolTickSpacing", uint256(uint24(SPACING)));
        writePending("guard");
    }

    /// First salt ≥ `start` whose Arachnid CREATE2 address has exactly the 0x20C0 flag bits, no code, and neither a
    /// `0x91` first byte (Uniswap routing allowlist) nor a `0x20c0` prefix (TIP-20 address space).
    function mine(bytes32 initCodeHash, uint256 start) public view returns (address at, uint256 salt) {
        for (salt = start; salt < start + 2_000_000; ++salt) {
            at = address(uint160(uint256(keccak256(abi.encodePacked(bytes1(0xff), ARACHNID, salt, initCodeHash)))));
            if (acceptable(at) && at.code.length == 0) return (at, salt);
        }
        revert("no salt found");
    }

    function acceptable(address at) public pure returns (bool) {
        return uint160(at) & HookMiner.FLAG_MASK == FLAGS && uint8(uint160(at) >> 152) != 0x91
            && uint16(uint160(at) >> 144) != 0x20c0;
    }
}
