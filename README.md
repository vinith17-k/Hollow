# 🤖 Hollow (Desk Companion)

> **Tactile desktop companion simulator, task directives management dashboard, and REST API for the Hollow ESP32 smart desk device.**

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Platform](https://img.shields.io/badge/platform-Vercel%20%7C%20Node.js-black.svg)
![Hardware](https://img.shields.io/badge/hardware-ESP32--S3%20Compatible-green.svg)
![Deployment](https://img.shields.io/badge/deployment-live-success.svg)

🌐 **Live Production App**: [https://backend-green-two-67.vercel.app](https://backend-green-two-67.vercel.app)  
📖 **Comprehensive Master Documentation**: [`PROJECT_DOCUMENTATION.md`](./PROJECT_DOCUMENTATION.md)

---

## 🌟 Overview

**Hollow** is an intelligent companion system featuring a bat mascot ("Hollow") paired with a physical ESP32-S3 desk device and an administrative control dashboard inspired by Teenage Engineering / industrial aesthetics.

It provides a digital twin hardware simulator, directive scheduling, dynamic mascot animations, alert suppression with quiet hours, rotary knob shortcuts, and weekly completion velocity charts.

### Key Capabilities
- **🔐 Master Security Gate**: PIN/password authentication gate powered by constant-time HMAC tokens (`crypto.timingSafeEqual`).
- **🌙 Schedule-Aware Quiet Hours**: Time-window alert suppression (chime & LED) with full midnight-crossing / overnight support.
- **🎛️ Rotary Encoder Shortcuts & HUD**: Virtual EC11 knob supporting long-press mute (>600ms), double-click jump (<400ms), single-click task completion, and mouse wheel rotation.
- **🦇 Mascot Evolution & Tamagotchi Care**: Progressive XP system across 8 evolutionary tiers (Bat Pup → Vampire Sovereign), unlockable cosmetic attire, vitality tracking, and Care Sanctuary modal.
- **⏱️ Tactile Pomodoro & Deep Work Sprints**: Hardware focus sprint engine with 25m/5m/15m/45m profiles, retro pulsating digital timer, session metrics, and +50 XP bonus rewards.
- **🔌 Web Serial API (USB-C Hardware Link)**: Direct browser-to-ESP32 serial connection at 115200 baud with interactive packet terminal and quick action commands (`STATUS`, `LED`, `CHIME`, `RESTART`).
- **📅 External Calendar & Tool Sync (iCal / Google)**: Remote .ics subscription engine that automatically imports calendar events into directives.
- **⚡ Sub-50ms Server-Sent Events (SSE)**: Instant bi-directional real-time sync across multiple open dashboard windows and hardware devices.
- **📱 Progressive Web App (PWA) & Native Notifications**: Standalone OS installation, offline asset caching via Service Worker (`sw.js`), and Web Notification API integration.
- **🔥 Consecutive Streak Tracking**: Day-by-day task completion streak counter displayed on the dashboard and on the simulator screen (`🔥 XD`).
- **📊 7-Day Velocity Analytics**: Retro Teenage Engineering styled dual-bar chart visualizing completed vs missed tasks per day.
- **⚡ Offline-First Architecture**: Resilient localStorage caching with background mutation retry queue.

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
- **Dashboard UI**: `http://localhost:4000/` (Default PIN: `1024`)
- **System Health**: `http://localhost:4000/api/health`
- **Directives API**: `http://localhost:4000/api/tasks`

---

## ☁️ Deploying to Vercel

This repository is pre-configured with `vercel.json` for instant deployment on Vercel:

1. Push your repository to GitHub.
2. In the [Vercel Dashboard](https://vercel.com/), import your repository.
3. Keep default settings (Framework Preset: **Other**, Root Directory: `./`).
4. (Optional) Set `HOLLOW_PIN` under Environment Variables.
5. Click **Deploy**.

---

## 📡 API Reference Overview

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/auth/login` | Authenticate master PIN/password; returns HMAC token |
| `GET` | `/api/auth/verify` | Verify current session bearer token |
| `GET` | `/api/health` | Telemetry: uptime, firmware version, task counts, and database status |
| `GET` | `/api/tasks` | Get all directives sorted by status and due time |
| `GET` | `/api/tasks?pending=true` | Filter for incomplete tasks only (ESP32 polling) |
| `GET` | `/api/tasks?since=<ISO>` | Delta-sync: tasks updated after timestamp |
| `POST` | `/api/tasks` | Create directive (`title`, `due_time`, `source`) |
| `PATCH` | `/api/tasks/:id` | Update directive fields (`title`, `done`, `due_time`) |
| `DELETE` | `/api/tasks/:id` | Delete directive (204 No Content) |
| `POST` | `/api/tasks/:id/snooze` | Snooze directive by specified `minutes` |
| `GET` | `/api/settings` | Retrieve configuration singleton (quiet hours, gamification, calendar feeds) |
| `PATCH` | `/api/settings` | Update configuration with schema validation |
| `GET` | `/api/events` | Server-Sent Events (SSE) live push stream |
| `GET` | `/api/calendar/sync` | Sync and parse external .ics / Google Calendar feeds |
| `GET` | `/api/log` | Circular event telemetry log |
| `GET` | `/api/export` | Download full JSON database backup |
| `POST` | `/api/import` | Restore database from JSON backup |

---

## 📂 Project Structure

```
DESK-COMPANION/
├── api/
│   └── index.js              # Serverless API entrypoint for Vercel
├── backend/
│   ├── data.json             # Seed database file (JSON storage)
│   ├── db.js                 # lowdb database manager (with /tmp fallback for Vercel)
│   ├── routes/
│   │   ├── auth.js           # PIN authentication routes
│   │   ├── diag.js           # Health, logging, import/export routes
│   │   ├── settings.js       # Settings & quiet hours validation routes
│   │   └── tasks.js          # Directives CRUD & snooze routes
│   └── server.js             # Express application & middleware
├── public/
│   └── index.html            # Single-Page Web Dashboard & Simulator
├── package.json              # Project dependencies & scripts
├── vercel.json               # Vercel routing & rewrites configuration
├── README.md                 # Project summary
└── PROJECT_DOCUMENTATION.md  # Exhaustive master technical documentation
```

---

## ⌨️ Dashboard Shortcuts

- **`N`**: Focus on the new directive input field.
- **`Esc`**: Cancel inline directive editing.
- **Encoder Knob Long-Press (>600ms)**: Toggle audio mute with on-screen HUD badge.
- **Encoder Knob Double-Click (<400ms)**: Jump to today's next pending directive.
- **Encoder Knob Single-Click**: Mark current task completed.
- **Encoder Knob Mouse Wheel**: Rotate virtual knob and scroll directive list.

---

## 📄 Documentation

For full details on the hardware BOM, firmware architecture, LVGL layouts, and deep component documentation, read [`PROJECT_DOCUMENTATION.md`](./PROJECT_DOCUMENTATION.md).

## License
MIT
