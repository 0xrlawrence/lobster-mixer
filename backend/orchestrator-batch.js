import { ethers } from 'ethers';
import express from 'express';
import 'dotenv/config';
import crypto from 'crypto';

// ============ CONFIGURATION ============
const CONTRACT_ADDRESS = "0x70Da0050Ac783967cB21e4b53311B4060279a76B";
const RPC_URL = process.env.RPC_URL || "https://polygon-amoy.g.alchemy.com/v2/5IWkkFu-rS6plYHO9MLq-"; // C1: Use env var
const BATCH_SIZE = 40; // Conservative: 40 sessions per batch
const MAX_CONCURRENT_BATCHES = 3; // Process 3 batches in parallel
const HEALTH_PORT = 3000;
const TX_TIMEOUT = 60000; // H3: Increased to 60s for Amoy reliability

const ABI = [
    "function sessionCount() external view returns (uint256)",
    "function getSessionProgress(uint256 sessionId) external view returns (uint256 totalShards, uint256 shardsProcessed, uint256 stepsCompleted, uint256 stepsRemaining, uint256 shardsPerWave, bool completed)",
    "function getSessionDetails(uint256 sessionId) external view returns (uint256 id, address depositor, address receiver, uint256 totalAmount, uint256 totalShards, uint256 currentWave, uint256 currentStep, address token, bool completed)",
    "function pulse(uint256 sessionId) external",
    "function pulseBatch(uint256[] calldata sessionIds) external",
    "function CYCLE_INTERVAL() external view returns (uint256)",
    "function getActiveNodeCount() external view returns (uint256)",
    "function getSessionNodeIndices(uint256 sessionId) external view returns (uint256[] memory)",
    "event Deposit(uint256 indexed sessionId, address depositor, uint256 amount, uint256 shards, uint256 totalWaves)",
    "event StepCompleted(uint256 indexed sessionId, uint256 wave, uint256 step, string hopDescription, uint256 shardsInWave)",
    "event MixCompleted(uint256 indexed sessionId, address receiver, uint256 amount, uint256 totalWaves)"
];

// ============ NONCE MANAGER ============
class NonceManager {
    constructor(provider, wallet) {
        this.provider = provider;
        this.wallet = wallet;
        this.currentNonce = null;
        this.pendingNonces = new Set();
    }

    async initialize() {
        this.currentNonce = await this.provider.getTransactionCount(
            this.wallet.address,
            'pending'
        );
        console.log(`🔢 Nonce initialized: ${this.currentNonce}`);
    }

    async getNextNonce() {
        if (this.currentNonce === null) {
            await this.initialize();
        }

        const nonce = this.currentNonce;
        this.currentNonce++;
        this.pendingNonces.add(nonce);
        return nonce;
    }

    confirmNonce(nonce) {
        this.pendingNonces.delete(nonce);
    }

    async recover() {
        console.log('🔄 Recovering nonce from chain...');
        const chainNonce = await this.provider.getTransactionCount(
            this.wallet.address,
            'pending'
        );
        this.currentNonce = Math.max(chainNonce, this.currentNonce || 0);
        this.pendingNonces.clear();
        console.log(`✅ Nonce recovered: ${this.currentNonce}`);
    }
}

// ============ BATCH ORCHESTRATOR ============
class BatchOrchestrator {
    constructor(contract, nonceManager, provider) {
        this.contract = contract;
        this.nonceManager = nonceManager;
        this.provider = provider;
        this.activeSessions = new Map();
        this.processingBatches = new Set();
        this.stats = {
            totalPulses: 0,
            failedPulses: 0,
            totalBatches: 0,
            failedBatches: 0,
            lastPulseTime: Date.now()
        };
    }

    async scanForActiveSessions() {
        try {
            const totalSessions = Number(await this.contract.sessionCount());
            console.log(`\\n📊 Total sessions in contract: ${totalSessions}`);

            const activeNodes = Number(await this.contract.getActiveNodeCount());
            console.log(`🦞 Active nodes: ${activeNodes}`);

            const currentlyActive = new Set();
            for (let i = 1; i <= totalSessions; i++) {
                const progress = await this.contract.getSessionProgress(i);
                const isCompleted = progress.completed;
                const totalShards = Number(progress.totalShards);
                const shardsProcessed = Number(progress.shardsProcessed);

                if (!isCompleted && totalShards > 0) {
                    currentlyActive.add(i);
                    const details = await this.contract.getSessionDetails(i);
                    const assetSymbol = this.getAssetSymbol(details.token);

                    const wave = Number(details.currentWave);
                    const step = Number(details.currentStep);
                    const spw = Number(progress.shardsPerWave);

                    // Robust calculation for logs
                    let processed = (wave - 1) * spw;
                    if (step === 6) {
                        const remaining = totalShards - processed;
                        processed += Math.min(spw, remaining);
                    }
                    const accurateProcessed = Math.min(processed, totalShards);

                    console.log(`🔍 Session ${i} Status: ${accurateProcessed}/${totalShards} shards [${assetSymbol}] - Wave ${wave}, Step ${step}`);

                    if (!this.activeSessions.has(i)) {
                        this.activeSessions.set(i, { token: details.token, symbol: assetSymbol });
                    }
                }
            }

            // Cleanup: remove sessions that are no longer active
            for (const id of this.activeSessions.keys()) {
                if (!currentlyActive.has(id)) {
                    console.log(`✅ Session ${id} completed, removing from orchestrator.`);
                    this.activeSessions.delete(id);
                }
            }

            console.log(`📋 Total tracked active sessions: ${this.activeSessions.size}`);
        } catch (e) {
            console.error("Error scanning sessions:", e.message);
        }
    }

    getAssetSymbol(tokenAddress) {
        if (tokenAddress === ethers.ZeroAddress) return "POL";
        const usdcAmoy = "0x41E94Eb019C0762f9Bfcf9Fb1E58725BfB0e7582".toLowerCase();
        const usdcEth = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48".toLowerCase();

        const addr = tokenAddress.toLowerCase();
        if (addr === usdcAmoy || addr === usdcEth) return "USDC";
        return "ERC20";
    }

    async processBatch(sessionIds) {
        const batchId = crypto.randomInt(1000000, 9999999);
        this.processingBatches.add(batchId);

        try {
            // Filter sessions ready to pulse
            const readyIds = [];
            const symbols = new Set();
            for (const id of sessionIds) {
                try {
                    await this.contract.pulse.staticCall(id);
                    readyIds.push(id);
                    const sessionData = this.activeSessions.get(id);
                    if (sessionData) symbols.add(sessionData.symbol);
                } catch (e) {
                    // Skip sessions not ready (cooldown, completed, etc.)
                }
            }

            if (readyIds.length === 0) {
                this.processingBatches.delete(batchId);
                return;
            }

            // Get session details for logging
            const details = await this.contract.getSessionDetails(readyIds[0]);
            const assetSymbol = this.getAssetSymbol(details.token);
            const currentWave = Number(details.currentWave);
            const currentStep = Number(details.currentStep);
            const stepNames = ["Mixer→A", "A→B", "B→C", "C→D", "D→E", "E→Recipient", "Wave Complete"];
            const stepDesc = stepNames[currentStep] || `Step ${currentStep}`;

            // Get nonce for this batch
            const nonce = await this.nonceManager.getNextNonce();

            console.log(`\n📦 Batch ${batchId}: Pulsing ${readyIds.length} sessions [${Array.from(symbols).join('/')}] (${stepDesc}) [nonce: ${nonce}]`);

            // Gas price strategy
            const feeData = await this.provider.getFeeData();
            const tx = await this.contract.pulseBatch(readyIds, {
                nonce,
                gasLimit: 15000000,
                maxFeePerGas: (feeData.maxFeePerGas * 150n) / 100n, // H3: Aggressive 1.5x gas
                maxPriorityFeePerGas: (feeData.maxPriorityFeePerGas * 150n) / 100n
            });

            console.log(`📤 Tx sent: ${tx.hash}`);

            // H3: Wait for confirmation with configured timeout
            const receipt = await Promise.race([
                tx.wait(1),
                new Promise((_, reject) =>
                    setTimeout(() => reject(new Error(`Transaction confirmation timeout (${TX_TIMEOUT / 1000}s)`)), TX_TIMEOUT)
                )
            ]);

            console.log(`✅ Batch confirmed in block ${receipt.blockNumber}! Gas: ${receipt.gasUsed}`);

            this.nonceManager.confirmNonce(nonce);
            this.stats.totalPulses += readyIds.length;
            this.stats.totalBatches++;
            this.stats.lastPulseTime = Date.now();

        } catch (e) {
            console.error(`❌ Batch ${batchId.toFixed(0)} failed:`, e.message);
            this.stats.failedBatches++;
            await this.nonceManager.recover();
        } finally {
            this.processingBatches.delete(batchId);
        }
    }

    async processAllSessions() {
        const sessions = Array.from(this.activeSessions.keys());

        if (sessions.length === 0) {
            console.log("💤 No active sessions, waiting...");
            return;
        }

        // Group into batches
        const batches = [];
        for (let i = 0; i < sessions.length; i += BATCH_SIZE) {
            batches.push(sessions.slice(i, i + BATCH_SIZE));
        }

        console.log(`\\n🚀 Processing ${sessions.length} sessions in ${batches.length} batches`);

        // Process batches in parallel (up to MAX_CONCURRENT_BATCHES)
        const batchPromises = batches
            .slice(0, MAX_CONCURRENT_BATCHES)
            .map(batch => this.processBatch(batch));

        await Promise.allSettled(batchPromises);
    }
}

// ============ HEALTH MONITORING ============
const app = express();
let orchestrator;

app.get('/health', (req, res) => {
    if (!orchestrator) {
        return res.status(503).json({ status: 'starting' });
    }

    const timeSinceLastPulse = Date.now() - orchestrator.stats.lastPulseTime;
    const isHealthy = timeSinceLastPulse < 60000; // Alert if no pulse in 60s

    res.status(isHealthy ? 200 : 503).json({
        status: isHealthy ? 'healthy' : 'unhealthy',
        activeSessions: orchestrator.activeSessions.size,
        processingBatches: orchestrator.processingBatches.size,
        lastPulseAgo: `${Math.floor(timeSinceLastPulse / 1000)}s`,
        uptime: `${Math.floor(process.uptime())}s`
    });
});

app.get('/metrics', (req, res) => {
    if (!orchestrator) {
        return res.status(503).json({ status: 'starting' });
    }

    res.json({
        ...orchestrator.stats,
        activeSessions: orchestrator.activeSessions.size,
        processingBatches: orchestrator.processingBatches.size,
        pendingNonces: nonceManager.pendingNonces.size
    });
});

app.listen(HEALTH_PORT, () => {
    console.log(`📊 Health server running on :${HEALTH_PORT}`);
});

// ============ GRACEFUL SHUTDOWN ============
let isShuttingDown = false;

process.on('SIGTERM', async () => {
    if (isShuttingDown) return;
    isShuttingDown = true;

    console.log('\\n🛑 Received SIGTERM, shutting down gracefully...');

    const timeout = setTimeout(() => {
        console.log('⏱️  Timeout reached, forcing shutdown');
        process.exit(0);
    }, 30000);

    while (orchestrator && orchestrator.processingBatches.size > 0) {
        console.log(`⏳ Waiting for ${orchestrator.processingBatches.size} batches...`);
        await new Promise(r => setTimeout(r, 1000));
    }

    clearTimeout(timeout);
    console.log('✅ Graceful shutdown complete');
    process.exit(0);
});

// ============ MAIN ============
const PRIVATE_KEY = process.env.PRIVATE_KEY;
if (!PRIVATE_KEY) {
    console.error("❌ PRIVATE_KEY not found in .env");
    process.exit(1);
}

const provider = new ethers.JsonRpcProvider(RPC_URL);
const wallet = new ethers.Wallet(PRIVATE_KEY, provider);
const contract = new ethers.Contract(CONTRACT_ADDRESS, ABI, wallet);
const nonceManager = new NonceManager(provider, wallet);

async function main() {
    console.log('🦞 Lobster Mixer Multi-Threaded Orchestrator Starting...');
    console.log(`📋 Contract: ${CONTRACT_ADDRESS}`);
    console.log(`💼 Operator: ${wallet.address}`);

    const balance = await provider.getBalance(wallet.address);
    console.log(`💰 Operator balance: ${ethers.formatEther(balance)} POL`);

    if (parseFloat(ethers.formatEther(balance)) < 0.1) {
        console.warn("⚠️  Low balance! Make sure operator has enough POL for gas");
    }

    // Initialize nonce manager
    await nonceManager.initialize();

    // Create orchestrator
    orchestrator = new BatchOrchestrator(contract, nonceManager, provider);

    console.log(`\\n🔄 Starting batch orchestrator (${BATCH_SIZE} sessions/batch, ${MAX_CONCURRENT_BATCHES} concurrent batches)...\\n`);

    while (!isShuttingDown) {
        try {
            await orchestrator.scanForActiveSessions();
            await orchestrator.processAllSessions();
        } catch (e) {
            console.error("❌ Main loop error:", e.message);
        }

        await new Promise(r => setTimeout(r, 10000)); // 10 second cycle
    }
}

main().catch(console.error);
