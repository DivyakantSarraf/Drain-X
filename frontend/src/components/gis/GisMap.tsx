import React from 'react';
import {
  MapContainer,
  TileLayer,
  Marker,
  Polyline,
  Polygon,
  Popup,
  Tooltip,
  useMapEvents,
} from 'react-leaflet';
import L from 'leaflet';
import {
  GisMonitoringStation,
  GisDrainageChannel,
  GisRiskZone,
  GisIncidentReport,
  GisLayerVisibility,
} from '../../types/gis';
import { IncidentResponseContract } from '../../types/contracts';
import { GOA_PANJIM_CENTER } from './gisDemoData';

function MapClickHandler({
  onMapClick,
  isPickingLocation,
}: {
  onMapClick?: (coords: { lat: number; lng: number }) => void;
  isPickingLocation?: boolean;
}) {
  useMapEvents({
    click(e) {
      if (isPickingLocation && onMapClick) {
        onMapClick({ lat: e.latlng.lat, lng: e.latlng.lng });
      }
    },
  });
  return null;
}

export interface GisMapProps {
  stations: GisMonitoringStation[];
  channels: GisDrainageChannel[];
  riskZones: GisRiskZone[];
  incidents: GisIncidentReport[];
  liveIncidents?: IncidentResponseContract[];
  visibility: GisLayerVisibility;
  tileProvider: 'carto_dark' | 'osm_standard';
  selectedStationId?: string;
  selectedIncidentId?: string;
  isPickingLocation?: boolean;
  onMapClick?: (coords: { lat: number; lng: number }) => void;
  onSelectStation: (station: GisMonitoringStation) => void;
  onSelectChannel: (channel: GisDrainageChannel) => void;
  onSelectRiskZone: (zone: GisRiskZone) => void;
  onSelectIncident: (incident: GisIncidentReport) => void;
  onSelectLiveIncident?: (incident: IncidentResponseContract) => void;
}

export const GisMap: React.FC<GisMapProps> = ({
  stations,
  channels,
  riskZones,
  incidents,
  liveIncidents,
  visibility,
  tileProvider,
  selectedStationId,
  selectedIncidentId,
  isPickingLocation,
  onMapClick,
  onSelectStation,
  onSelectChannel,
  onSelectRiskZone,
  onSelectIncident,
  onSelectLiveIncident,
}) => {
  // Tile layer URL and Attribution
  const tileUrl =
    tileProvider === 'carto_dark'
      ? 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
      : 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';

  const tileAttribution =
    tileProvider === 'carto_dark'
      ? '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions" target="_blank" rel="noreferrer">CARTO</a>'
      : '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> contributors';

  // Icon Generators
  const getStationIcon = (station: GisMonitoringStation, isSelected: boolean) => {
    const isPhysical = station.type === 'PHYSICAL_PROTOTYPE';
    let color = '#10b981'; // emerald normal
    if (station.water_depth_cm >= station.critical_depth_cm) {
      color = '#ef4444'; // critical red
    } else if (station.water_depth_cm >= station.critical_depth_cm - 2.0) {
      color = '#f59e0b'; // amber warning
    } else if (station.risk_level === 'HIGH' || station.risk_level === 'WARNING') {
      color = '#f97316'; // orange high
    }

    const html = `
      <div style="position: relative; display: flex; flex-direction: column; align-items: center; cursor: pointer;">
        ${
          isPhysical
            ? `<div style="position: absolute; width: 36px; height: 36px; border-radius: 50%; border: 2px solid #22d3ee; animation: ping 1.8s cubic-bezier(0, 0, 0.2, 1) infinite; opacity: 0.7; top: -6px; left: -6px;"></div>`
            : ''
        }
        <div style="width: 24px; height: 24px; border-radius: 50%; background: ${
          isPhysical ? '#083344' : '#0f172a'
        }; border: 2px solid ${
      isPhysical ? '#22d3ee' : color
    }; display: flex; align-items: center; justify-content: center; box-shadow: 0 0 10px ${color}88; transform: ${
      isSelected ? 'scale(1.25)' : 'scale(1)'
    }; transition: transform 0.2s;">
          <span style="font-size: 10px; font-weight: bold; font-family: monospace; color: ${
            isPhysical ? '#67e8f9' : '#f8fafc'
          };">${isPhysical ? 'P' : 'S'}</span>
        </div>
        <div style="margin-top: 2px; padding: 1px 4px; background: rgba(15, 23, 42, 0.95); border: 1px solid ${color}; border-radius: 3px; font-size: 9px; font-family: monospace; color: ${color}; white-space: nowrap; font-weight: bold;">
          ${station.water_depth_cm.toFixed(1)}cm
        </div>
      </div>
    `;

    return L.divIcon({
      html,
      className: 'drainx-station-pin',
      iconSize: [24, 40],
      iconAnchor: [12, 12],
    });
  };

  const getIncidentIcon = (incident: GisIncidentReport, isSelected: boolean) => {
    const color = incident.severity === 'CRITICAL' ? '#ef4444' : '#f59e0b';
    const html = `
      <div style="position: relative; display: flex; flex-direction: column; align-items: center; cursor: pointer;">
        <div style="width: 22px; height: 22px; border-radius: 4px; background: #450a0a; border: 2px solid ${color}; display: flex; align-items: center; justify-content: center; transform: ${
      isSelected ? 'scale(1.3)' : 'scale(1)'
    }; box-shadow: 0 0 8px ${color}aa;">
          <span style="font-size: 12px; font-weight: bold; font-family: monospace; color: #fecaca;">!</span>
        </div>
      </div>
    `;

    return L.divIcon({
      html,
      className: 'drainx-incident-pin',
      iconSize: [22, 22],
      iconAnchor: [11, 11],
    });
  };

  const getLiveIncidentIcon = (incident: IncidentResponseContract, isSelected: boolean) => {
    const isCitizen = incident.source === 'CITIZEN';
    let borderColor = '#f59e0b'; // amber medium
    let bgColor = '#451a03';
    let textColor = '#fde68a';

    if (incident.severity === 'CRITICAL') {
      borderColor = '#ef4444';
      bgColor = '#450a0a';
      textColor = '#fecaca';
    } else if (incident.severity === 'HIGH') {
      borderColor = '#f97316';
      bgColor = '#431407';
      textColor = '#fed7aa';
    } else if (incident.severity === 'LOW') {
      borderColor = '#10b981';
      bgColor = '#064e3b';
      textColor = '#a7f3d0';
    }

    const html = `
      <div style="position: relative; display: flex; flex-direction: column; align-items: center; cursor: pointer;">
        ${
          isCitizen
            ? `<div style="position: absolute; width: 30px; height: 30px; border-radius: 50%; border: 2px solid #10b981; animation: ping 2s cubic-bezier(0, 0, 0.2, 1) infinite; opacity: 0.6; top: -4px; left: -4px;"></div>`
            : ''
        }
        <div style="width: 22px; height: 22px; border-radius: ${
          isCitizen ? '50%' : '4px'
        }; background: ${bgColor}; border: 2px solid ${
      isCitizen ? '#10b981' : borderColor
    }; display: flex; align-items: center; justify-content: center; transform: ${
      isSelected ? 'scale(1.3)' : 'scale(1)'
    }; box-shadow: 0 0 8px ${borderColor}aa;">
          <span style="font-size: 11px; font-weight: bold; font-family: monospace; color: ${textColor};">
            ${isCitizen ? 'C' : '!'}
          </span>
        </div>
        <div style="margin-top: 1px; padding: 1px 3px; background: rgba(15, 23, 42, 0.95); border: 1px solid ${
          isCitizen ? '#10b981' : borderColor
        }; border-radius: 2px; font-size: 8px; font-family: monospace; color: ${textColor}; white-space: nowrap; font-weight: bold;">
          ${incident.id}
        </div>
      </div>
    `;

    return L.divIcon({
      html,
      className: 'drainx-live-incident-pin',
      iconSize: [22, 32],
      iconAnchor: [11, 11],
    });
  };

  return (
    <div
      className={`w-full h-full min-h-[500px] relative rounded overflow-hidden border border-slate-800 shadow-inner ${
        isPickingLocation ? 'cursor-crosshair ring-2 ring-amber-400' : ''
      }`}
    >
      {isPickingLocation && (
        <div className="absolute top-3 left-1/2 -translate-x-1/2 z-[1000] px-4 py-1.5 bg-amber-950/90 border border-amber-500 rounded-full shadow-lg font-mono text-xs text-amber-200 flex items-center space-x-2 animate-bounce">
          <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping"></span>
          <span>📍 MAP PICKING MODE: Click anywhere on the map to set incident coordinates</span>
        </div>
      )}

      <MapContainer
        center={GOA_PANJIM_CENTER}
        zoom={14}
        scrollWheelZoom={true}
        className="w-full h-full min-h-[500px]"
        style={{ minHeight: '520px', height: '100%', width: '100%' }}
      >
        <MapClickHandler onMapClick={onMapClick} isPickingLocation={isPickingLocation} />
        <TileLayer url={tileUrl} attribution={tileAttribution} />

        {/* 1. Inundation Risk Zones (Polygons) */}
        {visibility.riskZones &&
          riskZones.map((zone) => {
            let fillColor = '#38bdf8';
            let strokeColor = '#0284c7';
            if (zone.risk_level === 'CRITICAL') {
              fillColor = '#ef4444';
              strokeColor = '#dc2626';
            } else if (zone.risk_level === 'HIGH') {
              fillColor = '#f97316';
              strokeColor = '#ea580c';
            } else if (zone.risk_level === 'WARNING') {
              fillColor = '#f59e0b';
              strokeColor = '#d97706';
            }

            return (
              <Polygon
                key={zone.zone_id}
                positions={zone.coordinates}
                pathOptions={{
                  fillColor,
                  fillOpacity: 0.22,
                  color: strokeColor,
                  weight: 2,
                  dashArray: zone.risk_level === 'CRITICAL' ? '4, 4' : undefined,
                }}
                eventHandlers={{
                  click: () => onSelectRiskZone(zone),
                }}
              >
                <Tooltip sticky direction="top" className="font-mono text-xs">
                  <div>
                    <strong>{zone.name}</strong>
                    <br />
                    Risk: {zone.risk_level} ({zone.flood_probability_pct}% flood prob)
                  </div>
                </Tooltip>
              </Polygon>
            );
          })}

        {/* 2. Drainage Network Channels (PolyLines) */}
        {visibility.channels &&
          channels.map((chan) => {
            let strokeColor = '#0284c7'; // blue primary
            if (chan.status === 'OVERFLOW_RISK') {
              strokeColor = '#ef4444'; // red risk
            } else if (chan.status === 'RESTRICTED') {
              strokeColor = '#f59e0b'; // amber restricted
            } else if (chan.channel_type === 'SECONDARY_DIVERSION') {
              strokeColor = '#2dd4bf'; // teal diversion
            }

            return (
              <Polyline
                key={chan.channel_id}
                positions={chan.coordinates}
                pathOptions={{
                  color: strokeColor,
                  weight: chan.channel_type === 'PRIMARY_TRUNK' ? 4 : 3,
                  dashArray:
                    chan.channel_type === 'SECONDARY_DIVERSION' ? '6, 6' : undefined,
                  opacity: 0.85,
                }}
                eventHandlers={{
                  click: () => onSelectChannel(chan),
                }}
              >
                <Tooltip sticky direction="top" className="font-mono text-xs">
                  <div>
                    <strong>{chan.name}</strong>
                    <br />
                    Type: {chan.channel_type} | Util: {chan.estimated_utilization_pct}%
                  </div>
                </Tooltip>
              </Polyline>
            );
          })}

        {/* 3. Water-Level Monitoring Stations (Markers) */}
        {visibility.stations &&
          stations.map((st) => (
            <Marker
              key={st.station_id}
              position={[st.coordinates.lat, st.coordinates.lng]}
              icon={getStationIcon(st, st.station_id === selectedStationId)}
              eventHandlers={{
                click: () => onSelectStation(st),
              }}
            >
              <Popup>
                <div className="font-mono text-xs space-y-1">
                  <div className="font-bold text-cyan-300">{st.name}</div>
                  <div className="text-[10px] text-slate-400">{st.location_name}</div>
                  <div className="pt-1 border-t border-slate-700 flex justify-between">
                    <span>Depth (h1):</span>
                    <strong className="text-white">{st.water_depth_cm.toFixed(1)} cm</strong>
                  </div>
                  <div className="flex justify-between">
                    <span>Risk Level:</span>
                    <span className="text-amber-400 font-bold">{st.risk_level}</span>
                  </div>
                  {st.type === 'PHYSICAL_PROTOTYPE' && (
                    <div className="text-[10px] text-cyan-400 font-bold mt-1">
                      [LINKED TO DRAIN-X PHYSICAL FLUME]
                    </div>
                  )}
                </div>
              </Popup>
            </Marker>
          ))}

        {/* 4. Live Incidents (Real API Backend Incidents + Seeded Items) */}
        {visibility.incidents && liveIncidents && liveIncidents.length > 0
          ? liveIncidents.map((liveInc) => (
              <Marker
                key={liveInc.id}
                position={[liveInc.latitude, liveInc.longitude]}
                icon={getLiveIncidentIcon(liveInc, liveInc.id === selectedIncidentId)}
                eventHandlers={{
                  click: () => onSelectLiveIncident && onSelectLiveIncident(liveInc),
                }}
              >
                <Popup>
                  <div className="font-mono text-xs space-y-1 max-w-[220px]">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-cyan-300">{liveInc.id}</span>
                      <span className="text-[9px] px-1 py-0.5 rounded bg-slate-800 text-slate-300">
                        {liveInc.source}
                      </span>
                    </div>
                    <div className="font-semibold text-white">
                      {liveInc.category.replace(/_/g, ' ')}
                    </div>
                    <div className="text-[11px] text-slate-300">{liveInc.description}</div>
                    <div className="pt-1 border-t border-slate-700 space-y-0.5 text-[10px]">
                      <div className="flex justify-between">
                        <span className="text-slate-400">Status:</span>
                        <strong className="text-blue-300">{liveInc.status}</strong>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-400">Severity:</span>
                        <strong className="text-amber-400">{liveInc.severity}</strong>
                      </div>
                      {liveInc.assigned_to && (
                        <div className="text-indigo-300 text-[10px] truncate">
                          ↳ {liveInc.assigned_to}
                        </div>
                      )}
                    </div>
                  </div>
                </Popup>
              </Marker>
            ))
          : /* Fallback to demo incidents if liveIncidents not yet loaded */
            visibility.incidents &&
            incidents.map((inc) => (
              <Marker
                key={inc.incident_id}
                position={[inc.coordinates.lat, inc.coordinates.lng]}
                icon={getIncidentIcon(inc, inc.incident_id === selectedIncidentId)}
                eventHandlers={{
                  click: () => onSelectIncident(inc),
                }}
              >
                <Popup>
                  <div className="font-mono text-xs space-y-1 max-w-[200px]">
                    <div className="font-bold text-rose-400">{inc.title}</div>
                    <div className="text-[11px] text-slate-300">{inc.description}</div>
                    <div className="pt-1 border-t border-slate-700 flex justify-between text-[10px]">
                      <span>Status:</span>
                      <strong className="text-cyan-300">{inc.status}</strong>
                    </div>
                  </div>
                </Popup>
              </Marker>
            ))}
      </MapContainer>
    </div>
  );
};
