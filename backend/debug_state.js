
import { ethers } from 'ethers';
import 'dotenv/config';

const CONTRACT_ADDRESS = "0xBd33CAfF15e86ac7FeF3eE0a87791DC22DEb6462";
const RPC_URL = "https://rpc-amoy.polygon.technology/";

const ABI = [
    "function sessionCount() external view returns (uint256)",
    "function sessions(uint256) external view returns (uint256 id, address depositor, address receiver, uint256 totalAmount, uint256 totalShards, uint256 shardsProcessed, uint256 meshFee, uint256 startTime, uint256 lastCycleTime, uint256 cyclesCompleted, bool completed)",
    "function getActiveNodeCount() external view returns (uint256)"
];

async function main() {
    const provider = new ethers.JsonRpcProvider(RPC_URL);
    const contract = new ethers.Contract(CONTRACT_ADDRESS, ABI, provider);

    console.log(`Checking Contract: ${CONTRACT_ADDRESS}`);

    try {
        const count = await contract.sessionCount();
        console.log(`Session Count: ${count}`);

        const nodes = await contract.getActiveNodeCount();
        console.log(`Active Nodes: ${nodes}`);

        if (count > 0) {
            const session = await contract.sessions(count); // Check latest
            console.log("Latest Session:", session);
        } else {
            console.log("No sessions found.");
        }

    } catch (e) {
        console.error("Error:", e);
    }
}

main();
