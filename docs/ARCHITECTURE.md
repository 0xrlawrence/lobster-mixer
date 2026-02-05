# Lobster Mix Architecture 🦞

## Overview
Lobster Mix differs from traditional mixers (like Tornado Cash) which use Merkle Trees and ZK-SNARKs for *deposit/withdraw* anonymity. Instead, Lobster Mix uses a **Mesh Network of Relay Nodes** ("Lobster Pots") to physically fragment and shuffle assets across multiple hops.

## Core Components

### 1. Lobster Mixer (Orchestrator Contract)
The brain of the operation.
- **Session Management**: Tracks each mixing request (`MixSession`).
- **Pathfinding**: Selects random subsets of active nodes (`Satellites`) to form a mixing path.
- **Pulse Mechanism**: Using `Chainlink Keepers` or an off-chain Orchestrator, the contract "pulses" batches of transactions, moving funds one step further in the mesh (e.g., A -> B -> C).

### 2. Lobster Nodes (Satellites)
Lightweight smart wallet contracts deployed by community members.
- **Function**: They receive funds and simple "hop" instructions from the Mixer.
- **Features**:
    - `hop(address to, uint256 amount)`: Moves Native POL.
    - `hopERC20(...)`: Moves USDC/Tokens.
- **Incentive**: Node operators earn a cut of the mixing fees for providing anonymity set.

## Privacy Mechanism (The "Sharding")
When a user deposits **100 USDC**:
1. It is split into **1000 shards** of 0.1 USDC.
2. These shards are distributed to **5 Entry Nodes** (Group A).
3. Over time (waves), shards move from Group A -> B -> C -> D -> E.
4. At each step, shards from *other* users are mixed in the same nodes.
5. Finally, Group E exits the funds to the Receiver.

This creates a probabilistic privacy graph that is computationally expensive to de-anonymize.

## V2 Upgrade
The V2 contracts (deployed for Hackathon) introduce:
- **ERC20 Support**: Native `IERC20` handling for USDC.
- **Gas Optimization**: Batching updates to reduce `pulse` costs.
- **Agent API**: A dedicated HTTP gateway for AI agents to submit proof-of-intent without managing complex wallet states directly.
