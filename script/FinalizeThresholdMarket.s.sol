// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import "../contracts/PredictionMarket.sol";

contract FinalizeThresholdMarketScript is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address marketAddress = vm.envAddress("PREDICTION_MARKET");
        uint256 marketId = vm.envUint("MARKET_ID");
        bool booleanOutcome = vm.envBool("BOOLEAN_OUTCOME");
        int256 observedValue = int256(vm.envUint("OBSERVED_VALUE"));
        uint32 sampleSeq = uint32(vm.envUint("SAMPLE_SEQ"));
        uint64 sampleElapsedMs = uint64(vm.envUint("SAMPLE_ELAPSED_MS"));

        vm.startBroadcast(deployerPrivateKey);

        PredictionMarket market = PredictionMarket(marketAddress);
        market.closeMarket(marketId);
        market.requestSettlement(marketId);
        market.fulfillSettlement(marketId, booleanOutcome, observedValue, sampleSeq, sampleElapsedMs);

        vm.stopBroadcast();

        console2.log("PredictionMarket:", marketAddress);
        console2.log("Market settled:", marketId);
    }
}
