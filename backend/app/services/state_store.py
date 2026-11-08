import time
from collections import deque
from datetime import datetime, timezone
import threading
from typing import Optional

from app.models.contracts import (
    SensorReadingContract,
    AlertContract,
    BlockageEventContract,
    PredictionContract,
    MechanismStatusContract,
    FaultEventContract,
    BenchmarkMetricsContract,
    SystemStatusContract,
    SystemOperationalState,
    AlertSeverity,
    ActuatorDirectiveContract,
    IncidentResponseContract,
    IncidentUpdateContract,
    IncidentStatus,
    IncidentCategory,
    IncidentSeverity,
    IncidentSource,
    validate_incident_status_transition,
)
from app.core.config import settings


class StateStore:
    """
    Authoritative In-Memory State Store for DRAIN-X.
    Maintains active telemetry, rolling historical windows, active alerts,
    blockage events, predictions, fault events, mechanism state, and benchmarking results.
    Thread-safe and independent of external database availability.
    """
    def __init__(self, max_history_per_sensor: int = 300):
        self._lock = threading.RLock()
        self._start_time = time.time()
        self._max_history = max_history_per_sensor
        
        # Mode & State
        self.mode = settings.SYSTEM_MODE
        self.operational_state = SystemOperationalState.MONITORING

        # Telemetry storage
        self._latest_readings: dict[str, SensorReadingContract] = {}
        self._history: dict[str, deque[SensorReadingContract]] = {}

        # Alerts and events
        self._alerts: dict[str, AlertContract] = {}
        self._blockages: dict[str, BlockageEventContract] = {}
        self._active_blockage: Optional[BlockageEventContract] = None
        self._latest_prediction: Optional[PredictionContract] = None
        self._latest_gate_directive: Optional[ActuatorDirectiveContract] = None

        # Mechanism state (screening physical simulation)
        self._mechanism = MechanismStatusContract()

        # Faults & Benchmark
        self._faults: dict[str, FaultEventContract] = {}
        self._active_scenario: Optional[str] = None
        self._latest_benchmark: Optional[BenchmarkMetricsContract] = None

        # Municipal & Citizen Incidents
        self._incidents: dict[str, IncidentResponseContract] = {}
        self.seed_demo_incidents()

    def clear(self, seed_incidents: bool = True) -> None:
        """Resets all stored telemetry, history, alerts, blockages, faults, mechanism state, and incidents."""
        with self._lock:
            self._latest_readings.clear()
            self._history.clear()
            self._alerts.clear()
            self._blockages.clear()
            self._active_blockage = None
            self._latest_prediction = None
            self._latest_gate_directive = None
            self._mechanism = MechanismStatusContract()
            self._faults.clear()
            self._active_scenario = None
            self._latest_benchmark = None
            self._incidents.clear()
            if seed_incidents:
                self.seed_demo_incidents()

    def ingest_reading(self, reading: SensorReadingContract) -> None:
        with self._lock:
            sensor_id = reading.sensor_id
            self._latest_readings[sensor_id] = reading

            if sensor_id not in self._history:
                self._history[sensor_id] = deque(maxlen=self._max_history)
            self._history[sensor_id].append(reading)

            # Automated threshold check for alerting
            if reading.unit.value == "cm" and reading.value >= settings.CRITICAL_WATER_DEPTH_CM:
                self.create_alert(
                    section_id=reading.section_id,
                    alert_type="CRITICAL_WATER_LEVEL",
                    severity=AlertSeverity.CRITICAL,
                    message=f"Water level on {reading.sensor_id} exceeded critical threshold: {reading.value:.1f} cm",
                    context_data={"sensor_id": sensor_id, "value": reading.value}
                )

    def get_latest_readings(self) -> dict[str, SensorReadingContract]:
        with self._lock:
            return dict(self._latest_readings)

    def get_sensor_history(self, sensor_id: str, limit: int = 100) -> list[SensorReadingContract]:
        with self._lock:
            if sensor_id not in self._history:
                return []
            items = list(self._history[sensor_id])
            return items[-limit:]

    def create_alert(
        self,
        section_id: str,
        alert_type: str,
        message: str,
        severity: AlertSeverity = AlertSeverity.WARNING,
        context_data: dict | None = None
    ) -> AlertContract:
        with self._lock:
            for alert in self._alerts.values():
                if not alert.resolved and alert.section_id == section_id and alert.alert_type == alert_type:
                    return alert

            alert = AlertContract(
                section_id=section_id,
                alert_type=alert_type,
                severity=severity,
                message=message,
                context_data=context_data or {}
            )
            self._alerts[alert.alert_id] = alert
            return alert

    def resolve_alert(self, alert_id: str) -> Optional[AlertContract]:
        with self._lock:
            if alert_id in self._alerts:
                alert = self._alerts[alert_id]
                alert.resolved = True
                alert.resolved_at = datetime.now(timezone.utc)
                return alert
            return None

    def get_alerts(self, active_only: bool = True) -> list[AlertContract]:
        with self._lock:
            if active_only:
                return [a for a in self._alerts.values() if not a.resolved]
            return list(self._alerts.values())

    def record_blockage(self, event: BlockageEventContract) -> None:
        with self._lock:
            self._blockages[event.event_id] = event
            if event.is_active:
                self._active_blockage = event
            elif self._active_blockage and self._active_blockage.event_id == event.event_id:
                self._active_blockage = None

    def get_active_blockage(self) -> Optional[BlockageEventContract]:
        with self._lock:
            return self._active_blockage

    def clear_active_blockage(self) -> None:
        with self._lock:
            if self._active_blockage:
                self._active_blockage.is_active = False
                self._active_blockage = None

    def set_prediction(self, prediction: PredictionContract) -> None:
        with self._lock:
            self._latest_prediction = prediction

    def get_prediction(self) -> Optional[PredictionContract]:
        with self._lock:
            return self._latest_prediction

    def set_gate_directive(self, directive: ActuatorDirectiveContract) -> None:
        with self._lock:
            self._latest_gate_directive = directive

    def get_gate_directive(self) -> Optional[ActuatorDirectiveContract]:
        with self._lock:
            return self._latest_gate_directive

    # Mechanism State
    def get_mechanism_status(self) -> MechanismStatusContract:
        with self._lock:
            return self._mechanism

    def update_mechanism_status(self, status: MechanismStatusContract) -> None:
        with self._lock:
            self._mechanism = status

    # Faults
    def record_fault(self, fault: FaultEventContract) -> None:
        with self._lock:
            self._faults[fault.fault_id] = fault

    def get_active_faults(self) -> list[FaultEventContract]:
        with self._lock:
            return [f for f in self._faults.values() if f.active]

    def clear_faults(self) -> None:
        with self._lock:
            for f in self._faults.values():
                f.active = False

    # Scenarios & Benchmarks
    def set_active_scenario(self, scenario_name: Optional[str]) -> None:
        with self._lock:
            self._active_scenario = scenario_name

    def get_active_scenario(self) -> Optional[str]:
        with self._lock:
            return self._active_scenario

    def set_benchmark_results(self, results: BenchmarkMetricsContract) -> None:
        with self._lock:
            self._latest_benchmark = results

    def get_benchmark_results(self) -> Optional[BenchmarkMetricsContract]:
        with self._lock:
            return self._latest_benchmark

    def get_system_status(self) -> SystemStatusContract:
        with self._lock:
            active_alerts = len([a for a in self._alerts.values() if not a.resolved])
            uptime = time.time() - self._start_time
            return SystemStatusContract(
                mode=self.mode,
                operational_state=self.operational_state,
                uptime_seconds=round(uptime, 1),
                active_alerts_count=active_alerts,
                last_heartbeat=datetime.now(timezone.utc),
                latest_readings=dict(self._latest_readings),
                active_prediction=self._latest_prediction,
                active_blockage=self._active_blockage,
                active_gate_directive=self._latest_gate_directive,
                mechanism=self._mechanism,
                active_scenario=self._active_scenario,
            )


    # Citizen & Municipal Incident Management
    def seed_demo_incidents(self) -> None:
        demo_items = [
            IncidentResponseContract(
                id="INC-DEMO-01",
                category=IncidentCategory.DRAIN_OVERFLOW,
                description="Severe storm runoff overflowing culvert embankment near St. Inez Church.",
                latitude=15.4920,
                longitude=73.8185,
                severity=IncidentSeverity.CRITICAL,
                status=IncidentStatus.INVESTIGATING,
                source=IncidentSource.DEMO,
                reporter_name="St. Inez Ward Committee",
                assigned_to="Team Alpha — St. Inez Drainage Crew",
                municipal_notes="High-capacity dewatering pump dispatched to site.",
            ),
            IncidentResponseContract(
                id="INC-DEMO-02",
                category=IncidentCategory.WATERLOGGING,
                description="Street waterlogging of 20cm depth blocking pedestrian access near Patto Plaza commercial district.",
                latitude=15.4989,
                longitude=73.8342,
                severity=IncidentSeverity.HIGH,
                status=IncidentStatus.ASSIGNED,
                source=IncidentSource.DEMO,
                reporter_name="Patto Commercial Association",
                assigned_to="Team Beta — Patto Rapid Response",
                municipal_notes="Suction tanker scheduled for 14:00 drain vacuuming.",
            ),
            IncidentResponseContract(
                id="INC-DEMO-03",
                category=IncidentCategory.DRAIN_BLOCKAGE,
                description="Accumulation of construction debris and plastic waste obstructing stone masonry drain along Rua 31 de Janeiro.",
                latitude=15.4965,
                longitude=73.8305,
                severity=IncidentSeverity.MEDIUM,
                status=IncidentStatus.VERIFIED,
                source=IncidentSource.DEMO,
                reporter_name="Fontainhas Heritage Watch",
                assigned_to="Team Gamma — Fontainhas Heritage Maintenance",
                municipal_notes="Verified by municipal field inspector. Manual clearing required.",
            ),
            IncidentResponseContract(
                id="INC-DEMO-04",
                category=IncidentCategory.INFRASTRUCTURE_DAMAGE,
                description="Displaced concrete grating slab over main arterial drain box near Miramar Circle.",
                latitude=15.4835,
                longitude=73.8078,
                severity=IncidentSeverity.LOW,
                status=IncidentStatus.RESOLVED,
                source=IncidentSource.DEMO,
                reporter_name="Panaji Municipal Patrol",
                assigned_to="Team Delta — Miramar Outfall Sluice Unit",
                municipal_notes="Grating slab repositioned and secured with structural steel anchors.",
            ),
        ]
        with self._lock:
            for item in demo_items:
                if item.id not in self._incidents:
                    self._incidents[item.id] = item

    def create_incident(self, incident: IncidentResponseContract) -> IncidentResponseContract:
        with self._lock:
            self._incidents[incident.id] = incident
            return incident

    def get_incident(self, incident_id: str) -> Optional[IncidentResponseContract]:
        with self._lock:
            return self._incidents.get(incident_id)

    def get_incidents(
        self,
        status: Optional[IncidentStatus] = None,
        category: Optional[IncidentCategory] = None,
        severity: Optional[IncidentSeverity] = None,
        source: Optional[IncidentSource] = None,
    ) -> list[IncidentResponseContract]:
        with self._lock:
            incidents = list(self._incidents.values())

            if status:
                incidents = [i for i in incidents if i.status == status]
            if category:
                incidents = [i for i in incidents if i.category == category]
            if severity:
                incidents = [i for i in incidents if i.severity == severity]
            if source:
                incidents = [i for i in incidents if i.source == source]

            # Return sorted by created_at descending
            return sorted(incidents, key=lambda x: x.created_at, reverse=True)

    def update_incident(
        self, incident_id: str, update: IncidentUpdateContract
    ) -> Optional[IncidentResponseContract]:
        with self._lock:
            incident = self._incidents.get(incident_id)
            if not incident:
                return None

            if update.status is not None:
                if not validate_incident_status_transition(incident.status, update.status):
                    raise ValueError(
                        f"Illegal status transition from {incident.status.value} to {update.status.value}"
                    )
                incident.status = update.status

            if update.assigned_to is not None:
                incident.assigned_to = update.assigned_to

            if update.municipal_notes is not None:
                incident.municipal_notes = update.municipal_notes

            if update.photos is not None:
                incident.photos = update.photos[:3]

            incident.updated_at = datetime.now(timezone.utc)
            return incident

    def attach_incident_photos(
        self, incident_id: str, new_photos: list[str]
    ) -> Optional[IncidentResponseContract]:
        with self._lock:
            incident = self._incidents.get(incident_id)
            if not incident:
                return None
            for p in new_photos:
                if len(incident.photos) >= 3:
                    break
                if p not in incident.photos:
                    incident.photos.append(p)
            incident.updated_at = datetime.now(timezone.utc)
            return incident


    def clear_scenario_outputs(self) -> None:
        """Clear scenario-specific blockage, prediction, and actuator output state."""
        with self._lock:
            if self._active_blockage:
                self._active_blockage.is_active = False
            self._active_blockage = None
            self._latest_prediction = None
            self._latest_gate_directive = None

# Global singleton store instance
state_store = StateStore()

