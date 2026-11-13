import React, { useState } from 'react';
import {
  MechanismStatusContract,
  BlockageEventContract,
  PredictionContract,
  ActuatorDirectiveContract,
  SensorReadingContract,
} from '../types/contracts';
import { AlertOctagon, Cog, GitBranch, Layers } from 'lucide-react';
import { DiversionGateTwin } from './DiversionGateTwin';

export interface DigitalTwinProps {
  upstreamDepth: number; // h1 in cm
  weirHead: number;      // hw in cm
  pumpInflow: number;    // Qin in L/min
  mechanism: MechanismStatusContract;
  blockage: BlockageEventContract | null;
  prediction: PredictionContract | null;
  mode?: 'SIMULATION' | 'HARDWARE';
  gateDirective?: ActuatorDirectiveContract | null;
  readings?: Record<string, SensorReadingContract>;
  activeAlertsCount?: number;
  hardwareValidationStage?: string | null;
}

export const DigitalTwin: React.FC<DigitalTwinProps> = ({
  upstreamDepth,
  weirHead,
  pumpInflow,
  mechanism,
  blockage,
  prediction,
  mode = 'SIMULATION',
  gateDirective = null,
  readings = {},
  activeAlertsCount = 0,
  hardwareValidationStage = null,
}) => {
  const [activeView, setActiveView] = useState<'flume' | 'gate' | 'dual'>('dual');
  const maxFlumeDepth = 15.0; // cm
  const criticalDepth = 12.0; // cm

  const isPhysicalSource =
    mode === 'HARDWARE' ||
    Object.values(readings).some((r) => r.source === 'PHYSICAL');

  // SVG dimensions
  const svgWidth = 860;
  const svgHeight = 290;
  const flumeBedY = 225;
  const flumeHeightPx = 140; // represents 15 cm flume height

  // Scale depth (cm) to pixels
  const pxPerCm = flumeHeightPx / maxFlumeDepth; // ~9.33 px/cm

  const h1Px = Math.min(flumeHeightPx, Math.max(4, upstreamDepth * pxPerCm));
  const h2Depth = 4.0 + weirHead; // Pw = 4.0 cm
  const h2Px = Math.min(flumeHeightPx, Math.max(4, h2Depth * pxPerCm));
  const criticalY = flumeBedY - (criticalDepth * pxPerCm);

  // Winch tray Y position (0 cm at bed, 18 cm at top dump)
  const trayLiftPx = Math.min(180, mechanism.tray_height_cm * pxPerCm);
  const trayCurrentY = flumeBedY - 6 - trayLiftPx;

  // Backup net angle (0 deg = horizontal, 90 deg = vertical)
  const backupAngle = mechanism.backup_net_angle_deg;

  // Blockage severity fraction
  const blockageSeverity = blockage?.severity || (mechanism.debris_retained_pct / 100);
  const getDebrisColor = () => {
    if (blockageSeverity > 0.7) return '#ef4444'; // critical red
    if (blockageSeverity > 0.4) return '#f59e0b'; // amber
    if (blockageSeverity > 0.15) return '#eab308'; // yellow
    return '#10b981'; // green clean
  };

  const diffHead = Math.max(0, upstreamDepth - (4.0 + weirHead));

  return (
    <div className="space-y-6 mb-6">
      {/* SCADA Digital Twin View Switcher */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-900 border border-slate-800 px-4 py-2.5 rounded shadow">
        <div className="flex items-center gap-2">
          <Layers className="w-4 h-4 text-cyan-400" />
          <span className="text-xs font-mono font-bold text-slate-200 uppercase tracking-wider">
            SCADA TWIN DISPLAY MODE:
          </span>
        </div>
        <div className="flex items-center gap-1.5 font-mono text-xs">
          <button
            onClick={() => setActiveView('dual')}
            className={`px-3 py-1 rounded transition-colors flex items-center gap-1.5 ${
              activeView === 'dual'
                ? 'bg-cyan-950 text-cyan-300 font-bold border border-cyan-700 shadow-sm'
                : 'bg-slate-800/80 text-slate-400 hover:text-slate-200 border border-slate-700/60'
            }`}
          >
            <span>DUAL MULTI-TWIN VIEW</span>
          </button>
          <button
            onClick={() => setActiveView('gate')}
            className={`px-3 py-1 rounded transition-colors flex items-center gap-1.5 ${
              activeView === 'gate'
                ? 'bg-cyan-950 text-cyan-300 font-bold border border-cyan-700 shadow-sm'
                : 'bg-slate-800/80 text-slate-400 hover:text-slate-200 border border-slate-700/60'
            }`}
          >
            <GitBranch className="w-3.5 h-3.5" />
            <span>SERVO DIVERSION GATE</span>
          </button>
          <button
            onClick={() => setActiveView('flume')}
            className={`px-3 py-1 rounded transition-colors flex items-center gap-1.5 ${
              activeView === 'flume'
                ? 'bg-cyan-950 text-cyan-300 font-bold border border-cyan-700 shadow-sm'
                : 'bg-slate-800/80 text-slate-400 hover:text-slate-200 border border-slate-700/60'
            }`}
          >
            <span>FLUME ELEVATION</span>
          </button>
        </div>
      </div>

      {/* Flume Schematic (Elevation) */}
      {(activeView === 'flume' || activeView === 'dual') && (
        <div className="bg-slate-900 rounded border border-slate-800 shadow-xl p-4 sm:p-5 overflow-hidden">
          {/* SCADA Mimic Header */}
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 mb-3 pb-3 border-b border-slate-800">
            <div>
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-cyan-400 shadow-[0_0_8px_rgba(34,211,238,0.8)] animate-pulse" />
                <h2 className="text-xs font-mono font-bold text-slate-100 uppercase tracking-wider">
                  FLUME SCHEMATIC // 2-CELL HYDRO-MECHANICAL DIGITAL TWIN
                </h2>
              </div>
              <p className="text-[11px] font-mono text-slate-400 mt-0.5">
                Real-time physical cross-section: Screening chamber, automated lift carriage, and sharp-crested outlet weir.
              </p>
            </div>

            <div className="flex items-center gap-2 text-xs font-mono">
              <span className={`px-2.5 py-1 rounded border flex items-center gap-1.5 ${
                mechanism.is_jammed
                  ? 'bg-rose-950/60 text-rose-300 border-rose-800'
                  : mechanism.state !== 'IDLE'
                  ? 'bg-cyan-950/50 text-cyan-300 border-cyan-800'
                  : 'bg-slate-800 text-slate-400 border-slate-700'
              }`}>
                <Cog className={`w-3.5 h-3.5 ${mechanism.state !== 'IDLE' ? 'animate-spin text-cyan-400' : 'text-slate-500'}`} />
                MECH: <span className="font-bold text-slate-100">{mechanism.state}</span>
              </span>

              {mechanism.is_jammed && (
                <span className="px-2 py-1 rounded font-bold bg-rose-900 text-rose-200 border border-rose-700 flex items-center gap-1 text-[11px] animate-pulse">
                  <AlertOctagon className="w-3.5 h-3.5" /> STALL / JAM
                </span>
              )}

              {/* Source & Hardware Validation Stage Badges */}
              <span
                className={`px-2 py-0.5 rounded border text-[10px] font-mono font-semibold ${
                  isPhysicalSource
                    ? 'bg-cyan-950/70 text-cyan-300 border-cyan-800'
                    : 'bg-slate-800/80 text-slate-400 border-slate-700'
                }`}
              >
                {isPhysicalSource ? 'PHYSICAL BENCH' : 'SIMULATION'}
              </span>

              {hardwareValidationStage && (
                <span className="px-2 py-0.5 rounded bg-slate-800/80 text-amber-300 border border-slate-700 text-[10px] font-mono font-semibold">
                  STAGE: {hardwareValidationStage}
                </span>
              )}
            </div>
          </div>

      {/* Industrial SVG Canvas */}
      <div className="w-full overflow-x-auto bg-[#070b12] rounded p-2 border border-slate-800/80">
        <svg
          viewBox={`0 0 ${svgWidth} ${svgHeight}`}
          className="w-full h-auto min-w-[760px] select-none font-mono"
        >
          <defs>
            {/* Engineering Grid Pattern */}
            <pattern id="scadaGrid" width="20" height="20" patternUnits="userSpaceOnUse">
              <path d="M 20 0 L 0 0 0 20" fill="none" stroke="#1e293b" strokeWidth="0.5" strokeOpacity="0.4" />
            </pattern>

            {/* Upstream Water Fluid Gradient */}
            <linearGradient id="upstreamWaterGrad" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="#0284c7" stopOpacity="0.8" />
              <stop offset="60%" stopColor="#0369a1" stopOpacity="0.85" />
              <stop offset="100%" stopColor="#0c4a6e" stopOpacity="0.95" />
            </linearGradient>

            {/* Downstream Water Fluid Gradient */}
            <linearGradient id="downstreamWaterGrad" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="#0891b2" stopOpacity="0.75" />
              <stop offset="70%" stopColor="#0e7490" stopOpacity="0.85" />
              <stop offset="100%" stopColor="#164e63" stopOpacity="0.95" />
            </linearGradient>

            {/* Acoustic Beam Cones */}
            <linearGradient id="acousticBeamUp" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="#38bdf8" stopOpacity="0.35" />
              <stop offset="100%" stopColor="#38bdf8" stopOpacity="0.03" />
            </linearGradient>
            <linearGradient id="acousticBeamDown" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="#22d3ee" stopOpacity="0.35" />
              <stop offset="100%" stopColor="#22d3ee" stopOpacity="0.03" />
            </linearGradient>
          </defs>

          {/* Grid Background */}
          <rect x="0" y="0" width={svgWidth} height={svgHeight} fill="url(#scadaGrid)" />

          {/* Dimension Callout - Top Ruler */}
          <line x1="50" y1="12" x2="420" y2="12" stroke="#475569" strokeWidth="1" />
          <line x1="50" y1="8" x2="50" y2="16" stroke="#475569" strokeWidth="1" />
          <line x1="420" y1="8" x2="420" y2="16" stroke="#475569" strokeWidth="1" />
          <text x="235" y="10" textAnchor="middle" fill="#64748b" fontSize="9">
            CELL 1 (SCREENING CHAMBER): L = 40.0 cm
          </text>

          <line x1="430" y1="12" x2="710" y2="12" stroke="#475569" strokeWidth="1" />
          <line x1="430" y1="8" x2="430" y2="16" stroke="#475569" strokeWidth="1" />
          <line x1="710" y1="8" x2="710" y2="16" stroke="#475569" strokeWidth="1" />
          <text x="570" y="10" textAnchor="middle" fill="#64748b" fontSize="9">
            CELL 2 (WEIR CHAMBER): L = 55.0 cm
          </text>

          {/* Overhead Winch & Hoist Assembly */}
          <rect x="355" y="24" width="130" height="14" rx="2" fill="#1e293b" stroke="#334155" strokeWidth="1.5" />
          <circle cx="390" cy="31" r="5" fill="#475569" stroke="#64748b" strokeWidth="1" />
          <circle cx="450" cy="31" r="5" fill="#475569" stroke="#64748b" strokeWidth="1" />
          <text x="420" y="20" textAnchor="middle" fill="#94a3b8" fontSize="9" fontWeight="bold">
            OVERHEAD DC WINCH HOIST
          </text>

          {/* Winch Steel Cables */}
          <line
            x1="390"
            y1="36"
            x2="390"
            y2={trayCurrentY}
            stroke="#94a3b8"
            strokeWidth="1.5"
            strokeDasharray="3 2"
          />
          <line
            x1="450"
            y1="36"
            x2="450"
            y2={trayCurrentY}
            stroke="#94a3b8"
            strokeWidth="1.5"
            strokeDasharray="3 2"
          />

          {/* Vertical Guide Rails */}
          <line x1="375" y1="38" x2="375" y2={flumeBedY} stroke="#334155" strokeWidth="2.5" />
          <line x1="465" y1="38" x2="465" y2={flumeBedY} stroke="#334155" strokeWidth="2.5" />

          {/* External Waste Collection Hopper (Street Level) */}
          <polygon points="480,36 550,36 535,80 480,80" fill="#1e293b" stroke="#475569" strokeWidth="1.5" />
          <text x="515" y="58" textAnchor="middle" fill="#94a3b8" fontSize="9" fontWeight="bold">
            DISCHARGE HOPPER
          </text>

          {/* Flume Acrylic Bed & Structural Channel Walls */}
          <rect x="40" y={flumeBedY} width="780" height="14" fill="#0f172a" stroke="#334155" strokeWidth="1.5" rx="1" />
          {/* Acrylic Transparent Sidewall Outline */}
          <rect
            x="45"
            y={flumeBedY - flumeHeightPx}
            width="665"
            height={flumeHeightPx}
            fill="none"
            stroke="#0ea5e9"
            strokeWidth="1"
            strokeOpacity="0.2"
          />

          {/* Upstream Acoustic Transducer US_UPSTREAM_01 */}
          <g transform="translate(190, 40)">
            <rect x="-16" y="0" width="32" height="14" rx="2" fill="#0369a1" stroke="#38bdf8" strokeWidth="1" />
            <text x="0" y="10" textAnchor="middle" fill="#f0f9ff" fontSize="8" fontWeight="bold">
              US-01
            </text>
            {/* Ultrasonic Cone */}
            <polygon points="-10,14 10,14 26,180 -26,180" fill="url(#acousticBeamUp)" pointerEvents="none" />
            <line x1="0" y1="14" x2="0" y2={flumeBedY - h1Px} stroke="#38bdf8" strokeWidth="1" strokeDasharray="3 2" />
            <text x="0" y="-4" textAnchor="middle" fill="#38bdf8" fontSize="9">
              h1 = {upstreamDepth.toFixed(1)} cm
            </text>
          </g>

          {/* Downstream Acoustic Transducer US_WEIR_02 */}
          <g transform="translate(630, 40)">
            <rect x="-16" y="0" width="32" height="14" rx="2" fill="#0891b2" stroke="#22d3ee" strokeWidth="1" />
            <text x="0" y="10" textAnchor="middle" fill="#f0f9ff" fontSize="8" fontWeight="bold">
              US-02
            </text>
            {/* Ultrasonic Cone */}
            <polygon points="-10,14 10,14 24,180 -24,180" fill="url(#acousticBeamDown)" pointerEvents="none" />
            <line x1="0" y1="14" x2="0" y2={flumeBedY - h2Px} stroke="#22d3ee" strokeWidth="1" strokeDasharray="3 2" />
            <text x="0" y="-4" textAnchor="middle" fill="#22d3ee" fontSize="9">
              hw = {weirHead.toFixed(1)} cm
            </text>
          </g>

          {/* Inflow Pump Feed Manifold */}
          <g transform="translate(65, 140)">
            <rect x="0" y="-12" width="24" height="24" rx="2" fill="#0284c7" stroke="#38bdf8" strokeWidth="1" />
            <polygon points="28,0 20,-6 20,6" fill="#38bdf8" />
            <text x="-5" y="-16" fill="#38bdf8" fontSize="9" fontWeight="bold">
              Qin: {pumpInflow.toFixed(1)} L/min
            </text>
          </g>

          {/* Critical Overflow Threshold Reference Line (12.0 cm) */}
          <line
            x1="45"
            y1={criticalY}
            x2="710"
            y2={criticalY}
            stroke="#ef4444"
            strokeWidth="1.5"
            strokeDasharray="4 3"
          />
          <rect x="50" y={criticalY - 14} width="160" height="12" fill="#450a0a" rx="2" stroke="#ef4444" strokeWidth="0.8" />
          <text x="55" y={criticalY - 5} fill="#fca5a5" fontSize="8" fontWeight="bold">
            CRITICAL THRESHOLD: 12.0 cm
          </text>

          {/* Cell 1: Upstream Stored Liquid */}
          <rect
            x="48"
            y={flumeBedY - h1Px}
            width="372"
            height={h1Px}
            fill="url(#upstreamWaterGrad)"
            className="transition-all duration-300"
          />
          {/* Upstream Surface Meniscus Line */}
          <line
            x1="48"
            y1={flumeBedY - h1Px}
            x2="420"
            y2={flumeBedY - h1Px}
            stroke="#7dd3fc"
            strokeWidth="2"
          />

          {/* Cell 2: Downstream Stored Liquid */}
          <rect
            x="428"
            y={flumeBedY - h2Px}
            width="272"
            height={h2Px}
            fill="url(#downstreamWaterGrad)"
            className="transition-all duration-300"
          />
          {/* Downstream Surface Meniscus Line */}
          <line
            x1="428"
            y1={flumeBedY - h2Px}
            x2="700"
            y2={flumeBedY - h2Px}
            stroke="#a5f3fc"
            strokeWidth="2"
          />

          {/* Weir Discharge Overflow Nappe */}
          {weirHead > 0 && (
            <path
              d={`M 700 ${flumeBedY - h2Px} Q 716 ${flumeBedY - h2Px} 726 ${flumeBedY + 20}`}
              fill="none"
              stroke="#06b6d4"
              strokeWidth="5"
              strokeLinecap="round"
              opacity="0.9"
            />
          )}

          {/* Contracted Outlet Weir Plate (Pw = 4.0 cm) */}
          <rect
            x="700"
            y={flumeBedY - (4.0 * pxPerCm)}
            width="12"
            height={4.0 * pxPerCm}
            fill="#334155"
            stroke="#64748b"
            strokeWidth="1.5"
          />
          <text x="706" y={flumeBedY - (4.0 * pxPerCm) - 6} textAnchor="middle" fill="#94a3b8" fontSize="8" fontWeight="bold">
            WEIR Pw=4cm
          </text>

          {/* Primary Stationary Vertical Screening Grid */}
          <rect
            x="420"
            y={flumeBedY - flumeHeightPx}
            width="8"
            height={flumeHeightPx}
            fill={getDebrisColor()}
            stroke="#0f172a"
            strokeWidth="1.5"
          />
          {/* Screen Mesh Cross-Hatching */}
          {Array.from({ length: 12 }).map((_, i) => (
            <line
              key={i}
              x1="420"
              y1={flumeBedY - flumeHeightPx + i * 11}
              x2="428"
              y2={flumeBedY - flumeHeightPx + (i + 1) * 11}
              stroke="#0f172a"
              strokeWidth="1"
            />
          ))}

          {/* Debris Occlusion Mass Clustered Against Screen */}
          {blockageSeverity > 0.05 && (
            <rect
              x="410"
              y={flumeBedY - (wettedDepth(upstreamDepth) * pxPerCm)}
              width="10"
              height={wettedDepth(upstreamDepth) * pxPerCm}
              fill="#78350f"
              opacity={Math.min(0.9, blockageSeverity * 0.95)}
              rx="1"
            />
          )}

          {/* Horizontal Perforated Lifting Carriage / Tray */}
          <rect
            x="350"
            y={trayCurrentY}
            width="70"
            height="8"
            rx="1.5"
            fill="#0284c7"
            stroke="#38bdf8"
            strokeWidth="1.5"
            className="transition-all duration-200"
          />
          {/* Perforations on Tray */}
          <circle cx="365" cy={trayCurrentY + 4} r="1.5" fill="#0c4a6e" />
          <circle cx="375" cy={trayCurrentY + 4} r="1.5" fill="#0c4a6e" />
          <circle cx="385" cy={trayCurrentY + 4} r="1.5" fill="#0c4a6e" />
          <circle cx="395" cy={trayCurrentY + 4} r="1.5" fill="#0c4a6e" />
          <circle cx="405" cy={trayCurrentY + 4} r="1.5" fill="#0c4a6e" />

          {/* Debris Clustered On Moving Tray */}
          {mechanism.debris_retained_pct > 0 && (
            <ellipse
              cx="385"
              cy={trayCurrentY - 3}
              rx="26"
              ry="5"
              fill="#92400e"
              opacity={Math.min(1.0, mechanism.debris_retained_pct / 80)}
            />
          )}
          <text x="385" y={trayCurrentY + 18} textAnchor="middle" fill="#7dd3fc" fontSize="8" fontWeight="bold">
            TRAY ({mechanism.tray_height_cm.toFixed(1)} cm)
          </text>

          {/* Auxiliary Rotary Servo Backup Net */}
          <g transform={`translate(345, ${flumeBedY - flumeHeightPx})`}>
            {/* Joint Pivot */}
            <circle cx="0" cy="0" r="5" fill="#f59e0b" stroke="#d97706" strokeWidth="1.5" />
            {/* Rotary Barrier Arm: 0 deg = horizontal left, 90 deg = vertical downward barrier */}
            <line
              x1="0"
              y1="0"
              x2={-65 * Math.cos((backupAngle * Math.PI) / 180)}
              y2={65 * Math.sin((backupAngle * Math.PI) / 180)}
              stroke="#f59e0b"
              strokeWidth="4"
              strokeLinecap="round"
            />
            {/* Visual netting mesh hanging from arm */}
            {backupAngle > 10 && (
              <line
                x1={-32 * Math.cos((backupAngle * Math.PI) / 180)}
                y1={32 * Math.sin((backupAngle * Math.PI) / 180)}
                x2={-65 * Math.cos((backupAngle * Math.PI) / 180)}
                y2={65 * Math.sin((backupAngle * Math.PI) / 180)}
                stroke="#d97706"
                strokeWidth="2"
                strokeDasharray="2 2"
              />
            )}
            <text x="-15" y="-8" fill="#fbbf24" fontSize="8" fontWeight="bold">
              AUX NET ({backupAngle.toFixed(0)}°)
            </text>
          </g>

          {/* Channel Structural Annotation Labels */}
          <text x="210" y={flumeBedY + 30} textAnchor="middle" fill="#475569" fontSize="9">
            INLET &amp; PRIMARY SCREENING CHAMBER
          </text>
          <text x="580" y={flumeBedY + 30} textAnchor="middle" fill="#475569" fontSize="9">
            OUTLET WEIR &amp; LEVEL TRANSDUCER CHAMBER
          </text>
        </svg>
      </div>

      {/* High-Contrast SCADA Status Bar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 mt-3 text-xs font-mono">
        <div className="p-2.5 rounded bg-slate-950/70 border border-slate-800">
          <span className="text-slate-400 block text-[10px] uppercase">Differential Head (Δh)</span>
          <span className={`text-base font-bold ${diffHead >= 2.0 ? 'text-amber-400' : 'text-cyan-300'}`}>
            {diffHead.toFixed(1)} cm
          </span>
          <span className="text-[9px] text-slate-400 block mt-0.5">Hydraulic Loss Across Screen</span>
        </div>

        <div className="p-2.5 rounded bg-slate-950/70 border border-slate-800">
          <span className="text-slate-400 block text-[10px] uppercase">Screen Occlusion (β)</span>
          <span className={`text-base font-bold ${
            blockageSeverity >= 0.55 ? 'text-rose-400' :
            blockageSeverity >= 0.25 ? 'text-amber-400' :
            'text-emerald-400'
          }`}>
            {(blockageSeverity * 100).toFixed(0)}%
          </span>
          <span className="text-[9px] text-slate-400 block mt-0.5">
            {blockage ? `Excess: +${blockage.differential_head_cm.toFixed(1)}cm` : 'Clean Hydrograph'}
          </span>
        </div>

        <div className="p-2.5 rounded bg-slate-950/70 border border-slate-800">
          <span className="text-slate-400 block text-[10px] uppercase">Prediction Horizon</span>
          <span className={`text-base font-bold ${
            prediction?.state === 'OVERFLOW' ? 'text-rose-400 animate-pulse' :
            prediction?.state === 'ESTIMATING' ? 'text-amber-400' :
            'text-slate-200'
          }`}>
            {prediction?.state === 'OVERFLOW' ? 'OVERFLOW' :
             prediction?.state === 'ESTIMATING' && prediction.ttc_seconds !== null && prediction.ttc_seconds !== undefined
               ? `${prediction.ttc_seconds.toFixed(0)}s TTC`
               : 'STABLE'}
          </span>
          <span className="text-[9px] text-slate-400 block mt-0.5">
            Trend: {prediction?.rate_of_rise_cm_s ? `+${prediction.rate_of_rise_cm_s.toFixed(2)} cm/s` : 'Zero Rise'}
          </span>
        </div>

        <div className="p-2.5 rounded bg-slate-950/70 border border-slate-800">
          <span className="text-slate-400 block text-[10px] uppercase">Mechanism Action</span>
          <span className="font-semibold text-slate-200 text-xs truncate block" title={mechanism.current_action}>
            {mechanism.current_action}
          </span>
          <span className="text-[9px] text-slate-400 block mt-0.5">
            Elev: {mechanism.tray_height_cm.toFixed(1)}cm | Aux: {mechanism.backup_net_angle_deg.toFixed(0)}°
          </span>
        </div>
      </div>
    </div>
  )}

  {/* Diversion Gate Twin (Bifurcation Plan & Actuator Kinematics) */}
  {(activeView === 'gate' || activeView === 'dual') && (
    <DiversionGateTwin
      mode={mode}
      upstreamDepth={upstreamDepth}
      weirHead={weirHead}
      inflow={pumpInflow}
      gateDirective={gateDirective}
      readings={readings}
      activeAlertsCount={activeAlertsCount}
      isFault={mechanism.is_fault}
    />
  )}
</div>
  );
};

function wettedDepth(depth: number): number {
  return Math.min(15.0, Math.max(0.0, depth));
}
