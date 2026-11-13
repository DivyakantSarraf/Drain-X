import { SensorReadingContract } from '../../types/contracts';

export interface HistoricalPlaybackEvent {
  id: string;
  timestamp: string;
  timestampMs: number;
  type: 'WATER_SURGE' | 'CRITICAL_WATER' | 'ZERO_FLOW' | 'SENSOR_FAULT' | 'GATE_TRANSITION';
  severity: 'INFO' | 'WARNING' | 'CRITICAL';
  sensorId: string;
  title: string;
  description: string;
  value: number;
  unit: string;
}

export interface TimelineBounds {
  startTimeMs: number;
  endTimeMs: number;
  totalDurationMs: number;
}

/**
 * Extracts min and max timestamp boundaries in milliseconds from a chronological record array.
 */
export function getTimelineBounds(records: SensorReadingContract[]): TimelineBounds | null {
  if (!records || records.length === 0) return null;

  let min = Infinity;
  let max = -Infinity;

  for (const r of records) {
    const t = new Date(r.timestamp).getTime();
    if (!isNaN(t)) {
      if (t < min) min = t;
      if (t > max) max = t;
    }
  }

  if (min === Infinity || max === -Infinity) return null;

  return {
    startTimeMs: min,
    endTimeMs: max,
    totalDurationMs: Math.max(0, max - min),
  };
}

/**
 * Derives the active sensor readings map at cursor timestamp T using
 * Sample-and-Hold (Zero-Order Hold).
 * 
 * For each sensor, returns the most recent reading recorded at or before T.
 * Does not synthesize or fabricate non-existent values.
 */
export function getSampleAndHoldReadings(
  records: SensorReadingContract[],
  cursorMs: number
): Record<string, SensorReadingContract> {
  const latestBySensor: Record<string, SensorReadingContract> = {};

  for (const reading of records) {
    const t = new Date(reading.timestamp).getTime();
    if (isNaN(t) || t > cursorMs) {
      continue; // Future reading relative to cursor
    }

    const existing = latestBySensor[reading.sensor_id];
    if (!existing) {
      latestBySensor[reading.sensor_id] = reading;
    } else {
      const existingTime = new Date(existing.timestamp).getTime();
      if (t >= existingTime) {
        latestBySensor[reading.sensor_id] = reading;
      }
    }
  }

  return latestBySensor;
}

/**
 * Detects observable historical anomalies and inflection events directly
 * from the recorded telemetry without fabricating synthetic events.
 */
export function detectHistoricalEvents(records: SensorReadingContract[]): HistoricalPlaybackEvent[] {
  if (!records || records.length === 0) return [];

  const events: HistoricalPlaybackEvent[] = [];
  const previousValuesBySensor: Record<string, { value: number; timeMs: number }> = {};

  for (let i = 0; i < records.length; i++) {
    const r = records[i];
    const t = new Date(r.timestamp).getTime();
    if (isNaN(t)) continue;

    const prev = previousValuesBySensor[r.sensor_id];
    previousValuesBySensor[r.sensor_id] = { value: r.value, timeMs: t };

    // 1. Critical Water Depth (>= 12.0 cm)
    if (r.sensor_type === 'WATER_LEVEL' && r.value >= 12.0) {
      // Only emit event when crossing threshold
      if (!prev || prev.value < 12.0) {
        events.push({
          id: `crit_${r.sensor_id}_${t}`,
          timestamp: r.timestamp,
          timestampMs: t,
          type: 'CRITICAL_WATER',
          severity: 'CRITICAL',
          sensorId: r.sensor_id,
          title: `Critical Water Depth (${r.value.toFixed(1)} cm)`,
          description: `Water level at ${r.sensor_id} exceeded critical threshold (12.0 cm).`,
          value: r.value,
          unit: r.unit,
        });
      }
    }

    // 2. Rapid Water Level Surge (>= +1.0 cm within 10 seconds)
    if (r.sensor_type === 'WATER_LEVEL' && prev && (t - prev.timeMs) <= 10000) {
      const delta = r.value - prev.value;
      if (delta >= 1.0) {
        events.push({
          id: `surge_${r.sensor_id}_${t}`,
          timestamp: r.timestamp,
          timestampMs: t,
          type: 'WATER_SURGE',
          severity: 'WARNING',
          sensorId: r.sensor_id,
          title: `Rapid Inflow Surge (+${delta.toFixed(1)} cm)`,
          description: `Water level at ${r.sensor_id} rose rapidly (+${delta.toFixed(1)} cm in ${((t - prev.timeMs) / 1000).toFixed(1)}s).`,
          value: r.value,
          unit: r.unit,
        });
      }
    }

    // 3. Sensor Fault Detection
    const hasFaultCode = Boolean(r.metadata?.fault_code);
    if (r.status === 'FAULT' || hasFaultCode) {
      const faultDetail = (r.metadata?.fault_code as string) || 'SENSOR_FAULT';
      events.push({
        id: `fault_${r.sensor_id}_${t}`,
        timestamp: r.timestamp,
        timestampMs: t,
        type: 'SENSOR_FAULT',
        severity: 'CRITICAL',
        sensorId: r.sensor_id,
        title: `Sensor Fault (${faultDetail})`,
        description: `Diagnostic fault logged on ${r.sensor_id}: ${faultDetail}.`,
        value: r.value,
        unit: r.unit,
      });
    }

    // 4. Zero Flow Event (Flow sensor drops to 0.0 LPM)
    if (r.sensor_type === 'FLOW_RATE' && r.value === 0.0 && (!prev || prev.value > 0.0)) {
      events.push({
        id: `zeroflow_${r.sensor_id}_${t}`,
        timestamp: r.timestamp,
        timestampMs: t,
        type: 'ZERO_FLOW',
        severity: 'WARNING',
        sensorId: r.sensor_id,
        title: `Zero Flow Detected (${r.sensor_id})`,
        description: `Circulation flow dropped to 0.0 LPM at ${r.sensor_id}.`,
        value: 0.0,
        unit: r.unit,
      });
    }
  }

  // Sort events chronologically
  return events.sort((a, b) => a.timestampMs - b.timestampMs);
}
