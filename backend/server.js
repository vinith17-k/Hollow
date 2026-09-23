/**
 * server.js — Hollow API Server
 *
 * Stack: Express + lowdb (JSON file persistence, no native compilation needed)
 *
 * Routes
 * ──────
 *   GET  /api/health         → system status (uptime, task counts, firmware)
 *   GET  /api/log            → in-memory event log (last 100 entries)
 *   GET  /api/export         → download full data.json as file attachment
 *   POST /api/import         → restore data from JSON body
 *   *    /api/tasks          → task CRUD  (see routes/tasks.js)
 *   *    /api/settings       → settings   (see routes/settings.js)
 *
 * TODO (Supabase swap)
 * ────────────────────
 * To point this server at real Supabase instead of lowdb:
 *   1. Copy .env.example → .env, fill SUPABASE_URL + SUPABASE_ANON_KEY
 *   2. Replace db.read/write calls in routes/ with fetch() to Supabase REST API
 *      e.g. GET ${SUPABASE_URL}/rest/v1/tasks?order=done.asc,due_time.asc
 *           with header apikey: ${SUPABASE_ANON_KEY}
 *
 * TODO (ESP32 device context)
 * ───────────────────────────
 * When served from the ESP32's AsyncWebServer, set API_BASE='' in the HTML.
 * The route shape is identical — only the host changes.
 */

'use strict';

require('dotenv').config();

const express      = require('express');
const cors         = require('cors');
const rateLimit    = require('express-rate-limit');
const path         = require('path');
const db           = require('./db');
const taskRoutes     = require('./routes/tasks');
const settingsRoutes = require('./routes/settings');

const app  = express();
const PORT = parseInt(process.env.PORT || '4000', 10);

// ── Boot timestamp ────────────────────────────────────────────────────────────
const BOOT_TIME       = Date.now();
const FIRMWARE_VERSION = process.env.FIRMWARE_VERSION || 'v1.0.0-sim';

// ── In-memory circular event log (last 100 entries) ──────────────────────────
const LOG_MAX  = 100;
const eventLog = [];

function logEvent(level, message, detail = '') {
  const entry = {
    ts:     new Date().toISOString(),
    level,          // 'SYS' | 'NET' | 'API' | 'ERR'
    message,
    detail,
  };
  eventLog.push(entry);
  if (eventLog.length > LOG_MAX) eventLog.shift();
}

logEvent('SYS', 'Boot sequence complete', `port=${PORT}`);
logEvent('SYS', 'Database ready',         'lowdb / data.json');

// ── Middleware ────────────────────────────────────────────────────────────────

// Trust proxy for Vercel / reverse-proxy deployments
app.set('trust proxy', 1);

app.use(cors({
  origin:         (origin, cb) => cb(null, true),
  methods:        ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

// Body size limit prevents accidental large payloads from crashing the server
app.use(express.json({ limit: '16kb' }));

// Rate limiting: 200 requests per minute per IP
app.use(rateLimit({
  windowMs: 60 * 1000,
  max:      200,
  standardHeaders: true,
  legacyHeaders:   false,
  validate: { xForwardedForHeader: false },
  message: { error: 'Too many requests — slow down' },
}));

// Request logger + event log capture
app.use((req, res, next) => {
  const ts = new Date().toISOString().slice(11, 19);
  console.log(`[${ts}] ${req.method.padEnd(6)} ${req.path}`);
  logEvent('API', `${req.method} ${req.path}`);
  next();
});

// ── /api/health ───────────────────────────────────────────────────────────────

app.get('/api/health', (req, res) => {
  const uptimeSec = Math.floor((Date.now() - BOOT_TIME) / 1000);
  const d = Math.floor(uptimeSec / 86400);
  const h = Math.floor((uptimeSec % 86400) / 3600);
  const m = Math.floor((uptimeSec % 3600) / 60);
  const s = uptimeSec % 60;
  const uptimeStr =
    `${d}d ${String(h).padStart(2,'0')}h ${String(m).padStart(2,'0')}m ${String(s).padStart(2,'0')}s`;

  db.read();
  const taskCount   = db.data.tasks.length;
  const pendingCount = db.data.tasks.filter(t => !t.done).length;

  res.json({
    status:       'ok',
    firmware:     FIRMWARE_VERSION,
    uptime:       uptimeStr,
    uptime_sec:   uptimeSec,
    task_count:   taskCount,
    task_pending: pendingCount,
    synced_at:    new Date().toISOString(),
    context:      'local-api',
    db:           'lowdb/json',
  });
});

// ── /api/log ──────────────────────────────────────────────────────────────────

app.get('/api/log', (req, res) => {
  const limit = Math.min(parseInt(req.query.limit || '50', 10), LOG_MAX);
  res.json(eventLog.slice(-limit));
});

// ── /api/export ───────────────────────────────────────────────────────────────

app.get('/api/export', (req, res) => {
  db.read();
  const filename = `desk-companion-backup-${new Date().toISOString().slice(0,10)}.json`;
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.setHeader('Content-Type', 'application/json');
  logEvent('SYS', 'Data exported', filename);
  res.json(db.data);
});

// ── /api/import ───────────────────────────────────────────────────────────────

app.post('/api/import', (req, res) => {
  const { tasks, settings } = req.body || {};

  if (!Array.isArray(tasks) && !settings) {
    return res.status(400).json({ error: 'Body must have tasks[] and/or settings{}' });
  }

  db.read();

  if (Array.isArray(tasks)) {
    // Validate each task has the minimum required fields
    for (const t of tasks) {
      if (!t.id || !t.title || !t.due_time) {
        return res.status(400).json({ error: 'Each task must have id, title, due_time' });
      }
    }
    db.data.tasks = tasks;
  }

  if (settings && typeof settings === 'object') {
    Object.assign(db.data.settings, settings);
  }

  db.write();
  logEvent('SYS', 'Data imported', `${(tasks||[]).length} tasks`);
  res.json({ imported: { tasks: db.data.tasks.length, settings: !!settings } });
});

// ── API Routes ────────────────────────────────────────────────────────────────

app.use('/api/tasks',    taskRoutes);
app.use('/api/settings', settingsRoutes);

// Expose logEvent to routes
app.locals.logEvent = logEvent;

// ── Static Files (Serves frontend when run via Node directly) ────────────────
const PUBLIC_DIR = path.join(__dirname, '../public');
app.use(express.static(PUBLIC_DIR));

// ── 404 catch-all ─────────────────────────────────────────────────────────────

app.use((req, res) => {
  if (req.path.startsWith('/api')) {
    return res.status(404).json({ error: `Route not found: ${req.method} ${req.path}` });
  }
  // Fall back to index.html for non-API client routes if available
  res.sendFile(path.join(PUBLIC_DIR, 'index.html'), (err) => {
    if (err) res.status(404).json({ error: 'Page not found' });
  });
});

// ── Error handler ─────────────────────────────────────────────────────────────

app.use((err, req, res, _next) => {
  console.error('[SERVER ERROR]', err);
  logEvent('ERR', err.message);
  res.status(500).json({ error: 'Internal server error' });
});

// ── Start (Only if executed directly as main script and not in Vercel) ────────

if (!process.env.VERCEL && require.main === module) {
  app.listen(PORT, () => {
    console.log('');
    console.log('  ░▒▓ HOLLOW API ▓▒░');
    console.log(`  Listening  http://localhost:${PORT}`);
    console.log(`  Health:    GET  http://localhost:${PORT}/api/health`);
    console.log(`  Tasks:     GET  http://localhost:${PORT}/api/tasks`);
    console.log(`  Settings:  GET  http://localhost:${PORT}/api/settings`);
    console.log(`  Log:       GET  http://localhost:${PORT}/api/log`);
    console.log(`  Export:    GET  http://localhost:${PORT}/api/export`);
    console.log('');
  });
}

module.exports = app;
