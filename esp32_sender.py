import time
import threading
import random
import json
import argparse
import sys
from datetime import datetime, timezone
import urllib.request
import urllib.error

try:
    import msvcrt
    _MSVCRT = True
except Exception:
    _MSVCRT = False

class Modes:
    DRY = "dry"
    WET = "wet"
    OFF = "off"

def clamp(v, lo, hi):
    return lo if v < lo else hi if v > hi else v

def smooth(current, target, max_step, noise):
    delta = target - current
    if delta > max_step:
        delta = max_step
    elif delta < -max_step:
        delta = -max_step
    return current + delta + random.uniform(-noise, noise)

class KeyListener:
    def __init__(self, window_ms=200):
        self.window_ms = window_ms
        self.last = {}
        self.mode = Modes.DRY
        self.lock = threading.Lock()
        self.running = False

    def _record(self, ch):
        now = time.monotonic() * 1000.0
        self.last[ch] = now

    def _check_combo(self, a, b):
        ta = self.last.get(a)
        tb = self.last.get(b)
        if ta is None or tb is None:
            return False
        return abs(ta - tb) <= self.window_ms

    def _update_mode(self):
        if self._check_combo("A", "Z"):
            self.mode = Modes.WET
            return
        if self._check_combo("Q", "S"):
            self.mode = Modes.OFF
            return
        if self._check_combo("W", "X"):
            if self.mode == Modes.OFF:
                self.mode = Modes.DRY

    def _loop(self):
        while self.running:
            if _MSVCRT and msvcrt.kbhit():
                ch = msvcrt.getch()
                try:
                    c = ch.decode("utf-8", errors="ignore").upper()
                except Exception:
                    c = ""
                if c:
                    with self.lock:
                        self._record(c)
                        self._update_mode()
            time.sleep(0.01)

    def start(self):
        self.running = True
        t = threading.Thread(target=self._loop, daemon=True)
        t.start()

    def get_mode(self):
        with self.lock:
            return self.mode

class SensorSimulator:
    def __init__(self, interval_sec, device_id, url=None, mode_url=None):
        self.interval = float(interval_sec)
        self.device_id = device_id
        self.url = url
        self.mode_url = mode_url or "http://127.0.0.1:8000/api/sim-mode"
        self.mode = Modes.DRY
        self.prev_mode = None
        self.wet_hold_ticks = 0
        self.air_temp = random.uniform(2.0, 3.0)
        self.air_humidity = random.uniform(87.0, 95.0)
        self.soil_moisture = random.uniform(7.0, 12.0)
        self.soil_temp = self.air_temp + random.uniform(-0.2, 0.3)
        self.ph = 0.0
        self.n_ppm = random.uniform(2.0, 5.0)
        self.p_ppm = random.uniform(1.0, 3.0)
        self.k_ppm = random.uniform(2.0, 4.0)
        self.key = KeyListener()

    def _targets(self):
        at_lo, at_hi = 2.0, 3.0
        ah_lo, ah_hi = 87.0, 95.0
        if self.mode == Modes.DRY:
            sm_lo, sm_hi = 7.0, 12.0
        else:
            sm_lo, sm_hi = 75.0, 95.0
        at = random.uniform(at_lo, at_hi)
        ah = random.uniform(ah_lo, ah_hi)
        if self.mode == Modes.WET and self.wet_hold_ticks > 0:
            sm = random.uniform(88.0, 92.0)
        else:
            sm = random.uniform(sm_lo, sm_hi)
        st = at + (0.0 if self.mode == Modes.DRY else -0.2)
        return at, ah, sm, st

    def _update_values(self):
        if self.mode == Modes.OFF:
            self.air_temp = 0.0
            self.air_humidity = 0.0
            self.soil_moisture = 0.0
            self.soil_temp = 0.0
            self.ph = 0.0
            self.n_ppm = 0.0
            self.p_ppm = 0.0
            self.k_ppm = 0.0
            return
        at, ah, sm, st = self._targets()
        step = 0.35 if self.mode == Modes.WET else 0.25
        noise = 0.02
        self.air_temp = clamp(smooth(self.air_temp, at, step, noise), 2.0, 3.0)
        self.air_humidity = clamp(smooth(self.air_humidity, ah, step, noise), 87.0, 95.0)
        self.soil_moisture = clamp(smooth(self.soil_moisture, sm, step * 1.6, noise), 0.0, 100.0)
        self.soil_temp = clamp(smooth(self.soil_temp, st, step, noise), 0.0, 50.0)
        self.ph = 0.0
        self.n_ppm = clamp(self.n_ppm + random.uniform(-0.05, 0.05), 0.0, 10.0)
        self.p_ppm = clamp(self.p_ppm + random.uniform(-0.05, 0.05), 0.0, 10.0)
        self.k_ppm = clamp(self.k_ppm + random.uniform(-0.05, 0.05), 0.0, 10.0)
        if self.wet_hold_ticks > 0:
            self.wet_hold_ticks -= 1

    def _refresh_mode_from_server(self):
        try:
            req = urllib.request.Request(self.mode_url, method="GET")
            with urllib.request.urlopen(req, timeout=2) as resp:
                raw = resp.read()
                data = json.loads(raw.decode("utf-8")) if raw else {}
                m = data.get("mode")
                if m in ("dry", "wet", "zero"):
                    new_mode = Modes.DRY if m == "dry" else (Modes.WET if m == "wet" else Modes.OFF)
                    if new_mode != self.mode:
                        self.prev_mode = self.mode
                        self.mode = new_mode
                        if self.mode == Modes.WET:
                            self.soil_moisture = random.uniform(88.0, 92.0)
                            self.wet_hold_ticks = 2
                        if self.prev_mode == Modes.OFF and self.mode in (Modes.DRY, Modes.WET):
                            self.air_humidity = random.uniform(88.0, 92.0)
                            if self.mode == Modes.DRY:
                                self.soil_moisture = random.uniform(7.0, 12.0)
        except Exception:
            pass

    def _payload(self):
        ts = datetime.now(timezone.utc).isoformat()
        if self.mode == Modes.OFF:
            return {
                "device_id": self.device_id,
                "mode": self.mode,
                "timestamp": ts,
                "temperature_air": 0.0,
                "humidity_air": 0.0,
                "soil_moisture": 0.0,
                "ph": 0.0,
                "N": 0.0,
                "P": 0.0,
                "K": 0.0,
            }
        data = {
            "device_id": self.device_id,
            "mode": self.mode,
            "timestamp": ts,
            "temperature_air": round(self.air_temp, 3),
            "humidity_air": round(self.air_humidity, 3),
            "soil_moisture": round(self.soil_moisture, 3),
            "ph": 0.0,
            "N": round(self.n_ppm, 3),
            "P": round(self.p_ppm, 3),
            "K": round(self.k_ppm, 3),
        }
        return data

    def _send(self, data):
        if not self.url:
            print(json.dumps(data))
            return
        body = json.dumps(data).encode("utf-8")
        req = urllib.request.Request(self.url, data=body, headers={"Content-Type": "application/json"}, method="POST")
        try:
            with urllib.request.urlopen(req, timeout=5) as resp:
                code = getattr(resp, "status", 200)
                print(f"HTTP {code}")
        except urllib.error.URLError as e:
            print(f"ERREUR {e}")

    def run(self, duration_sec=None):
        next_tick = time.monotonic() + self.interval
        end_time = None
        if duration_sec is not None:
            end_time = time.monotonic() + float(duration_sec)
        last_mode = self.mode
        poll_sleep = 0.1
        while True:
            self._refresh_mode_from_server()
            if self.mode != last_mode:
                last_mode = self.mode
                self._update_values()
                self._send(self._payload())
                next_tick = time.monotonic() + self.interval
            now = time.monotonic()
            if now >= next_tick:
                self._update_values()
                self._send(self._payload())
                next_tick = now + self.interval
            time.sleep(poll_sleep)
            if end_time is not None and time.monotonic() >= end_time:
                break

def parse_args(argv):
    p = argparse.ArgumentParser()
    p.add_argument("--interval", type=float, default=10.0)
    p.add_argument("--url", type=str, default="http://127.0.0.1:8000/api/data/")
    p.add_argument("--mode-url", type=str, default="http://127.0.0.1:8000/api/sim-mode")
    p.add_argument("--device-id", type=str, default="esp32-sim-1")
    p.add_argument("--duration", type=float, default=None)
    return p.parse_args(argv)

def main(argv):
    args = parse_args(argv)
    sim = SensorSimulator(interval_sec=args.interval, device_id=args.device_id, url=args.url, mode_url=args.mode_url)
    sim.run(duration_sec=args.duration)

if __name__ == "__main__":
    main(sys.argv[1:])
