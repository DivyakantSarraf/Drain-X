import React from 'react';
import { SensorReadingContract } from '../types/contracts';
import { RefreshCw, Database } from 'lucide-react';

interface LiveTelemetryTableProps {
  readings: Record<string, SensorReadingContract>;
  isLoading: boolean;
  error: string | null;
  onRefresh: () => void;
}

export const LiveTelemetryTable: React.FC<LiveTelemetryTableProps> = ({
  readings,
  isLoading,
  error,
  onRefresh,
}) => {
  const readingList = Object.values(readings);

  return (
    <div className="bg-slate-900 rounded border border-slate-800 shadow-xl overflow-hidden mb-6">
      <div className="px-4 py-3 border-b border-slate-800 flex justify-between items-center bg-[#070b12] font-mono">
        <div className="flex items-center gap-2">
          <Database className="w-3.5 h-3.5 text-cyan-400" />
          <h2 className="text-xs font-bold text-slate-100 uppercase tracking-wider">
            LIVE TELEMETRY INGEST STREAM
          </h2>
          <span className="text-[10px] bg-slate-800 text-cyan-300 px-2 py-0.5 rounded border border-slate-700">
            {readingList.length} CHANNELS
          </span>
        </div>
        <button
          onClick={onRefresh}
          disabled={isLoading}
          className="text-xs text-slate-400 hover:text-cyan-300 flex items-center gap-1.5 font-medium px-2 py-1 rounded bg-slate-800/80 hover:bg-slate-800 border border-slate-700 transition"
        >
          <RefreshCw className={`w-3 h-3 ${isLoading ? 'animate-spin text-cyan-400' : ''}`} />
          <span>SYNC</span>
        </button>
      </div>

      {/* Error State */}
      {error && (
        <div className="p-3 bg-rose-950/40 text-rose-300 text-xs font-mono border-b border-rose-800/80 flex justify-between items-center">
          <span>[STREAM_ERROR] Failed to ingest telemetry: {error}</span>
          <button
            onClick={onRefresh}
            className="underline font-bold text-rose-400 hover:text-rose-200"
          >
            RETRY
          </button>
        </div>
      )}

      {/* Loading State */}
      {isLoading && readingList.length === 0 ? (
        <div className="p-10 text-center text-slate-400 text-xs font-mono flex flex-col items-center justify-center gap-2">
          <RefreshCw className="w-5 h-5 animate-spin text-cyan-400" />
          <span>POLLING FASTAPI TELEMETRY BUS...</span>
        </div>
      ) : readingList.length === 0 ? (
        /* Empty State */
        <div className="p-10 text-center text-slate-500 text-xs font-mono">
          <Database className="w-6 h-6 mx-auto mb-2 text-slate-600" />
          <p className="font-semibold text-slate-400">NO TELEMETRY SIGNALS DETECTED</p>
          <p className="text-[11px] text-slate-500 mt-1">
            Dispatch a test reading from the testbed below or run a simulation scenario to stream sensor frames.
          </p>
        </div>
      ) : (
        /* Table View */
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs font-mono">
            <thead>
              <tr className="border-b border-slate-800 bg-slate-950/60 text-slate-400 uppercase tracking-wider text-[10px]">
                <th className="py-2.5 px-3">Sensor Identifier</th>
                <th className="py-2.5 px-3">Flume Section</th>
                <th className="py-2.5 px-3">Telemetry Type</th>
                <th className="py-2.5 px-3 text-right">Physical Value</th>
                <th className="py-2.5 px-3">Unit</th>
                <th className="py-2.5 px-3 text-center">Health</th>
                <th className="py-2.5 px-3 text-center">Source</th>
                <th className="py-2.5 px-3 text-right">Last Sync (UTC)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/80 bg-slate-900/60">
              {readingList.map((reading) => (
                <tr key={reading.sensor_id} className="hover:bg-slate-800/50 transition">
                  <td className="py-2.5 px-3 font-semibold text-slate-100 flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-cyan-400" />
                    {reading.sensor_id}
                  </td>
                  <td className="py-2.5 px-3 text-slate-400 text-[11px]">{reading.section_id}</td>
                  <td className="py-2.5 px-3 text-slate-400 text-[11px]">{reading.sensor_type}</td>
                  <td className="py-2.5 px-3 text-right font-bold text-cyan-300">
                    {reading.value.toFixed(2)}
                  </td>
                  <td className="py-2.5 px-3 text-slate-400 text-[11px]">{reading.unit}</td>
                  <td className="py-2.5 px-3 text-center">
                    <span
                      className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-bold ${
                        reading.status === 'OK'
                          ? 'bg-emerald-950/60 text-emerald-400 border border-emerald-800/80'
                          : reading.status === 'DEGRADED'
                          ? 'bg-amber-950/60 text-amber-400 border border-amber-800/80'
                          : 'bg-rose-950/60 text-rose-400 border border-rose-800/80'
                      }`}
                    >
                      {reading.status}
                    </span>
                  </td>
                  <td className="py-2.5 px-3 text-center">
                    <span
                      className={`inline-block px-1.5 py-0.5 rounded text-[10px] ${
                        reading.source === 'PHYSICAL'
                          ? 'bg-blue-950 text-blue-300 border border-blue-800'
                          : 'bg-slate-800 text-slate-400 border border-slate-700'
                      }`}
                    >
                      {reading.source}
                    </span>
                  </td>
                  <td className="py-2.5 px-3 text-right text-slate-500 text-[11px]">
                    {new Date(reading.timestamp).toLocaleTimeString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
