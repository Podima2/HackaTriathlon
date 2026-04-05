// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import "../contracts/HacktriToken.sol";

contract MintHacktriScript is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address tokenAddress = vm.envAddress("HACKTRI_TOKEN");
        address recipient = vm.envAddress("RECIPIENT");
        uint256 amount = vm.envUint("AMOUNT");

        vm.startBroadcast(deployerPrivateKey);
        HacktriToken(tokenAddress).mint(recipient, amount);
        vm.stopBroadcast();

        console2.log("HACKTRI token:", tokenAddress);
        console2.log("Recipient:", recipient);
        console2.log("Amount:", amount);
    }
}
