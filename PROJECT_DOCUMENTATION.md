# Hollow (Desk Companion) — Comprehensive Project Documentation

> **Complete architectural reference, tech stack breakdown, component registry, API documentation, and operation manual for the Hollow ESP32 Desk Companion & Web Control System.**

---

## Table of Contents
1. [Project Overview & Design Philosophy](#1-project-overview--design-philosophy)
2. [Complete Tech Stack](#2-complete-tech-stack)
3. [System Architecture & Data Flow](#3-system-architecture--data-flow)
4. [Hardware & Simulator Breakdown (What Every Single Thing Does)](#4-hardware--simulator-breakdown-what-every-single-thing-does)
5. [Frontend Dashboard Architecture](#5-frontend-dashboard-architecture)
   - [Mascot System & Animation Engine](#mascot-system--animation-engine)
   - [Hardware Rotary Encoder & Shortcuts](#hardware-rotary-encoder--shortcuts)
   - [Schedule-Aware Quiet Hours](#schedule-aware-quiet-hours)
   - [Streak Tracking & Habit Gamification](#streak-tracking--habit-gamification)
   - [Weekly Completion Analytics](#weekly-completion-analytics)
   - [Security & Authentication Gate](#security--authentication-gate)
   - [Offline Cache & Mutation Queue](#offline-cache--mutation-queue)
   - [Tabs & Functional Panels](#tabs--functional-panels)
6. [Backend API & Server Architecture](#6-backend-api--server-architecture)
   - [Every API Endpoint Explained](#every-api-endpoint-explained)
   - [Database Layer & Serverless Adaptations](#database-layer--serverless-adaptations)
7. [Repository File-by-File Directory Guide](#7-repository-file-by-file-directory-guide)
8. [Installation, Configuration & Deployment Guide](#8-installation-configuration--deployment-guide)

---

## 1. Project Overview & Design Philosophy

**Hollow** is an intelligent desk companion and task assistant system featuring a bat mascot ("Hollow"), built as an interactive companion device and administrative control center.

The project bridges physical hardware and modern web technologies:
1. **Physical Device (ESP32-S3)**: Sits on the desk with a TFT color display, rotary encoder knob, RGB status NeoPixel LED, and I2S chime speaker. It informs the user of active directives, upcoming deadlines, and urgency alerts.
2. **Web Control Dashboard & Hardware Simulator**: A tactile, Teenage Engineering / industrial-inspired web interface that serves dual purposes:
   - As an **interactive digital twin / simulator** replicating the screen, LEDs, encoder knob, and sound effects right in the browser.
   - As a **comprehensive task manager and system provisioning console** allowing remote configuration, scheduling, analytics, and telemetry monitoring.
3. **Resilient REST API**: Operates locally on the ESP32 / Node.js or deployed as serverless functions on Vercel, providing data sync, delta polling, and diagnostic logging.

### Design Principles
- **Tactile Retro-Futuristic Aesthetic**: Uses CRT scanline effects, monospaced typography, chamfered hardware buttons, and custom SVG mascot vectors.
- **Fail-Safe Offline Operation**: Optimistic UI updates with localStorage caching and background retry queues ensure zero data loss during network hiccups.
- **Alert Sensitivity**: Respects human focus through customizable Schedule-Aware Quiet Hours and instant mute shortcuts.

---

## 2. Complete Tech Stack

### 2.1 Hardware Specification (Physical Target)
| Component | Part / Library | Purpose |
|---|---|---|
| **Microcontroller (MCU)** | ESP32-S3 (240MHz Dual-Core, Wi-Fi + BLE) | Main controller running FreeRTOS state loop |
| **Display** | 1.8" - 2.4" SPI TFT (ST7789 or ILI9341) via TFT_eSPI / LVGL | Renders mascot animations, clock, HUD, and task cards |
| **Rotary Encoder** | EC11 Rotary Encoder with push-button | Physical navigation: rotate to scroll, click to complete, double-click to jump, hold to mute |
| **RGB LED** | WS2812B NeoPixel | Ambient focus lighting and color-coded urgency alerts |
| **Audio DAC / Amp** | MAX98357A I2S 3W Class-D Amplifier | Synthesized reminder chimes and feedback tones |
| **Real-Time Clock (RTC)** | DS3231 I2C High-Precision RTC | Maintains accurate scheduling and quiet hour tracking across power cuts |
| **Storage** | LittleFS Flash Filesystem | Local JSON caching of directives on the microcontroller |

### 2.2 Frontend Web Architecture
- **Language**: Vanilla Modern JavaScript (ES2022 / ES modules) — zero heavy runtime overhead, loads instantaneously.
- **Styling**: Tailwind CSS (Utility classes) combined with custom CSS variables, CRT scanline masks, tactile bevels, and micro-keyframes.
- **Audio Synthesizer**: **Web Audio API** — synthesizes dual-tone sine-wave chime sequences (880Hz $\rightarrow$ 1760Hz) directly in the browser without external audio assets.
- **State Storage**:
  - `localStorage`: Directives cache, custom settings, custom backend URL, and mutation retry buffer.
  - `sessionStorage`: Ephemeral cryptographically signed authentication session tokens.

### 2.3 Backend API & Server Architecture
- **Runtime**: Node.js ($\ge$ 18.x)
- **Web Framework**: Express 4.x
- **Persistence Engine**: Lowdb (Lightweight JSON flat-file storage) with auto-detection for serverless environments (graceful fallback to `/tmp/data.json` under AWS Lambda / Vercel Serverless).
- **Security & Cryptography**: Native Node.js `crypto` module implementing timing-safe HMAC token verification (`crypto.timingSafeEqual`) to prevent side-channel timing attacks.
- **Middleware**: CORS, Body Parser (JSON & URL-encoded), custom logging interceptor.

### 2.4 Deployment & Infrastructure
- **Vercel Serverless Platform**: Deployed with zero-configuration routing (`vercel.json` rewrites) serving static frontend assets from `/public` and routing `/api/*` to Node.js serverless lambdas.
- **Git / GitHub**: Automated deployment pipeline linked to `main` branch.

---

## 3. System Architecture & Data Flow

```
                      ┌──────────────────────────────────────┐
                      │        PHYSICAL ESP32-S3 DEVICE       │
                      │  - LVGL Display  - NeoPixel LED      │
                      │  - EC11 Encoder  - I2S Chime         │
                      └──────────────────┬───────────────────┘
                                         │ HTTPS Polling (/api/tasks?pending=true)
                                         ▼
┌─────────────────────────┐   REST API    ┌───────────────────────────────────┐
│     BROWSER CLIENT      │ ────────────> │        HOLLOW REST BACKEND        │
│ - Virtual LCD Simulator │ <──────────── │  - Express 4.x Server             │
│ - Directives Management │   JSON Data   │  - Lowdb / Flat-file JSON Store   │
│ - Quiet Hours & Moods   │               │  - HMAC Token Auth Protection     │
│ - 7-Day Analytics       │               │  - Telemetry Logger               │
└─────────────────────────┘               └───────────────────────────────────┘
```

### Data Synchronization Flow
1. **Delta Polling**: Clients query `/api/tasks?since=<ISO_TIMESTAMP>` or periodic intervals (configured via `settings.sync_interval_sec`).
2. **Optimistic Local Mutation**: Every user action (create, toggle done, snooze, delete) immediately mutates in-memory state and updates the UI in under 1 millisecond.
3. **Background Sync & Retry**: Requests are dispatched asynchronously to the API. If the network is unreachable, requests are automatically pushed into `dc_retry_queue` in `localStorage` and flushed upon reconnection.
4. **Stale Sync Warning**: The dashboard tracks the exact millisecond of the last sync and notifies the user with relative elapsed time tags (`synced 12s ago`). If sync exceeds 5 minutes, indicators shift to amber (`STALE`).

---

## 4. Hardware & Simulator Breakdown (What Every Single Thing Does)

On the left pane of the Hollow dashboard is the **Interactive Hardware Simulator**, faithfully mirroring the physical gadget:

```
┌────────────────────────────────────────────────────────┐
│ [LED] (WS2812B)                      HOLLOW SIMULATOR  │
├────────────────────────────────────────────────────────┤
│ ┌────────────────────────────────────────────────────┐ │
│ │ 12:45 PM           [🔥 3D] [🌙 QUIET] [🔇 MUTED]    │ │
│ │                                                    │ │
│ │                 /\_/\                              │ │
│ │                ( o.o )   <-- Hollow Bat Mascot     │ │
│ │                 > ^ <        (Moods + Idle Anims)  │ │
│ │                                                    │ │
│ │ [OVERDUE]                                          │ │
│ │ Review quarterly design deck                       │ │
│ │ ────────────────────────────────────────────────── │ │
│ │ [HUD POPUP BANNER: JUMP: REVIEW...]                │ │
│ └────────────────────────────────────────────────────┘ │
│                                                        │
│ [AUTO] [IDLE] [WORK] [URGENT] [SLEEP]    (○) ENCODER   │
│                                          (Rotary Knob) │
└────────────────────────────────────────────────────────┘
```

### 4.1 Virtual LCD Screen (`#sim-screen`)
- **CRT Scanlines**: Overlay pattern simulating low-refresh retro displays.
- **Dynamic Clock (`#sim-clock`)**: Displays real-time hour and minutes, formatted according to user preference (12H vs 24H) and configured IANA Timezone.
- **Status Badges (Top-Right HUD)**:
  - **`#sim-quiet-badge` (🌙 QUIET)**: Appears automatically during active Quiet Hours windows.
  - **`#sim-mute-badge` (🔇 MUTED)**: Lights up when hardware audio is muted via encoder long-press.
  - **`#sim-streak-badge` (🔥 XD)**: Appears whenever the user sustains a consecutive completion streak of 3 or more days.
- **Mascot Stage (`#mascot-container`)**: Contains the procedural SVG bat mascot with layered CSS animations for base states, emotional moods, and idle micro-twitches.
- **Urgency Banner (`#sim-status-label`)**:
  - `NO TASKS`: All directives are completed.
  - `DUE IN XM` / `DUE IN XH`: Next upcoming task countdown.
  - `[OVERDUE]`: Directives requiring immediate attention.
  - `[QUIET: OVERDUE]`: Directives due during quiet hours (alerts silenced).
  - `SNOOZED XM`: Active snooze countdown.
- **Active Task Title (`#sim-task-title`)**: Shows the name of the highest-priority directive currently active.
- **HUD Temporary Banner (`#sim-hud-popup`)**: Pops up dynamic feedback when encoder actions are triggered (e.g., `AUDIO MUTED`, `JUMP: TASK NAME`, `DONE: TASK NAME`).

### 4.2 NeoPixel RGB Alert LED (`#hw-led`)
- Simulates the physical WS2812B multi-color LED.
- **Brightness**: Controlled by `settings.led_brightness` (1% to 100%).
- **Color Logic**:
  - **Idle / Normal**: Soft ambient white glow (10% brightness).
  - **Working / Due within 1 hour**: Warm amber glow (`#d97706`).
  - **Urgent / Overdue**: High-visibility red pulse (`#dc2626`).
  - **Quiet Hours / Muted**: Forced to soft white, suppressing high-intensity pulsing.

### 4.3 Interactive Rotary Encoder (`#hw-encoder`)
- Simulates the EC11 mechanical encoder knob.
- **Pointer Down / Up Timing**:
  - **Long-Press (>600ms)**: Toggles global audio mute. Displays HUD confirmation and suppresses reminder chimes.
  - **Double-Click (<400ms)**: Jumps immediately to today's next pending task, auto-switches to the Directives tab, scrolls to the item, and triggers a pulsing ring animation.
  - **Single Click**: Toggles the nearest pending task as completed.
  - **Mouse Wheel Rotation**: Rotates the physical notch on the knob (`#hw-encoder-notch`) and scrolls through the directives database.

---

## 5. Frontend Dashboard Architecture

### Mascot System & Animation Engine
The Hollow mascot uses a two-tier state system: **Base Urgency States** + **Secondary Mood Layer** + **Idle Micro-Animations**.

1. **Base States**:
   - `state-idle`: Calm breathing animation (`idleFloat`), eyes wide, ears relaxed.
   - `state-working`: Focused bobbing (`workingPulse`), ears tilted forward.
   - `state-urgent`: Rapid jitter (`urgentJitter`), flared ears, glowing accent eyes.
   - `state-sleeping`: Head slumped (`sleepSlump`), closed eyes, slow deep breathing.

2. **Secondary Mood System (`computeMascotMood`)**:
   Calculated dynamically from the user's daily task completion velocity:
   - **`mood-neutral`**: No tasks scheduled or tasks pending without urgency.
   - **`mood-content`**: $\ge 50\%$ of today's directives completed. Displays a joyful ear perk.
   - **`mood-satisfied`**: $100\%$ of today's directives completed. Wing flap celebrations!
   - **`mood-restless`**: Overdue tasks exist and 0 completed today. Jittery ear vibrations.

3. **Idle Micro-Animations (`startMicroAnimations`)**:
   When the device has been in idle state for between 20 and 40 seconds without user interaction, it randomly triggers one of three natural micro-animations:
   - `micro-blink`: Natural, subtle eye blink.
   - `micro-ear-twitch`: Quick perk and twitch of the left and right ears.
   - `micro-wing-flutter`: Rapid feather flutter of the folded wings.

### Schedule-Aware Quiet Hours
Defined in the **Config** tab to prevent unwanted audio and visual distractions during sleep, meetings, or focus blocks:
- **Time Windows**: Define custom start time (`HH:MM`) and end time (`HH:MM`).
- **Overnight Support**: Seamlessly handles midnight-crossing windows (e.g., `22:00` to `07:30`).
- **Day Masking**: Individual toggles for Sun–Sat with quick presets: *All*, *Weekdays*, *Weekends*.
- **Alert Suppression Engine**:
  ```javascript
  const isQuiet = isQuietHoursActive(now, settings);
  if (isQuiet || isMuted) {
      // Audio chime suppressed
      // LED locked to soft ambient white (no red flash)
      // Visual indicator changed to [QUIET: OVERDUE]
  }
  ```

### Streak Tracking & Habit Gamification
- Automatically evaluates completed days consecutively backwards from today.
- Displays `🔥 Xd streak` in the main directive header.
- Displays `🔥 XD` on the simulator screen whenever streak reaches $\ge 3$ days.
- Synchronized to `settings.current_streak` in the backend.

### Weekly Completion Analytics
Dedicated **Analytics Tab** (`#panel-analytics`) providing insight into directive completion habits:
- **Retro Velocity Bar Chart**:
  - Displays daily completion volume for the last 7 calendar days.
  - **Green Bar**: Completed directives.
  - **Red Bar**: Missed or overdue directives.
  - Interactive hover tooltips displaying exact numbers.
- **KPI Metrics**:
  - **7-Day Completion Rate**: Percentage ratio of completed vs total tasks.
  - **Completed (7d)**: Total volume of directives finished.
  - **Missed / Overdue**: Directives that elapsed past their deadlines.
  - **Current Streak**: Active consecutive day count.
  - **Best Performance**: Identifies the user's most productive day of the week.

### Security & Authentication Gate
- **Modal Lock Screen (`#auth-gate`)**: Gates access on dashboard load until unlocked with master PIN / password.
- **Timing-Safe Comparison**: Prevents PIN enumeration attacks by comparing hashes in constant time via `crypto.timingSafeEqual`.
- **Bearer Token**: Authenticated sessions store an HMAC token in `sessionStorage` and append `Authorization: Bearer <token>` to all subsequent API mutations.
- **Manual Lock**: Header features a `🔒 Lock` button to invalidate session on demand.

### Tabs & Functional Panels
| Tab ID | Name | Core Responsibilities |
|---|---|---|
| `#panel-tasks` | **Directives** | Task creation, date/time scheduling, rollover warnings, inline editing, complete toggle, snooze, multi-level undo deletion |
| `#panel-focus` | **Focus** | Pomodoro focus sprint engine with 25m/5m/15m/45m profiles, retro digital timer, session stats, mascot deep work sync, +50 XP reward |
| `#panel-settings` | **Config** | Chime toggle, LED brightness, snooze duration, 12H/24H format, timezone selector, cloud endpoint URL, quiet hours schedule, iCal feed subscription |
| `#panel-analytics` | **Analytics** | 7-day completion chart, completion rate KPI, completed vs missed counts, streak performance |
| `#panel-serial` | **Serial** | Web Serial API USB-C link at 115200 baud, real-time command terminal, quick hardware packets (STATUS, LED, CHIME, RESTART) |
| `#panel-diag` | **Telemetry** | System diagnostics (uptime, RAM, firmware, ping latency, API status) and raw circular event log stream |
| `#panel-admin` | **Admin** | Wi-Fi credential provisioning, isolated Danger Zone with Force Cloud Sync and Factory Reset ("RESET" prompt) |

---

## 6. Backend API & Server Architecture

The backend is built with Express 4.x and designed to work both as a standalone Node server and inside Vercel's serverless runtime.

### Every API Endpoint Explained

#### 1. Authentication
- **`POST /api/auth/login`**:
  - **Body**: `{ "pin": "1024" }`
  - **Action**: Compares submitted PIN with `HOLLOW_PIN` environment variable (default: `1024`). Returns a signed base64 HMAC token.
  - **Response**: `{ "status": "authenticated", "token": "..." }`
- **`GET /api/auth/verify`**:
  - **Header**: `Authorization: Bearer <token>`
  - **Action**: Verifies token validity and signature. Returns 200 OK or 401 Unauthorized.

#### 2. Directives (Tasks) CRUD
- **`GET /api/tasks`**:
  - **Query Params**:
    - `?pending=true`: Returns only incomplete directives (used by ESP32 to save RAM).
    - `?since=<ISO>`: Delta-sync; returns only directives created or updated after timestamp.
  - **Response**: Array of task objects sorted by done state and due time.
- **`POST /api/tasks`**:
  - **Body**: `{ "title": "Buy coffee", "due_time": "2026-09-24T10:00:00Z", "source": "web" }`
  - **Action**: Validates title (1-32 chars) and ISO date. Assigns unique ID (`t_<timestamp>_<rand>`), sets `done: false`, logs event.
  - **Response**: Created task object (201 Created).
- **`PATCH /api/tasks/:id`**:
  - **Body**: `{ "done": true }` or `{ "title": "New Title", "due_time": "..." }`
  - **Action**: Partially updates directive fields, updates `updated_at` timestamp.
  - **Response**: Updated task object.
- **`DELETE /api/tasks/:id`**:
  - **Action**: Removes directive from database. Returns 204 No Content.
- **`POST /api/tasks/:id/snooze`**:
  - **Body**: `{ "minutes": 15 }`
  - **Action**: Calculates `snoozed_until = now + minutes * 60000`, logs snooze event.
  - **Response**: `{ "status": "snoozed", "id": "...", "snoozed_until": "..." }`

#### 3. Device Configuration
- **`GET /api/settings`**:
  - **Response**: Singleton configuration object:
    ```json
    {
      "chime_enabled": true,
      "led_brightness": 80,
      "snooze_minutes": 15,
      "sync_interval_sec": 30,
      "time_format": "12",
      "timezone": "UTC",
      "quiet_hours_enabled": false,
      "quiet_hours_windows": [],
      "current_streak": 0
    }
    ```
- **`PATCH /api/settings`**:
  - **Body**: Partial update object with strict schema validation:
    - `quiet_hours_windows`: Array of `{ id, start, end, days }` validated with `^([01]\d|2[0-3]):[0-5]\d$` regex and `0..6` day bounds.
    - `current_streak`: Number between `0` and `9999`.
    - `led_brightness`: Number between `1` and `100`.

#### 4. Real-Time Streaming & Calendar Integrations
- **`GET /api/events`**:
  - **Headers**: `text/event-stream`, `Cache-Control: no-cache`
  - **Action**: Opens a persistent Server-Sent Events (SSE) pipe. Streams instant push events (`tasks_changed`, `settings_changed`, `xp_gained`) to all open dashboards within 50ms of any mutation.
- **`GET /api/calendar/sync`**:
  - **Query Params**: `?url=<encoded_ics_url>`
  - **Action**: Fetches external .ics calendar feeds (Google Calendar, Apple, Outlook) using Node native HTTP/HTTPS with redirect resolution. Parses `BEGIN:VEVENT` blocks, parses DTSTART, and creates desk directives for upcoming calendar events with `source: 'ical'`.

#### 5. System Diagnostics & Backup
- **`GET /api/health`**:
  - **Response**: System status report (`status: "ok"`, firmware version, formatted uptime, total directives count, pending count, database engine).
- **`GET /api/log`**:
  - **Query Params**: `?limit=30`
  - **Response**: Array of recent circular system logs (`ts`, `level`, `message`, `detail`).
- **`GET /api/export`**:
  - **Response**: Raw JSON download containing complete database backup (`tasks`, `settings`, `logs`).
- **`POST /api/import`**:
  - **Body**: JSON database backup file. Restores and overwrites data store.

### Database Layer & Serverless Adaptations (`backend/db.js`)
On standard servers, lowdb reads and writes directly to `backend/data.json`. However, on AWS Lambda and Vercel Serverless, the root project directory is read-only.
`backend/db.js` detects write restrictions and gracefully mirrors the active database file into `/tmp/data.json`, ensuring persistent reads and non-crashing writes across serverless invocations.

---

## 7. Repository File-by-File Directory Guide

```
c:\Users\vinit\Projects\DESK-COMPANION\
├── api/
│   └── index.js                      # Serverless entry point for Vercel; imports Express app
├── backend/
│   ├── data.json                     # Seed / local JSON flat-file database
│   ├── db.js                         # Database controller & /tmp fallback with gamification schema
│   ├── server.js                     # Main Express 4.x application, SSE stream & route registrations
│   └── routes/
│       ├── auth.js                   # PIN login & verify routes with crypto timingSafeEqual
│       ├── calendar.js               # iCal / Google Calendar parser & sync engine
│       ├── diag.js                   # Health check, circular logging, export & import routes
│       ├── settings.js               # Device settings schema validation & update routes
│       └── tasks.js                  # Directives CRUD, XP progression & SSE broadcasting
├── public/
│   ├── index.html                    # Single-Page App with all 6 major subsystems & tactile UI
│   ├── manifest.json                 # Web App Manifest for standalone PWA installation
│   └── sw.js                         # Service Worker for offline asset caching & network-first fallback
├── .gitignore                        # Git exclusion rules (node_modules, logs, cache)
├── package.json                      # Node.js project manifest & dependencies
├── vercel.json                       # Vercel deployment routes and serverless configuration
├── README.md                         # Project overview and quick start
└── PROJECT_DOCUMENTATION.md          # Comprehensive master technical documentation (This file)
```

---

## 8. Installation, Configuration & Deployment Guide

### 8.1 Local Development

#### Prerequisites
- Node.js version $\ge$ 18.x
- npm

#### Step 1: Install Dependencies
```bash
npm install
```

#### Step 2: Environment Variables (Optional)
You can configure a custom PIN or port by setting environment variables in your terminal or `.env` file:
```env
PORT=4000
HOLLOW_PIN=1024
```

#### Step 3: Run the Server
```bash
npm start
```
The server will boot on `http://localhost:4000`:
- **Dashboard UI**: `http://localhost:4000/`
- **Health Telemetry**: `http://localhost:4000/api/health`

---

### 8.2 Deploying to Vercel

The project is pre-configured with `vercel.json` for zero-configuration serverless deployments:

1. Push your repository to GitHub:
   ```bash
   git add .
   git commit -m "feat: updates"
   git push origin main
   ```
2. Log into the [Vercel Dashboard](https://vercel.com).
3. Click **Add New...** $\rightarrow$ **Project** and select your GitHub repository.
4. Set Framework Preset to **Other**, leave Root Directory as `./`.
5. Under **Environment Variables**, optionally set:
   - `HOLLOW_PIN`: Your desired master PIN (defaults to `1024` if unset).
6. Click **Deploy**.

Vercel will build the project and provide your live URL (e.g. `https://backend-green-two-67.vercel.app`).

---

### 8.3 ESP32 Firmware Polling Protocol

The physical ESP32 device queries the backend using lightweight HTTP GET requests:

1. **Task Fetching**:
   ```http
   GET /api/tasks?pending=true HTTP/1.1
   Host: backend-green-two-67.vercel.app
   ```
   The ESP32 parses the incoming JSON array into LittleFS cache `/littlefs/tasks.json`.

2. **Marking a Task Completed from the Knob Click**:
   ```http
   PATCH /api/tasks/t_1710000000000_abc HTTP/1.1
   Host: backend-green-two-67.vercel.app
   Content-Type: application/json

   {"done": true}
   ```

3. **Fetching Quiet Hours Configuration**:
   ```http
   GET /api/settings HTTP/1.1
   Host: backend-green-two-67.vercel.app
   ```
   The device reads `quiet_hours_enabled` and `quiet_hours_windows` to enforce silent hours locally using its onboard DS3231 RTC clock, even if Wi-Fi disconnects.

---
*Maintained by the Hollow Core Team — 2026.*
