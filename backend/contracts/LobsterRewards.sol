// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract LobsterRewards is ReentrancyGuard, Ownable {
    address public mixer;
    mapping(uint256 => mapping(address => uint256)) public sessionBalances; // sessionId => token => amount

    event RewardDeposited(uint256 indexed sessionId, address token, uint256 amount);
    event RewardDistributed(uint256 indexed sessionId, address token, uint256 totalAmount, uint256 nodeCount);

    // Node Stats
    mapping(address => uint256) public nodeNativeEarnings;
    mapping(address => mapping(address => uint256)) public nodeTokenEarnings;
    mapping(address => uint256) public nodeSessionCounts;

    constructor(address _mixer) {
        mixer = _mixer;
    }

    modifier onlyMixer() {
        require(msg.sender == mixer, "Only mixer can call");
        _;
    }

    function depositReward(uint256 sessionId, address token, uint256 amount) external onlyMixer {
        // Tokens should already be transferred to this contract by the Mixer
        sessionBalances[sessionId][token] += amount;
        emit RewardDeposited(sessionId, token, amount);
    }

    function distribute(
        uint256 sessionId, 
        address token, 
        address[] calldata nodes,
        uint256[] calldata shares
    ) external onlyMixer nonReentrant {
        uint256 totalReward = sessionBalances[sessionId][token];
        if (totalReward == 0) return;
        
        uint256 totalShares = 0;
        for (uint i = 0; i < shares.length; i++) {
            totalShares += shares[i];
        }
        
        if (totalShares == 0) return;

        // Perform distribution in loop (simplified to avoid stack depth)
        for (uint i = 0; i < nodes.length; i++) {
            if (shares[i] > 0) {
                uint256 amount = (totalReward * shares[i]) / totalShares;
                if (amount > 0) {
                    _payout(nodes[i], token, amount);
                }
            }
        }
        
        sessionBalances[sessionId][token] = 0;
        emit RewardDistributed(sessionId, token, totalReward, nodes.length);
    }

    function _payout(address node, address token, uint256 amount) internal {
        if (token == address(0)) {
            payable(node).transfer(amount);
            nodeNativeEarnings[node] += amount;
        } else {
            IERC20(token).transfer(node, amount);
            nodeTokenEarnings[node][token] += amount;
        }
        nodeSessionCounts[node]++;
    }

    // Allow receiving Native currency
    receive() external payable {}

    function getSatelliteStats(address node, address token) external view returns (uint256 earnings, uint256 sessions) {
        if (token == address(0)) {
            earnings = nodeNativeEarnings[node];
        } else {
            earnings = nodeTokenEarnings[node][token];
        }
        sessions = nodeSessionCounts[node];
    }

    /// @notice Backfill/Correction for stats (Owner Only)
    function setNodeStats(address node, uint256 native, uint256 usdc, uint256 sess) external onlyOwner {
        if (native > 0) {
            nodeNativeEarnings[node] = native;
            // Attempt to pay out if contract has funds (Backfill fix)
            if (address(this).balance >= native) {
                payable(node).transfer(native);
            }
        }
        if (usdc > 0) {
             address USDC = 0x41E94Eb019C0762f9Bfcf9Fb1E58725BfB0e7582;
             nodeTokenEarnings[node][USDC] = usdc;
             // Attempt to pay out USDC if contract has funds
             if (IERC20(USDC).balanceOf(address(this)) >= usdc) {
                 IERC20(USDC).transfer(node, usdc);
             }
        }
        if (sess > 0) nodeSessionCounts[node] = sess;
    }
}
