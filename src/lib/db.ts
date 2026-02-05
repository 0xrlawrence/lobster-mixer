import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.join(__dirname, '..', '..', '..', 'data', 'lobster.db');

// Ensure data directory exists
import fs from 'fs';
const dataDir = path.dirname(dbPath);
if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
}

const db = new Database(dbPath);

// Create tables
db.exec(`
    CREATE TABLE IF NOT EXISTS lobster_profiles (
        satellite_index INTEGER PRIMARY KEY,
        owner_address TEXT NOT NULL,
        twitter_username TEXT,
        twitter_avatar TEXT,
        created_at INTEGER DEFAULT (unixepoch()),
        updated_at INTEGER DEFAULT (unixepoch())
    );
    
    CREATE TABLE IF NOT EXISTS twitter_profiles (
        owner_address TEXT PRIMARY KEY COLLATE NOCASE,
        twitter_username TEXT,
        twitter_avatar TEXT,
        updated_at INTEGER DEFAULT (unixepoch())
    );
    
    CREATE INDEX IF NOT EXISTS idx_owner ON lobster_profiles(owner_address);
`);

export interface LobsterProfile {
    satelliteIndex: number;
    ownerAddress: string;
    twitterUsername?: string;
    twitterAvatar?: string;
}

export function getProfile(satelliteIndex: number): LobsterProfile | null {
    // 1. Try to get node-specific profile
    const stmt = db.prepare(`
        SELECT p.satellite_index, p.owner_address, 
               COALESCE(p.twitter_username, t.twitter_username) as twitter_username,
               COALESCE(p.twitter_avatar, t.twitter_avatar) as twitter_avatar
        FROM lobster_profiles p
        LEFT JOIN twitter_profiles t ON LOWER(p.owner_address) = LOWER(t.owner_address)
        WHERE p.satellite_index = ?
    `);
    const row = stmt.get(satelliteIndex) as any;
    if (!row) return null;
    return {
        satelliteIndex: row.satellite_index,
        ownerAddress: row.owner_address,
        twitterUsername: row.twitter_username,
        twitterAvatar: row.twitter_avatar
    };
}

export function getGlobalTwitterProfile(ownerAddress: string): { twitterUsername?: string; twitterAvatar?: string } | null {
    const stmt = db.prepare(`
        SELECT twitter_username, twitter_avatar
        FROM twitter_profiles WHERE LOWER(owner_address) = LOWER(?)
    `);
    const row = stmt.get(ownerAddress) as any;
    if (!row) return null;
    return {
        twitterUsername: row.twitter_username,
        twitterAvatar: row.twitter_avatar
    };
}

export function upsertProfile(profile: Partial<LobsterProfile> & { satelliteIndex: number; ownerAddress: string }) {
    // 1. Upsert node-specific profile
    const existing = db.prepare('SELECT satellite_index FROM lobster_profiles WHERE satellite_index = ?').get(profile.satelliteIndex);

    if (existing) {
        db.prepare(`
            UPDATE lobster_profiles 
            SET twitter_username = COALESCE(?, twitter_username),
                twitter_avatar = COALESCE(?, twitter_avatar),
                owner_address = ?,
                updated_at = unixepoch()
            WHERE satellite_index = ?
        `).run(
            profile.twitterUsername !== undefined ? profile.twitterUsername : null,
            profile.twitterAvatar !== undefined ? profile.twitterAvatar : null,
            profile.ownerAddress,
            profile.satelliteIndex
        );
    } else {
        db.prepare(`
            INSERT INTO lobster_profiles (satellite_index, owner_address, twitter_username, twitter_avatar)
            VALUES (?, ?, ?, ?)
        `).run(
            profile.satelliteIndex,
            profile.ownerAddress,
            profile.twitterUsername || null,
            profile.twitterAvatar || null
        );
    }

    // 2. Global Sync: Upsert into twitter_profiles for address-based lookup
    if (profile.twitterUsername || profile.twitterAvatar) {
        db.prepare(`
            INSERT INTO twitter_profiles (owner_address, twitter_username, twitter_avatar, updated_at)
            VALUES (?, ?, ?, unixepoch())
            ON CONFLICT(owner_address) DO UPDATE SET
                twitter_username = COALESCE(excluded.twitter_username, twitter_profiles.twitter_username),
                twitter_avatar = COALESCE(excluded.twitter_avatar, twitter_profiles.twitter_avatar),
                updated_at = unixepoch()
        `).run(
            profile.ownerAddress,
            profile.twitterUsername || null,
            profile.twitterAvatar || null
        );

        // 3. Update all existing nodes for this owner to match the new twitter info (optional but ensures consistency)
        db.prepare(`
            UPDATE lobster_profiles
            SET twitter_username = COALESCE(?, twitter_username),
                twitter_avatar = COALESCE(?, twitter_avatar),
                updated_at = unixepoch()
            WHERE LOWER(owner_address) = LOWER(?)
        `).run(
            profile.twitterUsername || null,
            profile.twitterAvatar || null,
            profile.ownerAddress
        );
    }
}

export function getProfilesByOwner(ownerAddress: string): LobsterProfile[] {
    const stmt = db.prepare(`
        SELECT satellite_index, owner_address, twitter_username, twitter_avatar
        FROM lobster_profiles WHERE LOWER(owner_address) = LOWER(?)
    `);
    const rows = stmt.all(ownerAddress) as any[];
    return rows.map(row => ({
        satelliteIndex: row.satellite_index,
        ownerAddress: row.owner_address,
        twitterUsername: row.twitter_username,
        twitterAvatar: row.twitter_avatar
    }));
}

export default db;
