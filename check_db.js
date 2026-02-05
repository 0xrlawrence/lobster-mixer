import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.join(__dirname, '..', 'data', 'lobster.db');

const db = new Database(dbPath);
const index = 19; // Lobster #20

const row = db.prepare('SELECT * FROM lobster_profiles WHERE satellite_index = ?').get(index);
console.log('--- Profile for Index 19 ---');
console.log(JSON.stringify(row, (key, value) => {
    if (key === 'icon_data' && value) return `[Buffer size: ${value.length}]`;
    return value;
}, 2));

const all = db.prepare('SELECT satellite_index, twitter_username, twitter_avatar FROM lobster_profiles').all();
console.log('--- All Profiles (Summary) ---');
console.table(all);
