import L from 'leaflet';

export interface LandmarkCategory {
    id: string;
    label: string;
    emoji: string;
    color: string;
    borderColor: string;
    bgColor: string;
    badgeBg: string;
    badgeText: string;
}

export const LANDMARK_CATEGORIES: LandmarkCategory[] = [
    {
        id: 'office',
        label: 'HOA Office / Admin',
        emoji: '🏢',
        color: '#2563eb',
        borderColor: '#93c5fd',
        bgColor: '#eff6ff',
        badgeBg: 'bg-blue-100',
        badgeText: 'text-blue-800'
    },
    {
        id: 'court',
        label: 'Basketball Court / Gym',
        emoji: '🏀',
        color: '#d97706',
        borderColor: '#fcd34d',
        bgColor: '#fffbeb',
        badgeBg: 'bg-amber-100',
        badgeText: 'text-amber-800'
    },
    {
        id: 'facility',
        label: 'Holding Facility / Pen',
        emoji: '🐾',
        color: '#059669',
        borderColor: '#6ee7b7',
        bgColor: '#ecfdf5',
        badgeBg: 'bg-emerald-100',
        badgeText: 'text-emerald-800'
    },
    {
        id: 'gate',
        label: 'Entrance Gate / Guardhouse',
        emoji: '🚪',
        color: '#9333ea',
        borderColor: '#d8b4fe',
        bgColor: '#faf5ff',
        badgeBg: 'bg-purple-100',
        badgeText: 'text-purple-800'
    },
    {
        id: 'park',
        label: 'Park / Playground',
        emoji: '🌳',
        color: '#16a34a',
        borderColor: '#86efac',
        bgColor: '#f0fdf4',
        badgeBg: 'bg-green-100',
        badgeText: 'text-green-800'
    },
    {
        id: 'chapel',
        label: 'Chapel / Place of Worship',
        emoji: '⛪',
        color: '#4f46e5',
        borderColor: '#a5b4fc',
        bgColor: '#eef2ff',
        badgeBg: 'bg-indigo-100',
        badgeText: 'text-indigo-800'
    },
    {
        id: 'clinic',
        label: 'Health Center / Clinic',
        emoji: '🏥',
        color: '#e11d48',
        borderColor: '#fda4af',
        bgColor: '#fff1f2',
        badgeBg: 'bg-rose-100',
        badgeText: 'text-rose-800'
    },
    {
        id: 'store',
        label: 'Store / Market',
        emoji: '🛒',
        color: '#0d9488',
        borderColor: '#5eead4',
        bgColor: '#f0fdfa',
        badgeBg: 'bg-teal-100',
        badgeText: 'text-teal-800'
    },
    {
        id: 'general',
        label: 'General Landmark',
        emoji: '📍',
        color: '#ea580c',
        borderColor: '#fdba74',
        bgColor: '#fff7ed',
        badgeBg: 'bg-orange-100',
        badgeText: 'text-orange-800'
    }
];

export const getLandmarkCategory = (category?: string, isHolding?: boolean): LandmarkCategory => {
    if (isHolding && (!category || category === 'general')) {
        return LANDMARK_CATEGORIES.find(c => c.id === 'facility') || LANDMARK_CATEGORIES[0];
    }
    const found = LANDMARK_CATEGORIES.find(c => c.id === category);
    return found || LANDMARK_CATEGORIES[LANDMARK_CATEGORIES.length - 1]; // general
};

export interface LandmarkZoomMetrics {
    size: number;
    font: number;
    border: number;
    shadow: string;
    showBadge: boolean;
}

export const getLandmarkZoomMetrics = (zoom: number = 16): LandmarkZoomMetrics => {
    if (zoom <= 12) {
        return { size: 14, font: 8, border: 1.5, shadow: '0 1px 3px rgba(0,0,0,0.2)', showBadge: false };
    }
    if (zoom === 13) {
        return { size: 18, font: 10, border: 1.5, shadow: '0 2px 5px rgba(0,0,0,0.22)', showBadge: false };
    }
    if (zoom === 14) {
        return { size: 22, font: 12, border: 1.5, shadow: '0 2px 6px rgba(0,0,0,0.25)', showBadge: false };
    }
    if (zoom === 15) {
        return { size: 26, font: 14, border: 2, shadow: '0 3px 8px rgba(0,0,0,0.25)', showBadge: false };
    }
    if (zoom === 16) {
        return { size: 30, font: 16, border: 2, shadow: '0 3px 10px rgba(0,0,0,0.28)', showBadge: false };
    }
    if (zoom === 17) {
        return { size: 34, font: 18, border: 2.5, shadow: '0 4px 12px rgba(0,0,0,0.3)', showBadge: true };
    }
    return { size: 38, font: 20, border: 2.5, shadow: '0 4px 14px rgba(0,0,0,0.35)', showBadge: true };
};

export const createBarangayHQIcon = (zoom: number = 16) => {
    const m = getLandmarkZoomMetrics(zoom);

    if (m.showBadge) {
        const pinSize = m.size + 4;
        return L.divIcon({
            className: 'custom-hq-pin',
            html: `
                <div style="position: relative; display: flex; flex-direction: column; align-items: center; cursor: pointer; transition: transform 0.15s ease-in-out;" onmouseover="this.style.transform='scale(1.1)';" onmouseout="this.style.transform='scale(1)';">
                    <div style="
                        width: ${pinSize}px;
                        height: ${pinSize}px;
                        border-radius: 50%;
                        background: #2563EB;
                        border: ${m.border}px solid white;
                        box-shadow: 0 4px 14px rgba(37,99,235,0.45);
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        color: white;
                        font-size: ${m.font + 2}px;
                    ">
                        <span>🏛️</span>
                    </div>
                    <div style="
                        background: #1D4ED8;
                        color: white;
                        font-size: 7.5px;
                        font-weight: 900;
                        padding: 1.5px 5px;
                        border-radius: 4px;
                        text-transform: uppercase;
                        letter-spacing: 0.08em;
                        margin-top: 2px;
                        box-shadow: 0 2px 6px rgba(0,0,0,0.25);
                        white-space: nowrap;
                        border: 1px solid white;
                    ">BARANGAY HQ</div>
                </div>
            `,
            iconSize: [64, pinSize + 22],
            iconAnchor: [32, pinSize / 2],
            popupAnchor: [0, -(pinSize / 2) - 4]
        });
    }

    const pinSize = m.size + 2;
    return L.divIcon({
        className: 'custom-hq-pin',
        html: `
            <div style="
                display: flex;
                align-items: center;
                justify-content: center;
                width: ${pinSize}px;
                height: ${pinSize}px;
                border-radius: 50%;
                background: #2563EB;
                border: ${m.border}px solid white;
                box-shadow: 0 3px 10px rgba(37,99,235,0.45);
                color: white;
                font-size: ${m.font + 1}px;
                cursor: pointer;
                transition: transform 0.15s ease-in-out;
            " onmouseover="this.style.transform='scale(1.2)';" onmouseout="this.style.transform='scale(1)';">
                <span>🏛️</span>
            </div>
        `,
        iconSize: [pinSize, pinSize],
        iconAnchor: [pinSize / 2, pinSize / 2],
        popupAnchor: [0, -(pinSize / 2) - 2]
    });
};

export const createHoldingFacilityPinIcon = (_name?: string, zoom: number = 16) => {
    const m = getLandmarkZoomMetrics(zoom);

    if (m.showBadge) {
        return L.divIcon({
            className: 'custom-facility-pin',
            html: `
                <div style="position: relative; display: flex; flex-direction: column; align-items: center; cursor: pointer; transition: transform 0.15s ease-in-out;" onmouseover="this.style.transform='scale(1.1)';" onmouseout="this.style.transform='scale(1)';">
                    <div style="
                        width: ${m.size}px;
                        height: ${m.size}px;
                        border-radius: 50%;
                        background: #FFFFFF;
                        border: ${m.border}px solid #059669;
                        box-shadow: ${m.shadow};
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        font-size: ${m.font}px;
                    ">
                        <span>🐾</span>
                    </div>
                    <div style="
                        background: #FFFFFF;
                        color: #065F46;
                        font-size: 7.5px;
                        font-weight: 900;
                        padding: 1.5px 5px;
                        border-radius: 4px;
                        text-transform: uppercase;
                        letter-spacing: 0.05em;
                        margin-top: 2px;
                        box-shadow: 0 2px 6px rgba(0,0,0,0.12);
                        white-space: nowrap;
                        border: 1px solid #059669;
                    ">HOLDING FACILITY</div>
                </div>
            `,
            iconSize: [64, m.size + 20],
            iconAnchor: [32, m.size / 2],
            popupAnchor: [0, -(m.size / 2) - 4]
        });
    }

    return L.divIcon({
        className: 'custom-facility-pin',
        html: `
            <div style="
                display: flex;
                align-items: center;
                justify-content: center;
                width: ${m.size}px;
                height: ${m.size}px;
                border-radius: 50%;
                background: #FFFFFF;
                border: ${m.border}px solid #059669;
                box-shadow: ${m.shadow}, 0 0 0 ${m.border}px #6ee7b7;
                font-size: ${m.font}px;
                cursor: pointer;
                transition: transform 0.15s ease-in-out;
            " onmouseover="this.style.transform='scale(1.2)';" onmouseout="this.style.transform='scale(1)';">
                <span>🐾</span>
            </div>
        `,
        iconSize: [m.size, m.size],
        iconAnchor: [m.size / 2, m.size / 2],
        popupAnchor: [0, -(m.size / 2) - 2]
    });
};

export const createLandmarkPinIcon = (category?: string, isHolding?: boolean, zoom: number = 16) => {
    const cat = getLandmarkCategory(category, isHolding);
    const m = getLandmarkZoomMetrics(zoom);

    return L.divIcon({
        className: 'custom-landmark-pin',
        html: `
            <div style="
                display: flex;
                align-items: center;
                justify-content: center;
                width: ${m.size}px;
                height: ${m.size}px;
                border-radius: 50%;
                background: white;
                box-shadow: ${m.shadow}, 0 0 0 ${m.border}px ${cat.color};
                border: ${m.border}px solid white;
                font-size: ${m.font}px;
                cursor: pointer;
                transition: transform 0.15s ease-in-out, width 0.15s ease, height 0.15s ease;
            " onmouseover="this.style.transform='scale(1.2)';" onmouseout="this.style.transform='scale(1)';">
                <span>${cat.emoji}</span>
            </div>
        `,
        iconSize: [m.size, m.size],
        iconAnchor: [m.size / 2, m.size / 2],
        popupAnchor: [0, -(m.size / 2) - 2]
    });
};


