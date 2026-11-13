import { describe, it, expect } from 'vitest';
import {
  getTimelineBounds,
  getSampleAndHoldReadings,
  detectHistoricalEvents,
} from '../components/playback/playbackEngine';
import { SensorReadingContract } from '../types/contracts';

describe('Historical Playback Engine', () => {
  const sampleRecords: SensorReadingContract[] = [
    {
      version: '1.0',
      message_id: 'rec-01',
      sensor_id: 'US_UPSTREAM_01',
      section_id: 'SEC_SCREENING',
      sensor_type: 'WATER_LEVEL',
      value: 5.0,
      unit: 'cm',
      source: 'PHYSICAL',
      status: 'OK',
      timestamp: '2026-11-13T17:00:00.000Z',
    },
    {
      version: '1.0',
      message_id: 'rec-02',
      sensor_id: 'FS_FLUME_01',
      section_id: 'SEC_FLUME',
      sensor_type: 'FLOW_RATE',
      value: 12.0,
      unit: 'L/min',
      source: 'PHYSICAL',
      status: 'OK',
      timestamp: '2026-11-13T17:00:00.000Z',
    },
    {
      version: '1.0',
      message_id: 'rec-03',
      sensor_id: 'US_UPSTREAM_01',
      section_id: 'SEC_SCREENING',
      sensor_type: 'WATER_LEVEL',
      value: 6.5,
      unit: 'cm',
      source: 'PHYSICAL',
      status: 'OK',
      timestamp: '2026-11-13T17:00:05.000Z', // +1.5 cm surge in 5s
    },
    {
      version: '1.0',
      message_id: 'rec-04',
      sensor_id: 'US_UPSTREAM_01',
      section_id: 'SEC_SCREENING',
      sensor_type: 'WATER_LEVEL',
      value: 12.5,
      unit: 'cm',
      source: 'PHYSICAL',
      status: 'OK',
      timestamp: '2026-11-13T17:00:20.000Z', // Critical water depth
    },
    {
      version: '1.0',
      message_id: 'rec-05',
      sensor_id: 'FS_FLUME_01',
      section_id: 'SEC_FLUME',
      sensor_type: 'FLOW_RATE',
      value: 0.0,
      unit: 'L/min',
      source: 'PHYSICAL',
      status: 'OK',
      timestamp: '2026-11-13T17:00:25.000Z', // Zero flow
    },
    {
      version: '1.0',
      message_id: 'rec-06',
      sensor_id: 'US_UPSTREAM_01',
      section_id: 'SEC_SCREENING',
      sensor_type: 'WATER_LEVEL',
      value: 0.0,
      unit: 'cm',
      source: 'PHYSICAL',
      status: 'FAULT',
      timestamp: '2026-11-13T17:00:30.000Z',
      metadata: { fault_code: 'SENSOR_DISCONNECTED' },
    },
  ];

  it('computes accurate timeline boundaries from records', () => {
    const bounds = getTimelineBounds(sampleRecords);
    expect(bounds).not.toBeNull();
    expect(bounds!.startTimeMs).toBe(new Date('2026-11-13T17:00:00.000Z').getTime());
    expect(bounds!.endTimeMs).toBe(new Date('2026-11-13T17:00:30.000Z').getTime());
    expect(bounds!.totalDurationMs).toBe(30000); // 30 seconds

    expect(getTimelineBounds([])).toBeNull();
  });

  it('resolves active sensor readings at cursor timestamp via Sample-and-Hold', () => {
    const t0 = new Date('2026-11-13T17:00:00.000Z').getTime();
    const t1 = new Date('2026-11-13T17:00:08.000Z').getTime(); // between rec-03 and rec-04
    const tEnd = new Date('2026-11-13T17:00:30.000Z').getTime();

    // At t0: both sensors at initial reading
    const readingsAtT0 = getSampleAndHoldReadings(sampleRecords, t0);
    expect(readingsAtT0['US_UPSTREAM_01'].value).toBe(5.0);
    expect(readingsAtT0['FS_FLUME_01'].value).toBe(12.0);

    // At t1: US_UPSTREAM_01 is 6.5 cm, FS_FLUME_01 is still 12.0 L/min
    const readingsAtT1 = getSampleAndHoldReadings(sampleRecords, t1);
    expect(readingsAtT1['US_UPSTREAM_01'].value).toBe(6.5);
    expect(readingsAtT1['FS_FLUME_01'].value).toBe(12.0);

    // At tEnd: US_UPSTREAM_01 is FAULT (0.0 cm), FS_FLUME_01 is 0.0 L/min
    const readingsAtEnd = getSampleAndHoldReadings(sampleRecords, tEnd);
    expect(readingsAtEnd['US_UPSTREAM_01'].status).toBe('FAULT');
    expect(readingsAtEnd['FS_FLUME_01'].value).toBe(0.0);

    // Before any readings: empty map
    const readingsBefore = getSampleAndHoldReadings(sampleRecords, t0 - 1000);
    expect(Object.keys(readingsBefore)).toHaveLength(0);
  });

  it('detects historical events without fabricating unrecorded anomalies', () => {
    const events = detectHistoricalEvents(sampleRecords);
    expect(events.length).toBeGreaterThan(0);

    // 1. Water surge detected
    const surge = events.find((e) => e.type === 'WATER_SURGE');
    expect(surge).toBeDefined();
    expect(surge!.sensorId).toBe('US_UPSTREAM_01');
    expect(surge!.description).toContain('+1.5 cm');

    // 2. Critical depth detected
    const critical = events.find((e) => e.type === 'CRITICAL_WATER');
    expect(critical).toBeDefined();
    expect(critical!.sensorId).toBe('US_UPSTREAM_01');
    expect(critical!.value).toBe(12.5);

    // 3. Zero flow detected
    const zeroFlow = events.find((e) => e.type === 'ZERO_FLOW');
    expect(zeroFlow).toBeDefined();
    expect(zeroFlow!.sensorId).toBe('FS_FLUME_01');

    // 4. Sensor fault detected
    const fault = events.find((e) => e.type === 'SENSOR_FAULT');
    expect(fault).toBeDefined();
    expect(fault!.description).toContain('SENSOR_DISCONNECTED');
  });

  it('handles empty datasets cleanly without throwing', () => {
    expect(getTimelineBounds([])).toBeNull();
    expect(getSampleAndHoldReadings([], Date.now())).toEqual({});
    expect(detectHistoricalEvents([])).toEqual([]);
  });
});
