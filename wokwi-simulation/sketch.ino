/**
 * Hollow ESP32 Desk Companion — Wokwi Physical Circuit Firmware
 * 
 * Hardware Connected in Simulation:
 *  - ESP32-WROOM-32 / DevKit v4
 *  - 2.4" / 1.3" Color TFT SPI Display (ILI9341 320x240 / ST7789)
 *  - KY-040 Rotary Encoder (CLK: GPIO 4, DT: GPIO 16, SW: GPIO 17)
 *  - WS2812B NeoPixel RGB LED (DIN: GPIO 21)
 *  - Piezo Buzzer Speaker (GPIO 22)
 *  - Virtual Wi-Fi Gateway ("Wokwi-GUEST")
 */

#include <WiFi.h>
#include <HTTPClient.h>
#include <WiFiClientSecure.h>
#include <ArduinoJson.h>
#include <Adafruit_GFX.h>
#include <Adafruit_ILI9341.h>
#include <Adafruit_NeoPixel.h>

// ── Pin Configuration ────────────────────────────────────────────────────────
#define TFT_CS    15
#define TFT_RST   -1
#define TFT_DC     5
#define TFT_MOSI  23
#define TFT_SCLK  18

#define ENCODER_CLK  4
#define ENCODER_DT  16
#define ENCODER_SW  17

#define LED_PIN     21
#define LED_COUNT    1

#define BUZZER_PIN  22

// ── Hardware Peripherals ──────────────────────────────────────────────────────
Adafruit_ILI9341 tft = Adafruit_ILI9341(TFT_CS, TFT_DC, TFT_RST);
Adafruit_NeoPixel pixel(LED_COUNT, LED_PIN, NEO_GRB + NEO_KHZ800);

// ── Task Data Structure ──────────────────────────────────────────────────────
struct Task {
  String id;
  String title;
  String dueTime;
  bool done;
  bool overdue;
};

#define MAX_TASKS 5
Task tasks[MAX_TASKS];
int taskCount = 0;
int selectedTaskIdx = 0;

// ── Encoder State ────────────────────────────────────────────────────────────
int lastClk = HIGH;
unsigned long lastBtnPress = 0;
bool isMuted = false;
int batEyeFrame = 0;
unsigned long lastAnimTime = 0;
unsigned long lastClockTime = 0;
int clockSeconds = 45;
int clockMinutes = 24;
int clockHours = 10;

// ── Colors (RGB565) ──────────────────────────────────────────────────────────
#define COLOR_BG        0x0841  // Very dark obsidian green-gray
#define COLOR_PANEL     0x18C3  // Dark slate chassis
#define COLOR_TEXT      0xFFFF  // Crisp white
#define COLOR_MUTED     0x7BEF  // Light gray
#define COLOR_AMBER     0xFDA0  // Retro amber highlight
#define COLOR_EMERALD   0x07E0  // Neon green
#define COLOR_RED       0xF800  // Urgent red
#define COLOR_INDIGO    0x4A7F  // Deep focus indigo

// ── Audio Synthesizer Tones ──────────────────────────────────────────────────
void playTone(int freq, int durationMs) {
  if (isMuted) return;
  tone(BUZZER_PIN, freq, durationMs);
  delay(durationMs);
  noTone(BUZZER_PIN);
}

void playChime() {
  if (isMuted) return;
  tone(BUZZER_PIN, 523, 70); delay(75);
  tone(BUZZER_PIN, 659, 70); delay(75);
  tone(BUZZER_PIN, 784, 70); delay(75);
  tone(BUZZER_PIN, 1046, 140); delay(150);
  noTone(BUZZER_PIN);
}

void playClick() {
  if (isMuted) return;
  tone(BUZZER_PIN, 2400, 12);
  delay(12);
  noTone(BUZZER_PIN);
}

// ── Pixel Art Mascot Rendering ───────────────────────────────────────────────
void drawMascot(int cx, int cy, bool blink) {
  // Clear Mascot Area
  tft.fillRect(cx - 35, cy - 25, 70, 50, COLOR_PANEL);

  // Wings (Obsidian Violet)
  tft.fillTriangle(cx - 10, cy, cx - 32, cy - 12, cx - 28, cy + 14, COLOR_INDIGO);
  tft.fillTriangle(cx + 10, cy, cx + 32, cy - 12, cx + 28, cy + 14, COLOR_INDIGO);

  // Body
  tft.fillRoundRect(cx - 14, cy - 14, 28, 28, 8, 0x18F3);

  // Ears
  tft.fillTriangle(cx - 10, cy - 14, cx - 14, cy - 24, cx - 4, cy - 14, 0x3198);
  tft.fillTriangle(cx + 10, cy - 14, cx + 14, cy - 24, cx + 4, cy - 14, 0x3198);

  // Glowing Eyes
  if (blink) {
    // Closed blinking line
    tft.drawFastHLine(cx - 8, cy - 3, 6, COLOR_AMBER);
    tft.drawFastHLine(cx + 2, cy - 3, 6, COLOR_AMBER);
  } else {
    // Open amber glowing eyes
    tft.fillCircle(cx - 5, cy - 3, 3, COLOR_AMBER);
    tft.fillCircle(cx + 5, cy - 3, 3, COLOR_AMBER);
    tft.drawPixel(cx - 4, cy - 4, COLOR_TEXT);
    tft.drawPixel(cx + 6, cy - 4, COLOR_TEXT);
  }
}

// ── Screen Rendering ─────────────────────────────────────────────────────────
void renderUI() {
  tft.fillScreen(COLOR_BG);

  // Top Status Bar Header
  tft.fillRect(0, 0, 320, 24, COLOR_PANEL);
  tft.setTextColor(COLOR_TEXT);
  tft.setTextSize(1);
  tft.setCursor(8, 8);
  tft.print("HOLLOW DESK COMPANION  [WIFI: OK]");

  tft.setCursor(240, 8);
  char timeBuf[12];
  sprintf(timeBuf, "%02d:%02d:%02d", clockHours, clockMinutes, clockSeconds);
  tft.print(timeBuf);

  // Mascot Center Bay
  tft.fillRoundRect(10, 32, 300, 72, 8, COLOR_PANEL);
  tft.drawRoundRect(10, 32, 300, 72, 8, COLOR_MUTED);

  drawMascot(60, 68, false);

  tft.setTextSize(2);
  tft.setTextColor(COLOR_AMBER);
  tft.setCursor(110, 44);
  tft.print("BAT PUP (LV 1)");

  tft.setTextSize(1);
  tft.setTextColor(COLOR_MUTED);
  tft.setCursor(110, 68);
  tft.print("COMPANION STATUS: READY & ATTENTIVE");
  tft.setCursor(110, 82);
  tft.print("ROTARY ENCODER: TURN / CLICK");

  // Task Directives List
  tft.setTextSize(1);
  tft.setTextColor(COLOR_AMBER);
  tft.setCursor(12, 114);
  tft.print("ACTIVE DIRECTIVES (ROTATE TO SELECT, CLICK TO COMPLETE):");

  renderTaskList();
}

void renderTaskList() {
  int startY = 130;
  for (int i = 0; i < taskCount; i++) {
    int y = startY + (i * 20);
    bool isSelected = (i == selectedTaskIdx);

    if (isSelected) {
      tft.fillRect(10, y - 2, 300, 18, 0x2A69);
      tft.drawRect(10, y - 2, 300, 18, COLOR_AMBER);
      tft.setTextColor(COLOR_AMBER);
    } else {
      tft.fillRect(10, y - 2, 300, 18, COLOR_PANEL);
      tft.setTextColor(tasks[i].done ? COLOR_MUTED : COLOR_TEXT);
    }

    tft.setCursor(16, y + 3);
    tft.print(tasks[i].done ? "[X] " : "[ ] ");
    tft.print(tasks[i].title);

    tft.setCursor(235, y + 3);
    tft.setTextColor(tasks[i].overdue ? COLOR_RED : COLOR_MUTED);
    tft.print(tasks[i].dueTime);
  }
}

// ── Load Sample Tasks ────────────────────────────────────────────────────────
void loadSampleTasks() {
  tasks[0] = { "t1", "Deploy Firmware Patch v1.2", "15:30", false, false };
  tasks[1] = { "t2", "Quantum Circuit Test Run",   "16:45", false, false };
  tasks[2] = { "t3", "Calibrate Rotary Encoder",    "18:00", false, false };
  tasks[3] = { "t4", "Sync Directives to Cloud",   "19:30", true,  false };
  taskCount = 4;
}

// ── Wi-Fi & Live Cloud Sync ──────────────────────────────────────────────────
void connectWiFiAndSync() {
  Serial.println("[WIFI] Connecting to Wokwi-GUEST...");
  WiFi.begin("Wokwi-GUEST", "", 6);

  int tries = 0;
  while (WiFi.status() != WL_CONNECTED && tries < 20) {
    delay(200);
    Serial.print(".");
    tries++;
  }

  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("\n[WIFI] Connected! IP: " + WiFi.localIP().toString());
    pixel.setPixelColor(0, pixel.Color(0, 200, 100)); // Emerald
    pixel.show();
  } else {
    Serial.println("\n[WIFI] Offline mode. Using embedded cache.");
    pixel.setPixelColor(0, pixel.Color(200, 120, 0)); // Amber
    pixel.show();
  }
}

// ── Setup ────────────────────────────────────────────────────────────────────
void setup() {
  Serial.begin(115200);
  Serial.println("\n==========================================");
  Serial.println("  HOLLOW ESP32 PHYSICAL DESK COMPANION");
  Serial.println("  Wokwi Interactive Hardware Simulator");
  Serial.println("==========================================");

  // Initialize Neopixel
  pixel.begin();
  pixel.setBrightness(120);
  pixel.setPixelColor(0, pixel.Color(120, 60, 255)); // Purple focus boot
  pixel.show();

  // Initialize Buzzer
  pinMode(BUZZER_PIN, OUTPUT);

  // Initialize Rotary Encoder
  pinMode(ENCODER_CLK, INPUT);
  pinMode(ENCODER_DT, INPUT);
  pinMode(ENCODER_SW, INPUT_PULLUP);
  lastClk = digitalRead(ENCODER_CLK);

  // Initialize TFT Display
  tft.begin();
  tft.setRotation(1); // Landscape 320x240

  // Splash Boot Screen
  tft.fillScreen(COLOR_BG);
  tft.setTextColor(COLOR_AMBER);
  tft.setTextSize(2);
  tft.setCursor(30, 90);
  tft.print("HOLLOW DESK COMPANION");
  tft.setTextSize(1);
  tft.setTextColor(COLOR_MUTED);
  tft.setCursor(50, 125);
  tft.print("Booting ESP32 Hardware Core & Peripherals...");

  playChime();
  loadSampleTasks();
  connectWiFiAndSync();

  renderUI();
}

// ── Main Loop ────────────────────────────────────────────────────────────────
void loop() {
  unsigned long nowMs = millis();

  // 1. Clock & Mascot Eye-Blink Tick
  if (nowMs - lastClockTime >= 1000) {
    lastClockTime = nowMs;
    clockSeconds++;
    if (clockSeconds >= 60) { clockSeconds = 0; clockMinutes++; }
    if (clockMinutes >= 60) { clockMinutes = 0; clockHours++; }
    if (clockHours >= 24) clockHours = 0;

    // Update Header Clock
    tft.fillRect(240, 6, 75, 14, COLOR_PANEL);
    tft.setTextColor(COLOR_TEXT);
    tft.setTextSize(1);
    tft.setCursor(240, 8);
    char timeBuf[12];
    sprintf(timeBuf, "%02d:%02d:%02d", clockHours, clockMinutes, clockSeconds);
    tft.print(timeBuf);

    // Mascot Eye Blinks every 4 seconds
    batEyeFrame = (batEyeFrame + 1) % 4;
    drawMascot(60, 68, (batEyeFrame == 0));
  }

  // 2. Rotary Encoder Rotation Detection
  int currentClk = digitalRead(ENCODER_CLK);
  if (currentClk != lastClk && currentClk == LOW) {
    if (digitalRead(ENCODER_DT) != currentClk) {
      // Clockwise
      selectedTaskIdx = (selectedTaskIdx + 1) % taskCount;
      Serial.printf("[ENCODER] ROTATE CW -> Index %d\n", selectedTaskIdx);
    } else {
      // Counter-Clockwise
      selectedTaskIdx = (selectedTaskIdx - 1 + taskCount) % taskCount;
      Serial.printf("[ENCODER] ROTATE CCW -> Index %d\n", selectedTaskIdx);
    }
    playClick();
    renderTaskList();
  }
  lastClk = currentClk;

  // 3. Rotary Encoder Push Button Click Detection
  if (digitalRead(ENCODER_SW) == LOW) {
    if (nowMs - lastBtnPress > 350) { // Debounce
      lastBtnPress = nowMs;

      // Toggle Task Done
      tasks[selectedTaskIdx].done = !tasks[selectedTaskIdx].done;
      Serial.printf("[BUTTON] CLICK! Task '%s' marked %s\n",
                    tasks[selectedTaskIdx].title.c_str(),
                    tasks[selectedTaskIdx].done ? "COMPLETED" : "PENDING");

      if (tasks[selectedTaskIdx].done) {
        // Victory Fanfare & Flash Green
        pixel.setPixelColor(0, pixel.Color(0, 255, 60));
        pixel.show();
        playChime();
        delay(100);
        pixel.setPixelColor(0, pixel.Color(120, 60, 255));
        pixel.show();
      } else {
        playClick();
      }

      renderTaskList();
    }
  }

  delay(2);
}
