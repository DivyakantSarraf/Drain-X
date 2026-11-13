import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { HistoricalPlaybackDashboard } from '../components/playback/HistoricalPlaybackDashboard';
import { apiClient } from '../api/client';
import { SensorReadingContract } from '../types/contracts';

describe('HistoricalPlaybackDashboard Component', () => {
  const mockHistoricalRecords: SensorReadingContract[] = [
    {
      version: '1.0',
      message_id: 'rec-01',
      sensor_id: 'US_UPSTREAM_01',
      section_id: 'SEC_SCREENING',
      sensor_type: 'WATER_LEVEL',
      value: 6.2,
      unit: 'cm',
      source: 'PHYSICAL',
      status: 'OK',
      timestamp: '2026-11-13T17:00:00.000Z',
    },
    {
      version: '1.0',
      message_id: 'rec-02',
      sensor_id: 'US_WEIR_02',
      section_id: 'SEC_OUTLET',
      sensor_type: 'WATER_LEVEL',
      value: 1.4,
      unit: 'cm',
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
      value: 12.8,
      unit: 'cm',
      source: 'PHYSICAL',
      status: 'OK',
      timestamp: '2026-11-13T17:00:10.000Z', // Critical surge event
    },
  ];

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('queries historical endpoint and renders playback controls and digital twin', async () => {
    vi.spyOn(apiClient, 'queryHistoricalTelemetry').mockResolvedValue({
      status: 'success',
      count: 3,
      sensor_id: null,
      source_filter: null,
      chronological: true,
      records: mockHistoricalRecords,
      is_truncated: false,
    });

    const onReturn = vi.fn();
    render(<HistoricalPlaybackDashboard onReturnToLive={onReturn} />);

    // Initial loading indicator
    expect(screen.getByText(/QUERYING/i)).toBeTruthy();

    // Await historical data population
    await waitFor(() => {
      const loadedElem = screen.getByTestId('loaded-samples');
      expect(loadedElem.textContent).toContain('3');
    });

    expect(screen.getByText(/RECORDED DATA ONLY/i)).toBeTruthy();
    expect(screen.getByTestId('play-pause-btn')).toBeTruthy();

    // Verify Return to Live button triggers callback
    const returnBtn = screen.getByText(/RETURN TO LIVE SCADA/i);
    fireEvent.click(returnBtn);
    expect(onReturn).toHaveBeenCalledTimes(1);
  });

  it('displays truncation warning when backend indicates dataset limit reached', async () => {
    vi.spyOn(apiClient, 'queryHistoricalTelemetry').mockResolvedValue({
      status: 'success',
      count: 300,
      sensor_id: null,
      source_filter: null,
      chronological: true,
      records: mockHistoricalRecords,
      is_truncated: true,
      truncation_warning: 'Historical query reached limit of 300 records; additional records may exist.',
    });

    render(<HistoricalPlaybackDashboard onReturnToLive={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText(/DATASET_TRUNCATED/i)).toBeTruthy();
      expect(screen.getByText(/Historical query reached limit of 300 records/i)).toBeTruthy();
    });
  });

  it('toggles playback state and speed multipliers', async () => {
    vi.spyOn(apiClient, 'queryHistoricalTelemetry').mockResolvedValue({
      status: 'success',
      count: 3,
      sensor_id: null,
      source_filter: null,
      chronological: true,
      records: mockHistoricalRecords,
    });

    render(<HistoricalPlaybackDashboard onReturnToLive={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByTestId('play-pause-btn')).toBeTruthy();
    });

    // Click PLAY -> transitions to PAUSE
    const playBtn = screen.getByTestId('play-pause-btn');
    expect(playBtn.textContent).toContain('PLAY');
    fireEvent.click(playBtn);
    expect(playBtn.textContent).toContain('PAUSE');

    // Click 2x speed
    const speed2xBtn = screen.getByText('2x');
    fireEvent.click(speed2xBtn);
    expect(speed2xBtn.className).toContain('text-amber-300');

    // Click 5x speed
    const speed5xBtn = screen.getByText('5x');
    fireEvent.click(speed5xBtn);
    expect(speed5xBtn.className).toContain('text-amber-300');
  });

  it('allows seeking via timeline slider and event navigation', async () => {
    vi.spyOn(apiClient, 'queryHistoricalTelemetry').mockResolvedValue({
      status: 'success',
      count: 3,
      sensor_id: null,
      source_filter: null,
      chronological: true,
      records: mockHistoricalRecords,
    });

    render(<HistoricalPlaybackDashboard onReturnToLive={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText(/Critical Water Depth/i)).toBeTruthy();
    });

    // Click on detected anomaly in event list
    const anomalyItem = screen.getByText(/Critical Water Depth/i);
    fireEvent.click(anomalyItem);

    // Active cursor should update to the event's timestamp (17:00:10)
    const cursorElem = screen.getByTestId('active-cursor-timestamp');
    expect(cursorElem.textContent).toContain('17:00:10');
  });
});
