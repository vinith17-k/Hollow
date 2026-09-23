/**
 * routes/auth.js — Authentication gate for Hollow Control
 *
 * Provides PIN/password authentication for single-user device security.
 * Validates against HOLLOW_PIN or HOLLOW_PASSWORD environment variable.
 * Defaults to '1024' if no custom PIN is set in environment.
 */

'use strict';

const express = require('express');
const crypto = require('crypto');

const router = express.Router();

// Retrieve configured PIN/Password
const CONFIGURED_PIN = String(
  process.env.HOLLOW_PIN || process.env.HOLLOW_PASSWORD || '1024'
).trim();

// Secure hash helper
function hashCredential(str) {
  return crypto.createHash('sha256').update(String(str).trim()).digest('hex');
}

// Generate simple session token based on credentials and server secret
const SERVER_SECRET = process.env.SESSION_SECRET || 'hollow-device-control-secret-key-321';
function generateSessionToken() {
  const payload = `hollow_auth_${Date.now()}`;
  const signature = crypto.createHmac('sha256', SERVER_SECRET).update(payload).digest('hex');
  return `${Buffer.from(payload).toString('base64')}.${signature}`;
}

function verifySessionToken(token) {
  if (!token || typeof token !== 'string') return false;
  const parts = token.split('.');
  if (parts.length !== 2) return false;
  const [b64Payload, signature] = parts;
  const payload = Buffer.from(b64Payload, 'base64').toString('utf8');
  const expectedSignature = crypto.createHmac('sha256', SERVER_SECRET).update(payload).digest('hex');
  return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature));
}

// ── POST /api/auth/login ───────────────────────────────────────────────────────
router.post('/login', (req, res) => {
  const { pin, password } = req.body || {};
  const submitted = String(pin || password || '').trim();

  if (!submitted) {
    return res.status(400).json({ error: 'PIN or password required' });
  }

  const submittedHash = hashCredential(submitted);
  const correctHash = hashCredential(CONFIGURED_PIN);

  const isMatch = crypto.timingSafeEqual(
    Buffer.from(submittedHash, 'utf8'),
    Buffer.from(correctHash, 'utf8')
  );

  if (!isMatch) {
    return res.status(401).json({ error: 'Access denied: Invalid PIN or password' });
  }

  const token = generateSessionToken();
  res.json({
    status: 'authenticated',
    token,
    message: 'Access granted to Hollow Control'
  });
});

// ── GET /api/auth/verify ──────────────────────────────────────────────────────
router.get('/verify', (req, res) => {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : req.query.token;

  if (verifySessionToken(token)) {
    return res.json({ authenticated: true });
  }
  res.status(401).json({ authenticated: false, error: 'Session expired or invalid' });
});

module.exports = router;
module.exports.verifySessionToken = verifySessionToken;
