

\# DRAIN-X — Engineering Instructions



\## 1. Project Overview



DRAIN-X is an IoT-powered predictive drainage intelligence system.



Its purpose is to detect drainage blockages, estimate their probable location, predict developing flood risk, initiate preventive intervention, and verify the resulting response.



Core workflow:



DETECT → LOCALIZE → PREDICT → PREVENT → VERIFY



This project is being developed as a working miniature drainage-network prototype for an innovation competition.



The system must demonstrate real engineering functionality, measurable performance, and a credible path towards practical deployment.



\## 2. Project Foundation



The existing README.md describes the agreed project concept and initial hardware architecture.



Treat README.md as the primary project specification.



The original USenSewer research paper is an important technical reference and must be acknowledged appropriately.



DRAIN-X should build upon the existing drainage-monitoring and automation concepts rather than claim previously established mechanisms as original innovations.



Preserve the current project's core direction:



\- ESP32-based sensing and local control.

\- Multiple water-level measurements.

\- Water-flow measurements.

\- MQTT communication.

\- Python-based processing.

\- Predictive drainage-risk analysis.

\- Servo-controlled diversion gate.

\- Feedback-based verification.

\- Interactive monitoring dashboard.



Do not silently replace these concepts with unrelated features.



\## 3. Technology Stack



\### Embedded

\- ESP32 DevKit

\- Arduino IDE

\- C++

\- Ultrasonic water-level sensors

\- YF-S201 flow sensors

\- Servo motor

\- DC pump and appropriate driver circuitry



\### Communication

\- MQTT

\- Mosquitto

\- Wi-Fi



\### Backend

\- Python

\- FastAPI

\- Pydantic

\- Paho-MQTT



\### Data Processing

\- NumPy

\- Pandas



\### Machine Learning

\- Scikit-learn

\- Random Forest when justified by available data

\- Feature engineering and model evaluation



Do not introduce complex deep-learning models without a defensible dataset and measurable benefit.



\### Frontend

\- React

\- TypeScript

\- Vite

\- Tailwind CSS

\- shadcn/ui

\- Recharts



\### Database

\- Supabase

\- PostgreSQL



\### Testing

\- Pytest

\- Vitest



\## 4. Architecture Principles



Use a modular monolithic architecture.



Separate the application into:



1\. Sensor acquisition and data adapters.

2\. Sensor simulation.

3\. MQTT communication.

4\. Blockage detection and localization.

5\. Water-level trend analysis.

6\. Time-to-critical-level estimation.

7\. Flood-risk classification.

8\. Sensor and actuator fault detection.

9\. Intervention decision logic.

10\. Actuator control.

11\. Digital twin and dashboard.

12\. Benchmarking and experiment management.



Keep business logic independent of the user interface.



Keep sensor hardware interfaces independent of processing algorithms.



The same processing logic must work with simulated readings and actual ESP32 readings.



The backend must remain the authoritative source for system state and control decisions.



\## 5. Development Strategy



Development is simulation-first.



Build and test the software using virtual sensors and virtual actuators before connecting physical hardware.



The system must support switching between:



\- Simulation mode

\- Hardware mode



Do not hardcode simulated readings into the actual processing algorithms.



Create separate adapters for simulated and physical sensor inputs.



Use clearly identified data sources so simulated results are never misrepresented as real hardware measurements.



\## 6. Core Features



\### A. Sensor Monitoring



Monitor water levels and flow rates at different locations.



Validate readings before processing.



Handle missing, stale, invalid and physically implausible measurements.



\### B. Blockage Localization



Compare measurements across drainage sections.



Estimate the probable location of a restriction using water-level and flow patterns.



Represent uncertainty where the evidence is insufficient.



Do not claim exact blockage localization when the sensor arrangement only supports estimating a segment.



\### C. Prediction



Estimate developing drainage risk.



Implement time-to-critical-level estimation using calibrated water-level trends.



Handle non-rising levels, unstable trends and insufficient data.



Never manufacture a countdown when a reliable estimate is unavailable.



\### D. Machine Learning



Develop a flood-risk classification model only when appropriate training data exists.



Record dataset origin, features, labels, preprocessing, training and evaluation methodology.



Prevent data leakage.



Compare the model against simple baseline methods.



Never invent accuracy, precision, recall or other performance metrics.



\### E. Fault Detection



Identify potential sensor faults, stale readings, stuck readings, implausible jumps and actuator failures.



Distinguish a suspected fault from a confirmed fault.



\### F. Predictive Intervention



Use sensor validity, blockage diagnosis, risk estimates and actuator safety conditions to decide whether intervention is appropriate.



Implement safe control limits, timeouts, manual override and emergency stop.



Verify intervention through subsequent sensor readings.



Never assume an actuator succeeded merely because a command was issued.



\### G. Digital Twin



Provide a live visual representation of the miniature drainage network.



Show:



\- Drainage sections.

\- Sensor locations.

\- Water levels and flow.

\- Probable blockage location.

\- Risk classification.

\- Time-to-critical estimate.

\- Diversion gate position.

\- Pump state.

\- System faults.

\- Alerts and event history.



Prioritize a polished, informative 2D interactive representation over unnecessary 3D complexity.



\### H. Scenario Simulator and Benchmarking



Support controlled experiments involving:



\- Normal drainage.

\- Partial and severe blockages.

\- Different blockage locations.

\- Increased water inflow.

\- Sensor faults.

\- Intervention enabled and disabled.



Compare DRAIN-X against a simple threshold-based baseline under equivalent conditions.



Measure performance using appropriate metrics, including:



\- Blockage localization accuracy.

\- Prediction error.

\- Warning lead time.

\- False alarms.

\- Peak water level.

\- Overflow volume.

\- Fault detection performance.

\- Intervention response.



Clearly distinguish physical experimental results from simulated results.



\## 7. Data and Interface Standards



Define shared data contracts before implementing modules independently.



Use consistent units:



\- Water depth: centimetres.

\- Flow rate: litres per minute.

\- Timestamps: ISO 8601 UTC.

\- Sensor identifiers: stable unique IDs.

\- Drainage sections: stable unique IDs.



Each sensor reading should include:



\- sensor\_id

\- section\_id

\- sensor\_type

\- value

\- unit

\- timestamp

\- source

\- status



Use Pydantic schemas for backend validation and shared TypeScript interfaces for frontend integration.



Document MQTT topics and message formats.



Avoid incompatible module-specific data structures.



\## 8. Reliability and Safety



\- Validate all incoming readings.

\- Handle disconnected sensors and communication failures.

\- Prevent repeated or conflicting actuator commands.

\- Use safe actuator defaults.

\- Implement manual override.

\- Implement emergency stop.

\- Add actuator timeouts.

\- Do not activate physical hardware from unvalidated simulated inputs.

\- Never expose database credentials or API secrets in frontend code.

\- Use environment variables for secrets and configuration.

\- Never claim a physical action occurred without feedback confirming it.



\## 9. Code Quality



\- Use clear module boundaries.

\- Prefer typed Python and TypeScript.

\- Write reusable functions.

\- Avoid unnecessary dependencies.

\- Avoid duplicate implementations.

\- Include meaningful error handling.

\- Write tests for core algorithms and state transitions.

\- Keep configuration separate from business logic.

\- Document non-obvious engineering decisions.



Do not overengineer the project with microservices, Kubernetes or unnecessary infrastructure.



\## 10. AI Agent Workflow



Before every substantial implementation task:



1\. Inspect the existing repository.

2\. Identify relevant files and dependencies.

3\. Explain the proposed implementation.

4\. Identify interfaces and dependencies.

5\. Identify edge cases and safety implications.

6\. Wait for approval when the task requests planning before implementation.



During implementation:



1\. Work only within the requested scope.

2\. Preserve existing working functionality.

3\. Avoid unnecessary file rewrites.

4\. Add tests.

5\. Run relevant tests and report their actual results.

6\. Explain modified files and unresolved issues.



Never claim code works unless it has been tested.



Do not independently change the agreed architecture or technology stack.



If a change is necessary, explain the reason and request approval.



\## 11. Competition Priorities



Prioritize:



1\. A working end-to-end prototype.

2\. Reliable sensor acquisition and processing.

3\. Credible blockage localization.

4\. Defensible predictive analysis.

5\. Safe automated intervention.

6\. Measurable improvement over a baseline.

7\. A polished digital twin and dashboard.

8\. Clear technical documentation and demonstration.



A smaller number of thoroughly tested features is preferable to many incomplete features.



The project must be explainable and defensible by its student developers.



