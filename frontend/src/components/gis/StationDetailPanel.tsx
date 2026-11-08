import React from 'react';
import {
  GisMonitoringStation,
  GisDrainageChannel,
  GisRiskZone,
  GisIncidentReport,
} from '../../types/gis';
import {
  ArrowRight,
  Droplets,
  MapPin,
  X,
} from 'lucide-react';

export interface StationDetailPanelProps {
  selectedStation: GisMonitoringStation | null;
  selectedChannel: GisDrainageChannel | null;
  selectedRiskZone: GisRiskZone | null;
  selectedIncident: GisIncidentReport | null;
  onClose: () => void;
  onNavigateToTwin?: () => void;
}

export const StationDetailPanel: React.FC<StationDetailPanelProps> = ({
  selectedStation,
  selectedChannel,
  selectedRiskZone,
  selectedIncident,
  onClose,
  onNavigateToTwin,
}) => {
  if (!selectedStation && !selectedChannel && !selectedRiskZone && !selectedIncident) {
    return (
      <div className="bg-slate-900/90 border border-slate-800 rounded p-4 text-xs font-mono text-slate-400 text-center flex flex-col items-center justify-center min-h-[220px]">
        <MapPin className="w-8 h-8 text-slate-600 mb-2" />
        <div className="font-bold text-slate-300">NO INFRASTRUCTURE SELECTED</div>
        <div className="text-[11px] text-slate-500 mt-1 max-w-[200px]">
          Click on any monitoring station, drainage conduit, flood risk zone, or citizen incident on the map to inspect live metrics.
        </div>
      </div>
    );
  }

  // 1. MONITORING STATION DETAIL VIEW
  if (selectedStation) {
    const isPhysical = selectedStation.type === 'PHYSICAL_PROTOTYPE';
    const isOverflow = selectedStation.water_depth_cm >= selectedStation.critical_depth_cm;
    const isWarning = selectedStation.water_depth_cm >= selectedStation.critical_depth_cm - 2.0;

    return (
      <div className="bg-slate-900 border border-slate-800 rounded p-4 text-xs font-mono shadow-xl space-y-4">
        {/* Header */}
        <div className="flex items-start justify-between border-b border-slate-800 pb-2.5">
          <div>
            <div className="flex items-center gap-1.5">
              <span
                className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                  isPhysical
                    ? 'bg-cyan-950 text-cyan-300 border border-cyan-700'
                    : 'bg-slate-800 text-slate-400 border border-slate-700'
                }`}
              >
                {isPhysical ? 'PHYSICAL TESTBED' : 'SIMULATED / DEMO'}
              </span>
              <span className="text-[10px] text-slate-500">{selectedStation.station_id}</span>
            </div>
            <h3 className="text-sm font-bold text-slate-100 mt-1">{selectedStation.name}</h3>
            <div className="text-[11px] text-slate-400 flex items-center gap-1 mt-0.5">
              <MapPin className="w-3 h-3 text-cyan-400 shrink-0" />
              <span>{selectedStation.location_name}</span>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-slate-800 text-slate-400 hover:text-slate-200"
            title="Close Inspector"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Live Telemetry KPI Metrics */}
        <div className="grid grid-cols-2 gap-2">
          {/* Water Depth */}
          <div className="bg-slate-950/70 p-2.5 rounded border border-slate-800/80">
            <span className="text-[10px] text-slate-500 uppercase block">WATER DEPTH (h1)</span>
            <div className="flex items-baseline gap-1 mt-1">
              <span
                className={`text-lg font-bold ${
                  isOverflow
                    ? 'text-rose-400 animate-pulse'
                    : isWarning
                    ? 'text-amber-400'
                    : 'text-cyan-400'
                }`}
              >
                {selectedStation.water_depth_cm.toFixed(1)}
              </span>
              <span className="text-xs text-slate-400">cm</span>
              <span className="text-[10px] text-slate-500">
                / {selectedStation.critical_depth_cm.toFixed(0)}cm
              </span>
            </div>
            <div className="w-full bg-slate-800 h-1 rounded-full overflow-hidden mt-1.5">
              <div
                className={`h-full ${
                  isOverflow ? 'bg-rose-500' : isWarning ? 'bg-amber-400' : 'bg-cyan-400'
                }`}
                style={{
                  width: `${Math.min(
                    100,
                    (selectedStation.water_depth_cm / selectedStation.critical_depth_cm) * 100
                  )}%`,
                }}
              />
            </div>
          </div>

          {/* Discharge Flow */}
          <div className="bg-slate-950/70 p-2.5 rounded border border-slate-800/80">
            <span className="text-[10px] text-slate-500 uppercase block">DISCHARGE FLOW</span>
            <div className="flex items-baseline gap-1 mt-1">
              <span className="text-lg font-bold text-slate-200">
                {selectedStation.discharge_lpm.toFixed(1)}
              </span>
              <span className="text-xs text-slate-400">L/min</span>
            </div>
            <div className="text-[10px] text-slate-500 mt-1 flex items-center gap-1">
              <Droplets className="w-3 h-3 text-sky-400" />
              <span>Weir Gauged</span>
            </div>
          </div>
        </div>

        {/* Prediction & Time to Critical */}
        <div className="bg-slate-950/70 p-2.5 rounded border border-slate-800/80 space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-slate-500 uppercase">PREDICTIVE FLOOD RISK:</span>
            <span
              className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                selectedStation.prediction_state === 'OVERFLOW'
                  ? 'bg-rose-950 text-rose-300 border border-rose-800'
                  : selectedStation.prediction_state === 'ESTIMATING'
                  ? 'bg-amber-950 text-amber-300 border border-amber-800'
                  : 'bg-emerald-950 text-emerald-300 border border-emerald-800'
              }`}
            >
              {selectedStation.prediction_state || 'STABLE'}
            </span>
          </div>

          <div className="text-xs text-slate-300 flex items-center justify-between">
            <span>TIME-TO-CRITICAL:</span>
            <span className="font-bold text-cyan-300">
              {selectedStation.ttc_seconds !== null && selectedStation.ttc_seconds !== undefined
                ? `${selectedStation.ttc_seconds.toFixed(0)} seconds`
                : 'NO OVERFLOW RISK'}
            </span>
          </div>
        </div>

        {/* Notes & Physical Context */}
        {selectedStation.notes && (
          <div className="text-[11px] text-slate-400 bg-slate-950/40 p-2 rounded border border-slate-800/60 leading-relaxed">
            {selectedStation.notes}
          </div>
        )}

        {/* Navigation Shortcut to Flume Digital Twin */}
        {isPhysical && onNavigateToTwin && (
          <button
            onClick={onNavigateToTwin}
            className="w-full py-2 px-3 rounded bg-cyan-950 hover:bg-cyan-900 border border-cyan-700 text-cyan-300 font-bold text-xs flex items-center justify-center gap-2 transition-colors shadow-lg"
          >
            <span>INSPECT IN SCADA FLUME DIGITAL TWIN</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        )}
      </div>
    );
  }

  // 2. DRAINAGE CHANNEL DETAIL VIEW
  if (selectedChannel) {
    return (
      <div className="bg-slate-900 border border-slate-800 rounded p-4 text-xs font-mono shadow-xl space-y-3">
        <div className="flex items-start justify-between border-b border-slate-800 pb-2">
          <div>
            <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-sky-950 text-sky-300 border border-sky-800">
              {selectedChannel.channel_type}
            </span>
            <h3 className="text-sm font-bold text-slate-100 mt-1">{selectedChannel.name}</h3>
          </div>
          <button onClick={onClose} className="p-1 rounded text-slate-400 hover:text-slate-200">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="space-y-2">
          <div className="flex justify-between text-slate-300">
            <span>Flow Capacity:</span>
            <span className="font-bold text-slate-100">{selectedChannel.capacity_lps} L/s</span>
          </div>
          <div className="flex justify-between text-slate-300">
            <span>Estimated Utilization:</span>
            <span
              className={`font-bold ${
                selectedChannel.estimated_utilization_pct > 80
                  ? 'text-rose-400'
                  : 'text-emerald-400'
              }`}
            >
              {selectedChannel.estimated_utilization_pct}%
            </span>
          </div>
          <div className="flex justify-between text-slate-300">
            <span>Conduit Status:</span>
            <span className="font-bold text-cyan-400">{selectedChannel.status}</span>
          </div>
        </div>

        <div className="text-[10px] text-slate-500 pt-2 border-t border-slate-800">
          [SIMULATED CONDUIT MODEL] Panaji stormwater trunk topology.
        </div>
      </div>
    );
  }

  // 3. RISK ZONE DETAIL VIEW
  if (selectedRiskZone) {
    return (
      <div className="bg-slate-900 border border-slate-800 rounded p-4 text-xs font-mono shadow-xl space-y-3">
        <div className="flex items-start justify-between border-b border-slate-800 pb-2">
          <div>
            <span
              className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                selectedRiskZone.risk_level === 'CRITICAL'
                  ? 'bg-rose-950 text-rose-300 border border-rose-800'
                  : 'bg-amber-950 text-amber-300 border border-amber-800'
              }`}
            >
              {selectedRiskZone.risk_level} INUNDATION RISK
            </span>
            <h3 className="text-sm font-bold text-slate-100 mt-1">{selectedRiskZone.name}</h3>
          </div>
          <button onClick={onClose} className="p-1 rounded text-slate-400 hover:text-slate-200">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="space-y-2">
          <div className="flex justify-between text-slate-300">
            <span>Inundation Probability:</span>
            <span className="font-bold text-amber-400">
              {selectedRiskZone.flood_probability_pct}%
            </span>
          </div>
          <div className="flex justify-between text-slate-300">
            <span>Ground Elevation:</span>
            <span className="font-bold text-slate-100">{selectedRiskZone.elevation_m}m MSL</span>
          </div>
          <div className="flex justify-between text-slate-300">
            <span>Catchment Area:</span>
            <span className="font-bold text-slate-100">
              {selectedRiskZone.catchment_area_sqkm} km²
            </span>
          </div>
        </div>

        <div className="text-[10px] text-slate-500 pt-2 border-t border-slate-800">
          [SIMULATED HYDROLOGIC MODEL] Modeled depression basin for monsoon tidal backflow.
        </div>
      </div>
    );
  }

  // 4. CITIZEN INCIDENT DETAIL VIEW
  if (selectedIncident) {
    return (
      <div className="bg-slate-900 border border-slate-800 rounded p-4 text-xs font-mono shadow-xl space-y-3">
        <div className="flex items-start justify-between border-b border-slate-800 pb-2">
          <div>
            <div className="flex items-center gap-1.5">
              <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-rose-950 text-rose-300 border border-rose-800">
                CITIZEN INCIDENT
              </span>
              <span className="text-[10px] text-slate-500">{selectedIncident.incident_id}</span>
            </div>
            <h3 className="text-sm font-bold text-slate-100 mt-1">{selectedIncident.title}</h3>
          </div>
          <button onClick={onClose} className="p-1 rounded text-slate-400 hover:text-slate-200">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="text-slate-300 text-[11px] leading-relaxed bg-slate-950/60 p-2.5 rounded border border-slate-800">
          {selectedIncident.description}
        </div>

        <div className="space-y-1.5 text-slate-400 text-[11px]">
          <div className="flex justify-between">
            <span>Category:</span>
            <span className="font-bold text-slate-200">{selectedIncident.category}</span>
          </div>
          <div className="flex justify-between">
            <span>Severity:</span>
            <span className="font-bold text-amber-400">{selectedIncident.severity}</span>
          </div>
          <div className="flex justify-between">
            <span>Incident Status:</span>
            <span className="font-bold text-cyan-400">{selectedIncident.status}</span>
          </div>
          <div className="flex justify-between">
            <span>Reported By:</span>
            <span className="text-slate-300">{selectedIncident.citizen_name || 'Anonymous'}</span>
          </div>
        </div>

        <div className="text-[10px] text-slate-500 pt-2 border-t border-slate-800">
          [MUNICIPAL DEMO TICKET] Simulated community reporting ticket for field crew dispatch.
        </div>
      </div>
    );
  }

  return null;
};
