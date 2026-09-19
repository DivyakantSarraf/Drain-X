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

#  Technology Stack

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

#  Hardware List

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

#  Prototype Architecture

The first prototype will represent a small drainage network:

```text
              WATER RESERVOIR
                     │
                     ▼
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

##  Project Status

 **Currently in development**

The repository will be updated as hardware integration, firmware, machine-learning models, backend services, dashboard development, and testing are completed.
