# Lobster Mix 🦞
> **The Autonomous Privacy Mesh for AI Agents.**

<div align="center">

[![USDC Hackathon](https://img.shields.io/badge/Hackathon-USDC%20Agents-blue?style=for-the-badge)](https://moltbook.com/m/usdc)
[![Track](https://img.shields.io/badge/Track-Best%20OpenClaw%20Skill-green?style=for-the-badge)]()
[![Network](https://img.shields.io/badge/Network-Polygon%20Amoy-purple?style=for-the-badge)]()
[![Security](https://img.shields.io/badge/Security-Fisher--Yates%20+%20CSPRNG-green?style=for-the-badge)]()

</div>

**Lobster Mix** is a decentralized privacy protocol built to break the on-chain transaction graph for AI Agents. It enables autonomous entities and human users to conduct commerce using USDC and Native assets without exposing their identity, using a decentralized mesh of relay nodes.

---

### 🤖 Agent Command (Telegram/Terminal)
Once the skill is installed, you can simply say:

> **"TEST MIX 1 USDC POLYGON TO 0x93DF27665990aB68e9fc5CB7B7b6602F6757d3fA"**

The agent will:
1. Parse the amount (`1 USDC`) and chain (`POLYGON`).
2. Call the `LobsterMixer` contract.
3. Return the transaction hash.

## 🌪️ How It Works (Technical Deep Dive)

Lobster Mix operates as a **Multi-Hop Pulse Mesh**.

### 1. The Mixer (Core Contract)
The `LobsterMixerV2` contract acts as the protocol gateway.
- **Deposit**: Users deposit funds (USDC/POL) into the anonymity set.
- **Pulse Engine**: The contract uses a **cryptographic pulse** to select a unique path through the mesh.
- **Sharding**: Funds are split into uniform "shards" (e.g., 0.1 USDC) to prevent amount-based tracking.

### 2. The Nodes (Relay Network)
Satellite Nodes (`LobsterNodeV2`) are independent smart contracts deployed by the community.
- **5-Hop Randomization**: Funds bounce through 5 distinct node groups (A → B → C → D → E).
- **Temporal Delays**: Each hop introduces a randomized time delay, defeating timestamp analysis.
- **Incentives**: Node operators earn fees for relaying pulses.

### 3. Security: Fisher-Yates + CSPRNG
We implement a **Fisher-Yates Shuffle** powered by a **CSPRNG (Cryptographically Secure Pseudo-Random Number Generator)** to ensure path unpredictability.
- **Entropy**: High-entropy markers (block difficulty, user seeds) seed the RNG.
- **Collusion Resistance**: Randomized paths change every session, making it statistically impossible for an attacker to compromise a full transaction trace even if they control multiple nodes.

---

## 🎮 How to Use: User Guide

### Method A: Web Interface (GUI)
For human users wanting to mix funds manually.

1.  **Connect Wallet**
    - Go to `http://localhost:4321` (or your deployed URL).
    - Click **"Connect Wallet"** (Supports MetaMask, Rabby, etc.).
    - Ensure you are on **Polygon Amoy**.

2.  **Deposit Funds**
    - Select **Token**: Choose `USDC` or `POL`.
    - Enter **Amount**: e.g., `10` USDC.
    - Enter **Receiver**: The destination address (do not use your deposit wallet!).
    - Click **"START MIX"**.

3.  **Track Progress**
    - Watch the **Live Mesh Visualizer** as your shards pulse through the network nodes.
    - Status will update from `Mixing` → `Completed`.

### Method B: AI Agent (Autonomous)
For AI Agents using **OpenClaw**. The Agent can perform these actions using natural language.

1.  **Install Skill**
    - Ensure the `lobster-mix` skill is loaded in `~/.openclaw/skills`.

2.  **Natural Language Commands**
    - **Mix Funds**:
      > "SEND 1 USDC TO 0x1234..."
      > "MIX 5 POL TO 0xabcd..."
    - **Check Status**:
      > "Check mixer status"
    - **Get Balance**:
      > "What is my balance?"

3.  **Agent Logic**
    - The Agent parses your intent using the LLM.
    - It cryptographically signs the transaction via the local API.
    - It monitors the backend for confirmation and reports back the TX Hash.

---

## 📄 Verified Contracts (Polygon Amoy)

| Contract | Address | Explorer |
|----------|---------|----------|
| **LobsterMixerV2** | `0x70Da0050Ac783967cB21e4b53311B4060279a76B` | [Verified Code](https://repo.sourcify.dev/80002/0x70Da0050Ac783967cB21e4b53311B4060279a76B) |
| **LobsterRewards** | `0x0451b93858Db88f838D405Da7d5cd4A230bd0B06` | [View Contract](https://amoy.polygonscan.com/address/0x0451b93858Db88f838D405Da7d5cd4A230bd0B06) |
| **USDC (Amoy)** | `0x41E94Eb019C0762f9Bfcf9Fb1E58725BfB0e7582` | [View Token](https://amoy.polygonscan.com/token/0x41E94Eb019C0762f9Bfcf9Fb1E58725BfB0e7582) |

---

## 🗺️ Roadmap: Decentralization

Currently, the **Orchestrator** (the service that triggers the pulses) is a centralized Node.js service for the Hackathon MVP.

**Future Architecture:**
- **Phase 2**: Migrate Orchestrator to **ICP Canister** (Internet Computer) for decentralized computation.
- **Phase 3**: Implement **Oasis ROFL** (Runtime on Off-Chain Logic) for TEE-secured private transaction ordering.
- **Goal**: Fully untrusted, unstoppable privacy mesh.

---

## 🛠️ Installation

### Option A: NPM (CLI Tool)
Perfect for Agents or quick interaction.
```bash
npm install -g lobster-mix
lobster help
```

### Option B: Developers (Source)
To run the full stack locally.

```bash
# 1. Clone
git clone https://github.com/0xrlawrence/lobster-mixer
cd lobster-mix

# 2. Configure .env
cp .env.example .env
# Add PRIVATE_KEY and AMOY_RPC_URL

# 3. Operations
npm run dev     # Start local UI/API
npm run deploy  # Deploy contracts (Hardhat)
```

---

## ⚠️ Disclaimer
**TESTNET ONLY.** This project is deployed on **Polygon Amoy**.
Do not use Mainnet private keys. Do not send real funds.
This software is provided "AS IS" for the USDC Hackathon.
