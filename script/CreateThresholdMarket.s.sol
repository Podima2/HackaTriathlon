// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import "../contracts/PredictionMarket.sol";

contract CreateThresholdMarketScript is Script {
    function run() external returns (uint256 marketId) {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address marketAddress = vm.envAddress("PREDICTION_MARKET");
        bytes32 sessionIdHash = vm.envBytes32("SESSION_ID_HASH");
        uint64 t = uint64(vm.envUint("TARGET_ELAPSED_MS"));
        uint64 tradingClosesAtElapsedMs = uint64(vm.envUint("TRADING_CLOSES_AT_MS"));
        uint64 thresholdValue = uint64(vm.envUint("THRESHOLD_VALUE"));
        uint8 direction = uint8(vm.envUint("THRESHOLD_DIRECTION"));
        uint8 signalType = uint8(vm.envUint("SIGNAL_TYPE"));
        uint256 seedLiquidity = vm.envUint("SEED_LIQUIDITY");

        vm.startBroadcast(deployerPrivateKey);

        marketId = PredictionMarket(marketAddress).createThresholdMarket(
            sessionIdHash,
            t,
            tradingClosesAtElapsedMs,
            thresholdValue,
            PredictionMarket.ThresholdDirection(direction),
            signalType,
            seedLiquidity
        );

        vm.stopBroadcast();

        console2.log("PredictionMarket:", marketAddress);
        console2.log("Market ID:", marketId);
    }
}
