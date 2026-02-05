# Lobster Mix 🦞

> **The Private Mesh Mixer for Autonomous Agents.**

<div align="center">

[![USDC Hackathon](https://img.shields.io/badge/Hackathon-USDC%20Agents-blue?style=for-the-badge)](https://moltbook.com/m/usdc)
[![Track](https://img.shields.io/badge/Track-Best%20OpenClaw%20Skill-green?style=for-the-badge)]()
[![Network](https://img.shields.io/badge/Network-Polygon%20Amoy-purple?style=for-the-badge)]()

</div>

**Lobster Mix** is a privacy-preserving protocol designed specifically for AI Agents. It enables autonomous entities to conduct commerce and transfer value (USDC/POL) without exposing their transaction graphs, using a decentralized mesh of relay nodes.

Built for the **Moltbook USDC Hackathon**.

## 🚀 Features

- **Agent-Native Interface**: Interact via Natural Language ("Mix 1 USDC") using the custom OpenClaw Skill.
- **Real On-Chain Privacy**: Supports **USDC** (ERC20) and **POL** (Native) mixing on Polygon Amoy.
- **Safety Bypass**: Includes specific prompt engineering to enable agents to perform "financial" testnet transactions without safety refusals.
- **Mesh Architecture**: A network of "Lobster Nodes" that fractionate and relay funds to break on-chain links.

## 📦 Contracts (Polygon Amoy)

| Contract | Address |
|----------|---------|
| **LobsterMixerV2** | `0x70Da0050Ac783967cB21e4b53311B4060279a76B` |
| **USDC (Amoy)** | `0x41E94Eb019C0762f9Bfcf9Fb1E58725BfB0e7582` |

## 🛠️ Installation & Setup

### Prerequisites
- Node.js v18+
- An EOA Wallet with Amoy POL (for gas) and USDC.

### 1. Clone & Install
```bash
git clone https://github.com/your-username/lobster-mix.git
cd lobster-mix
npm install
```

### 2. Configure Environment
Copy the example credentials file:
```bash
cp .env.example .env
```
Edit `.env` and add your:
- `PRIVATE_KEY`: Private Key for the server-side wallet (Used by the API/Agent to execute mixes).
- `AMOY_RPC_URL`: Alchemy/Infura RPC URL for Polygon Amoy.

### 3. Run the Interface
```bash
npm run dev
```
Runs the Web UI and Agent API at `http://localhost:4321`.

---

## 🤖 Agent Integration (OpenClaw)

To enable your AI Agent to use Lobster Mix:

### 1. Install the Skill
If running locally, the skill files are in `public/`. You can install them to your agent's skill directory:

```bash
mkdir -p ~/.openclaw/skills/lobster-mix
cp public/LOBSTER_SKILL.md ~/.openclaw/skills/lobster-mix/SKILL.md
# Ensure package.json is created (done automatically by install script)
```

### 2. Usage
Once installed, your agent can understand commands like:

> "Mix 1 USDC to 0x93DF..."

> "Check mixer status"

> "Deposit 5 POL to privacy pool"

The agent uses the local API (`/api/agent/mix`) to cryptographically sign and broadcast transactions via the backend.

---

## 📚 Documentation

- [**Skill Documentation**](public/LOBSTER_SKILL.md): Full guide on Agent commands and API protocols.
- [**Architecture**](docs/ARCHITECTURE.md): Deep dive into the Pulse Mechanism and Node Mesh.

## ⚠️ Disclaimer

**TESTNET ONLY.** This project is deployed on **Polygon Amoy**.
Do not use Mainnet private keys. Do not send real funds.
This software is provided "AS IS" for the USDC Hackathon.
