import { describe, it, expect, vi, beforeEach } from 'vitest';
import { apiClient, ApiError } from '../api/client';

describe('API Client Abstraction', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('successfully fetches system status', async () => {
    const mockStatus = {
      system_name: 'DRAIN-X',
      mode: 'SIMULATION',
      operational_state: 'MONITORING',
      uptime_seconds: 45.2,
      active_alerts_count: 0,
      last_heartbeat: '2026-11-02T00:00:00Z',
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

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockStatus,
    });

    const result = await apiClient.getStatus();
    expect(result.system_name).toBe('DRAIN-X');
    expect(result.mode).toBe('SIMULATION');
    expect(global.fetch).toHaveBeenCalledWith('/api/v1/status', expect.any(Object));
  });

  it('successfully fetches simulation state', async () => {
    const mockSim = {
      status: 'success',
      is_running: true,
      active_scenario: 'SUCCESSFUL_INTERVENTION',
      simulation_time_s: 24.5,
      system: {},
      mechanism: { state: 'HOISTING', tray_height_cm: 9.0 },
      blockage: { severity: 0.8 },
      prediction: { state: 'ESTIMATING', ttc_seconds: 28.0 },
      benchmark: { lead_time_advantage_s: 14.0 },
      active_faults: [],
    };

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockSim,
    });

    const result = await apiClient.getSimulationState();
    expect(result.is_running).toBe(true);
    expect(result.active_scenario).toBe('SUCCESSFUL_INTERVENTION');
    expect(result.mechanism.state).toBe('HOISTING');
  });

  it('successfully starts a scenario', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ status: 'success', scenario: 'GRADUAL_DEBRIS' }),
    });

    const result = await apiClient.startScenario('GRADUAL_DEBRIS', 42);
    expect(result.status).toBe('success');
    expect(result.scenario).toBe('GRADUAL_DEBRIS');
  });

  it('successfully triggers mechanism cycle', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ status: 'success', message: 'Cycle initiated' }),
    });

    const result = await apiClient.triggerMechanism();
    expect(result.status).toBe('success');
  });

  it('handles HTTP error responses gracefully with ApiError', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      statusText: 'Not Found',
      json: async () => ({ detail: 'Resource not found' }),
    });

    await expect(apiClient.resolveAlert('non-existent-id')).rejects.toThrow(ApiError);
  });
});
