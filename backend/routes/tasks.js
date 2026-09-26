/**
 * routes/tasks.js — CRUD for the tasks collection
 *
 * Endpoints
 * ─────────
 *   GET    /api/tasks               → all tasks (sorted: undone first, earliest due)
 *   GET    /api/tasks?pending=true  → only undone tasks (lighter payload for ESP32)
 *   GET    /api/tasks?since=<ISO>   → delta-sync: only tasks updated after timestamp
 *   GET    /api/tasks/:id           → single task
 *   POST   /api/tasks               → create task
 *   PATCH  /api/tasks/:id           → partial update (title, due_time, done, source)
 *   DELETE /api/tasks/:id           → delete task
 *   POST   /api/tasks/:id/snooze    → snooze task by N minutes
 *
 * ESP32 firmware uses:
 *   GET  /api/tasks?pending=true    → fetch pending cache (every sync_interval_sec)
 *   PATCH /api/tasks/:id            → write back `done` or `snoozed_until`
 */

'use strict';

const express = require('express');
const crypto = require('crypto');
const db = require('../db');

function uuidv4() {
  return typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : 'task_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
}

const router = express.Router();

function now() {
  return new Date().toISOString();
}

function sortedTasks(tasks) {
  return [...tasks].sort((a, b) => {
    if (a.done !== b.done) return a.done ? 1 : -1;
    return new Date(a.due_time) - new Date(b.due_time);
  });
}

function isValidISO(str) {
  const d = new Date(str);
  return !isNaN(d.getTime());
}

// ── GET /api/tasks ────────────────────────────────────────────────────────────

router.get('/', (req, res) => {
  try {
    db.read();
    let tasks = db.data.tasks;

    // ?pending=true — only undone tasks (lighter for ESP32 polling)
    if (req.query.pending === 'true') {
      tasks = tasks.filter(t => !t.done);
    }

    // ?since=<ISO> — delta sync: only tasks updated after timestamp
    if (req.query.since) {
      if (!isValidISO(req.query.since)) {
        return res.status(400).json({ error: 'since must be a valid ISO 8601 timestamp' });
      }
      const since = new Date(req.query.since);
      tasks = tasks.filter(t => new Date(t.updated_at) > since);
    }

    res.json(sortedTasks(tasks));
  } catch (err) {
    console.error('[TASKS] GET all error:', err.message);
    res.status(500).json({ error: 'Failed to fetch tasks' });
  }
});

// ── GET /api/tasks/:id ────────────────────────────────────────────────────────

router.get('/:id', (req, res) => {
  try {
    db.read();
    const task = db.data.tasks.find(t => t.id === req.params.id);
    if (!task) return res.status(404).json({ error: 'Task not found' });
    res.json(task);
  } catch (err) {
    console.error('[TASKS] GET by id error:', err.message);
    res.status(500).json({ error: 'Failed to fetch task' });
  }
});

// ── POST /api/tasks ───────────────────────────────────────────────────────────

router.post('/', (req, res) => {
  const { title, due_time, source = 'web' } = req.body;

  if (!title || typeof title !== 'string' || !title.trim()) {
    return res.status(400).json({ error: 'title is required' });
  }
  if (!due_time) {
    return res.status(400).json({ error: 'due_time is required' });
  }
  if (!isValidISO(due_time)) {
    return res.status(400).json({ error: 'due_time must be a valid ISO 8601 timestamp' });
  }

  const task = {
    id:            uuidv4(),
    title:         title.trim().slice(0, 64),
    due_time,
    done:          false,
    snoozed_until: null,
    updated_at:    now(),
    source,
  };

  try {
    db.read();
    db.data.tasks.push(task);
    db.write();
    if (typeof req.app?.locals?.broadcastSSE === 'function') {
      req.app.locals.broadcastSSE('tasks_changed', { action: 'created', task });
    }
    res.status(201).json(task);
  } catch (err) {
    console.error('[TASKS] POST error:', err.message);
    res.status(500).json({ error: 'Failed to create task' });
  }
});

// ── PATCH /api/tasks/:id ──────────────────────────────────────────────────────

router.patch('/:id', (req, res) => {
  const { id } = req.params;
  const allowed = ['title', 'due_time', 'done', 'source', 'snoozed_until'];
  const patch = {};

  for (const key of allowed) {
    if (key in req.body) patch[key] = req.body[key];
  }

  // Validate due_time if provided
  if (patch.due_time && !isValidISO(patch.due_time)) {
    return res.status(400).json({ error: 'due_time must be a valid ISO 8601 timestamp' });
  }

  if (Object.keys(patch).length === 0) {
    return res.status(400).json({ error: 'No patchable fields provided' });
  }

  try {
    db.read();
    const idx = db.data.tasks.findIndex(t => t.id === id);
    if (idx === -1) return res.status(404).json({ error: 'Task not found' });

    const wasDone = !!db.data.tasks[idx].done;
    const isNowDone = patch.done === true;

    // Gamification: Award XP when marking task done
    if (isNowDone && !wasDone) {
      const curXP = (db.data.settings.xp || 0) + 25;
      const curCompleted = (db.data.settings.total_tasks_completed || 0) + 1;
      db.data.settings.xp = curXP;
      db.data.settings.total_tasks_completed = curCompleted;

      const levels = [
        { level: 1, name: 'Bat Pup',          minXP: 0 },
        { level: 2, name: 'Night Scout',      minXP: 100 },
        { level: 3, name: 'Cave Keeper',      minXP: 250 },
        { level: 4, name: 'Shadow Wing',      minXP: 500 },
        { level: 5, name: 'Dusk Sentinel',    minXP: 1000 },
        { level: 6, name: 'Hollow Guardian',  minXP: 2000 },
        { level: 7, name: 'Void Ranger',      minXP: 4000 },
        { level: 8, name: 'Vampire Sovereign', minXP: 8000 },
      ];
      let curLvl = levels[0];
      for (const l of levels) {
        if (curXP >= l.minXP) curLvl = l;
      }
      db.data.settings.level = curLvl.level;
      db.data.settings.level_name = curLvl.name;

      if (typeof req.app?.locals?.broadcastSSE === 'function') {
        req.app.locals.broadcastSSE('xp_gained', {
          xp: curXP,
          level: curLvl.level,
          level_name: curLvl.name,
          task_title: db.data.tasks[idx].title
        });
      }
    }

    db.data.tasks[idx] = {
      ...db.data.tasks[idx],
      ...patch,
      updated_at: now(),
    };
    db.write();

    if (typeof req.app?.locals?.broadcastSSE === 'function') {
      req.app.locals.broadcastSSE('tasks_changed', { action: 'updated', task: db.data.tasks[idx] });
    }
    res.json(db.data.tasks[idx]);
  } catch (err) {
    console.error('[TASKS] PATCH error:', err.message);
    res.status(500).json({ error: 'Failed to update task' });
  }
});

// ── POST /api/tasks/:id/snooze ────────────────────────────────────────────────

router.post('/:id/snooze', (req, res) => {
  const { id } = req.params;
  const minutes = parseInt(req.body.minutes, 10);

  if (isNaN(minutes) || minutes < 1 || minutes > 180) {
    return res.status(400).json({ error: 'minutes must be 1–180' });
  }

  try {
    db.read();
    const idx = db.data.tasks.findIndex(t => t.id === id);
    if (idx === -1) return res.status(404).json({ error: 'Task not found' });

    const snoozeUntil = new Date(Date.now() + minutes * 60 * 1000).toISOString();
    db.data.tasks[idx] = {
      ...db.data.tasks[idx],
      snoozed_until: snoozeUntil,
      updated_at:    now(),
    };
    db.write();
    if (typeof req.app?.locals?.broadcastSSE === 'function') {
      req.app.locals.broadcastSSE('tasks_changed', { action: 'snoozed', task: db.data.tasks[idx] });
    }
    res.json({ snoozed_until: snoozeUntil, task: db.data.tasks[idx] });
  } catch (err) {
    console.error('[TASKS] SNOOZE error:', err.message);
    res.status(500).json({ error: 'Failed to snooze task' });
  }
});

// ── DELETE /api/tasks/:id ─────────────────────────────────────────────────────

router.delete('/:id', (req, res) => {
  try {
    db.read();
    const idx = db.data.tasks.findIndex(t => t.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'Task not found' });

    db.data.tasks.splice(idx, 1);
    db.write();
    if (typeof req.app?.locals?.broadcastSSE === 'function') {
      req.app.locals.broadcastSSE('tasks_changed', { action: 'deleted', id: req.params.id });
    }
    res.status(204).send();
  } catch (err) {
    console.error('[TASKS] DELETE error:', err.message);
    res.status(500).json({ error: 'Failed to delete task' });
  }
});

module.exports = router;
