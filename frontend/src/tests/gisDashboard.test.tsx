import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { UrbanGisDashboard } from '../components/gis/UrbanGisDashboard';
import { StationDetailPanel } from '../components/gis/StationDetailPanel';
import { GisLegend } from '../components/gis/GisLegend';
import { SensorReadingContract, SystemStatusContract } from '../types/contracts';
import { DEMO_STATIONS, DEMO_CHANNELS, DEMO_RISK_ZONES, DEMO_INCIDENTS } from '../components/gis/gisDemoData';

// Mock Leaflet MapContainer since jsdom does not have full WebGL/Canvas rendering
vi.mock('react-leaflet', () => ({
  MapContainer: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="mock-map-container">{children}</div>
  ),
  TileLayer: () => <div data-testid="mock-tile-layer" />,
  Marker: ({ children, eventHandlers }: any) => (
    <div data-testid="mock-marker" onClick={eventHandlers?.click}>
      {children}
    </div>
  ),
  Polyline: ({ eventHandlers }: any) => (
    <div data-testid="mock-polyline" onClick={eventHandlers?.click} />
  ),
  Polygon: ({ eventHandlers }: any) => (
    <div data-testid="mock-polygon" onClick={eventHandlers?.click} />
  ),
  Popup: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="mock-popup">{children}</div>
  ),
  Tooltip: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="mock-tooltip">{children}</div>
  ),
  useMapEvents: (handlers: any) => handlers,
}));

describe('GIS Flood Intelligence Dashboard', () => {
  const mockSystemStatus: SystemStatusContract = {
    system_name: 'DRAIN-X',
    mode: 'HARDWARE',
    operational_state: 'MONITORING',
    uptime_seconds: 120.5,
    active_alerts_count: 0,
    last_heartbeat: new Date().toISOString(),
    latest_readings: {},
    mechanism: {
      state: 'IDLE',
      backup_net_angle_deg: 0,
      tray_height_cm: 0,
      cycle_count: 0,
      current_action: 'Idle',
      elapsed_in_state_s: 0,
      is_jammed: false,
      is_fault: false,
      debris_retained_pct: 0,
    },
  };

  const mockReadings: Record<string, SensorReadingContract> = {
    US_UPSTREAM_01: {
      version: '1.0',
      message_id: 'msg-up-01',
      sensor_id: 'US_UPSTREAM_01',
      section_id: 'SEC_SCREENING',
      sensor_type: 'WATER_LEVEL',
      value: 7.4,
      unit: 'cm',
      source: 'PHYSICAL',
      status: 'OK',
      timestamp: new Date().toISOString(),
    },
    PUMP_INFLOW_01: {
      version: '1.0',
      message_id: 'msg-q-01',
      sensor_id: 'PUMP_INFLOW_01',
      section_id: 'SEC_INFLOW',
      sensor_type: 'FLOW_RATE',
      value: 6.2,
      unit: 'L/min',
      source: 'PHYSICAL',
      status: 'OK',
      timestamp: new Date().toISOString(),
    },
  };

  it('renders GIS Dashboard with Panaji Goa geographic context and notice banner', () => {
    render(
      <UrbanGisDashboard
        systemStatus={mockSystemStatus}
        readings={mockReadings}
        activeAlertsCount={0}
        onNavigateToTwin={vi.fn()}
      />
    );

    expect(screen.getByText(/URBAN FLOOD INTELLIGENCE \/\/ GIS MONITORING SYSTEM \(GOA\)/i)).toBeTruthy();
    expect(screen.getByText(/DATA SOURCE INTEGRATION NOTICE/i)).toBeTruthy();
    expect(screen.getAllByText(/St\. Inez Creek Pilot Testbed/i).length).toBeGreaterThan(0);
  });

  it('dynamically merges live physical telemetry into Station 01', () => {
    render(
      <UrbanGisDashboard
        systemStatus={mockSystemStatus}
        readings={mockReadings}
        activeAlertsCount={0}
        onNavigateToTwin={vi.fn()}
      />
    );

    // Station 01 depth must reflect 7.4 cm from US_UPSTREAM_01
    const depthElements = screen.getAllByText('7.4 cm');
    expect(depthElements.length).toBeGreaterThan(0);
    expect(screen.getByText(/Flow: 6\.2 L\/m/i)).toBeTruthy();
  });

  it('renders Map Legend with risk levels and OpenStreetMap attribution', () => {
    render(<GisLegend />);

    expect(screen.getByText(/MAP LEGEND/i)).toBeTruthy();
    expect(screen.getByText(/Normal \(<6cm\)/i)).toBeTruthy();
    expect(screen.getByText(/Crit \(Overflow\)/i)).toBeTruthy();
    expect(screen.getByText(/OpenStreetMap contributors/i)).toBeTruthy();
  });

  it('renders StationDetailPanel when station is inspected', () => {
    const handleNavigate = vi.fn();
    const station = DEMO_STATIONS[0]; // Physical testbed

    render(
      <StationDetailPanel
        selectedStation={station}
        selectedChannel={null}
        selectedRiskZone={null}
        selectedIncident={null}
        onClose={vi.fn()}
        onNavigateToTwin={handleNavigate}
      />
    );

    expect(screen.getByText('DRAIN-X Physical Flume Testbed')).toBeTruthy();
    expect(screen.getByText('PHYSICAL TESTBED')).toBeTruthy();
    expect(screen.getByText(/INSPECT IN SCADA FLUME DIGITAL TWIN/i)).toBeTruthy();

    // Trigger navigation
    fireEvent.click(screen.getByText(/INSPECT IN SCADA FLUME DIGITAL TWIN/i));
    expect(handleNavigate).toHaveBeenCalled();
  });

  it('renders Channel details when drainage conduit is inspected', () => {
    const channel = DEMO_CHANNELS[0];

    render(
      <StationDetailPanel
        selectedStation={null}
        selectedChannel={channel}
        selectedRiskZone={null}
        selectedIncident={null}
        onClose={vi.fn()}
      />
    );

    expect(screen.getByText(channel.name)).toBeTruthy();
    expect(screen.getByText(/PRIMARY_TRUNK/i)).toBeTruthy();
    expect(screen.getByText(/Flow Capacity:/i)).toBeTruthy();
  });

  it('renders Risk Zone details when catchment area is selected', () => {
    const zone = DEMO_RISK_ZONES[0];

    render(
      <StationDetailPanel
        selectedStation={null}
        selectedChannel={null}
        selectedRiskZone={zone}
        selectedIncident={null}
        onClose={vi.fn()}
      />
    );

    expect(screen.getByText(zone.name)).toBeTruthy();
    expect(screen.getByText(/INUNDATION RISK/i)).toBeTruthy();
    expect(screen.getByText(`${zone.flood_probability_pct}%`)).toBeTruthy();
  });

  it('renders Citizen Incident details when ticket is selected', () => {
    const incident = DEMO_INCIDENTS[0];

    render(
      <StationDetailPanel
        selectedStation={null}
        selectedChannel={null}
        selectedRiskZone={null}
        selectedIncident={incident}
        onClose={vi.fn()}
      />
    );

    expect(screen.getByText(incident.title)).toBeTruthy();
    expect(screen.getByText('CITIZEN INCIDENT')).toBeTruthy();
    expect(screen.getByText(incident.description)).toBeTruthy();
  });

  it('shows empty inspector placeholder when nothing is selected', () => {
    render(
      <StationDetailPanel
        selectedStation={null}
        selectedChannel={null}
        selectedRiskZone={null}
        selectedIncident={null}
        onClose={vi.fn()}
      />
    );

    expect(screen.getByText(/NO INFRASTRUCTURE SELECTED/i)).toBeTruthy();
  });
});
