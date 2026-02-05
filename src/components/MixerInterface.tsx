import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ethers } from 'ethers';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

// Contract Address & ABI
// TODO: Move to environment variable for production (H5)
const CONTRACT_ADDRESS = "0x70Da0050Ac783967cB21e4b53311B4060279a76B";
const MIN_ABI = [
    "function joinMesh() external payable",
    "function deployLobster() external payable",
    "function getSatellitesCount() external view returns (uint256)",
    "function deposit(uint256 mixAmount, address _receiver, bytes32 entropy) external payable",
    "function satellites(uint256) external view returns (address addr, address owner, bool isActive, uint256 totalEarnings, uint256 stakedAmount, uint256 sessionCount)",
    "function getUserSessions(address user) external view returns (uint256[])",
    "function DEPLOY_STAKE() external view returns (uint256)",
    "event SatelliteDeployed(address indexed satellite, uint256 index, uint256 stakedAmount)",
    "event Deposit(uint256 indexed sessionId, address depositor, uint256 amount, uint256 shards, uint256 estimatedCycles)",
    "event HopEvent(uint256 indexed sessionId, uint256 cycleNumber, uint8 hopNumber, string groupFrom, string groupTo)",
    "event CycleCompleted(uint256 indexed sessionId, uint256 cycleNumber, uint256 shardsInCycle, uint256 totalProcessed, uint256 shardsRemaining)",
    "event MixCompleted(uint256 indexed sessionId, address receiver, uint256 amount, uint256 totalCycles)",
    "event NetworkHop(uint256 indexed sessionId, uint256 cycle, uint8 hop, address[] fromNodes, address[] toNodes)",
    "function depositERC20(address token, uint256 mixAmount, address _receiver, bytes32 entropy) external",
    "function approve(address spender, uint256 amount) external returns (bool)"
];

const USDC_ADDRESSES = {
    ethereum: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
    polygon: "0x41E94Eb019C0762f9Bfcf9Fb1E58725BfB0e7582", // Polygon Amoy USDC
    solana: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"
};

const cn = (...inputs: any[]) => twMerge(clsx(inputs));

interface LogItem {
    id: string;
    msg: string;
    type: 'info' | 'success' | 'warning';
    time: string;
}

export default function MixerInterface() {
    const [activeTab, setActiveTab] = useState<'mixer' | 'mesh'>('mixer');
    const [wallet, setWallet] = useState<string | null>(null);
    const [signer, setSigner] = useState<ethers.Signer | null>(null);
    const [contract, setContract] = useState<ethers.Contract | null>(null);

    // Form States
    const [amount, setAmount] = useState('5');
    const [recipients, setRecipients] = useState<Array<{ address: string, amount: number }>>([{ address: '', amount: 0 }]);
    const [distributionMode, setDistributionMode] = useState<'equal' | 'custom'>('equal');

    // Real Data States
    const [satelliteCount, setSatelliteCount] = useState<number>(0);
    const [shardsPerWave, setShardsPerWave] = useState<number>(10); // Default to 10
    const [queueTime, setQueueTime] = useState<number>(0); // Queue time in seconds
    const [isProcessing, setIsProcessing] = useState(false);
    const [logs, setLogs] = useState<LogItem[]>([]);

    // Network States
    const [selectedNetwork, setSelectedNetwork] = useState<'ethereum' | 'polygon' | 'solana'>('polygon');
    const [isSwitchingNetwork, setIsSwitchingNetwork] = useState(false);
    const [isNetworkDropdownOpen, setIsNetworkDropdownOpen] = useState(false);
    const [isWalletModalOpen, setIsWalletModalOpen] = useState(false);
    const [selectedAsset, setSelectedAsset] = useState<'NATIVE' | 'USDC'>('NATIVE');

    // Prevent double-execution in Strict Mode
    const isConnecting = React.useRef(false);

    const addLog = useCallback((msg: string, type: 'info' | 'success' | 'warning' = 'info') => {
        const id = typeof window !== 'undefined'
            ? window.crypto.randomUUID()
            : Math.random().toString(36).substr(2, 9);

        const newLog: LogItem = {
            id,
            msg,
            type,
            time: new Date().toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })
        };
        setLogs(prev => [newLog, ...prev].slice(0, 50)); // Keep last 50 logs
    }, []);

    // Network configuration
    const NETWORK_CONFIG = {
        ethereum: { chainId: '0x1', name: 'Ethereum Mainnet', rpc: 'https://eth.llamarpc.com' },
        polygon: { chainId: '0x13882', name: 'Polygon Amoy', rpc: 'https://rpc-amoy.polygon.technology' },
        solana: { chainId: null, name: 'Solana', rpc: null } // Solana requires different wallet
    };

    // ... switchNetwork code ... (omitted from replace chunk as it's cleaner to target shorter block)
    // Wait, need to target logic flow. Let's start replace from connectWallet instead.

    // Re-targeting to focus on connectWallet function specifically


    const switchNetwork = async (network: 'ethereum' | 'polygon' | 'solana') => {
        // If switching between EVM and Solana, disconnect wallet first
        const isCurrentlyEVM = selectedNetwork === 'ethereum' || selectedNetwork === 'polygon';
        const isTargetEVM = network === 'ethereum' || network === 'polygon';

        if (wallet && isCurrentlyEVM !== isTargetEVM) {
            // Switching between different wallet types - disconnect first
            setWallet(null);
            setSigner(null);
            setContract(null);
            addLog('Wallet disconnected. Please reconnect with the appropriate wallet.', 'warning');
        }

        if (network === 'solana') {
            setSelectedNetwork('solana');
            addLog('Switched to Solana. Click "Connect Wallet" to use Phantom.', 'info');
            return;
        }

        setIsSwitchingNetwork(true);
        try {
            const config = NETWORK_CONFIG[network];
            await (window as any).ethereum.request({
                method: 'wallet_switchEthereumChain',
                params: [{ chainId: config.chainId }],
            });
            setSelectedNetwork(network);
            addLog(`Switched to ${config.name}`, 'success');
        } catch (error: any) {
            if (error.code === 4902) {
                addLog(`${NETWORK_CONFIG[network].name} not found in wallet. Please add it manually.`, 'warning');
            } else {
                addLog(`Failed to switch network: ${error.message}`, 'warning');
            }
        } finally {
            setIsSwitchingNetwork(false);
        }
    };

    // Check for persisted wallet connection on mount with delay
    useEffect(() => {
        const timer = setTimeout(() => {
            const savedWalletType = localStorage.getItem('connectedWalletType');
            // Only auto-connect MetaMask for now to isolate Phantom issues
            if (savedWalletType === 'metamask') {
                connectWallet('metamask', true);
            }
        }, 500); // 500ms delay to allow wallet injection
        return () => clearTimeout(timer);
    }, []);

    // Disconnect wallet
    const disconnect = async () => {
        setWallet(null);
        setSigner(null);
        setContract(null);
        localStorage.removeItem('connectedWalletType');
        addLog('Wallet disconnected', 'info');
    };

    // Connect to specific wallet
    const connectWallet = async (walletType: 'metamask' | 'phantom', silent: boolean = false) => {
        if (isConnecting.current) return;
        isConnecting.current = true;

        if (!silent) setIsWalletModalOpen(false);

        try {
            if (walletType === 'phantom') {
                // STRICT Phantom Detection
                // We bypass window.solana to avoid conflicts with other wallets (Backpack, etc)
                const getProvider = () => {
                    if ('phantom' in window && (window as any).phantom?.solana) {
                        return (window as any).phantom.solana;
                    }
                    return null;
                };

                const provider = getProvider();

                if (provider) {
                    try {
                        if (!silent) {
                            if (provider.isConnected && provider.publicKey) {
                                const publicKey = provider.publicKey.toString();
                                setWallet(publicKey);
                                setSelectedNetwork('solana');
                                localStorage.setItem('connectedWalletType', 'phantom');
                                addLog(`Phantom connected: ${publicKey.slice(0, 6)}...${publicKey.slice(-4)}`, 'success');
                                return;
                            }
                        }

                        console.log("Connecting to specific Phantom provider:", {
                            version: provider.version,
                            isConnected: provider.isConnected
                        });

                        // Standard Connect - Synchronous (User Trusted Action)
                        const resp = silent
                            ? await provider.connect({ onlyIfTrusted: true })
                            : await provider.connect(); // No args for manual connect to force popup

                        const publicKey = resp.publicKey.toString();
                        setWallet(publicKey);
                        setSelectedNetwork('solana');
                        localStorage.setItem('connectedWalletType', 'phantom');
                        if (!silent) addLog(`Phantom wallet connected: ${publicKey.slice(0, 6)}...${publicKey.slice(-4)}`, 'success');
                    } catch (e: any) {
                        console.error("Phantom Error:", e);
                        if (!silent) {
                            addLog(`Phantom failed: ${e.message}`, 'warning');
                            // Check for pending request error
                            if (e.code === -32603) {
                                alert("Phantom Internal Error (-32603).\n\nPossible fixes:\n1. Unlock your Phantom wallet first.\n2. Check if a connection popup is hidden behind this window.\n3. Restart your browser.");
                            }
                        }
                        localStorage.removeItem('connectedWalletType');
                    }
                } else {
                    if (!silent) {
                        addLog('Phantom wallet not found.', 'warning');
                        window.open('https://phantom.app/', '_blank');
                    }
                }
                return;
            }

            // Connect to MetaMask for Ethereum/Polygon
            if (typeof window !== 'undefined' && (window as any).ethereum) {
                try {
                    const provider = new ethers.BrowserProvider((window as any).ethereum);
                    const _signer = await provider.getSigner();
                    const _wallet = await _signer.getAddress();
                    const _contract = new ethers.Contract(CONTRACT_ADDRESS, MIN_ABI, _signer);

                    setSigner(_signer);
                    setWallet(_wallet);
                    setContract(_contract);
                    localStorage.setItem('connectedWalletType', 'metamask');
                    addLog(`Wallet connected: ${_wallet.slice(0, 6)}...${_wallet.slice(-4)}`, 'success');

                    await fetchSatelliteCount(_contract);
                    await fetchQueueTime(_contract);
                    setupEventListeners(_contract);

                } catch (e: any) {
                    console.error("Connection error", e);
                    addLog(`Connection failed: ${e.message}`, 'warning');
                    localStorage.removeItem('connectedWalletType'); // Clear on failure
                }
            } else {
                if (!silent) alert("Please install MetaMask!");
            }
        } finally {
            isConnecting.current = false;
        }
    };

    // Initialize & Connect - Now just opens modal
    const connect = async () => {
        setIsWalletModalOpen(true);
    };



    const fetchSatelliteCount = async (ctx: ethers.Contract) => {
        try {
            const count = await ctx.getSatellitesCount();
            setSatelliteCount(Number(count));

            // Also fetch shardsPerWave for accurate ETA
            const activeCount = await ctx.getActiveNodeCount();
            const selectedCount = Number(activeCount) - (Number(activeCount) % 5);
            const spw = selectedCount / 5;
            console.log('🔢 ShardsPerWave:', spw, '(from', Number(activeCount), 'nodes)');
            setShardsPerWave(spw > 0 ? spw : 10);
        } catch (e) {
            console.error("Fetch count error", e);
        }
    };

    const fetchQueueTime = async (ctx: ethers.Contract) => {
        try {
            const sessionCount = await ctx.sessionCount();
            const count = Number(sessionCount);
            console.log('📊 Sessions:', count);
            if (count === 0) { setQueueTime(0); return; }

            let totalRemainingWaves = 0;
            for (let i = 1; i <= count; i++) {
                try {
                    const details = await ctx.getSessionDetails(i);
                    if (!details[7]) { // not completed
                        const remainingWaves = Number(details[4]) - Number(details[5]);
                        totalRemainingWaves += remainingWaves;
                    }
                } catch (e) { continue; }
            }
            const queueSecs = totalRemainingWaves * 30;
            console.log('⏱️ Queue:', queueSecs, 's');
            setQueueTime(queueSecs);
        } catch (e) {
            setQueueTime(0);
        }
    };

    const setupEventListeners = (ctx: ethers.Contract) => {
        ctx.removeAllListeners(); // Cleanup old listeners if re-connecting

        ctx.on("SatelliteDeployed", (satellite, index, stakedAmount) => {
            const shortAddr = `${satellite.slice(0, 6)}...${satellite.slice(-4)}`;
            const stake = ethers.formatEther(stakedAmount);
            addLog(`Lobster Deployed: ${shortAddr} (Staked: ${stake} POL)`, 'success');
            setSatelliteCount(prev => prev + 1);
        });

        ctx.on("Deposit", (sessionId, depositor, amt, shards, cycles) => {
            const val = ethers.formatEther(amt);
            addLog(`Started Session #${sessionId}: ${val} POL (${shards} shards, ~${cycles} cycles)`, 'info');
        });

        ctx.on("HopEvent", (sessionId, cycle, hop, from, to) => {
            // Only show detailed hops for my active session or general network activity (throttled)
            // For now, let's just log unique wave completions to avoid spam
            if (hop === 5) {
                // addLog(`Session #${sessionId} Cycle ${cycle}: 🌊 Wave Complete (A→E)`, 'info');
            }
        });

        ctx.on("CycleCompleted", (sessionId, cycle, shardsInParams, totalProcessed, remaining) => {
            addLog(`Session #${sessionId}: Cycle ${cycle} Complete! (${shardsInParams} shards moved A→E). ${remaining} remaining.`, 'info');
        });

        ctx.on("MixCompleted", (sessionId, receiverAddr, amount, totalCycles) => {
            addLog(`Session #${sessionId} FINISHED! ${ethers.formatEther(amount)} POL sent to ${receiverAddr.slice(0, 6)}... after ${totalCycles} cycles.`, 'success');
        });
    };

    // Actions
    const handleJoinMesh = async () => {
        if (!contract) return alert("Connect wallet first");
        try {
            setIsProcessing(true);
            addLog("Deploying Lobster (staking 1 POL)...", 'info');
            const tx = await contract.joinMesh({ value: ethers.parseEther("1") });
            addLog("Transaction sent. Waiting for confirmation...", 'info');
            await tx.wait();
            addLog("Successfully deployed your Lobster! 1 POL staked.", 'success');
            await fetchSatelliteCount(contract);
        } catch (e: any) {
            console.error(e);
            addLog(`Join failed: ${e.reason || e.message}`, 'warning');
        } finally {
            setIsProcessing(false);
        }
    };

    const handleDeposit = async () => {
        if (!wallet) {
            addLog('Please connect wallet first', 'warning');
            return;
        }

        if (selectedNetwork === 'solana') {
            addLog('Solana deposits coming soon! Contract deployment in progress.', 'warning');
            return;
        }

        if (!contract || !signer) {
            addLog('Please connect wallet first', 'warning');
            return;
        }

        const validRecipients = recipients.filter(r => r.address.trim() !== '');
        if (validRecipients.length === 0) {
            addLog('Please add at least one recipient', 'warning');
            return;
        }

        const receiveAmount = parseFloat(amount) || 0;
        let recipientAmounts: Array<{ address: string, amount: number }> = [];

        if (distributionMode === 'equal') {
            const amountPerRecipient = receiveAmount / validRecipients.length;
            const roundedAmount = Math.floor(amountPerRecipient * 10) / 10;
            recipientAmounts = validRecipients.map(r => ({
                address: r.address,
                amount: roundedAmount
            }));
        } else {
            recipientAmounts = validRecipients.map(r => ({
                address: r.address,
                amount: r.amount
            }));
        }

        const total = recipientAmounts.reduce((sum, r) => sum + r.amount, 0);
        if (Math.abs(total - receiveAmount) > 0.01) {
            addLog(`Total amounts (${total.toFixed(2)}) must equal receive amount (${receiveAmount.toFixed(2)})`, 'warning');
            return;
        }

        const invalidAmounts = recipientAmounts.filter(r => (r.amount * 10) % 1 !== 0);
        if (invalidAmounts.length > 0) {
            addLog(`PRIVACY LEAK: All amounts must be divisible by 0.1. Invalid amounts detected.`, 'warning');
            return;
        }

        setIsProcessing(true);

        try {
            if (typeof (window as any).ethereum !== 'undefined' && selectedAsset === 'NATIVE') {
                const provider = new ethers.BrowserProvider((window as any).ethereum);
                const balance = await provider.getBalance(wallet);
                const totalRequired = recipientAmounts.reduce((sum, r) => {
                    const mixAmount = ethers.parseUnits(r.amount.toString(), 'ether');
                    const fee = (mixAmount * BigInt(5)) / BigInt(1000);
                    return sum + mixAmount + fee;
                }, BigInt(0));

                if (balance < totalRequired) {
                    const needed = ethers.formatEther(totalRequired - balance);
                    addLog(`INSUFFICIENT FUNDS: You need ${needed} more POL to cover deposits and fees.`, 'warning');
                    setIsProcessing(false);
                    return;
                }
            }

            const isUSDC = selectedAsset === 'USDC';

            if (isUSDC) {
                const tokenAddress = (USDC_ADDRESSES as any)[selectedNetwork];
                const tokenContract = new ethers.Contract(tokenAddress, ["function approve(address, uint256) external returns (bool)", "function allowance(address, address) view returns (uint256)"], signer);

                addLog(`Checking USDC allowance for hopping...`, 'info');
                const mixAmountRaw = ethers.parseUnits(amount, 6);
                const feeAmount = (mixAmountRaw * BigInt(50)) / BigInt(10000); // 0.5%
                const amountToApprove = mixAmountRaw + feeAmount;

                const allowance = await tokenContract.allowance(wallet, CONTRACT_ADDRESS);
                if (allowance < amountToApprove) {
                    addLog(`Approving USDC (${ethers.formatUnits(amountToApprove, 6)} total)...`, 'info');
                    const approveTx = await tokenContract.approve(CONTRACT_ADDRESS, amountToApprove);
                    await approveTx.wait();
                    addLog(`USDC Approved!`, 'success');
                }
            }

            for (let i = 0; i < recipientAmounts.length; i++) {
                const recipient = recipientAmounts[i];
                const mixAmount = isUSDC
                    ? ethers.parseUnits(recipient.amount.toString(), 6)
                    : ethers.parseEther(recipient.amount.toString());

                const feeAmount = mixAmount * BigInt(5) / BigInt(1000);
                const totalPayment = isUSDC ? mixAmount : (mixAmount + feeAmount);

                addLog(`[${i + 1}/${recipientAmounts.length}] ${isUSDC ? 'Initiating USDC Hop' : 'Depositing ' + recipient.amount + ' POL'} for ${recipient.address.slice(0, 6)}...`, 'info');

                const entropy = ethers.hexlify(window.crypto.getRandomValues(new Uint8Array(32)));
                let tx;
                if (isUSDC) {
                    const tokenAddress = (USDC_ADDRESSES as any)[selectedNetwork];
                    tx = await contract.depositERC20(tokenAddress, mixAmount, recipient.address, entropy);
                } else {
                    tx = await contract.deposit(mixAmount, recipient.address, entropy, { value: totalPayment });
                }

                addLog(`[${i + 1}/${recipientAmounts.length}] ${isUSDC ? 'Hop' : 'Tx'} sent: ${tx.hash.slice(0, 10)}...`, 'info');
                await tx.wait();
                addLog(`[${i + 1}/${recipientAmounts.length}] ${isUSDC ? 'USDC Active' : 'Confirmed'} for ${recipient.address.slice(0, 6)}...`, 'success');
            }

            addLog(`All ${recipientAmounts.length} ${isUSDC ? 'USDC hops' : 'deposits'} completed!`, 'success');
            setAmount(isUSDC ? '100' : '5');
            setRecipients([{ address: '', amount: 0 }]);

        } catch (e: any) {
            console.error("Deposit error", e);
            addLog(`Operation failed: ${e.reason || e.message}`, 'warning');
        } finally {
            setIsProcessing(false);
        }
    };

    // Auto-connect if already authorized
    useEffect(() => {
        if (typeof window !== 'undefined' && (window as any).ethereum) {
            (window as any).ethereum.request({ method: 'eth_accounts' })
                .then((accounts: string[]) => {
                    if (accounts.length > 0) connect();
                });
        }
    }, []);

    // Refresh queue time every 30 seconds
    useEffect(() => {
        if (!contract) return;

        const interval = setInterval(() => {
            console.log('🔄 Refreshing queue time...');
            fetchQueueTime(contract);
        }, 30000); // 30 seconds

        return () => clearInterval(interval);
    }, [contract]);

    return (
        <div className="w-full max-w-5xl mx-auto font-mono text-white min-h-screen relative flex flex-col justify-start sm:justify-center py-4 sm:py-10">
            {/* Decoupled Rounded Glow Layer */}
            <div className="absolute inset-4 bg-[#ff4500]/5 rounded-[3rem] blur-2xl z-0 pointer-events-none" />

            {/* Main Container Card with Glassmorphism */}
            <div className="relative z-10 bg-[#050505]/95 backdrop-blur-xl rounded-xl border border-[#ff4500]/20 shadow-[0_0_30px_rgba(255,69,0,0.05)] overflow-hidden">

                {/* Header */}
                <header className="flex flex-col sm:flex-row justify-between items-center px-4 py-3 sm:px-6 sm:py-4 border-b border-[#ff4500]/10 relative bg-[#0a0a0a] gap-3 sm:gap-0">
                    <div className="absolute inset-0 bg-[radial-gradient(circle_at_left,_var(--tw-gradient-stops))] from-[#ff4500]/10 via-transparent to-transparent pointer-events-none opacity-50" />
                    <h1 className="text-base sm:text-lg font-black tracking-tighter text-[#ff4500] uppercase flex items-center gap-2 filter drop-shadow-[0_0_10px_rgba(255,69,0,0.4)]">
                        <span className="tracking-[0.2em]">Lobster Mesh</span>
                    </h1>
                    <div className="flex flex-col items-end gap-2 w-full sm:w-auto">
                        <button
                            onClick={connect}
                            disabled={!!wallet}
                            className={cn(
                                "group relative w-full sm:w-auto px-4 py-1.5 sm:px-6 sm:py-2 bg-[#1a0505] overflow-hidden rounded-lg border transition-colors disabled:opacity-50",
                                wallet && selectedNetwork === 'solana'
                                    ? "border-[#9945ff]/30 hover:border-[#9945ff] shadow-[0_0_15px_rgba(153,69,255,0.3)]"
                                    : "border-[#ff4500]/30 hover:border-[#ff4500]",
                                wallet && selectedNetwork !== 'solana' && "animate-pulse"
                            )}
                        >
                            <div className={cn(
                                "absolute inset-0 translate-y-full group-hover:translate-y-0 transition-transform duration-300",
                                wallet && selectedNetwork === 'solana' ? "bg-[#9945ff]/10" : "bg-[#ff4500]/10"
                            )} />
                            <span className={cn(
                                "relative z-10 font-bold uppercase tracking-widest text-[10px] sm:text-xs",
                                wallet && selectedNetwork === 'solana' ? "text-[#9945ff]" : "text-[#ff4500]"
                            )}>
                                {wallet ? (
                                    <span className="flex items-center justify-center gap-2 sm:flex-col sm:items-end sm:gap-1">
                                        <span className={cn(
                                            "text-[9px]",
                                            selectedNetwork === 'solana' ? "text-[#9945ff]/60" : "text-[#ff4500]/60"
                                        )}>
                                            {selectedNetwork === 'solana' ? 'Phantom' : 'MetaMask'}
                                        </span>
                                        <span>{wallet.slice(0, 6)}...{wallet.slice(-4)}</span>
                                    </span>
                                ) : "Connect Wallet"}
                            </span>
                        </button>
                        {wallet && (
                            <button
                                onClick={disconnect}
                                className={cn(
                                    "text-[9px] sm:text-[10px] transition-colors uppercase tracking-wider w-full sm:w-auto text-center sm:text-right",
                                    selectedNetwork === 'solana'
                                        ? "text-[#9945ff]/60 hover:text-[#9945ff]"
                                        : "text-[#ff4500]/60 hover:text-[#ff4500]"
                                )}
                            >
                                Disconnect
                            </button>
                        )}
                    </div>
                </header>

                {/* Wallet Selection Modal */}
                {isWalletModalOpen && (
                    <div
                        className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4"
                        onClick={() => setIsWalletModalOpen(false)}
                    >
                        <div
                            className="bg-[#0a0a0a] border border-[#ff4500]/30 rounded-2xl p-6 sm:p-8 max-w-md w-full shadow-[0_0_50px_rgba(255,69,0,0.3)]"
                            onClick={(e) => e.stopPropagation()}
                        >
                            <h3 className="text-xl sm:text-2xl font-bold text-[#ff4500] mb-6 uppercase tracking-wider text-center">
                                Select Wallet
                            </h3>

                            <div className="space-y-4">
                                {/* MetaMask Option */}
                                <button
                                    onClick={() => connectWallet('metamask')}
                                    className="w-full p-4 sm:p-6 bg-[#1a0505] border border-[#ff4500]/30 hover:border-[#ff4500] rounded-xl transition-all hover:shadow-[0_0_20px_rgba(255,69,0,0.2)] group"
                                >
                                    <div className="flex items-center gap-4">
                                        <div className="w-10 h-10 sm:w-12 sm:h-12 bg-[#ff4500]/10 rounded-lg flex items-center justify-center p-2 group-hover:scale-110 transition-transform">
                                            <img src="/metamask.png" alt="MetaMask" className="w-full h-full object-contain" />
                                        </div>
                                        <div className="text-left flex-1">
                                            <div className="text-[#ff4500] font-bold uppercase tracking-wider text-sm sm:text-base">MetaMask</div>
                                            <div className="text-[#ff4500]/60 text-xs">Ethereum & Polygon</div>
                                        </div>
                                    </div>
                                </button>

                                {/* Phantom Option */}
                                <button
                                    onClick={() => connectWallet('phantom')}
                                    className="w-full p-4 sm:p-6 bg-[#1a0505] border border-[#9945ff]/30 hover:border-[#9945ff] rounded-xl transition-all hover:shadow-[0_0_20px_rgba(153,69,255,0.2)] group"
                                >
                                    <div className="flex items-center gap-4">
                                        <div className="w-10 h-10 sm:w-12 sm:h-12 bg-[#9945ff]/10 rounded-lg flex items-center justify-center p-2 group-hover:scale-110 transition-transform">
                                            <img src="/phantom.png" alt="Phantom" className="w-full h-full object-contain" />
                                        </div>
                                        <div className="text-left flex-1">
                                            <div className="text-[#9945ff] font-bold uppercase tracking-wider text-sm sm:text-base">Phantom</div>
                                            <div className="text-[#9945ff]/60 text-xs">Solana</div>
                                        </div>
                                    </div>
                                </button>
                            </div>

                            <button
                                onClick={() => setIsWalletModalOpen(false)}
                                className="mt-6 w-full text-[#ff4500]/60 hover:text-[#ff4500] text-sm uppercase tracking-wider transition-colors"
                            >
                                Cancel
                            </button>
                        </div>
                    </div>
                )}

                {/* Tabs */}
                <div className="flex border-b border-[#ff4500]/20 bg-[#0a0a0a]">
                    <Tab label="Lobster Mixer" active={activeTab === 'mixer'} onClick={() => setActiveTab('mixer')} />
                    <Tab label="Pod Mesh" active={activeTab === 'mesh'} onClick={() => setActiveTab('mesh')} />
                </div>

                {/* Content Area */}
                <div className="px-4 py-3 sm:px-6 sm:py-4 bg-gradient-to-b from-[#0a0a0a] to-[#050505] relative">
                    <AnimatePresence mode="wait">
                        {activeTab === 'mixer' ? (
                            <MixerPanel
                                key="mixer"
                                amount={amount}
                                setAmount={setAmount}
                                recipients={recipients}
                                setRecipients={setRecipients}
                                distributionMode={distributionMode}
                                setDistributionMode={setDistributionMode}
                                onDeposit={handleDeposit}
                                processing={isProcessing}
                                queueTime={queueTime}
                                shardsPerWave={shardsPerWave}
                                selectedNetwork={selectedNetwork}
                                isSwitchingNetwork={isSwitchingNetwork}
                                switchNetwork={switchNetwork}
                                isNetworkDropdownOpen={isNetworkDropdownOpen}
                                setIsNetworkDropdownOpen={setIsNetworkDropdownOpen}
                                selectedAsset={selectedAsset}
                                setSelectedAsset={setSelectedAsset}
                            />
                        ) : (
                            <MeshPanel
                                key="mesh"
                                satellites={satelliteCount}
                                onJoin={handleJoinMesh}
                                processing={isProcessing}
                                queueTime={queueTime}
                                isSolana={selectedNetwork === 'solana'}
                            />
                        )}
                    </AnimatePresence>

                    {/* Live Network Feed */}
                    <div className="mt-2 font-mono text-[9px] sm:text-[10px] p-2 bg-black/80 rounded-lg border border-[#ff4500]/20 h-24 overflow-y-auto custom-scrollbar">
                        <div className="flex justify-between items-center mb-1 border-b border-[#ff4500]/10 pb-1">
                            <span className="text-[#ff4500] uppercase tracking-widest font-bold flex items-center gap-2">
                                <span className="w-1.5 h-1.5 bg-[#ff4500] rounded-full animate-pulse" />
                                Live Network Activity
                            </span>
                            <span className="text-gray-600">{logs.length} events</span>
                        </div>
                        <div className="space-y-1">
                            {logs.length === 0 && <div className="text-gray-700 italic">Listening for blockchain events...</div>}
                            {logs.map(log => (
                                <div key={log.id} className="flex gap-2 sm:gap-3 text-gray-400 font-medium">
                                    <span className="text-gray-600 whitespace-nowrap">[{log.time}]</span>
                                    <span className={clsx(
                                        log.type === 'success' && "text-[#00ff9d]",
                                        log.type === 'warning' && "text-yellow-500",
                                        log.type === 'info' && "text-gray-300"
                                    )}>&gt; {log.msg}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>

            {/* Background Decorative Elements - Reduced Opacity */}
            <div className="absolute -top-20 -left-20 w-96 h-96 bg-[#ff4500] rounded-full mix-blend-screen filter blur-[120px] opacity-5 animate-pulse pointer-events-none" />
            <div className="absolute -bottom-20 -right-20 w-96 h-96 bg-[#ff4500] rounded-full mix-blend-screen filter blur-[120px] opacity-5 animate-pulse pointer-events-none" />
        </div>
    );
}

const Tab = ({ label, active, onClick }: { label: string, active: boolean, onClick: () => void }) => (
    <button
        onClick={onClick}
        className={cn(
            "flex-1 py-2 sm:py-4 text-[10px] sm:text-xs font-black uppercase tracking-[0.2em] transition-all relative overflow-hidden group",
            active ? "text-[#ff4500] bg-[#ff4500]/5" : "text-gray-500 hover:text-[#ff4500] hover:bg-[#ff4500]/5"
        )}
    >
        <span className="relative z-10">{label}</span>
        {active && (
            <motion.div
                layoutId="activeTab"
                className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#ff4500] shadow-[0_0_15px_#ff4500]"
            />
        )}
    </button>
);

const MixerPanel = ({ amount, setAmount, recipients, setRecipients, distributionMode, setDistributionMode, onDeposit, processing, queueTime, shardsPerWave, selectedNetwork, isSwitchingNetwork, switchNetwork, isNetworkDropdownOpen, setIsNetworkDropdownOpen, selectedAsset, setSelectedAsset }: any) => {
    // Get currency symbol based on network
    const getCurrency = () => {
        if (selectedAsset === 'USDC') return 'USDC';
        switch (selectedNetwork) {
            case 'ethereum': return 'ETH';
            case 'solana': return 'SOL';
            case 'polygon':
            default: return 'POL';
        }
    };
    const currency = getCurrency();

    // Calculate fees - NO rounding on total
    const receiveAmount = parseFloat(amount) || 0;
    const feeAmount = receiveAmount * 0.005; // 0.5% exact
    const totalPayment = receiveAmount + feeAmount; // Exact total, no rounding
    const shards = Math.round(receiveAmount * 10); // Shards from RECEIVE amount only
    const isValidAmount = receiveAmount >= 0.5 && (receiveAmount * 10) % 1 === 0; // Must be >= 0.5 and divisible by 0.1

    // Recipient management
    const addRecipient = () => {
        if (recipients.length < 10) {
            setRecipients([...recipients, { address: '', amount: 0 }]);
        }
    };

    const removeRecipient = (index: number) => {
        if (recipients.length > 1) {
            setRecipients(recipients.filter((_: any, i: number) => i !== index));
        }
    };

    const updateRecipientAddress = (index: number, address: string) => {
        const updated = [...recipients];
        updated[index].address = address;
        setRecipients(updated);
    };

    const updateRecipientAmount = (index: number, amount: number) => {
        const updated = [...recipients];
        updated[index].amount = amount;
        setRecipients(updated);
    };

    // Calculate amounts for display
    const validRecipients = recipients.filter((r: any) => r.address.trim() !== '');
    // CRITICAL: Round to 0.1 POL to prevent privacy leaks from unique amounts
    const equalAmount = validRecipients.length > 0 ? Math.floor((receiveAmount / validRecipients.length) * 10) / 10 : 0;

    // Check if equal split is valid (divisible by 0.1)
    const totalEqualSplit = equalAmount * validRecipients.length;
    const isEqualSplitValid = Math.abs(totalEqualSplit - receiveAmount) < 0.01;

    // Calculate allocated amount for custom mode
    const allocatedAmount = recipients.reduce((sum: number, r: any) => sum + (parseFloat(r.amount) || 0), 0);

    const updateRecipient = (index: number, field: 'address' | 'amount', value: any) => {
        const updated = [...recipients];
        if (field === 'address') {
            updated[index].address = value;
        } else if (field === 'amount') {
            updated[index].amount = parseFloat(value) || 0;
        }
        setRecipients(updated);
    };

    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.3 }}
            className="max-w-2xl mx-auto space-y-3 sm:space-y-5 pb-2 min-h-[500px]"
        >
            <div className="relative">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-2 sm:mb-4 gap-2 sm:gap-0">
                    <h2 className="text-xs sm:text-sm text-[#ff4500] font-bold flex items-center gap-2 uppercase tracking-widest">
                        <div className="w-1.5 h-1.5 bg-[#ff4500] rounded-full shadow-[0_0_10px_#ff4500]" />
                        Deposit Assets
                    </h2>

                    <div className="flex items-center bg-[#0a0a0a] border border-[#ff4500]/20 rounded-full p-1 my-2 sm:my-0">
                        <button
                            onClick={() => setSelectedAsset('NATIVE')}
                            className={cn(
                                "px-4 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-widest transition-all",
                                selectedAsset === 'NATIVE' ? "bg-[#ff4500] text-black shadow-[0_0_15px_rgba(255,69,0,0.4)]" : "text-gray-500 hover:text-[#ff4500]"
                            )}
                        >
                            Native
                        </button>
                        <button
                            onClick={() => setSelectedAsset('USDC')}
                            className={cn(
                                "px-4 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-widest transition-all",
                                selectedAsset === 'USDC' ? "bg-[#2775ca] text-white shadow-[0_0_15px_rgba(39,117,202,0.4)]" : "text-gray-500 hover:text-[#2775ca]"
                            )}
                        >
                            USDC
                        </button>
                    </div>

                    <div className="flex gap-2 w-full sm:w-auto">
                        {/* Network Selector */}
                        <div className="relative w-full sm:w-auto">
                            <button
                                onClick={() => setIsNetworkDropdownOpen(!isNetworkDropdownOpen)}
                                disabled={isSwitchingNetwork}
                                className="w-full sm:w-auto bg-[#0f0a0a] border border-[#ff4500]/30 px-3 py-1.5 sm:px-4 sm:py-2 pr-8 rounded-lg text-xs sm:text-sm text-[#ff4500] font-bold uppercase tracking-wider outline-none hover:border-[#ff4500] transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-between sm:justify-start gap-2"
                            >
                                {selectedNetwork.charAt(0).toUpperCase() + selectedNetwork.slice(1)}
                                <span className="ml-2 text-[10px]">{isNetworkDropdownOpen ? '▲' : '▼'}</span>
                            </button>

                            {/* Loading Spinner */}
                            {isSwitchingNetwork && (
                                <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none">
                                    <div className="w-4 h-4 border-2 border-[#ff4500]/30 border-t-[#ff4500] rounded-full animate-spin"></div>
                                </div>
                            )}

                            {/* Custom Dropdown Menu */}
                            {isNetworkDropdownOpen && (
                                <div className="absolute top-full right-0 mt-2 w-full sm:w-48 bg-[#0a0a0a] border border-[#ff4500]/30 rounded-lg overflow-hidden shadow-[0_0_30px_rgba(255,69,0,0.2)] z-50">
                                    <button
                                        onClick={() => { switchNetwork('ethereum'); setIsNetworkDropdownOpen(false); }}
                                        className="w-full px-4 py-2 sm:py-3 text-left text-xs sm:text-sm text-[#ff4500] hover:bg-[#ff4500]/10 transition-colors border-b border-[#ff4500]/10"
                                    >
                                        <span className="font-bold uppercase tracking-wider">Ethereum</span>
                                    </button>
                                    <button
                                        onClick={() => { switchNetwork('polygon'); setIsNetworkDropdownOpen(false); }}
                                        className="w-full px-4 py-2 sm:py-3 text-left text-xs sm:text-sm text-[#ff4500] hover:bg-[#ff4500]/10 transition-colors border-b border-[#ff4500]/10"
                                    >
                                        <span className="font-bold uppercase tracking-wider">Polygon</span>
                                    </button>
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            switchNetwork('solana');
                                            setIsNetworkDropdownOpen(false);
                                        }}
                                        className="w-full px-4 py-2 sm:py-3 text-left text-xs sm:text-sm text-[#ff4500] hover:bg-[#ff4500]/10 transition-colors"
                                    >
                                        <span className="font-bold uppercase tracking-wider">Solana</span>
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                <div className="space-y-3 sm:space-y-4">
                    <div className="group">
                        <label className="block text-[8px] sm:text-[9px] text-[#ff4500]/60 mb-1 uppercase tracking-[0.2em] font-bold ml-1 group-focus-within:text-[#ff4500] transition-colors">Amount to Receive</label>
                        <div className="relative transform transition-transform group-focus-within:scale-[1.01]">
                            <input
                                type="number"
                                step="0.1"
                                min="0.5"
                                value={amount}
                                onChange={e => setAmount(e.target.value)}
                                className="w-full bg-[#0f0a0a] border border-[#ff4500]/20 p-2 sm:p-3 rounded-lg text-base sm:text-lg text-white font-bold outline-none focus:border-[#ff4500] focus:shadow-[0_0_15px_rgba(255,69,0,0.1)] transition-all placeholder:text-[#ff4500]/20"
                                placeholder="0.0"
                            />
                            <div className="absolute right-3 top-1/2 -translate-y-1/2 px-1.5 py-0.5 bg-[#ff4500]/10 rounded border border-[#ff4500]/20 text-[#ff4500] font-bold text-[9px] sm:text-[10px] tracking-widest">
                                {currency}
                            </div>
                        </div>
                        <div className="text-[8px] sm:text-[9px] text-[#ff4500]/40 mt-1 ml-1 flex justify-between">
                            <span>This is the exact amount your receiver will get.</span>
                            {!isValidAmount && <span className="text-red-500 font-bold">Min 0.5 {currency} & Divisible by 0.1</span>}
                        </div>
                    </div>

                    <div className="bg-[#0f0a0a] border border-[#ff4500]/20 rounded-lg p-3 sm:p-4 space-y-3 sm:space-y-4">
                        <div className="flex justify-between items-center mb-1 sm:mb-2">
                            <label className="text-[8px] sm:text-[9px] text-[#ff4500]/60 uppercase tracking-[0.2em] font-bold">Recipients ({recipients.length}/10)</label>
                            {distributionMode === 'custom' && (
                                <span className={clsx(
                                    "text-[8px] sm:text-[9px] font-bold",
                                    allocatedAmount === receiveAmount ? "text-green-500" : "text-red-500"
                                )}>
                                    Allocated: {allocatedAmount.toFixed(1)} / {receiveAmount} {currency}
                                </span>
                            )}
                            <button
                                onClick={() => setDistributionMode(distributionMode === 'equal' ? 'custom' : 'equal')}
                                className="text-[8px] sm:text-[9px] px-1.5 py-0.5 border border-[#ff4500]/30 rounded bg-[#ff4500]/5 hover:bg-[#ff4500]/20 text-[#ff4500] transition-colors whitespace-nowrap"
                            >
                                {distributionMode === 'equal' ? 'Equal Split' : 'Custom Split'}
                            </button>
                        </div>

                        <div className="space-y-1.5 sm:space-y-2 max-h-40 overflow-y-auto custom-scrollbar pr-1">
                            {recipients.map((recipient: any, index: number) => (
                                <div key={index} className="flex gap-1.5 sm:gap-2 items-center group">
                                    <span className="text-[#ff4500]/40 font-mono text-[9px] w-3 mt-1.5">{index + 1}.</span>
                                    <input
                                        type="text"
                                        placeholder="Receiver Address"
                                        value={recipient.address}
                                        onChange={(e) => updateRecipient(index, 'address', e.target.value)}
                                        className="flex-1 bg-black/40 border border-[#ff4500]/10 rounded p-1.5 sm:p-2 text-[10px] sm:text-xs text-white placeholder:text-[#ff4500]/20 focus:border-[#ff4500]/50 outline-none transition-colors font-mono min-w-0"
                                    />
                                    {distributionMode === 'custom' ? (
                                        <input
                                            type="number"
                                            step="0.1"
                                            value={recipient.amount || ''}
                                            onChange={(e) => updateRecipient(index, 'amount', e.target.value)}
                                            className="w-12 sm:w-16 bg-black/40 border border-[#ff4500]/10 rounded p-1.5 sm:p-2 text-[10px] sm:text-xs text-white text-center focus:border-[#ff4500]/50 outline-none transition-colors"
                                            placeholder="0.0"
                                        />
                                    ) : (
                                        <div className="w-12 sm:w-16 px-1 py-1.5 sm:px-2 sm:py-2 bg-[#ff4500]/5 rounded border border-[#ff4500]/10 text-center flex items-center justify-center">
                                            <span className="text-[8px] sm:text-[9px] text-[#ff4500] font-bold truncate">
                                                {(receiveAmount / recipients.length).toFixed(1)} {currency}
                                            </span>
                                        </div>
                                    )}
                                    {recipients.length > 1 && (
                                        <button
                                            onClick={() => removeRecipient(index)}
                                            className="w-4 h-4 sm:w-5 sm:h-5 flex items-center justify-center text-[#ff4500]/40 hover:text-red-500 hover:bg-red-500/10 rounded transition-colors text-xs"
                                        >
                                            ✕
                                        </button>
                                    )}
                                </div>
                            ))}
                            {recipients.length < 10 && (
                                <button
                                    onClick={addRecipient}
                                    className="w-full py-1 text-[9px] sm:text-[10px] border border-dashed border-[#ff4500]/20 hover:border-[#ff4500]/40 text-[#ff4500]/60 hover:text-[#ff4500] rounded hover:bg-[#ff4500]/5 transition-all uppercase tracking-wider"
                                >
                                    + Add Recipient
                                </button>
                            )}
                        </div>
                        {/* Mixing Time */}
                        <div className="relative group flex items-center justify-between pt-3 border-t border-[#ff4500]/10">
                            <div className="text-[9px] text-[#ff4500]/60 uppercase tracking-[0.2em] font-bold">Mixing Time</div>
                            <div className="text-xs text-[#ff4500] font-bold">
                                {(() => {
                                    const HOPS = 5;
                                    const CYCLE_INTERVAL = 30; // seconds

                                    const wavesPerHop = Math.ceil(shards / shardsPerWave);
                                    const totalWaves = wavesPerHop * HOPS;
                                    const mixingTime = totalWaves * CYCLE_INTERVAL;

                                    // Add queue time
                                    const totalSeconds = queueTime + mixingTime;

                                    // Format as minutes or hours
                                    if (totalSeconds < 60) {
                                        return `${totalSeconds}s`;
                                    } else if (totalSeconds < 3600) {
                                        const minutes = Math.ceil(totalSeconds / 60);
                                        return `${minutes}m`;
                                    } else {
                                        const hours = (totalSeconds / 3600).toFixed(1);
                                        return `${hours}h`;
                                    }
                                })()}
                            </div>
                            {/* Tooltip with breakdown */}
                            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 bg-[#1a1a1a] border border-[#ff4500]/30 rounded-lg text-xs whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50">
                                {queueTime > 0 && (
                                    <div className="text-gray-400 mb-2">
                                        Queue: {queueTime < 60 ? `${queueTime}s` : `${Math.ceil(queueTime / 60)}m`}
                                    </div>
                                )}
                                <div className="text-gray-400 mb-1">Mixing:</div>
                                <div className="text-white">
                                    {(() => {
                                        const HOPS = 5;
                                        const CYCLE_INTERVAL = 30;
                                        const wavesPerHop = Math.ceil(shards / shardsPerWave);
                                        return `${wavesPerHop} wave${wavesPerHop > 1 ? 's' : ''} × ${HOPS} hops × ${CYCLE_INTERVAL}s`;
                                    })()}
                                </div>
                                <div className="text-[#ff4500] text-[10px] mt-2 border-t border-[#ff4500]/20 pt-2">
                                    <div className="text-gray-400 mb-1">Strategy</div>
                                    <div>Fisher–Yates + CSPRNG</div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
                {/* Summary Section - Compact Grid */}
                <div className="bg-[#1a0505] rounded-lg p-3 sm:p-4 border border-[#ff4500]/20">
                    <div className="flex flex-col sm:flex-row justify-between items-end mb-3 sm:mb-4 gap-3 sm:gap-0">
                        <div>
                            <div className="text-[8px] sm:text-[9px] text-[#ff4500]/60 uppercase tracking-widest mb-0.5">Total Payment</div>
                            <div className="text-lg sm:text-xl font-bold text-[#ff4500] leading-none">
                                {totalPayment.toFixed(4)} <span className="text-xs sm:text-sm">{currency}</span>
                            </div>
                            <div className="text-[8px] sm:text-[9px] text-[#ff4500]/40 mt-0.5">
                                ({shards} shards × 0.1 {currency} each)
                            </div>
                        </div>
                        <button
                            onClick={onDeposit}
                            disabled={!isValidAmount || processing || (distributionMode === 'custom' && allocatedAmount !== receiveAmount)}
                            className="w-full sm:w-auto bg-[#ff4500] text-black px-4 py-2 sm:px-6 sm:py-2 rounded font-bold uppercase tracking-wider hover:bg-[#ff5722] transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-[0_0_20px_rgba(255,69,0,0.3)] hover:shadow-[0_0_30px_rgba(255,69,0,0.5)] transform hover:scale-105 active:scale-95 text-[10px] sm:text-xs"
                        >
                            {processing ? (
                                <span className="flex items-center justify-center gap-2">
                                    <span className="w-3 h-3 border-2 border-black border-t-transparent rounded-full animate-spin" />
                                    Processing...
                                </span>
                            ) : (
                                <span>Pay {totalPayment.toFixed(4)} {currency} → Initiate Mix</span>
                            )}
                        </button>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2 border-t border-[#ff4500]/10">
                        <div>
                            <div className="text-[8px] text-[#ff4500]/40 uppercase tracking-wider mb-0.5">Protocol Fee</div>
                            <div className="text-[10px] sm:text-xs text-[#ff4500] font-bold">+{feeAmount.toFixed(4)} {currency}</div>
                        </div>
                        <div>
                            <div className="text-[8px] text-[#ff4500]/40 uppercase tracking-wider mb-0.5">ETA</div>
                            <div className="text-[10px] sm:text-xs text-[#ff4500] font-bold">
                                {Math.ceil(Number(amount || 0) * 15)}m
                            </div>
                        </div>
                        <div>
                            <div className="text-[8px] text-[#ff4500]/40 uppercase tracking-wider mb-0.5">Shards</div>
                            <div className="text-[10px] sm:text-xs text-[#ff4500] font-bold">{shards}</div>
                        </div>
                        <div>
                            <div className="text-[8px] text-[#ff4500]/40 uppercase tracking-wider mb-0.5">Strategy</div>
                            <div className="text-xs text-[#ff4500] font-bold">Fisher–Yates + CSPRNG</div>
                        </div>
                    </div>
                </div>
            </div>
        </motion.div>
    );
};

const MeshPanel = ({ satellites, onJoin, processing, queueTime, isSolana }: { satellites: number, onJoin: () => void, processing: boolean, queueTime?: number, isSolana: boolean }) => {
    // Dynamic APY Calculation based on "Demand" (Queue Time) and "Supply" (Satellites)
    const demandFactor = (queueTime || 0) * 0.005;
    const baseApy = 0.15;
    const dynamicApy = (baseApy + demandFactor).toFixed(2);

    return (
        <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.3 }}
            className="max-w-4xl mx-auto space-y-6 sm:space-y-10 pb-20 sm:pb-32"
        >
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
                <div className="p-6 sm:p-8 bg-[#0f0a0a] border border-[#ff4500]/20 rounded-xl flex flex-col items-center justify-center h-40 sm:h-48 group hover:border-[#ff4500] transition-all hover:shadow-[0_0_30px_rgba(255,69,0,0.15)] relative overflow-hidden">
                    <div className="absolute inset-0 bg-gradient-to-br from-[#ff4500]/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                    <div className="text-4xl sm:text-5xl font-black text-[#ff4500] mb-1 drop-shadow-[0_0_15px_rgba(255,69,0,0.5)] group-hover:scale-110 transition-transform duration-500">{satellites}</div>
                    <div className="text-[10px] sm:text-xs text-[#ff4500] uppercase tracking-[0.2em] font-bold">Active Nodes</div>
                </div>

                <div className="p-6 sm:p-8 bg-[#0f0a0a] border border-[#00ff9d]/20 rounded-xl flex flex-col items-center justify-center h-40 sm:h-48 group hover:border-[#00ff9d] transition-all hover:shadow-[0_0_30px_rgba(0,255,157,0.15)] relative overflow-hidden">
                    <div className="absolute inset-0 bg-gradient-to-br from-[#00ff9d]/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                    <div className="text-4xl sm:text-5xl font-black text-[#00ff9d] mb-1 drop-shadow-[0_0_15px_rgba(0,255,157,0.5)] group-hover:scale-110 transition-transform duration-500">∞</div>
                    <div className="text-[10px] sm:text-xs text-[#00ff9d] uppercase tracking-[0.2em] font-bold">Mesh APY Share</div>
                </div>
            </div>

            <div className="p-6 sm:p-8 bg-[#ff4500]/5 rounded-xl border border-[#ff4500]/20 text-center space-y-6 backdrop-blur-sm">
                <div className="max-w-lg mx-auto">
                    <h3 className="text-[#ff4500] font-bold uppercase tracking-widest mb-2 flex items-center justify-center gap-2 text-sm sm:text-base font-mono">
                        Become a Node
                    </h3>
                    <p className="text-gray-400 text-xs sm:text-[13px] leading-relaxed font-medium">
                        By joining the Mesh, your node becomes a trusted participant in the Lobster network.
                        Nodes participate in randomized mixing waves and earn a share of the protocol fees.
                    </p>
                </div>

                <div className="flex flex-col sm:flex-row gap-3 justify-center items-center max-w-lg mx-auto">
                    <a
                        href="/mesh"
                        className="w-full sm:w-40 py-2.5 sm:py-3.5 border-2 border-[#ff4500] text-[#ff4500] hover:bg-[#ff4500] hover:text-black uppercase tracking-[0.1em] font-black rounded-lg transition-all shadow-[0_0_15px_rgba(255,69,0,0.1)] hover:shadow-[0_0_30px_rgba(255,69,0,0.3)] text-center no-underline cursor-pointer text-[9px] sm:text-[10px] flex items-center justify-center leading-none px-3"
                    >
                        View Mesh<br />Network
                    </a>

                    {isSolana && (
                        <div className="w-full sm:w-52 relative group">
                            <button
                                className="w-full p-3.5 sm:p-4 bg-[#ff4500] text-black hover:bg-[#ff5722] rounded-lg transition-all shadow-[0_0_25px_rgba(255,69,0,0.4)] hover:shadow-[0_0_45px_rgba(255,69,0,0.6)] flex items-center justify-between gap-2 group"
                            >
                                <div className="text-left font-black uppercase tracking-[0.05em] text-[10px] sm:text-[11px] leading-none font-mono whitespace-nowrap">
                                    BUY SOULBOUND TOKEN
                                </div>

                                <div className="bg-black/10 px-1.5 py-1 rounded-md border border-black/5 flex items-center justify-center shrink-0">
                                    <span className="text-[10px] sm:text-[11px] font-black tracking-tight font-mono">$10</span>
                                </div>
                            </button>

                            {/* Tooltip */}
                            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-3 px-3 py-2 bg-[#0a0a0a] border border-[#ff4500]/40 rounded-lg text-center opacity-0 group-hover:opacity-100 transition-all duration-300 pointer-events-none z-50 min-w-[170px] shadow-[0_0_30px_rgba(0,0,0,0.9)] translate-y-2 group-hover:translate-y-0">
                                <div className="text-[9px] text-[#ff4500] font-bold uppercase tracking-wider leading-relaxed">
                                    SBT enables node creation<br />& earns rewards.
                                </div>
                                <div className="absolute top-full left-1/2 -translate-x-1/2 border-[6px] border-transparent border-t-[#ff4500]/40" />
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </motion.div>
    );
};
