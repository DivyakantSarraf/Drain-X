import {
  SensorReadingContract,
  TelemetryStreamEvent,
  StreamInitMessage,
  StreamConnectionStatus,
  DataSource,
} from '../types/contracts';

export interface StreamClientOptions {
  url?: string;
  sourceFilter?: DataSource | null;
  sensorFilter?: string | null;
  token?: string | null;
  baseReconnectDelayMs?: number;
  maxReconnectDelayMs?: number;
  reconnectFactor?: number;
  maxReconnectAttempts?: number;
  heartbeatIntervalMs?: number;
  onInit?: (msg: StreamInitMessage) => void;
  onTelemetry?: (reading: SensorReadingContract, event: TelemetryStreamEvent) => void;
  onStatusChange?: (status: StreamConnectionStatus, detail?: string) => void;
  onError?: (err: string | Event) => void;
}

export function getWebSocketStreamUrl(
  path: string = '/api/v1/telemetry/stream',
  sourceFilter?: string | null,
  sensorFilter?: string | null,
  token?: string | null
): string {
  if (typeof window === 'undefined' || !window.location) {
    const params = new URLSearchParams();
    if (sourceFilter) params.set('source', sourceFilter);
    if (sensorFilter) params.set('sensor_id', sensorFilter);
    if (token) params.set('token', token);
    const qs = params.toString() ? `?${params.toString()}` : '';
    return `ws://127.0.0.1:8000${path}${qs}`;
  }

  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const host = window.location.host || '127.0.0.1:8000';
  const url = new URL(`${protocol}//${host}${path}`);
  if (sourceFilter) url.searchParams.set('source', sourceFilter);
  if (sensorFilter) url.searchParams.set('sensor_id', sensorFilter);
  if (token) url.searchParams.set('token', token);
  return url.toString();
}

export function streamEventToReading(event: TelemetryStreamEvent): SensorReadingContract {
  return {
    version: '1.0',
    message_id: event.event_id,
    sensor_id: event.sensor_id,
    section_id: event.section_id,
    sensor_type: event.sensor_type,
    value: event.value,
    unit: event.unit as any,
    timestamp: event.timestamp,
    source: event.source,
    status: event.sensor_status,
    metadata: {
      ...(event.metadata || {}),
      water_level_cm: event.water_level_cm,
      flow_rate_lpm: event.flow_rate_lpm,
      cumulative_volume_liters: event.cumulative_volume_liters,
      is_valid: event.is_valid,
      fault_code: event.fault_code,
      hardware_validation_stage: event.hardware_validation_stage,
      operational_mode: event.operational_mode,
    },
  };
}

export function isReadingNewer(
  existing: SensorReadingContract | undefined,
  incoming: SensorReadingContract
): boolean {
  if (!existing) return true;
  const existingTime = new Date(existing.timestamp).getTime();
  const incomingTime = new Date(incoming.timestamp).getTime();
  if (isNaN(incomingTime)) return true;
  if (isNaN(existingTime)) return true;
  return incomingTime >= existingTime;
}

export class TelemetryStreamClient {
  private ws: WebSocket | null = null;
  private status: StreamConnectionStatus = 'DISCONNECTED';
  private reconnectAttempts = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private isExplicitlyClosed = false;

  private options: StreamClientOptions;

  constructor(options: StreamClientOptions = {}) {
    this.options = {
      baseReconnectDelayMs: 1000,
      maxReconnectDelayMs: 8000,
      reconnectFactor: 1.5,
      maxReconnectAttempts: 8,
      heartbeatIntervalMs: 25000,
      ...options,
    };
  }

  public getStatus(): StreamConnectionStatus {
    return this.status;
  }

  public isConnected(): boolean {
    return this.status === 'CONNECTED';
  }

  public connect(): void {
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      return; // Already connecting or open
    }

    this.isExplicitlyClosed = false;
    this.clearTimers();

    const url =
      this.options.url ||
      getWebSocketStreamUrl(
        '/api/v1/telemetry/stream',
        this.options.sourceFilter,
        this.options.sensorFilter,
        this.options.token
      );

    try {
      this.ws = new WebSocket(url);
    } catch (err) {
      this.handleConnectionFailure(`Failed to create WebSocket: ${err instanceof Error ? err.message : String(err)}`);
      return;
    }

    this.ws.onopen = this.handleOpen.bind(this);
    this.ws.onmessage = this.handleMessage.bind(this);
    this.ws.onerror = this.handleError.bind(this);
    this.ws.onclose = this.handleClose.bind(this);
  }

  public disconnect(): void {
    this.isExplicitlyClosed = true;
    this.clearTimers();
    if (this.ws) {
      this.ws.onopen = null;
      this.ws.onmessage = null;
      this.ws.onerror = null;
      this.ws.onclose = null;
      try {
        this.ws.close(1000, 'Client unmounted');
      } catch {
        // Ignored
      }
      this.ws = null;
    }
    this.updateStatus('DISCONNECTED', 'Connection closed by client');
  }

  public setFilter(sourceFilter?: DataSource | null, sensorFilter?: string | null): void {
    this.options.sourceFilter = sourceFilter;
    this.options.sensorFilter = sensorFilter;

    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      try {
        this.ws.send(
          JSON.stringify({
            action: 'filter',
            source: sourceFilter || null,
            sensor_id: sensorFilter || null,
          })
        );
      } catch (err) {
        // Fallback: reconnect with updated query string
        this.reconnect();
      }
    }
  }

  public ping(): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      try {
        this.ws.send(JSON.stringify({ action: 'ping' }));
      } catch {
        // Ignored
      }
    }
  }

  private handleOpen(): void {
    this.reconnectAttempts = 0;
    this.updateStatus('CONNECTED', 'WebSocket connection established');
    this.startHeartbeat();
  }

  private handleMessage(event: MessageEvent): void {
    try {
      const data = JSON.parse(event.data);
      if (!data || typeof data !== 'object') return;

      const eventType = data.event_type;

      if (eventType === 'INIT') {
        const initMsg = data as StreamInitMessage;
        if (this.options.onInit) {
          this.options.onInit(initMsg);
        }
      } else if (eventType === 'TELEMETRY') {
        const streamEvent = data as TelemetryStreamEvent;
        const reading = streamEventToReading(streamEvent);
        if (this.options.onTelemetry) {
          this.options.onTelemetry(reading, streamEvent);
        }
      } else if (eventType === 'PONG') {
        // Heartbeat ACK
      } else if (eventType === 'FILTER_ACK') {
        // Dynamic filter ACK
      } else if (eventType === 'ERROR') {
        if (this.options.onError) {
          this.options.onError(data.message || 'Stream server reported error');
        }
      }
    } catch (parseErr) {
      if (this.options.onError) {
        this.options.onError(`Malformed stream frame received: ${parseErr instanceof Error ? parseErr.message : String(parseErr)}`);
      }
    }
  }

  private handleError(evt: Event): void {
    if (this.options.onError) {
      this.options.onError(evt);
    }
  }

  private handleClose(evt: CloseEvent): void {
    this.clearTimers();
    this.ws = null;

    if (this.isExplicitlyClosed) {
      this.updateStatus('DISCONNECTED', 'Client closed');
      return;
    }

    this.handleConnectionFailure(`Socket closed with code ${evt.code}: ${evt.reason || 'Normal/abnormal closure'}`);
  }

  private handleConnectionFailure(reason: string): void {
    if (this.isExplicitlyClosed) return;

    this.reconnectAttempts++;
    const maxAttempts = this.options.maxReconnectAttempts ?? 8;

    if (this.reconnectAttempts > maxAttempts) {
      this.updateStatus('POLLING_FALLBACK', `Max reconnect attempts reached (${maxAttempts}). Active HTTP fallback.`);
      return;
    }

    this.updateStatus(
      'RECONNECTING',
      `Attempt ${this.reconnectAttempts}/${maxAttempts}. Reason: ${reason}`
    );

    const base = this.options.baseReconnectDelayMs ?? 1000;
    const max = this.options.maxReconnectDelayMs ?? 8000;
    const factor = this.options.reconnectFactor ?? 1.5;
    const jitter = Math.random() * 300;
    const delay = Math.min(max, base * Math.pow(factor, this.reconnectAttempts - 1)) + jitter;

    this.reconnectTimer = setTimeout(() => {
      this.connect();
    }, delay);
  }

  private reconnect(): void {
    if (this.ws) {
      try {
        this.ws.close();
      } catch {
        // Ignored
      }
    }
    this.connect();
  }

  private updateStatus(newStatus: StreamConnectionStatus, detail?: string): void {
    this.status = newStatus;
    if (this.options.onStatusChange) {
      this.options.onStatusChange(newStatus, detail);
    }
  }

  private startHeartbeat(): void {
    const interval = this.options.heartbeatIntervalMs ?? 25000;
    this.heartbeatTimer = setInterval(() => {
      this.ping();
    }, interval);
  }

  private clearTimers(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }
}
