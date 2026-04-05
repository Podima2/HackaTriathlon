// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "../contracts/ParimutuelIntervalMarket.sol";

contract MockCollateral {
    string public constant name = "Mock";
    string public constant symbol = "MOCK";
    uint8 public constant decimals = 6;

    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    function mint(address to, uint256 amount) external {
        balanceOf[to] += amount;
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        return true;
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        balanceOf[msg.sender] -= amount;
        balanceOf[to] += amount;
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        uint256 allowed = allowance[from][msg.sender];
        if (allowed != type(uint256).max) {
            allowance[from][msg.sender] = allowed - amount;
        }
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
        return true;
    }
}

contract ParimutuelIntervalMarketTest is Test {
    MockCollateral internal collateral;
    ParimutuelIntervalMarket internal market;

    address internal owner = address(this);
    address internal operator = address(0xBEEF);
    address internal settler = address(0xCAFE);
    address internal alice = address(0xA11CE);
    address internal bob = address(0xB0B);
    bytes32 internal sessionIdHash = keccak256("session-interval-1");

    function setUp() external {
        collateral = new MockCollateral();
        market = new ParimutuelIntervalMarket(address(collateral), operator, settler);

        collateral.mint(alice, 1_000_000_000);
        collateral.mint(bob, 1_000_000_000);

        vm.prank(alice);
        collateral.approve(address(market), type(uint256).max);
        vm.prank(bob);
        collateral.approve(address(market), type(uint256).max);
    }

    function testCreateTradeSettleAndClaim() external {
        vm.prank(operator);
        uint256 marketId = market.createIntervalMarket(
            sessionIdHash,
            300_000,
            600_000,
            uint64(block.timestamp + 60),
            80,
            0
        );

        vm.prank(alice);
        market.takePosition(marketId, true, 200_000);
        vm.prank(bob);
        market.takePosition(marketId, false, 100_000);

        vm.warp(block.timestamp + 61);
        vm.prank(settler);
        market.settleIntervalMarket(marketId, 90, 77, 599_000);

        uint256 aliceBefore = collateral.balanceOf(alice);
        vm.prank(alice);
        uint256 payout = market.claim(marketId);
        assertEq(payout, 300_000);
        assertEq(collateral.balanceOf(alice), aliceBefore + 300_000);

        vm.prank(bob);
        vm.expectRevert(ParimutuelIntervalMarket.NothingToClaim.selector);
        market.claim(marketId);
    }

    function testRefundsEveryoneIfWinningSideIsEmpty() external {
        vm.prank(operator);
        uint256 marketId = market.createIntervalMarket(
            sessionIdHash,
            300_000,
            600_000,
            uint64(block.timestamp + 60),
            80,
            0
        );

        vm.prank(bob);
        market.takePosition(marketId, false, 125_000);

        vm.warp(block.timestamp + 61);
        vm.prank(settler);
        market.settleIntervalMarket(marketId, 90, 77, 599_000);

        uint256 bobBefore = collateral.balanceOf(bob);
        vm.prank(bob);
        uint256 payout = market.claim(marketId);
        assertEq(payout, 125_000);
        assertEq(collateral.balanceOf(bob), bobBefore + 125_000);
    }

    function testCannotTradeAfterCloseTimestamp() external {
        vm.prank(operator);
        uint256 marketId = market.createIntervalMarket(
            sessionIdHash,
            300_000,
            600_000,
            uint64(block.timestamp + 10),
            80,
            0
        );

        vm.warp(block.timestamp + 11);
        vm.prank(alice);
        vm.expectRevert(ParimutuelIntervalMarket.MarketCreationClosed.selector);
        market.takePosition(marketId, true, 100_000);
    }
}
