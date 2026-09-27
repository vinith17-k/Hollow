# 🦇 Hollow ESP32 Physical Circuit Simulation (Wokwi)

This directory contains a complete, interactive, physical hardware circuit simulation of the **Hollow Desk Companion** using **Wokwi** (the modern Tinkercad for ESP32 and advanced electronics).

---

## 🔌 Virtual Components Included

| Component | Part in Wokwi | Connected Pins |
|---|---|---|
| **Microcontroller** | ESP32 DevKit v4 | Dual-core 240MHz, Virtual Wi-Fi |
| **Color Display** | ILI9341 320×240 Color TFT | SPI (MOSI: 23, SCK: 18, CS: 15, DC: 5, RST: 2) |
| **Rotary Encoder** | KY-040 Knob + Button | CLK: GPIO 4, DT: GPIO 16, SW: GPIO 17 |
| **Status LED** | WS2812B NeoPixel RGB | DIN: GPIO 21 |
| **Speaker / Chime** | Piezo Buzzer | GPIO 22 |

---

## 🚀 How to Run the Simulation in 10 Seconds

### Method A: In Your Browser (Zero Installation)

1. Open [**wokwi.com/projects/new/esp32**](https://wokwi.com/projects/new/esp32) in Chrome/Edge.
2. In the top tabs:
   - Click `diagram.json` and paste the contents of `wokwi-simulation/diagram.json`.
   - In `sketch.ino`, paste the contents of `wokwi-simulation/sketch.ino`.
   - In the Library Manager tab (the `+` icon or `libraries.txt`), add:
     - `Adafruit GFX Library`
     - `Adafruit ILI9341`
     - `Adafruit NeoPixel`
     - `ArduinoJson`
3. Click the green **Play (▶)** button at the top!

---

### Method B: In VS Code (Free Wokwi Extension)

1. In VS Code, go to the Extensions tab (`Ctrl+Shift+X`) and search for **Wokwi Simulator** (by Wokwi).
2. Install the extension.
3. Open this folder in VS Code, press `Ctrl+Shift+P`, and choose:
   ```
   Wokwi: Start Simulator
   ```
4. The visual circuit window opens with the breadboard wires, knob, and color screen!

---

## 🎮 How to Interact with the Simulated Hardware

- **Turn the Rotary Knob**: Click and drag your mouse around the KY-040 rotary knob clockwise or counter-clockwise.
  - The LCD cursor smoothly moves through the directive list.
  - The piezo buzzer plays a realistic microswitch tick.
- **Click the Knob Button**: Click the center of the knob down.
  - Toggles the selected directive between `[ ]` and `[X]`.
  - When marked done, the NeoPixel flashes bright emerald green, and the buzzer plays the ascending victory chime!
- **Watch the Mascot**: The pixel bat mascot blinks its amber eyes and flutters its obsidian wings on the color LCD screen.
- **Serial Telemetry**: Open the virtual serial monitor to see real-time ESP32 baud logs (`115200 baud`).
