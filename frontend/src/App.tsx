import React, { useEffect, useState, useCallback } from 'react';
import { Header } from './components/Header';
import { DigitalTwin } from './components/DigitalTwin';
import { ScenarioControls } from './components/ScenarioControls';
import { BenchmarkingPanel } from './components/BenchmarkingPanel';
import { KpiCards } from './components/KpiCards';
import { LiveTelemetryTable } from './components/LiveTelemetryTable';
import { AlertsPanel } from './components/AlertsPanel';
import { TelemetrySimulator } from './components/TelemetrySimulator';
import { UrbanGisDashboard } from './components/gis/UrbanGisDashboard';
import { apiClient, SimulationStateResponse } from './api/client';
import { SensorReadingContract, AlertContract } from './types/contracts';

export const App: React.FC = () => {
  const [simState, setSimState] = useState<SimulationStateResponse | null>(null);
  const [readings, setReadings] = useState<Record<string, SensorReadingContract>>({});
  const [alerts, setAlerts] = useState<AlertContract[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isTogglingMode, setIsTogglingMode] = useState(false);
  const [resolvingAlertId, setResolvingAlertId] = useState<string | null>(null);
  const [dashboardView, setDashboardView] = useState<'SCADA_TWIN' | 'GIS_FLOOD_MAP'>('SCADA_TWIN');

  const fetchData = useCallback(async () => {
    try {
      setError(null);
      const [simRes, telemetryRes, alertsRes] = await Promise.all([
        apiClient.getSimulationState(),
        apiClient.getLatestTelemetry(),
        apiClient.getAlerts(true),
      ]);

      setSimState(simRes);
      setReadings(telemetryRes.readings || {});
      setAlerts(alertsRes || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to connect to backend');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    // Poll simulation & telemetry state every 1.5 seconds for fluid digital twin visualization
    const interval = setInterval(fetchData, 1500);
    return () => clearInterval(interval);
  }, [fetchData]);

  const handleToggleMode = async () => {
    if (!simState?.system) return;
    setIsTogglingMode(true);
    try {
      const nextMode = simState.system.mode === 'SIMULATION' ? 'HARDWARE' : 'SIMULATION';
      await apiClient.setMode(nextMode);
      await fetchData();
    } catch (err) {
      alert(`Failed to switch mode: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setIsTogglingMode(false);
    }
  };

  const handleResolveAlert = async (alertId: string) => {
    setResolvingAlertId(alertId);
    try {
      await apiClient.resolveAlert(alertId);
      await fetchData();
    } catch (err) {
      alert(`Failed to resolve alert: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setResolvingAlertId(null);
    }
  };

  // Derive display values for Digital Twin
  const upstreamDepth = readings['US_UPSTREAM_01']?.value || 4.8;
  const weirHead = readings['US_WEIR_02']?.value || 1.2;
  const pumpInflow = readings['PUMP_INFLOW_01']?.value || 5.0;

  return (
    <div className="min-h-screen bg-[#080c16] text-slate-100 flex flex-col font-sans bg-scada-grid">
      <Header
        mode={simState?.system.mode || 'SIMULATION'}
        operationalState={simState?.system.operational_state || 'MONITORING'}
        activeAlertsCount={alerts.length}
        onToggleMode={handleToggleMode}
        isToggling={isTogglingMode}
        activeView={dashboardView}
        onChangeView={setDashboardView}
      />

      <main className="flex-1 max-w-7xl w-full mx-auto px-3 sm:px-6 py-5">
        {/* Connection Failure Diagnostic Banner */}
        {error && (
          <div className="mb-5 p-3 rounded bg-rose-950/60 border border-rose-800 text-rose-300 font-mono text-xs flex items-center justify-between shadow-lg">
            <span>[BUS_DISCONNECT] Communication error with FastAPI server: {error}</span>
            <button
              onClick={fetchData}
              className="px-2.5 py-1 bg-rose-900 hover:bg-rose-800 text-rose-100 font-bold rounded text-[11px] border border-rose-700"
            >
              RECONNECT
            </button>
          </div>
        )}

        {/* Operational KPI Matrix */}
        <KpiCards status={simState?.system || null} />

        {/* Dynamic View Switch: GIS Map vs SCADA Twin */}
        {dashboardView === 'GIS_FLOOD_MAP' ? (
          <UrbanGisDashboard
            systemStatus={simState?.system || null}
            readings={readings}
            activeAlertsCount={alerts.length}
            onNavigateToTwin={() => setDashboardView('SCADA_TWIN')}
          />
        ) : (
          <>
            {/* Centerpiece: Interactive SVG Digital Twin */}
            {simState && (
              <DigitalTwin
                upstreamDepth={upstreamDepth}
                weirHead={weirHead}
                pumpInflow={pumpInflow}
                mechanism={simState.mechanism}
                blockage={simState.blockage}
                prediction={simState.prediction}
                mode={simState.system.mode}
                gateDirective={simState.system.active_gate_directive}
                readings={readings}
                activeAlertsCount={alerts.length}
              />
            )}

            {/* Operator Console: Scenario Simulation & Overrides */}
            <ScenarioControls
              isRunning={simState?.is_running || false}
              activeScenario={simState?.active_scenario || null}
              onStateChanged={fetchData}
            />

            {/* Comparative Benchmarking Panel */}
            <BenchmarkingPanel benchmark={simState?.benchmark || null} />

            {/* Telemetry Ingest Stream and Active Diagnostics */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
              <div className="lg:col-span-2">
                <LiveTelemetryTable
                  readings={readings}
                  isLoading={isLoading}
                  error={error}
                  onRefresh={fetchData}
                />
              </div>
              <div className="lg:col-span-1">
                <AlertsPanel
                  alerts={alerts}
                  onResolve={handleResolveAlert}
                  isResolving={resolvingAlertId}
                />
              </div>
            </div>

            {/* Protocol Ingestion Testbed */}
            <TelemetrySimulator onReadingIngested={fetchData} />
          </>
        )}
      </main>

      <footer className="bg-slate-900 border-t border-slate-800 py-3 text-center text-xs font-mono text-slate-500">
        DRAIN-X &bull; SCADA DIGITAL TWIN &bull; AUTOMATED PREDICTIVE DRAINAGE INTELLIGENCE &bull; PROVISIONAL SIMULATION
      </footer>
    </div>
  );
};

export default App;
