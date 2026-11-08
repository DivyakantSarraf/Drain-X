import React, { useState } from 'react';
import { Send, Sliders } from 'lucide-react';
import { apiClient } from '../api/client';
import { SensorType, MeasurementUnit, DataSource, SensorHealthStatus } from '../types/contracts';

interface TelemetrySimulatorProps {
  onReadingIngested: () => void;
}

export const TelemetrySimulator: React.FC<TelemetrySimulatorProps> = ({ onReadingIngested }) => {
  const [sensorId, setSensorId] = useState('US_UPSTREAM_01');
  const [sectionId, setSectionId] = useState('SEC_SCREENING');
  const [sensorType, setSensorType] = useState<SensorType>('WATER_LEVEL');
  const [value, setValue] = useState('4.5');
  const [unit, setUnit] = useState<MeasurementUnit>('cm');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setFeedback(null);

    try {
      const numVal = parseFloat(value);
      if (isNaN(numVal)) {
        throw new Error('Please enter a valid numeric value');
      }

      await apiClient.ingestTelemetry({
        sensor_id: sensorId,
        section_id: sectionId,
        sensor_type: sensorType,
        value: numVal,
        unit: unit,
        source: 'SIMULATED' as DataSource,
        status: 'OK' as SensorHealthStatus,
      });

      setFeedback(`Successfully ingested ${sensorId} = ${numVal} ${unit}`);
      onReadingIngested();
    } catch (err) {
      setFeedback(`Ingest failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="bg-slate-900 rounded border border-slate-800 shadow-xl p-4 sm:p-5 mb-8 font-mono">
      <div className="flex items-center gap-2 mb-4 pb-2 border-b border-slate-800">
        <Sliders className="w-4 h-4 text-cyan-400" />
        <h2 className="text-xs font-bold text-slate-100 uppercase tracking-wider">
          TELEMETRY BUS TESTBED // PROTOCOL INGESTION DIAGNOSTIC
        </h2>
        <span className="text-[10px] text-slate-500 font-normal ml-auto">
          (Injects validated JSON payloads into FastAPI /telemetry pipeline)
        </span>
      </div>

      <form onSubmit={handleSubmit} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3 items-end text-xs">
        <div>
          <label className="block text-slate-400 text-[10px] uppercase tracking-wider mb-1">Sensor ID</label>
          <input
            type="text"
            value={sensorId}
            onChange={(e) => setSensorId(e.target.value)}
            className="w-full bg-slate-950 border border-slate-700 text-slate-100 rounded px-2.5 py-1.5 font-mono focus:outline-none focus:border-cyan-500"
            required
          />
        </div>

        <div>
          <label className="block text-slate-400 text-[10px] uppercase tracking-wider mb-1">Section ID</label>
          <input
            type="text"
            value={sectionId}
            onChange={(e) => setSectionId(e.target.value)}
            className="w-full bg-slate-950 border border-slate-700 text-slate-100 rounded px-2.5 py-1.5 font-mono focus:outline-none focus:border-cyan-500"
            required
          />
        </div>

        <div>
          <label className="block text-slate-400 text-[10px] uppercase tracking-wider mb-1">Sensor Type</label>
          <select
            value={sensorType}
            onChange={(e) => {
              const t = e.target.value as SensorType;
              setSensorType(t);
              if (t === 'WATER_LEVEL') setUnit('cm');
              else if (t === 'FLOW_RATE') setUnit('L/min');
              else if (t === 'TEMPERATURE') setUnit('degC');
            }}
            className="w-full bg-slate-950 border border-slate-700 text-slate-100 rounded px-2.5 py-1.5 font-mono focus:outline-none focus:border-cyan-500"
          >
            <option value="WATER_LEVEL">WATER_LEVEL</option>
            <option value="FLOW_RATE">FLOW_RATE</option>
            <option value="TEMPERATURE">TEMPERATURE</option>
          </select>
        </div>

        <div>
          <label className="block text-slate-400 text-[10px] uppercase tracking-wider mb-1">Physical Value</label>
          <input
            type="number"
            step="0.1"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            className="w-full bg-slate-950 border border-slate-700 text-slate-100 rounded px-2.5 py-1.5 font-mono focus:outline-none focus:border-cyan-500"
            required
          />
        </div>

        <div>
          <label className="block text-slate-400 text-[10px] uppercase tracking-wider mb-1">Unit</label>
          <input
            type="text"
            value={unit}
            disabled
            className="w-full bg-slate-900 border border-slate-800 text-slate-500 rounded px-2.5 py-1.5 font-mono select-none"
          />
        </div>

        <div>
          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full bg-cyan-600 hover:bg-cyan-500 text-slate-950 font-bold py-1.5 px-3 rounded flex items-center justify-center gap-1.5 transition uppercase text-xs"
          >
            <Send className="w-3.5 h-3.5" />
            <span>{isSubmitting ? 'INGESTING...' : 'DISPATCH'}</span>
          </button>
        </div>
      </form>

      {feedback && (
        <p className="text-[11px] font-mono mt-3 text-cyan-300 bg-slate-950 p-2 rounded border border-slate-800">
          [BUS_RESPONSE] {feedback}
        </p>
      )}
    </div>
  );
};
