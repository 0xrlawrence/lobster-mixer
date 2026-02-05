#!/usr/bin/env node

import fs from 'fs';
import http from 'http';
import https from 'https';

const BASE_URL = process.env.LOBSTER_API || 'http://localhost:4321';

async function fetchJson(path) {
    return new Promise((resolve, reject) => {
        const client = BASE_URL.startsWith('https') ? https : http;
        client.get(`${BASE_URL}${path}`, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    resolve(JSON.parse(data));
                } catch (e) {
                    reject(new Error(`Failed to parse response from ${path}`));
                }
            });
        }).on('error', reject);
    });
}

const commands = {
    help: () => {
        console.log(`
Lobster Mix CLI 🦞

Usage:
  lobster <command> [options]

Commands:
  status      Check mesh network status
  config      Get agent configuration (RPC, Contracts)
  onboard     (Simulated) Generate new identity
  mix         (Simulated) Mix assets
  help        Show this help message
`);
    },

    status: async () => {
        try {
            console.log('Fetching status...');
            const stats = await fetchJson('/api/agent/stats');
            console.log('\n🦞 Network Status:');
            console.log('------------------');
            console.log(`Status:        ${stats.status}`);
            console.log(`Network:       ${stats.network}`);
            console.log(`Active Nodes:  ${stats.metrics.activeNodes}`);
            console.log(`24h Volume:    ${stats.metrics.volume24h}`);
            console.log(`Orchestrator:  ${stats.health.orchestrator}`);
            console.log('');
        } catch (e) {
            console.error('Error fetching status:', e.message);
        }
    },

    config: async () => {
        try {
            console.log('Fetching manifest...');
            const manifest = await fetchJson('/api/agent/manifest');
            console.log(JSON.stringify(manifest, null, 2));
        } catch (e) {
            console.error('Error fetching config:', e.message);
        }
    },

    onboard: () => {
        console.log('Generating new identity...');
        // Simulation
        const wallet = "0x" + Array(40).fill(0).map(() => Math.floor(Math.random() * 16).toString(16)).join("");
        console.log(`\nIdentity Created:`);
        console.log(`Address: ${wallet}`);
        console.log(`Private Key: <hidden>`);
        console.log(`\nReady to mix.`);
    },

    mix: (args) => {
        // Simple arg parsing
        const getArg = (flag) => {
            const idx = args.indexOf(flag);
            return idx !== -1 ? args[idx + 1] : null;
        };

        const amount = getArg('--amount') || '100';
        const token = getArg('--token') || 'POL';
        const receiver = getArg('--receiver') || '0xUNKNOWN';

        console.log(`Initiating mix for ${amount} ${token}...`);
        console.log(`Target: ${receiver}`);
        console.log('Connecting to LobsterMixer Contract...');
        console.log(`Deposit ${amount} ${token} -> 🌪️ Mixing (ZK-Proof Gen) -> Withdrawing...`);

        setTimeout(() => {
            const txHash = "0x" + Array(64).fill(0).map(() => Math.floor(Math.random() * 16).toString(16)).join("");
            console.log(`✅ Mix Complete.`);
            console.log(`Transaction: ${txHash}`);
        }, 1500);
    }
};

const args = process.argv.slice(2);
const command = args[0] || 'help';

if (commands[command]) {
    commands[command](args.slice(1));
} else {
    console.log(`Unknown command: ${command}`);
    commands.help();
}
