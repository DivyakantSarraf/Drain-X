import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DiversionGateTwin } from '../components/DiversionGateTwin';
import { SensorReadingContract, ActuatorDirectiveContract } from '../types/contracts';

describe('DiversionGateTwin Component', () => {
  const baseDirective: ActuatorDirectiveContract = {
    gate_target_angle: 0.0,
    action: 'MAINTAIN_NORMAL',
    reason: 'Nominal baseline drainage flow',
    risk_level: 'INFO',
    emergency_stop: false,
    timestamp: new Date().toISOString(),
  };

  const freshTimestamp = new Date().toISOString();

  const baseReadings: Record<string, SensorReadingContract> = {
    US_UPSTREAM_01: {
      version: '1.0',
      message_id: 'msg-01',
      sensor_id: 'US_UPSTREAM_01',
      section_id: 'SEC_SCREENING',
      sensor_type: 'WATER_LEVEL',
      value: 5.2,
      unit: 'cm',
      source: 'PHYSICAL',
      status: 'OK',
      timestamp: freshTimestamp,
    },
    US_WEIR_02: {
      version: '1.0',
      message_id: 'msg-02',
      sensor_id: 'US_WEIR_02',
      section_id: 'SEC_OUTLET',
      sensor_type: 'WATER_LEVEL',
      value: 1.1,
      unit: 'cm',
      source: 'PHYSICAL',
      status: 'OK',
      timestamp: freshTimestamp,
    },
  };

  it('renders primary and secondary channels with nominal state in simulation mode', () => {
    render(
      <DiversionGateTwin
        mode="SIMULATION"
        upstreamDepth={5.2}
        weirHead={1.1}
        inflow={5.0}
        gateDirective={baseDirective}
        readings={baseReadings}
      />
    );

    expect(screen.getByText(/SIMULATION MODE/i)).toBeTruthy();
    expect(screen.getByText(/TELEMETRY LIVE/i)).toBeTruthy();
    expect(screen.getByTestId('operator-indicator').textContent).toContain('NORMAL');
    expect(screen.getByTestId('commanded-angle').textContent).toBe('0.0°');
  });

  it('distinguishes open-loop command when physical feedback is absent', () => {
    const divertDirective: ActuatorDirectiveContract = {
      ...baseDirective,
      gate_target_angle: 90.0,
      action: 'DIVERT_FLOW',
      reason: 'Predicted flood risk threshold breached',
      risk_level: 'HIGH',
    };

    render(
      <DiversionGateTwin
        mode="HARDWARE"
        upstreamDepth={9.8}
        weirHead={1.0}
        inflow={6.0}
        gateDirective={divertDirective}
        readings={baseReadings} // Note: baseReadings has NO GATE_ANGLE sensor
      />
    );

    expect(screen.getByText(/PHYSICAL HARDWARE/i)).toBeTruthy();
    expect(screen.getByTestId('commanded-angle').textContent).toBe('90.0°');
    // Must NOT claim servo movement occurred: indicates open loop
    expect(screen.getByTestId('measured-angle').textContent).toContain('NOT REPORTED (OPEN LOOP)');
    expect(screen.getByTestId('operator-indicator').textContent).toContain('DIVERSION REQUESTED');
    expect(screen.getByText(/COMMAND WITHOUT CONFIRMATION/i)).toBeTruthy();
  });

  it('reflects verified measured position when physical gate angle sensor is reported', () => {
    const divertDirective: ActuatorDirectiveContract = {
      ...baseDirective,
      gate_target_angle: 90.0,
      action: 'DIVERT_FLOW',
      reason: 'Predictive TTC breached threshold',
      risk_level: 'HIGH',
    };

    const readingsWithFeedback: Record<string, SensorReadingContract> = {
      ...baseReadings,
      GATE_SERVO_01: {
        version: '1.0',
        message_id: 'msg-gate-01',
        sensor_id: 'GATE_SERVO_01',
        section_id: 'SEC_DIVERSION',
        sensor_type: 'GATE_ANGLE',
        value: 90.0,
        unit: 'deg',
        source: 'PHYSICAL',
        status: 'OK',
        timestamp: freshTimestamp,
      },
    };

    render(
      <DiversionGateTwin
        mode="HARDWARE"
        upstreamDepth={11.0}
        weirHead={0.8}
        inflow={7.0}
        gateDirective={divertDirective}
        readings={readingsWithFeedback}
      />
    );

    // Verified measured angle
    expect(screen.getByTestId('measured-angle').textContent).toBe('90.0°');
    expect(screen.getByText('[VERIFIED]')).toBeTruthy();
    expect(screen.getByTestId('operator-indicator').textContent).toContain('DIVERTED');
    expect(screen.getByText(/CLOSED-LOOP VERIFIED/i)).toBeTruthy();
  });

  it('renders DIVERTING operator indicator during transit', () => {
    const divertDirective: ActuatorDirectiveContract = {
      ...baseDirective,
      gate_target_angle: 90.0,
      action: 'DIVERT_FLOW',
    };

    const transitReadings: Record<string, SensorReadingContract> = {
      ...baseReadings,
      GATE_SERVO_01: {
        version: '1.0',
        message_id: 'msg-gate-02',
        sensor_id: 'GATE_SERVO_01',
        section_id: 'SEC_DIVERSION',
        sensor_type: 'GATE_ANGLE',
        value: 45.0, // Mid-transit angle
        unit: 'deg',
        source: 'PHYSICAL',
        status: 'OK',
        timestamp: freshTimestamp,
      },
    };

    render(
      <DiversionGateTwin
        mode="HARDWARE"
        upstreamDepth={10.2}
        weirHead={0.9}
        inflow={6.5}
        gateDirective={divertDirective}
        readings={transitReadings}
      />
    );

    expect(screen.getByTestId('measured-angle').textContent).toContain('45.0°');
    expect(screen.getByTestId('operator-indicator').textContent).toContain('DIVERTING');
  });

  it('detects STALE telemetry when readings are older than 8 seconds', () => {
    const staleTime = new Date(Date.now() - 15000).toISOString(); // 15 seconds old
    const staleReadings: Record<string, SensorReadingContract> = {
      US_UPSTREAM_01: {
        ...baseReadings.US_UPSTREAM_01,
        timestamp: staleTime,
      },
    };

    render(
      <DiversionGateTwin
        mode="HARDWARE"
        upstreamDepth={5.0}
        weirHead={1.0}
        inflow={5.0}
        gateDirective={baseDirective}
        readings={staleReadings}
      />
    );

    expect(screen.getByText(/STALE/i)).toBeTruthy();
  });

  it('detects OFFLINE status and FAULT indicator when telemetry is empty', () => {
    render(
      <DiversionGateTwin
        mode="HARDWARE"
        upstreamDepth={0.0}
        weirHead={0.0}
        inflow={0.0}
        gateDirective={baseDirective}
        readings={{}} // No readings
      />
    );

    expect(screen.getByText(/OFFLINE/i)).toBeTruthy();
    expect(screen.getByTestId('operator-indicator').textContent).toContain('FAULT');
  });

  it('renders RECOVERY indicator when gate is returning from diversion', () => {
    const normalDirective: ActuatorDirectiveContract = {
      ...baseDirective,
      gate_target_angle: 0.0,
      action: 'MAINTAIN_NORMAL',
    };

    const recoveringReadings: Record<string, SensorReadingContract> = {
      ...baseReadings,
      GATE_SERVO_01: {
        version: '1.0',
        message_id: 'msg-gate-03',
        sensor_id: 'GATE_SERVO_01',
        section_id: 'SEC_DIVERSION',
        sensor_type: 'GATE_ANGLE',
        value: 20.0, // Gate still swinging shut towards 0
        unit: 'deg',
        source: 'PHYSICAL',
        status: 'OK',
        timestamp: freshTimestamp,
      },
    };

    render(
      <DiversionGateTwin
        mode="HARDWARE"
        upstreamDepth={6.0}
        weirHead={1.0}
        inflow={5.0}
        gateDirective={normalDirective}
        readings={recoveringReadings}
      />
    );

    expect(screen.getByTestId('operator-indicator').textContent).toContain('RECOVERY');
  });
});
