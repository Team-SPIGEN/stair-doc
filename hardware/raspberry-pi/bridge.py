#!/usr/bin/env python3
"""
Stair-Doc Raspberry Pi Bridge

Connects the physical robot (ESP32 over serial/Bluetooth + Pi peripherals)
to the Stair-Doc FastAPI backend via Socket.IO.

Responsibilities:
  - Register as bridge for robot-001
  - Forward navigation commands → ESP32 Bluetooth chars (f/b/l/r/s/u/d/v/e)
  - Read ESP32 JSON telemetry → emit bridge_telemetry
  - Handle RFID scans → POST /api/v1/rfid/authorize → door servo
  - Upload access photos → POST /api/v1/camera/photos
  - Optional Vosk voice → POST /api/v1/voice/command

Usage:
  cp .env.example .env   # edit URLs and ports
  pip install -r requirements.txt
  python bridge.py
"""

from __future__ import annotations

import atexit
import fcntl
import json
import os
import queue
import signal
import subprocess
import sys
import threading
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import requests
import serial
from serial.tools import list_ports
from dotenv import load_dotenv

load_dotenv()

# ── Configuration ─────────────────────────────────────────────────────────

def _split_urls(value: str) -> list[str]:
    return [url.strip().rstrip("/") for url in value.split(",") if url.strip()]


def _candidate_api_urls() -> list[str]:
    urls = _split_urls(os.getenv("STAIRDOC_API_URLS", ""))
    single = os.getenv("STAIRDOC_API_URL")
    if single:
        urls.append(single.rstrip("/"))
    if not urls:
        urls.append("http://127.0.0.1:8000")
    return list(dict.fromkeys(urls))


def choose_api_url() -> str:
    """Pick the first reachable backend URL from STAIRDOC_API_URLS."""
    candidates = _candidate_api_urls()
    for url in candidates:
        try:
            resp = requests.get(f"{url}/api/v1/robot/bridge/status", timeout=3)
            if resp.status_code < 500:
                print(f"[API] Using {url}")
                return url
            print(f"[API] {url} responded with HTTP {resp.status_code}")
        except requests.RequestException as exc:
            print(f"[API] {url} unavailable: {exc}")

    fallback = candidates[0]
    print(f"[API] No backend responded; falling back to {fallback}")
    return fallback


API_URL = choose_api_url()
SOCKET_URL = os.getenv("STAIRDOC_SOCKET_URL", API_URL).rstrip("/")
ROBOT_ID = os.getenv("ROBOT_ID", "robot-001")
BRIDGE_TOKEN = os.getenv("ROBOT_BRIDGE_TOKEN", "")

# ── Operating mode ────────────────────────────────────────────────────────
# Set ESP32_ENABLED=false when running alongside the ROS 2 stack
# (start_nav.sh + ros2_bridge.py). In that mode:
#   • Serial port is NOT opened (micro_ros_agent owns /dev/sensors/esp32)
#   • Socket.IO bridge slot is NOT claimed (ros2_bridge.py holds it)
#   • RFID / Camera / Voice still work via REST API calls
ESP32_ENABLED = os.getenv("ESP32_ENABLED", "true").lower() in {"1", "true", "yes", "on"}
BRIDGE_MODE = os.getenv("BRIDGE_MODE", "standalone")  # standalone | sensors_only

# Default robot world position (overridden by ros2_bridge.py pose when in ROS2 mode)
ROBOT_POS_X = float(os.getenv("ROBOT_POS_X", "0.0"))
ROBOT_POS_Y = float(os.getenv("ROBOT_POS_Y", "0.0"))

ESP32_CONNECTION = os.getenv("ESP32_CONNECTION", "serial")  # serial | bluetooth
ESP32_SERIAL_PORT = os.getenv("ESP32_SERIAL_PORT", "").strip()
ESP32_SERIAL_BAUD = int(os.getenv("ESP32_SERIAL_BAUD", "115200"))
ESP32_SERIAL_EXCLUDE_PORTS = [
    item.strip()
    for item in os.getenv(
        "ESP32_SERIAL_EXCLUDE_PORTS",
        "/dev/rplidar,/dev/sensors/rplidar",
    ).split(",")
    if item.strip()
]
ESP32_BT_MAC = os.getenv("ESP32_BT_MAC", "")  # e.g. AA:BB:CC:DD:EE:FF

COMMAND_REPEAT_SEC = float(os.getenv("COMMAND_REPEAT_SEC", "3"))
TELEMETRY_INTERVAL_SEC = float(os.getenv("TELEMETRY_INTERVAL_SEC", "1.5"))
ESP32_RECONNECT_SEC = float(os.getenv("ESP32_RECONNECT_SEC", "5"))
SOCKET_RECONNECT_SEC = float(os.getenv("SOCKET_RECONNECT_SEC", "5"))

PHOTO_DIR = Path(os.getenv("PHOTO_DIR", "/home/spigen/access_photos"))
LOCAL_AUTHORIZED_TAGS = {
    tag.strip().upper()
    for tag in os.getenv(
        "LOCAL_AUTHORIZED_TAGS",
        "432745742349,805223990738,1023250728362",
    ).split(",")
    if tag.strip()
}

LOCAL_VOICE_ENABLED = os.getenv("LOCAL_VOICE_ENABLED", "true").lower() in {"1", "true", "yes", "on"}
LOCAL_VOICE_MODEL_PATH = os.getenv(
    "LOCAL_VOICE_MODEL_PATH",
    "/home/spigen/vosk_model/vosk-model-small-en-us-0.15",
)
LOCAL_VOICE_SAMPLE_RATE = int(os.getenv("LOCAL_VOICE_SAMPLE_RATE", "48000"))
LOCAL_VOICE_BLOCK_SIZE = int(os.getenv("LOCAL_VOICE_BLOCK_SIZE", "8000"))
LOCAL_VOICE_DEVICE = os.getenv("LOCAL_VOICE_DEVICE", "").strip()
LOCAL_VOICE_ROLE = os.getenv("LOCAL_VOICE_ROLE", "operator")
LOCAL_VOICE_CONFIRM_ESTOP = os.getenv("LOCAL_VOICE_CONFIRM_ESTOP", "true").lower() in {
    "1",
    "true",
    "yes",
    "on",
}
LOCAL_VOICE_DIRECT_UNLOCK = os.getenv("LOCAL_VOICE_DIRECT_UNLOCK", "true").lower() in {
    "1",
    "true",
    "yes",
    "on",
}
LOCAL_VOICE_SPEAK_RESPONSE = os.getenv("LOCAL_VOICE_SPEAK_RESPONSE", "false").lower() in {
    "1",
    "true",
    "yes",
    "on",
}

# GPIO pins (Raspberry Pi BCM) — same as your access control script
SERVO_PIN = int(os.getenv("SERVO_PIN", "5"))
RED_LED = int(os.getenv("RED_LED", "4"))
GREEN_LED = int(os.getenv("GREEN_LED", "17"))
BUZZER = int(os.getenv("BUZZER", "27"))

NAV_TO_BT = {
    "forward": "f",
    "backward": "b",
    "left": "l",
    "right": "r",
    "stop": "s",
    "emergency_stop": "s",
    "front_up": "u",
    "front_servo_up": "u",
    "front_down": "d",
    "front_servo_down": "d",
    "rear_up": "v",
    "rear_servo_up": "v",
    "rear_down": "e",
    "rear_servo_down": "e",
}


@dataclass
class Esp32State:
    pitch: float = 0.0
    front_cm: float = 400.0
    rear_cm: float = 400.0
    stair_fl_cm: float = 400.0
    stair_rr_cm: float = 400.0
    weight_g: float = 0.0
    bump_left: bool = False
    bump_right: bool = False
    mpu_active: bool = False


@dataclass
class BridgeState:
    lock_status: str = "locked"
    last_move_command: str | None = None
    last_move_time: float = 0.0
    esp32: Esp32State = field(default_factory=Esp32State)
    access_lock: threading.Lock = field(default_factory=threading.Lock)


# ── ESP32 serial I/O ──────────────────────────────────────────────────────


class Esp32Link:
    """UART or Bluetooth-serial link to the ESP32."""

    def __init__(self) -> None:
        self._ser: serial.Serial | None = None
        self.port = ESP32_SERIAL_PORT or "auto"
        self.connected = False
        self._last_connect_attempt = 0.0

    def _candidate_serial_ports(self) -> list[str]:
        """Return explicit and auto-detected serial devices in priority order."""
        candidates: list[str] = []
        if ESP32_SERIAL_PORT and ESP32_SERIAL_PORT.lower() != "auto":
            candidates.append(ESP32_SERIAL_PORT)
            return list(dict.fromkeys(candidates))

        for port in list_ports.comports():
            if port.device and not self._is_excluded_serial_port(port.device):
                candidates.append(port.device)

        for fallback in ("/dev/ttyUSB0", "/dev/ttyACM0", "/dev/serial0"):
            if Path(fallback).exists() and not self._is_excluded_serial_port(fallback):
                candidates.append(fallback)

        return list(dict.fromkeys(candidates))

    def _is_excluded_serial_port(self, port: str) -> bool:
        try:
            resolved_port = str(Path(port).resolve(strict=False))
        except Exception:
            resolved_port = port

        for excluded in ESP32_SERIAL_EXCLUDE_PORTS:
            try:
                resolved_excluded = str(Path(excluded).resolve(strict=False))
            except Exception:
                resolved_excluded = excluded
            if resolved_port == resolved_excluded:
                return True
        return False

    def connect(self) -> None:
        self._last_connect_attempt = time.time()
        if ESP32_CONNECTION == "bluetooth":
            if not ESP32_BT_MAC:
                raise RuntimeError("Set ESP32_BT_MAC for bluetooth connection")
            # Bind RFCOMM once: sudo rfcomm bind 0 <MAC> 1
            candidates = [os.getenv("ESP32_BT_PORT", "/dev/rfcomm0")]
        else:
            candidates = self._candidate_serial_ports()

        if not candidates:
            self._ser = None
            self.connected = False
            self.port = ESP32_SERIAL_PORT or "auto"
            print("[ESP32] No serial device found. Connect ESP32 USB or set ESP32_SERIAL_PORT.")
            return

        for port in candidates:
            try:
                self._ser = serial.Serial(port, ESP32_SERIAL_BAUD, timeout=0.1)
                self.port = port
                self.connected = True
                time.sleep(2)  # ESP32 boot
                print(f"[ESP32] Connected on {port}")
                return
            except Exception as exc:
                self._ser = None
                self.port = port
                self.connected = False
                print(f"[ESP32] Unavailable on {port}: {exc}")

        print("[ESP32] Bridge will still register; movement commands will be logged only.")

    def ensure_connected(self) -> None:
        if self._ser and self.connected:
            return
        if time.time() - self._last_connect_attempt < ESP32_RECONNECT_SEC:
            return
        self.connect()

    def send_bt_char(self, char: str) -> bool:
        if self._ser and char:
            try:
                self._ser.write(char.encode("ascii"))
                print(f"[ESP32] Sent command char: {char}")
                return True
            except Exception as exc:
                print(f"[ESP32] Write failed on {self.port}: {exc}")
                try:
                    self._ser.close()
                except Exception:
                    pass
                self._ser = None
                self.connected = False
                return False
        elif char:
            print(f"[ESP32] Skipped command char without serial link: {char}")
        return False

    def read_lines(self) -> list[str]:
        lines: list[str] = []
        if not self._ser:
            return lines
        try:
            while self._ser.in_waiting:
                raw = self._ser.readline()
                try:
                    lines.append(raw.decode("utf-8", errors="ignore").strip())
                except Exception:
                    pass
        except Exception as exc:
            print(f"[ESP32] Read failed on {self.port}: {exc}")
            try:
                self._ser.close()
            except Exception:
                pass
            self._ser = None
            self.connected = False
        return lines


def parse_esp32_line(line: str, state: Esp32State) -> None:
    """Parse JSON telemetry or legacy Serial.print lines from ESP32."""
    if line.startswith("{") and line.endswith("}"):
        try:
            data = json.loads(line)
            state.pitch = float(data.get("pitch", state.pitch))
            state.front_cm = float(data.get("front", state.front_cm))
            state.rear_cm = float(data.get("rear", state.rear_cm))
            state.stair_fl_cm = float(data.get("stair_fl", state.stair_fl_cm))
            state.stair_rr_cm = float(data.get("stair_rr", state.stair_rr_cm))
            state.weight_g = float(data.get("weight_g", state.weight_g))
            state.bump_left = bool(data.get("bump_l", 0))
            state.bump_right = bool(data.get("bump_r", 0))
            state.mpu_active = bool(data.get("mpu", 0))
            return
        except json.JSONDecodeError:
            pass

    # Legacy text parsing fallback
    if "Pitch (Y-angle):" in line:
        try:
            state.pitch = float(line.split(":")[-1].strip())
            state.mpu_active = True
        except ValueError:
            pass
    elif line.startswith("Front:") and "Rear:" in line:
        parts = line.replace("cm", "").split("|")
        try:
            state.front_cm = float(parts[0].split(":")[-1].strip())
            state.rear_cm = float(parts[1].split(":")[-1].strip())
        except (ValueError, IndexError):
            pass
    elif "Reading:" in line and "g" in line:
        try:
            state.weight_g = float(line.split("Reading:")[1].split("g")[0].strip())
        except (ValueError, IndexError):
            pass


def build_telemetry_payload(bridge: BridgeState, esp_link: Esp32Link | None = None) -> dict[str, Any]:
    esp = bridge.esp32
    obstacle = esp.front_cm <= 20 or esp.rear_cm <= 20
    stair = esp.stair_fl_cm <= 30 or esp.stair_rr_cm <= 30
    incline = esp.pitch if esp.mpu_active else 0.0

    status = "climbing" if abs(incline) > 25 else "idle"
    if bridge.last_move_command in ("f", "b", "l", "r"):
        status = "delivering"

    return {
        "robot_id": ROBOT_ID,
        "status": status,
        "lock_status": bridge.lock_status,
        "location": {
            "floor": int(os.getenv("ROBOT_FLOOR", "1")),
            "building": os.getenv("ROBOT_BUILDING", "Building A"),
            "room": os.getenv("ROBOT_ROOM") or None,
            "x": ROBOT_POS_X,
            "y": ROBOT_POS_Y,
        },
        "battery": {"level": 85, "is_charging": False, "voltage": 25.0, "temperature": 30.0},
        "sensors": {
            "obstacle_detected": obstacle,
            "stair_detected": stair,
            "distance_to_obstacle": min(esp.front_cm, esp.rear_cm) / 100.0 if obstacle else None,
            "incline_angle": incline,
            "weight_kg": round(esp.weight_g / 1000.0, 3),
            "esp32_connected": bool(esp_link and esp_link.connected),
            "esp32_port": esp_link.port if esp_link else ESP32_SERIAL_PORT,
            "esp32_connection": ESP32_CONNECTION,
            "front_distance_cm": esp.front_cm,
            "rear_distance_cm": esp.rear_cm,
            "stair_front_left_cm": esp.stair_fl_cm,
            "stair_rear_right_cm": esp.stair_rr_cm,
        },
        "speed": 0.5 if bridge.last_move_command in ("f", "b", "l", "r") else 0.0,
    }


# ── Pi peripherals (GPIO + RFID + camera) ────────────────────────────────


class PiPeripherals:
    """Door servo, LEDs, buzzer, RFID, camera — optional if GPIO unavailable."""

    def __init__(self) -> None:
        self._gpio_ok = False
        self._reader = None
        self._pwm = None
        try:
            import RPi.GPIO as GPIO
            import mfrc522
            from mfrc522 import SimpleMFRC522
            
            # Monkey-patch SimpleMFRC522 to force it to use BCM mode (11) and Reset Pin 25
            def custom_mfrc522_init(self_obj):
                self_obj.READER = mfrc522.MFRC522(pin_mode=11, pin_rst=25)
            SimpleMFRC522.__init__ = custom_mfrc522_init

            self.GPIO = GPIO
            GPIO.setwarnings(False)
            GPIO.setmode(GPIO.BCM)
            GPIO.setup(RED_LED, GPIO.OUT)
            GPIO.setup(GREEN_LED, GPIO.OUT)
            GPIO.setup(BUZZER, GPIO.OUT)
            GPIO.setup(SERVO_PIN, GPIO.OUT)
            self._pwm = GPIO.PWM(SERVO_PIN, 50)
            self._pwm.start(0)
            self._reader = SimpleMFRC522()
            self._gpio_ok = True
            PHOTO_DIR.mkdir(parents=True, exist_ok=True)
            print("[Pi] GPIO + RFID initialized")
        except Exception as exc:
            print(f"[Pi] GPIO/RFID unavailable ({exc}) — running without local peripherals")

    def set_servo_angle(self, angle: int) -> None:
        if not self._gpio_ok or not self._pwm:
            return
        duty = 2 + (angle / 18)
        self._pwm.ChangeDutyCycle(duty)
        time.sleep(0.5)
        self._pwm.ChangeDutyCycle(0)

    def lock_door(self) -> None:
        self.set_servo_angle(90)

    def unlock_door(self) -> None:
        self.set_servo_angle(0)

    def denied_feedback(self) -> None:
        if not self._gpio_ok:
            return
        try:
            buzzer_pwm = self.GPIO.PWM(BUZZER, 2000)
            for _ in range(3):
                buzzer_pwm.start(50)
                time.sleep(0.2)
                buzzer_pwm.stop()
                time.sleep(0.2)
        except Exception as e:
            print(f"Buzzer error: {e}")

    def take_photo(self, tag_id: str) -> Path | None:
        PHOTO_DIR.mkdir(parents=True, exist_ok=True)
        ts = time.strftime("%Y%m%d-%H%M%S")
        path = PHOTO_DIR / f"access_{tag_id}_{ts}.jpg"
        try:
            # Fetch raw JPEG bytes from local camera server
            resp = requests.get("http://127.0.0.1:8080/photo", timeout=5)
            if resp.status_code == 200:
                with path.open("wb") as f:
                    f.write(resp.content)
                print(f"[Camera] Saved photo from local stream: {path.name}")
                return path
            else:
                print(f"[Camera] Stream server returned HTTP {resp.status_code}")
                return None
        except Exception as exc:
            print(f"[Camera] Stream server photo fetch failed: {exc}")
            return None

    def upload_photo(self, path: Path, tag_id: str) -> None:
        try:
            with path.open("rb") as f:
                requests.post(
                    f"{API_URL}/api/v1/camera/upload",
                    files={"file": (path.name, f, "image/jpeg")},
                    data={
                        "robot_id": ROBOT_ID,
                        "photo_type": "recipient_verify",
                        "caption": f"RFID access — {tag_id}",
                        "recipient_rfid": tag_id,
                    },
                    timeout=30,
                )
            print(f"[Camera] Uploaded {path.name}")
        except Exception as exc:
            print(f"[Camera] Upload failed: {exc}")

    def perform_unlock(self, identifier: str, bridge: BridgeState, source: str = "RFID") -> None:
        with bridge.access_lock:
            print(f"[Access] Granted by {source}: {identifier}")
            if self._gpio_ok:
                self.GPIO.output(GREEN_LED, self.GPIO.HIGH)
            bridge.lock_status = "unlocked"
            self.unlock_door()
            photo = self.take_photo(identifier)
            if photo:
                self.upload_photo(photo, identifier)
            time.sleep(5)
            self.lock_door()
            bridge.lock_status = "locked"
            if self._gpio_ok:
                self.GPIO.output(GREEN_LED, self.GPIO.LOW)

    def authorize_rfid(self, raw_tag: str, bridge: BridgeState) -> None:
        tag_id = raw_tag if raw_tag.startswith("RFID-") else f"RFID-{raw_tag}"
        try:
            resp = requests.post(
                f"{API_URL}/api/v1/rfid/authorize",
                json={"tag_id": tag_id, "robot_id": ROBOT_ID},
                timeout=10,
            )
            data = resp.json().get("data", {})
            if data.get("authorized"):
                self.perform_unlock(tag_id, bridge, "RFID")
            else:
                print(f"[RFID] Access denied: {tag_id}")
                if self._gpio_ok:
                    self.GPIO.output(RED_LED, self.GPIO.HIGH)
                self.denied_feedback()
                if self._gpio_ok:
                    self.GPIO.output(RED_LED, self.GPIO.LOW)
        except Exception as exc:
            print(f"[RFID] API error: {exc}")
            raw_clean = raw_tag.strip().upper()
            tag_clean = tag_id.strip().upper()
            if raw_clean in LOCAL_AUTHORIZED_TAGS or tag_clean in LOCAL_AUTHORIZED_TAGS:
                print(f"[RFID] Using local fallback authorization for {tag_id}")
                self.perform_unlock(tag_id, bridge, "RFID fallback")
                return
            if self._gpio_ok:
                self.GPIO.output(RED_LED, self.GPIO.HIGH)
            self.denied_feedback()
            if self._gpio_ok:
                self.GPIO.output(RED_LED, self.GPIO.LOW)

    def rfid_loop(self, bridge: BridgeState) -> None:
        if not self._reader:
            return
        while True:
            try:
                tag_id, _ = self._reader.read()
                print(f"[RFID] Tag detected: {tag_id}")
                self.authorize_rfid(str(tag_id), bridge)
                time.sleep(1)
            except Exception as exc:
                print(f"[RFID] Read error: {exc}")
                time.sleep(1)


# ── Local Vosk voice recognition ─────────────────────────────────────────


def _voice_device_value() -> int | str | None:
    if not LOCAL_VOICE_DEVICE:
        return None
    try:
        return int(LOCAL_VOICE_DEVICE)
    except ValueError:
        return LOCAL_VOICE_DEVICE


def _speak_response(text: str) -> None:
    if not LOCAL_VOICE_SPEAK_RESPONSE or not text:
        return
    try:
        subprocess.Popen(["espeak", text[:220]], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    except Exception:
        pass


def _post_voice_command(text: str) -> dict[str, Any] | None:
    try:
        resp = requests.post(
            f"{API_URL}/api/v1/voice/command",
            json={
                "text": text,
                "robot_id": ROBOT_ID,
                "user_role": LOCAL_VOICE_ROLE,
                "confirm": LOCAL_VOICE_CONFIRM_ESTOP,
            },
            timeout=10,
        )
        if resp.status_code >= 400:
            print(f"[Voice] API rejected '{text}': HTTP {resp.status_code} {resp.text[:200]}")
            return None
        return resp.json().get("data")
    except Exception as exc:
        print(f"[Voice] API command failed: {exc}")
        return None


def _is_unlock_phrase(text: str) -> bool:
    return any(
        phrase in text
        for phrase in (
            "unlock door",
            "open door",
            "open the door",
            "unlock container",
            "open container",
            "open the container",
        )
    )


def _is_lock_phrase(text: str) -> bool:
    return any(
        phrase in text
        for phrase in (
            "lock door",
            "close door",
            "close the door",
            "lock container",
            "close container",
            "close the container",
        )
    )


def voice_recognition_loop(pi: PiPeripherals, bridge: BridgeState) -> None:
    if not LOCAL_VOICE_ENABLED:
        print("[Voice] Local Vosk voice disabled")
        return

    try:
        import sounddevice as sd
        import vosk
    except Exception as exc:
        print(f"[Voice] Local voice unavailable; install vosk and sounddevice ({exc})")
        return

    model_path = Path(LOCAL_VOICE_MODEL_PATH)
    if not model_path.exists():
        print(f"[Voice] Vosk model missing: {model_path}")
        return

    audio_queue: queue.Queue[bytes] = queue.Queue()

    def audio_callback(indata: bytes, frames: int, callback_time: Any, status: Any) -> None:
        if status:
            print(f"[Voice] Audio status: {status}")
        audio_queue.put(bytes(indata))

    try:
        model = vosk.Model(str(model_path))
        recognizer = vosk.KaldiRecognizer(model, LOCAL_VOICE_SAMPLE_RATE)
    except Exception as exc:
        print(f"[Voice] Failed to load Vosk model: {exc}")
        return

    device = _voice_device_value()
    stream_kwargs: dict[str, Any] = {
        "samplerate": LOCAL_VOICE_SAMPLE_RATE,
        "blocksize": LOCAL_VOICE_BLOCK_SIZE,
        "dtype": "int16",
        "channels": 1,
        "callback": audio_callback,
    }
    if device is not None:
        stream_kwargs["device"] = device

    try:
        with sd.RawInputStream(**stream_kwargs):
            print("[Voice] Local Vosk recognition started")
            while True:
                data = audio_queue.get()
                if not recognizer.AcceptWaveform(data):
                    continue
                result = json.loads(recognizer.Result())
                text = result.get("text", "").strip().lower()
                if not text:
                    continue

                print(f"[Voice] Recognized: {text}")
                api_data = _post_voice_command(text)
                if isinstance(api_data, dict):
                    message = api_data.get("message")
                    if message:
                        print(f"[Voice] App response: {message}")
                        _speak_response(str(message))

                if LOCAL_VOICE_DIRECT_UNLOCK and _is_unlock_phrase(text):
                    pi.perform_unlock("VOICE-LOCAL", bridge, "Local Voice")
                elif _is_lock_phrase(text):
                    with bridge.access_lock:
                        pi.lock_door()
                        bridge.lock_status = "locked"
                        print("[Voice] Door locked by local voice")
    except Exception as exc:
        print(f"[Voice] Local recognition stopped: {exc}")
        try:
            print(f"[Voice] Input devices: {sd.query_devices()}")
        except Exception:
            pass


# ── Socket.IO bridge ─────────────────────────────────────────────────────


# ── PID lock ─────────────────────────────────────────────────────────────

_PID_LOCK_PATH = Path("/tmp/stairdoc-bridge.pid")
_pid_lock_file = None  # kept open to hold the flock


def _acquire_pid_lock() -> None:
    """Acquire an exclusive PID lock or exit if another instance is already running."""
    global _pid_lock_file
    try:
        _pid_lock_file = open(_PID_LOCK_PATH, "w")
        fcntl.flock(_pid_lock_file, fcntl.LOCK_EX | fcntl.LOCK_NB)
        _pid_lock_file.write(str(os.getpid()))
        _pid_lock_file.flush()

        def _release() -> None:
            try:
                fcntl.flock(_pid_lock_file, fcntl.LOCK_UN)
                _pid_lock_file.close()
                _PID_LOCK_PATH.unlink(missing_ok=True)
            except Exception:
                pass

        atexit.register(_release)
    except BlockingIOError:
        existing_pid = _PID_LOCK_PATH.read_text().strip() if _PID_LOCK_PATH.exists() else "unknown"
        print(
            f"[PID Lock] Another stairdoc-bridge instance is already running (PID {existing_pid}).\n"
            f"           Run 'kill {existing_pid}' or 'systemctl stop stairdoc-bridge' first."
        )
        sys.exit(1)


def run_bridge() -> None:
    import socketio

    _acquire_pid_lock()
    mode_label = "STANDALONE" if ESP32_ENABLED else "SENSORS-ONLY (ROS2 mode)"
    print(f"[Bridge] Mode: {mode_label}  Robot: {ROBOT_ID}")

    esp: Esp32Link | None = None
    if ESP32_ENABLED:
        esp = Esp32Link()
        esp.connect()

    pi = PiPeripherals()
    bridge_state = BridgeState()

    # ── SIGTERM handler (systemd stop / kill signal) ───────────────────────
    _stop_event = threading.Event()

    def _handle_sigterm(signum: int, frame: object) -> None:
        print("[Bridge] SIGTERM received — shutting down gracefully")
        _stop_event.set()

    signal.signal(signal.SIGTERM, _handle_sigterm)
    signal.signal(signal.SIGINT, _handle_sigterm)

    if not ESP32_ENABLED:
        # SENSORS-ONLY mode: RFID + Camera + Voice use REST directly.
        # No Socket.IO bridge slot needed — ros2_bridge.py holds it.
        print("[Bridge] ESP32_ENABLED=false — RFID/Camera/Voice only (no serial, no Socket.IO)")
        if pi._reader:
            threading.Thread(target=pi.rfid_loop, args=(bridge_state,), daemon=True).start()
        if LOCAL_VOICE_ENABLED:
            threading.Thread(
                target=voice_recognition_loop,
                args=(pi, bridge_state),
                daemon=True,
            ).start()
        print("[Bridge] Sensors-only mode running — waiting for stop signal")
        _stop_event.wait()  # block until SIGTERM
        print("[Bridge] Sensors-only mode stopped")
        return

    sio = socketio.Client(reconnection=True, reconnection_attempts=0)

    @sio.event
    def connect() -> None:
        print(f"[Socket.IO] Connected to {SOCKET_URL}")
        payload: dict[str, Any] = {"robot_id": ROBOT_ID}
        if BRIDGE_TOKEN:
            payload["token"] = BRIDGE_TOKEN
        sio.emit("bridge_register", payload)

    @sio.on("bridge_register_ack")
    def on_register_ack(data: dict) -> None:
        print(f"[Socket.IO] Register: {data}")

    @sio.on("bridge_command")
    def on_bridge_command(data: dict) -> None:
        action = data.get("action", "")
        bt = data.get("bt_command") or NAV_TO_BT.get(action)
        if bt:
            sent = esp.send_bt_char(bt)
            if sent and bt in ("f", "b", "l", "r"):
                bridge_state.last_move_command = bt
                bridge_state.last_move_time = time.time()
            elif bt == "s" or not sent:
                bridge_state.last_move_command = None
        print(f"[Bridge] Command: {action} → {bt}")

    last_socket_attempt = 0.0

    def ensure_socket_connected() -> bool:
        nonlocal last_socket_attempt
        if sio.connected:
            return True
        if time.time() - last_socket_attempt < SOCKET_RECONNECT_SEC:
            return False

        last_socket_attempt = time.time()
        try:
            print(f"[Socket.IO] Connecting to {SOCKET_URL}")
            sio.connect(
                SOCKET_URL,
                socketio_path="/socket.io",
                transports=["websocket", "polling"],
                wait_timeout=10,
            )
            return True
        except Exception as exc:
            print(f"[Socket.IO] Backend unavailable: {exc}")
            return False

    # RFID + Voice in background threads
    if pi._reader:
        threading.Thread(target=pi.rfid_loop, args=(bridge_state,), daemon=True).start()
    if LOCAL_VOICE_ENABLED:
        threading.Thread(
            target=voice_recognition_loop,
            args=(pi, bridge_state),
            daemon=True,
        ).start()

    print("[Bridge] Running — send SIGTERM or Ctrl+C to stop")
    try:
        while not _stop_event.is_set():
            esp.ensure_connected()
            socket_connected = ensure_socket_connected()

            # Read ESP32 telemetry
            for line in esp.read_lines():
                if line:
                    parse_esp32_line(line, bridge_state.esp32)

            # Emit telemetry to backend
            if socket_connected:
                sio.emit("bridge_telemetry", build_telemetry_payload(bridge_state, esp))

            # Repeat last movement command (ESP32 10s timeout)
            if bridge_state.last_move_command:
                if time.time() - bridge_state.last_move_time >= COMMAND_REPEAT_SEC:
                    if esp.send_bt_char(bridge_state.last_move_command):
                        bridge_state.last_move_time = time.time()
                    else:
                        bridge_state.last_move_command = None

            _stop_event.wait(timeout=TELEMETRY_INTERVAL_SEC)
    finally:
        print("[Bridge] Shutting down")
        esp.send_bt_char("s")
        if sio.connected:
            try:
                sio.emit("bridge_unregister", {"robot_id": ROBOT_ID})
                time.sleep(0.3)
            except Exception:
                pass
            sio.disconnect()
        print("[Bridge] Stopped cleanly")


if __name__ == "__main__":
    run_bridge()
