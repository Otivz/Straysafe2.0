import { MapContainer, TileLayer, Marker, Popup, useMap, Polygon, Polyline, useMapEvents } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { useState, useEffect, useRef } from 'react';
import L from 'leaflet';
import axios from 'axios';

const BrgyIcon = L.divIcon({
    html: `
        <div style="position: relative; display: flex; flex-direction: column; align-items: center;">
            <div style="
                background: #F97316;
                width: 44px;
                height: 44px;
                border-radius: 12px;
                border: 3px solid white;
                box-shadow: 0 8px 20px rgba(249,115,22,0.4);
                display: flex;
                align-items: center;
                justify-content: center;
                color: white;
                font-size: 22px;
                animation: bounce 2s infinite ease-in-out;
            ">
                🏛️
            </div>
            <div style="
                background: #F97316;
                color: white;
                font-size: 8px;
                font-weight: 900;
                padding: 2px 6px;
                border-radius: 4px;
                text-transform: uppercase;
                letter-spacing: 0.1em;
                margin-top: 4px;
                box-shadow: 0 4px 10px rgba(0,0,0,0.2);
            ">HQ</div>
        </div>
    `,
    className: '',
    iconSize: [50, 70],
    iconAnchor: [25, 60],
    popupAnchor: [0, -60]
});

const createUserLocationIcon = (title: string) => L.divIcon({
    html: `
        <div style="display: flex; flex-direction: column; align-items: center;">
            <div style="
                background: #FFFFFF;
                color: #3B82F6;
                font-size: 7px;
                font-weight: 900;
                padding: 2px 6px;
                border-radius: 4px;
                text-transform: uppercase;
                letter-spacing: 0.1em;
                margin-bottom: 4px;
                box-shadow: 0 4px 10px rgba(0,0,0,0.2);
                border: 1px solid #3B82F6;
                white-space: nowrap;
            ">${title}</div>
            <div style="position: relative; width: 24px; height: 24px;">
                <div style="
                    position: absolute;
                    top: 50%;
                    left: 50%;
                    transform: translate(-50%, -50%);
                    width: 12px;
                    height: 12px;
                    background: #3B82F6;
                    border-radius: 50%;
                    border: 2px solid white;
                    box-shadow: 0 0 10px rgba(59,130,246,0.8);
                    z-index: 2;
                "></div>
                <div style="
                    position: absolute;
                    top: 0;
                    left: 0;
                    width: 100%;
                    height: 100%;
                    background: #3B82F6;
                    border-radius: 50%;
                    opacity: 0.4;
                    animation: pulse-ring 1.5s cubic-bezier(0.455, 0.03, 0.515, 0.955) infinite;
                "></div>
            </div>
        </div>
    `,
    className: '',
    iconSize: [120, 40],
    iconAnchor: [60, 30]
});

const IncidentIcon = L.divIcon({
    html: `
        <div style="position: relative; display: flex; align-items: center; justify-content: center;">
            <div style="
                background: #EF4444;
                width: 32px;
                height: 32px;
                border-radius: 50% 50% 50% 0;
                transform: rotate(-45deg);
                border: 2px solid white;
                box-shadow: 0 4px 10px rgba(239,68,68,0.4);
                display: flex;
                align-items: center;
                justify-content: center;
            ">
                <div style="transform: rotate(45deg); font-size: 14px;">🐾</div>
            </div>
        </div>
    `,
    className: '',
    iconSize: [32, 32],
    iconAnchor: [16, 32],
    popupAnchor: [0, -32]
});

// Add these animations to your global CSS or inside a style tag
const style = document.createElement('style');
style.textContent = `
    @keyframes bounce {
        0%, 100% { transform: translateY(0); }
        50% { transform: translateY(-10px); }
    }
    @keyframes pulse-ring {
        0% { transform: scale(0.33); }
        80%, 100% { opacity: 0; }
    }
`;
document.head.appendChild(style);

const createColoredIncidentIcon = (colorName: string = 'red', category: string = '') => {
    const colors: Record<string, string> = {
        red: '#EF4444',     // Pending
        orange: '#F97316',  // Endorsed
        blue: '#3B82F6',    // Assigned
        yellow: '#F59E0B',  // In Progress
        purple: '#8B5CF6',  // Picked Up
        green: '#10B981',   // Resolved
    };

    const hexColor = colors[colorName.toLowerCase()] || '#EF4444';
    const emoji = category.toLowerCase().includes('cat') ? '🐱' : '🐶';

    return L.divIcon({
        html: `
            <div style="position: relative; display: flex; align-items: center; justify-content: center;">
                <div style="
                    background: ${hexColor};
                    width: 32px;
                    height: 32px;
                    border-radius: 50% 50% 50% 0;
                    transform: rotate(-45deg);
                    border: 2px solid white;
                    box-shadow: 0 4px 12px rgba(0,0,0,0.15);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                ">
                    <div style="transform: rotate(45deg); font-size: 14px;">${emoji}</div>
                </div>
            </div>
        `,
        className: '',
        iconSize: [32, 32],
        iconAnchor: [16, 32],
        popupAnchor: [0, -32]
    });
};

import HeatmapLayer from './HeatmapLayer';
import RoutingControl from './RoutingControl';
import ReturnToSeleraButton from './MapControls/ReturnToSeleraButton';

export const PRESET_LANDMARKS = [
    { id: 'alfamart', name: 'Alfamart', lat: 14.801600, lng: 121.004200, icon: '🏪', type: 'Store' },
    { id: 'lugawan', name: 'Lugawan ni Bading', lat: 14.800800, lng: 121.003400, icon: '🥣', type: 'Eatery' },
    { id: 'court', name: 'Basketball Court', lat: 14.801900, lng: 121.003800, icon: '🏀', type: 'Sports' },
    { id: 'clubhouse', name: 'Selera Clubhouse', lat: 14.801200, lng: 121.002900, icon: '🏛️', type: 'Facility' },
    { id: 'maingate', name: 'Selera Main Gate', lat: 14.802300, lng: 121.003200, icon: '⛩️', type: 'Gate' },
    { id: 'daycare', name: 'Daycare Center', lat: 14.800300, lng: 121.002600, icon: '🏫', type: 'School' },
    { id: 'chapel', name: 'Grotto / Chapel', lat: 14.800500, lng: 121.004500, icon: '💒', type: 'Church' },
    { id: 'terminal', name: 'Tricycle Terminal', lat: 14.802100, lng: 121.004800, icon: '🛺', type: 'Transport' },
];

export const createLandmarkIcon = (iconEmoji: string, name: string, isSelected: boolean = false) => L.divIcon({
    html: `
        <div style="display: flex; flex-direction: column; align-items: center; cursor: pointer; transition: transform 0.2s;" class="group">
            <div style="
                background: ${isSelected ? '#F97316' : '#FFFFFF'};
                color: ${isSelected ? '#FFFFFF' : '#1A1208'};
                font-size: 8px;
                font-weight: 900;
                padding: 3px 8px;
                border-radius: 9999px;
                text-transform: uppercase;
                letter-spacing: 0.05em;
                box-shadow: 0 4px 12px rgba(0,0,0,0.15);
                border: 2px solid ${isSelected ? '#FFFFFF' : '#F97316'};
                white-space: nowrap;
                margin-bottom: 2px;
                display: flex;
                align-items: center;
                gap: 4px;
            ">
                <span>${iconEmoji}</span>
                <span>${name}</span>
            </div>
            <div style="
                width: 10px;
                height: 10px;
                background: ${isSelected ? '#F97316' : '#FFFFFF'};
                border: 2px solid ${isSelected ? '#FFFFFF' : '#F97316'};
                border-radius: 50%;
                box-shadow: 0 2px 6px rgba(0,0,0,0.2);
            "></div>
        </div>
    `,
    className: '',
    iconSize: [120, 50],
    iconAnchor: [60, 45]
});

interface MapComponentProps {
    height?: string;
    center?: [number, number];
    zoom?: number;
    showHeatmap?: boolean;
    heatmapPoints?: [number, number, number][];
    markers?: {
        id: number,
        lat: number,
        lng: number,
        title: string,
        priority?: string,
        time?: string,
        category?: string,
        color?: string,
        rawData?: any
    }[];
    onLocationChange?: (lat: number, lng: number) => void;
    routing?: {
        start: [number, number];
        end: [number, number];
        waypointNames?: [string, string];
        onRoutingUpdate?: (data: { distance: string; time: string }) => void;
        onClose?: () => void;
    };
    onMarkerClick?: (marker: any) => void;
    onViewDetails?: (marker: any) => void;
    showGeofence?: boolean;
    showLandmarks?: boolean;
    showConnectingLine?: boolean;
    onRouteCalculated?: (distanceMeters: number) => void;
    polylines?: {
        positions: [number, number][];
        color?: string;
        weight?: number;
        dashArray?: string;
        opacity?: number;
    }[];
}

// Internal component to handle view changes
const ChangeView = ({ center, zoom }: { center: [number, number], zoom: number }) => {
    const map = useMap();
    const prevCenterRef = useRef<[number, number]>(center);
    const prevZoomRef = useRef<number>(zoom);

    useEffect(() => {
        const centerChanged = center[0] !== prevCenterRef.current[0] || center[1] !== prevCenterRef.current[1];
        const zoomChanged = zoom !== prevZoomRef.current;

        if (centerChanged || zoomChanged) {
            map.setView(center, zoom);
            prevCenterRef.current = center;
            prevZoomRef.current = zoom;
        }
    }, [center, zoom, map]);
    return null;
};

// Internal component to handle click-to-pinpoint events on map
const MapEventsHandler = ({ onLocationChange }: { onLocationChange?: (lat: number, lng: number) => void }) => {
    useMapEvents({
        click(e) {
            if (onLocationChange) {
                onLocationChange(e.latlng.lat, e.latlng.lng);
            }
        }
    });
    return null;
};

// Internal component to fetch and render road-following turn-by-turn routes
const RoadRouteOverlay = ({
    start,
    end,
    color = '#F97316',
    weight = 4,
    dashArray = '6, 8',
    onRouteCalculated
}: {
    start: [number, number];
    end: [number, number];
    color?: string;
    weight?: number;
    dashArray?: string;
    onRouteCalculated?: (distanceMeters: number) => void;
}) => {
    const [positions, setPositions] = useState<[number, number][]>([start, end]);

    useEffect(() => {
        let isMounted = true;
        const fetchRoadRoute = async () => {
            if (!start[0] || !start[1] || !end[0] || !end[1]) return;
            try {
                // Query OSRM walking profile first for pedestrian / neighbourhood pathways
                const walkingUrl = `https://router.project-osrm.org/route/v1/walking/${start[1]},${start[0]};${end[1]},${end[0]}?overview=full&geometries=geojson`;
                const res = await axios.get(walkingUrl);
                if (res.data?.routes?.[0]?.geometry?.coordinates && isMounted) {
                    const coords = res.data.routes[0].geometry.coordinates.map((c: [number, number]) => [c[1], c[0]] as [number, number]);
                    if (coords.length > 0) {
                        setPositions(coords);
                        if (onRouteCalculated && res.data.routes[0].distance) {
                            onRouteCalculated(res.data.routes[0].distance);
                        }
                        return;
                    }
                }
            } catch (err) {
                try {
                    // Fallback to driving profile
                    const drivingUrl = `https://router.project-osrm.org/route/v1/driving/${start[1]},${start[0]};${end[1]},${end[0]}?overview=full&geometries=geojson`;
                    const drivingRes = await axios.get(drivingUrl);
                    if (drivingRes.data?.routes?.[0]?.geometry?.coordinates && isMounted) {
                        const coords = drivingRes.data.routes[0].geometry.coordinates.map((c: [number, number]) => [c[1], c[0]] as [number, number]);
                        if (coords.length > 0) {
                            setPositions(coords);
                            if (onRouteCalculated && drivingRes.data.routes[0].distance) {
                                onRouteCalculated(drivingRes.data.routes[0].distance);
                            }
                            return;
                        }
                    }
                } catch (e2) {
                    console.warn("OSRM routing fallback to straight line:", e2);
                }
            }
            if (isMounted) {
                setPositions([start, end]);
            }
        };

        fetchRoadRoute();

        return () => {
            isMounted = false;
        };
    }, [start[0], start[1], end[0], end[1]]);

    return (
        <>
            {/* White outline halo for high road visibility */}
            <Polyline
                positions={positions}
                pathOptions={{
                    color: '#ffffff',
                    weight: weight + 3,
                    opacity: 0.85
                }}
            />
            {/* Main colored road trajectory line */}
            <Polyline
                positions={positions}
                pathOptions={{
                    color: color,
                    weight: weight,
                    dashArray: dashArray,
                    opacity: 1
                }}
            />
        </>
    );
};

const MapComponent = ({
    height = "100%",
    center = [14.6760, 121.0437],
    zoom = 13,
    showHeatmap = true,
    heatmapPoints = [],
    markers = [],
    onLocationChange,
    routing,
    onMarkerClick,
    onViewDetails,
    showGeofence = true,
    showLandmarks = false,
    showConnectingLine = false,
    onRouteCalculated,
    polylines = []
}: MapComponentProps) => {
    const SELERA_BOUNDS: [number, number][] = [
        [14.801496, 121.005174],
        [14.799577, 121.003911],
        [14.800634, 121.002228],
        [14.802461, 121.003280]
    ];

    const eventHandlers = {
        dragend(e: any) {
            const marker = e.target;
            if (marker != null && onLocationChange) {
                const { lat, lng } = marker.getLatLng();
                onLocationChange(lat, lng);
            }
        },
    };
    return (
        <MapContainer
            center={center}
            zoom={zoom}
            scrollWheelZoom={false}
            style={{ height: height, width: '100%' }}
        >
            <ChangeView center={center} zoom={zoom} />
            <MapEventsHandler onLocationChange={onLocationChange} />
            <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />

            {showGeofence && (
                <Polygon
                    positions={SELERA_BOUNDS}
                    pathOptions={{
                        color: '#F97316',
                        fillColor: '#F97316',
                        fillOpacity: 0.1,
                        weight: 2,
                        dashArray: '5, 10'
                    }}
                >
                    <Popup>
                        <div className="p-2 text-center">
                            <p className="text-[10px] font-black uppercase text-[#F97316]">Selera Homes Reporting Zone</p>
                            <p className="text-[8px] text-gray-500 font-bold uppercase tracking-widest mt-1">Stray reports are only accepted within this area</p>
                        </div>
                    </Popup>
                </Polygon>
            )}

            {showLandmarks && PRESET_LANDMARKS.map(lm => (
                <Marker
                    key={`poi-lm-${lm.id}`}
                    position={[lm.lat, lm.lng]}
                    icon={createLandmarkIcon(lm.icon, lm.name, false)}
                    eventHandlers={{
                        click: () => {
                            if (onLocationChange) {
                                onLocationChange(lm.lat, lm.lng);
                            }
                        }
                    }}
                >
                    <Popup>
                        <div className="p-1.5 text-center">
                            <p className="text-[10px] font-black uppercase text-[#F97316]">{lm.icon} {lm.name}</p>
                            <p className="text-[8px] text-gray-500 font-bold uppercase tracking-widest mt-0.5">{lm.type} Landmark</p>
                        </div>
                    </Popup>
                </Marker>
            ))}

            {/* Road-following Route Line between markers */}
            {showConnectingLine && markers.length >= 2 && markers[0].lat && markers[1].lat && (
                <RoadRouteOverlay
                    start={[markers[0].lat, markers[0].lng]}
                    end={[markers[1].lat, markers[1].lng]}
                    color="#F97316"
                    weight={4}
                    dashArray="6, 8"
                    onRouteCalculated={onRouteCalculated}
                />
            )}

            {polylines && polylines.map((line, idx) => (
                <Polyline
                    key={`custom-line-${idx}`}
                    positions={line.positions}
                    pathOptions={{
                        color: line.color || '#F97316',
                        weight: line.weight || 3.5,
                        dashArray: line.dashArray || '6, 8',
                        opacity: line.opacity || 0.9
                    }}
                />
            ))}

            {markers.map((marker) => (
                <Marker
                    key={marker.id}
                    position={[marker.lat, marker.lng]}
                    icon={
                        (marker.category === 'Barangay Office' || marker.category === 'HQ') ? BrgyIcon :
                            (marker.category === 'User Location' || marker.category === 'Operator') ? createUserLocationIcon(marker.title || 'You are here') :
                                marker.color ? createColoredIncidentIcon(marker.color, marker.category) : IncidentIcon
                    }
                    eventHandlers={{
                        popupopen: () => onMarkerClick && onMarkerClick(marker)
                    }}
                >
                    <Popup className="custom-popup">
                        <div className="p-3 min-w-[200px]">
                            {marker.rawData ? (
                                <div className="flex flex-col gap-1.5 text-xs text-gray-700">
                                    <div className="flex justify-between items-center border-b border-gray-100 pb-1.5 mb-1.5">
                                        <span className="font-black text-gray-900">Report #{marker.id}</span>
                                        <span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded ${
                                            marker.priority === 'High' ? 'bg-red-50 text-red-500' : 
                                            (marker.priority === 'Medium' || marker.priority === 'Regular') ? 'bg-amber-50 text-amber-500' : 'bg-blue-50 text-blue-500'
                                        }`}>
                                            {marker.priority || 'Medium'}
                                        </span>
                                    </div>
                                    <div className="grid grid-cols-2 gap-x-2 gap-y-1">
                                        <span className="text-[10px] font-bold text-gray-400 uppercase">Animal:</span>
                                        <span className="font-semibold text-gray-900">{marker.category || 'Stray'}</span>

                                        <span className="text-[10px] font-bold text-gray-400 uppercase">Status:</span>
                                        <span className="font-semibold text-gray-900">{marker.rawData.statusName || 'Active'}</span>

                                        <span className="text-[10px] font-bold text-gray-400 uppercase">Reporter:</span>
                                        <span className="font-semibold text-gray-900 truncate">{marker.rawData.reporterName || 'Citizen'}</span>

                                        <span className="text-[10px] font-bold text-gray-400 uppercase">Date:</span>
                                        <span className="font-semibold text-gray-900 truncate">{marker.time}</span>

                                        <span className="text-[10px] font-bold text-gray-400 uppercase">Location:</span>
                                        <span className="font-semibold text-gray-900 truncate">{marker.rawData.landmark || 'Selera Homes'}</span>
                                    </div>
                                    <div className="pt-2 border-t border-gray-100 mt-1 flex flex-col gap-2">
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                if (onViewDetails) onViewDetails(marker);
                                            }}
                                            className="w-full py-2 bg-[#1A4543] text-white text-[9px] font-black uppercase rounded-lg hover:bg-[#112d2b] transition-colors shadow-sm"
                                        >
                                            View Full Details
                                        </button>

                                        <div className="grid grid-cols-2 gap-2 mt-0.5">
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    if (onMarkerClick) onMarkerClick({ ...marker, source: 'brgy' });
                                                }}
                                                className="py-1.5 bg-[#F97316] text-white text-[8px] font-black uppercase rounded hover:bg-[#EA580C] transition-colors"
                                            >
                                                Directions (HQ)
                                            </button>
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    if (onMarkerClick) onMarkerClick({ ...marker, source: 'current' });
                                                }}
                                                className="py-1.5 bg-[#F97316] text-white text-[8px] font-black uppercase rounded hover:bg-[#EA580C] transition-colors"
                                            >
                                                Directions (Me)
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            ) : (
                                <>
                                    <div className="flex justify-between items-start mb-2">
                                        <span className={`text-[8px] font-black uppercase px-2 py-0.5 rounded ${
                                            marker.priority === 'High' ? 'bg-red-50 text-red-500' : 
                                            (marker.priority === 'Medium' || marker.priority === 'Regular') ? 'bg-amber-50 text-amber-500' : 'bg-blue-50 text-blue-500'
                                        }`}>
                                            {marker.priority || 'Medium'}
                                        </span>
                                        <span className="text-[8px] font-bold text-gray-400 uppercase">{marker.time}</span>
                                    </div>
                                    <h3 className="font-black text-xs uppercase text-[#1a1208] mb-1">{marker.category || 'Stray Animal'}</h3>
                                    <p className="text-[10px] text-gray-500 leading-tight mb-2 italic">"{marker.title}"</p>
                                    <div className="pt-2 border-t border-gray-100 flex flex-col gap-2">
                                        <p className="text-[8px] font-black text-gray-400 uppercase tracking-widest text-center mt-1">Get Directions</p>
                                        <div className="grid grid-cols-2 gap-2">
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    if (onMarkerClick) onMarkerClick({ ...marker, source: 'brgy' });
                                                }}
                                                className="py-2 bg-[#F97316] text-[#FAFAF9] text-[9px] font-black uppercase rounded-lg hover:bg-[#EA580C] transition-colors shadow-sm border border-orange-500/20"
                                            >
                                                From Office
                                            </button>
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    if (onMarkerClick) onMarkerClick({ ...marker, source: 'current' });
                                                }}
                                                className="py-2 bg-[#F97316] text-[#FAFAF9] text-[9px] font-black uppercase rounded-lg hover:bg-[#EA580C] transition-colors shadow-sm border border-orange-500/20"
                                            >
                                                From Me
                                            </button>
                                        </div>
                                    </div>
                                </>
                            )}
                        </div>
                    </Popup>
                </Marker>
            ))}

            {routing && (
                <RoutingControl
                    key={`${routing.start[0]}-${routing.start[1]}-${routing.end[0]}-${routing.end[1]}`}
                    start={routing.start}
                    end={routing.end}
                    waypointNames={routing.waypointNames}
                    onRoutingUpdate={routing.onRoutingUpdate}
                    onClose={routing.onClose}
                />
            )}

            {onLocationChange && (
                <Marker
                    position={center}
                    draggable={true}
                    eventHandlers={eventHandlers}
                >
                    <Popup>
                        Location: {center[0].toFixed(4)}, {center[1].toFixed(4)}
                    </Popup>
                </Marker>
            )}

            <ReturnToSeleraButton />
        </MapContainer>
    );
};

export default MapComponent;

