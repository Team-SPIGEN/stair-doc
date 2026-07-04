// Stair-Doc ESP32 firmware additions
// Add these changes to your existing .ino sketch to connect with the Pi bridge.
//
// The Pi bridge reads JSON telemetry lines and forwards Bluetooth commands
// from the Stair-Doc web app.
//
// If you want the complete ready-to-flash sketch based on the team's current
// robot code, open:
//   hardware/esp32/stairdoc_robot_usb_bt/stairdoc_robot_usb_bt.ino

// ── 1. Add near top of file ──────────────────────────────────────────────

unsigned long lastTelemetryMs = 0;
const unsigned long TELEMETRY_INTERVAL_MS = 1000;

// ── 2. Add this function before loop() ───────────────────────────────────

void emitJsonTelemetry(
    long frontDist, long rearDist,
    long frontLeftStair, long rearStair,
    float weightG
) {
  // Single-line JSON — Pi bridge parses this
  Serial.print("{\"pitch\":");
  Serial.print(mpuActive ? pitch : 0);
  Serial.print(",\"front\":");
  Serial.print(frontDist);
  Serial.print(",\"rear\":");
  Serial.print(rearDist);
  Serial.print(",\"stair_fl\":");
  Serial.print(frontLeftStair);
  Serial.print(",\"stair_rr\":");
  Serial.print(rearStair);
  Serial.print(",\"weight_g\":");
  Serial.print(weightG, 1);
  Serial.print(",\"bump_l\":");
  Serial.print(digitalRead(bumpLeft) == LOW ? 1 : 0);
  Serial.print(",\"bump_r\":");
  Serial.print(digitalRead(bumpRight) == LOW ? 1 : 0);
  Serial.print(",\"mpu\":");
  Serial.print(mpuActive ? 1 : 0);
  Serial.println("}");
}

// ── 3. Inside loop(), after reading sensors, add: ─────────────────────────

/*
  if (millis() - lastTelemetryMs >= TELEMETRY_INTERVAL_MS) {
    lastTelemetryMs = millis();
    scale.set_scale(calibration_factor);
    float weightG = scale.get_units(1);
    emitJsonTelemetry(frontDist, rearDist, frontLeftStair, rearStair, weightG);
  }
*/

// ── 4. Optional: accept commands from Pi UART (in addition to Bluetooth) ──
// If ESP32 is wired to Pi GPIO14/15 (UART), read Serial (USB) or Serial2:

/*
  if (Serial.available()) {
    char piCmd = Serial.read();
    if (strchr("fblr sudve", piCmd)) {
      command = piCmd;
      lastCmdTime = millis();
    }
  }
*/

// ── 5. Wiring: ESP32 ↔ Raspberry Pi ─────────────────────────────────────
//
// Option A — USB serial (easiest):
//   ESP32 USB port → Pi USB port
//   Pi .env: ESP32_SERIAL_PORT=/dev/ttyUSB0
//
// Option B — UART wires:
//   ESP32 GPIO17 (TX2) → Pi GPIO15 (RX)
//   ESP32 GPIO16 (RX2) → Pi GPIO14 (TX)
//   GND → GND
//   Use Serial2 on ESP32, /dev/ttyAMA0 or /dev/serial0 on Pi
//
// Option C — Bluetooth Classic (existing SerialBT):
//   Pair ESP32 "StairdocRobot" with Pi
//   sudo rfcomm bind 0 <ESP32_MAC> 1
//   Pi .env: ESP32_CONNECTION=bluetooth, ESP32_BT_PORT=/dev/rfcomm0
//   Pi bridge sends BT chars through RFCOMM; ESP32 still uses SerialBT internally
//
// ── 6. Command mapping (app → Pi bridge → ESP32) ────────────────────────
//
//   forward          → f
//   backward         → b
//   left             → l
//   right            → r
//   stop / estop     → s
//   front servos up  → u
//   front servos down→ d
//   rear servos up   → v
//   rear servos down → e
//
// Pi bridge re-sends f/b/l/r every 3s while moving (ESP32 10s command timeout).
