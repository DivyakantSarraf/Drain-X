import math
import random
from typing import Optional

from app.models.contracts import (
    SensorReadingContract,
    SensorType,
    MeasurementUnit,
    DataSource,
    SensorHealthStatus,
)


class HydraulicChannelSimulator:
    """
    Two-Cell Open-Channel Hydraulic Simulation with Primary Screening Net and Outlet Weir.
    
    Model:
    - Inflow Qin(t) enters Upstream Storage Cell 1 (Area As1 = W * L1)
    - Water flows across Primary Net to Downstream Storage Cell 2 (Area As2 = W * L2)
    - Net restriction fraction beta in [0, 1] represents debris blockage
    - Water discharges over sharp-crested contracted weir at flume outlet
    - Generates SensorReadingContract telemetry with configurable noise & fault injection
    """

    def __init__(
        self,
        width_cm: float = 10.0,
        depth_cm: float = 15.0,
        cell1_length_cm: float = 40.0,
        cell2_length_cm: float = 55.0,
        weir_crest_height_cm: float = 4.0,
        weir_notch_width_cm: float = 5.0,
        seed: Optional[int] = None,
    ):
        self.width_cm = width_cm
        self.depth_cm = depth_cm
        self.as1 = width_cm * cell1_length_cm  # 400.0 cm^2
        self.as2 = width_cm * cell2_length_cm  # 550.0 cm^2
        self.pw = weir_crest_height_cm         # 4.0 cm
        self.b_weir = weir_notch_width_cm      # 5.0 cm

        if seed is not None:
            random.seed(seed)

        # Hydraulic State
        self.h1 = self.pw + 0.8  # Upstream water level (cm)
        self.h2 = self.pw + 0.6  # Downstream water level (cm)
        self.inflow_lpm = 5.0    # Base inflow in L/min
        self.blockage_beta = 0.0 # 0.0 = completely clean, 1.0 = completely clogged

        # Injected Sensor Faults
        self.fault_frozen_sensor: Optional[str] = None
        self.fault_frozen_value: float = 0.0
        self.fault_disconnected_sensor: Optional[str] = None
        self.fault_spike_sensor: Optional[str] = None

    def set_inflow(self, lpm: float) -> None:
        self.inflow_lpm = max(0.0, lpm)

    def set_blockage(self, beta: float) -> None:
        self.blockage_beta = min(0.98, max(0.0, beta))

    def step(self, dt: float) -> tuple[float, float, float, float]:
        """
        Advances the 2-cell hydraulic model by dt seconds.
        Returns: (h1, h2, q_in_lpm, q_weir_lpm)
        """
        g = 980.665  # cm/s^2
        # Convert inflow from L/min to cm^3/s: 1 L/min = 1000 cm^3 / 60 s = 16.6667 cm^3/s
        q_in_cm3_s = self.inflow_lpm * (1000.0 / 60.0)

        # Net discharge: open pore area with debris restriction
        cd_net = 0.65
        wetted_net_height = max(0.1, min(self.h1, self.depth_cm))
        a_gross = self.width_cm * wetted_net_height
        mesh_porosity = 0.08
        open_pore_area = a_gross * mesh_porosity * max(0.01, (1.0 - self.blockage_beta) ** 1.5)
        delta_h = max(0.01, self.h1 - self.h2)
        q_net_cm3_s = cd_net * open_pore_area * math.sqrt(2.0 * g * delta_h)

        # Weir discharge: Kindsvater-Carter simplified for contracted notch
        head_over_weir_cm = max(0.0, self.h2 - self.pw)
        if head_over_weir_cm > 0:
            # Q_weir [cm^3/s] ~ 1.84 * (b - 0.2*H) * H^1.5 in metric SI converted
            # Q [L/min] = 110.4 * (0.05 - 0.002 * hw_cm) * (hw_cm)^1.5
            b_m = self.b_weir * 0.01
            hw_m = head_over_weir_cm * 0.01
            b_effective = max(0.01, b_m - 0.2 * hw_m)
            q_weir_m3_s = 1.84 * b_effective * (hw_m ** 1.5)
            q_weir_cm3_s = q_weir_m3_s * 1_000_000.0
            q_weir_lpm = q_weir_m3_s * 60_000.0
        else:
            q_weir_cm3_s = 0.0
            q_weir_lpm = 0.0

        # Coupled continuity
        dh1 = ((q_in_cm3_s - q_net_cm3_s) / self.as1) * dt
        dh2 = ((q_net_cm3_s - q_weir_cm3_s) / self.as2) * dt

        self.h1 = max(0.1, min(self.depth_cm + 2.0, self.h1 + dh1))
        self.h2 = max(self.pw * 0.5, min(self.depth_cm + 2.0, self.h2 + dh2))

        return self.h1, self.h2, self.inflow_lpm, q_weir_lpm

    def generate_telemetry(self) -> list[SensorReadingContract]:
        """Generates realistic sensor readings conforming to SensorReadingContract."""
        readings = []

        # 1. Upstream Level Sensor (US_UPSTREAM_01)
        val_h1 = self.h1 + random.gauss(0, 0.03)
        status_h1 = SensorHealthStatus.OK
        if self.fault_frozen_sensor == "US_UPSTREAM_01":
            val_h1 = self.fault_frozen_value
        elif self.fault_disconnected_sensor == "US_UPSTREAM_01":
            status_h1 = SensorHealthStatus.FAULT
            val_h1 = 0.0
        elif self.fault_spike_sensor == "US_UPSTREAM_01":
            val_h1 = 99.9  # Implausible spike

        readings.append(
            SensorReadingContract(
                sensor_id="US_UPSTREAM_01",
                section_id="SEC_SCREENING",
                sensor_type=SensorType.WATER_LEVEL,
                value=round(max(0.0, val_h1), 2),
                unit=MeasurementUnit.CENTIMETRE,
                source=DataSource.SIMULATED,
                status=status_h1,
                metadata={"location": "Upstream flume pre-screening zone"}
            )
        )

        # 2. Downstream Weir Head Sensor (US_WEIR_02)
        hw = max(0.0, self.h2 - self.pw)
        val_hw = hw + random.gauss(0, 0.02)
        status_hw = SensorHealthStatus.OK
        if self.fault_frozen_sensor == "US_WEIR_02":
            val_hw = self.fault_frozen_value
        elif self.fault_disconnected_sensor == "US_WEIR_02":
            status_hw = SensorHealthStatus.FAULT
            val_hw = 0.0
        elif self.fault_spike_sensor == "US_WEIR_02":
            val_hw = 99.9

        readings.append(
            SensorReadingContract(
                sensor_id="US_WEIR_02",
                section_id="SEC_OUTLET",
                sensor_type=SensorType.WATER_LEVEL,
                value=round(max(0.0, val_hw), 2),
                unit=MeasurementUnit.CENTIMETRE,
                source=DataSource.SIMULATED,
                status=status_hw,
                metadata={"location": "Outlet weir crest drawdown zone", "crest_height_cm": self.pw}
            )
        )

        # 3. Pump Inflow (PUMP_INFLOW_01)
        val_q = self.inflow_lpm + random.gauss(0, 0.05)
        readings.append(
            SensorReadingContract(
                sensor_id="PUMP_INFLOW_01",
                section_id="SEC_INFLOW",
                sensor_type=SensorType.FLOW_RATE,
                value=round(max(0.0, val_q), 2),
                unit=MeasurementUnit.LITRES_PER_MINUTE,
                source=DataSource.SIMULATED,
                status=SensorHealthStatus.OK,
                metadata={"location": "Submersible pump delivery pipe"}
            )
        )

        # 4. Optical Debris Sensor (IR_DEBRIS_01)
        debris_occluded = 1.0 if self.blockage_beta >= 0.40 else 0.0
        readings.append(
            SensorReadingContract(
                sensor_id="IR_DEBRIS_01",
                section_id="SEC_SCREENING",
                sensor_type=SensorType.DEBRIS_PRESENCE,
                value=debris_occluded,
                unit=MeasurementUnit.FLAG,
                source=DataSource.SIMULATED,
                status=SensorHealthStatus.OK,
                metadata={"location": "Infrared break-beam across primary net face"}
            )
        )

        return readings
