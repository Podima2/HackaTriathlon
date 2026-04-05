// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import "../contracts/ParimutuelIntervalMarket.sol";

contract DeployParimutuelIntervalMarketScript is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address collateralToken = vm.envAddress("COLLATERAL_TOKEN");
        address marketOperator = vm.envAddress("INTERVAL_MARKET_OPERATOR");
        address settlementOperator = vm.envAddress("INTERVAL_SETTLEMENT_OPERATOR");

        vm.startBroadcast(deployerPrivateKey);
        ParimutuelIntervalMarket market = new ParimutuelIntervalMarket(
            collateralToken,
            marketOperator,
            settlementOperator
        );
        vm.stopBroadcast();

        console2.log("ParimutuelIntervalMarket:", address(market));
        console2.log("Collateral token:", collateralToken);
        console2.log("Market operator:", marketOperator);
        console2.log("Settlement operator:", settlementOperator);
    }
}
