// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/security/Pausable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";

interface ILobsterRewards {
    function depositReward(uint256 sessionId, address token, uint256 amount) external;
    function distribute(uint256 sessionId, address token, address[] calldata nodes, uint256[] calldata shares) external;
}

/**
 * @title LobsterMixer - Shard-Based 5-Hop Privacy Mixer
 * 
 * ARCHITECTURE:
 * - Deposits must be divisible by 0.1 POL (SHARD_SIZE)
 * - 5 POL deposit = 50 shards
 * - Nodes are divided into 5 GROUPS (A, B, C, D, E)
 * - Each cycle/wave processes a batch of shards through ALL 5 hops:
 *   
 *   DEPOSIT → [Group A] → [Group B] → [Group C] → [Group D] → [Group E] → RECIPIENT
 *             (Hop 1)     (Hop 2)     (Hop 3)     (Hop 4)     (Hop 5)
 * 
 * Example with 10 nodes:
 *   - 10 nodes / 5 groups = 2 nodes per group = 2 shards per cycle
 *   - Each cycle: 2 shards × 0.1 = 0.2 POL processed
 *   - 50 shards / 2 = 25 cycles to complete 5 POL
 * 
 * Example with 15 nodes:  
 *   - 15 nodes / 5 groups = 3 nodes per group = 3 shards per cycle
 *   - Each cycle: 3 shards × 0.1 = 0.3 POL processed
 *   - 50 shards / 3 = ~17 cycles to complete 5 POL
 * 
 * MORE NODES = FASTER MIXING! (Max 250 nodes)
 */
contract LobsterNode {
    address public mixer;
    constructor(address _mixer) { mixer = _mixer; }
    
    // Accept funds
    receive() external payable {}
    
    // Forward funds to next hop (Native)
    function hop(address to, uint256 amount) external {
        require(msg.sender == mixer, "Only mixer");
        (bool success, ) = payable(to).call{value: amount}("");
        require(success, "Hop failed");
    }

    // Forward funds to next hop (ERC20)
    function hopERC20(address token, address to, uint256 amount) external {
        require(msg.sender == mixer, "Only mixer");
        IERC20(token).transfer(to, amount);
    }
}

contract LobsterMixer is ReentrancyGuard, Pausable {

    struct Satellite {
        address addr;      // Address of the LobsterNode contract
        address owner;     // Owner (Operator) who deployed it
        bool isActive;
        uint256 totalEarnings;
        uint256 stakedAmount;
        uint256 sessionCount;
    }

    struct UnstakeRequest {
        uint256 satelliteIndex;
        uint256 amount;
        uint256 requestTime;
        bool completed;
    }

    // Storage
    Satellite[] public satellites;
    mapping(address => uint256) public satelliteIndices;
    mapping(uint256 => MixSession) public sessions;
    mapping(address => uint256[]) public userSessions;
    mapping(address => UnstakeRequest[]) public unstakeRequests;
    uint256 public sessionCount;

    // Constants
    uint256 public constant SHARD_SIZE = 0.1 ether;      // Each shard = 0.1 POL
    uint256 public constant MIN_DEPOSIT = 0.5 ether;     // Minimum 5 shards
    uint256 public constant CYCLE_INTERVAL = 30;         // 30 seconds between cycles
    uint256 public constant MESH_LIMIT = 250;            // Max satellites
    uint256 public constant DEPLOY_STAKE = 0;            // No stake required to deploy
    uint256 public constant UNSTAKE_DELAY = 7 days;
    uint256 public constant NUM_GROUPS = 5;              // A, B, C, D, E
    uint256 public constant HOPS_PER_CYCLE = 5;          // Each cycle = 5 hops
    
    // Fees
    address public creator;
    address public masterWallet;  // Configurable fee recipient
    address public rewardContract; // Temporary place for rewards
    uint256 public constant CREATOR_FEE_BPS = 25;        // 0.25%
    uint256 public constant MESH_FEE_BPS = 25;           // 0.25%
    
    // Security
    mapping(address => uint256) public lastDepositTime;
    uint256 public constant DEPOSIT_COOLDOWN = 60;       // 60 seconds between deposits
    uint256 public constant MAX_BATCH_SIZE = 100;        // Max sessions per batch

    event Deposit(uint256 indexed sessionId, address depositor, uint256 amount, uint256 shards, uint256 estimatedCycles);
    event SatelliteDeployed(address indexed satellite, uint256 index, uint256 stakedAmount);
    event StepCompleted(uint256 indexed sessionId, uint256 wave, uint256 step, string hopDescription, uint256 shardsInWave);
    event MixCompleted(uint256 indexed sessionId, address receiver, uint256 amount, uint256 totalWaves);
    event EarningsDistributed(uint256 indexed sessionId, uint256 totalAmount, uint256 perNode);
    event UnstakeRequested(address indexed owner, uint256 satelliteIndex, uint256 amount, uint256 unlockTime);
    event UnstakeCompleted(address indexed owner, uint256 satelliteIndex, uint256 amount);

    constructor() {
        creator = msg.sender;
        masterWallet = msg.sender; // Default to creator, can be changed
    }

    // Allow contract to receive funds from LobsterNodes (Hop E -> Mixer)
    receive() external payable {}

    modifier onlyCreator() {
        require(msg.sender == creator, "Not creator");
        _;
    }
    
    // ============ ADMIN FUNCTIONS ============
    
    function setMasterWallet(address payable _newWallet) external onlyCreator {
        require(_newWallet != address(0), "Invalid address");
        masterWallet = _newWallet;
    }

    function setRewardContract(address _newRewardContract) external onlyCreator {
        rewardContract = _newRewardContract;
    }
    
    function pause() external onlyCreator {
        _pause();
    }
    
    function unpause() external onlyCreator {
        _unpause();
    }

    // ============ DEPLOYMENT ============

    function deployLobster() external payable {
        // Stake is no longer required
        require(satellites.length < MESH_LIMIT, "Mesh full");
        
        // Deploy new LobsterNode contract
        LobsterNode newNode = new LobsterNode(address(this));

        // Forward Stake to the Node (Vault) so it's visible on-chain
        (bool forwarded, ) = payable(address(newNode)).call{value: msg.value}("");
        require(forwarded, "Stake forward failed");
        
        satellites.push(Satellite({
            addr: address(newNode),
            owner: msg.sender,
            isActive: true,
            totalEarnings: 0,
            stakedAmount: DEPLOY_STAKE,
            sessionCount: 0
        }));
        satelliteIndices[msg.sender] = satellites.length; // Index by OWNER
        emit SatelliteDeployed(address(newNode), satellites.length, DEPLOY_STAKE);
    }

    function joinMesh() external payable {
        // Stake is no longer required
        require(satellites.length < MESH_LIMIT, "Mesh full");
        
        // Deploy new LobsterNode contract
        LobsterNode newNode = new LobsterNode(address(this));

        // Forward Stake to the Node
        (bool forwarded, ) = payable(address(newNode)).call{value: msg.value}("");
        require(forwarded, "Stake forward failed");
        
        satellites.push(Satellite({
            addr: address(newNode),
            owner: msg.sender,
            isActive: true,
            totalEarnings: 0,
            stakedAmount: DEPLOY_STAKE,
            sessionCount: 0
        }));
        satelliteIndices[msg.sender] = satellites.length;
        emit SatelliteDeployed(address(newNode), satellites.length, DEPLOY_STAKE);
    }

    // ============ MIXING ============

    /// @notice Calculate shards processed per wave (nodes per group)
    function getShardsPerCycle() public view returns (uint256) {
        uint256 activeCount = getActiveNodeCount();
        if (activeCount < NUM_GROUPS) return 1;
        // Round down to nearest multiple of 5
        uint256 usableNodes = activeCount - (activeCount % NUM_GROUPS);
        return usableNodes / NUM_GROUPS;
    }

    struct MixSession {
        uint256 id;
        address depositor;
        address receiver;
        uint256 totalAmount;
        uint256 totalShards;
        uint256 shardsPerWave;      // Shards processed per wave
        uint256 currentWave;         // Current wave number (1-indexed)
        uint256 currentStep;         // Current step in wave (0-6)
        uint256 totalWaves;          // Total waves needed
        uint256[] assignedNodeIndices; // Selected nodes for this session
        uint256 startTime;
        uint256 lastPulseTime;
        address token;               // address(0) for Native, else ERC20
        bool completed;
    }

    // ... (Existing struct Satellite etc)


    function getActiveNodeCount() public view returns (uint256) {
        uint256 count = 0;
        for (uint i = 0; i < satellites.length; i++) {
            if (satellites[i].isActive) count++;
        }
        return count;
    }

    /// @notice Deposit funds to start a mixing session
    function deposit(uint256 _mixAmount, address _receiver, bytes32 _entropy) external payable whenNotPaused nonReentrant {
        // Input validation (H1)
        require(_receiver != address(0), "Invalid receiver");
        require(_receiver != address(this), "Cannot send to mixer");
        
        // Rate limiting (C6)
        require(block.timestamp >= lastDepositTime[msg.sender] + DEPOSIT_COOLDOWN, "Cooldown active");
        lastDepositTime[msg.sender] = block.timestamp;
        
        require(_mixAmount >= MIN_DEPOSIT, "Minimum 0.5 POL mix amount");
        require(_mixAmount % SHARD_SIZE == 0, "Mix amount must be divisible by 0.1 POL");
        
        // Fee is 0.5% (50 BPS)
        uint256 requiredFee = (_mixAmount * 50) / 10000;
        require(msg.value >= _mixAmount + requiredFee, "Insufficient fee sent");
        
        uint256 feeReceived = msg.value - _mixAmount;
        uint256 masterFee = feeReceived / 2;
        uint256 rewardFee = feeReceived - masterFee;
        
        // Split fee between Master Wallet and Reward Contract
        if (masterFee > 0) {
            (bool s1, ) = payable(masterWallet).call{value: masterFee}("");
            require(s1, "Master fee failed");
        }
        if (rewardFee > 0 && rewardContract != address(0)) {
            (bool s2, ) = payable(rewardContract).call{value: rewardFee}("");
            require(s2, "Reward fee failed");
            ILobsterRewards(rewardContract).depositReward(sessionCount + 1, address(0), rewardFee);
        }
        
        uint256 activeCount = getActiveNodeCount();
        require(activeCount >= NUM_GROUPS, "Need at least 5 active nodes");
        
        uint256 shards = _mixAmount / SHARD_SIZE;

        // Calculate shards per wave and total waves
        uint256 selectedCount = activeCount - (activeCount % NUM_GROUPS);
        uint256[] memory selectedNodes = selectRandomNodes(selectedCount, _entropy);
        uint256 shardsPerWave = selectedCount / NUM_GROUPS;
        uint256 totalWaves = (shards + shardsPerWave - 1) / shardsPerWave;

        // Create Session
        sessionCount++;
        
        MixSession storage s = sessions[sessionCount];
        s.id = sessionCount;
        s.depositor = msg.sender;
        s.receiver = _receiver;
        s.totalAmount = _mixAmount;
        s.totalShards = shards;
        s.shardsPerWave = shardsPerWave;
        s.currentWave = 1;
        s.currentStep = 0;
        s.totalWaves = totalWaves;
        s.assignedNodeIndices = selectedNodes;
        s.startTime = block.timestamp;
        s.lastPulseTime = block.timestamp;
        s.token = address(0);
        s.completed = false;
        
        userSessions[msg.sender].push(sessionCount);
        
        emit Deposit(sessionCount, msg.sender, _mixAmount, shards, totalWaves * 6);
    }

    /// @notice Deposit ERC20 funds (like USDC) to start a mixing session
    function depositERC20(address _token, uint256 _mixAmount, address _receiver, bytes32 _entropy) external whenNotPaused nonReentrant {
        require(_token != address(0), "Invalid token");
        require(_receiver != address(0), "Invalid receiver");
        
        // Rate limiting
        require(block.timestamp >= lastDepositTime[msg.sender] + DEPOSIT_COOLDOWN, "Cooldown active");
        lastDepositTime[msg.sender] = block.timestamp;
        
        uint256 activeCount = getActiveNodeCount();
        require(activeCount >= NUM_GROUPS, "Need at least 5 active nodes");

        // Fee is 0.5% (50 BPS)
        uint256 requiredFee = (_mixAmount * 50) / 10000;

        // Transfer tokens from sender to mixer (Mix Amount + Fee)
        IERC20(_token).transferFrom(msg.sender, address(this), _mixAmount + requiredFee);
        
        uint256 masterFee = requiredFee / 2;
        uint256 rewardFee = requiredFee - masterFee;
        
        if (masterFee > 0) {
            IERC20(_token).transfer(masterWallet, masterFee);
        }
        if (rewardFee > 0 && rewardContract != address(0)) {
            IERC20(_token).transfer(rewardContract, rewardFee);
            ILobsterRewards(rewardContract).depositReward(sessionCount + 1, _token, rewardFee);
        }
        
        uint256 netAmount = _mixAmount;
        
        // Dynamic shard scaling: shard must be 0.1 units (e.g., 100,000 for USDC)
        uint8 decimals = IERC20Metadata(_token).decimals();
        uint256 shardSize = 10 ** (decimals - 1); 
        require(_mixAmount % shardSize == 0, "Amount must be divisible by 0.1 units");
        uint256 shards = _mixAmount / shardSize;
        
        uint256 selectedCount = activeCount - (activeCount % NUM_GROUPS);
        uint256[] memory selectedNodes = selectRandomNodes(selectedCount, _entropy);
        uint256 shardsPerWave = selectedCount / NUM_GROUPS;
        uint256 totalWaves = (shards + shardsPerWave - 1) / shardsPerWave;

        sessionCount++;
        MixSession storage s = sessions[sessionCount];
        s.id = sessionCount;
        s.depositor = msg.sender;
        s.receiver = _receiver;
        s.totalAmount = netAmount;
        s.totalShards = shards;
        s.shardsPerWave = shardsPerWave;
        s.currentWave = 1;
        s.currentStep = 0;
        s.totalWaves = totalWaves;
        s.assignedNodeIndices = selectedNodes;
        s.startTime = block.timestamp;
        s.lastPulseTime = block.timestamp;
        s.token = _token;
        s.completed = false;
        
        userSessions[msg.sender].push(sessionCount);
        emit Deposit(sessionCount, msg.sender, netAmount, shards, totalWaves * 6);
    }
    
    /// @notice Pulse a single session (public wrapper)
    function pulse(uint256 sessionId) external nonReentrant {
        _pulseSession(sessionId);
    }
    
    /// @notice Pulse multiple sessions in one transaction for privacy (M2 - batch limit)
    function pulseBatch(uint256[] calldata sessionIds) external nonReentrant {
        require(sessionIds.length <= MAX_BATCH_SIZE, "Batch too large");
        for (uint i = 0; i < sessionIds.length; i++) {
            _pulseSession(sessionIds[i]);
        }
    }
    
    /// @notice Internal pulse logic
    function _pulseSession(uint256 sessionId) internal {
        MixSession storage session = sessions[sessionId];
        require(!session.completed, "Mix finished");
        require(block.timestamp >= session.lastPulseTime + CYCLE_INTERVAL, "Cooldown active");
        
        uint256 nodeCount = session.assignedNodeIndices.length;
        uint256 nodesPerGroup = nodeCount / NUM_GROUPS;
        
        // Calculate shards in current wave
        uint256 shardsProcessed = (session.currentWave - 1) * session.shardsPerWave;
        uint256 shardsRemaining = session.totalShards - shardsProcessed;
        uint256 shardsInThisWave = shardsRemaining > session.shardsPerWave ? session.shardsPerWave : shardsRemaining;
        
        // Shard value calculation
        uint256 shardValue = session.token == address(0) 
            ? SHARD_SIZE 
            : (session.totalAmount / session.totalShards);

        string memory hopDesc;
        
        if (session.currentStep == 0) {
            // Step 0→1: Mixer → Group A
            hopDesc = "Mixer->A";
            address[] memory groupA = getGroupAddresses(sessionId, 0);
            for (uint i = 0; i < shardsInThisWave; i++) {
                if (session.token == address(0)) {
                    (bool success, ) = payable(groupA[i % nodesPerGroup]).call{value: shardValue}("");
                    require(success, "Mixer->A failed");
                } else {
                    IERC20(session.token).transfer(groupA[i % nodesPerGroup], shardValue);
                }
            }
            session.currentStep = 1;
            
        } else if (session.currentStep == 1) {
            // Step 1→2: Group A → Group B
            hopDesc = "A->B";
            address[] memory groupA = getGroupAddresses(sessionId, 0);
            address[] memory groupB = getGroupAddresses(sessionId, 1);
            for (uint i = 0; i < shardsInThisWave; i++) {
                if (session.token == address(0)) {
                    LobsterNode(payable(groupA[i % nodesPerGroup])).hop(groupB[i % nodesPerGroup], shardValue);
                } else {
                    LobsterNode(payable(groupA[i % nodesPerGroup])).hopERC20(session.token, groupB[i % nodesPerGroup], shardValue);
                }
            }
            session.currentStep = 2;
            
        } else if (session.currentStep == 2) {
            // Step 2→3: Group B → Group C
            hopDesc = "B->C";
            address[] memory groupB = getGroupAddresses(sessionId, 1);
            address[] memory groupC = getGroupAddresses(sessionId, 2);
            for (uint i = 0; i < shardsInThisWave; i++) {
                if (session.token == address(0)) {
                    LobsterNode(payable(groupB[i % nodesPerGroup])).hop(groupC[i % nodesPerGroup], shardValue);
                } else {
                    LobsterNode(payable(groupB[i % nodesPerGroup])).hopERC20(session.token, groupC[i % nodesPerGroup], shardValue);
                }
            }
            session.currentStep = 3;
            
        } else if (session.currentStep == 3) {
            // Step 3→4: Group C → Group D
            hopDesc = "C->D";
            address[] memory groupC = getGroupAddresses(sessionId, 2);
            address[] memory groupD = getGroupAddresses(sessionId, 3);
            for (uint i = 0; i < shardsInThisWave; i++) {
                if (session.token == address(0)) {
                    LobsterNode(payable(groupC[i % nodesPerGroup])).hop(groupD[i % nodesPerGroup], shardValue);
                } else {
                    LobsterNode(payable(groupC[i % nodesPerGroup])).hopERC20(session.token, groupD[i % nodesPerGroup], shardValue);
                }
            }
            session.currentStep = 4;
            
        } else if (session.currentStep == 4) {
            // Step 4→5: Group D → Group E
            hopDesc = "D->E";
            address[] memory groupD = getGroupAddresses(sessionId, 3);
            address[] memory groupE = getGroupAddresses(sessionId, 4);
            for (uint i = 0; i < shardsInThisWave; i++) {
                if (session.token == address(0)) {
                    LobsterNode(payable(groupD[i % nodesPerGroup])).hop(groupE[i % nodesPerGroup], shardValue);
                } else {
                    LobsterNode(payable(groupD[i % nodesPerGroup])).hopERC20(session.token, groupE[i % nodesPerGroup], shardValue);
                }
            }
            session.currentStep = 5;
            
        } else if (session.currentStep == 5) {
            // Step 5→6: Group E → Recipient
            hopDesc = "E->Recipient";
            address[] memory groupE = getGroupAddresses(sessionId, 4);
            for (uint i = 0; i < shardsInThisWave; i++) {
                if (session.token == address(0)) {
                    LobsterNode(payable(groupE[i % nodesPerGroup])).hop(session.receiver, shardValue);
                } else {
                    LobsterNode(payable(groupE[i % nodesPerGroup])).hopERC20(session.token, session.receiver, shardValue);
                }
            }
            session.currentStep = 6;
            
        } else if (session.currentStep == 6) {
            // Wave complete, move to next wave
            session.currentWave++;
            session.currentStep = 0;
            
            if (session.currentWave > session.totalWaves) {
                session.completed = true;
                distributeEarnings(sessionId);
                emit MixCompleted(sessionId, session.receiver, session.totalAmount, session.currentWave - 1);
                return;
            }
            hopDesc = "Wave Complete";
        }
        
        session.lastPulseTime = block.timestamp;
        emit StepCompleted(sessionId, session.currentWave, session.currentStep, hopDesc, shardsInThisWave);
    }
    
    /// @notice Select random nodes using Fisher-Yates shuffle with external entropy
    function selectRandomNodes(uint256 count, bytes32 _entropy) internal view returns (uint256[] memory) {
        uint256[] memory activeIndices = new uint256[](satellites.length);
        uint256 activeCount = 0;
        
        for (uint i = 0; i < satellites.length; i++) {
            if (satellites[i].isActive) {
                activeIndices[activeCount] = i;
                activeCount++;
            }
        }
        
        require(activeCount >= count, "Not enough active nodes");
        
        uint256[] memory selected = new uint256[](count);
        for (uint i = 0; i < count; i++) {
            // C3: Improved randomness using blockhash + msg.sender
            // NOTE: For production, consider using Chainlink VRF for true randomness
            uint256 randomIndex = uint256(keccak256(abi.encodePacked(
                blockhash(block.number - 1),  // Recent blockhash (harder to manipulate)
                msg.sender,                    // Depositor address (unpredictable)
                _entropy,                      // Client-side CSPRNG entropy
                i
            ))) % (activeCount - i);
            
            selected[i] = activeIndices[randomIndex];
            activeIndices[randomIndex] = activeIndices[activeCount - i - 1];
        }
        
        return selected;
    }

    /// @notice Get addresses for a specific group (0-4 = A-E)
    function getGroupAddresses(uint256 sessionId, uint256 groupIdx) internal view returns (address[] memory) {
        MixSession storage session = sessions[sessionId];
        uint256 nodesPerGroup = session.assignedNodeIndices.length / NUM_GROUPS;
        address[] memory addrs = new address[](nodesPerGroup);
        
        uint256 startIdx = groupIdx * nodesPerGroup;
        for (uint i = 0; i < nodesPerGroup; i++) {
            uint256 nodeIdx = session.assignedNodeIndices[startIdx + i];
            if (nodeIdx < satellites.length) {
                addrs[i] = satellites[nodeIdx].addr;
            }
        }
        return addrs;
    }
    
    function pickRandomPathGlobal(uint256 seed) internal view returns (address[] memory) {
         address[] memory path = new address[](5);
         // Get all active indices
         uint256[] memory activeIndices = new uint256[](satellites.length);
         uint256 count = 0;
         for(uint i=0; i<satellites.length; i++) {
             if(satellites[i].isActive) {
                 activeIndices[count] = i;
                 count++;
             }
         }
         
         require(count >= 5, "Not enough nodes");
         
         // Shuffle/Select 5
         for(uint i=0; i<5; i++) {
             uint256 r = uint256(keccak256(abi.encodePacked(seed, i))) % count;
             path[i] = satellites[activeIndices[r]].addr;
             
             // Swap pop
             activeIndices[r] = activeIndices[count-1];
             count--;
         }
         return path;
    }

    /// @notice Distribute mesh fee to participating nodes
    function distributeEarnings(uint256 sessionId) internal {
        if (rewardContract == address(0)) return;
        
        MixSession storage s = sessions[sessionId];
        uint256 totalNodes = s.assignedNodeIndices.length;
        address[] memory nodeAddresses = new address[](totalNodes);
        uint256[] memory shares = new uint256[](totalNodes);
        
        uint256 nodesPerGroup = totalNodes / NUM_GROUPS;
        uint256 rem = s.totalShards % s.shardsPerWave;
        if (rem == 0) rem = s.shardsPerWave;
        
        for (uint i = 0; i < totalNodes; i++) {
            uint256 nodeIdx = s.assignedNodeIndices[i];
            nodeAddresses[i] = satellites[nodeIdx].addr;
            
            uint256 posInGroup = i % nodesPerGroup;
            if (posInGroup < rem) {
                shares[i] = s.totalWaves;
            } else {
                shares[i] = s.totalWaves - 1;
            }
        }
        
        try ILobsterRewards(rewardContract).distribute(sessionId, s.token, nodeAddresses, shares) {} catch {}
    }

    // ============ VIEW FUNCTIONS ============

    function getSatellitesCount() external view returns (uint256) {
        return satellites.length;
    }

    function getSessionProgress(uint256 sessionId) external view returns (
        uint256 totalShards,
        uint256 shardsProcessed,
        uint256 cyclesCompleted,
        uint256 cyclesRemaining,
        uint256 shardsPerCycle,
        bool completed
    ) {
        MixSession storage s = sessions[sessionId];
        
        // Calculate progress based on waves and steps
        shardsProcessed = (s.currentWave - 1) * s.shardsPerWave;
        if (s.currentStep == 6) {
            shardsProcessed += s.shardsPerWave; // Current wave completed
        }
        
        uint256 stepsCompleted = (s.currentWave - 1) * 6 + s.currentStep;
        uint256 totalSteps = s.totalWaves * 6;
        uint256 stepsRemaining = totalSteps > stepsCompleted ? totalSteps - stepsCompleted : 0;
        
        return (s.totalShards, shardsProcessed, stepsCompleted, stepsRemaining, s.shardsPerWave, s.completed);
    }

    function getSessionDetails(uint256 sessionId) external view returns (
        uint256 id,
        address depositor,
        address receiver,
        uint256 totalAmount,
        uint256 totalShards,
        uint256 currentWave,
        uint256 currentStep,
        address token,
        bool completed
    ) {
        MixSession storage s = sessions[sessionId];
        return (s.id, s.depositor, s.receiver, s.totalAmount, s.totalShards, s.currentWave, s.currentStep, s.token, s.completed);
    }

    function getUserSessions(address user) external view returns (uint256[] memory) {
        return userSessions[user];
    }

    function getEstimatedCycles(uint256 amount) external view returns (uint256) {
        require(amount >= MIN_DEPOSIT, "Amount too small");
        require(amount % SHARD_SIZE == 0, "Must be divisible by 0.1 POL");
        
        uint256 shards = amount / SHARD_SIZE;
        uint256 shardsPerCycle = getShardsPerCycle();
        
        return (shards + shardsPerCycle - 1) / shardsPerCycle;
    }

    // ============ UNSTAKING ============

    function requestUnstake(uint256 satelliteIndex) external {
        require(satelliteIndex < satellites.length, "Invalid index");
        Satellite storage sat = satellites[satelliteIndex];
        require(sat.owner == msg.sender, "Not your lobster");
        require(sat.isActive, "Already unstaking");
        require(sat.stakedAmount > 0, "Nothing staked");
        
        sat.isActive = false;
        
        unstakeRequests[msg.sender].push(UnstakeRequest({
            satelliteIndex: satelliteIndex,
            amount: sat.stakedAmount,
            requestTime: block.timestamp,
            completed: false
        }));
        
        emit UnstakeRequested(msg.sender, satelliteIndex, sat.stakedAmount, block.timestamp + UNSTAKE_DELAY);
    }

    function completeUnstake(uint256 requestIndex) external {
        require(requestIndex < unstakeRequests[msg.sender].length, "Invalid request");
        UnstakeRequest storage req = unstakeRequests[msg.sender][requestIndex];
        require(!req.completed, "Already completed");
        require(block.timestamp >= req.requestTime + UNSTAKE_DELAY, "Still waiting");
        
        req.completed = true;
        
        Satellite storage sat = satellites[req.satelliteIndex];
        uint256 amount = sat.stakedAmount;
        sat.stakedAmount = 0;
        
        // Withdraw ALL funds from the Node (Vault) to the Owner
        address nodeAddr = sat.addr;
        uint256 nodeBalance = nodeAddr.balance;
        
        // 1. Node hops funds to Owner directly
        // Note: LobsterNode.hop works for any recipient
        LobsterNode(payable(nodeAddr)).hop(msg.sender, nodeBalance);
        
        emit UnstakeCompleted(msg.sender, req.satelliteIndex, nodeBalance);
    }

    function getUnstakeRequests(address user) external view returns (UnstakeRequest[] memory) {
        return unstakeRequests[user];
    }

    // ============ EMERGENCY ============

    function emergencyWithdraw() external onlyCreator {
        uint256 totalStaked = 0;
        for (uint i = 0; i < satellites.length; i++) {
            totalStaked += satellites[i].stakedAmount;
        }
        
        uint256 withdrawable = address(this).balance - totalStaked;
        require(withdrawable > 0, "No withdrawable funds");
        payable(creator).transfer(withdrawable);
    }
}
