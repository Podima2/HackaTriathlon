// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "../contracts/HacktriToken.sol";
import "../contracts/PredictionMarket.sol";

contract PredictionMarketTest is Test {
    HacktriToken internal token;
    PredictionMarket internal market;

    address internal creator = address(0xA11CE);
    address internal traderYes = address(0xB0B);
    address internal traderNo = address(0xCAFE);
    address internal settlementOperator = 0x449CCED8EC3a7bf4ec6E763d55c1857a3f63239d;

    function setUp() external {
        token = new HacktriToken(address(this));
        market = new PredictionMarket(address(token), settlementOperator);

        token.mint(creator, 1_000_000 ether);
        token.mint(traderYes, 1_000_000 ether);
        token.mint(traderNo, 1_000_000 ether);

        vm.prank(creator);
        token.approve(address(market), type(uint256).max);
        vm.prank(traderYes);
        token.approve(address(market), type(uint256).max);
        vm.prank(traderNo);
        token.approve(address(market), type(uint256).max);
    }

    function testThresholdMarketLifecycle() external {
        bytes32 sessionIdHash = keccak256("22f9a743-8021-4e3c-a988-18a2d27b1cde");

        vm.prank(creator);
        uint256 marketId = market.createThresholdMarket(
            sessionIdHash,
            120_000,
            100_000,
            170,
            PredictionMarket.ThresholdDirection.Over,
            0,
            1_000 ether
        );

        vm.prank(traderYes);
        uint256 yesShares = market.takePosition(marketId, true, 200 ether);
        vm.prank(traderNo);
        uint256 noShares = market.takePosition(marketId, false, 150 ether);

        assertGt(yesShares, 0);
        assertGt(noShares, 0);
        assertEq(token.balanceOf(address(market)), 1_350 ether);

        market.closeMarket(marketId);
        market.requestSettlement(marketId);

        vm.prank(settlementOperator);
        market.fulfillSettlement(marketId, true, 176, 42, 119_850);

        uint256 traderYesBalanceBefore = token.balanceOf(traderYes);
        vm.prank(traderYes);
        uint256 payout = market.claim(marketId);
        uint256 traderYesBalanceAfter = token.balanceOf(traderYes);

        assertGt(payout, 0);
        assertEq(traderYesBalanceAfter, traderYesBalanceBefore + payout);
    }
}
