import React from 'react';
import { Waves, Gauge, AlertTriangle, Clock, Cog, Zap } from 'lucide-react';
import { SystemStatusContract } from '../types/contracts';

interface KpiCardsProps {
  status: SystemStatusContract | null;
}

export const KpiCards: React.FC<KpiCardsProps> = ({ status }) => {
  const readings = status?.latest_readings || {};
  const upstreamDepth = readings['US_UPSTREAM_01']?.value;
  const weirHead = readings['US_WEIR_02']?.value;
  const pumpInflow = readings['PUMP_INFLOW_01']?.value;
  const blockage = status?.active_blockage;
  const prediction = status?.active_prediction;
  const mechanism = status?.mechanism;

  const criticalDepth = 12.0; // cm
  const isUpstreamCritical = upstreamDepth !== undefined && upstreamDepth >= criticalDepth;
  const isUpstreamWarning = upstreamDepth !== undefined && upstreamDepth >= 9.0 && !isUpstreamCritical;

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
      {/* 1. Upstream Level (h1) */}
      <div className={`p-3 rounded border font-mono transition-all ${
        isUpstreamCritical
          ? 'bg-rose-950/40 border-rose-700/80'
          : isUpstreamWarning
          ? 'bg-amber-950/30 border-amber-700/70'
          : 'bg-slate-900 border-slate-800'
      }`}>
        <div className="flex items-center justify-between text-[10px] text-slate-400 uppercase tracking-wider mb-1">
          <span>UPSTREAM (h1)</span>
          <Waves className="w-3.5 h-3.5 text-cyan-400" />
        </div>
        <div className="flex items-baseline gap-1">
          <span className={`text-xl font-bold tracking-tight ${
            isUpstreamCritical ? 'text-rose-400 animate-pulse' :
            isUpstreamWarning ? 'text-amber-400' :
            'text-cyan-300'
          }`}>
            {upstreamDepth !== undefined ? upstreamDepth.toFixed(1) : '--'}
          </span>
          <span className="text-[11px] text-slate-400">cm</span>
        </div>
        <div className="mt-2 w-full bg-slate-800 h-1.5 rounded-sm overflow-hidden">
          <div
            className={`h-full transition-all duration-300 ${
              isUpstreamCritical ? 'bg-rose-500' :
              isUpstreamWarning ? 'bg-amber-500' :
              'bg-cyan-500'
            }`}
            style={{ width: `${Math.min(100, ((upstreamDepth || 0) / 15.0) * 100)}%` }}
          />
        </div>
        <span className="text-[9px] text-slate-400 block mt-1">
          CRIT: {criticalDepth}cm
        </span>
      </div>

      {/* 2. Downstream Weir Head (hw) */}
      <div className="p-3 rounded border border-slate-800 bg-slate-900 font-mono">
        <div className="flex items-center justify-between text-[10px] text-slate-400 uppercase tracking-wider mb-1">
          <span>WEIR HEAD (hw)</span>
          <Gauge className="w-3.5 h-3.5 text-cyan-400" />
        </div>
        <div className="flex items-baseline gap-1">
          <span className="text-xl font-bold tracking-tight text-cyan-300">
            {weirHead !== undefined ? weirHead.toFixed(1) : '--'}
          </span>
          <span className="text-[11px] text-slate-400">cm</span>
        </div>
        <div className="mt-2 text-[10px] text-slate-400 flex justify-between">
          <span>Pw: 4.0cm</span>
          <span>OUTLET</span>
        </div>
        <span className="text-[9px] text-slate-400 block mt-1">
          Contracted Weir Crest
        </span>
      </div>

      {/* 3. Pump Inflow (Qin) */}
      <div className="p-3 rounded border border-slate-800 bg-slate-900 font-mono">
        <div className="flex items-center justify-between text-[10px] text-slate-400 uppercase tracking-wider mb-1">
          <span>INFLOW (Qin)</span>
          <Zap className="w-3.5 h-3.5 text-teal-400" />
        </div>
        <div className="flex items-baseline gap-1">
          <span className="text-xl font-bold tracking-tight text-teal-300">
            {pumpInflow !== undefined ? pumpInflow.toFixed(1) : '--'}
          </span>
          <span className="text-[11px] text-slate-400">L/min</span>
        </div>
        <div className="mt-2 text-[10px] text-slate-400 flex justify-between">
          <span>FEED: PUMP_01</span>
        </div>
        <span className="text-[9px] text-slate-400 block mt-1">
          Circulation Inflow
        </span>
      </div>

      {/* 4. Blockage Severity (β) */}
      <div className={`p-3 rounded border font-mono transition-all ${
        blockage && blockage.severity >= 0.55
          ? 'bg-rose-950/40 border-rose-700/80'
          : blockage && blockage.severity >= 0.25
          ? 'bg-amber-950/30 border-amber-700/70'
          : 'bg-slate-900 border-slate-800'
      }`}>
        <div className="flex items-center justify-between text-[10px] text-slate-400 uppercase tracking-wider mb-1">
          <span>BLOCKAGE (β)</span>
          <AlertTriangle className={`w-3.5 h-3.5 ${
            blockage && blockage.severity >= 0.55 ? 'text-rose-400' :
            blockage && blockage.severity >= 0.25 ? 'text-amber-400' :
            'text-emerald-400'
          }`} />
        </div>
        <div className="flex items-baseline gap-1">
          <span className={`text-xl font-bold tracking-tight ${
            blockage && blockage.severity >= 0.55 ? 'text-rose-400' :
            blockage && blockage.severity >= 0.25 ? 'text-amber-400' :
            'text-emerald-400'
          }`}>
            {blockage ? `${(blockage.severity * 100).toFixed(0)}%` : '0%'}
          </span>
          <span className="text-[10px] text-slate-400 uppercase font-sans">
            {blockage ? blockage.severity >= 0.55 ? 'HIGH' : 'MOD' : 'CLEAR'}
          </span>
        </div>
        <div className="mt-2 text-[10px] text-slate-400 flex justify-between">
          <span>Δh: {blockage ? `${blockage.differential_head_cm.toFixed(1)}cm` : '0.0cm'}</span>
        </div>
        <span className="text-[9px] text-slate-400 block mt-1">
          LOC: {blockage?.probable_segment || 'SEC_SCREENING'}
        </span>
      </div>

      {/* 5. Time-to-Critical (TTC) */}
      <div className={`p-3 rounded border font-mono transition-all ${
        prediction?.state === 'OVERFLOW'
          ? 'bg-rose-950/40 border-rose-700/80 animate-pulse'
          : prediction?.state === 'ESTIMATING'
          ? 'bg-amber-950/30 border-amber-700/70'
          : 'bg-slate-900 border-slate-800'
      }`}>
        <div className="flex items-center justify-between text-[10px] text-slate-400 uppercase tracking-wider mb-1">
          <span>PREDICTION (TTC)</span>
          <Clock className="w-3.5 h-3.5 text-cyan-400" />
        </div>
        <div className="flex items-baseline gap-1">
          <span className={`text-xl font-bold tracking-tight ${
            prediction?.state === 'OVERFLOW' ? 'text-rose-400' :
            prediction?.state === 'ESTIMATING' ? 'text-amber-400 font-extrabold' :
            'text-slate-200'
          }`}>
            {prediction?.state === 'OVERFLOW' ? 'OVERFLOW' :
             prediction?.state === 'ESTIMATING' && prediction.ttc_seconds !== null && prediction.ttc_seconds !== undefined
               ? `${prediction.ttc_seconds.toFixed(0)}s`
               : 'STABLE'}
          </span>
        </div>
        <div className="mt-2 text-[10px] text-slate-400 flex justify-between">
          <span>STATE: {prediction?.state || 'STABLE'}</span>
        </div>
        <span className="text-[9px] text-slate-400 block mt-1">
          Trend: {prediction?.rate_of_rise_cm_s ? `+${prediction.rate_of_rise_cm_s.toFixed(2)} cm/s` : 'Steady (dh/dt)'}
        </span>
      </div>

      {/* 6. Screening Mechanism */}
      <div className={`p-3 rounded border font-mono transition-all ${
        mechanism?.is_jammed
          ? 'bg-rose-950/40 border-rose-700/80'
          : mechanism?.state !== 'IDLE'
          ? 'bg-cyan-950/30 border-cyan-700/70'
          : 'bg-slate-900 border-slate-800'
      }`}>
        <div className="flex items-center justify-between text-[10px] text-slate-400 uppercase tracking-wider mb-1">
          <span>MECHANISM</span>
          <Cog className={`w-3.5 h-3.5 ${
            mechanism?.is_jammed ? 'text-rose-400' :
            mechanism?.state !== 'IDLE' ? 'animate-spin text-cyan-400' :
            'text-slate-500'
          }`} />
        </div>
        <div className="flex items-baseline gap-1">
          <span className={`text-sm font-bold tracking-tight truncate ${
            mechanism?.is_jammed ? 'text-rose-400' :
            mechanism?.state !== 'IDLE' ? 'text-cyan-300' :
            'text-slate-300'
          }`}>
            {mechanism?.state || 'IDLE'}
          </span>
        </div>
        <div className="mt-2 text-[10px] text-slate-400 flex justify-between">
          <span>Tray: {mechanism?.tray_height_cm.toFixed(1) || '0.0'}cm</span>
          <span>Aux: {mechanism?.backup_net_angle_deg.toFixed(0) || '0'}°</span>
        </div>
        <span className="text-[9px] text-slate-400 block mt-1">
          Cycles Completed: {mechanism?.cycle_count || 0}
        </span>
      </div>
    </div>
  );
};
