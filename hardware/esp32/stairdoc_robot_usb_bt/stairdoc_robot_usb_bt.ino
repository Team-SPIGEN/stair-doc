/*
===========================================================
FULL ROBOT CODE (Safe Initialization + Staircase Flag, Analog Speed Control, USB & BT Commands, JSON Telemetry)

Included:
 - Servo control (DS3218 + TD8120) with sweeps
 - Motor driver pins, initialization, and movement functions (analog speed control)
 - Bluetooth & USB Serial command handlers (f/b/l/r/s/u/d/v/e)
 - JSON Telemetry emitted over USB Serial every 1 second (for Pi Bridge)
 - Ultrasonic obstacle detection (front/rear)
 - Bump sensor logic (disabled near staircase)
 - Pitch override using MPU6050
 - Command timeout safety
 - Staircase flag alters thresholds and bump behavior
 - Global speed percentage (default 60%)
 - Servo angle persistence in ESP32 flash (restored only if tilted >10°)
 - HX711 load cell weight readings
===========================================================
*/

#define DEBUG
#include <Wire.h>
#include <Adafruit_PWMServoDriver.h>
#include <BluetoothSerial.h>
#include <MPU6050_light.h>
#include <Preferences.h>
#include "HX711.h"

// Shared objects
Adafruit_PWMServoDriver pwm = Adafruit_PWMServoDriver();
BluetoothSerial SerialBT;
MPU6050 mpu(Wire);
Preferences prefs;

// --- Motor control pins (BTS7960) ---
#define LPWM1 16
#define RPWM1 17
#define LPWM2 19
#define RPWM2 13
#define EN1_L 23
#define EN1_R 5
#define EN2_L 2
#define EN2_R 0

// --- Servo channels ---
#define FRONT_LEFT_CH 0
#define FRONT_RIGHT_CH 1
#define REAR_LEFT_CH 2
#define REAR_RIGHT_CH 3

// --- Servo limits ---
#define DS3218_USMIN 500
#define DS3218_USMAX 2500
#define TD8120_MIN 150
#define TD8120_MAX 600

// --- Ultrasonic sensor pins ---
#define trigFront 32
#define echoFront 33
#define trigRear 15
#define echoRear 4

// --- Bump sensor pins ---
#define bumpLeft 34
#define bumpRight 35

// --- HX711 pins ---
#define LOADCELL_DOUT_PIN 36
#define LOADCELL_SCK_PIN 25
HX711 hx711;

// Globals
char command = '\0';
bool robotMoving = false;
enum MovementState { STOPPED,
                     FORWARD,
                     BACKWARD,
                     LEFT,
                     RIGHT };
MovementState currentState = STOPPED;

float pitch = 0.0;
bool pitchOverride = false;
bool mpuActive = false;

long frontDist = 400, rearDist = 400;
unsigned long lastUltrasonicCheck = 0;
unsigned long lastCmdTime = 0;
const unsigned long timeout = 10000;

unsigned long bumpTime = 0;
bool bumpRecovering = false;

// Staircase flag
bool nearStaircase = false;
int obstacleThreshold = 20;

// Speed control
int speedPercent = 60;  // default speed percentage

// Servo persistence
unsigned long lastServoChangeTime = 0;

// Sweep state
bool sweepingFront = false;
int frontSweepPos = 90;
int frontSweepEnd = 90;
unsigned long lastFrontUpdate = 0;

bool sweepingRear = false;
int rearSweepPos = 90;
int rearSweepEnd = 90;
unsigned long lastRearUpdate = 0;

const unsigned long sweepInterval = 30;

// ---------------- Servo helpers ----------------
void setDS3218Angle(uint8_t channel, int angle) {
  angle = constrain(angle, 0, 180);
  uint32_t pulseWidthMicros = map(angle, 0, 180, DS3218_USMIN, DS3218_USMAX);
  pwm.writeMicroseconds(channel, pulseWidthMicros);
}

void setTD8120Angle(uint8_t channel, int angle) {
  angle = constrain(angle, 0, 180);
  int pulse = map(angle, 0, 180, TD8120_MIN, TD8120_MAX);
  pwm.setPWM(channel, 0, pulse);
}

void saveServoStateIfNeeded() {
  unsigned long now = millis();
  // Save only if at least 2s since last save
  if (now - lastServoChangeTime > 2000) {
    prefs.putInt("frontPos", frontSweepPos);
    prefs.putInt("rearPos", rearSweepPos);
    lastServoChangeTime = now;
#ifdef DEBUG
    Serial.println("Servo positions saved to flash");
#endif
  }
}

// ---------------- Sweep updates ----------------
void updateSweeps() {
  unsigned long now = millis();
  if (sweepingFront && (now - lastFrontUpdate >= sweepInterval)) {
    setDS3218Angle(FRONT_LEFT_CH, frontSweepPos);
    setDS3218Angle(FRONT_RIGHT_CH, 180 - frontSweepPos);
    if (frontSweepPos < frontSweepEnd) frontSweepPos++;
    else if (frontSweepPos > frontSweepEnd) frontSweepPos--;
    else {
      sweepingFront = false;
      saveServoStateIfNeeded();  // Save when sweep finishes
    }
    lastFrontUpdate = now;
  }
  if (sweepingRear && (now - lastRearUpdate >= sweepInterval)) {
    setDS3218Angle(REAR_LEFT_CH, rearSweepPos);
    setTD8120Angle(REAR_RIGHT_CH, 180 - rearSweepPos);
    if (rearSweepPos < rearSweepEnd) rearSweepPos++;
    else if (rearSweepPos > rearSweepEnd) rearSweepPos--;
    else {
      sweepingRear = false;
      saveServoStateIfNeeded();  // Save when sweep finishes
    }
    lastRearUpdate = now;
  }
}

// ---------------- Motor control (PWM analog speed) ----------------
void enableMotors() {
  digitalWrite(EN1_L, HIGH);
  digitalWrite(EN1_R, HIGH);
  digitalWrite(EN2_L, HIGH);
  digitalWrite(EN2_R, HIGH);
}

void stopMotors() {
  ledcWrite(RPWM1, 0);
  ledcWrite(LPWM1, 0);
  ledcWrite(RPWM2, 0);
  ledcWrite(LPWM2, 0);
  digitalWrite(EN1_L, LOW);
  digitalWrite(EN1_R, LOW);
  digitalWrite(EN2_L, LOW);
  digitalWrite(EN2_R, LOW);
  currentState = STOPPED;
  robotMoving = false;

  // Save servo positions only if robot is tilted (on stairs/incline)
  if (mpuActive && abs(pitch) >= 10) {
    saveServoStateIfNeeded();
  }
}

void moveForward() {
  enableMotors();
  int duty = map(speedPercent, 0, 100, 0, 255);
  ledcWrite(RPWM1, 0);     // RPWM1 off
  ledcWrite(LPWM1, duty);  // LPWM1 forward
  ledcWrite(RPWM2, duty);  // RPWM2 forward
  ledcWrite(LPWM2, 0);     // LPWM2 off
  currentState = FORWARD;
  robotMoving = true;
}

void moveBackward() {
  enableMotors();
  int duty = map(speedPercent, 0, 100, 0, 255);
  ledcWrite(RPWM1, duty);  // RPWM1 backward
  ledcWrite(LPWM1, 0);
  ledcWrite(RPWM2, 0);
  ledcWrite(LPWM2, duty);  // LPWM2 backward
  currentState = BACKWARD;
  robotMoving = true;
}

void turn(int direction) {
  enableMotors();
  int duty = map(speedPercent, 0, 100, 0, 255);
  if (direction == LEFT) {
    ledcWrite(RPWM1, duty);  // Right motor backward
    ledcWrite(LPWM1, 0);
    ledcWrite(RPWM2, duty);  // Left motor forward
    ledcWrite(LPWM2, 0);
    currentState = LEFT;
  } else {
    ledcWrite(RPWM1, 0);
    ledcWrite(LPWM1, duty);  // Right motor forward
    ledcWrite(RPWM2, 0);
    ledcWrite(LPWM2, duty);  // Left motor backward
    currentState = RIGHT;
  }
  robotMoving = true;
}

// ---------------- Ultrasonic helper ----------------
long readUltrasonic(int trigPin, int echoPin) {
  digitalWrite(trigPin, LOW);
  delayMicroseconds(2);
  digitalWrite(trigPin, HIGH);
  delayMicroseconds(10);
  digitalWrite(trigPin, LOW);
  long duration = pulseIn(echoPin, HIGH, 30000);
  if (duration <= 0) return 400;
  long cm = duration * 0.034 / 2;
  return constrain(cm, 1, 400);
}

// ---------------- Telemetry Output ----------------
void emitJsonTelemetry(float weightG) {
  // Single-line JSON — Raspberry Pi bridge parses this over USB Serial
  Serial.print("{\"pitch\":");
  Serial.print(mpuActive ? pitch : 0.0, 2);
  Serial.print(",\"front\":");
  Serial.print(frontDist);
  Serial.print(",\"rear\":");
  Serial.print(rearDist);
  Serial.print(",\"stair_fl\":");
  Serial.print(400); // Not implemented on this robot version, default to 400
  Serial.print(",\"stair_rr\":");
  Serial.print(400); // Not implemented on this robot version, default to 400
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

// ---------------- Command parsing ----------------
void handleCommand(char incomingCommand, const char* source) {
  if (incomingCommand == '\n' || incomingCommand == '\r' || incomingCommand == ' ') {
    return;
  }
  command = incomingCommand;
  lastCmdTime = millis();
#ifdef DEBUG
  Serial.printf("%s command: %c\n", source, command);
#endif

  if (command == 'u') {
    sweepingFront = true;
    frontSweepEnd = constrain(frontSweepPos + 15, 0, 180);
  } else if (command == 'd') {
    sweepingFront = true;
    frontSweepEnd = constrain(frontSweepPos - 15, 0, 180);
  } else if (command == 'v') {
    sweepingRear = true;
    rearSweepEnd = constrain(rearSweepPos + 15, 0, 180);
  } else if (command == 'e') {
    sweepingRear = true;
    rearSweepEnd = constrain(rearSweepPos - 15, 0, 180);
  } else if (command == 'f') {
    moveForward();
  } else if (command == 'b') {
    moveBackward();
  } else if (command == 'l') {
    turn(LEFT);
  } else if (command == 'r') {
    turn(RIGHT);
  } else if (command == 's') {
    stopMotors();
  }
}

// ---------------- Setup ----------------
void setup() {
  Serial.begin(115200);
  Serial.println("Robot setup starting...");

  pinMode(bumpLeft, INPUT);
  pinMode(bumpRight, INPUT);

  pwm.begin();
  pwm.setPWMFreq(50);

  pinMode(EN1_L, OUTPUT);
  pinMode(EN1_R, OUTPUT);
  pinMode(EN2_L, OUTPUT);
  pinMode(EN2_R, OUTPUT);

  ledcAttach(RPWM1, 1000, 8);
  ledcAttach(LPWM1, 1000, 8);
  ledcAttach(RPWM2, 1000, 8);
  ledcAttach(LPWM2, 1000, 8);

  pinMode(trigFront, OUTPUT);
  pinMode(echoFront, INPUT);
  pinMode(trigRear, OUTPUT);
  pinMode(echoRear, INPUT);

  SerialBT.begin("Robot | StairDoc");
  prefs.begin("servoStore", false);

  Wire.begin();
  byte status = mpu.begin();
  if (status == 0) {
    mpuActive = true;
    mpu.calcOffsets();
    Serial.println("MPU6050 initialized");
  } else {
    Serial.println("MPU6050 not found");
  }

  // --- Restore servo angles depending on tilt ---
  if (mpuActive) {
    mpu.update();
    pitch = mpu.getAngleY();

    if (abs(pitch) < 10) {
      // Robot flat → reset all servos to neutral 90°
      frontSweepPos = 90;
      rearSweepPos = 90;

      // One-time continuous reset for ALL servos
      setDS3218Angle(FRONT_LEFT_CH, frontSweepPos);
      setDS3218Angle(FRONT_RIGHT_CH, 180 - frontSweepPos);
      setDS3218Angle(REAR_LEFT_CH, rearSweepPos);
      setTD8120Angle(REAR_RIGHT_CH, 180 - rearSweepPos);
      delay(500);

      Serial.println("Robot flat: all servos reset to 90°");
    } else {
      // Robot tilted → restore saved positions for ALL servos
      frontSweepPos = prefs.getInt("frontPos", 90);
      rearSweepPos = prefs.getInt("rearPos", 90);

      setDS3218Angle(FRONT_LEFT_CH, frontSweepPos);
      setDS3218Angle(FRONT_RIGHT_CH, 180 - frontSweepPos);
      setDS3218Angle(REAR_LEFT_CH, rearSweepPos);
      setTD8120Angle(REAR_RIGHT_CH, 180 - rearSweepPos);
      delay(500);

      Serial.println("Robot inclined: all servos restored from flash");
    }
  } else {
    // MPU not active → default to neutral
    frontSweepPos = 90;
    rearSweepPos = 90;

    setDS3218Angle(FRONT_LEFT_CH, frontSweepPos);
    setDS3218Angle(FRONT_RIGHT_CH, 180 - frontSweepPos);
    setDS3218Angle(REAR_LEFT_CH, rearSweepPos);
    setTD8120Angle(REAR_RIGHT_CH, 180 - rearSweepPos);
    delay(500);

    Serial.println("MPU inactive: all servos set to 90°");
  }

  // --- HX711 initialization ---
  hx711.begin(LOADCELL_DOUT_PIN, LOADCELL_SCK_PIN);
  hx711.set_scale();
  hx711.tare();
  Serial.println("HX711 initialized and tared");

  // --- Ensure motors are off at startup ---
  stopMotors();
  Serial.println("Setup complete");
  lastCmdTime = millis();
}

// ---------------------- Loop ----------------------
void loop() {
  unsigned long now = millis();

  // --- Update MPU6050 ---
  if (mpuActive) {
    mpu.update();
    pitch = mpu.getAngleY();
  }

  // --- USB commands from Raspberry Pi bridge ---
  while (Serial.available()) {
    handleCommand(Serial.read(), "USB");
  }

  // --- Bluetooth commands ---
  while (SerialBT.available()) {
    handleCommand(SerialBT.read(), "BT");
  }

  // --- Read motion obstacle sensors more often while moving ---
  if (robotMoving && (now - lastUltrasonicCheck >= 100)) {
    if (currentState == FORWARD) {
      frontDist = readUltrasonic(trigFront, echoFront);
#ifdef DEBUG
      Serial.printf("Front: %ld cm\n", frontDist);
#endif
    } else if (currentState == BACKWARD) {
      rearDist = readUltrasonic(trigRear, echoRear);
#ifdef DEBUG
      Serial.printf("Rear: %ld cm\n", rearDist);
#endif
    }
    // no ultrasonic checks when turning or idle
    lastUltrasonicCheck = now;
  }

  // --- Emit app telemetry once per second (Pi bridge reads this) ---
  static unsigned long lastTelemetryMs = 0;
  if (now - lastTelemetryMs >= 1000) {
    // Refresh distance readings for telemetry when not moving (when moving, they update in the 100ms interval above)
    if (!robotMoving) {
      frontDist = readUltrasonic(trigFront, echoFront);
      rearDist = readUltrasonic(trigRear, echoRear);
    }
    
    float weightG = 0.0;
    if (!robotMoving && hx711.is_ready()) {
      weightG = hx711.get_units(1); // 1 average sample to avoid lagging loop
    }
    emitJsonTelemetry(weightG);
    lastTelemetryMs = now;
  }

  // --- Safety: obstacle detection ---
  if (robotMoving) {
    if (frontDist > 0 && frontDist < obstacleThreshold && currentState == FORWARD) {
      stopMotors();
#ifdef DEBUG
      Serial.println("Obstacle in front! Stopping.");
#endif
    }
    if (rearDist > 0 && rearDist < obstacleThreshold && currentState == BACKWARD) {
      stopMotors();
#ifdef DEBUG
      Serial.println("Obstacle in rear! Stopping.");
#endif
    }
  }

  // --- Safety: bump sensors ---
  if (!nearStaircase) {
    if (digitalRead(bumpLeft) == LOW || digitalRead(bumpRight) == LOW) {
      lastCmdTime = now;
      if (!bumpRecovering) {
#ifdef DEBUG
        Serial.println("Robot bumped into something!");
#endif
        stopMotors();
        moveBackward();
        bumpTime = now;
        bumpRecovering = true;
      }
    }
    if (bumpRecovering && now - bumpTime >= 1000) {
      stopMotors();
      bumpRecovering = false;
    }
  }

  // --- Safety: pitch override ---
  static unsigned long pitchStart = 0;
  if (mpuActive) {
    if (abs(pitch) > 50 && !pitchOverride) {
      lastCmdTime = now;
      moveForward();
      pitchOverride = true;
      pitchStart = now;
    }
    if (pitchOverride && now - pitchStart >= 1000) {
      stopMotors();
      pitchOverride = false;
    }
  }

  // --- Safety: command timeout ---
  if (currentState != STOPPED && (now - lastCmdTime > timeout)) {
    stopMotors();
  }

  // --- Sweep updates ---
  updateSweeps();
}
