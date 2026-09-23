/**
 * db.js — JSON file database for Hollow backend
 *
 * Uses lowdb v7 with JSONFileSyncPreset.
 * Guaranteed safe execution on both local dev and serverless platforms (Vercel).
 */

'use strict';

const os = require('os');
const fs = require('fs');
const path = require('path');
const { JSONFileSyncPreset } = require('lowdb/node');

// In Vercel serverless environment, local repo directory is read-only.
// We use os.tmpdir() on Vercel so file writes succeed.
const DB_PATH = process.env.VERCEL
  ? path.join(os.tmpdir(), 'hollow-data.json')
  : path.join(__dirname, 'data.json');

const DEFAULT_DATA = {
  tasks: [],
  settings: {
    chime_enabled:     true,
    led_brightness:    80,
    snooze_minutes:    15,
    sync_interval_sec: 30,
    time_format:       '12',
  },
};

// Seed /tmp data file on Vercel if it doesn't exist yet
if (process.env.VERCEL && !fs.existsSync(DB_PATH)) {
  const seedPath = path.join(__dirname, 'data.json');
  if (fs.existsSync(seedPath)) {
    try {
      fs.copyFileSync(seedPath, DB_PATH);
    } catch (_) {}
  }
}

let internalDb;
try {
  internalDb = JSONFileSyncPreset(DB_PATH, DEFAULT_DATA);
} catch (err) {
  console.warn('[DB] Using in-memory fallback store:', err.message);
  internalDb = {
    data: { tasks: [], settings: { ...DEFAULT_DATA.settings } },
    read() {},
    write() {},
  };
}

function safeRead() {
  try {
    if (typeof internalDb.read === 'function') internalDb.read();
  } catch (_) {}
  if (!internalDb.data) {
    internalDb.data = { tasks: [], settings: { ...DEFAULT_DATA.settings } };
  }
  if (!Array.isArray(internalDb.data.tasks)) {
    internalDb.data.tasks = [];
  }
  if (!internalDb.data.settings) {
    internalDb.data.settings = { ...DEFAULT_DATA.settings };
  }
}

function safeWrite() {
  try {
    if (typeof internalDb.write === 'function') internalDb.write();
  } catch (err) {
    console.warn('[DB] Write skipped (ephemeral environment):', err.message);
  }
}

// Initial safety check
safeRead();
safeWrite();

module.exports = {
  get data() {
    safeRead();
    return internalDb.data;
  },
  set data(val) {
    internalDb.data = val;
  },
  read: safeRead,
  write: safeWrite,
};
