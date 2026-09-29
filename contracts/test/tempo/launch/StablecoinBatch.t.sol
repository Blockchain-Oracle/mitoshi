// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Test} from "forge-std/Test.sol";
import {StdPrecompiles} from "tempo-std/StdPrecompiles.sol";
import {ITIP20} from "tempo-std/interfaces/ITIP20.sol";
import {ITIP20RolesAuth} from "tempo-std/interfaces/ITIP20RolesAuth.sol";
import {IStablecoinDEX} from "tempo-std/interfaces/IStablecoinDEX.sol";
import {IFeeAMM} from "tempo-std/interfaces/IFeeAMM.sol";
import {LaunchRegistry} from "../../../src/launch/LaunchRegistry.sol";

/// The stablecoin launch (plan B.5.1, D-025): one creator batch of nine calls on Tempo's own precompiles, run here in
/// the same order and from the same sender as `packages/markets/src/launch/stablecoin.ts` builds it. On chain the nine
/// calls are one atomic Tempo transaction (the S17a sub-gate); here each runs as a call from the creator.
contract StablecoinBatchTest is Test {
    ITIP20 constant PATH_USD = ITIP20(0x20C0000000000000000000000000000000000000);
    IStablecoinDEX constant DEX = StdPrecompiles.STABLECOIN_DEX;
    IFeeAMM constant FEE_AMM = IFeeAMM(StdPrecompiles.TIP_FEE_MANAGER_ADDRESS);

    LaunchRegistry registry;
    address creator = makeAddr("creator");

    struct Params {
        string name;
        string symbol;
        bytes32 salt;
        string logoURI;
        uint256 supplyCap; // 0 = leave the default (uint128.max)
        uint256 initialSupply;
        uint128 bid; // pathUSD escrowed on the bid
        uint128 ask; // new coin escrowed on the ask
        int16 bidTick;
        int16 askTick;
        uint256 feeLiquidity; // pathUSD into the FeeAMM (validator side)
        string metadataURI;
    }

    function setUp() public {
        registry = new LaunchRegistry(address(this));
        // The local Tempo genesis credits the test contract with pathUSD; the creator pays bid + FeeAMM from it.
        PATH_USD.transfer(creator, 10_000e6);
    }

    function _defaults() internal pure returns (Params memory p) {
        p = Params({
            name: "Acme Dollar",
            symbol: "ACMEUSD",
            salt: keccak256("acme-1"),
            logoURI: "https://mitoshi.xyz/logos/acme.png",
            supplyCap: 1_000_000e6,
            initialSupply: 10_000e6,
            bid: 100e6,
            ask: 100e6,
            bidTick: -10,
            askTick: 10,
            feeLiquidity: 1_000e6,
            metadataURI: "ipfs://bafy-acme"
        });
    }

    /// The nine calls, in order (B.5.1). Returns the token and the two flip order ids.
    function _runBatch(Params memory p) internal returns (address token, uint128 bidId, uint128 askId) {
        vm.startPrank(creator);
        // 1 createToken (currency locked to USD, quote pathUSD, creator is admin)
        token = StdPrecompiles.TIP20_FACTORY.createToken(p.name, p.symbol, "USD", PATH_USD, creator, p.salt, p.logoURI);
        // 2 creator takes ISSUER_ROLE
        ITIP20RolesAuth(token).grantRole(ITIP20(token).ISSUER_ROLE(), creator);
        // 3 optional supply cap
        if (p.supplyCap != 0) ITIP20(token).setSupplyCap(p.supplyCap);
        // 4 initial supply to the creator
        ITIP20(token).mint(creator, p.initialSupply);
        // 5 list on the enshrined DEX against pathUSD
        DEX.createPair(token);
        // 6, 7 flip orders around the peg (no approve: the DEX has an implicit approval)
        bidId = DEX.placeFlip(token, p.bid, true, p.bidTick, p.askTick);
        askId = DEX.placeFlip(token, p.ask, false, p.askTick, p.bidTick);
        // 8 FeeAMM liquidity so the coin can pay fees (validator token = pathUSD)
        FEE_AMM.mint(token, address(PATH_USD), p.feeLiquidity, creator);
        // 9 record in the registry
        registry.recordStablecoin(token, p.metadataURI);
        vm.stopPrank();
    }

    function test_batch_createsListsFundsAndRecords() public {
        Params memory p = _defaults();
        address predicted = StdPrecompiles.TIP20_FACTORY.getTokenAddress(creator, p.salt);
        uint256 pathBefore = PATH_USD.balanceOf(creator);

        (address token, uint128 bidId, uint128 askId) = _runBatch(p);

        // 1–4: the token, at the predicted address, with its settings and the creator's supply.
        assertEq(token, predicted, "address prediction");
        assertTrue(StdPrecompiles.TIP20_FACTORY.isTIP20(token));
        assertEq(ITIP20(token).currency(), "USD");
        assertEq(address(ITIP20(token).quoteToken()), address(PATH_USD));
        assertEq(ITIP20(token).decimals(), 6);
        assertTrue(ITIP20RolesAuth(token).hasRole(creator, bytes32(0)), "creator is admin");
        assertTrue(ITIP20RolesAuth(token).hasRole(creator, ITIP20(token).ISSUER_ROLE()), "creator is issuer");
        assertEq(ITIP20(token).supplyCap(), p.supplyCap);
        assertEq(ITIP20(token).totalSupply(), p.initialSupply);
        assertEq(ITIP20(token).balanceOf(creator), p.initialSupply - p.ask, "ask escrowed by the DEX");

        // 5–7: the pair and both flip orders rest on the book.
        IStablecoinDEX.Order memory bid = DEX.getOrder(bidId);
        IStablecoinDEX.Order memory ask = DEX.getOrder(askId);
        assertEq(bid.maker, creator);
        assertTrue(bid.isBid && bid.isFlip);
        assertEq(bid.tick, p.bidTick);
        assertEq(bid.flipTick, p.askTick);
        assertEq(bid.amount, p.bid);
        assertEq(ask.maker, creator);
        assertTrue(!ask.isBid && ask.isFlip);
        assertEq(ask.tick, p.askTick);
        assertEq(ask.flipTick, p.bidTick);

        // 8: FeeAMM reserves on the (token → pathUSD) pool.
        IFeeAMM.Pool memory pool = FEE_AMM.getPool(token, address(PATH_USD));
        assertEq(pool.reserveValidatorToken, p.feeLiquidity);
        assertGt(FEE_AMM.liquidityBalances(FEE_AMM.getPoolId(token, address(PATH_USD)), creator), 0);

        // pathUSD: the bid's quote escrow (amount × price, amount in base units) and the FeeAMM deposit left the
        // creator's wallet, nothing else.
        uint256 bidQuote = (uint256(p.bid) * DEX.tickToPrice(p.bidTick) + DEX.PRICE_SCALE() - 1) / DEX.PRICE_SCALE();
        assertEq(bidQuote, 99_990_000);
        assertEq(pathBefore - PATH_USD.balanceOf(creator), bidQuote + p.feeLiquidity);

        // 9: the registry lists it.
        LaunchRegistry.Launch memory l = registry.launchOf(token);
        assertEq(uint8(l.kind), uint8(LaunchRegistry.Kind.Stablecoin));
        assertEq(l.creator, creator);
        assertEq(l.metadataURI, p.metadataURI);
        assertEq(registry.tokensLength(), 1);
        assertEq(registry.tokens(0), token);
    }

    function test_batch_withoutSupplyCapKeepsTheDefault() public {
        Params memory p = _defaults();
        p.supplyCap = 0;
        (address token,,) = _runBatch(p);
        assertEq(ITIP20(token).supplyCap(), type(uint128).max);
    }

    function test_batch_flipOrderBelowDexMinimumReverts() public {
        Params memory p = _defaults();
        p.bid = 99_999_999; // MIN_ORDER_AMOUNT is 100e6
        assertEq(DEX.MIN_ORDER_AMOUNT(), 100e6);
        vm.expectRevert();
        this.runBatchExternal(p);
    }

    function test_batch_flipTickOnTheWrongSideReverts() public {
        Params memory p = _defaults();
        (p.bidTick, p.askTick) = (10, -10); // a bid must flip upward
        vm.expectRevert();
        this.runBatchExternal(p);
    }

    function test_batch_supplyCapBelowInitialSupplyReverts() public {
        Params memory p = _defaults();
        p.supplyCap = p.initialSupply - 1;
        vm.expectRevert();
        this.runBatchExternal(p);
    }

    function test_batch_sameSaltTwiceReverts() public {
        _runBatch(_defaults());
        vm.expectRevert();
        this.runBatchExternal(_defaults());
    }

    /// The registry refuses a coin whose currency is not USD even if the creator administers it.
    function test_registry_refusesNonUsdCurrency() public {
        vm.startPrank(creator);
        address eur = StdPrecompiles.TIP20_FACTORY.createToken("Acme Euro", "ACMEEUR", "EUR", _eurQuote(), creator, keccak256("eur"));
        vm.expectRevert(abi.encodeWithSelector(LaunchRegistry.CurrencyNotUSD.selector, eur, "EUR"));
        registry.recordStablecoin(eur, "");
        vm.stopPrank();
    }

    function test_registry_refusesAQuoteOtherThanPathUsd() public {
        ITIP20 alpha = ITIP20(0x20C0000000000000000000000000000000000001);
        vm.startPrank(creator);
        address t = StdPrecompiles.TIP20_FACTORY.createToken("Alpha-quoted", "AQ", "USD", alpha, creator, keccak256("aq"));
        vm.expectRevert(abi.encodeWithSelector(LaunchRegistry.QuoteNotPathUSD.selector, t, address(alpha)));
        registry.recordStablecoin(t, "");
        vm.stopPrank();
    }

    function test_registry_refusesACallerWhoIsNotAdmin() public {
        (address token,,) = _runBatch(_defaults());
        address other = makeAddr("other");
        vm.prank(other);
        vm.expectRevert(); // AlreadyRecorded fires first for a recorded token; use a fresh one below
        registry.recordStablecoin(token, "");

        vm.prank(creator);
        address fresh = StdPrecompiles.TIP20_FACTORY.createToken("Fresh", "FRESH", "USD", PATH_USD, creator, keccak256("fresh"));
        vm.prank(other);
        vm.expectRevert(abi.encodeWithSelector(LaunchRegistry.NotTokenAdmin.selector, fresh, other));
        registry.recordStablecoin(fresh, "");
    }

    function test_registry_refusesNonTip20AndDuplicates() public {
        vm.expectRevert(abi.encodeWithSelector(LaunchRegistry.NotTIP20.selector, address(this)));
        registry.recordStablecoin(address(this), "");
        (address token,,) = _runBatch(_defaults());
        vm.prank(creator);
        vm.expectRevert(abi.encodeWithSelector(LaunchRegistry.AlreadyRecorded.selector, token));
        registry.recordStablecoin(token, "");
    }

    function runBatchExternal(Params memory p) external {
        _runBatch(p);
    }

    /// A non-USD token needs a non-USD quote; create a EUR root for the negative case.
    function _eurQuote() internal returns (ITIP20) {
        address root = StdPrecompiles.TIP20_FACTORY.createToken("Test EUR root", "TEUR", "EUR", PATH_USD, address(this), keccak256("teur"));
        return ITIP20(root);
    }
}
