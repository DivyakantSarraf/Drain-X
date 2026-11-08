import { AlertSeverity, PredictionState, SensorHealthStatus } from './contracts';

export type GisStationType = 'PHYSICAL_PROTOTYPE' | 'SIMULATED_STATION';

export interface GisCoordinates {
  lat: number;
  lng: number;
}

export interface GisMonitoringStation {
  station_id: string;
  name: string;
  location_name: string;
  coordinates: GisCoordinates;
  type: GisStationType;
  is_demo: boolean;
  water_depth_cm: number;
  critical_depth_cm: number;
  discharge_lpm: number;
  health: SensorHealthStatus;
  risk_level: AlertSeverity;
  prediction_state?: PredictionState;
  ttc_seconds?: number | null;
  active_alerts_count: number;
  last_updated: string;
  upstream_sensor_id?: string;
  weir_sensor_id?: string;
  notes?: string;
}

export interface GisDrainageChannel {
  channel_id: string;
  name: string;
  channel_type: 'PRIMARY_TRUNK' | 'SECONDARY_DIVERSION' | 'TIDAL_CANAL';
  coordinates: [number, number][]; // LineString coords [lat, lng]
  capacity_lps: number;
  estimated_utilization_pct: number;
  status: 'CLEAR' | 'RESTRICTED' | 'OVERFLOW_RISK';
  is_demo: boolean;
}

export interface GisRiskZone {
  zone_id: string;
  name: string;
  risk_level: AlertSeverity;
  coordinates: [number, number][]; // Polygon coords [lat, lng]
  flood_probability_pct: number;
  elevation_m: number;
  catchment_area_sqkm: number;
  is_demo: boolean;
}

export interface GisIncidentReport {
  incident_id: string;
  title: string;
  description: string;
  category: 'DEBRIS_ACCUMULATION' | 'CURB_OVERFLOW' | 'SILT_BUILDUP' | 'MANHOLE_SURGE';
  severity: AlertSeverity;
  status: 'REPORTED' | 'ASSIGNED' | 'INVESTIGATING' | 'RESOLVED';
  coordinates: GisCoordinates;
  reported_at: string;
  citizen_name?: string;
  is_demo: boolean;
}

export interface GisLayerVisibility {
  stations: boolean;
  channels: boolean;
  riskZones: boolean;
  incidents: boolean;
}
