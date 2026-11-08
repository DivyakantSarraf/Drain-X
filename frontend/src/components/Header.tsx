import React from 'react';
import { Activity, Radio, AlertTriangle, ShieldCheck, MapPin } from 'lucide-react';

interface HeaderProps {
  mode: 'SIMULATION' | 'HARDWARE';
  operationalState: string;
  activeAlertsCount: number;
  onToggleMode: () => void;
  isToggling: boolean;
  activeView?: 'SCADA_TWIN' | 'GIS_FLOOD_MAP';
  onChangeView?: (view: 'SCADA_TWIN' | 'GIS_FLOOD_MAP') => void;
}

export const Header: React.FC<HeaderProps> = ({
  mode,
  operationalState,
  activeAlertsCount,
  onToggleMode,
  isToggling,
  activeView = 'SCADA_TWIN',
  onChangeView,
}) => {
  return (
    <header className="bg-slate-900 border-b border-slate-800 px-4 sm:px-6 py-3 sticky top-0 z-40 shadow-md">
      <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-start md:items-center gap-3">
        {/* Brand & SCADA Identity */}
        <div className="flex items-center space-x-3">
          <div className="bg-slate-800 border border-cyan-500/30 text-cyan-400 p-2 rounded">
            <Activity className="w-5 h-5 animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base font-extrabold tracking-wider font-mono text-slate-100 uppercase">
                DRAIN-X <span className="text-cyan-400 font-normal">//</span> SCADA
              </h1>
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 border border-slate-700">
                REV-2.4
              </span>
            </div>
            <p className="text-[11px] text-slate-400 font-mono tracking-tight">
              PREDICTIVE DRAINAGE INTELLIGENCE &amp; AUTOMATION
            </p>
          </div>
        </div>

        {/* Navigation View Switcher (SCADA vs GIS) */}
        {onChangeView && (
          <div className="flex items-center gap-1 bg-slate-950 p-1 rounded border border-slate-800 text-xs font-mono">
            <button
              onClick={() => onChangeView('SCADA_TWIN')}
              className={`px-3 py-1 rounded transition-colors flex items-center gap-1.5 ${
                activeView === 'SCADA_TWIN'
                  ? 'bg-cyan-950 text-cyan-300 font-bold border border-cyan-700 shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Activity className="w-3.5 h-3.5" />
              <span>SCADA TWIN</span>
            </button>
            <button
              onClick={() => onChangeView('GIS_FLOOD_MAP')}
              className={`px-3 py-1 rounded transition-colors flex items-center gap-1.5 ${
                activeView === 'GIS_FLOOD_MAP'
                  ? 'bg-cyan-950 text-cyan-300 font-bold border border-cyan-700 shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <MapPin className="w-3.5 h-3.5" />
              <span>GIS FLOOD INTELLIGENCE</span>
            </button>
          </div>
        )}

        {/* Status Indicators & Controls */}
        <div className="flex items-center flex-wrap gap-2.5 text-xs font-mono">
          {/* Active Alerts Badge */}
          {activeAlertsCount > 0 ? (
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-rose-950/60 text-rose-300 border border-rose-800/80 font-bold">
              <AlertTriangle className="w-3.5 h-3.5 text-rose-400 animate-bounce" />
              <span>{activeAlertsCount} ACTIVE {activeAlertsCount === 1 ? 'FAULT' : 'FAULTS'}</span>
            </div>
          ) : (
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-emerald-950/40 text-emerald-300 border border-emerald-800/60 font-semibold">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
              <span>SYSTEM HEALTHY</span>
            </div>
          )}

          {/* Operational State Pill */}
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-slate-800/90 text-slate-300 border border-slate-700">
            <span className={`w-2 h-2 rounded-full ${
              operationalState === 'MONITORING' ? 'bg-cyan-400 shadow-[0_0_8px_rgba(34,211,238,0.8)]' :
              operationalState === 'INTERVENING' ? 'bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.8)] animate-ping' :
              'bg-blue-400'
            }`} />
            <span className="text-[11px] uppercase tracking-wider font-semibold">
              STATE: <span className="text-slate-100">{operationalState}</span>
            </span>
          </div>

          {/* Mode Switcher Button */}
          <button
            onClick={onToggleMode}
            disabled={isToggling}
            className={`flex items-center gap-1.5 px-3 py-1 rounded text-xs font-mono font-semibold transition-all border ${
              mode === 'SIMULATION'
                ? 'bg-amber-950/40 border-amber-800/70 text-amber-300 hover:bg-amber-900/50'
                : 'bg-cyan-950/40 border-cyan-800/70 text-cyan-300 hover:bg-cyan-900/50'
            }`}
            title="Toggle between Software Simulation and Physical Hardware Telemetry modes"
          >
            <Radio className="w-3.5 h-3.5" />
            <span>MODE: {mode}</span>
            <span className="text-[10px] text-slate-500 font-normal">
              {isToggling ? '...' : '[TOGGLE]'}
            </span>
          </button>
        </div>
      </div>
    </header>
  );
};
