/**
 * db.js — Native zero-dependency JSON database for Hollow
 *
 * Replaces external ESM lowdb with standard Node.js fs.
 * 100% compatible with CommonJS on Vercel Serverless (Node 18/20/22/24).
 */

'use strict';

const os = require('os');
const fs = require('fs');
const path = require('path');

// When deployed on Vercel, the repository directory is read-only.
// We use os.tmpdir() on Vercel so file writes succeed.
const DB_PATH = process.env.VERCEL
  ? path.join(os.tmpdir(), 'hollow-data.json')
  : path.join(__dirname, 'data.json');

const DEFAULT_DATA = {
  tasks: [],
  logs: [],
  settings: {
    chime_enabled:     true,
    led_brightness:    80,
    snooze_minutes:    15,
    sync_interval_sec: 30,
    time_format:       '12',
    timezone:            'UTC',
    quiet_hours_enabled: false,
    quiet_hours_windows: [],
    current_streak:      0,

    // ── Feature B: Gamification ──────────────────────────────────────────────
    xp:                        0,
    level:                     1,
    level_name:                'Bat Pup',
    total_tasks_completed:     0,
    cosmetic_unlocks:          [],
    pomodoro_sessions_completed: 0,

    // ── Feature C: Calendar / iCal ───────────────────────────────────────────
    calendar_feeds:        [],
    calendar_sync_enabled: false,
  },
};

let cache = null;

function load() {
  if (cache) return cache;

  try {
    if (fs.existsSync(DB_PATH)) {
      const raw = fs.readFileSync(DB_PATH, 'utf8');
      cache = JSON.parse(raw);
    }
  } catch (err) {
    console.warn('[DB] Read error, resetting cache:', err.message);
  }

  if (!cache || typeof cache !== 'object') {
    cache = { tasks: [], logs: [], settings: { ...DEFAULT_DATA.settings } };
  }
  if (!Array.isArray(cache.tasks)) cache.tasks = [];
  if (!Array.isArray(cache.logs))  cache.logs  = [];
  cache.settings = { ...DEFAULT_DATA.settings, ...(cache.settings || {}) };

  return cache;
}

function persist() {
  if (!cache) return;
  try {
    const dir = path.dirname(DB_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(DB_PATH, JSON.stringify(cache, null, 2), 'utf8');
  } catch (err) {
    console.warn('[DB] Write error (ephemeral serverless environment):', err.message);
  }
}

// Initial load & ensure file exists
load();
persist();

module.exports = {
  get data() {
    return load();
  },
  set data(val) {
    cache = val;
    persist();
  },
  read() {
    cache = null; // force fresh reload from disk
    return load();
  },
  write() {
    persist();
  },
};
