// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import "../contracts/PredictionMarket.sol";

contract ClaimMarketScript is Script {
    function run() external returns (uint256 payoutAmount) {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address marketAddress = vm.envAddress("PREDICTION_MARKET");
        uint256 marketId = vm.envUint("MARKET_ID");

        vm.startBroadcast(deployerPrivateKey);
        payoutAmount = PredictionMarket(marketAddress).claim(marketId);
        vm.stopBroadcast();

        console2.log("PredictionMarket:", marketAddress);
        console2.log("Claimed market:", marketId);
        console2.log("Payout:", payoutAmount);
    }
}
