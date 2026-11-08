import React, { useState } from 'react';
import { Play, Square, FastForward, AlertTriangle, RotateCcw, Wrench, Terminal, Cpu } from 'lucide-react';
import { ScenarioType } from '../types/contracts';
import { apiClient } from '../api/client';

interface ScenarioControlsProps {
  isRunning: boolean;
  activeScenario: string | null;
  onStateChanged: () => void;
}

export const ScenarioControls: React.FC<ScenarioControlsProps> = ({
  isRunning,
  activeScenario,
  onStateChanged,
}) => {
  const [selectedScenario, setSelectedScenario] = useState<ScenarioType>('SUCCESSFUL_INTERVENTION');
  const [seed, setSeed] = useState(42);
  const [faultType, setFaultType] = useState('WINCH_JAM');
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  const handleStart = async () => {
    try {
      await apiClient.startScenario(selectedScenario, seed);
      setActionMessage(`[RUNNER] Started scenario: ${selectedScenario} (Seed: ${seed})`);
      onStateChanged();
    } catch (err) {
      setActionMessage(`[ERROR] Failed to start: ${err instanceof Error ? err.message : 'Error'}`);
    }
  };

  const handleStop = async () => {
    try {
      await apiClient.stopScenario();
      setActionMessage('[RUNNER] Scenario simulation halted by operator');
      onStateChanged();
    } catch (err) {
      setActionMessage(`[ERROR] Failed to stop: ${err instanceof Error ? err.message : 'Error'}`);
    }
  };

  const handleStep = async () => {
    try {
      await apiClient.stepSimulation(1.0);
      setActionMessage('[RUNNER] Single step advanced +1.0s dt');
      onStateChanged();
    } catch (err) {
      setActionMessage(`[ERROR] Step failed: ${err instanceof Error ? err.message : 'Error'}`);
    }
  };

  const handleInjectFault = async () => {
    try {
      await apiClient.injectFault(faultType);
      setActionMessage(`[DIAGNOSTIC] Injected hardware fault: ${faultType}`);
      onStateChanged();
    } catch (err) {
      setActionMessage(`[ERROR] Fault injection failed: ${err instanceof Error ? err.message : 'Error'}`);
    }
  };

  const handleTriggerCycle = async () => {
    try {
      await apiClient.triggerMechanism();
      setActionMessage('[OVERRIDE] Manual trigger issued for screening waste extraction cycle');
      onStateChanged();
    } catch (err) {
      setActionMessage(`[ERROR] Trigger rejected: ${err instanceof Error ? err.message : 'Error'}`);
    }
  };

  const handleResetMechanism = async () => {
    try {
      await apiClient.resetMechanism();
      setActionMessage('[OVERRIDE] Emergency reset: Carriage returned to channel bed (IDLE)');
      onStateChanged();
    } catch (err) {
      setActionMessage(`[ERROR] Reset failed: ${err instanceof Error ? err.message : 'Error'}`);
    }
  };

  return (
    <div className="bg-slate-900 rounded border border-slate-800 shadow-xl p-4 sm:p-5 mb-6">
      {/* Console Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 mb-4 pb-3 border-b border-slate-800">
        <div>
          <div className="flex items-center gap-2">
            <Cpu className="w-4 h-4 text-cyan-400" />
            <h2 className="text-xs font-mono font-bold text-slate-100 uppercase tracking-wider">
              OPERATOR CONSOLE // SCENARIO SIMULATION &amp; ACTUATOR OVERRIDES
            </h2>
          </div>
          <p className="text-[11px] font-mono text-slate-400 mt-0.5">
            Execute deterministic benchmark scenarios, command actuator cycles, or inject diagnostic failure modes.
          </p>
        </div>

        {activeScenario ? (
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-cyan-950/60 border border-cyan-800/80 text-cyan-300 font-mono text-xs">
            <span className="w-2 h-2 rounded-full bg-cyan-400 animate-ping" />
            <span className="font-bold">ACTIVE: {activeScenario}</span>
          </div>
        ) : (
          <span className="text-xs font-mono text-slate-500 bg-slate-800/60 px-2 py-1 rounded border border-slate-700">
            RUNNER STANDBY
          </span>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs font-mono">
        {/* Panel 1: Scenario Presets & Execution */}
        <div className="p-3 bg-slate-950/60 rounded border border-slate-800 flex flex-col justify-between">
          <div className="space-y-2">
            <div className="flex items-center justify-between text-[11px] text-slate-300 font-bold uppercase tracking-wider">
              <span>1. Scenario Presets</span>
              <span className="text-[9px] text-cyan-400">BENCHMARK</span>
            </div>

            <select
              value={selectedScenario}
              onChange={(e) => setSelectedScenario(e.target.value as ScenarioType)}
              className="w-full bg-slate-900 border border-slate-700 text-slate-200 rounded p-1.5 text-xs font-mono focus:border-cyan-500 focus:outline-none"
            >
              <option value="SUCCESSFUL_INTERVENTION">SUCCESSFUL_INTERVENTION (Closed-Loop)</option>
              <option value="GRADUAL_DEBRIS">GRADUAL_DEBRIS (Progressive Silt/Leaf)</option>
              <option value="SUDDEN_BLOCKAGE">SUDDEN_BLOCKAGE (Flash Surge Clutter)</option>
              <option value="INCREASING_INFLOW">INCREASING_INFLOW (Storm Hydrograph)</option>
              <option value="CLEAN_DRAINAGE">CLEAN_DRAINAGE (Steady Baseline Flow)</option>
              <option value="SENSOR_FAILURE">SENSOR_FAILURE (Acoustic Dropout)</option>
              <option value="FAILED_CYCLE">FAILED_CYCLE (Winch Mid-Stroke Stall)</option>
            </select>

            <div className="flex items-center justify-between text-slate-400 pt-1 text-[11px]">
              <span>Random Seed:</span>
              <input
                type="number"
                value={seed}
                onChange={(e) => setSeed(parseInt(e.target.value) || 0)}
                className="w-20 bg-slate-900 border border-slate-700 text-slate-100 rounded px-2 py-0.5 text-right font-mono"
              />
            </div>
          </div>

          <div className="flex items-center gap-2 pt-3">
            {!isRunning ? (
              <button
                onClick={handleStart}
                className="flex-1 bg-cyan-600 hover:bg-cyan-500 text-slate-950 font-bold py-1.5 px-3 rounded flex items-center justify-center gap-1.5 transition uppercase text-xs"
              >
                <Play className="w-3.5 h-3.5 fill-current" /> Run Scenario
              </button>
            ) : (
              <button
                onClick={handleStop}
                className="flex-1 bg-rose-600 hover:bg-rose-500 text-white font-bold py-1.5 px-3 rounded flex items-center justify-center gap-1.5 transition uppercase text-xs"
              >
                <Square className="w-3.5 h-3.5 fill-current" /> Halt Runner
              </button>
            )}

            <button
              onClick={handleStep}
              className="bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 font-semibold py-1.5 px-2.5 rounded flex items-center justify-center gap-1 transition"
              title="Advance single tick +1.0 second"
            >
              <FastForward className="w-3.5 h-3.5 text-cyan-400" /> Step +1s
            </button>
          </div>
        </div>

        {/* Panel 2: Manual Mechanism Actuation */}
        <div className="p-3 bg-slate-950/60 rounded border border-slate-800 flex flex-col justify-between">
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-[11px] text-slate-300 font-bold uppercase tracking-wider">
              <span>2. Actuator Overrides</span>
              <span className="text-[9px] text-emerald-400">PHYSICAL</span>
            </div>
            <p className="text-[10px] text-slate-400 leading-relaxed">
              Operator direct dispatch for automated waste screening carriage and auxiliary barrier deployment.
            </p>
          </div>

          <div className="flex flex-col gap-2 pt-3">
            <button
              onClick={handleTriggerCycle}
              className="w-full bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-bold py-1.5 px-3 rounded flex items-center justify-center gap-1.5 transition uppercase text-xs"
            >
              <Wrench className="w-3.5 h-3.5" /> Trigger Waste Cycle
            </button>

            <button
              onClick={handleResetMechanism}
              className="w-full bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 font-semibold py-1 px-3 rounded flex items-center justify-center gap-1.5 transition text-[11px]"
            >
              <RotateCcw className="w-3 h-3 text-amber-400" /> Reset Mechanism to Bed
            </button>
          </div>
        </div>

        {/* Panel 3: Diagnostic Fault Injection */}
        <div className="p-3 bg-amber-950/20 rounded border border-amber-900/40 flex flex-col justify-between">
          <div className="space-y-2">
            <div className="flex items-center justify-between text-[11px] text-amber-300 font-bold uppercase tracking-wider">
              <span>3. Diagnostic Fault Testbed</span>
              <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
            </div>

            <select
              value={faultType}
              onChange={(e) => setFaultType(e.target.value)}
              className="w-full bg-slate-900 border border-slate-700 text-slate-200 rounded p-1.5 text-xs font-mono focus:border-amber-500 focus:outline-none"
            >
              <option value="WINCH_JAM">WINCH_JAM (Carriage Hoist Stall)</option>
              <option value="SENSOR_DISCONNECT">SENSOR_DISCONNECT (Ultrasonic Loss)</option>
              <option value="SENSOR_FREEZE">SENSOR_FREEZE (Telemetry Stale Lock)</option>
              <option value="SENSOR_SPIKE">SENSOR_SPIKE (Noise Bounce Step Jump)</option>
            </select>
            <p className="text-[10px] text-slate-400">
              Validates fault alarms, safety timeouts, and recovery logic under degraded conditions.
            </p>
          </div>

          <button
            onClick={handleInjectFault}
            className="w-full mt-3 bg-amber-600 hover:bg-amber-500 text-slate-950 font-bold py-1.5 px-3 rounded flex items-center justify-center gap-1.5 transition uppercase text-xs"
          >
            <AlertTriangle className="w-3.5 h-3.5 fill-current" /> Inject Fault Mode
          </button>
        </div>
      </div>

      {/* Terminal Log Console */}
      <div className="mt-3.5 bg-[#050811] rounded border border-slate-800 p-2.5 flex items-center gap-2 font-mono text-xs">
        <Terminal className="w-4 h-4 text-cyan-400 flex-shrink-0" />
        <span className="text-slate-400 text-[11px] select-none">SCADA_LOG &gt;</span>
        <span className={`text-[11px] font-medium truncate ${
          actionMessage?.includes('[ERROR]') ? 'text-rose-400' :
          actionMessage?.includes('[DIAGNOSTIC]') ? 'text-amber-300' :
          'text-cyan-300'
        }`}>
          {actionMessage || 'System ready. Select a scenario and click RUN, or command an override cycle.'}
        </span>
      </div>
    </div>
  );
};
