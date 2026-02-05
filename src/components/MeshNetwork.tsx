import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ethers } from 'ethers';

const CONTRACT_ADDRESS = "0x70Da0050Ac783967cB21e4b53311B4060279a76B"; // User's Active Mixer
const REWARDS_ADDRESS = "0x8849E7fD98967919864E30299f0f9b60279a76B"; // Corresponding Rewards
const PUBLIC_RPC = "https://polygon-amoy.infura.io/v3/db4d2c885bc946b691dbb3d5ef26d9e2";
const MIN_ABI = [
    "function getSatellitesCount() external view returns (uint256)",
    "function satellites(uint256) external view returns (address addr, address owner, bool isActive, uint256 totalEarnings, uint256 stakedAmount, uint256 sessionCount)",
    "function deployLobster() external payable",
    "function joinMesh() external payable",
    "function DEPLOY_STAKE() external view returns (uint256)",
    "function satelliteIndices(address) external view returns (uint256)",
    "function requestUnstake(uint256 satelliteIndex) external",
    "function completeUnstake(uint256 requestIndex) external",
    "function getUnstakeRequests(address user) external view returns (tuple(uint256 satelliteIndex, uint256 amount, uint256 requestTime, bool completed)[])",
    "function getUnstakeTimeRemaining(address user, uint256 requestIndex) external view returns (uint256)",
    "function withdrawNodeEarnings(uint256 satelliteIndex, address[] tokens, address to) external",
    "function getSessionNodeIndices(uint256 sessionId) external view returns (uint256[] memory)",
    "event StepCompleted(uint256 indexed sessionId, uint256 wave, uint256 step, string hopDescription, uint256 shardsInWave)"
];

const REWARDS_ABI = [
    "function getSatelliteStats(address node, address token) external view returns (uint256 earnings, uint256 sessions)"
];

const ROWS = 10;
const COLS = 25;
const NODES_PER_POD = ROWS * COLS; // 250

interface SatelliteData {
    address: string;
    owner: string;
    isActive: boolean;
    earnings: string;
    stakedAmount: string;
    sessionCount: number;
    index: number;
    balance: string;
    plnktnBalance: number;
    isPulsing?: boolean; // Temporary state for animation
}

interface LobsterProfile {
    satelliteIndex: number;
    ownerAddress: string;
    hasIcon: boolean;
    iconUrl: string | null;
    twitterUsername: string | null;
    twitterAvatar: string | null;
}

export default function MeshNetwork() {
    const [satellites, setSatellites] = useState<SatelliteData[]>([]);
    const [totalCount, setTotalCount] = useState(0);
    const [activePod, setActivePod] = useState(1);

    // Withdrawal State
    const [showWithdrawModal, setShowWithdrawModal] = useState(false);
    const [withdrawAddress, setWithdrawAddress] = useState("");
    const [withdrawing, setWithdrawing] = useState(false);
    const [loading, setLoading] = useState(true);
    const [deploying, setDeploying] = useState(false);
    const [walletConnected, setWalletConnected] = useState(false);
    const [userAddress, setUserAddress] = useState<string | null>(null);
    const [userPlnktnBalance, setUserPlnktnBalance] = useState(500); // Simulated user token balance


    // Modal state
    const [selectedSatellite, setSelectedSatellite] = useState<SatelliteData | null>(null);
    const [modalProfile, setModalProfile] = useState<LobsterProfile | null>(null);
    const [modalLoading, setModalLoading] = useState(false);
    const [isWalletModalOpen, setIsWalletModalOpen] = useState(false);
    const [isDepositModalOpen, setIsDepositModalOpen] = useState(false);
    const [depositAmount, setDepositAmount] = useState("100");
    const [nodeToDeposit, setNodeToDeposit] = useState<number | null>(null);
    const [signer, setSigner] = useState<ethers.Signer | null>(null);

    useEffect(() => {
        checkWalletConnection();
        fetchSatellites();

        return () => { };
    }, [activePod]);

    useEffect(() => {
        const provider = new ethers.JsonRpcProvider(PUBLIC_RPC);
        const contract = new ethers.Contract(CONTRACT_ADDRESS, MIN_ABI, provider);

        const handleStep = async (sessionId: any, wave: any, step: any) => {
            console.log(`📡 Real Pulse: Session ${sessionId}, Wave ${wave}, Step ${step}`);
            try {
                const nodeIndices: any[] = await contract.getSessionNodeIndices(sessionId);
                if (!nodeIndices || nodeIndices.length === 0) return;

                const nodesPerGroup = nodeIndices.length / 5;
                const s = Number(step);
                const pulseIndices: number[] = [];

                if (s === 0) {
                    for (let i = 0; i < nodesPerGroup; i++) pulseIndices.push(Number(nodeIndices[i]));
                } else if (s < 5) {
                    const start = (s - 1) * nodesPerGroup;
                    const end = (s + 1) * nodesPerGroup;
                    for (let i = start; i < end; i++) pulseIndices.push(Number(nodeIndices[i]));
                } else if (s === 5) {
                    for (let i = 4 * nodesPerGroup; i < nodeIndices.length; i++) pulseIndices.push(Number(nodeIndices[i]));
                }

                setSatellites(prev => prev.map(sat => {
                    if (pulseIndices.includes(Number(sat.index))) {
                        return { ...sat, isPulsing: true };
                    }
                    return sat;
                }));

                setTimeout(() => {
                    setSatellites(prev => prev.map(sat => ({ ...sat, isPulsing: false })));
                }, 2000);

                fetchSatellites(); // Refresh earnings/status
            } catch (e) {
                console.error("Pulse error:", e);
            }
        };

        contract.on("StepCompleted", handleStep);
        return () => {
            contract.removeAllListeners("StepCompleted");
        };
    }, []);


    const checkWalletConnection = async () => {
        if (typeof window !== 'undefined' && (window as any).ethereum) {
            try {
                const accounts = await (window as any).ethereum.request({ method: 'eth_accounts' });
                if (accounts.length > 0) {
                    const provider = new ethers.BrowserProvider((window as any).ethereum);
                    const _signer = await provider.getSigner();
                    setSigner(_signer);
                    setWalletConnected(true);
                    setUserAddress(accounts[0]);
                }
            } catch (e) {
                console.error("Error checking wallet:", e);
            }
        }
    };

    const connectWallet = async (walletType: 'metamask' | 'phantom') => {
        setIsWalletModalOpen(false);
        if (walletType === 'phantom') {
            try {
                const provider = (window as any).phantom?.solana;
                if (provider) {
                    const resp = await provider.connect();
                    const publicKey = resp.publicKey.toString();
                    setUserAddress(publicKey);
                    setWalletConnected(true);
                } else {
                    window.open('https://phantom.app/', '_blank');
                }
            } catch (e) {
                console.error("Phantom error:", e);
            }
            return;
        }

        if (typeof window !== 'undefined' && (window as any).ethereum) {
            try {
                const provider = new ethers.BrowserProvider((window as any).ethereum);
                const _signer = await provider.getSigner();
                const accounts = await (window as any).ethereum.request({ method: 'eth_requestAccounts' });
                setSigner(_signer);
                setUserAddress(accounts[0]);
                setWalletConnected(true);
            } catch (e) {
                console.error("Error connecting wallet:", e);
            }
        }
    };

    const disconnectWallet = () => {
        setUserAddress(null);
        setWalletConnected(false);
        setSigner(null);
    };

    const deployLobster = async () => {
        if (!walletConnected) {
            setIsWalletModalOpen(true);
            return;
        }

        if (typeof window !== 'undefined' && (window as any).ethereum) {
            try {
                setDeploying(true);
                const provider = new ethers.BrowserProvider((window as any).ethereum);
                const _signer = signer || await provider.getSigner();
                const contract = new ethers.Contract(CONTRACT_ADDRESS, MIN_ABI, _signer);

                const tx = await contract.deployLobster({ value: 0 });

                try {
                    await tx.wait();
                } catch (waitError) {
                    console.log("Tx sent, waiting for confirmation...", tx.hash);
                }

                await new Promise(resolve => setTimeout(resolve, 3000));
                await fetchSatellites();
            } catch (e: any) {
                console.error("Error deploying lobster:", e);
                if (e.message?.includes("rate limit")) {
                    alert("Transaction sent! Refreshing in a moment...");
                    await new Promise(resolve => setTimeout(resolve, 5000));
                    await fetchSatellites();
                } else {
                    alert(e.reason || e.message || "Failed to deploy lobster");
                }
            } finally {
                setDeploying(false);
            }
        }
    };

    const fetchSatellites = async () => {
        setLoading(true);
        try {
            // Create fresh provider with cache busting
            const provider = new ethers.JsonRpcProvider(PUBLIC_RPC, undefined, {
                staticNetwork: true,
                batchMaxCount: 1 // Disable batching to avoid cache issues
            });

            const contract = new ethers.Contract(CONTRACT_ADDRESS, MIN_ABI, provider);

            // Retry logic for count
            let count = 0;
            for (let attempt = 0; attempt < 3; attempt++) {
                try {
                    count = Number(await contract.getSatellitesCount());
                    if (count > 0) break;
                    await new Promise(r => setTimeout(r, 1000)); // Wait 1s before retry
                } catch (e) {
                    console.error(`Attempt ${attempt + 1} failed:`, e);
                    if (attempt === 2) throw e;
                }
            }

            // function satellites(uint256) returns (... uint256 sessionCount) is good for count, but for earnings we use wallet balance.
            console.log("Satellite count:", count);
            setTotalCount(count);

            const USDC_ADDR = "0x41E94Eb019C0762f9Bfcf9Fb1E58725BfB0e7582";
            // Minimal ERC20 ABI for balance check
            const ERC20_ABI = ["function balanceOf(address) view returns (uint256)"];
            const usdcContract = new ethers.Contract(USDC_ADDR, ERC20_ABI, provider);

            // Still use Rewards contract for session count tracking if needed, or rely on contract
            const rewardsContract = new ethers.Contract(REWARDS_ADDRESS, REWARDS_ABI, provider);

            const startIdx = (activePod - 1) * NODES_PER_POD;
            const endIdx = startIdx + NODES_PER_POD;
            const loopEnd = Math.min(count, endIdx);

            const loadedSatellites: SatelliteData[] = [];

            // Fetch sequentially in small batches to avoid rate limits and cache issues
            const BATCH_SIZE = 5;
            for (let i = startIdx; i < loopEnd; i += BATCH_SIZE) {
                const batchEnd = Math.min(i + BATCH_SIZE, loopEnd);
                const batchPromises = [];

                for (let j = i; j < batchEnd; j++) {
                    batchPromises.push(
                        (async (index) => {
                            try {
                                const sat = await contract.satellites(index);
                                const balance = await provider.getBalance(sat.addr);

                                // Fetch Actual USDC Balance
                                let usdcBalance = 0n;
                                try {
                                    usdcBalance = await usdcContract.balanceOf(sat.addr);
                                } catch (e) {
                                    console.warn(`Failed to fetch USDC for ${sat.addr}`);
                                }

                                // Fetch Session Count from Rewards (reliable)
                                let sessions = 0n;
                                try {
                                    const statsNative = await rewardsContract.getSatelliteStats(sat.addr, ethers.ZeroAddress);
                                    sessions = statsNative.sessions;
                                } catch (err) {
                                    console.warn(`Failed to fetch sessions for ${sat.addr}`, err);
                                }

                                // Calculate Total USD Value (Mock Prices for Testnet)
                                const POL_PRICE = 0.40;
                                const USDC_PRICE = 1.00;

                                const nativeVal = Number(ethers.formatEther(balance)); // Use actual wallet balance
                                const usdcVal = Number(ethers.formatUnits(usdcBalance, 6)); // Use actual wallet balance
                                const totalUSD = (nativeVal * POL_PRICE) + (usdcVal * USDC_PRICE);

                                return {
                                    address: sat.addr,
                                    owner: sat.owner,
                                    isActive: sat.isActive,
                                    earnings: totalUSD.toFixed(6), // Store as USD string with 6 decimals
                                    stakedAmount: ethers.formatEther(sat.stakedAmount),
                                    sessionCount: Number(sessions),
                                    index: index,
                                    balance: parseFloat(ethers.formatEther(balance)).toFixed(2),
                                    plnktnBalance: Math.floor(Math.random() * 100) + 20 // Simulated initial PLNKTN
                                } as SatelliteData;
                            } catch (e) {
                                console.error(`Error fetching satellite ${index}:`, e);
                                return null;
                            }
                        })(j)
                    );
                }

                const batchResults = await Promise.all(batchPromises);
                loadedSatellites.push(...batchResults.filter(s => s !== null) as SatelliteData[]);

                // Small delay between batches
                if (batchEnd < loopEnd) {
                    await new Promise(r => setTimeout(r, 100));
                }
            }

            console.log(`Loaded ${loadedSatellites.length} satellites`);
            setSatellites(loadedSatellites);
        } catch (e) {
            console.error("Error fetching satellites:", e);
            setSatellites([]); // Clear on error
        } finally {
            setLoading(false);
        }
    };

    const openModal = async (satellite: SatelliteData) => {
        setSelectedSatellite(satellite);
        setModalLoading(true);

        try {
            const res = await fetch(`/api/lobster-profile?index=${satellite.index}&owner=${satellite.owner}`);
            const data = await res.json();
            setModalProfile(data.profile);
        } catch (e) {
            console.error("Error loading profile:", e);
        } finally {
            setModalLoading(false);
        }
    };

    const closeModal = () => {
        setSelectedSatellite(null);
        setModalProfile(null);
    };

    const handleAddPlnktn = (index: number, amount: number) => {
        setSatellites(prev => prev.map(sat => {
            if (sat.index === index) {
                return { ...sat, plnktnBalance: sat.plnktnBalance + amount };
            }
            return sat;
        }));
        // If the selected satellite is this one, update it too
        if (selectedSatellite && selectedSatellite.index === index) {
            setSelectedSatellite(prev => prev ? { ...prev, plnktnBalance: prev.plnktnBalance + amount } : null);
        }
    };

    const openDepositModal = (index: number) => {
        setNodeToDeposit(index);
        setDepositAmount("100");
        setIsDepositModalOpen(true);
    };

    const handleActualDeposit = () => {
        if (nodeToDeposit !== null) {
            handleAddPlnktn(nodeToDeposit, parseInt(depositAmount) || 0);
            setIsDepositModalOpen(false);
            setNodeToDeposit(null);
        }
    };

    const maxPod = Math.max(1, Math.ceil(totalCount / NODES_PER_POD));
    const podOptions = Array.from({ length: Math.max(5, maxPod) }).map((_, i) => i + 1);

    return (
        <div className="min-h-screen bg-[#050505] text-white p-4 font-mono overflow-x-hidden">
            <header className="mb-8 flex flex-col md:flex-row justify-between items-end border-b border-[#ff4500]/20 pb-6 gap-4">
                <div>
                    <h1 className="text-3xl font-black text-[#ff4500] uppercase tracking-tighter mb-2 flex items-center gap-3">
                        The Lobster Mesh
                    </h1>
                    <div className="flex flex-col gap-1">
                        <p className="text-gray-500 text-xs uppercase tracking-widest">
                            Topology View • {totalCount} Active Nodes Total
                        </p>
                        <a
                            href={`https://amoy.polygonscan.com/address/${CONTRACT_ADDRESS}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-[#ff4500]/60 text-[10px] font-mono hover:text-[#ff4500] transition-colors"
                        >
                            Contract: {CONTRACT_ADDRESS}
                        </a>
                    </div>
                </div>

                <div className="flex flex-col md:flex-row items-end gap-6 h-full mt-12 md:mt-0">

                    <button
                        onClick={deployLobster}
                        disabled={deploying}
                        className={`
                            flex items-center gap-2 px-4 py-2 rounded font-bold text-xs uppercase tracking-widest transition-all
                            ${deploying
                                ? 'bg-[#ff4500]/50 text-white border border-[#ff4500]/50 cursor-wait'
                                : 'bg-[#ff4500] text-black border border-[#ff4500] hover:shadow-[0_0_20px_rgba(255,69,0,0.5)] hover:scale-105 cursor-pointer'
                            }
                        `}
                    >
                        {deploying ? 'Deploying...' : 'Deploy Lobster'}
                        {!deploying && (
                            <div className="flex flex-col items-center ml-2 border-l border-black/20 pl-2">
                                <span className="text-[9px] leading-tight text-black/70">+100 PLNKTN</span>
                            </div>
                        )}
                    </button>

                    <button
                        onClick={() => fetchSatellites()}
                        disabled={loading}
                        className={`
                            flex items-center gap-2 px-4 py-2 rounded font-bold text-xs uppercase tracking-widest transition-all
                            ${loading
                                ? 'bg-gray-700 text-gray-400 cursor-not-allowed'
                                : 'bg-[#ff4500]/10 text-[#ff4500] border border-[#ff4500] hover:bg-[#ff4500] hover:text-black hover:shadow-[0_0_20px_rgba(255,69,0,0.5)]'
                            }
                        `}
                    >
                        {loading ? (
                            <>
                                <div className="w-4 h-4 border-2 border-gray-400 border-t-transparent rounded-full animate-spin"></div>
                                Refreshing...
                            </>
                        ) : (
                            <>
                                Refresh
                            </>
                        )}
                    </button>

                    <div className="flex gap-4 text-[10px] text-gray-500 uppercase tracking-widest mb-1">
                        <div className="flex items-center gap-2">
                            <div className="w-3 h-3 bg-[#00ff9d] rounded-sm"></div>
                            <span>Your Lobster</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <div className="w-3 h-3 bg-[#3b82f6] rounded-sm"></div>
                            <span>Occupied</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <div className="w-3 h-3 bg-[#0f0a0a] border border-[#ff4500]/20 rounded-sm"></div>
                            <span>Available</span>
                        </div>
                    </div>

                    <div className="flex flex-col items-end gap-2">
                        <div className="flex items-center gap-3">
                            {walletConnected && (
                                <button
                                    onClick={disconnectWallet}
                                    className="text-[10px] text-[#ff4500]/60 hover:text-[#ff4500] uppercase tracking-wider transition-colors"
                                >
                                    Disconnect
                                </button>
                            )}
                            <button
                                onClick={() => !walletConnected && setIsWalletModalOpen(true)}
                                className={`
                                    group relative px-4 py-1.5 bg-[#1a0505] overflow-hidden rounded border transition-all text-[10px] font-bold uppercase tracking-widest
                                    ${walletConnected ? 'border-[#ff4500]/30 text-[#ff4500]/70 cursor-default' : 'border-[#ff4500]/30 hover:border-[#ff4500] text-[#ff4500]'}
                                `}
                            >
                                {userAddress ? `${userAddress.slice(0, 6)}...${userAddress.slice(-4)}` : 'Connect Wallet'}
                            </button>
                        </div>

                        <div className="relative group w-full">
                            <select
                                value={activePod}
                                onChange={(e) => setActivePod(Number(e.target.value))}
                                className="appearance-none w-full bg-[#0f0a0a] border border-[#ff4500] text-[#ff4500] py-2 pl-4 pr-10 rounded uppercase font-bold text-xs tracking-widest focus:outline-none focus:shadow-[0_0_15px_rgba(255,69,0,0.3)] cursor-pointer"
                            >
                                {podOptions.map(pod => (
                                    <option key={pod} value={pod}>Lobster Mesh Pod {pod}</option>
                                ))}
                            </select>
                            <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-[#ff4500]">▼</div>
                        </div>
                    </div>

                    <a href="/mixer" className="text-gray-500 hover:text-[#ff4500] uppercase tracking-widest text-[10px] font-bold transition-all mb-1">
                        Exit
                    </a>
                </div>
            </header>

            <div className="w-full overflow-x-auto pb-12 custom-scrollbar">
                <div className="min-w-[1000px] border border-[#ff4500]/10 p-4 rounded-xl bg-[#0a0a0a]">
                    <div className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(${COLS}, minmax(0, 1fr))` }}>
                        {Array.from({ length: NODES_PER_POD }).map((_, i) => {
                            const globalIndex = (activePod - 1) * NODES_PER_POD + i;
                            const satData = satellites.find(s => s.index === globalIndex);

                            return (
                                <Block
                                    key={globalIndex}
                                    globalIndex={globalIndex}
                                    localIndex={i}
                                    satellite={satData}
                                    loading={loading && i < 25}
                                    userAddress={userAddress}
                                    onNodeClick={openModal}
                                />
                            );
                        })}
                    </div>
                </div>
            </div>

            <AnimatePresence>
                {selectedSatellite && (
                    <LobsterModal
                        satellite={selectedSatellite}
                        profile={modalProfile}
                        isOwn={Boolean(userAddress && selectedSatellite.owner && userAddress.toLowerCase() === selectedSatellite.owner.toLowerCase())}
                        userAddress={userAddress}
                        loading={modalLoading}
                        onClose={closeModal}
                        onRefresh={fetchSatellites}
                        onOpenDeposit={openDepositModal}
                        setWithdrawAddress={setWithdrawAddress}
                        setShowWithdrawModal={setShowWithdrawModal}
                    />
                )}
            </AnimatePresence>

            {/* Wallet Selection Modal */}
            <AnimatePresence>
                {isWalletModalOpen && (
                    <div
                        className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[100] flex items-center justify-center p-4"
                        onClick={() => setIsWalletModalOpen(false)}
                    >
                        <motion.div
                            initial={{ scale: 0.9, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.9, opacity: 0 }}
                            className="bg-[#0a0a0a] border border-[#ff4500]/30 rounded-2xl p-8 max-w-md w-full shadow-[0_0_50px_rgba(255,69,0,0.3)]"
                            onClick={(e) => e.stopPropagation()}
                        >
                            <h3 className="text-2xl font-bold text-[#ff4500] mb-6 uppercase tracking-wider text-center">
                                Select Wallet
                            </h3>

                            <div className="space-y-4">
                                <button
                                    onClick={() => connectWallet('metamask')}
                                    className="w-full p-6 bg-[#1a0505] border border-[#ff4500]/30 hover:border-[#ff4500] rounded-xl transition-all hover:shadow-[0_0_20px_rgba(255,69,0,0.2)] group text-left"
                                >
                                    <div className="flex items-center gap-4">
                                        <div className="w-12 h-12 bg-[#ff4500]/10 rounded-lg flex items-center justify-center p-2 group-hover:scale-110 transition-transform">
                                            <img src="/metamask.png" alt="MetaMask" className="w-full h-full object-contain" />
                                        </div>
                                        <div>
                                            <div className="text-[#ff4500] font-bold uppercase tracking-wider">MetaMask</div>
                                            <div className="text-[#ff4500]/60 text-xs uppercase">Ethereum & Polygon</div>
                                        </div>
                                    </div>
                                </button>

                                <button
                                    onClick={() => connectWallet('phantom')}
                                    className="w-full p-6 bg-[#1a0505] border border-[#9945ff]/30 hover:border-[#9945ff] rounded-xl transition-all hover:shadow-[0_0_20px_rgba(153,69,255,0.2)] group text-left"
                                >
                                    <div className="flex items-center gap-4">
                                        <div className="w-12 h-12 bg-[#9945ff]/10 rounded-lg flex items-center justify-center p-2 group-hover:scale-110 transition-transform">
                                            <img src="/phantom.png" alt="Phantom" className="w-full h-full object-contain" />
                                        </div>
                                        <div>
                                            <div className="text-[#9945ff] font-bold uppercase tracking-wider">Phantom</div>
                                            <div className="text-[#9945ff]/60 text-xs uppercase">Solana</div>
                                        </div>
                                    </div>
                                </button>
                            </div>

                            <button
                                onClick={() => setIsWalletModalOpen(false)}
                                className="mt-6 w-full text-gray-500 hover:text-white transition-colors text-xs uppercase tracking-widest font-bold"
                            >
                                Cancel
                            </button>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>
            {/* PLNKTN Deposit Modal */}
            <AnimatePresence>
                {isDepositModalOpen && (
                    <div
                        className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[110] flex items-center justify-center p-4 font-mono"
                        onClick={() => setIsDepositModalOpen(false)}
                    >
                        <motion.div
                            initial={{ scale: 0.9, opacity: 0, y: 20 }}
                            animate={{ scale: 1, opacity: 1, y: 0 }}
                            exit={{ scale: 0.9, opacity: 0, y: 20 }}
                            className="bg-[#050505] border border-[#ff4500]/30 rounded-2xl p-8 max-w-sm w-full shadow-[0_0_50px_rgba(255,69,0,0.2)]"
                            onClick={(e) => e.stopPropagation()}
                        >
                            <div className="flex justify-between items-center mb-6">
                                <h3 className="text-xl font-black text-[#ff4500] uppercase tracking-wider">
                                    Deposit PLNKTN
                                </h3>
                                <div className="text-[10px] text-gray-500 font-bold uppercase tracking-widest border border-gray-800 px-2 py-1 rounded">
                                    Node #{nodeToDeposit !== null && nodeToDeposit + 1}
                                </div>
                            </div>

                            <div className="space-y-6">
                                <div>
                                    <label className="text-[10px] uppercase tracking-widest text-gray-500 mb-2 block">
                                        Amount
                                    </label>
                                    <div className="relative group">
                                        <input
                                            type="number"
                                            value={depositAmount}
                                            onChange={(e) => setDepositAmount(e.target.value)}
                                            className="w-full bg-[#0a0a0a] border border-[#ff4500]/20 text-white p-4 rounded-xl text-2xl font-black focus:outline-none focus:border-[#ff4500] transition-colors group-hover:border-[#ff4500]/40"
                                            placeholder="0"
                                        />
                                        <div className="absolute right-4 top-1/2 -translate-y-1/2 text-[#ff4500] font-black italic text-sm">
                                            PLNKTN
                                        </div>
                                    </div>
                                </div>

                                <div className="grid grid-cols-3 gap-2">
                                    {[100, 1000, 10000].map(amt => (
                                        <button
                                            key={amt}
                                            onClick={() => setDepositAmount(amt.toString())}
                                            className="py-3 bg-[#1a0505] border border-[#ff4500]/20 rounded-lg text-[10px] font-bold text-[#ff4500] hover:bg-[#ff4500] hover:text-black hover:border-[#ff4500] transition-all uppercase tracking-tighter"
                                        >
                                            {amt.toLocaleString()}
                                        </button>
                                    ))}
                                </div>

                                <div className="pt-4 space-y-3">
                                    <button
                                        onClick={handleActualDeposit}
                                        className="w-full py-4 bg-[#ff4500] text-black font-black uppercase tracking-widest rounded-xl hover:shadow-[0_0_30px_rgba(255,69,0,0.4)] hover:scale-[1.02] transition-all active:scale-[0.98]"
                                    >
                                        Execute Deposit
                                    </button>
                                    <button
                                        onClick={() => setIsDepositModalOpen(false)}
                                        className="w-full py-2 text-gray-500 hover:text-white transition-colors text-[10px] uppercase tracking-widest font-black"
                                    >
                                        Cancel Operation
                                    </button>
                                </div>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>

            {/* Withdraw Modal */}
            {showWithdrawModal && (
                <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-[110] p-4">
                    <motion.div
                        initial={{ scale: 0.9, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        className="bg-[#111] border border-gray-800 rounded-lg p-6 max-w-sm w-full relative shadow-[0_0_50px_rgba(0,0,0,0.5)]"
                    >
                        <button
                            onClick={() => setShowWithdrawModal(false)}
                            className="absolute top-4 right-4 text-gray-500 hover:text-white"
                        >
                            ✕
                        </button>

                        <h3 className="text-lg font-bold text-white mb-2 uppercase tracking-wide">
                            Withdraw Earnings
                        </h3>

                        <div className="bg-yellow-500/10 border border-yellow-500/20 text-yellow-500 text-[10px] p-3 rounded mb-4">
                            ⚠ WARNING: Ensure you possess the private keys for the destination address. We cannot recover funds sent to incorrect addresses.
                        </div>

                        <label className="text-[10px] text-gray-500 uppercase tracking-widest block mb-1">
                            Destination Address
                        </label>
                        <input
                            type="text"
                            value={withdrawAddress}
                            onChange={(e) => setWithdrawAddress(e.target.value)}
                            className="w-full bg-black border border-gray-700 rounded p-2 text-white text-sm mb-4 focus:border-[#ff4500] outline-none font-mono"
                            placeholder="0x..."
                        />

                        <button
                            onClick={async () => {
                                if (!signer || !withdrawAddress || !selectedSatellite) return;
                                try {
                                    setWithdrawing(true);
                                    const contract = new ethers.Contract(CONTRACT_ADDRESS, MIN_ABI, signer);
                                    const USDC_ADDR = "0x41E94Eb019C0762f9Bfcf9Fb1E58725BfB0e7582";
                                    // Withdraw Native + USDC
                                    const tx = await contract.withdrawNodeEarnings(selectedSatellite.index, [USDC_ADDR], withdrawAddress);
                                    await tx.wait();
                                    setShowWithdrawModal(false);
                                    alert("Withdrawal successful!");
                                    fetchSatellites();
                                } catch (e) {
                                    console.error("Withdraw failed:", e);
                                    alert("Withdraw failed. See console.");
                                } finally {
                                    setWithdrawing(false);
                                }
                            }}
                            disabled={withdrawing}
                            className="w-full bg-[#ff4500] text-black font-bold py-3 rounded uppercase tracking-widest hover:bg-[#ff5722] disabled:opacity-50 transition-all"
                        >
                            {withdrawing ? "Processing..." : "Confirm Withdraw"}
                        </button>
                    </motion.div>
                </div>
            )}
        </div>
    );
}

interface BlockProps {
    globalIndex: number;
    localIndex: number;
    satellite?: SatelliteData;
    loading: boolean;
    userAddress: string | null;
    onNodeClick: (satellite: SatelliteData) => void;
}

const Block = ({ globalIndex, localIndex, satellite, loading, userAddress, onNodeClick }: BlockProps) => {
    const isActive = !!satellite;
    const isTopRow = localIndex < 25;
    const isOwn = isActive && userAddress && satellite.owner && userAddress && (satellite.owner.toLowerCase().trim() === userAddress.toLowerCase().trim());
    const isOther = isActive && !isOwn;

    const getBlockStyles = () => {
        if (!isActive) {
            return 'bg-[#0f0a0a] border-[#ff4500]/10 hover:border-[#ff4500]/30';
        }
        if (isOwn) {
            return 'bg-[#00ff9d] border-[#00ff9d] shadow-[0_0_10px_rgba(0,255,157,0.4)] hover:scale-110 hover:z-10 hover:shadow-[0_0_20px_rgba(0,255,157,0.7)] cursor-pointer';
        }
        return 'bg-[#3b82f6] border-[#3b82f6] shadow-[0_0_10px_rgba(59,130,246,0.3)] hover:scale-110 hover:z-10 hover:shadow-[0_0_20px_rgba(59,130,246,0.6)] cursor-pointer';
    };

    const handleClick = () => {
        if (isActive && satellite) {
            onNodeClick(satellite);
        }
    };

    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: (localIndex % 25) * 0.02 }}
            className="aspect-square relative group"
            onClick={handleClick}
        >
            <div
                className={`
                    w-full h-full rounded-[1px] border transition-all duration-200 relative overflow-hidden
                    ${getBlockStyles()}
                    ${loading ? 'animate-pulse opacity-50' : ''}
                `}
            >
                {isActive && (
                    <div className="absolute inset-0 transition-opacity">
                        <img
                            src={`/api/lobster-icon?index=${globalIndex}&owner=${satellite.owner}&v=2`}
                            alt=""
                            className="w-full h-full object-cover"
                            loading="lazy"
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
                    </div>
                )}

                <div className={`
                    absolute top-0.5 left-0.5 text-[6px] font-mono leading-none z-10
                    ${isActive ? (isOwn ? 'text-black font-black bg-white/90 px-0.5' : 'text-white/70 font-bold') : 'text-gray-800'}
                `}>
                    {isOwn ? 'YOU' : globalIndex + 1}
                </div>

                {isActive && satellite && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none z-10">
                        <div className={`w-1.5 h-1.5 rounded-full mb-1 ${satellite.isPulsing ? 'bg-white scale-150 shadow-[0_0_15px_#fff]' : (isOwn ? 'bg-[#00ff9d]' : 'bg-white/50')} transition-all duration-300`} />
                        <span className={`text-[7px] font-mono leading-none ${isOwn ? 'text-white font-bold' : 'text-white/80'}`}>
                            {satellite.plnktnBalance}
                        </span>

                        {/* PLNKTN Bar */}
                        <div className="w-8 h-1 bg-black/20 rounded-full mt-1 overflow-hidden">
                            <motion.div
                                className={`h-full ${satellite.plnktnBalance > 20 ? 'bg-[#00ff9d]' : 'bg-yellow-500'}`}
                                initial={{ width: 0 }}
                                animate={{ width: `${Math.min(100, (satellite.plnktnBalance / 100) * 100)}%` }}
                            />
                        </div>
                    </div>
                )}

                {isActive && satellite?.isPulsing && (
                    <motion.div
                        initial={{ opacity: 0, scale: 0.8 }}
                        animate={{ opacity: [0, 1, 0], scale: [1, 2, 2.5] }}
                        className="absolute inset-0 bg-white/20 rounded-full pointer-events-none"
                    />
                )}
            </div>

            {/* Hover Tooltip */}
            <div className={`
                absolute opacity-0 group-hover:opacity-100 z-50 pointer-events-none transition-opacity duration-200 left-1/2 -translate-x-1/2
                ${isTopRow ? 'top-full mt-2' : 'bottom-full mb-2'}
            `}>
                <div className={`px-3 py-2 rounded text-[10px] whitespace-nowrap shadow-[0_0_20px_rgba(0,0,0,0.5)] ${isOwn ? 'bg-[#00ff9d] border border-[#00ff9d]' : isOther ? 'bg-[#3b82f6] border border-[#3b82f6]' : 'bg-black border border-[#ff4500]'}`}>
                    <div className={`font-bold mb-1 ${isOwn ? 'text-black' : isOther ? 'text-white' : 'text-[#ff4500]'}`}>Lobster ID: {globalIndex + 1}</div>
                    {isActive ? (
                        <>
                            <div className={`font-mono ${isOwn ? 'text-black/70' : 'text-white/80'}`}>
                                {isOwn ? 'YOUR LOBSTER' : satellite.address.slice(0, 6) + '...' + satellite.address.slice(-4)}
                            </div>
                            <div className={`${isOwn ? 'text-black/60' : 'text-white/60'} mt-1`}>Click to view details</div>
                        </>
                    ) : (
                        <div className="text-gray-400 italic">Available Slot</div>
                    )}
                </div>
            </div>
        </motion.div>
    );
};

interface LobsterModalProps {
    satellite: SatelliteData;
    profile: LobsterProfile | null;
    isOwn: boolean;
    userAddress: string | null;
    loading: boolean;
    onClose: () => void;
    onRefresh: () => void;
    onOpenDeposit: (index: number) => void;
    setWithdrawAddress: (addr: string) => void;
    setShowWithdrawModal: (show: boolean) => void;
}

const LobsterModal = ({
    satellite,
    profile,
    isOwn,
    userAddress,
    loading,
    onClose,
    onRefresh,
    onOpenDeposit,
    setWithdrawAddress,
    setShowWithdrawModal
}: LobsterModalProps) => {
    const [twitterUsername, setTwitterUsername] = useState(profile?.twitterUsername || '');
    const [twitterAvatar, setTwitterAvatar] = useState(profile?.twitterAvatar || '');
    const [saving, setSaving] = useState(false);
    const [syncing, setSyncing] = useState(false);

    useEffect(() => {
        if (profile?.twitterUsername) {
            setTwitterUsername(profile.twitterUsername);
        }
        if (profile?.twitterAvatar) {
            setTwitterAvatar(profile.twitterAvatar);
        }
    }, [profile]);

    const handleTwitterSync = async () => {
        if (!twitterUsername) return;
        setSyncing(true);
        // Simulation of fetching Twitter avatar
        // In a real app, you'd use a Twitter API or a proxy
        await new Promise(resolve => setTimeout(resolve, 1500));
        const mockAvatar = `https://unavatar.io/twitter/${twitterUsername}`;
        setTwitterAvatar(mockAvatar);
        setSyncing(false);
    };



    const saveProfile = async () => {
        if (!userAddress) return;

        setSaving(true);
        try {
            const res = await fetch('/api/lobster-profile', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    satelliteIndex: satellite.index,
                    ownerAddress: satellite.owner,
                    twitterUsername,
                    twitterAvatar
                })
            });

            if (res.ok) {
                alert('Profile saved!');
                onRefresh();
            } else {
                const data = await res.json();
                alert(data.error || 'Failed to save profile');
            }
        } catch (e: any) {
            alert(e.message || 'Failed to save profile');
        } finally {
            setSaving(false);
        }
    };



    const iconUrl = (twitterAvatar || profile?.twitterAvatar || `/api/lobster-icon?index=${satellite.index}&owner=${satellite.owner}&v=2`) as string;

    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4"
            onClick={onClose}
        >
            <motion.div
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.9, opacity: 0 }}
                className="bg-[#0a0a0a] border-2 border-[#ff4500] rounded-xl p-6 max-w-md w-full shadow-[0_0_40px_rgba(255,69,0,0.3)]"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center gap-4">
                        <div className="relative">
                            <img
                                src={iconUrl}
                                alt=""
                                className="w-16 h-16 rounded-full border-2 border-[#ff4500] object-cover bg-[#1a1a1a]"
                            />
                        </div>
                        <div>
                            <h2 className="text-xl font-black text-[#ff4500]">Lobster #{satellite.index + 1}</h2>
                            <a href={`https://amoy.polygonscan.com/address/${satellite.address}`} target="_blank" rel="noopener noreferrer" className="text-gray-500 hover:text-[#ff4500] text-[10px] font-mono hover:underline">
                                {satellite.address} ↗
                            </a>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="text-gray-500 hover:text-white transition-colors text-2xl"
                    >
                        ×
                    </button>
                </div>

                {loading ? (
                    <div className="text-center py-8">
                        <div className="animate-spin text-4xl border-4 border-[#ff4500] border-t-transparent rounded-full w-12 h-12"></div>
                        <p className="text-gray-500 mt-2">Loading profile...</p>
                    </div>
                ) : (
                    <div className="space-y-4">
                        {/* Twitter/X Link */}
                        <div className="bg-[#1a1a1a] rounded-lg p-4">
                            <label className="text-[10px] uppercase tracking-widest text-gray-500 mb-2 block">
                                Link Twitter / X
                            </label>
                            {isOwn ? (
                                <div className="flex gap-2">
                                    <div className="flex-1 flex gap-2">
                                        <span className="text-gray-500">@</span>
                                        <input
                                            type="text"
                                            value={twitterUsername}
                                            onChange={(e) => setTwitterUsername(e.target.value)}
                                            placeholder="username"
                                            className="flex-1 bg-transparent border-b border-gray-700 text-white focus:border-[#ff4500] outline-none"
                                        />
                                    </div>
                                    <button
                                        onClick={handleTwitterSync}
                                        disabled={syncing || !twitterUsername}
                                        className="bg-[#1da1f2]/10 text-[#1da1f2] border border-[#1da1f2]/30 px-3 py-1 rounded text-[10px] font-bold uppercase tracking-widest hover:bg-[#1da1f2] hover:text-white transition-all disabled:opacity-50"
                                    >
                                        {syncing ? '...' : 'Sync'}
                                    </button>
                                </div>
                            ) : (
                                <div className="text-white">
                                    {profile?.twitterUsername ? (
                                        <a
                                            href={`https://x.com/${profile.twitterUsername}`}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="text-[#1da1f2] hover:underline"
                                        >
                                            @{profile.twitterUsername}
                                        </a>
                                    ) : (
                                        <span className="text-gray-600 italic">Not linked</span>
                                    )}
                                </div>
                            )}
                        </div>

                        {/* Lifetime Earnings */}
                        <div className="bg-[#1a1a1a] rounded-lg p-4">
                            <label className="text-[10px] uppercase tracking-widest text-gray-500 mb-2 block">
                                Lifetime Earnings
                            </label>
                            <div className="text-2xl font-black text-[#00ff9d] flex items-baseline gap-1">
                                <span className="text-sm font-normal text-gray-500">$</span>
                                {satellite.earnings}
                            </div>

                            <div className="text-gray-500 text-xs mt-1 mb-3">
                                From {satellite.sessionCount} mixing sessions
                            </div>

                            {isOwn && (
                                <button
                                    onClick={() => {
                                        setWithdrawAddress(userAddress || "");
                                        setShowWithdrawModal(true);
                                    }}
                                    className="w-full bg-[#ff4500]/10 border border-[#ff4500]/30 text-[#ff4500] text-xs font-bold py-2 rounded hover:bg-[#ff4500] hover:text-white transition-all uppercase tracking-widest"
                                >
                                    Withdraw
                                </button>
                            )}
                        </div>

                        {/* Node PLNKTN */}
                        <div className="bg-[#1a1a1a] rounded-lg p-4 relative overflow-hidden group/plnktn">
                            <div className="flex justify-between items-start mb-2">
                                <label className="text-[10px] uppercase tracking-widest text-gray-500 block">
                                    Node PLNKTN
                                </label>
                                <span className={`text-[10px] font-bold ${satellite.plnktnBalance > 10 ? 'text-[#00ff9d]' : 'text-red-500 animate-pulse'}`}>
                                    {satellite.plnktnBalance > 0 ? 'OPERATIONAL' : 'OFFLINE - NO PLNKTN'}
                                </span>
                            </div>

                            <div className="flex items-end gap-3">
                                <div className="text-2xl font-black text-white">
                                    {satellite.plnktnBalance} <span className="text-gray-500 text-xs font-normal">Units</span>
                                </div>

                                {isOwn && (
                                    <button
                                        onClick={() => onOpenDeposit(satellite.index)}
                                        className="group/btn relative px-3 py-1 bg-[#ff4500]/10 border border-[#ff4500]/30 rounded text-[10px] font-bold text-[#ff4500] hover:bg-[#ff4500] hover:text-black transition-all flex items-center gap-2 overflow-hidden"
                                    >
                                        <span className="relative z-10">+ ADD PLNKTN</span>
                                        <div className="absolute inset-0 bg-white/20 translate-y-full group-hover/btn:translate-y-0 transition-transform duration-300" />
                                    </button>
                                )}
                            </div>

                            <div className="w-full h-1.5 bg-black/40 rounded-full mt-3 overflow-hidden">
                                <motion.div
                                    className={`h-full ${satellite.plnktnBalance > 30 ? 'bg-[#00ff9d]' : 'bg-red-500'}`}
                                    initial={{ width: 0 }}
                                    animate={{ width: `${Math.min(100, (satellite.plnktnBalance / 100) * 100)}%` }}
                                />
                            </div>

                            <p className="text-[9px] text-gray-500 mt-2 italic">
                                * Burns 1 per randomization pulse. No PLNKTN = No rewards.
                            </p>

                        </div>

                        {/* Actions */}
                        {isOwn && (
                            <div className="flex gap-3 pt-4">
                                <button
                                    onClick={saveProfile}
                                    disabled={saving}
                                    className="flex-1 bg-[#ff4500] text-black font-bold py-3 rounded uppercase text-xs tracking-widest hover:shadow-[0_0_20px_rgba(255,69,0,0.5)] transition-all disabled:opacity-50"
                                >
                                    {saving ? 'Saving...' : 'Save Changes'}
                                </button>
                            </div>
                        )}
                    </div>
                )}
            </motion.div>
        </motion.div>
    );
};
