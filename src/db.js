import sqlite3 from 'sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Ma'lumotlar bazasi fayl yo'lini moslashuvchan qilamiz:
// - Agar DB_PATH berilgan bo'lsa, aynan shu fayl ishlatiladi
// - Aks holda, agar DB_DIR berilgan bo'lsa, o'sha katalog ichida data.sqlite ishlatiladi
// - Hech narsa bo'lmasa, eski holat: loyiha ichidagi ..\data.sqlite
const envDbPath = process.env.DB_PATH;
const envDbDir = process.env.DB_DIR;

let dbPath;
if (envDbPath && envDbPath.trim()) {
  dbPath = envDbPath.trim();
} else if (envDbDir && envDbDir.trim()) {
  dbPath = path.join(envDbDir.trim(), 'data.sqlite');
} else {
  dbPath = path.join(__dirname, '..', 'data.sqlite');
}

sqlite3.verbose();
export const db = new sqlite3.Database(dbPath);

// Dastlabki jadvalar
export function initDb() {
  db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY,
      telegram_id INTEGER UNIQUE,
      phone TEXT,
      name TEXT,
      username TEXT,
      profile_link TEXT,
      main_link TEXT,
      description TEXT,
      slots INTEGER DEFAULT 1,
      used_slots INTEGER DEFAULT 0,
      invited_friends_count INTEGER DEFAULT 0,
      total_exchanges INTEGER DEFAULT 0,
      referrer_id INTEGER,
      block_until INTEGER,
      permanent_block INTEGER DEFAULT 0
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS referrals (
      id INTEGER PRIMARY KEY,
      referrer_id INTEGER,
      new_user_id INTEGER,
      created_at INTEGER
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS friendships (
      id INTEGER PRIMARY KEY,
      user_id INTEGER,
      friend_id INTEGER,
      created_at INTEGER
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS exchanges (
      id INTEGER PRIMARY KEY,
      user1_id INTEGER,
      user2_id INTEGER,
      status TEXT,
      accounts_user1 INTEGER,
      accounts_user2 INTEGER,
      created_at INTEGER,
      deadline INTEGER,
      user1_screenshot_received INTEGER DEFAULT 0,
      user2_screenshot_received INTEGER DEFAULT 0,
      user1_approved INTEGER DEFAULT 0,
      user2_approved INTEGER DEFAULT 0
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS exchange_screenshots (
      id INTEGER PRIMARY KEY,
      exchange_id INTEGER,
      user_id INTEGER,
      file_id TEXT,
      created_at INTEGER
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS channels (
      id INTEGER PRIMARY KEY,
      name TEXT UNIQUE,
      link TEXT,
      joined_count INTEGER DEFAULT 0
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS channel_joins (
      channel_id INTEGER,
      telegram_id INTEGER,
      PRIMARY KEY (channel_id, telegram_id)
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS user_links (
      telegram_id INTEGER,
      slot_index INTEGER,
      link TEXT,
      description TEXT,
      PRIMARY KEY (telegram_id, slot_index)
    )`);
  });
}

export function getSetting(key) {
  return new Promise((resolve, reject) => {
    db.get('SELECT value FROM settings WHERE key = ?', [key], (err, row) => {
      if (err) return reject(err);
      resolve(row ? row.value : null);
    });
  });
}

export function setSetting(key, value) {
  return new Promise((resolve, reject) => {
    db.run(
      'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
      [key, value],
      (err) => {
        if (err) return reject(err);
        resolve();
      }
    );
  });
}

export function getUserLinks(telegramId) {
  return new Promise((resolve, reject) => {
    db.all(
      'SELECT * FROM user_links WHERE telegram_id = ? ORDER BY slot_index ASC',
      [telegramId],
      (err, rows) => {
        if (err) return reject(err);
        resolve(rows || []);
      }
    );
  });
}

export function upsertUserLink(telegramId, slotIndex, link, description) {
  return new Promise((resolve, reject) => {
    db.run(
      `INSERT INTO user_links (telegram_id, slot_index, link, description)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(telegram_id, slot_index) DO UPDATE SET link = excluded.link, description = excluded.description`,
      [telegramId, slotIndex, link, description],
      function (err) {
        if (err) return reject(err);
        resolve();
      }
    );
  });
}

export function getChannels() {
  return new Promise((resolve, reject) => {
    db.all('SELECT * FROM channels ORDER BY id ASC', (err, rows) => {
      if (err) return reject(err);
      resolve(rows || []);
    });
  });
}

export function addOrUpdateChannel(name, link) {
  return new Promise((resolve, reject) => {
    db.run(
      'INSERT INTO channels (name, link) VALUES (?, ?) ON CONFLICT(name) DO UPDATE SET link = excluded.link',
      [name, link],
      function (err) {
        if (err) return reject(err);
        resolve();
      }
    );
  });
}

export function recordChannelJoin(channelId, telegramId) {
  return new Promise((resolve, reject) => {
    db.run(
      'INSERT INTO channel_joins (channel_id, telegram_id) VALUES (?, ?) ON CONFLICT(channel_id, telegram_id) DO NOTHING',
      [channelId, telegramId],
      function (err) {
        if (err) return reject(err);

        // Agar yangi yozuv qo'shilgan bo'lsa, joined_count ni +1 qilamiz
        if (this.changes > 0) {
          db.run('UPDATE channels SET joined_count = joined_count + 1 WHERE id = ?', [channelId]);
        }

        resolve();
      }
    );
  });
}
