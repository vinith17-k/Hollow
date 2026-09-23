# Desk Companion — Project Overview

_Consolidated project documentation as of current progress. Covers hardware/software architecture, the web dashboard's evolution, and the mascot/visual theme direction locked in for the redesign._

---

## 1. Project Summary

Desk Companion is a physical desk gadget built on an ESP32-S3 with a small display, rotary encoder, RGB LED, and chime speaker. It shows tasks and reminders, syncs with a backend (Firebase/Supabase), and is paired with a web interface that serves as both a task manager and the device's admin/control dashboard.

The web interface is not a simple companion app — it runs in two contexts:
1. **Served directly from the device's own local web server**, accessed via its local IP on the home Wi-Fi network (may have no internet access)
2. **Reachable via the cloud backend**, for access away from the local network

Both contexts share the same app/codebase.

---

## 2. Hardware (reference)

Referenced from a companion hardware BOM document (`desk-companion-spec.md`, not reproduced in full here). Key components relevant to software/UI decisions:

- **MCU**: ESP32-S3
- **Display**: small screen driven by TFT_eSPI
- **Input**: rotary encoder (rotate + click, debounced)
- **RTC**: DS3231 via I2C (RTClib)
- **LEDs**: WS2812B (FastLED or Adafruit_NeoPixel)
- **Audio**: MAX98357A I2S — simple tone/chime playback, no SD card or audio file decoding needed for V1

---

## 3. Firmware & Software Architecture (V1 spec)

### 3.1 Stack

| Layer | Choice |
|---|---|
| Framework | Arduino (C/C++) on ESP32-S3 |
| UI library | LVGL (v8.x) |
| Display driver | TFT_eSPI |
| Storage | LittleFS (JSON task cache) |
| Connectivity | Wi-Fi station mode, HTTPS polling |
| Backend | Firebase or Supabase (free tier) |
| Web app | Plain HTML/CSS/JS, same backend SDK |
| RTC | DS3231 via I2C (RTClib) |
| LEDs | WS2812B via FastLED or Adafruit_NeoPixel |

### 3.2 Firmware project structure

```
/firmware
  platformio.ini
  /src
    main.cpp                 // setup(), loop(), state machine driver
    config.h                 // pins, Wi-Fi creds (or NVS), backend URL
    /display
      ui_manager.cpp/.h       // screen switching, LVGL init
      ui_idle.cpp/.h
      ui_tasklist.cpp/.h
      ui_reminder.cpp/.h
      ui_offline_badge.cpp/.h
    /sync
      sync_manager.cpp/.h     // polling, HTTPS, diff logic
      task_cache.cpp/.h       // LittleFS read/write, JSON (de)serialize
    /rtc
      rtc_manager.cpp/.h
    /led
      led_controller.cpp/.h   // breathing, pulse, color-by-status
    /audio
      chime_player.cpp/.h
    /input
      encoder_input.cpp/.h    // rotate + click, debounced
  /data                       // LittleFS assets: fonts, icons
```

### 3.3 Data model

**Task schema** (shared between device and backend):

```json
{
  "id": "string",
  "title": "string",
  "due_time": "ISO8601 or unix ts",
  "done": false,
  "updated_at": "ISO8601 or unix ts",
  "source": "web|device"
}
```

**Local cache**: `/littlefs/tasks.json` — array of task objects, always holds the last successful sync. Every screen reads from this cache, never directly from the network.

**Device runtime state** (in-memory, not persisted):

```cpp
enum class Screen { IDLE, TASK_LIST, REMINDER, ADD_ON_TOP_OFFLINE_BADGE };
struct DeviceState {
  Screen current_screen;
  bool wifi_connected;
  int active_reminder_task_index; // -1 if none
  unsigned long last_sync_ms;
};
```

### 3.4 UI screens (LVGL)

- **Idle screen** — rotates every ~4s between: (1) large time + date, (2) next task title + due time, (3) contextual line ("2 tasks left today" / "All clear"). LED breathes slowly. Encoder click → Task List.
- **Task list screen** — scrollable list; encoder rotate to highlight, click to mark done or expand truncated title; read-only otherwise (no text entry).
- **Reminder/alert screen** — auto-triggers when `due_time` is reached (checked every 60s against RTC). Full-screen; LED shifts amber→red the longer unacknowledged. Chime plays once (not looping). Encoder click → Snooze 10 min / Dismiss. Multiple due tasks queue and show one at a time.
- **Offline badge** — small icon overlay (top-right), shown whenever `wifi_connected == false`. Purely visual.

**Screen transitions**: IDLE ⇄ TASK_LIST via encoder click / back-timeout; IDLE → REMINDER on due_time reached; REMINDER → previous screen on snooze/dismiss. Offline badge overlays any screen independently.

### 3.5 Sync engine

- Poll interval: 30–60s (configurable in `config.h`)
- On each poll: HTTPS GET → diff by `id` → overwrite local cache with server version → update `last_sync_ms`. On failure: cache untouched, exponential backoff capped ~5 min.
- Write-back (device → server): triggered immediately on user action (done toggles, optionally snooze/dismiss state), retried on next successful poll if it fails.
- No bidirectional conflict resolution needed — device never edits title/due_time, only ever writes `done`/snooze state.

### 3.6 LED behavior mapping

| State | Pattern |
|---|---|
| Idle, all clear | Slow white/blue breathing (2–3s cycle) |
| Idle, tasks pending | Same breathing, dimmer |
| Task due within 10 min | Amber slow pulse |
| Task overdue / reminder active | Red pulse, faster as time passes |
| Wi-Fi reconnect success | Single quick green flash, then normal |

Driven by the same due-time check used for reminders — one source of truth for "how urgent is the nearest task" feeding both LED and reminder trigger.

### 3.7 Reminder trigger logic

Every 60s tick: read RTC → scan cache for `!done && due_time <= now && not already queued` → push to in-memory reminder queue → if not already showing REMINDER screen, pop next and switch to it.

### 3.8 Backend schema

Single collection/table: `tasks`

| Field | Type | Notes |
|---|---|---|
| id | string | auto-generated |
| title | string | |
| due_time | timestamp | |
| done | boolean | default false |
| updated_at | timestamp | set on every write |
| source | string | `"web"` or `"device"` |

**Open gap identified during review**: no `settings` collection/table exists yet in the backend schema, but device settings (chime, LED brightness, snooze length, sync interval, time format) need a persistent home the device can read on poll if they're to sync between local IP and cloud contexts.

### 3.9 Open decisions (from original spec, some now resolved by later work)

- ~~LVGL widget choice for task list~~ — informed by later dot-matrix/device-chassis aesthetic direction
- ~~Whether snooze state persists across reboot~~ — simpler if it resets (still open)
- Font choice for LVGL, flashed via LittleFS — now informed by mascot/dot-matrix visual theme
- Exact chime tone sequence — still open

---

## 4. Web App Evolution

### 4.1 V1 concept (content draft)

Initial content pass for the web app established the core copy and structure:
- Sync status line ("synced just now"), task count ("0 tasks left today")
- Empty state ("All clear. Add something below.")
- Add-task affordance
- **Device settings section**, introducing configurable options beyond the original hardware spec:
  - Chime on reminder (on/off)
  - LED brightness (idle breathing + reminder pulse)
  - Default snooze length (5/10/15/30 min)
  - Sync interval (30s/45s/60s/2min)
  - Time format (24h/12h)

This surfaced a scope change from the original spec: **sync interval and snooze length become user-configurable at runtime**, rather than fixed constants in `config.h`/firmware — meaning the device needs to read these from synced settings rather than compile-time values.

### 4.2 V1 working prototype (HTML/CSS/JS)

A fully functional single-file prototype was built implementing the above:

- **Visual style**: dark theme, `Fraunces` (serif, variable weight) for headings/body, `IBM Plex Mono` for status/data — a considered, editorial, "gothic desk" aesthetic (deep ink background `#12131A`, panel `#1B1D27`, muted text, calm/soon/overdue accent colors for task urgency)
- **Task list**: add, toggle done, delete (hover-revealed), sorted by done-status then due time; urgency-colored due-time labels (calm/amber-soon/red-overdue based on time remaining)
- **Device settings panel**: all five settings from §4.1, implemented with custom toggle switches, a range slider (LED brightness), and native `<select>` dropdowns
- **Persistence**: `localStorage` only (both tasks and settings) — no real backend wiring yet
- **Responsive**: mobile-safe-area padding, flex-wrap on the add-row for small screens, `prefers-reduced-motion` handling on the breathing status dot

**Issues identified in review** (informing the redesign):
- **Functionality gaps**: no in-place task editing; no due-date validation; settings (e.g. time format) saved but didn't visibly affect rendering; static "synced just now" text never updates; silent delete with no confirmation/undo
- **Accessibility gaps**: custom toggle/switch controls are not real semantic form elements — no ARIA state, no keyboard operability; urgency conveyed by color alone with no icon/label backup; delete button only visible on hover (broken on touch devices)
- **Visual/polish gaps**: `<input type="range">` unstyled beyond `accent-color`, inconsistent across browsers; no save-confirmation feedback
- **Architectural gap**: settings have no backend home (see §3.8 gap above); local-only prototype doesn't yet reflect the dual local-IP/cloud reality of where this app actually needs to run

---

## 5. Scope Correction — What This App Actually Is

Mid-project, the web interface's role was clarified and expanded:

- It is **not** a lightweight companion app — it is the device's **primary admin/control dashboard**
- It must run in **two contexts from one codebase**: served locally from the ESP32's own web server (potentially with zero internet access) **and** reachable via the cloud backend when away from the local network
- Beyond tasks + device settings, it needs to include:
  - **Diagnostics**: Wi-Fi signal strength, connection status, uptime, last successful sync (live, not static), firmware version — with graceful, distinct handling for local-IP-no-internet vs. cloud-reachable states
  - **Admin/setup controls**: Wi-Fi credentials provisioning flow, backend URL/connection config, factory reset (with proper destructive-action confirmation) — plus suggested extras (manual sync-now, chime test, LED test/preview)
  - **A device screen simulator**: a design-verification mockup of the physical device's small display (idle/task-list/reminder states) reflecting live task and settings data — not a literal LVGL renderer, but faithful enough to check layout, truncation, and legibility at the real device's small screen size before flashing hardware

This significantly raises the technical constraints: the app must degrade gracefully with **zero internet access** (no hard dependency on external fonts/CDNs), must stay lean enough to be served from a memory-constrained device, and needs a real `settings` backend model to bridge the local/cloud duality.

---

## 6. Mascot & Visual Theme (locked direction for redesign)

### 6.1 Mascot concept

A small **shadow-demon/imp familiar** — the emotional core of the whole product, intended to appear on both the physical device's idle screen and throughout the web dashboard.

**Design characteristics**:
- Dark purple-black, rounded blob body
- Two pointed bat-like wings
- Small pointed ears
- Simple glowing white dot eyes — no pupils, no mouth; all expression comes from wing/ear posture and eye glow, never a drawn face
- A thin wisping tail that curls at the end
- A few small detached smoke/soot puffs drifting nearby

**Tone**: cool and eerie — explicitly **not cute**. Described as "a quiet familiar spirit," closer in spirit to game companions like **BD-1** (*Star Wars Jedi*) or Souls-like familiars — personality expressed through subtle posture and glow rather than exaggerated cute expression.

**State-driven behavior** (mirrors the device's LED urgency states):
| Task state | Mascot behavior |
|---|---|
| All clear / idle | Calm still posture, soft white eye glow |
| Task due soon | Wings flare slightly, eye glow shifts amber |
| Overdue / reminder active | Wings fully spread, eye glow red, tail thrashing |

Intended to be legible at small pixel-art sizes for rendering on the physical device's display, and ideally rendered in the same monochrome dot-matrix style as the device's own clock/status typography — with the eye-glow color as the single spot of state-driven accent color (white → amber → red).

### 6.2 Device/UI chassis aesthetic

Industrial, tactile, retro-digital hardware — **Teenage Engineering–inspired**:
- Matte neutral body color (warm gray/putty tones, not pure black)
- Rounded-rectangle screen bezel
- Monochrome dot-matrix/LCD-style typography for data readouts (time, status)
- A small circular dot-matrix icon/pattern as a decorative or status element
- **One single confident accent color** (warm orange), used sparingly — primary actions only
- Minimal small-caps labels
- Physical-feeling buttons/toggles (raised, tactile — not flat material-design style)

The overall goal: the app should feel like looking at the screen of a real, well-made piece of hardware — not a generic SaaS dashboard. The mascot lives "inside" this dot-matrix screen aesthetic, as if it's a creature rendered on the device's own LCD.

### 6.3 Reference material

- A pixel/vector-style shadow-demon character illustration (dark purple-black blob body, bat wings, glowing white dot eyes, curling tail, soot puffs) — direct visual reference for the mascot
- A Teenage Engineering–style hardware device photo (matte gray body, rounded black LCD screen, dot-matrix icon, large digital time readout, orange confirm button, physical up/down buttons) — direct visual reference for the chassis/UI aesthetic

---

## 7. Current Status & Next Steps

**Completed / defined:**
- Firmware architecture, data model, sync engine, and LED/reminder logic (V1 spec)
- Working HTML/CSS/JS prototype of the web app (tasks + device settings), local-storage only
- Full scope correction: this is a dual-context (local IP + cloud) admin dashboard, not a simple companion app
- Locked mascot design and device-chassis visual theme
- A comprehensive, detailed AI design prompt incorporating all of the above, ready to hand off for the actual redesign build

**Open items / not yet done:**
- `settings` collection/table not yet added to backend schema
- No real backend wiring yet (prototype is localStorage-only)
- Redesigned HTML build (tasks + settings + diagnostics + admin/setup + device screen simulator + mascot) not yet implemented
- Snooze-persistence-across-reboot decision still open
- Exact chime tone sequence still open
- Wi-Fi provisioning flow and factory-reset UX details to be fleshed out during build

---

## 8. Final Design Prompt (ready to use)

```
I'm building the web interface for "Desk Companion" — a physical desk gadget 
(ESP32-S3, small display, rotary encoder, RGB LED, I2S chime speaker, DS3231 
RTC). This is the main admin/control dashboard for the device — not a simple 
companion app — and it needs to work in two contexts: served directly from the 
device's own local web server (local IP, possibly no internet), and reachable 
via a cloud backend (Firebase/Supabase) when away from the local network. Same 
app/codebase, both contexts.

=== VISUAL THEME (locked — build everything around this) ===

MASCOT: A small shadow-demon/imp familiar — dark purple-black, rounded blob 
body, two pointed bat-like wings, small pointed ears, simple glowing white dot 
eyes (no pupils, no mouth — expression comes from wing/ear posture and eye 
glow, not a face), a thin wisping tail that curls at the end, with a few small 
detached smoke/soot puffs drifting near it. Cool and eerie, NOT cute — think 
"quiet familiar spirit," not a pet. This mascot is the emotional core of the 
whole product: it should appear on the physical device's idle screen, in the 
web dashboard, and its posture/glow should shift with task urgency (e.g. calm 
still posture + soft white eye glow when all clear; wings flare slightly + eye 
glow shifts amber when a task is due soon; wings fully spread + eye glow red, 
tail thrashing when overdue/reminder active). Render it in a way that reads 
clearly at small pixel-art sizes for the physical device's display.

DEVICE/UI CHASSIS AESTHETIC: Industrial, tactile, retro-digital hardware — 
think Teenage Engineering. Matte neutral body color (warm gray/putty, not 
pure black), rounded-rectangle screen bezel, monochrome dot-matrix/LCD-style 
typography for data (time, status), a small circular dot-matrix icon/pattern 
as a decorative or status element, one single confident accent color (warm 
orange, used sparingly — primary actions only), minimal small-caps labels, 
physical-feeling buttons/toggles (raised, tactile-looking, not flat material 
design). The overall app should feel like the screen of a piece of real, 
well-made hardware — not a generic SaaS dashboard.

Combine these two: the demon mascot lives "inside" this dot-matrix/LCD-style 
screen aesthetic — imagine it rendered in the same monochrome dot-matrix style 
as the device's clock display, with its eye-glow as the one spot of accent 
color that shifts (white → amber → red) to communicate state.

=== WHAT THE PHYSICAL DEVICE DOES (context) ===
- Idle screen: rotates every ~4s between time, next task, status line — the 
  mascot lives here
- Scrollable task list (encoder rotate/click), full-screen reminder/alert 
  screen (snooze/dismiss via encoder)
- RGB LED: breathing when idle/all-clear, amber pulse when due soon, red pulse 
  (faster over time) when overdue/reminder, green flash on Wi-Fi reconnect
- Chime plays once when a task becomes due
- Polls backend for task sync; writes back only `done` status

=== DASHBOARD SECTIONS TO BUILD ===

1. TASKS — full CRUD: add, edit in place (title + due time), toggle done, 
   delete with confirmation/undo. Group/sort by urgency. Never rely on color 
   alone for urgency — pair with icon/label too.

2. DEVICE SETTINGS — chime on/off, LED brightness, default snooze length, 
   sync interval, time format (12h/24h). Every setting must visibly take 
   effect somewhere in the UI, not just save silently.

3. DEVICE DIAGNOSTICS — Wi-Fi signal, connection status, uptime, last sync 
   (live-updating), firmware version. Handle local-IP-no-internet vs. 
   cloud-reachable contexts gracefully and differently.

4. ADMIN/SETUP — Wi-Fi credentials provisioning flow, backend URL config, 
   factory reset with proper destructive-action confirmation. Suggest 
   additional relevant controls (manual sync-now, chime test, LED test).

5. DEVICE SCREEN SIMULATOR — a mockup of the physical device's actual screen 
   (idle/task-list/reminder states), rendered in the same dot-matrix aesthetic 
   as the real hardware, with the mascot reacting live to current task urgency 
   and settings (e.g. dragging LED brightness dims the mascot's eye glow in 
   the simulator; changing time format changes the simulated clock). This is 
   a design-verification tool, not a literal LVGL renderer — just faithful 
   enough to judge layout, spacing, and mascot legibility at small size before 
   touching real hardware.

=== ACCESSIBILITY (non-negotiable) ===
- Real semantic form elements or full ARIA state + keyboard operability for 
  all custom controls
- WCAG AA contrast
- No hover-only affordances
- Never convey urgency by color alone (mascot posture + icon/label alongside)
- Respect prefers-reduced-motion

=== TECHNICAL CONSTRAINTS ===
- Single self-contained HTML file, inline CSS/JS, no build step
- Must work with zero internet access (local-IP context) — any external font 
  needs a solid system-font/monospace fallback stack
- External resources only from cdnjs.cloudflare.com, cdn.jsdelivr.net/npm/, 
  cdn.tailwindcss.com, code.jquery.com, fonts.googleapis.com/fonts.gstatic.com
- Keep the file lean — this may be served by a memory-constrained device
- Use localStorage for prototype persistence (try/catch wrapped); mark with 
  TODO comments where real device API calls would replace it (Wi-Fi config, 
  factory reset, etc.)
- Task model: { id, title, due_time, done, updated_at, source }
- Settings model: { chime_enabled, led_brightness, snooze_minutes, 
  sync_interval_sec, time_format }

=== DELIVERABLE ===
One complete HTML file. Before the code, briefly explain: your mascot 
rendering approach (SVG vs pixel-art canvas vs CSS shapes), your color system 
and typography choices, and your information architecture across the 5 
sections.
```
