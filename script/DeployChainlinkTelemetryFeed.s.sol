// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import "../contracts/ChainlinkTelemetryFeed.sol";

contract DeployChainlinkTelemetryFeedScript is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address reporter = vm.envAddress("CHAINLINK_TELEMETRY_REPORTER");

        vm.startBroadcast(deployerPrivateKey);
        ChainlinkTelemetryFeed feed = new ChainlinkTelemetryFeed(reporter);
        vm.stopBroadcast();

        console2.log("ChainlinkTelemetryFeed:", address(feed));
        console2.log("Reporter:", reporter);
    }
}
