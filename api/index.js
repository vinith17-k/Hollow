/**
 * api/index.js — Vercel Serverless Function Entry Point
 *
 * Directs all /api requests on Vercel to the Express backend application.
 */

'use strict';

const app = require('../backend/server');

module.exports = app;
