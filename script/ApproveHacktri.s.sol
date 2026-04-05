// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";

interface IERC20Approve {
    function approve(address spender, uint256 amount) external returns (bool);
}

contract ApproveHacktriScript is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address tokenAddress = vm.envAddress("COLLATERAL_TOKEN");
        address spender = vm.envAddress("SPENDER");
        uint256 amount = vm.envUint("AMOUNT");

        vm.startBroadcast(deployerPrivateKey);
        IERC20Approve(tokenAddress).approve(spender, amount);
        vm.stopBroadcast();

        console2.log("Collateral token:", tokenAddress);
        console2.log("Spender:", spender);
        console2.log("Amount:", amount);
    }
}
