import React, { useState } from 'react';
import { ChevronDown, ChevronUp, Layers, Info } from 'lucide-react';

export const GisLegend: React.FC = () => {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div className="bg-slate-900/90 backdrop-blur border border-slate-800 rounded p-3 text-xs font-mono shadow-xl max-w-xs">
      <div
        className="flex items-center justify-between cursor-pointer border-b border-slate-800/80 pb-2 mb-2"
        onClick={() => setCollapsed(!collapsed)}
      >
        <div className="flex items-center gap-1.5 font-bold text-slate-200 uppercase tracking-wider text-[11px]">
          <Layers className="w-3.5 h-3.5 text-cyan-400" />
          <span>MAP LEGEND</span>
        </div>
        <button className="text-slate-400 hover:text-slate-200">
          {collapsed ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronUp className="w-3.5 h-3.5" />}
        </button>
      </div>

      {!collapsed && (
        <div className="space-y-3 text-[11px]">
          {/* Station Risk Levels */}
          <div>
            <div className="text-[10px] text-slate-400 uppercase font-semibold mb-1">
              Station Flood Risk:
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.7)]" />
                <span className="text-slate-300">Normal (&lt;6cm)</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-amber-500 shadow-[0_0_6px_rgba(245,158,11,0.7)]" />
                <span className="text-slate-300">Warning (6-10cm)</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-orange-500 shadow-[0_0_6px_rgba(249,115,22,0.7)]" />
                <span className="text-slate-300">High (10-12cm)</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-rose-500 shadow-[0_0_6px_rgba(239,68,68,0.7)] animate-pulse" />
                <span className="text-rose-300 font-bold">Crit (Overflow)</span>
              </div>
            </div>
          </div>

          {/* Infrastructure Markers */}
          <div>
            <div className="text-[10px] text-slate-400 uppercase font-semibold mb-1">
              Station Type:
            </div>
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <div className="w-3.5 h-3.5 rounded border border-cyan-400 bg-cyan-950 flex items-center justify-center text-[9px] text-cyan-300 font-bold">
                  P
                </div>
                <span className="text-cyan-300 font-semibold">Physical Testbed Flume</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3.5 h-3.5 rounded-full border border-slate-400 bg-slate-800 flex items-center justify-center text-[9px] text-slate-300">
                  S
                </div>
                <span className="text-slate-400">Simulated Network Station</span>
              </div>
            </div>
          </div>

          {/* Drainage Channels */}
          <div>
            <div className="text-[10px] text-slate-400 uppercase font-semibold mb-1">
              Conduits &amp; Canals:
            </div>
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="w-4 h-1 rounded bg-sky-400" />
                <span className="text-slate-300">Primary Trunk Channel</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-4 h-1 rounded bg-amber-400" />
                <span className="text-slate-300">Restricted Trunk Canal</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-4 h-1 rounded bg-teal-400 border-dashed border-b border-teal-300" />
                <span className="text-teal-300">Emergency Diversion Route</span>
              </div>
            </div>
          </div>

          {/* Citizen Incidents */}
          <div>
            <div className="text-[10px] text-slate-400 uppercase font-semibold mb-1">
              Field Reports:
            </div>
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-rose-600 flex items-center justify-center text-[8px] text-white font-bold">
                !
              </span>
              <span className="text-slate-300">Citizen Waterlogging Incident</span>
            </div>
          </div>

          <div className="text-[9px] text-slate-500 pt-1 border-t border-slate-800/80 flex items-start gap-1">
            <Info className="w-3 h-3 shrink-0 text-slate-400 mt-0.5" />
            <span>Map basemap courtesy of OpenStreetMap contributors. Demo data modeled for Panaji, Goa.</span>
          </div>
        </div>
      )}
    </div>
  );
};
