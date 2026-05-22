import { MapContainer, TileLayer, Marker, Popup, useMap, Polygon } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { useEffect } from 'react';
import L from 'leaflet';

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

const MeIcon = L.divIcon({
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
            ">You are here</div>
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
    iconSize: [80, 40],
    iconAnchor: [40, 30]
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

import HeatmapLayer from './HeatmapLayer';
import RoutingControl from './RoutingControl';

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
        category?: string
    }[];
    onLocationChange?: (lat: number, lng: number) => void;
    routing?: {
        start: [number, number];
        end: [number, number];
        waypointNames?: [string, string];
        onRoutingUpdate?: (data: { distance: string; time: string }) => void;
    };
    onMarkerClick?: (marker: any) => void;
    showGeofence?: boolean;
}

// Internal component to handle view changes
const ChangeView = ({ center, zoom }: { center: [number, number], zoom: number }) => {
    const map = useMap();
    useEffect(() => {
        map.setView(center, zoom);
    }, [center, zoom, map]);
    return null;
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
    showGeofence = true
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

            {showHeatmap && (
                <HeatmapLayer
                    points={heatmapPoints}
                    options={{ radius: 35, blur: 15 }}
                />
            )}

            {markers.map((marker) => (
                <Marker
                    key={marker.id}
                    position={[marker.lat, marker.lng]}
                    icon={
                        (marker.category === 'Barangay Office' || marker.category === 'HQ') ? BrgyIcon :
                            (marker.category === 'User Location' || marker.category === 'Operator') ? MeIcon : IncidentIcon
                    }
                    eventHandlers={{
                        popupopen: () => onMarkerClick && onMarkerClick(marker)
                    }}
                >
                    <Popup className="custom-popup">
                        <div className="p-3 min-w-[180px]">
                            <div className="flex justify-between items-start mb-2">
                                <span className={`text-[8px] font-black uppercase px-2 py-0.5 rounded ${marker.priority === 'High' ? 'bg-red-50 text-red-500' : 'bg-blue-50 text-blue-500'
                                    }`}>
                                    {marker.priority || 'Regular'}
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
                                            console.log("From Office clicked");
                                            e.stopPropagation();
                                            if (onMarkerClick) onMarkerClick({ ...marker, source: 'brgy' });
                                        }}
                                        className="py-2 bg-orange-600 text-white text-[9px] font-black uppercase rounded-lg hover:bg-orange-700 transition-colors shadow-sm"
                                    >
                                        From Office
                                    </button>
                                    <button
                                        onClick={(e) => {
                                            console.log("From Me clicked");
                                            e.stopPropagation();
                                            if (onMarkerClick) onMarkerClick({ ...marker, source: 'current' });
                                        }}
                                        className="py-2 bg-gray-900 text-white text-[9px] font-black uppercase rounded-lg hover:bg-black transition-colors shadow-sm"
                                    >
                                        From Me
                                    </button>
                                </div>
                                <button className="w-full py-2 bg-gray-50 text-gray-400 text-[8px] font-black uppercase rounded-lg hover:bg-gray-100 transition-colors mt-1">
                                    View Full Details
                                </button>
                            </div>
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
        </MapContainer>
    );
};

export default MapComponent;

