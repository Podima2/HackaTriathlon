// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import "../contracts/HacktriToken.sol";
import "../contracts/PredictionMarket.sol";

contract DeployThresholdMarketScript is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address settlementOperator = vm.envAddress("SETTLEMENT_OPERATOR");
        address deployer = vm.addr(deployerPrivateKey);

        vm.startBroadcast(deployerPrivateKey);

        HacktriToken token = new HacktriToken(deployer);
        PredictionMarket market = new PredictionMarket(address(token), settlementOperator);

        vm.stopBroadcast();

        console2.log("HACKTRI token:", address(token));
        console2.log("PredictionMarket:", address(market));
        console2.log("Settlement operator:", settlementOperator);
    }
}
