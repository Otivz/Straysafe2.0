import { useEffect } from 'react';
import { useMap } from 'react-leaflet';

/**
 * Re-measures the map whenever its box changes size (a tab, drawer or modal opening),
 * so Leaflet doesn't leave grey, unloaded tiles.
 */
const MapAutoResize = () => {
    const map = useMap();

    useEffect(() => {
        const container = map.getContainer();
        const refresh = () => map.invalidateSize();
        const first = window.setTimeout(refresh, 150);
        if (typeof ResizeObserver === 'undefined') return () => window.clearTimeout(first);
        const observer = new ResizeObserver(() => refresh());
        observer.observe(container);
        return () => {
            window.clearTimeout(first);
            observer.disconnect();
        };
    }, [map]);

    return null;
};

export default MapAutoResize;
