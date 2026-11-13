# DRAIN-X ESP32 Embedded Firmware: Physical Prototype Foundation

## Milestone: P0.3G Incremental Hardware Readiness & Connectivity Validation

This directory contains the embedded firmware for the DRAIN-X Urban Drainage Intelligence physical demonstrator node, targeting the **ESP32 DevKit V1 (ESP-WROOM-32)** microcontroller.

---

## 1. Physical Model Context & Mechanical Adaptability

The DRAIN-X physical demonstration rig consists of:
- Miniature PVC drainage channels carrying circulating water.
- A physical ultrasonic water level sensor (JSN-SR04T) mounted above the flume.
- A physical water-flow sensor (YFS201) installed inline within the drainage bypass flume.
- A motorized hinged sheet-metal diversion gate that opens and closes on manual command to redirect water into the bypass flume.
- A submersible water circulation pump powering the closed fluid loop.

### Mechanical Status & Future-Proof Configuration
The physical demonstrator is currently undergoing mechanical assembly. The following parameters are **not yet finalized**:
- Exact sheet-metal gate dimensions, hinge friction, and gate mass.
- Hinge orientation (vertical pivot vs. horizontal flapped gate).
- Servo horn arm length and pushrod linkage geometry.
- Exact open and closed angles.
- Actuator selection: **SG90 micro-servo** (nylon gear, 1.8 kg·cm) vs. **MG996R high-torque servo** (metal gear, 10-12 kg·cm).
- Exact flow sensor calibration constant (nominal datasheet $K = 450.0\text{ pulses/L}$ requires bench validation).

To prevent breaking changes during assembly, the software architecture decouples configuration from mechanical geometry:
- Servo models can be switched between `SG90_MICRO` and `MG996R_HIGH_TORQUE` via `Config::ACTIVE_SERVO_MODEL` or `servoDriver.setServoModel()`.
- Travel limits (`SERVO_MIN_SAFE_ANGLE`, `SERVO_MAX_SAFE_ANGLE`) and calibrated positions (`GATE_CLOSED_ANGLE`, `GATE_OPEN_ANGLE`) are centralized in `include/config.h` and can be adjusted without rewriting application logic.
- Flow calibration constant `YFS201_PULSES_PER_LITER` is centralized in `include/config.h` and adjustable at runtime via `yfs201Driver.setPulsesPerLiter()`.

---

## 2. Hardware Safety & Electrical Interconnection

> [!CAUTION]
> **ELECTRICAL POWER & ISOLATION WARNINGS**:
> 1. **DO NOT power the servo from the ESP32 3.3V pin**: Servo current draw will destroy the onboard LDO regulator.
> 2. **DO NOT power the servo from the ESP32 USB 5V pin**: Servo stall current (SG90: 500-800mA, MG996R: 1.5-2.5A) induces voltage dips that trigger ESP32 brownout detector reboots.
> 3. **5V ECHO & FLOW SIGNALS**: The JSN-SR04T ECHO pin and YFS201 Pulse pin emit 5.0V pulses. 1kΩ / 2kΩ voltage dividers are mandatory on BOTH pins to protect the 3.3V ESP32 GPIOs (GPIO 18 and GPIO 27). Direct connection will permanently damage the ESP32 SoC.
> 4. **WATER CIRCULATION PUMP ISOLATION**: The submersible water pump generates substantial inductive noise and motor ripple. It MUST be powered from a dedicated external power supply, separate from the ESP32 and sensor logic. An anti-parallel flyback diode across the pump terminals is strictly required if switched.
> 5. **STRAPPING PIN AUDIT**: GPIO 5 was replaced with **GPIO 25** for ultrasonic TRIG to prevent MTDO strapping conflict during boot.
> 6. **COMMON GROUND**: A shared ground tying the 5V PSU GND, ESP32 GND, ultrasonic GND, flow sensor GND, and servo GND is strictly required.

### Wiring Schematic

```text
                  +5V External Power Supply (2.0A - 3.0A Regulated)
                           |
                           +--------[ VCC (Pin 1) JSN-SR04T ]
                           |
                           +--------[ VCC (Red Wire) SG90 / MG996R Servo ]
                           |
                           +--------[ VCC (Red Wire) YFS201 Flow Sensor ]
                           |
                          [+] 100uF - 470uF Electrolytic Buffer Capacitor
                          [-]
ESP32 DevKit V1            |
+-------------------+      |
|                   |      |
|  GPIO 25 (TRIG)   +----------------[ TRIG (Pin 2) JSN-SR04T ] (3.3V logic OK; non-strapping)
|                   |
|  GPIO 18 (ECHO)   <----+-----------[ ECHO (Pin 3) JSN-SR04T ] (5.0V Pulse Output)
|                   |    |
|                   |   [R1: 1kΩ]
|                   |    |
|                   |    +--------+
|                   |             |
|                   |            [R2: 2kΩ]
|                   |             |
|  GPIO 27 (FLOW)   <----+--------+--[ YELLOW (Signal) YFS201 ] (5.0V Pulse Output)
|                   |    |
|                   |   [R3: 1kΩ]
|                   |    |
|                   |    +--------+
|                   |             |
|                   |            [R4: 2kΩ]
|                   |             |
|  GPIO 19 (SERVO)  +----------------[ PWM Signal (Orange/Yellow) Servo ] (3.3V PWM OK)
|                   |
|  GND              +----+--------+--[ GND (Pin 4) JSN-SR04T ]
+-------------------+    |        |
                         |        +--[ GND (Brown/Black Wire) Servo ]
                         |        |
                         |        +--[ GND (Black Wire) YFS201 ]
                         |
                  COMMON SYSTEM GROUND (PSU GND + ESP32 GND + Sensor GND + Servo GND)

                  SEPARATE DEDICATED PUMP POWER (12V / 5V DC Supply):
                  [ +Pump PSU ] --------(+) [ Submersible Water Pump ]
                  [ -Pump PSU ] --------(-) [ With Flyback Diode Across Terminals ]
```

### Verified Pin Assignments (Bench Prototype)

| Signal | ESP32 GPIO | Direction | Level | Notes |
| :--- | :---: | :---: | :---: | :--- |
| `PIN_JSN_TRIG` | **GPIO 25** | Output | 3.3V | 10 µs trigger pulse; safe non-strapping pin (replaces GPIO 5). |
| `PIN_JSN_ECHO` | **GPIO 18** | Input | 3.3V (Stepped) | Pulse capture via 1kΩ/2kΩ divider. Bounded 25 ms timeout. |
| `PIN_YFS201_FLOW` | **GPIO 27** | Input | 3.3V (Stepped) | Hardware rising-edge interrupt via 1kΩ/2kΩ divider. Non-strapping pin. |
| `PIN_SERVO_GATE` | **GPIO 19** | Output | 3.3V PWM | Hardware LEDC PWM (50 Hz, 14-bit resolution). |

---

## 3. Sensor Independence & Operational Invariants

### Sensor Independence
- **Dual Independent Channels**: The JSN-SR04T ultrasonic level sensor and YFS201 turbine flow meter are architecturally decoupled.
- **Graceful Degradation**: If ultrasonic echo is lost (e.g. timeout or acoustic deadband violation), the flow sensor continues reading valid flow rate (L/min) and volume (L), and node health transitions to `DEGRADED`.
- **Fault Isolation**: If the flow sensor fails or has an invalid calibration constant, ultrasonic water depth is preserved and node health is `DEGRADED`. Only when **both** sensors fail does node health report `FAULT`.
- **Zero-Flow Invariant**: 0 incoming pulses during water stagnation yields valid `0.0 L/min` with `is_valid = true` and `health = OK`. It is **never** flagged as a sensor fault or NaN.

---

## 4. Open-Loop Actuator Disclaimer & Manual Control

> [!IMPORTANT]
> **OPEN-LOOP DIRECTIVE LIMITATION**:
> Standard hobby servos (SG90 and MG996R) provide **NO positional feedback** to the microcontroller.
> - The microcontroller transmits an electrical PWM width (e.g. 1500 µs); it cannot verify whether the gate reached its physical destination, encountered hinge binding, or jammed on debris.
> - Commanded position (`gate_angle_deg`) represents the electrical target angle, NOT mechanically verified posture.
> - **NO AUTONOMOUS ACTUATION**: Gate movement is strictly manual via serial commands (`'g'` / `'c'`). Sensor readings NEVER trigger automatic gate motion in this milestone.
> - Software command hold (`'x'`) locks out new incoming serial commands in software; it is **NOT** a physical brake.

---

## 5. Directory Structure

```
firmware/
├── platformio.ini         # PlatformIO environment, board, and compiler settings
├── README.md              # Firmware operational guide, commands, and architecture
├── .gitignore             # Git exclusion for .pio/ build directory
├── include/
│   ├── config.h           # Centralized geometry, pinout, PWM profiles & timing constants
│   ├── telemetry.h        # Telemetry contracts, flow fields, gate state enums & strict invariants
│   ├── jsn_sr04t_driver.h # Physical transducer driver with bounded timeout & deadband check
│   ├── yfs201_driver.h    # Physical flow turbine driver with IRAM ISR, atomic capture & totalizer
│   ├── servo_driver.h     # Modular SG90/MG996R driver with travel clamps & deadband
│   ├── median_filter.h    # Lightweight zero-allocation 5-sample moving median filter
│   ├── sensor_manager.h   # Unified manager with strict operational mode isolation
│   └── diagnostics.h      # Serial output formatting, boot banner, timestamps & heartbeat
├── src/
│   └── main.cpp           # Non-blocking entry point and interactive serial command handler
└── test/
    └── test_firmware_simulation.py  # 26 unit & integration tests (100% passing)
```

---

## 6. Operational Modes & Mode Isolation

| Mode | Ultrasonic (GPIO 25, 18) | Flow Sensor (GPIO 27) | Servo Gate (GPIO 19) | Telemetry Source | Fault Handling |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **`SIMULATION`** | **Isolated** (High-Z) | **Isolated** (Interrupt detached) | **De-energized** (PWM detached) | `DataSource::SIMULATED` | Synthetic generator. Movement commands (`'g'`, `'c'`) are rejected. |
| **`PHYSICAL`** | **Active** (10 µs pulse / 25 ms capture) | **Active** (IRAM rising-edge ISR) | **Active** (Manual commands permitted) | `DataSource::PHYSICAL` | Sensor failure emits `NAN` and `FAULT`. **Never falls back to synthetic data.** |

---

## 7. Bench Validation Procedures

### A. Ultrasonic Distance & Level Validation
1. **Target Ruler Benchmark**: Position a flat, rigid acoustic target at marked intervals (25 cm, 30 cm, 40 cm, 50 cm, 75 cm).
2. **Deadband Check**: Bring target closer than 20.0 cm; verify firmware flags `ACOUSTIC_DEADBAND_VIOLATION` and emits `NAN`.
3. **Timeout Check**: Point transducer into free air (> 450 cm); verify firmware times out cleanly at 25 ms without hanging the main loop.
4. **Water Surface Test**: Pour water into the PVC flume at steady depths; verify `water_depth_cm = reference_height_cm - raw_distance_cm`.

### B. Flow Sensor Measured-Volume Calibration
1. **Tare Collecting Vessel**: Place a graduated 5.0 L container under the flume discharge.
2. **Clear Totalizer**: Press `'z'` in the serial console to reset cumulative volume and pulse counts to zero.
3. **Run Fixed Volume**: Dispense exactly $5.00\text{ Liters}$ of water through the flume.
4. **Record Pulses**: Inspect the serial console total pulse count $N_\text{total}$.
5. **Calculate Calibrated Constant**:
   $$K_\text{calibrated} = \frac{N_\text{total}}{5.0\text{ L}}$$
   Update `Config::YFS201_PULSES_PER_LITER` in `firmware/include/config.h`.

### C. Gate Actuation & Linkage Validation
1. **Unpowered Hinge Check**: Manually swing the sheet-metal gate from closed to open to verify zero mechanical binding or interference with the PVC flume walls.
2. **Neutral Electrical Alignment**: Issue `'c'` (closed) with horn unattached; fasten horn so gate rests flush against the channel frame.
3. **Manual Actuation Under Flow**: Run the circulation pump. Issue `'g'` to open and `'c'` to close. Observe whether the servo has sufficient torque to open against water head pressure without skipping gears. If the SG90 stalls, upgrade to `ServoModel::MG996R_HIGH_TORQUE`.

---

## 8. Serial Commands

Connect a serial terminal at `115200` baud:

| Key | Function | Mode Requirement | Description |
| :---: | :--- | :---: | :--- |
| `p` / `P` | **PHYSICAL Mode** | Any | Enables live hardware sensing (ultrasonic & flow) and unlocks manual gate actuation. |
| `s` / `S` | **SIMULATION Mode** | Any | Isolates hardware GPIO, detaches flow interrupt, and de-energizes servo PWM. |
| `g` / `G` | **Open Gate** | PHYSICAL | Commands servo to calibrated open angle (provisional: 90.0°). |
| `c` / `C` | **Close Gate** | PHYSICAL | Commands servo to calibrated closed angle (provisional: 0.0°). |
| `x` / `X` | **Software Hold** | Any | Engages command lock out; rejects new open/close commands until released. |
| `z` / `Z` | **Reset Volume** | Any | Zeroes cumulative flow volume totalizer and pulse counter. |
| `f` / `F` | **Toggle Filter** | Any | Toggles 5-sample moving median filter (ON/OFF). |
| `w` / `W` | **Wi-Fi Status** | Any | Displays Wi-Fi state, assigned IP, RSSI, target backend URL, and Tx metrics. |
| `h` / `?` | **Help Banner** | Any | Reprints boot banner, pin assignments, electrical warnings, and status. |
| `n` / `N` | Normal Scenario | SIMULATION | Steady baseline flow (~4.6 cm, ~2.8 L/min). |
| `r` / `R` | Rising Water | SIMULATION | Progressive flood wave (4.0 -> 14.5 cm, 3.0 -> 12.0 L/min). |
| `i` / `I` | Invalid Reading | SIMULATION | Injects echo loss and timeout faults. |
| `a` / `A` | Auto-Cycle | SIMULATION | Automatically cycles Normal -> Rising -> Invalid scenarios. |

---

## 9. Wi-Fi Telemetry & FastAPI Ingestion (P0.3F)

### Network Architecture & Non-blocking Guarantee
The ESP32 firmware features a completely non-blocking Wi-Fi and HTTP telemetry manager (`WifiTelemetryManager` in `include/wifi_telemetry_manager.h`):
- **FreeRTOS / Loop Cooperative Scheduling**: Network connection attempts, association checks, and transmission calls run in bounded time ($< 1\text{ ms}$ overhead for state evaluation) and NEVER call blocking `while (!WiFi.isConnected())` loops.
- **Bounded HTTP Timeouts**: Strict 2-second timeout (`HTTP_TIMEOUT_MS = 2000`) prevents network lag or dropped packets from blocking ultrasonic sampling, flow pulse counting, or manual gate actuation.
- **Exponential Reconnection Backoff**: On Wi-Fi drops or consecutive HTTP failures, reconnect attempts back off exponentially ($5\text{s} \to 10\text{s} \to 20\text{s} \to 30\text{s}$ max) to avoid saturating CPU cycles.
- **Transmission Cadence**: Live telemetry is rate-limited to a 2.0-second interval (`TELEMETRY_TX_INTERVAL_MS = 2000`).

### Secrets Management
- Network credentials and backend server IP are decoupled into `firmware/include/secrets.h`.
- `secrets.h` is strictly excluded from version control via `.gitignore`.
- A template file `firmware/include/secrets.example.h` is provided. Copy it to `secrets.h` and configure:
```c
#pragma once

namespace DrainX {
namespace Secrets {
    inline constexpr const char* WIFI_SSID     = "Your_WiFi_SSID";
    inline constexpr const char* WIFI_PASSWORD = "Your_WiFi_Password";
    inline constexpr const char* BACKEND_HOST  = "192.168.1.100";  // IP of FastAPI host machine
    inline constexpr uint16_t    BACKEND_PORT  = 8000;
    inline constexpr const char* INGEST_PATH   = "/api/v1/telemetry/ingest";
}
}
```

### JSON Telemetry Payload Contract
The firmware serializes batch sensor readings matching FastAPI's `SensorReadingContract`:
```json
[
  {
    "sensor_id": "SN-US-01",
    "type": "WATER_LEVEL",
    "value": 14.25,
    "unit": "cm",
    "source": "PHYSICAL",
    "status": "OK",
    "metadata": {
      "is_valid": true,
      "filter_enabled": true
    }
  },
  {
    "sensor_id": "SN-FL-01",
    "type": "FLOW_RATE",
    "value": 3.42,
    "unit": "L/min",
    "source": "PHYSICAL",
    "status": "OK",
    "metadata": {
      "is_valid": true,
      "total_volume_liters": 12.854
    }
  }
]
```
- In `PHYSICAL` mode, `"source"` is `"PHYSICAL"`.
- In `SIMULATION` mode, `"source"` is `"SIMULATED"`.
- If an operational mode mismatch occurs between ESP32 and backend, the backend responds with `HTTP 409 Conflict`, which the ESP32 logs cleanly without crashing or changing local mode.
- If a sensor fails (e.g. echo timeout), standard JSON compatibility is preserved by emitting `0.0` with `"status": "FAULT"` and `"is_valid": false`, preventing invalid `NaN` tokens.

### Open-Loop Actuation Guard
- The firmware receives HTTP responses from FastAPI for diagnostic logging only.
- In accordance with competition safety requirements, **backend directives NEVER automatically trigger servo actuation**. The gate moves ONLY in response to explicit manual commands (`'g'`, `'c'`).

### Long-term Persistence Architecture (Supabase)
- **Zero Secrets on Edge Hardware**: The ESP32 node communicates strictly with FastAPI over the local subnet using standard HTTP. It holds NO database credentials or Supabase API keys.
- **Backend Persistence**: FastAPI handles all database synchronization using the `service_role` key stored securely on the server (`backend/.env`), writing telemetry to the PostgreSQL/Supabase schema (`telemetry_readings`).

---

## 10. Incremental Hardware Readiness & Progressive Validation (P0.3G)

### Validation Progress States vs Operational Modes
The physical demonstration model is undergoing incremental physical construction. To decouple development from physical assembly, DRAIN-X establishes 5 distinct **Validation Progress Stages**. These represent testbench maturity and readiness, **NOT** operational runtime modes (`SIMULATION`, `PHYSICAL`, `SAFE_HOLD`):

1. **`SOFTWARE_ONLY`**: Pure firmware logic running either in host tests or on an unattached ESP32 with simulated sensors.
2. **`CONNECTIVITY_READY`**: ESP32 associated with local Wi-Fi and actively transmitting telemetry to FastAPI over LAN.
3. **`PARTIALLY_ASSEMBLED`**: Prototype rig with some components mounted (e.g. ultrasonic mounted, but flume/pump or flow sensor not yet plumbed).
4. **`SENSOR_VALIDATION`**: Transducers (JSN-SR04T and YFS201) and actuator (servo) wired, powered with 1k/2k dividers, and verified individually.
5. **`FULL_PHYSICAL_VALIDATION`**: End-to-end fluid loop operating with submersible pump circulating water, live flow and depth acquisition, manual diversion gate control, and telemetry streaming to FastAPI.

### Missing Hardware Reporting Contract
When the firmware runs in `PHYSICAL` mode but specific sensors are not yet wired or physically mounted:
- Missing sensors are **NEVER silently faked with synthetic data or zero readings**.
- Missing sensors report `is_valid: false`, `NaN` values, and explicit fault code `FaultCode::SENSOR_NOT_INSTALLED`.
- The system gracefully reports `SensorHealth::DEGRADED` (or `FAULT` if all sensors are uninstalled), maintaining situational awareness for any operational sensors without crashing.

---

## 11. Progressive Physical Validation Checklist

### Stage A — ESP32 Foundation
- [x] Board powers reliably from USB / 5V rail.
- [x] Serial diagnostics work at 115200 baud.
- [x] Brownout detector and boot strapping pins verified (TRIG on GPIO 25, ECHO on GPIO 18, FLOW on GPIO 27, SERVO on GPIO 19).
- [x] Wi-Fi credentials decoupled into untracked `secrets.h`.

### Stage B — Network & Ingestion
- [x] ESP32 connects to local Wi-Fi station mode without blocking the loop.
- [x] FastAPI backend reachable on host machine LAN IP (e.g., `192.168.0.236:8000`).
- [x] Firewall inbound rules configured for TCP port 8000.
- [x] Telemetry batch received and validated at `/api/v1/telemetry/ingest`.
- [x] Reconnection with exponential backoff ($5\text{s} \to 10\text{s} \to 20\text{s} \to 30\text{s}$) verified.

### Stage C — Individual Sensors (Bench Testing)
**JSN-SR04T (Ultrasonic)**:
- [ ] 5.0V external power supply connected with shared common ground.
- [ ] 1kΩ / 2kΩ voltage divider installed on ECHO (GPIO 18) stepping 5V down to 3.3V.
- [ ] Distance readings calibrated against a physical ruler (20 cm to 400 cm).
- [ ] Acoustic deadband ($< 20\text{ cm}$) confirmed to report `DEADBAND_VIOLATION`.
- [ ] Mounting height ($H_{ref} = 35.0\text{ cm}$) finalized.

**YFS201 (Flow Sensor)**:
- [ ] 5.0V external power supply connected with shared common ground.
- [ ] 1kΩ / 2kΩ voltage divider installed on Pulse (GPIO 27) stepping 5V down to 3.3V.
- [ ] Pull-up resistor / level-shifted interrupt verified with manual wheel rotation.
- [ ] Bucket test calibration: measure pulses accumulated across known liquid volume (e.g. 5.0 L).
- [ ] $K$-factor calibrated in `include/config.h` (`YFS201_PULSES_PER_LITER = 450.0f`).
- [ ] Zero-flow invariant confirmed: 0 pulses reports valid `0.0 L/min` with status `OK`.

### Stage D — Actuator (Servo Diversion Gate)
- [ ] External 5V / 2.0A power supply connected with shared common ground.
- [ ] 100µF - 470µF decoupling capacitor installed across servo power rail.
- [ ] Servo horn movement tested without mechanical load (0° to 90°).
- [ ] Pushrod and sheet-metal diversion gate attached to hinge.
- [ ] Mechanical stops verified: no servo buzzing, stall, or overtravel heating.
- [ ] Manual serial commands `'g'` (open), `'c'` (close), and `'x'` (hold) tested.
- [ ] Open-loop confirmation: no false claim of physical angle feedback; commanded state reported.

### Stage E — Water Circulation Loop
- [ ] Submersible pump powered from isolated dedicated power rail.
- [ ] Plumbing connections leak-checked under static water load.
- [ ] Pump running: stable continuous circulation through PVC flume.
- [ ] Surface turbulence evaluated; median filter enabled (`'f'`) if acoustic ripple exceeds 1.0 cm.
- [ ] Manual diversion gate opening redirects water into bypass channel with noticeable flow increase on YFS201.
- [ ] Continuous telemetry streamed to FastAPI during active pumping without brownout.

---

## 12. Verification & Testing

Execute test suite from repository root:

```bash
# Run all 33 unit and integration verification tests
python -m pytest firmware/test/test_firmware_simulation.py -v

# Run backend integration tests (validating ESP32 JSON contract and mode isolation)
python -m pytest backend/tests/test_esp32_integration.py -v

# Build firmware binary via PlatformIO Core
Set-Location firmware
python -m platformio run
```

All 33 firmware tests and 5 backend integration tests pass (100%):
- Physical echo duration conversion ($v = 343\text{ m/s}$).
- Echo timeout handling (duration = 0 -> `SENSOR_TIMEOUT`).
- Deadband ($< 20\text{ cm}$) and range ($> 400\text{ cm}$) rejection.
- Negative water depth rejection ($d > H_{ref}$).
- Invariant: missing readings are strictly `NAN`, never 0.0.
- Mode isolation: PHYSICAL never outputs synthetic; SIMULATION never touches GPIO.
- Moving median filter latency and spike rejection.
- SG90 (544..2400 µs) and MG996R (500..2500 µs) pulse width conversions.
- Mechanical overtravel clamping.
- Deadband suppression of redundant PWM commands ($|\Delta\theta| < 0.5^\circ$).
- Software command hold behavior.
- Actuation prevention in SIMULATION mode.
- YFS201 pulse to flow rate conversion ($Q = (\Delta\text{pulses}/K) \times (60000/\Delta t)$).
- YFS201 volume accumulation across successive sampling intervals.
- YFS201 zero-flow invariant (zero pulses = valid 0.0 L/min, not a fault).
- YFS201 invalid calibration factor rejection ($K \le 0 \implies \text{NaN}$, `FLOW_CALIBRATION_INVALID`).
- YFS201 volume totalizer zeroing command (`'z'`).
- YFS201 mode isolation: SIMULATION never attaches interrupt; PHYSICAL never returns synthetic flow.
- Non-strapping pin assignments (GPIO 25, 18, 19, 27).
- Sensor independence: ultrasonic failure preserves flow sensor data.
- Sensor independence: flow sensor failure preserves ultrasonic data.
- Sensor independence: dual failure transitions node health to FAULT.
- Open-loop gate command integrity: high water level NEVER triggers automatic actuation.
- Wi-Fi telemetry batch serialization matching `SensorReadingContract` in PHYSICAL mode.
- Wi-Fi telemetry serialization labeling `SIMULATED` source in SIMULATION mode.
- Fault serialization safety (NaN avoidance in standard JSON format).
- Exponential reconnection backoff timing ($5\text{s} \to 10\text{s} \to 20\text{s} \to 30\text{s}$).
- Missing hardware reporting contract (`SENSOR_NOT_INSTALLED`, `NaN` values, no fake healthy data).
- Independent sensor testing capability in physical mode without requiring full rig.
- Distinction between validation stages and operational mode logic.
