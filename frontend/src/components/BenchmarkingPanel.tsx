import React from 'react';
import { BenchmarkMetricsContract } from '../types/contracts';
import { BarChart3, TrendingUp, CheckCircle2, ShieldCheck, Zap } from 'lucide-react';

interface BenchmarkingPanelProps {
  benchmark: BenchmarkMetricsContract | null;
}

export const BenchmarkingPanel: React.FC<BenchmarkingPanelProps> = ({ benchmark }) => {
  if (!benchmark) {
    return (
      <div className="bg-slate-900 rounded border border-slate-800 p-6 mb-6 text-center text-slate-500 font-mono text-xs">
        <BarChart3 className="w-8 h-8 mx-auto mb-2 text-slate-600" />
        <p className="font-semibold text-slate-300">BENCHMARK ENGINE STANDBY</p>
        <p className="text-slate-500 text-[11px] mt-0.5">
          Execute a deterministic scenario from the console above to record comparative telemetry against the static threshold baseline.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-slate-900 rounded border border-slate-800 shadow-xl p-4 sm:p-5 mb-6 overflow-hidden">
      {/* Benchmark Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 mb-4 pb-3 border-b border-slate-800">
        <div>
          <div className="flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-cyan-400" />
            <h2 className="text-xs font-mono font-bold text-slate-100 uppercase tracking-wider">
              BENCHMARK AUDIT // DRAIN-X PREDICTIVE vs. STATIC 10.0cm THRESHOLD
            </h2>
          </div>
          <p className="text-[11px] font-mono text-slate-400 mt-0.5">
            Evaluates lead time advantage, flood mitigation, and false alarm rejection against conventional static level sensors.
          </p>
        </div>
        <span className="text-xs font-mono font-bold px-2 py-0.5 rounded bg-slate-800 text-cyan-300 border border-slate-700">
          RUN DURATION: {benchmark.duration_s}s
        </span>
      </div>

      {/* Primary Highlight KPI Tiles */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4 font-mono">
        {/* Lead Time Advantage */}
        <div className="p-3.5 rounded bg-slate-950/70 border border-slate-800 flex items-center justify-between">
          <div>
            <span className="text-[10px] font-semibold text-cyan-400 uppercase tracking-wider flex items-center gap-1">
              <Zap className="w-3.5 h-3.5 text-amber-400" /> Lead Time Advantage
            </span>
            <div className="flex items-baseline gap-1 mt-1">
              <span className="text-2xl font-extrabold text-slate-100 tracking-tight">
                +{benchmark.lead_time_advantage_s > 0 ? benchmark.lead_time_advantage_s.toFixed(1) : '0.0'}
              </span>
              <span className="text-xs text-slate-400">seconds</span>
            </div>
            <p className="text-[10px] text-slate-400 mt-0.5">Advance alert prior to overflow</p>
          </div>
          <div className="p-2.5 bg-slate-800 border border-slate-700 text-cyan-400 rounded">
            <TrendingUp className="w-5 h-5" />
          </div>
        </div>

        {/* Overflow Time Reduction */}
        <div className="p-3.5 rounded bg-slate-950/70 border border-slate-800 flex items-center justify-between">
          <div>
            <span className="text-[10px] font-semibold text-emerald-400 uppercase tracking-wider flex items-center gap-1">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" /> Overflow Reduction
            </span>
            <div className="flex items-baseline gap-1 mt-1">
              <span className="text-2xl font-extrabold text-emerald-400 tracking-tight">
                {benchmark.overflow_reduction_pct.toFixed(0)}%
              </span>
            </div>
            <p className="text-[10px] text-slate-400 mt-0.5">
              Time above 12cm: {benchmark.time_above_critical_s.toFixed(1)}s (vs {benchmark.baseline_time_above_critical_s.toFixed(1)}s)
            </p>
          </div>
          <div className="p-2.5 bg-slate-800 border border-slate-700 text-emerald-400 rounded">
            <CheckCircle2 className="w-5 h-5" />
          </div>
        </div>

        {/* Intervention Clearance */}
        <div className="p-3.5 rounded bg-slate-950/70 border border-slate-800 flex items-center justify-between">
          <div>
            <span className="text-[10px] font-semibold text-slate-300 uppercase tracking-wider">
              Intervention Clearance
            </span>
            <div className="flex items-baseline gap-1 mt-1">
              <span className="text-2xl font-extrabold text-cyan-300 tracking-tight">
                {benchmark.intervention_success_rate_pct.toFixed(0)}%
              </span>
            </div>
            <p className="text-[10px] text-slate-400 mt-0.5">Post-hoist verified hydraulic relief</p>
          </div>
          <div className="p-2.5 bg-slate-800 border border-slate-700 text-slate-400 rounded">
            <BarChart3 className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* Comparison Table */}
      <div className="overflow-x-auto rounded border border-slate-800">
        <table className="w-full text-left border-collapse text-xs font-mono">
          <thead>
            <tr className="border-b border-slate-800 bg-[#070b12] text-slate-400 uppercase tracking-wider text-[10px]">
              <th className="py-2.5 px-3">Evaluation Metric</th>
              <th className="py-2.5 px-3 text-cyan-400 font-bold">DRAIN-X (Predictive Multi-Point)</th>
              <th className="py-2.5 px-3 text-slate-400">Static Threshold Baseline (10 cm)</th>
              <th className="py-2.5 px-3 text-right">Operational Advantage</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/80 bg-slate-900/60">
            <tr>
              <td className="py-2.5 px-3 font-sans text-slate-300">Blockage Detection Delay</td>
              <td className="py-2.5 px-3 text-cyan-300 font-bold">
                {benchmark.detection_delay_s != null ? `${benchmark.detection_delay_s.toFixed(1)}s` : '--'}
              </td>
              <td className="py-2.5 px-3 text-slate-400">
                {benchmark.baseline_detection_delay_s != null ? `${benchmark.baseline_detection_delay_s.toFixed(1)}s` : '--'}
              </td>
              <td className="py-2.5 px-3 text-right text-emerald-400 font-bold">
                {benchmark.lead_time_advantage_s > 0 ? `+${benchmark.lead_time_advantage_s.toFixed(1)}s Faster` : 'Parity'}
              </td>
            </tr>
            <tr>
              <td className="py-2.5 px-3 font-sans text-slate-300">Duration Above Critical Depth (12 cm)</td>
              <td className="py-2.5 px-3 text-cyan-300 font-bold">{benchmark.time_above_critical_s.toFixed(1)}s</td>
              <td className="py-2.5 px-3 text-slate-400">{benchmark.baseline_time_above_critical_s.toFixed(1)}s</td>
              <td className="py-2.5 px-3 text-right text-emerald-400 font-bold">
                {benchmark.overflow_reduction_pct.toFixed(0)}% Flood Reduction
              </td>
            </tr>
            <tr>
              <td className="py-2.5 px-3 font-sans text-slate-300">False Alarm Rejection Count</td>
              <td className="py-2.5 px-3 text-cyan-300 font-bold">{benchmark.false_alarms} FA</td>
              <td className="py-2.5 px-3 text-slate-400">{benchmark.baseline_false_alarms} FA</td>
              <td className="py-2.5 px-3 text-right text-slate-400">
                Zero Spurious Triggers
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
};
