export const prerender = false;
import type { APIRoute } from 'astro';

export const GET: APIRoute = async () => {
    return new Response(JSON.stringify({
        name: "Lobster Mix",
        description: "Decentralized Mixer for AI Agents. Supports command: SEND 1 USDC TO <ADDRESS>",
        version: "1.0.0",
        network: {
            chainId: 80002,
            name: "Polygon Amoy Testnet",
            rpcUrl: "https://polygon-amoy.g.alchemy.com/v2/5IWkkFu-rS6plYHO9MLq-",
            explorer: "https://amoy.polygonscan.com"
        },
        contracts: {
            LobsterMixer: {
                address: "0x70Da0050Ac783967cB21e4b53311B4060279a76B",
                abi: [
                    "function deposit(uint256 amount, address receiver, bytes32 entropy) external",
                    "function getSessionProgress(uint256 sessionId) external view returns (uint256 totalShards, uint256 shardsProcessed, uint256 stepsCompleted, uint256 stepsRemaining, uint256 shardsPerWave, bool completed)",
                    "event MixCompleted(uint256 indexed sessionId, address receiver, uint256 amount, uint256 totalWaves)"
                ]
            }
        },
        capabilities: [
            "deposit",
            "mix",
            "status",
            "withdraw"
        ]
    }), {
        status: 200,
        headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
        }
    });
};
