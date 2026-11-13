import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  TelemetryStreamClient,
  streamEventToReading,
  isReadingNewer,
  getWebSocketStreamUrl,
} from '../api/streamClient';
import { TelemetryStreamEvent, SensorReadingContract } from '../types/contracts';

// Mock WebSocket
class MockWebSocket {
  static instances: MockWebSocket[] = [];
  static failToConnect = false;
  url: string;
  readyState: number = WebSocket.CONNECTING;
  onopen: ((event: Event) => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  onclose: ((event: CloseEvent) => void) | null = null;
  sentData: string[] = [];

  constructor(url: string) {
    this.url = url;
    MockWebSocket.instances.push(this);
    setTimeout(() => {
      if (MockWebSocket.failToConnect) {
        this.readyState = WebSocket.CLOSED;
        if (this.onerror) this.onerror(new Event('error'));
        if (this.onclose) this.onclose(new CloseEvent('close', { code: 1006, reason: 'Failed to connect' }));
      } else {
        this.readyState = WebSocket.OPEN;
        if (this.onopen) this.onopen(new Event('open'));
      }
    }, 10);
  }

  send(data: string) {
    this.sentData.push(data);
  }

  close(code = 1000, reason = '') {
    this.readyState = WebSocket.CLOSED;
    if (this.onclose) this.onclose(new CloseEvent('close', { code, reason }));
  }

  // Test helper to simulate incoming server message
  simulateMessage(payload: unknown) {
    if (this.onmessage) {
      this.onmessage(new MessageEvent('message', { data: JSON.stringify(payload) }));
    }
  }

  simulateError(errEvent = new Event('error')) {
    if (this.onerror) this.onerror(errEvent);
  }
}

describe('TelemetryStreamClient & Streaming Abstraction', () => {
  beforeEach(() => {
    MockWebSocket.instances = [];
    MockWebSocket.failToConnect = false;
    vi.stubGlobal('WebSocket', MockWebSocket);
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('generates correct WebSocket URLs with filters and tokens', () => {
    const urlDefault = getWebSocketStreamUrl('/api/v1/telemetry/stream');
    expect(urlDefault).toContain('/api/v1/telemetry/stream');

    const urlFiltered = getWebSocketStreamUrl('/api/v1/telemetry/stream', 'PHYSICAL', 'US_UPSTREAM_01', 'token123');
    expect(urlFiltered).toContain('source=PHYSICAL');
    expect(urlFiltered).toContain('sensor_id=US_UPSTREAM_01');
    expect(urlFiltered).toContain('token=token123');
  });

  it('correctly converts TelemetryStreamEvent into SensorReadingContract without fabrication', () => {
    const streamEventWater: TelemetryStreamEvent = {
      event_id: 'evt-001',
      event_type: 'TELEMETRY',
      timestamp: '2026-11-13T17:00:00Z',
      sensor_id: 'US_UPSTREAM_01',
      section_id: 'SEC_SCREENING',
      source: 'PHYSICAL',
      operational_mode: 'PHYSICAL',
      sensor_type: 'WATER_LEVEL',
      value: 6.8,
      unit: 'cm',
      water_level_cm: 6.8,
      flow_rate_lpm: null,
      cumulative_volume_liters: null,
      sensor_status: 'OK',
      is_valid: true,
      fault_code: null,
      hardware_validation_stage: 'PARTIALLY_ASSEMBLED',
    };

    const readingWater = streamEventToReading(streamEventWater);
    expect(readingWater.sensor_id).toBe('US_UPSTREAM_01');
    expect(readingWater.value).toBe(6.8);
    expect(readingWater.unit).toBe('cm');
    expect(readingWater.source).toBe('PHYSICAL');
    expect(readingWater.metadata?.water_level_cm).toBe(6.8);
    expect(readingWater.metadata?.flow_rate_lpm).toBeNull();
    expect(readingWater.metadata?.hardware_validation_stage).toBe('PARTIALLY_ASSEMBLED');

    // Test Flow sensor conversion
    const streamEventFlow: TelemetryStreamEvent = {
      event_id: 'evt-002',
      event_type: 'TELEMETRY',
      timestamp: '2026-11-13T17:00:01Z',
      sensor_id: 'FS_FLUME_01',
      section_id: 'SEC_FLUME',
      source: 'PHYSICAL',
      operational_mode: 'PHYSICAL',
      sensor_type: 'FLOW_RATE',
      value: 14.5,
      unit: 'L/min',
      water_level_cm: null,
      flow_rate_lpm: 14.5,
      cumulative_volume_liters: 28.2,
      sensor_status: 'OK',
      is_valid: true,
    };

    const readingFlow = streamEventToReading(streamEventFlow);
    expect(readingFlow.sensor_id).toBe('FS_FLUME_01');
    expect(readingFlow.value).toBe(14.5);
    expect(readingFlow.metadata?.flow_rate_lpm).toBe(14.5);
    expect(readingFlow.metadata?.cumulative_volume_liters).toBe(28.2);
    expect(readingFlow.metadata?.water_level_cm).toBeNull();
  });

  it('correctly distinguishes newer readings from stale/duplicate timestamps', () => {
    const olderReading: SensorReadingContract = {
      version: '1.0',
      message_id: '1',
      sensor_id: 'US_01',
      section_id: 'SEC_01',
      sensor_type: 'WATER_LEVEL',
      value: 5.0,
      unit: 'cm',
      timestamp: '2026-11-13T17:00:00.000Z',
      source: 'SIMULATED',
      status: 'OK',
    };

    const newerReading: SensorReadingContract = {
      ...olderReading,
      message_id: '2',
      value: 5.2,
      timestamp: '2026-11-13T17:00:01.000Z',
    };

    const staleReading: SensorReadingContract = {
      ...olderReading,
      message_id: '3',
      value: 4.9,
      timestamp: '2026-11-13T16:59:59.000Z',
    };

    expect(isReadingNewer(undefined, newerReading)).toBe(true);
    expect(isReadingNewer(olderReading, newerReading)).toBe(true);
    expect(isReadingNewer(newerReading, staleReading)).toBe(false);
  });

  it('connects and receives INIT message with initial snapshot', async () => {
    const onInit = vi.fn();
    const onStatusChange = vi.fn();

    const client = new TelemetryStreamClient({
      onInit,
      onStatusChange,
    });

    client.connect();

    // Advance timers so MockWebSocket opens
    await vi.advanceTimersByTimeAsync(20);
    expect(onStatusChange).toHaveBeenCalledWith('CONNECTED', expect.any(String));

    const mockWs = MockWebSocket.instances[0];
    expect(mockWs).toBeDefined();

    // Simulate INIT message from server
    const initMsg = {
      event_type: 'INIT',
      protocol_version: '1.0',
      client_id: 'c_test_01',
      connection_time: '2026-11-13T17:00:00Z',
      operational_mode: 'SIMULATION',
      hardware_validation_stage: 'INCREMENTAL_CONNECTIVITY',
      latest_snapshot: {
        US_UPSTREAM_01: {
          sensor_id: 'US_UPSTREAM_01',
          value: 4.8,
          unit: 'cm',
        },
      },
      message: 'Connected to DRAIN-X live telemetry stream',
    };
    mockWs.simulateMessage(initMsg);

    expect(onInit).toHaveBeenCalledWith(initMsg);
  });

  it('processes incoming TELEMETRY stream frames and invokes callback', async () => {
    const onTelemetry = vi.fn();

    const client = new TelemetryStreamClient({
      onTelemetry,
    });

    client.connect();
    await vi.advanceTimersByTimeAsync(20);

    const mockWs = MockWebSocket.instances[0];

    const streamFrame: TelemetryStreamEvent = {
      event_id: 'evt-100',
      event_type: 'TELEMETRY',
      timestamp: '2026-11-13T17:05:00Z',
      sensor_id: 'US_UPSTREAM_01',
      section_id: 'SEC_SCREENING',
      source: 'SIMULATED',
      operational_mode: 'SIMULATION',
      sensor_type: 'WATER_LEVEL',
      value: 7.2,
      unit: 'cm',
      water_level_cm: 7.2,
      sensor_status: 'OK',
      is_valid: true,
    };

    mockWs.simulateMessage(streamFrame);

    expect(onTelemetry).toHaveBeenCalledTimes(1);
    const [reading, event] = onTelemetry.mock.calls[0];
    expect(reading.sensor_id).toBe('US_UPSTREAM_01');
    expect(reading.value).toBe(7.2);
    expect(event.water_level_cm).toBe(7.2);
  });

  it('safely handles malformed frames and server ERROR events', async () => {
    const onError = vi.fn();
    const client = new TelemetryStreamClient({ onError });

    client.connect();
    await vi.advanceTimersByTimeAsync(20);

    const mockWs = MockWebSocket.instances[0];

    // 1. Invalid JSON
    if (mockWs.onmessage) {
      mockWs.onmessage(new MessageEvent('message', { data: 'NOT_VALID_JSON{[' }));
    }
    expect(onError).toHaveBeenCalledWith(expect.stringContaining('Malformed stream frame'));

    // 2. Server ERROR frame
    mockWs.simulateMessage({
      event_type: 'ERROR',
      message: 'Actuator commands are rejected.',
    });
    expect(onError).toHaveBeenCalledWith('Actuator commands are rejected.');
  });

  it('sends dynamic filter change frame to server', async () => {
    const client = new TelemetryStreamClient();
    client.connect();
    await vi.advanceTimersByTimeAsync(20);

    const mockWs = MockWebSocket.instances[0];

    client.setFilter('PHYSICAL', 'FS_FLUME_01');
    expect(mockWs.sentData).toHaveLength(1);
    const sentJson = JSON.parse(mockWs.sentData[0]);
    expect(sentJson.action).toBe('filter');
    expect(sentJson.source).toBe('PHYSICAL');
    expect(sentJson.sensor_id).toBe('FS_FLUME_01');
  });

  it('reconnects with backoff and jitter on unexpected socket closure', async () => {
    const onStatusChange = vi.fn();
    const client = new TelemetryStreamClient({
      baseReconnectDelayMs: 200,
      reconnectFactor: 1.5,
      maxReconnectAttempts: 3,
      onStatusChange,
    });

    client.connect();
    await vi.advanceTimersByTimeAsync(20);
    expect(client.getStatus()).toBe('CONNECTED');

    const firstWs = MockWebSocket.instances[0];
    // Simulate abnormal server drop
    firstWs.close(1006, 'Abnormal closure');

    expect(onStatusChange).toHaveBeenCalledWith('RECONNECTING', expect.stringContaining('Attempt 1/3'));

    // Advance past backoff + jitter
    await vi.advanceTimersByTimeAsync(600);
    expect(MockWebSocket.instances.length).toBe(2);
  });

  it('transitions to POLLING_FALLBACK when max reconnect attempts are exceeded', async () => {
    const onStatusChange = vi.fn();
    const client = new TelemetryStreamClient({
      baseReconnectDelayMs: 50,
      reconnectFactor: 1.0,
      maxReconnectAttempts: 2,
      onStatusChange,
    });

    MockWebSocket.failToConnect = true;
    client.connect();

    // Advance timers through initial connect failure and subsequent retries
    await vi.advanceTimersByTimeAsync(1000);

    expect(onStatusChange).toHaveBeenCalledWith(
      'POLLING_FALLBACK',
      expect.stringContaining('Active HTTP fallback')
    );
  });

  it('cleanly disconnects on unmount and prevents reconnect loops', async () => {
    const onStatusChange = vi.fn();
    const client = new TelemetryStreamClient({ onStatusChange });
    client.connect();
    await vi.advanceTimersByTimeAsync(20);

    client.disconnect();
    expect(client.getStatus()).toBe('DISCONNECTED');

    // Advance time - no new instances should be created
    await vi.advanceTimersByTimeAsync(5000);
    expect(MockWebSocket.instances.length).toBe(1);
  });
});
