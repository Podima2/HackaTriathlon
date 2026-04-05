// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import "../contracts/PredictionMarket.sol";

contract DeployThresholdMarketScript is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address settlementOperator = vm.envAddress("SETTLEMENT_OPERATOR");
        address collateralToken = vm.envAddress("COLLATERAL_TOKEN");

        vm.startBroadcast(deployerPrivateKey);
        PredictionMarket market = new PredictionMarket(collateralToken, settlementOperator);

        vm.stopBroadcast();

        console2.log("Collateral token:", collateralToken);
        console2.log("PredictionMarket:", address(market));
        console2.log("Settlement operator:", settlementOperator);
    }
}
