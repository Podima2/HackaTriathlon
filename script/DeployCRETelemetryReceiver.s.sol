// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import "../contracts/CRETelemetryReceiver.sol";

contract DeployCRETelemetryReceiverScript is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address owner = vm.envAddress("CRE_TELEMETRY_OWNER");
        address forwarder = vm.envOr("CRE_TELEMETRY_FORWARDER", address(0));

        vm.startBroadcast(deployerPrivateKey);
        CRETelemetryReceiver receiver = new CRETelemetryReceiver(owner, forwarder);
        vm.stopBroadcast();

        console2.log("CRETelemetryReceiver:", address(receiver));
        console2.log("Owner:", owner);
        console2.log("Forwarder:", forwarder);
    }
}
