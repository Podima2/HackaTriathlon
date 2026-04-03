// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract HacktriToken {
    string public constant name = "HackaTri HACKTRI";
    string public constant symbol = "HACKTRI";
    uint8 public constant decimals = 18;

    uint256 public totalSupply;
    address public owner;

    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    error NotOwner();
    error InsufficientBalance();
    error InsufficientAllowance();
    error InvalidAddress();

    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);

    constructor(address initialOwner) {
        if (initialOwner == address(0)) revert InvalidAddress();
        owner = initialOwner;
    }

    function mint(address to, uint256 amount) external {
        if (msg.sender != owner) revert NotOwner();
        if (to == address(0)) revert InvalidAddress();
        totalSupply += amount;
        balanceOf[to] += amount;
        emit Transfer(address(0), to, amount);
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        _transfer(msg.sender, to, amount);
        return true;
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        emit Approval(msg.sender, spender, amount);
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        uint256 currentAllowance = allowance[from][msg.sender];
        if (currentAllowance < amount) revert InsufficientAllowance();
        allowance[from][msg.sender] = currentAllowance - amount;
        _transfer(from, to, amount);
        return true;
    }

    function _transfer(address from, address to, uint256 amount) internal {
        if (to == address(0)) revert InvalidAddress();
        uint256 balance = balanceOf[from];
        if (balance < amount) revert InsufficientBalance();
        balanceOf[from] = balance - amount;
        balanceOf[to] += amount;
        emit Transfer(from, to, amount);
    }
}
