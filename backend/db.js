/**
 * db.js — JSON file database for Desk Companion backend
 *
 * Uses lowdb v7 with JSONFileSyncPreset (pure JavaScript, no native binaries).
 * All data is persisted to data.json automatically on every write.
 *
 * Serverless / Vercel compatibility:
 *   When deployed on Vercel (process.env.VERCEL is set), the filesystem is read-only
 *   except for /tmp. We store data.json in os.tmpdir() so writes succeed.
 *
 * Schema (db.data)
 * ────────────────
 *   tasks[]    — task collection (matches spec §3.3 data model exactly)
 *   settings{} — singleton device config (fixes spec §3.8 open gap)
 */

'use strict';

const os = require('os');
const fs = require('fs');
const path = require('path');
const { JSONFileSyncPreset } = require('lowdb/node');

// In Vercel serverless environment, local repo directory is read-only.
// We use os.tmpdir() on Vercel so file writes succeed without EROFS errors.
const DB_PATH = process.env.VERCEL
  ? path.join(os.tmpdir(), 'data.json')
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

// Seed /tmp/data.json on Vercel if it doesn't exist yet
if (process.env.VERCEL && !fs.existsSync(DB_PATH)) {
  const seedPath = path.join(__dirname, 'data.json');
  if (fs.existsSync(seedPath)) {
    try {
      fs.copyFileSync(seedPath, DB_PATH);
    } catch (_) {}
  }
}

const db = JSONFileSyncPreset(DB_PATH, DEFAULT_DATA);

// Ensure both keys exist (in case of partial/corrupted data.json)
if (!db.data.tasks)    { db.data.tasks = []; db.write(); }
if (!db.data.settings) { db.data.settings = DEFAULT_DATA.settings; db.write(); }

module.exports = db;
