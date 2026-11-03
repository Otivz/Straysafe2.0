import { useState } from 'react';
import { fmtCoord } from '../../utils/placeName';

/** A pin's place name, latitude and longitude (6 decimals), with a button to copy the coordinates. */
export default function PinLocationInfo({ name, latitude, longitude, looking = false, compact = false }: {
    name: string | null | undefined;
    latitude: number | string;
    longitude: number | string;
    looking?: boolean;
    compact?: boolean;
}) {
    const [copied, setCopied] = useState(false);
    const lat = fmtCoord(latitude);
    const lng = fmtCoord(longitude);
    const copy = () => {
        navigator.clipboard?.writeText(`${lat}, ${lng}`).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); }).catch(() => undefined);
    };
    const text = compact ? 'text-xs' : 'text-sm';
    return (
        <div className={`space-y-0.5 ${text}`} data-testid="pin-location-info">
            <p><strong>Location:</strong> {name || (looking ? 'Finding the place name…' : 'No place name found for this point (coordinates below)')}</p>
            <p><strong>Latitude:</strong> <span className="font-mono select-all" data-testid="pin-latitude">{lat}</span></p>
            <p><strong>Longitude:</strong> <span className="font-mono select-all" data-testid="pin-longitude">{lng}</span></p>
            <button type="button" onClick={copy} className="text-[11px] font-bold text-role hover:underline" aria-label="Copy coordinates">
                {copied ? 'Copied' : 'Copy coordinates'}
            </button>
        </div>
    );
}
