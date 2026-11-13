import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  Play,
  Pause,
  RotateCcw,
  ChevronLeft,
  ChevronRight,
  Clock,
  Database,
  AlertTriangle,
  Radio,
  Sliders,
  CheckCircle2,
  Calendar,
} from 'lucide-react';
import { apiClient } from '../../api/client';
import { SensorReadingContract } from '../../types/contracts';
import { DigitalTwin } from '../DigitalTwin';
import {
  getTimelineBounds,
  getSampleAndHoldReadings,
  detectHistoricalEvents,
  HistoricalPlaybackEvent,
  TimelineBounds,
} from './playbackEngine';

interface HistoricalPlaybackDashboardProps {
  onReturnToLive: () => void;
}

export const HistoricalPlaybackDashboard: React.FC<HistoricalPlaybackDashboardProps> = ({
  onReturnToLive,
}) => {
  // Query Filters State
  const [sourceFilter, setSourceFilter] = useState<'ALL' | 'PHYSICAL' | 'SIMULATED'>('ALL');
  const [limit, setLimit] = useState<number>(300);
  const [timePreset, setTimePreset] = useState<'15m' | '1h' | '6h' | '24h' | 'ALL'>('1h');

  // Query Results State
  const [records, setRecords] = useState<SensorReadingContract[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [isTruncated, setIsTruncated] = useState<boolean>(false);
  const [truncationWarning, setTruncationWarning] = useState<string | null>(null);

  // Playback Engine State
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [playbackSpeed, setPlaybackSpeed] = useState<1 | 2 | 5>(1);
  const [cursorMs, setCursorMs] = useState<number>(0);

  const playbackTimerRef = useRef<ReturnType<typeof requestAnimationFrame> | null>(null);
  const lastTickTimeRef = useRef<number | null>(null);

  // Query historical telemetry from backend
  const loadHistoricalData = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    setIsPlaying(false);

    try {
      let startTime: string | undefined = undefined;
      const now = new Date();

      if (timePreset === '15m') {
        startTime = new Date(now.getTime() - 15 * 60 * 1000).toISOString();
      } else if (timePreset === '1h') {
        startTime = new Date(now.getTime() - 60 * 60 * 1000).toISOString();
      } else if (timePreset === '6h') {
        startTime = new Date(now.getTime() - 6 * 60 * 60 * 1000).toISOString();
      } else if (timePreset === '24h') {
        startTime = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
      }

      const res = await apiClient.queryHistoricalTelemetry({
        source: sourceFilter === 'ALL' ? undefined : sourceFilter,
        start_time: startTime,
        limit,
        chronological: true,
      });

      const fetched = res.records || [];
      setRecords(fetched);
      setIsTruncated(Boolean(res.is_truncated));
      setTruncationWarning(res.truncation_warning || null);

      if (fetched.length > 0) {
        const bounds = getTimelineBounds(fetched);
        if (bounds) {
          setCursorMs(bounds.startTimeMs);
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to query historical telemetry');
    } finally {
      setIsLoading(false);
    }
  }, [sourceFilter, limit, timePreset]);

  // Initial load
  useEffect(() => {
    loadHistoricalData();
  }, [loadHistoricalData]);

  // Derived timeline bounds
  const bounds: TimelineBounds | null = useMemo(() => {
    return getTimelineBounds(records);
  }, [records]);

  // Derived detected historical events
  const detectedEvents: HistoricalPlaybackEvent[] = useMemo(() => {
    return detectHistoricalEvents(records);
  }, [records]);

  // Active readings at current cursor timestamp (Sample-and-Hold)
  const currentReadings: Record<string, SensorReadingContract> = useMemo(() => {
    if (!bounds || records.length === 0) return {};
    return getSampleAndHoldReadings(records, cursorMs);
  }, [records, bounds, cursorMs]);

  // High-precision playback animation loop
  useEffect(() => {
    if (!isPlaying || !bounds) {
      lastTickTimeRef.current = null;
      return;
    }

    const onFrame = (nowMs: number) => {
      if (lastTickTimeRef.current === null) {
        lastTickTimeRef.current = nowMs;
      }

      const realDeltaMs = nowMs - lastTickTimeRef.current;
      lastTickTimeRef.current = nowMs;

      // Advance cursor scaled by playback multiplier
      const virtualDeltaMs = realDeltaMs * playbackSpeed;

      setCursorMs((prev) => {
        const next = prev + virtualDeltaMs;
        if (next >= bounds.endTimeMs) {
          setIsPlaying(false);
          return bounds.endTimeMs;
        }
        return next;
      });

      playbackTimerRef.current = requestAnimationFrame(onFrame);
    };

    playbackTimerRef.current = requestAnimationFrame(onFrame);

    return () => {
      if (playbackTimerRef.current) {
        cancelAnimationFrame(playbackTimerRef.current);
        playbackTimerRef.current = null;
      }
    };
  }, [isPlaying, playbackSpeed, bounds]);

  // Playback Controls
  const togglePlay = () => {
    if (!bounds) return;
    if (cursorMs >= bounds.endTimeMs) {
      // Loop or restart from start
      setCursorMs(bounds.startTimeMs);
    }
    setIsPlaying((prev) => !prev);
  };

  const rewindToStart = () => {
    setIsPlaying(false);
    if (bounds) {
      setCursorMs(bounds.startTimeMs);
    }
  };

  const stepTime = (seconds: number) => {
    if (!bounds) return;
    setIsPlaying(false);
    setCursorMs((prev) => {
      const target = prev + seconds * 1000;
      return Math.max(bounds.startTimeMs, Math.min(bounds.endTimeMs, target));
    });
  };

  const seekToEvent = (event: HistoricalPlaybackEvent) => {
    setIsPlaying(false);
    setCursorMs(event.timestampMs);
  };

  const seekToRelativeIndex = (direction: 'next' | 'prev') => {
    if (!bounds || detectedEvents.length === 0) return;
    setIsPlaying(false);

    if (direction === 'next') {
      const nextEvent = detectedEvents.find((e) => e.timestampMs > cursorMs + 100);
      if (nextEvent) {
        setCursorMs(nextEvent.timestampMs);
      }
    } else {
      const prevEvents = detectedEvents.filter((e) => e.timestampMs < cursorMs - 100);
      if (prevEvents.length > 0) {
        setCursorMs(prevEvents[prevEvents.length - 1].timestampMs);
      }
    }
  };

  // Derive visualizer attributes for DigitalTwin
  const upstreamDepth = currentReadings['US_UPSTREAM_01']?.value ?? 4.8;
  const weirHead = currentReadings['US_WEIR_02']?.value ?? 1.2;
  const pumpInflow =
    currentReadings['PUMP_INFLOW_01']?.value ??
    currentReadings['FS_FLUME_01']?.value ??
    5.0;

  const currentReadingList = Object.values(currentReadings);
  const activePhysical = currentReadingList.some((r) => r.source === 'PHYSICAL');

  const progressPct = bounds && bounds.totalDurationMs > 0
    ? Math.min(100, Math.max(0, ((cursorMs - bounds.startTimeMs) / bounds.totalDurationMs) * 100))
    : 0;

  const formattedCursorUtc = cursorMs > 0
    ? new Date(cursorMs).toISOString().replace('T', ' ').replace('Z', ' UTC')
    : '--';

  return (
    <div className="space-y-6">
      {/* Retrospective Analysis Mode Header */}
      <div className="bg-slate-900 border border-slate-800 rounded p-4 shadow-xl">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 pb-3 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="bg-amber-950/60 text-amber-400 border border-amber-800/80 p-2 rounded">
              <Clock className="w-5 h-5 animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-sm font-extrabold font-mono tracking-wider text-slate-100 uppercase">
                  HISTORICAL PLAYBACK <span className="text-amber-400">//</span> RETROSPECTIVE SCADA TIMELINE
                </h1>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-amber-950/80 text-amber-300 border border-amber-800 font-bold">
                  RECORDED DATA ONLY
                </span>
              </div>
              <p className="text-[11px] font-mono text-slate-400 mt-0.5">
                Inspect recorded hydraulic sensor logs, evaluate rate-of-rise surges, and analyze actuator directives.
              </p>
            </div>
          </div>

          <button
            onClick={onReturnToLive}
            className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-cyan-300 font-mono text-xs font-bold rounded border border-slate-700 flex items-center gap-1.5 transition"
          >
            <Radio className="w-3.5 h-3.5 text-cyan-400" />
            <span>RETURN TO LIVE SCADA</span>
          </button>
        </div>

        {/* Query Controls Toolbar */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 mt-4 text-xs font-mono">
          <div>
            <label className="text-slate-400 block mb-1">TIME WINDOW PRESET:</label>
            <select
              value={timePreset}
              onChange={(e) => setTimePreset(e.target.value as any)}
              className="w-full bg-slate-950 text-slate-200 border border-slate-700 rounded px-2.5 py-1.5 font-mono focus:outline-none focus:border-amber-500"
            >
              <option value="15m">Last 15 Minutes</option>
              <option value="1h">Last 1 Hour</option>
              <option value="6h">Last 6 Hours</option>
              <option value="24h">Last 24 Hours</option>
              <option value="ALL">All Available Time</option>
            </select>
          </div>

          <div>
            <label className="text-slate-400 block mb-1">SOURCE FILTER:</label>
            <select
              value={sourceFilter}
              onChange={(e) => setSourceFilter(e.target.value as any)}
              className="w-full bg-slate-950 text-slate-200 border border-slate-700 rounded px-2.5 py-1.5 font-mono focus:outline-none focus:border-amber-500"
            >
              <option value="ALL">ALL SOURCES</option>
              <option value="PHYSICAL">PHYSICAL SENSORS ONLY</option>
              <option value="SIMULATED">SIMULATION RUNS ONLY</option>
            </select>
          </div>

          <div>
            <label className="text-slate-400 block mb-1">SAMPLE LIMIT:</label>
            <select
              value={limit}
              onChange={(e) => setLimit(Number(e.target.value))}
              className="w-full bg-slate-950 text-slate-200 border border-slate-700 rounded px-2.5 py-1.5 font-mono focus:outline-none focus:border-amber-500"
            >
              <option value={100}>100 Records</option>
              <option value={300}>300 Records</option>
              <option value={500}>500 Records (Max)</option>
            </select>
          </div>

          <div className="flex items-end">
            <button
              onClick={loadHistoricalData}
              disabled={isLoading}
              className="w-full py-1.5 bg-amber-950/80 hover:bg-amber-900 border border-amber-800 text-amber-200 font-bold rounded flex items-center justify-center gap-1.5 transition"
            >
              <Calendar className="w-3.5 h-3.5" />
              <span>{isLoading ? 'QUERYING...' : 'RELOAD DATASET'}</span>
            </button>
          </div>
        </div>

        {/* Truncation & Dataset Incompleteness Warning */}
        {isTruncated && truncationWarning && (
          <div className="mt-3 p-2.5 rounded bg-amber-950/40 border border-amber-800/80 text-amber-300 font-mono text-[11px] flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-400 flex-shrink-0" />
            <span>[DATASET_TRUNCATED] {truncationWarning}</span>
          </div>
        )}

        {/* Error State */}
        {error && (
          <div className="mt-3 p-2.5 rounded bg-rose-950/50 border border-rose-800 text-rose-300 font-mono text-[11px] flex items-center justify-between">
            <span>[HISTORICAL_QUERY_ERROR] {error}</span>
            <button onClick={loadHistoricalData} className="underline font-bold">RETRY</button>
          </div>
        )}
      </div>

      {/* Scrubbing & Playback Controller Bar */}
      <div className="bg-slate-900 border border-slate-800 rounded p-4 shadow-xl">
        <div className="flex flex-col gap-3 font-mono">
          {/* Top Info Bar */}
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center text-xs gap-2">
            <div className="flex items-center gap-2">
              <span className={`w-2.5 h-2.5 rounded-full ${isPlaying ? 'bg-amber-400 animate-pulse' : 'bg-slate-500'}`} />
              <span className="font-bold text-slate-200">
                STATUS: {isPlaying ? 'PLAYING RECORDED TELEMETRY' : 'PAUSED'}
              </span>
              <span className="text-slate-400">|</span>
              <span className="text-slate-300">
                ACTIVE CURSOR: <span data-testid="active-cursor-timestamp" className="font-bold text-amber-300">{formattedCursorUtc}</span>
              </span>
            </div>

            <div className="flex items-center gap-2 text-slate-400 text-[11px]">
              <span data-testid="loaded-samples">LOADED: <strong className="text-slate-200">{records.length}</strong> SAMPLES</span>
              <span>•</span>
              <span>PROGRESS: <strong className="text-amber-300">{progressPct.toFixed(1)}%</strong></span>
            </div>
          </div>

          {/* Interactive Timeline Scrubber Slider */}
          <div className="space-y-1">
            <input
              type="range"
              aria-label="Historical timeline scrubber"
              min={bounds ? bounds.startTimeMs : 0}
              max={bounds ? bounds.endTimeMs : 100}
              value={cursorMs}
              disabled={!bounds || records.length === 0}
              onChange={(e) => {
                setIsPlaying(false);
                setCursorMs(Number(e.target.value));
              }}
              className="w-full h-2 bg-slate-950 rounded-lg appearance-none cursor-pointer accent-amber-500 border border-slate-700"
            />
            <div className="flex justify-between text-[10px] text-slate-400">
              <span>{bounds ? new Date(bounds.startTimeMs).toISOString().slice(11, 19) + ' UTC' : '--'}</span>
              <span>DURATION: {bounds ? (bounds.totalDurationMs / 1000).toFixed(1) + 's' : '0s'}</span>
              <span>{bounds ? new Date(bounds.endTimeMs).toISOString().slice(11, 19) + ' UTC' : '--'}</span>
            </div>
          </div>

          {/* Controls Bar */}
          <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-800">
            {/* Play/Pause & Stepping */}
            <div className="flex items-center gap-1.5">
              <button
                onClick={rewindToStart}
                disabled={!bounds}
                className="p-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition"
                title="Rewind to start"
              >
                <RotateCcw className="w-4 h-4" />
              </button>
              <button
                onClick={() => stepTime(-1)}
                disabled={!bounds}
                className="px-2 py-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 text-xs font-bold transition"
                title="Step backward 1 second"
              >
                -1s
              </button>
              <button
                onClick={togglePlay}
                disabled={!bounds || records.length === 0}
                data-testid="play-pause-btn"
                className={`px-4 py-1.5 rounded font-bold text-xs flex items-center gap-1.5 border transition shadow-sm ${
                  isPlaying
                    ? 'bg-amber-950/80 border-amber-700 text-amber-200 hover:bg-amber-900'
                    : 'bg-emerald-950/80 border-emerald-700 text-emerald-200 hover:bg-emerald-900'
                }`}
              >
                {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                <span>{isPlaying ? 'PAUSE' : 'PLAY'}</span>
              </button>
              <button
                onClick={() => stepTime(1)}
                disabled={!bounds}
                className="px-2 py-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 text-xs font-bold transition"
                title="Step forward 1 second"
              >
                +1s
              </button>
            </div>

            {/* Playback Multipliers */}
            <div className="flex items-center gap-1 bg-slate-950 p-1 rounded border border-slate-800 text-xs font-mono">
              <span className="text-[10px] text-slate-400 px-1">SPEED:</span>
              {([1, 2, 5] as const).map((spd) => (
                <button
                  key={spd}
                  onClick={() => setPlaybackSpeed(spd)}
                  className={`px-2 py-0.5 rounded text-[11px] font-bold transition ${
                    playbackSpeed === spd
                      ? 'bg-amber-950 text-amber-300 border border-amber-700 shadow-sm'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {spd}x
                </button>
              ))}
            </div>

            {/* Anomaly Navigation */}
            <div className="flex items-center gap-1.5 text-xs font-mono">
              <span className="text-[10px] text-slate-400">ANOMALIES:</span>
              <button
                onClick={() => seekToRelativeIndex('prev')}
                disabled={detectedEvents.length === 0}
                className="p-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition"
                title="Jump to previous recorded anomaly"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="text-[11px] text-amber-300 font-bold px-1">
                {detectedEvents.length} DETECTED
              </span>
              <button
                onClick={() => seekToRelativeIndex('next')}
                disabled={detectedEvents.length === 0}
                className="p-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition"
                title="Jump to next recorded anomaly"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Main Dual Grid: Digital Twin & Historical Anomaly Inspector */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left 2 Cols: Historical Digital Twin */}
        <div className="lg:col-span-2 space-y-6">
          <DigitalTwin
            upstreamDepth={upstreamDepth}
            weirHead={weirHead}
            pumpInflow={pumpInflow}
            mechanism={{
              state: 'IDLE',
              backup_net_angle_deg: 0,
              tray_height_cm: 0,
              cycle_count: 0,
              current_action: 'Historical Telemetry Replay',
              elapsed_in_state_s: 0,
              is_jammed: false,
              is_fault: false,
              debris_retained_pct: 0,
            }}
            blockage={null}
            prediction={null}
            mode={activePhysical ? 'HARDWARE' : 'SIMULATION'}
            readings={currentReadings}
            hardwareValidationStage={
              (currentReadings['US_UPSTREAM_01']?.metadata?.validation_stage as string) ||
              (currentReadings['FS_FLUME_01']?.metadata?.validation_stage as string) ||
              'HISTORICAL_PLAYBACK'
            }
          />

          {/* Active Historical Readings Table */}
          <div className="bg-slate-900 rounded border border-slate-800 shadow-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-800 bg-[#070b12] font-mono flex justify-between items-center text-xs">
              <div className="flex items-center gap-2">
                <Database className="w-3.5 h-3.5 text-amber-400" />
                <h3 className="font-bold text-slate-100 uppercase tracking-wider">
                  ACTIVE HISTORICAL SENSOR READINGS AT T={formattedCursorUtc.slice(11, 19)}
                </h3>
              </div>
              <span className="text-[10px] bg-amber-950/80 text-amber-300 px-2 py-0.5 rounded border border-amber-800 font-bold">
                {currentReadingList.length} ACTIVE CHANNELS
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left font-mono text-xs">
                <thead className="bg-slate-950/70 text-slate-400 border-b border-slate-800 text-[11px]">
                  <tr>
                    <th className="py-2.5 px-3">SENSOR ID</th>
                    <th className="py-2.5 px-3">MEASUREMENT</th>
                    <th className="py-2.5 px-3">SOURCE</th>
                    <th className="py-2.5 px-3">STATUS</th>
                    <th className="py-2.5 px-3">SAMPLE RECORDED AT</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {currentReadingList.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-8 text-center text-slate-400">
                        No sensor readings recorded at or before this timestamp.
                      </td>
                    </tr>
                  ) : (
                    currentReadingList.map((r) => (
                      <tr key={r.sensor_id} className="hover:bg-slate-800/40 transition">
                        <td className="py-2.5 px-3 font-bold text-slate-200">{r.sensor_id}</td>
                        <td className="py-2.5 px-3 font-bold text-cyan-300">
                          {r.value.toFixed(2)} {r.unit}
                        </td>
                        <td className="py-2.5 px-3">
                          <span
                            className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                              r.source === 'PHYSICAL'
                                ? 'bg-cyan-950 text-cyan-300 border border-cyan-800'
                                : 'bg-slate-800 text-slate-300 border border-slate-700'
                            }`}
                          >
                            {r.source}
                          </span>
                        </td>
                        <td className="py-2.5 px-3">
                          <span
                            className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                              r.status === 'OK'
                                ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                                : 'bg-rose-950 text-rose-300 border border-rose-800'
                            }`}
                          >
                            {r.status}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-slate-400 text-[11px]">
                          {new Date(r.timestamp).toISOString().slice(11, 23)} UTC
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Right Col: Historical Event Log & Inflection Points */}
        <div className="bg-slate-900 rounded border border-slate-800 shadow-xl p-4 flex flex-col font-mono">
          <div className="flex items-center justify-between pb-3 mb-3 border-b border-slate-800">
            <div className="flex items-center gap-2">
              <Sliders className="w-4 h-4 text-amber-400" />
              <h3 className="text-xs font-bold text-slate-100 uppercase tracking-wider">
                RECORDED ANOMALY TIMELINE
              </h3>
            </div>
            <span className="text-[10px] bg-slate-800 text-slate-300 px-2 py-0.5 rounded border border-slate-700">
              {detectedEvents.length} EVENTS
            </span>
          </div>

          <div className="flex-1 overflow-y-auto space-y-2.5 max-h-[600px] pr-1">
            {detectedEvents.length === 0 ? (
              <div className="p-8 text-center text-slate-400 text-xs">
                <CheckCircle2 className="w-6 h-6 text-emerald-400 mx-auto mb-2" />
                <p>No critical surges, zero-flow events, or sensor faults detected in loaded historical dataset.</p>
              </div>
            ) : (
              detectedEvents.map((evt) => {
                const isSelected = Math.abs(cursorMs - evt.timestampMs) < 1000;
                return (
                  <div
                    key={evt.id}
                    onClick={() => seekToEvent(evt)}
                    className={`p-3 rounded border cursor-pointer transition text-xs ${
                      isSelected
                        ? 'bg-amber-950/60 border-amber-500 shadow-md ring-1 ring-amber-500/50'
                        : evt.severity === 'CRITICAL'
                        ? 'bg-rose-950/30 border-rose-900 hover:bg-rose-950/60'
                        : 'bg-slate-950/60 border-slate-800 hover:bg-slate-800/60'
                    }`}
                  >
                    <div className="flex justify-between items-start gap-2 mb-1">
                      <span className={`font-bold text-[11px] ${
                        evt.severity === 'CRITICAL' ? 'text-rose-400' : 'text-amber-300'
                      }`}>
                        {evt.title}
                      </span>
                      <span className="text-[10px] text-slate-400">
                        {new Date(evt.timestamp).toISOString().slice(11, 19)}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-400 leading-tight">
                      {evt.description}
                    </p>
                    <div className="flex justify-between items-center mt-2 text-[10px]">
                      <span className="text-cyan-400 font-bold">{evt.sensorId}</span>
                      <span className="text-slate-400 underline hover:text-amber-300">
                        {isSelected ? 'CURRENT FRAME' : 'JUMP TO EVENT →'}
                      </span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
