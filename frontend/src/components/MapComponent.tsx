import { MapContainer, TileLayer, Marker, Popup, useMap, Polygon, Polyline, useMapEvents, Tooltip } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { useState, useEffect, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import L from 'leaflet';
import axios from 'axios';
import { getProfilePicture, DEFAULT_AVATAR, DEFAULT_PET_AVATAR } from '../utils/avatar';
import { createBarangayHQIcon, createHoldingFacilityPinIcon, createLandmarkPinIcon, getLandmarkCategory, getLandmarkZoomMetrics } from '../utils/landmarkIcons';


const createUserLocationIcon = () => L.divIcon({
    html: `
        <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; width: 24px; height: 24px;">
            <div style="position: relative; width: 24px; height: 24px;">
                <div style="
                    position: absolute;
                    top: 50%;
                    left: 50%;
                    transform: translate(-50%, -50%);
                    width: 14px;
                    height: 14px;
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
    className: 'user-location-marker',
    iconSize: [24, 24],
    iconAnchor: [12, 12]
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

export const createFacilityHoldingIcon = (
    animalType: string = 'Dog',
    facilityName: string = 'HOLDING FACILITY',
    imageUrl?: string,
    landmarkIcon: string = '🐾',
    zoom: number = 16
) => {
    // Compact pin when zoomed out to prevent covering nearby landmarks and streets
    if (zoom < 16) {
        const m = getLandmarkZoomMetrics(zoom);
        const pinSize = m.size + 6;
        return L.divIcon({
            html: `
                <div style="
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    position: relative;
                    width: ${pinSize}px;
                    height: ${pinSize}px;
                    border-radius: 50%;
                    background: #FFFFFF;
                    border: ${m.border}px solid #059669;
                    box-shadow: ${m.shadow}, 0 0 0 ${m.border}px #6ee7b7;
                    cursor: pointer;
                    transition: transform 0.15s ease-in-out;
                " onmouseover="this.style.transform='scale(1.2)';" onmouseout="this.style.transform='scale(1)';">
                    <span style="font-size: ${m.font}px;">${landmarkIcon || '🐾'}</span>
                    <div style="
                        position: absolute;
                        bottom: -2px;
                        right: -2px;
                        width: 11px;
                        height: 11px;
                        border-radius: 50%;
                        background: #10B981;
                        border: 1.5px solid #FFFFFF;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        color: white;
                        font-size: 7px;
                        font-weight: 900;
                    ">✓</div>
                </div>
            `,
            className: 'custom-facility-pin-compact',
            iconSize: [pinSize, pinSize],
            iconAnchor: [pinSize / 2, pinSize / 2],
            popupAnchor: [0, -(pinSize / 2) - 2]
        });
    }

    const isCat = (animalType || '').toLowerCase().includes('cat');
    const defaultEmoji = isCat ? '🐱' : '🐶';
    const avatarContent = imageUrl ? `
        <img src="${imageUrl}" style="width: 100%; height: 100%; object-fit: cover; border-radius: 50%;" onerror="this.outerHTML='<span style=\\'font-size:20px;\\'>${defaultEmoji}</span>'" />
    ` : `<span style="font-size: 20px; line-height: 1;">${defaultEmoji}</span>`;

    const cleanFacName = (facilityName && facilityName.trim()) ? facilityName.trim() : 'HOLDING FACILITY';
    const isGenericHolding = cleanFacName.toLowerCase() === 'holding facility' || cleanFacName.toLowerCase() === 'facility';

    return L.divIcon({
        html: `
            <div style="position: relative; display: inline-flex; flex-direction: column; align-items: center; cursor: default; filter: drop-shadow(0 4px 12px rgba(0,0,0,0.25));">
                <!-- Main Horizontal Card Pin -->
                <div style="
                    display: flex;
                    align-items: center;
                    gap: 12px;
                    background: #FFFFFF;
                    border: 2px solid #E2E8F0;
                    padding: 7px 16px 7px 8px;
                    border-radius: 16px;
                    color: #0F172A;
                    white-space: nowrap;
                    box-shadow: 0 4px 10px rgba(0,0,0,0.1);
                    user-select: none;
                ">
                    <!-- Left Landmark / Facility Icon Badge -->
                    <div style="
                        width: 38px;
                        height: 38px;
                        border-radius: 50%;
                        background: #FFFFFF;
                        border: 2px solid #059669;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        font-size: 20px;
                        flex-shrink: 0;
                        box-shadow: 0 2px 6px rgba(0,0,0,0.08);
                    ">
                        ${landmarkIcon || '🐾'}
                    </div>

                    <!-- Center Animal Avatar with Shield Checkmark Badge -->
                    <div style="position: relative; width: 38px; height: 38px; flex-shrink: 0;">
                        <div style="
                            width: 38px;
                            height: 38px;
                            border-radius: 50%;
                            background: #F1F5F9;
                            border: 2px solid #CBD5E1;
                            display: flex;
                            align-items: center;
                            justify-content: center;
                            overflow: hidden;
                        ">
                            ${avatarContent}
                        </div>
                        <!-- Green Checkmark Badge -->
                        <div style="
                            position: absolute;
                            bottom: -2px;
                            right: -2px;
                            width: 15px;
                            height: 15px;
                            border-radius: 50%;
                            background: #10B981;
                            border: 2px solid #FFFFFF;
                            display: flex;
                            align-items: center;
                            justify-content: center;
                            color: white;
                            font-size: 9px;
                            font-weight: 900;
                        ">
                            ✓
                        </div>
                    </div>

                    <!-- Right Text Info -->
                    <div style="display: flex; flex-direction: column; text-align: left; padding-right: 4px;">
                        <div style="
                            font-size: 13px;
                            font-weight: 900;
                            color: #0F172A;
                            text-transform: uppercase;
                            letter-spacing: 0.04em;
                            line-height: 1.2;
                        ">
                            ${isGenericHolding ? 'HOLDING FACILITY' : cleanFacName.toUpperCase()}
                        </div>
                        <div style="
                            font-size: 10px;
                            font-weight: 800;
                            color: #059669;
                            text-transform: uppercase;
                            letter-spacing: 0.06em;
                            display: flex;
                            align-items: center;
                            gap: 4px;
                            line-height: 1.2;
                            margin-top: 2px;
                        ">
                            <span style="font-size: 9px; font-weight: 900;">✓</span> ${isGenericHolding ? 'SECURED INSIDE' : 'HOLDING FACILITY • SECURED INSIDE'}
                        </div>
                    </div>
                </div>

                <!-- Downward Pointer Triangle -->
                <div style="
                    width: 0;
                    height: 0;
                    border-left: 9px solid transparent;
                    border-right: 9px solid transparent;
                    border-top: 9px solid #FFFFFF;
                    margin-top: -1px;
                    filter: drop-shadow(0 2px 2px rgba(0,0,0,0.1));
                "></div>
            </div>
        `,
        className: 'custom-secured-facility-pin',
        iconSize: [300, 64],
        iconAnchor: [150, 60],
        popupAnchor: [0, -60]
    });
};

const createSelectedPinIcon = () => {
    return L.divIcon({
        html: `
            <div style="position: relative; display: flex; flex-direction: column; align-items: center;">
                <div style="
                    background: #F97316;
                    width: 32px;
                    height: 32px;
                    border-radius: 50% 50% 50% 0;
                    transform: rotate(-45deg);
                    border: 2px solid white;
                    box-shadow: 0 4px 14px rgba(249,115,22,0.5);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                ">
                    <div style="transform: rotate(45deg); font-size: 14px; color: white;">📍</div>
                </div>
                <div style="
                    background: #1E293B;
                    color: white;
                    font-size: 8px;
                    font-weight: 900;
                    padding: 1.5px 5px;
                    border-radius: 4px;
                    text-transform: uppercase;
                    margin-top: 3px;
                    box-shadow: 0 2px 6px rgba(0,0,0,0.2);
                    white-space: nowrap;
                ">SELECTED</div>
            </div>
        `,
        className: 'selected-location-pin',
        iconSize: [40, 52],
        iconAnchor: [20, 48],
        popupAnchor: [0, -48]
    });
};



const InitialSightingIcon = L.divIcon({
    html: `
        <div style="position: relative; display: flex; flex-direction: column; align-items: center;">
            <div style="
                background: #475569;
                width: 34px;
                height: 34px;
                border-radius: 50% 50% 50% 0;
                transform: rotate(-45deg);
                border: 2.5px solid white;
                box-shadow: 0 6px 14px rgba(71,85,105,0.4);
                display: flex;
                align-items: center;
                justify-content: center;
            ">
                <div style="transform: rotate(45deg); font-size: 15px;">🚩</div>
            </div>
            <div style="
                background: #475569;
                color: white;
                font-size: 7.5px;
                font-weight: 900;
                padding: 1.5px 5px;
                border-radius: 4px;
                text-transform: uppercase;
                letter-spacing: 0.06em;
                margin-top: 3px;
                box-shadow: 0 3px 8px rgba(0,0,0,0.2);
                white-space: nowrap;
            ">FOUND SPOT</div>
        </div>
    `,
    className: '',
    iconSize: [50, 60],
    iconAnchor: [25, 52],
    popupAnchor: [0, -52]
});

// Purge any legacy zombie style elements from document.head
if (typeof document !== 'undefined') {
    document.querySelectorAll('head style').forEach(s => {
        if (s.id !== 'straysafe-map-component-styles' && s.textContent && (s.textContent.includes('opacity: 0 !important') || s.textContent.includes('.leaflet-marker-icon:hover'))) {
            s.remove();
        }
    });
}

// Inject map component custom styles safely (reusing element on HMR)
const STYLE_ID = 'straysafe-map-component-styles';
let mapStyleElement = document.getElementById(STYLE_ID) as HTMLStyleElement;
if (!mapStyleElement) {
    mapStyleElement = document.createElement('style');
    mapStyleElement.id = STYLE_ID;
    document.head.appendChild(mapStyleElement);
}
mapStyleElement.textContent = `
    @keyframes bounce {
        0%, 100% { transform: translateY(0); }
        50% { transform: translateY(-10px); }
    }
    @keyframes pulse-ring {
        0% { transform: scale(0.33); }
        80%, 100% { opacity: 0; }
    }
    .user-location-marker {
        background: transparent !important;
        border: none !important;
    }
    @keyframes popup-reveal {
        0% {
            opacity: 0;
            transform: scale(0.92) translateY(8px);
        }
        100% {
            opacity: 1;
            transform: scale(1) translateY(0);
        }
    }
    .custom-popup {
        animation: popup-reveal 0.22s cubic-bezier(0.16, 1, 0.3, 1) forwards;
    }
    .custom-popup .leaflet-popup-content-wrapper {
        padding: 0 !important;
        border-radius: 16px !important;
        overflow: hidden !important;
        box-shadow: 0 14px 35px -4px rgba(0, 0, 0, 0.22), 0 4px 12px rgba(0, 0, 0, 0.08) !important;
        border: 1px solid rgba(0,0,0,0.08) !important;
    }
    .custom-popup .leaflet-popup-content {
        margin: 0 !important;
        line-height: 1.2 !important;
    }
    .custom-popup a.leaflet-popup-close-button {
        top: 10px !important;
        right: 12px !important;
        padding: 4px !important;
        color: #64748B !important;
        font-size: 16px !important;
        font-weight: 700 !important;
        transition: color 0.15s ease;
    }
    .custom-popup a.leaflet-popup-close-button:hover {
        color: #0F172A !important;
    }
    .custom-hover-tooltip.leaflet-tooltip {
        background: #FFFFFF !important;
        border: 1.5px solid #F97316 !important;
        border-radius: 8px !important;
        padding: 4px 10px !important;
        color: #F97316 !important;
        font-weight: 900 !important;
        font-size: 9px !important;
        text-transform: uppercase !important;
        letter-spacing: 0.05em !important;
        box-shadow: 0 6px 18px rgba(249, 115, 22, 0.25) !important;
        white-space: nowrap !important;
        pointer-events: none !important;
    }
    .leaflet-routing-container {
        background-color: #FFFFFF !important;
        color: #0F172A !important;
        border-radius: 14px !important;
        box-shadow: 0 12px 30px -4px rgba(0, 0, 0, 0.25) !important;
        border: 1.5px solid #E2E8F0 !important;
        font-family: inherit !important;
        max-width: 310px !important;
        padding: 8px !important;
    }
    .leaflet-routing-container * {
        color: #0F172A !important;
    }
    .leaflet-routing-alt {
        max-height: 220px !important;
        overflow-y: auto !important;
        background: #FFFFFF !important;
        color: #0F172A !important;
        padding: 4px !important;
    }
    .leaflet-routing-alt table {
        width: 100% !important;
    }
    .leaflet-routing-alt tr {
        color: #0F172A !important;
        border-bottom: 1px solid #F1F5F9 !important;
    }
    .leaflet-routing-alt tr:hover {
        background-color: #F8FAFC !important;
    }
    .leaflet-routing-alt td {
        color: #0F172A !important;
        font-size: 11px !important;
        font-weight: 600 !important;
        padding: 6px 4px !important;
    }
    .leaflet-routing-icon {
        filter: brightness(0.2) !important;
    }
    .custom-hover-tooltip.leaflet-tooltip-top::before {
        border-top-color: #F97316 !important;
    }
    .leaflet-marker-icon {
        opacity: 1 !important;
        visibility: visible !important;
        display: block !important;
    }
    .leaflet-marker-icon:hover, .leaflet-marker-icon:active, .leaflet-marker-icon:focus {
        z-index: 9999 !important;
        opacity: 1 !important;
        visibility: visible !important;
        display: block !important;
    }
    /* Eliminate browser focus rectangle / black box on all map paths and SVG elements */
    .leaflet-container *:focus,
    .leaflet-container *:focus-visible,
    .leaflet-container *:active,
    .leaflet-interactive,
    .leaflet-interactive:focus,
    .leaflet-interactive:focus-visible,
    .leaflet-overlay-pane svg,
    .leaflet-overlay-pane svg:focus,
    .leaflet-overlay-pane svg:focus-visible,
    .leaflet-overlay-pane path,
    .leaflet-overlay-pane path:focus,
    .leaflet-overlay-pane path:focus-visible,
    path.leaflet-interactive,
    path.leaflet-interactive:focus,
    path.leaflet-interactive:focus-visible,
    svg.leaflet-zoom-animated:focus {
        outline: none !important;
        box-shadow: none !important;
        -webkit-tap-highlight-color: transparent !important;
    }
`;

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

export const PRESET_LANDMARKS: any[] = [];

export const createLandmarkIcon = (iconEmoji: string, name: string, isSelected: boolean = false, zoom: number = 16) => {
    const m = getLandmarkZoomMetrics(zoom);

    if (m.showBadge && zoom >= 18) {
        return L.divIcon({
            html: `
                <div style="display: flex; flex-direction: column; align-items: center; cursor: pointer; transition: transform 0.2s;" class="group">
                    <div style="
                        background: ${isSelected ? '#F97316' : '#FFFFFF'};
                        color: ${isSelected ? '#FFFFFF' : '#1A1208'};
                        font-size: 8px;
                        font-weight: 900;
                        padding: 2.5px 7px;
                        border-radius: 9999px;
                        text-transform: uppercase;
                        letter-spacing: 0.04em;
                        box-shadow: 0 3px 8px rgba(0,0,0,0.15);
                        border: 1.5px solid ${isSelected ? '#FFFFFF' : '#F97316'};
                        white-space: nowrap;
                        display: flex;
                        align-items: center;
                        gap: 3px;
                    ">
                        <span>${iconEmoji}</span>
                        <span style="max-width: 85px; overflow: hidden; text-overflow: ellipsis;">${name}</span>
                    </div>
                    <div style="
                        width: 6px;
                        height: 6px;
                        background: ${isSelected ? '#F97316' : '#FFFFFF'};
                        border: 1.5px solid ${isSelected ? '#FFFFFF' : '#F97316'};
                        border-radius: 50%;
                        margin-top: 1px;
                    "></div>
                </div>
            `,
            className: '',
            iconSize: [95, 36],
            iconAnchor: [47, 34],
            popupAnchor: [0, -34]
        });
    }

    return L.divIcon({
        html: `
            <div style="
                display: flex;
                align-items: center;
                justify-content: center;
                width: ${m.size}px;
                height: ${m.size}px;
                border-radius: 50%;
                background: ${isSelected ? '#F97316' : '#FFFFFF'};
                box-shadow: ${m.shadow}, 0 0 0 ${m.border}px ${isSelected ? '#FFFFFF' : '#F97316'};
                border: ${m.border}px solid white;
                font-size: ${m.font}px;
                cursor: pointer;
                transition: transform 0.15s ease-in-out;
            " onmouseover="this.style.transform='scale(1.2)';" onmouseout="this.style.transform='scale(1)';">
                <span>${iconEmoji}</span>
            </div>
        `,
        className: '',
        iconSize: [m.size, m.size],
        iconAnchor: [m.size / 2, m.size / 2],
        popupAnchor: [0, -m.size / 2 - 2]
    });
};

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
        rawData?: any,
        draggable?: boolean,
        onDragEnd?: (lat: number, lng: number) => void
    }[];
    onMapClick?: (lat: number, lng: number) => void;
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
    showHQ?: boolean;
    showHoldingFacilities?: boolean;
    showConnectingLine?: boolean;
    onRouteCalculated?: (distanceMeters: number) => void;
    polylines?: {
        positions: [number, number][];
        color?: string;
        weight?: number;
        dashArray?: string;
        opacity?: number;
    }[];
    showPopups?: boolean;
    showReturnToSelera?: boolean;
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

// Internal component to handle container resize & initial map layout invalidation
const MapResizeHandler = () => {
    const map = useMap();
    useEffect(() => {
        map.invalidateSize();

        const t1 = setTimeout(() => map.invalidateSize(), 100);
        const t2 = setTimeout(() => map.invalidateSize(), 300);
        const t3 = setTimeout(() => map.invalidateSize(), 600);

        const container = map.getContainer();
        let observer: ResizeObserver | null = null;
        if (typeof ResizeObserver !== 'undefined' && container) {
            observer = new ResizeObserver(() => {
                map.invalidateSize();
            });
            observer.observe(container);
        }

        return () => {
            clearTimeout(t1);
            clearTimeout(t2);
            clearTimeout(t3);
            if (observer) {
                observer.disconnect();
            }
        };
    }, [map]);
    return null;
};

// Internal component to handle click-to-pinpoint and zoom events on map
const MapEventsHandler = ({ 
    onLocationChange, 
    onMapClick,
    onZoomChange
}: { 
    onLocationChange?: (lat: number, lng: number) => void;
    onMapClick?: (lat: number, lng: number) => void;
    onZoomChange?: (zoom: number) => void;
}) => {
    useMapEvents({
        click(e) {
            if (e.originalEvent?.target && typeof (e.originalEvent.target as any).blur === 'function') {
                (e.originalEvent.target as any).blur();
            }
            if (onMapClick) {
                onMapClick(e.latlng.lat, e.latlng.lng);
            }
            if (onLocationChange) {
                onLocationChange(e.latlng.lat, e.latlng.lng);
            }
        },
        zoom(e) {
            if (onZoomChange) {
                onZoomChange(Math.round(e.target.getZoom()));
            }
        },
        zoomend(e) {
            if (onZoomChange) {
                onZoomChange(Math.round(e.target.getZoom()));
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
    showLandmarks = true,
    showHQ = true,
    showHoldingFacilities = true,
    showConnectingLine = false,
    onRouteCalculated,
    polylines = [],
    onMapClick,
    showPopups = true,
    showReturnToSelera = true
}: MapComponentProps) => {
    const navigate = useNavigate();
    const [selectedReportMarker, setSelectedReportMarker] = useState<any>(null);
    const SELERA_BOUNDS: [number, number][] = [
        [14.801496, 121.005174],
        [14.799577, 121.003911],
        [14.800634, 121.002228],
        [14.802461, 121.003280]
    ];

    const [dbLandmarks, setDbLandmarks] = useState<any[]>([]);
    const [barangayHQ, setBarangayHQ] = useState<any>(null);
    const [currentZoom, setCurrentZoom] = useState<number>(zoom || 14);

    useEffect(() => {
        if (typeof zoom === 'number' && zoom !== currentZoom) {
            setCurrentZoom(zoom);
        }
    }, [zoom]);

    // Deconflict coordinates: apply subtle micro-offset if multiple landmarks share nearly identical coordinates
    const deconflictedLandmarks = useMemo(() => {
        if (!dbLandmarks || dbLandmarks.length === 0) return [];
        const coordCounts: Record<string, number> = {};
        return dbLandmarks.map((lm: any) => {
            const rawLat = parseFloat(lm.latitude);
            const rawLng = parseFloat(lm.longitude);
            if (isNaN(rawLat) || isNaN(rawLng)) return lm;

            const key = `${rawLat.toFixed(4)}_${rawLng.toFixed(4)}`;
            const count = coordCounts[key] || 0;
            coordCounts[key] = count + 1;

            if (count === 0) {
                return { ...lm, lat: rawLat, lng: rawLng };
            }

            // Radial deconflict offset (~6-8 meters)
            const angle = (count * 60) * (Math.PI / 180);
            const offsetLat = Math.sin(angle) * 0.00007;
            const offsetLng = Math.cos(angle) * 0.00007;
            return {
                ...lm,
                lat: rawLat + offsetLat,
                lng: rawLng + offsetLng
            };
        });
    }, [dbLandmarks]);

    useEffect(() => {
        let isMounted = true;
        const fetchFeatures = async () => {
            try {
                const lmkRes = await axios.get('http://localhost:8000/landmarks');
                if (isMounted && Array.isArray(lmkRes.data)) {
                    setDbLandmarks(lmkRes.data);
                }
            } catch (err) {
                console.warn("Could not load dynamic landmarks:", err);
            }

            try {
                const hqRes = await axios.get('http://localhost:8000/landmarks/barangay/1/hq');
                if (isMounted && hqRes.data && hqRes.data.hq_lat && hqRes.data.hq_lng) {
                    setBarangayHQ(hqRes.data);
                } else if (isMounted) {
                    setBarangayHQ({
                        barangay_name: 'San Vicente',
                        city: 'Santa Maria',
                        contact_no: '(044) 123-4567',
                        hq_lat: 14.8069,
                        hq_lng: 121.0039,
                    });
                }
            } catch (err) {
                if (isMounted) {
                    setBarangayHQ({
                        barangay_name: 'San Vicente',
                        city: 'Santa Maria',
                        contact_no: '(044) 123-4567',
                        hq_lat: 14.8069,
                        hq_lng: 121.0039,
                    });
                }
            }
        };

        fetchFeatures();
        return () => {
            isMounted = false;
        };
    }, []);

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
        <div style={{ position: 'relative', width: '100%', height: height || '100%', minHeight: '340px' }} className="w-full h-full min-h-[340px] overflow-hidden">
            <MapContainer
                center={center}
                zoom={zoom}
                scrollWheelZoom={false}
                style={{ height: '100%', width: '100%', minHeight: '340px', position: 'relative', zIndex: 1 }}
                className="w-full h-full min-h-[340px]"
            >
                <MapResizeHandler />
                <ChangeView center={center} zoom={zoom} />
                <MapEventsHandler 
                    onLocationChange={onLocationChange} 
                    onMapClick={(lat, lng) => {
                        setSelectedReportMarker(null);
                        if (onMapClick) onMapClick(lat, lng);
                    }} 
                    onZoomChange={setCurrentZoom} 
                />
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
                            fillOpacity: 0.12,
                            weight: 2.5,
                            dashArray: '6, 8',
                            className: 'outline-none focus:outline-none'
                        }}
                        eventHandlers={{
                            click: (e) => {
                                if (e.originalEvent?.target && typeof (e.originalEvent.target as any).blur === 'function') {
                                    (e.originalEvent.target as any).blur();
                                }
                                if (onMapClick) onMapClick(e.latlng.lat, e.latlng.lng);
                                if (onLocationChange) onLocationChange(e.latlng.lat, e.latlng.lng);
                            }
                        }}
                    >
                        <Tooltip sticky direction="top" className="custom-hover-tooltip">
                            <span>Selera Homes Reporting Zone</span>
                        </Tooltip>
                    </Polygon>
                )}

                {/* ── Official Barangay Headquarters Marker (Admin Configured) ── */}
                {showHQ && barangayHQ && barangayHQ.hq_lat && barangayHQ.hq_lng && (
                    <Marker
                        position={[parseFloat(barangayHQ.hq_lat), parseFloat(barangayHQ.hq_lng)]}
                        icon={createBarangayHQIcon(currentZoom)}
                    >
                        <Tooltip direction="top" offset={[0, -Math.round(getLandmarkZoomMetrics(currentZoom).size / 2) - 4]} className="custom-hover-tooltip">
                            <span>🏛️ Barangay {barangayHQ.barangay_name || 'San Vicente'} Operations HQ</span>
                        </Tooltip>
                        {showPopups && (
                            <Popup className="custom-popup">
                                <div className="p-3 w-[220px] text-gray-800 flex flex-col gap-1.5">
                                    <div className="flex items-center gap-2 pb-1.5 border-b border-blue-100">
                                        <span className="w-8 h-8 rounded-xl bg-blue-600 text-white flex items-center justify-center text-base shadow-xs">
                                            🏛️
                                        </span>
                                        <div>
                                            <p className="text-[11px] font-black text-blue-950 uppercase tracking-tight">Barangay {barangayHQ.barangay_name || 'San Vicente'} HQ</p>
                                            <p className="text-[8px] font-bold text-blue-600 uppercase tracking-wider">Operations & Dispatch Center</p>
                                        </div>
                                    </div>
                                    <div className="text-[10px] space-y-1 text-gray-600">
                                        <p><span className="font-bold text-gray-800">City:</span> {barangayHQ.city || 'Santa Maria, Bulacan'}</p>
                                        {barangayHQ.contact_no && <p><span className="font-bold text-gray-800">Contact:</span> {barangayHQ.contact_no}</p>}
                                        {barangayHQ.hq_plus_code && <p><span className="font-bold text-gray-800">Plus Code:</span> {barangayHQ.hq_plus_code}</p>}
                                    </div>
                                    <div className="mt-1 pt-1.5 border-t border-gray-100 flex items-center justify-between text-[8px] text-gray-400 font-bold uppercase">
                                        <span>Official Station</span>
                                        <span className="text-blue-600">Active</span>
                                    </div>
                                </div>
                            </Popup>
                        )}
                    </Marker>
                )}

                {/* ── Registered Holding Facilities & Community Landmarks (Database) ── */}
                {deconflictedLandmarks && deconflictedLandmarks.length > 0 && (
                    deconflictedLandmarks.map((lm: any) => {
                        const lmLat = lm.lat;
                        const lmLng = lm.lng;
                        const isHolding = Boolean(lm.is_holding_facility);

                        const hasOverlappingReportMarker = markers.some(m =>
                            (Math.abs(m.lat - lmLat) < 0.0006 && Math.abs(m.lng - lmLng) < 0.0006) ||
                            (m.rawData?.facility_id && m.rawData.facility_id === lm.landmark_id) ||
                            (m.category === 'Holding Facility' && isHolding)
                        );
                        if (hasOverlappingReportMarker) {
                            return null;
                        }

                        if (isHolding && !showHoldingFacilities) return null;
                        if (!isHolding && !showLandmarks) return null;

                        const iconToUse = isHolding
                            ? createHoldingFacilityPinIcon(lm.name, currentZoom)
                            : createLandmarkPinIcon(lm.category, false, currentZoom);

                        return (
                            <Marker
                                key={`db-lm-${lm.landmark_id}`}
                                position={[lmLat, lmLng]}
                                icon={iconToUse}
                                eventHandlers={{
                                    click: () => {
                                        if (onLocationChange) onLocationChange(lmLat, lmLng);
                                        if (onMapClick) onMapClick(lmLat, lmLng);
                                    }
                                }}
                            >
                                <Tooltip direction="top" offset={[0, -Math.round(getLandmarkZoomMetrics(currentZoom).size / 2) - 4]} className="custom-hover-tooltip">
                                    <span>{isHolding ? '🐾' : '📍'} {lm.name}</span>
                                </Tooltip>
                            </Marker>
                        );
                    })
                )}

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

                {markers.map((marker) => {
                    const isUserLoc = marker.category === 'User Location' || marker.category === 'Operator';
                    const isHoldingFacility = marker.category === 'Holding Facility' || marker.category === 'Facility Holding' || marker.category === 'Secured Facility';
                    const isInitialSighting = marker.category === 'Initial Sighting' || marker.category === 'Found Location' || marker.category === 'Original Sighting';

                    if (isInitialSighting) {
                        const overlapsOtherMarker = markers.some(m =>
                            m !== marker &&
                            m.category !== 'Initial Sighting' &&
                            m.category !== 'Found Location' &&
                            Math.abs(m.lat - marker.lat) < 0.0001 &&
                            Math.abs(m.lng - marker.lng) < 0.0001
                        );
                        if (overlapsOtherMarker) return null;
                    }

                    const animalTypeStr = marker.rawData?.animal_type || marker.rawData?.animalType || marker.rawData?.pet_type || marker.rawData?.report?.animal_type || marker.category || '';
                    const facilityNameStr = marker.rawData?.facility?.name || marker.rawData?.facility_name || (marker.title ? marker.title.replace(/^Secured:\s*/i, '') : 'HOLDING FACILITY');
                    const petImage = marker.rawData?.media?.[0]?.file_url || marker.rawData?.image_url || marker.rawData?.media?.[0]?.url;

                    let lmIcon = '🐾';
                    if (marker.rawData?.facility?.category) {
                        const cat = getLandmarkCategory(marker.rawData.facility.category, true);
                        lmIcon = cat.emoji || '🐾';
                    } else if (marker.rawData?.facility?.icon) {
                        lmIcon = marker.rawData.facility.icon;
                    } else {
                        const targetName = (marker.rawData?.facility?.name || marker.rawData?.landmark || marker.title || '').toLowerCase();
                        const foundLm = dbLandmarks.find((l: any) =>
                            (l.name && targetName.includes(l.name.toLowerCase())) ||
                            (l.name && l.name.toLowerCase().includes(targetName)) ||
                            (marker.rawData?.facility_id && l.landmark_id === marker.rawData.facility_id)
                        );
                        if (foundLm) {
                            const cat = getLandmarkCategory(foundLm.category, Boolean(foundLm.is_holding_facility));
                            lmIcon = cat.emoji || '🐾';
                        } else {
                            const preset = PRESET_LANDMARKS.find(p => targetName.includes(p.name.toLowerCase()) || targetName.includes(p.id.toLowerCase()));
                            if (preset) {
                                lmIcon = preset.icon;
                            }
                        }
                    }

                    return (
                        <Marker
                            key={marker.id}
                            position={[marker.lat, marker.lng]}
                            draggable={Boolean(marker.draggable)}
                            icon={
                                marker.category === 'Selected Location' ? createSelectedPinIcon() :
                                (marker.category === 'Barangay Office' || marker.category === 'HQ') ? createBarangayHQIcon(currentZoom) :
                                    isUserLoc ? createUserLocationIcon() :
                                        isHoldingFacility ? createFacilityHoldingIcon(animalTypeStr, facilityNameStr, petImage, lmIcon, currentZoom) :
                                            isInitialSighting ? InitialSightingIcon :
                                                marker.color ? createColoredIncidentIcon(marker.color, animalTypeStr || marker.category) : IncidentIcon
                            }
                            eventHandlers={{
                                click: () => {
                                    setSelectedReportMarker(marker);
                                    if (onMarkerClick) onMarkerClick(marker);
                                },
                                popupopen: () => {
                                    setSelectedReportMarker(marker);
                                    if (onMarkerClick) onMarkerClick(marker);
                                },
                                dragend: (e: any) => {
                                    if (marker.onDragEnd) {
                                        const coords = e.target.getLatLng();
                                        marker.onDragEnd(coords.lat, coords.lng);
                                    }
                                }
                            }}
                        >
                            {marker.title && !isHoldingFacility && (
                                <Tooltip 
                                    direction="top" 
                                    offset={[0, isUserLoc ? -12 : -32]} 
                                    opacity={1}
                                    className="custom-hover-tooltip"
                                >
                                    <div className="flex items-center gap-1.5 font-black text-[9px] uppercase tracking-wider">
                                        <span>📍</span>
                                        <span>{marker.title}</span>
                                    </div>
                                </Tooltip>
                            )}
                            {!isUserLoc && !isHoldingFacility && showPopups && (
                                <Popup className="custom-popup">
                                    <div className="p-3 w-[250px] text-gray-800 flex flex-col gap-2 select-none">
                                        <div className="flex items-center justify-between gap-1.5 pb-1 border-b border-gray-100">
                                            <span className="font-black text-gray-900 text-xs">#{marker.id.toString().padStart(4, '0')}</span>
                                            <span className={`text-[8px] font-black uppercase px-2 py-0.5 rounded-full ${marker.priority === 'High' ? 'bg-red-50 text-red-600 border border-red-200' : 'bg-amber-50 text-amber-600 border border-amber-200'}`}>
                                                {marker.priority || 'Medium'}
                                            </span>
                                        </div>
                                        <p className="text-[11px] font-bold text-gray-800 line-clamp-2">{marker.title}</p>
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                if (onViewDetails) {
                                                    onViewDetails(marker);
                                                } else {
                                                    const rId = marker.rawData?.report_id || (marker.id > 0 ? marker.id : null);
                                                    if (rId) navigate(`/subd/reports/${rId}`);
                                                }
                                            }}
                                            className="w-full py-1.5 bg-[#F97316] hover:bg-[#EA580C] text-white text-[9px] font-black uppercase rounded-xl transition-all text-center cursor-pointer"
                                        >
                                            View Report Card
                                        </button>
                                    </div>
                                </Popup>
                            )}
                        </Marker>
                    );
                })}

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

                {showHeatmap && heatmapPoints && heatmapPoints.length > 0 && (
                    <HeatmapLayer points={heatmapPoints} />
                )}

                {showReturnToSelera && <ReturnToSeleraButton />}
            </MapContainer>

            {/* ─── FLOATING REPORT INFO CARD OVERLAY (Appears when clicking any report pin) ─── */}
            {selectedReportMarker && (selectedReportMarker.rawData || selectedReportMarker.id > 0) && (
                <div className="absolute bottom-3 left-3 right-3 sm:left-auto sm:right-4 sm:bottom-4 sm:w-[380px] z-[1000] bg-white/95 backdrop-blur-md rounded-3xl shadow-2xl border border-slate-200/90 p-3.5 sm:p-4.5 flex flex-col gap-2.5 animate-in fade-in slide-in-from-bottom-4 duration-200">
                    {/* Header Row */}
                    <div className="flex items-center justify-between gap-2 pb-2 border-b border-slate-100">
                        <div className="flex items-center gap-2 min-w-0">
                            <span className="w-7 h-7 rounded-xl bg-orange-50 text-orange-500 flex items-center justify-center text-sm font-black shrink-0 border border-orange-100">
                                {(selectedReportMarker.rawData?.animal_type || selectedReportMarker.category || '').toLowerCase().includes('cat') ? '🐱' : '🐶'}
                            </span>
                            <div className="min-w-0">
                                <div className="flex items-center gap-1.5 flex-wrap">
                                    <span className="text-xs font-black text-slate-900 leading-none">
                                        Report #{selectedReportMarker.id.toString().padStart(4, '0')}
                                    </span>
                                    <span className={`px-2 py-0.5 rounded-full text-[8px] font-black uppercase tracking-wider ${
                                        (selectedReportMarker.priority || selectedReportMarker.rawData?.priority_level || '').toLowerCase() === 'high'
                                            ? 'bg-rose-50 text-rose-600 border border-rose-200'
                                            : 'bg-amber-50 text-amber-600 border border-amber-200'
                                    }`}>
                                        {selectedReportMarker.priority || selectedReportMarker.rawData?.priority_level || 'Medium'} Priority
                                    </span>
                                </div>
                            </div>
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0">
                            <span className={`px-2 py-0.5 rounded-full text-[8px] font-black uppercase tracking-wider ${
                                selectedReportMarker.rawData?.status_id === 2 || selectedReportMarker.rawData?.is_verified
                                    ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                    : 'bg-amber-50 text-amber-700 border border-amber-200'
                            }`}>
                                {selectedReportMarker.rawData?.statusName || selectedReportMarker.rawData?.status?.status_name || 'Under Review'}
                            </span>
                            <button
                                type="button"
                                onClick={() => setSelectedReportMarker(null)}
                                className="w-6 h-6 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 flex items-center justify-center text-xs font-bold transition-colors cursor-pointer"
                                title="Close"
                            >
                                ✕
                            </button>
                        </div>
                    </div>

                    {/* Body: Thumbnail & Details */}
                    <div className="flex items-start gap-3">
                        <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl overflow-hidden bg-slate-100 border border-slate-100 shrink-0 shadow-2xs">
                            <img
                                src={selectedReportMarker.rawData?.media?.[0]?.file_url || selectedReportMarker.rawData?.image_url || selectedReportMarker.rawData?.sighting_photo || selectedReportMarker.rawData?.pet?.photo_url || DEFAULT_PET_AVATAR}
                                alt="Report Sighting"
                                className="w-full h-full object-cover"
                                onError={(e) => { e.currentTarget.src = DEFAULT_AVATAR; }}
                            />
                        </div>

                        <div className="flex-1 min-w-0 flex flex-col gap-1">
                            <h4 className="text-xs sm:text-sm font-black text-slate-900 truncate leading-tight">
                                {selectedReportMarker.rawData?.category_name || selectedReportMarker.rawData?.category || selectedReportMarker.title || 'Stray Animal Sighting'}
                            </h4>
                            
                            <p className="text-[10px] font-bold text-slate-600 truncate flex items-center gap-1">
                                <span>🐾</span>
                                <span>{(selectedReportMarker.rawData?.animal_type || selectedReportMarker.category || 'Dog').toUpperCase()}</span>
                                {selectedReportMarker.rawData?.animal_breed && selectedReportMarker.rawData.animal_breed.toLowerCase() !== 'unknown' && (
                                    <span>• {selectedReportMarker.rawData.animal_breed}</span>
                                )}
                                {selectedReportMarker.rawData?.animal_color && selectedReportMarker.rawData.animal_color.toLowerCase() !== 'unknown' && (
                                    <span>• {selectedReportMarker.rawData.animal_color}</span>
                                )}
                            </p>

                            <p className="text-[10px] font-semibold text-slate-500 truncate flex items-center gap-1">
                                <span className="text-rose-500">📍</span>
                                <span>{selectedReportMarker.rawData?.landmark || selectedReportMarker.rawData?.location_address || selectedReportMarker.title || 'Selera Homes'}</span>
                            </p>

                            <p className="text-[9px] text-slate-400 font-medium truncate flex items-center gap-1">
                                <span>🕒 {selectedReportMarker.time || 'Recently'}</span>
                                <span>• 👤 {selectedReportMarker.rawData?.reporterName || selectedReportMarker.rawData?.reporter_name || 'Citizen'}</span>
                            </p>
                        </div>
                    </div>

                    {/* Observed Conditions / Tags */}
                    {selectedReportMarker.rawData?.observed_conditions && (
                        <div className="flex flex-wrap gap-1">
                            {(Array.isArray(selectedReportMarker.rawData.observed_conditions) 
                                ? selectedReportMarker.rawData.observed_conditions 
                                : [selectedReportMarker.rawData.observed_conditions]
                            ).map((cond: string, idx: number) => (
                                <span key={idx} className="px-2 py-0.5 rounded-md bg-orange-50 text-[#F97316] text-[8px] font-bold border border-orange-100">
                                    {cond}
                                </span>
                            ))}
                        </div>
                    )}

                    {/* Action Button */}
                    <button
                        type="button"
                        onClick={() => {
                            if (onViewDetails) {
                                onViewDetails(selectedReportMarker);
                            } else {
                                const rId = selectedReportMarker.rawData?.report_id || (selectedReportMarker.id > 0 ? selectedReportMarker.id : null);
                                if (rId) navigate(`/subd/reports/${rId}`);
                            }
                        }}
                        className="w-full py-2.5 bg-[#F97316] hover:bg-[#EA580C] text-white text-xs font-black uppercase tracking-wider rounded-2xl shadow-sm transition-all flex items-center justify-center gap-2 cursor-pointer active:scale-[0.98]"
                    >
                        <span>View Full Report Details</span>
                        <svg className="w-3.5 h-3.5 stroke-[2.5]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M14 5l7 7m0 0l-7 7m7-7H3" />
                        </svg>
                    </button>
                </div>
            )}
        </div>
    );
};

export default MapComponent;

