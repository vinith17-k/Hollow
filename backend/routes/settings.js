/**
 * routes/settings.js — Device settings singleton
 *
 * Endpoints
 * ─────────
 *   GET   /api/settings   → return all device settings
 *   PATCH /api/settings   → partial update any settings fields
 *
 * Fixes spec §3.8 gap: settings now have a persistent backend home that
 * both the web dashboard AND the ESP32 firmware can read/write.
 *
 * ESP32 firmware can call GET /api/settings on each sync poll to pick up
 * runtime changes (snooze_minutes, sync_interval_sec, time_format, etc.)
 * without a firmware flash.
 *
 * TODO (Supabase swap): Replace db.read/write with fetch() to:
 *   GET   ${SUPABASE_URL}/rest/v1/settings?id=eq.1
 *   PATCH ${SUPABASE_URL}/rest/v1/settings?id=eq.1
 *   with header: apikey: ${SUPABASE_ANON_KEY}
 */

'use strict';

const express = require('express');
const db = require('../db');

const router = express.Router();

// ── GET /api/settings ─────────────────────────────────────────────────────────

router.get('/', (req, res) => {
  try {
    db.read();
    res.json(db.data.settings);
  } catch (err) {
    console.error('[SETTINGS] GET error:', err.message);
    res.status(500).json({ error: 'Failed to fetch settings' });
  }
});

// ── PATCH /api/settings ───────────────────────────────────────────────────────

router.patch('/', (req, res) => {
  const SCHEMA = {
    chime_enabled:     { type: 'boolean' },
    led_brightness:    { type: 'number',  min: 1,  max: 100 },
    snooze_minutes:    { type: 'number',  min: 1,  max: 60  },
    sync_interval_sec: { type: 'number',  min: 10, max: 300 },
    time_format:       { type: 'string',  values: ['12', '24'] },
  };

  const patch = {};
  const errors = [];

  for (const [key, rule] of Object.entries(SCHEMA)) {
    if (!(key in req.body)) continue;
    let val = req.body[key];

    if (rule.type === 'boolean') {
      patch[key] = Boolean(val);
    } else if (rule.type === 'number') {
      val = parseInt(val, 10);
      if (isNaN(val)) { errors.push(`${key} must be a number`); continue; }
      if (val < rule.min || val > rule.max) {
        errors.push(`${key} must be ${rule.min}–${rule.max}`); continue;
      }
      patch[key] = val;
    } else if (rule.type === 'string') {
      val = String(val);
      if (rule.values && !rule.values.includes(val)) {
        errors.push(`${key} must be one of: ${rule.values.join(', ')}`); continue;
      }
      patch[key] = val;
    }
  }

  if (errors.length > 0) {
    return res.status(400).json({ error: errors.join('; ') });
  }
  if (Object.keys(patch).length === 0) {
    return res.status(400).json({ error: 'No valid settings fields provided' });
  }

  try {
    db.read();
    Object.assign(db.data.settings, patch);
    db.write();
    res.json(db.data.settings);
  } catch (err) {
    console.error('[SETTINGS] PATCH error:', err.message);
    res.status(500).json({ error: 'Failed to update settings' });
  }
});

module.exports = router;
