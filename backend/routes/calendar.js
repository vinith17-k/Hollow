/**
 * routes/calendar.js — iCal & Google Calendar Sync for Hollow
 *
 * Supports subscribing to remote .ics / Webcal calendars (Google Calendar,
 * Apple iCloud, Outlook, etc.) and converting calendar events into directives.
 */

'use strict';

const express = require('express');
const http = require('http');
const https = require('https');
const { URL } = require('url');
const crypto = require('crypto');
const db = require('../db');

const router = express.Router();

function uuidv4() {
  return typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : 'cal_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
}

// Fetch helper with redirect follow support (max 5 hops)
function fetchText(urlStr, maxRedirects = 5) {
  return new Promise((resolve, reject) => {
    if (maxRedirects < 0) return reject(new Error('Too many redirects'));

    // Handle webcal:// protocol by switching to https://
    let targetUrl = urlStr;
    if (targetUrl.startsWith('webcal://')) {
      targetUrl = 'https://' + targetUrl.slice(9);
    }

    let parsedUrl;
    try {
      parsedUrl = new URL(targetUrl);
    } catch (e) {
      return reject(new Error(`Invalid URL: ${targetUrl}`));
    }

    const client = parsedUrl.protocol === 'https:' ? https : http;
    const req = client.get(parsedUrl, {
      headers: {
        'User-Agent': 'Hollow-Desk-Companion/2.0 (+https://github.com/vinith17-k/Hollow)',
        'Accept': 'text/calendar, text/plain, */*'
      },
      timeout: 10000,
    }, (res) => {
      // Follow redirects
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        const nextUrl = new URL(res.headers.location, parsedUrl).toString();
        res.resume();
        return fetchText(nextUrl, maxRedirects - 1).then(resolve).catch(reject);
      }

      if (res.statusCode < 200 || res.statusCode >= 300) {
        res.resume();
        return reject(new Error(`HTTP ${res.statusCode}: ${res.statusMessage}`));
      }

      let data = '';
      res.setEncoding('utf8');
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => resolve(data));
    });

    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Calendar request timed out'));
    });
    req.on('error', reject);
  });
}

// Parses iCalendar date format into ISO string
function parseIcalDate(rawDate) {
  if (!rawDate) return null;
  const clean = rawDate.trim().replace(/^.*:/, ''); // strip any prefix like TZID=...:

  // Format: YYYYMMDDTHHMMSSZ or YYYYMMDDTHHMMSS
  const matchDateTime = clean.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z?)$/);
  if (matchDateTime) {
    const [, yr, mo, dy, hr, mn, sc, isUtc] = matchDateTime;
    if (isUtc === 'Z') {
      return new Date(Date.UTC(+yr, +mo - 1, +dy, +hr, +mn, +sc)).toISOString();
    }
    // Local floating time - treat as local UTC approximation
    return new Date(+yr, +mo - 1, +dy, +hr, +mn, +sc).toISOString();
  }

  // Format: All-day date YYYYMMDD
  const matchDate = clean.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (matchDate) {
    const [, yr, mo, dy] = matchDate;
    // Set to 09:00 local on that day as default reminder time
    return new Date(Date.UTC(+yr, +mo - 1, +dy, 9, 0, 0)).toISOString();
  }

  const fallback = new Date(clean);
  return isNaN(fallback.getTime()) ? null : fallback.toISOString();
}

// Lightweight zero-dependency ICS parser
function parseICS(icsText) {
  const events = [];
  // Unfold multiline lines (lines starting with space or tab are continuations)
  const unfolded = icsText.replace(/\r\n[ \t]/g, '').replace(/\n[ \t]/g, '');
  const lines = unfolded.split(/\r?\n/);

  let inEvent = false;
  let currentEvent = {};

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed === 'BEGIN:VEVENT') {
      inEvent = true;
      currentEvent = {};
      continue;
    }
    if (trimmed === 'END:VEVENT') {
      if (inEvent && currentEvent.title && currentEvent.due_time) {
        events.push(currentEvent);
      }
      inEvent = false;
      currentEvent = {};
      continue;
    }
    if (!inEvent) continue;

    // Field parse: KEY;PARAMS:VALUE or KEY:VALUE
    const colonIdx = line.indexOf(':');
    if (colonIdx === -1) continue;
    const rawKey = line.slice(0, colonIdx);
    const val = line.slice(colonIdx + 1).trim();
    const key = rawKey.split(';')[0].toUpperCase();

    if (key === 'SUMMARY') {
      // Unescape ICS characters
      currentEvent.title = val.replace(/\\n/g, ' ').replace(/\\,/g, ',').replace(/\\;/g, ';').replace(/\\\\/g, '\\');
    } else if (key === 'DTSTART') {
      currentEvent.due_time = parseIcalDate(line);
    } else if (key === 'UID') {
      currentEvent.uid = val;
    } else if (key === 'DESCRIPTION') {
      currentEvent.description = val.slice(0, 120);
    }
  }

  return events;
}

// ── GET /api/calendar/sync ───────────────────────────────────────────────────
router.get('/sync', async (req, res) => {
  try {
    db.read();
    let url = req.query.url;

    // If no URL passed in query, use the first configured calendar feed
    if (!url) {
      const feeds = db.data.settings.calendar_feeds || [];
      if (feeds.length > 0) {
        url = typeof feeds[0] === 'string' ? feeds[0] : feeds[0].url;
      }
    }

    if (!url || typeof url !== 'string' || !url.trim()) {
      return res.status(400).json({ error: 'No calendar URL provided and no calendar_feeds configured' });
    }

    url = url.trim();
    const icsContent = await fetchText(url);
    const parsedEvents = parseICS(icsContent);

    let addedCount = 0;
    let skippedCount = 0;
    const nowMs = Date.now();
    // Only import events from 2 days ago up to 30 days into the future
    const minTime = nowMs - (2 * 24 * 60 * 60 * 1000);
    const maxTime = nowMs + (30 * 24 * 60 * 60 * 1000);

    for (const ev of parsedEvents) {
      const evTime = new Date(ev.due_time).getTime();
      if (isNaN(evTime) || evTime < minTime || evTime > maxTime) {
        skippedCount++;
        continue;
      }

      // Check for duplicates
      const exists = db.data.tasks.some(t => {
        if (ev.uid && t.ical_uid === ev.uid) return true;
        // Or same title & same due time
        return t.title.toLowerCase() === ev.title.toLowerCase() &&
               new Date(t.due_time).toISOString().slice(0, 16) === new Date(ev.due_time).toISOString().slice(0, 16);
      });

      if (exists) {
        skippedCount++;
        continue;
      }

      const newTask = {
        id:            uuidv4(),
        title:         ev.title.slice(0, 64),
        due_time:      ev.due_time,
        done:          false,
        snoozed_until: null,
        updated_at:    new Date().toISOString(),
        source:        'ical',
        ical_uid:      ev.uid || null,
      };

      db.data.tasks.push(newTask);
      addedCount++;
    }

    if (addedCount > 0) {
      db.write();
      if (typeof req.app?.locals?.broadcastSSE === 'function') {
        req.app.locals.broadcastSSE('tasks_changed', { action: 'calendar_sync', count: addedCount });
      }
    }

    res.json({
      status: 'ok',
      added: addedCount,
      skipped: skippedCount,
      total_events: parsedEvents.length,
      synced_at: new Date().toISOString(),
    });
  } catch (err) {
    console.error('[CALENDAR] Sync error:', err.message);
    res.status(500).json({ error: `Calendar sync failed: ${err.message}` });
  }
});

module.exports = router;
