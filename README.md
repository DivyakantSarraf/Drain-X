# Drain-X
## 👥 Team — NIRAKSHAN

# DRAIN-X 
### Observe to Resolve

DRAIN-X is an **IoT-powered predictive drainage intelligence system** designed to detect hidden drainage blockages, predict downstream flood risk, and automatically divert water before critical waterlogging occurs.

The project is being developed as a working prototype using a **miniature drainage network**, real-time sensors, an ESP32 controller, machine-learning-based prediction, and a monitoring dashboard.

Built as an IoT and predictive drainage prototype for the IDEAS 5.0 — Idea to Impact initiative.

---

## 📌 What is DRAIN-X?

During heavy rainfall, urban drainage systems can become blocked by **plastic waste, silt, and debris**. Conventional monitoring systems often identify problems only after water levels have already become dangerously high.

DRAIN-X follows a closed-loop approach:

> **Detect → Localize → Predict → Prevent**

The system continuously monitors water conditions at multiple points in a drainage network. By comparing upstream and downstream measurements, it identifies abnormal flow patterns and estimates where a blockage may be present. It then evaluates flood risk and can activate an alternate drainage route using a servo-controlled gate.

---

## 🚨 Problem Statement

Every monsoon, urban areas can experience severe waterlogging when stormwater drains become blocked.

### Key problems

- Drainage blockages can remain hidden underground.
- Existing monitoring approaches may primarily detect high water levels after flooding has already started.
- A single sensor cannot reliably determine where a blockage is located.
- Authorities need earlier information about developing flood risk.
- Manual intervention can delay the response to rapidly increasing water levels.
- There is a need for a scalable system that can move from simple monitoring toward predictive and preventive action.

### The core question

**Can we detect a developing drainage blockage, identify its probable location, predict the resulting flood risk, and automatically reduce its impact before serious waterlogging occurs?**

DRAIN-X is designed to demonstrate this concept.

---

## 💡 Our Solution

DRAIN-X combines **IoT sensing, data processing, machine learning, and automated physical control**.

### 1. Detect

Real-time sensors measure:

- Upstream water level
- Downstream water level
- Upstream flow rate
- Downstream flow rate

The ESP32 collects these measurements continuously.

### 2. Localize

The system compares measurements from different points in the drainage network.

For example:

```text
Upstream Flow  = 5.0 L/min
Downstream Flow = 1.2 L/min

Significant flow difference
            ↓
Possible restriction/blockage
            ↓
Probable blockage between sensors
```

The combination of flow and water-level differences helps estimate the probable location of the blockage.

### 3. Predict

The collected sensor data is processed to estimate:

- Flood-risk level
- Flood probability
- Severity
- Estimated time-to-flood

The prototype will use machine learning on collected drainage-condition data to classify flood risk.

### 4. Prevent

When the predicted risk reaches a critical level, the system activates a **servo-controlled diversion gate**.

```text
Critical Risk
      ↓
ESP32 receives control command
      ↓
Servo opens diversion gate
      ↓
Water is redirected
      ↓
Water-level sensors verify the response
```

This creates a closed-loop system rather than a simple alarm.

---

# Project Workflow

```text
                 ┌─────────────────────┐
                 │  MINIATURE DRAINAGE │
                 │       NETWORK       │
                 └──────────┬──────────┘
                            │
                            ▼
                 ┌─────────────────────┐
                 │   SENSOR LAYER      │
                 │                     │
                 │ Water Level Sensors │
                 │ Flow Sensors        │
                 └──────────┬──────────┘
                            │
                            ▼
                 ┌─────────────────────┐
                 │       ESP32         │
                 │ Data Acquisition &  │
                 │ Local Control       │
                 └──────────┬──────────┘
                            │
                         Wi-Fi
                            │
                            ▼
                 ┌─────────────────────┐
                 │   MQTT / BACKEND    │
                 │ Data Communication  │
                 └──────────┬──────────┘
                            │
                            ▼
               ┌────────────────────────────┐
               │   DATA PROCESSING + ML     │
               │                            │
               │ Blockage Detection         │
               │ Blockage Localization      │
               │ Flood-Risk Prediction      │
               │ Time-to-Flood Estimation   │
               └────────────┬───────────────┘
                            │
                 ┌──────────┴──────────┐
                 ▼                     ▼
        ┌─────────────────┐    ┌─────────────────┐
        │    Dashboard    │    │  Control System │
        │    Streamlit    │    │     ESP32       │
        └─────────────────┘    └────────┬────────┘
                                        │
                                        ▼
                               ┌─────────────────┐
                               │ Servo Gate /    │
                               │ Diversion Route │
                               └────────┬────────┘
                                        │
                                        ▼
                               Water is redirected
                                        │
                                        ▼
                               Sensor Feedback
                                        │
                                        └──────► LOOP
```

### Complete system cycle

**1. Monitor → 2. Detect → 3. Localize → 4. Predict → 5. Decide → 6. Divert → 7. Verify**

---

# 🛠 Technology Stack

## Embedded / IoT

- **ESP32 DevKit**
- Arduino IDE
- C/C++
- ESP32 Wi-Fi
- GPIO / UART interfaces

## Sensors

- Waterproof ultrasonic water-level sensors
- YF-S201 water-flow sensors

## Communication

- Wi-Fi
- MQTT
- Mosquitto MQTT Broker

## Backend & Data Processing

- Python
- Pandas
- NumPy
- Paho-MQTT
- SQLite

## Machine Learning

- Scikit-learn
- Random Forest
- Feature engineering
- Flood-risk classification

## Dashboard

- Streamlit
- Plotly

## Actuation

- Servo motor
- MOSFET / relay module
- DC water pump

---

# 📦 Hardware List

| Component | Qty. | Purpose |
|---|---:|---|
| ESP32 DevKit | 1 | Main controller and IoT communication |
| Waterproof ultrasonic sensor | 2 | Measure upstream/downstream water levels |
| YF-S201 flow sensor | 2 | Measure water flow |
| SG90 / MG996R servo | 1–2 | Control diversion gate |
| 12V DC water pump | 1 | Circulate water through the prototype |
| MOSFET / Relay module | 1 | Control the pump |
| 12V power supply | 1 | Pump power |
| USB / 5V supply | 1 | ESP32 and electronics |
| Water tanks / reservoirs | 2 | Water storage |
| PVC pipes / tubing | As required | Miniature drainage network |
| Acrylic / cardboard / 3D-printed parts | As required | Drainage model |
| Breadboard | 1 | Prototype circuit |
| Jumper wires | As required | Electrical connections |
| LEDs | 3–4 | System status indication |
| Buzzer | 1 | Alert indication |
| Push buttons | 1–2 | Manual control / override |

---

# 📐 Prototype Architecture

The first prototype will represent a small drainage network:

```text
              WATER RESERVOIR
                     │
                     │
                 DC PUMP
                     │
                     ▼
              ┌─────────────┐
              │  UPSTREAM   │
              │   SENSOR    │
              └──────┬──────┘
                     │
                     ▼
              ┌─────────────┐
              │  BLOCKAGE   │
              │    ZONE     │
              └──────┬──────┘
                     │
                     ▼
              ┌─────────────┐
              │ DOWNSTREAM  │
              │   SENSOR    │
              └──────┬──────┘
                     │
                     ▼
                 T-JUNCTION
                  /       \
                 /         \
                ▼           ▼
          Main Drain    Diversion
                          Channel
                             ▲
                             │
                       Servo Gate
```
---
# 🎯 Project Goal

The goal of DRAIN-X is to demonstrate how a drainage-monitoring system can move beyond simple water-level alerts toward a **predictive and preventive IoT system**.

The prototype aims to demonstrate:

> **Detect the problem → Locate the problem → Predict the risk → Take preventive action → Verify the result**

---

## 🚀 Phase 1: Software Foundation

Phase 1 provides the simulation-first software architecture for DRAIN-X, establishing standardized data contracts, a modular FastAPI backend, an interactive React/TypeScript dashboard, and Supabase PostgreSQL schema migrations.

### Architecture Overview

```text
DRAIN-X/
├── backend/                  # FastAPI Modular Monolith
│   ├── app/
│   │   ├── core/config.py    # Environment settings (Pydantic BaseSettings)
│   │   ├── models/contracts.py# Shared telemetry, alert, blockage & prediction schemas
│   │   ├── services/state_store.py # Thread-safe in-memory state & sliding window store
│   │   ├── api/v1/           # REST endpoints (health, telemetry, status, alerts)
│   │   └── main.py           # Application entrypoint & lifespan events
│   ├── tests/                # Pytest test suite (12 passing tests)
│   ├── requirements.txt      # Python dependencies
│   └── pytest.ini            # Pytest configuration
├── frontend/                 # React 18 + Vite + TypeScript Single Page App
│   ├── src/
│   │   ├── types/contracts.ts# TypeScript interfaces mirroring backend contracts
│   │   ├── api/client.ts     # Typed API client abstraction
│   │   ├── components/       # UI Components (Header, KPI Cards, Telemetry, Alerts)
│   │   ├── App.tsx           # Main dashboard orchestrator
│   │   └── tests/            # Vitest suite (6 passing tests)
│   ├── package.json
│   ├── vite.config.ts
│   └── tailwind.config.js
└── database/
    └── migrations/
        └── 001_initial_schema.sql # Supabase PostgreSQL migration schema
```

---

### Setup and Running the System

#### 1. Backend Service (FastAPI)

```bash
cd backend

# Install dependencies
pip install -r requirements.txt

# Run the backend server (FastAPI + Uvicorn)
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload

# Run backend unit and contract tests
python -m pytest
```

- API Documentation: `http://localhost:8000/docs`
- Health Endpoint: `http://localhost:8000/api/v1/health`
- Status Endpoint: `http://localhost:8000/api/v1/status`

#### 2. Frontend Dashboard (React + Vite)

```bash
cd frontend

# Install dependencies
npm install

# Start development server
npm run dev

# Run frontend tests
npm test

# Build production bundle
npm run build
```

- Dashboard UI: `http://localhost:5173`

---

### Environment Variables

Configure backend settings via an optional `.env` file in `backend/` or system environment variables:

| Variable | Default Value | Description |
| :--- | :--- | :--- |
| `SYSTEM_MODE` | `SIMULATION` | Operational mode: `SIMULATION` or `HARDWARE` |
| `ENVIRONMENT` | `development` | Environment tier (`development`, `production`, `testing`) |
| `HOST` | `0.0.0.0` | API bind address |
| `PORT` | `8000` | API port |
| `DATABASE_URL` | *None* | Optional PostgreSQL / Supabase connection string |
| `SUPABASE_URL` | *None* | Optional Supabase API URL |
| `SUPABASE_KEY` | *None* | Optional Supabase service key |
| `MQTT_BROKER_HOST` | `localhost` | Mosquitto MQTT broker hostname |
| `MQTT_BROKER_PORT` | `1883` | Mosquitto MQTT broker port |
| `CRITICAL_WATER_DEPTH_CM`| `12.0` | Water-depth alert threshold in centimetres |

*Note: The application operates completely locally without requiring external database or Supabase credentials.*

---

### Data Contracts Specification

All sensor streams, alerts, and predictions strictly adhere to unified Pydantic and TypeScript contracts:

- **Sensor Reading Contract**:
  - `sensor_id` (`str`): Sensor identifier (e.g. `US_UPSTREAM_01`, `US_WEIR_02`).
  - `section_id` (`str`): Flume section identifier (`SEC_SCREENING`, `SEC_OUTLET`).
  - `sensor_type` (`WATER_LEVEL`, `FLOW_RATE`, `TEMPERATURE`, `DEBRIS_PRESENCE`).
  - `value` (`float`): Non-negative physical measurement.
  - `unit` (`cm` for depth, `L/min` for flow, `degC` for temperature).
  - `timestamp` (`str`): ISO 8601 UTC timestamp.
  - `source` (`PHYSICAL`, `SIMULATED`, `REPLAY`).
  - `status` (`OK`, `DEGRADED`, `FAULT`, `CALIBRATING`).

---

### Simulation & Benchmarking Features (Software-Only Core)

DRAIN-X includes a complete software-only digital twin and simulation engine that enables rigorous verification prior to physical hardware integration:

#### 1. Automated Screening & Waste Extraction Simulation
- **Kinematic & State Machine Simulation**: Simulates the electromechanical screening architecture (perforated lifting tray, overhead DC winch, and servo-actuated auxiliary backup net).
- **Cycle Stages**: `IDLE` → `DEPLOYING_BACKUP_NET` ($0^\circ \to 90^\circ$) → `HOISTING` ($0 \to 18\text{ cm}$) → `DISCHARGING` (debris clearance) → `LOWERING` ($18 \to 0\text{ cm}$) → `RETRACTING_BACKUP_NET` ($90^\circ \to 0^\circ$).
- **Safety & Error Handling**: Actuator timeout detection, mechanical jam detection (`JAMMED`), and failure recovery.

#### 2. Fault Detection & Injection
- Monitors 7 operational failure modes:
  - Disconnected / Missing sensor signals
  - Implausible out-of-bounds readings ($h < 0$ or $h > 20\text{ cm}$)
  - Acoustic spike / step jump artifacts ($|\Delta h| > 4\text{ cm}$ in single step)
  - Stale telemetry (> 10s without fresh data)
  - Mechanism jam / stall
  - Actuator cycle timeout (> 40s)
  - Sensor cross-inconsistency
- Interactive fault injection API via REST: `/api/v1/simulation/inject_fault`.

#### 3. Hydraulic Modeling & Blockage Localization
- **Two-Cell Continuity Model**: Solves storage and flow continuity across upstream screening and downstream outlet cells.
- **Excess Differential Head Loss**: Computes $\Delta h_{\text{excess}} = (h_{\text{up}} - h_{\text{down}}) - \Delta h_{\text{baseline}}(Q)$.
- **Blockage Severity Index**: $\beta \in [0.0, 1.0]$ with empirical mesh porosity scaling.
- **Weir Discharge**: Kindsvater-Carter rectangular suppressed weir calculation.

#### 4. Time-to-Critical (TTC) Prediction
- **Robust Linear Regression**: Evaluates $dh/dt$ over a 10-sample sliding window ($R^2 \ge 0.5$).
- **State Classification**: `STABLE`, `ESTIMATING`, `OVERFLOW`, or `UNAVAILABLE`.
- **Early Warning**: Computes seconds remaining before water level reaches $h_{\text{crit}} = 12.0\text{ cm}$.

#### 5. Closed-Loop Predictive Intervention
- **Autonomous Triggering**: Deploys waste removal cycle when $\text{TTC} < 45\text{ s}$ or $\beta \ge 0.55$.
- **Hydraulic Verification**: Samples water levels 5 seconds post-cycle to verify $\ge 40\%$ head drop.
- **Fallback**: Triggers critical alerts and operator notification if blockage persists.

#### 6. Deterministic Scenario Suite & Benchmarking
- Built-in reproducible test scenarios:
  - `CLEAN_DRAINAGE`: Steady-state baseline flow without debris.
  - `GRADUAL_DEBRIS`: Progressive clogging mimicking organic accumulation.
  - `SUDDEN_BLOCKAGE`: Flash debris event with acute upstream surge.
  - `INCREASING_INFLOW`: Storm inflow spike without structural clogging.
  - `SENSOR_FAILURE`: Injected sensor dropouts and noise spikes.
  - `FAILED_CYCLE`: Winch jam scenario testing emergency timeout.
  - `SUCCESSFUL_INTERVENTION`: Autonomous detection, cycle clearance, and verification.
- **Comparative Metrics vs. Static 10.0 cm Threshold Baseline**:
  - Detection delay lead time advantage
  - Duration above critical depth ($h \ge 12.0\text{ cm}$)
  - Overflow reduction percentage
  - False alarm and missed detection rates

---

---

## 📜 Technical Provenance & Prior Art Attribution

DRAIN-X maintains transparent academic attribution and clear separation between inherited concepts and independent engineering:

1. **Mechanical Prior Art**: The dual-net screening concept (primary stationary net, horizontal lifting tray, and auxiliary rotary backup net) is adapted from prior open-channel sewer research literature (*USenSewer: An Autonomous Real-Time Sewer Monitoring and Debris Cleaning System*). DRAIN-X models this physical concept within a simulated software testbed prior to physical construction.
2. **DRAIN-X Independent Software Engineering**:
   - Continuous multi-point hydraulic telemetry ingestion and schema validation.
   - Dynamic 2-cell hydraulic channel simulation with differential head loss calculation.
   - Real-time blockage localization and severity estimation ($\beta \in [0, 1]$).
   - Moving-window linear regression ($dh/dt$) for Time-to-Critical (TTC) forecasting with $R^2$ validation.
   - 7-mode operational fault detection and automated safety timeout logic.
   - Autonomous intervention decision-making with closed-loop post-cycle hydraulic verification.
   - Deterministic scenario runner and comparative benchmarking engine against traditional static-threshold baselines.
   - Interactive SVG digital twin dashboard with scenario controls and manual override.
3. **Provisional Prototype Status**: Physical prototype dimensions, flume geometry, sensor mounts, and actuator specifications are provisional software model parameters subject to team review and physical laboratory calibration. All benchmark metrics represent deterministic software simulation outputs and do not constitute field-validated experimental results.

---

## 📈 Project Status

✅ **Phase 1 Complete**: Software foundation, shared contracts, FastAPI modular monolith, React frontend, database migrations, and comprehensive test suites implemented.  
✅ **Software-Only Core Complete**: Automated screening kinematics, 7-mode fault detection, physical blockage localization, predictive intervention with verification, 7 deterministic benchmarking scenarios, and interactive SVG Digital Twin dashboard verified with 36 passing automated tests (26 Pytest + 10 Vitest). Production build verified with zero errors.
