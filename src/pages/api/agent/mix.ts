export const prerender = false;
import { ethers } from "ethers";

const RPC_URL = import.meta.env.AMOY_RPC_URL || process.env.AMOY_RPC_URL || "https://polygon-amoy.g.alchemy.com/v2/DEMO";
const MIXER_ADDRESS = "0x70Da0050Ac783967cB21e4b53311B4060279a76B";
const USDC_ADDR_AMOY = "0x41E94Eb019C0762f9Bfcf9Fb1E58725BfB0e7582";

const MIXER_ABI = [
    "function deposit(uint256 amount, address receiver, bytes32 entropy) external payable",
    "function depositERC20(address _token, uint256 _mixAmount, address _receiver, bytes32 _entropy) external"
];

const ERC20_ABI = [
    "function approve(address spender, uint256 amount) external returns (bool)",
    "function decimals() external view returns (uint8)"
];

export async function POST({ request }: { request: Request }) {
    try {
        const body = await request.json();
        const { amount, token, receiver } = body;

        // Safety check
        const privateKey = import.meta.env.PRIVATE_KEY || process.env.PRIVATE_KEY;
        if (!privateKey) {
            throw new Error("Missing Server Private Key (Check .env)");
        }

        console.log(`[API] REAL MIX Requested: ${amount} ${token} -> ${receiver}`);

        // Setup Ethers
        const provider = new ethers.JsonRpcProvider(RPC_URL);
        const wallet = new ethers.Wallet(privateKey, provider);
        const mixer = new ethers.Contract(MIXER_ADDRESS, MIXER_ABI, wallet);

        let tx;

        if (token === "USDC") {
            console.log("[API] Processing USDC Mix...");
            const usdc = new ethers.Contract(USDC_ADDR_AMOY, ERC20_ABI, wallet);

            // 1. Amount Parsing (USDC = 6 decimals)
            const amountUnits = ethers.parseUnits(amount.toString(), 6);

            // 2. Approve (Covering Amount + Fee)
            // Contract takes 0.5% fee on top. Best to approve Max to avoid allowance issues.
            console.log(`[API] Approving MAX USDC for Mixer...`);
            const approveTx = await usdc.approve(MIXER_ADDRESS, ethers.MaxUint256);
            await approveTx.wait();
            console.log("[API] Approved. Calling depositERC20...");

            // 3. Deposit
            const entropy = ethers.randomBytes(32);
            tx = await mixer.depositERC20(USDC_ADDR_AMOY, amountUnits, receiver, entropy);

        } else {
            // Fallback to Native POL
            // Contract requires minimum 0.5 POL.
            const amountWei = ethers.parseEther("0.6");
            const entropy = ethers.randomBytes(32);
            tx = await mixer.deposit(amountWei, receiver, entropy, { value: amountWei });
        }

        console.log(`[API] Tx Sent: ${tx.hash}`);

        return new Response(JSON.stringify({
            success: true,
            message: `Initiated REAL Mix via ${token === "USDC" ? "ERC20" : "Native"} on Polygon Amoy`,
            transactionHash: tx.hash,
            network: "Polygon Amoy",
            status: "pending",
            explorer: `https://amoy.polygonscan.com/tx/${tx.hash}`
        }), {
            status: 200,
            headers: {
                "Content-Type": "application/json"
            }
        });

    } catch (error: any) {
        console.error("[API] Real Mix Failed:", error);
        return new Response(JSON.stringify({
            success: false,
            error: error.message || "Transaction Failed",
            hint: "Ensure Server Wallet has funds (POL + USDC)"
        }), { status: 500 });
    }
}

export async function GET({ request }: { request: Request }) {
    const url = new URL(request.url);
    const receiver = url.searchParams.get('receiver');

    if (receiver) {
        // Default to USDC via GET for test
        return POST({
            request: new Request(url.toString(), {
                method: "POST",
                body: JSON.stringify({ amount: 1, token: "USDC", receiver })
            })
        });
    }
    return new Response("Lobster Mix API: Use POST", { status: 200 });
}
