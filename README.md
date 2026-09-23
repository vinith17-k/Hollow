# 🤖 Desk Companion

> Hardware simulator, task directive management dashboard, and REST API for the Desk Companion ESP32 hardware device.

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Platform](https://img.shields.io/badge/platform-Vercel%20%7C%20Node.js-black.svg)
![Hardware](https://img.shields.io/badge/hardware-ESP32%20Compatible-green.svg)

---

## 🌟 Overview

Desk Companion is a retro-futuristic administrative control dashboard and simulator for an ESP32-powered desk assistant. It provides a tactile, Cyberpunk/Industrial-styled interface to manage directives, test hardware states, configure system parameters, inspect live telemetry, and sync with physical devices.

- **Frontend:** Single-page dashboard located in `public/index.html` with LCD simulator, CRT scanlines, LED indicators, and tactile audio-visual interactions.
- **Backend API:** Express-based REST API with lowdb persistence, rate limiting, system diagnostics, and real-time event logs.
- **Deployment:** Zero-config deploy to **Vercel** with static hosting and serverless API execution.

---

## 🚀 Quick Start (Local Development)

### Prerequisites
- Node.js (v18+ recommended)
- npm

### 1. Install Dependencies
```bash
npm install
```

### 2. Start the Server
```bash
npm start
```
The application will launch on **http://localhost:4000**:
- **Dashboard:** `http://localhost:4000/`
- **Health Check:** `http://localhost:4000/api/health`
- **Tasks API:** `http://localhost:4000/api/tasks`

---

## ☁️ Deploying to Vercel

This repository is pre-configured for instant deployment on Vercel.

1. **Push this repository to GitHub** (instructions below).
2. Go to [Vercel Dashboard](https://vercel.com/) and click **"Add New..."** → **"Project"**.
3. Import your GitHub repository (`desk-companion`).
4. Keep the default settings (Framework Preset: **Other**, Root Directory: `./`).
5. Click **"Deploy"**.

Vercel will automatically:
- Serve the static frontend from `/public` at your root domain (`/`).
- Mount `/api/*` to the serverless function handler in `/api/index.js`.

---

## 📡 API Reference

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/health` | System status, uptime, firmware version, and task counts |
| `GET` | `/api/tasks` | Get all directives sorted by status and due time |
| `GET` | `/api/tasks?pending=true` | Filter for incomplete tasks only (ESP32 polling) |
| `GET` | `/api/tasks?since=<ISO>` | Delta-sync: tasks updated after timestamp |
| `POST` | `/api/tasks` | Create directive (`title`, `due_time`, `source`) |
| `PATCH` | `/api/tasks/:id` | Update directive fields (`title`, `done`, `due_time`) |
| `DELETE` | `/api/tasks/:id` | Delete directive (204 No Content) |
| `POST` | `/api/tasks/:id/snooze` | Snooze directive by `minutes` |
| `GET` | `/api/settings` | Retrieve device configuration singleton |
| `PATCH` | `/api/settings` | Update configuration (`chime_enabled`, `led_brightness`, etc.) |
| `GET` | `/api/log` | Circular event log (last 50-100 operations) |
| `GET` | `/api/export` | Download complete JSON database backup |
| `POST` | `/api/import` | Restore database from JSON backup |

---

## 📂 Project Structure

```
DESK-COMPANION/
├── api/
│   └── index.js              # Serverless API entrypoint for Vercel
├── backend/
│   ├── .env.example          # Environment configuration template
│   ├── data.json             # Seed database file (JSON storage)
│   ├── db.js                 # lowdb database manager (with /tmp fallback for Vercel)
│   ├── routes/
│   │   ├── settings.js       # Device settings routes
│   │   └── tasks.js          # Directives CRUD & snooze routes
│   └── server.js             # Express application & middleware
├── public/
│   └── index.html            # Frontend dashboard interface
├── .gitignore                # Git exclusions
├── package.json              # Project dependencies & scripts
├── README.md                 # Project documentation
└── vercel.json               # Vercel routing & rewrites configuration
```

---

## ⌨️ Dashboard Shortcuts

- **`N`**: Quick focus on the new directive input field.
- **`Esc`**: Cancel inline directive editing.
- **`✓ ALL`**: Mark all pending directives complete.
- **`⬇ Export`**: Instant one-click database export from Telemetry.

---

## 📄 License

MIT
