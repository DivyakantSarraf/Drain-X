import { describe, it, expect } from 'vitest';
import {
  SensorReadingContract,
  AlertContract,
  SystemStatusContract,
  MechanismStatusContract,
  BenchmarkMetricsContract,
} from '../types/contracts';

describe('Frontend Data Contracts', () => {
  it('instantiates valid SensorReadingContract', () => {
    const reading: SensorReadingContract = {
      version: '1.0',
      message_id: '123e4567-e89b-12d3-a456-426614174000',
      sensor_id: 'US_UPSTREAM_01',
      section_id: 'SEC_SCREENING',
      sensor_type: 'WATER_LEVEL',
      value: 6.5,
      unit: 'cm',
      timestamp: new Date().toISOString(),
      source: 'SIMULATED',
      status: 'OK',
    };

    expect(reading.sensor_id).toBe('US_UPSTREAM_01');
    expect(reading.unit).toBe('cm');
    expect(reading.value).toBe(6.5);
  });

  it('instantiates valid AlertContract', () => {
    const alert: AlertContract = {
      alert_id: 'alert-abc-123',
      section_id: 'SEC_SCREENING',
      alert_type: 'CRITICAL_WATER_LEVEL',
      severity: 'CRITICAL',
      timestamp: new Date().toISOString(),
      message: 'Water level exceeded critical threshold',
      resolved: false,
    };

    expect(alert.severity).toBe('CRITICAL');
    expect(alert.resolved).toBe(false);
  });

  it('instantiates valid MechanismStatusContract', () => {
    const mechanism: MechanismStatusContract = {
      state: 'DEPLOYING_BACKUP_NET',
      backup_net_angle_deg: 45.0,
      tray_height_cm: 0.0,
      cycle_count: 2,
      current_action: 'Rotating backup net',
      elapsed_in_state_s: 0.25,
      is_jammed: false,
      is_fault: false,
      debris_retained_pct: 75.0,
    };

    expect(mechanism.state).toBe('DEPLOYING_BACKUP_NET');
    expect(mechanism.backup_net_angle_deg).toBe(45.0);
  });

  it('instantiates valid BenchmarkMetricsContract', () => {
    const benchmark: BenchmarkMetricsContract = {
      scenario_name: 'SUCCESSFUL_INTERVENTION',
      duration_s: 45.0,
      detection_delay_s: 2.5,
      false_alarms: 0,
      missed_detections: 0,
      prediction_rmse_s: 1.8,
      intervention_success_rate_pct: 100.0,
      time_above_critical_s: 1.2,
      baseline_detection_delay_s: 14.5,
      baseline_false_alarms: 1,
      baseline_time_above_critical_s: 18.0,
      lead_time_advantage_s: 12.0,
      overflow_reduction_pct: 93.3,
    };

    expect(benchmark.lead_time_advantage_s).toBe(12.0);
    expect(benchmark.overflow_reduction_pct).toBeGreaterThan(90);
  });

  it('instantiates valid SystemStatusContract with mechanism', () => {
    const status: SystemStatusContract = {
      system_name: 'DRAIN-X',
      mode: 'SIMULATION',
      operational_state: 'MONITORING',
      uptime_seconds: 120.5,
      active_alerts_count: 0,
      last_heartbeat: new Date().toISOString(),
      latest_readings: {},
      mechanism: {
        state: 'IDLE',
        backup_net_angle_deg: 0.0,
        tray_height_cm: 0.0,
        cycle_count: 0,
        current_action: 'Idle',
        elapsed_in_state_s: 0.0,
        is_jammed: false,
        is_fault: false,
        debris_retained_pct: 0.0,
      },
    };

    expect(status.mode).toBe('SIMULATION');
    expect(status.mechanism.state).toBe('IDLE');
  });
});
