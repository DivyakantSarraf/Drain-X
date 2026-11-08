import React from 'react';
import { AlertContract } from '../types/contracts';
import { AlertTriangle, CheckCircle2, ShieldAlert } from 'lucide-react';

interface AlertsPanelProps {
  alerts: AlertContract[];
  onResolve: (alertId: string) => void;
  isResolving: string | null;
}

export const AlertsPanel: React.FC<AlertsPanelProps> = ({
  alerts,
  onResolve,
  isResolving,
}) => {
  return (
    <div className="bg-slate-900 rounded border border-slate-800 shadow-xl overflow-hidden mb-6">
      {/* Panel Header */}
      <div className="px-4 py-3 border-b border-slate-800 bg-[#070b12] flex justify-between items-center font-mono">
        <div className="flex items-center gap-2">
          <ShieldAlert className="w-3.5 h-3.5 text-amber-400" />
          <h2 className="text-xs font-bold text-slate-100 uppercase tracking-wider">
            SYSTEM DIAGNOSTIC ALARMS
          </h2>
          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${
            alerts.length > 0
              ? 'bg-rose-950/80 text-rose-300 border-rose-800'
              : 'bg-slate-800 text-slate-400 border-slate-700'
          }`}>
            {alerts.length}
          </span>
        </div>
      </div>

      {alerts.length === 0 ? (
        <div className="p-8 text-center text-slate-500 text-xs font-mono flex flex-col items-center justify-center gap-1.5">
          <CheckCircle2 className="w-5 h-5 text-emerald-400 mb-1" />
          <p className="font-semibold text-slate-300">ZERO ACTIVE FAULTS</p>
          <p className="text-[11px] text-slate-500">
            Acoustic transducers, flume levels, and hoist mechanisms operating within normal hydraulic limits.
          </p>
        </div>
      ) : (
        <div className="divide-y divide-slate-800/80 font-mono">
          {alerts.map((alert) => (
            <div key={alert.alert_id} className="p-3.5 flex items-start justify-between gap-3 hover:bg-slate-800/40 transition">
              <div className="flex items-start gap-2.5">
                <div
                  className={`p-1 rounded mt-0.5 border ${
                    alert.severity === 'CRITICAL'
                      ? 'bg-rose-950 text-rose-400 border-rose-800 animate-pulse'
                      : alert.severity === 'HIGH'
                      ? 'bg-amber-950 text-amber-400 border-amber-800'
                      : 'bg-cyan-950 text-cyan-400 border-cyan-800'
                  }`}
                >
                  <AlertTriangle className="w-3.5 h-3.5" />
                </div>
                <div>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-xs font-bold text-slate-200">{alert.alert_type}</span>
                    <span
                      className={`text-[9px] font-bold px-1 py-0.2 rounded uppercase border ${
                        alert.severity === 'CRITICAL'
                          ? 'bg-rose-950 text-rose-400 border-rose-800'
                          : 'bg-amber-950 text-amber-400 border-amber-800'
                      }`}
                    >
                      {alert.severity}
                    </span>
                    <span className="text-[10px] text-slate-500">
                      {new Date(alert.timestamp).toLocaleTimeString()}
                    </span>
                  </div>
                  <p className="text-xs text-slate-300 font-sans mt-1">{alert.message}</p>
                  <p className="text-[10px] text-slate-500 mt-0.5">Section: {alert.section_id}</p>
                </div>
              </div>

              <button
                onClick={() => onResolve(alert.alert_id)}
                disabled={isResolving === alert.alert_id}
                className="text-[11px] font-mono font-bold text-emerald-400 hover:text-emerald-300 bg-emerald-950/60 hover:bg-emerald-900/60 border border-emerald-800/80 px-2.5 py-1 rounded transition whitespace-nowrap"
              >
                {isResolving === alert.alert_id ? 'ACK...' : 'ACK & CLEAR'}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
