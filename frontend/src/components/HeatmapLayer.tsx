import { useEffect, useRef, useCallback } from 'react';
import { useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet.heat';

interface HeatmapLayerProps {
    points: [number, number, number][]; // [lat, lng, intensity]
    options?: L.HeatMapOptions;
}

const HeatmapLayer = ({ points, options }: HeatmapLayerProps) => {
    const map = useMap();
    const heatLayerRef = useRef<any>(null);

    // Sanitize points to prevent NaN/invalid coordinates
    const validPoints = (points || []).filter(
        p => Array.isArray(p) && p.length >= 2 &&
             typeof p[0] === 'number' && !isNaN(p[0]) && isFinite(p[0]) &&
             typeof p[1] === 'number' && !isNaN(p[1]) && isFinite(p[1])
    );

    const safeReset = useCallback(() => {
        if (!map || !heatLayerRef.current) return;
        const layer = heatLayerRef.current as any;
        if (!layer._map) return;
        const size = map.getSize();
        if (!size || size.x <= 0 || size.y <= 0) return;

        try {
            const topLeft = map.containerPointToLayerPoint([0, 0]);
            if (layer._canvas) {
                L.DomUtil.setPosition(layer._canvas, topLeft);
                if (layer._canvas.width !== size.x || layer._canvas.height !== size.y) {
                    layer._canvas.width = size.x;
                    layer._canvas.height = size.y;
                }
                if (layer._heat) {
                    layer._heat._width = size.x;
                    layer._heat._height = size.y;
                }
            }
            if (typeof layer._redraw === 'function') {
                layer._redraw();
            }
        } catch (err) {
            console.warn('Heatmap safeReset error:', err);
        }
    }, [map]);

    useEffect(() => {
        if (!map) return;

        try {
            // @ts-ignore - heatLayer is added to L by the leaflet.heat plugin
            const layer = L.heatLayer(validPoints, {
                radius: 28,
                blur: 18,
                maxZoom: 17,
                gradient: {
                    0.4: '#3B82F6',
                    0.6: '#06B6D4',
                    0.7: '#10B981',
                    0.8: '#F59E0B',
                    1.0: '#EF4444'
                },
                ...options
            });

            if (layer) {
                const anyLayer = layer as any;

                // Guard _redraw against 0 height canvas IndexSizeError
                const origRedraw = anyLayer._redraw;
                if (typeof origRedraw === 'function') {
                    anyLayer._redraw = function (this: any) {
                        if (!this._map) return;
                        const size = this._map.getSize();
                        if (!size || size.x <= 0 || size.y <= 0) return;
                        if (!this._canvas || this._canvas.width <= 0 || this._canvas.height <= 0) return;
                        try {
                            origRedraw.call(this);
                        } catch (e) {
                            console.warn('leaflet-heat redraw suppressed:', e);
                        }
                    };
                }

                layer.addTo(map);
                heatLayerRef.current = layer;
                safeReset();
            }
        } catch (err) {
            console.warn('Failed to initialize HeatmapLayer:', err);
        }

        // Attach listeners to keep heatmap strictly pinned to the map coordinates on every map action
        map.on('move', safeReset);
        map.on('moveend', safeReset);
        map.on('zoomend', safeReset);
        map.on('viewreset', safeReset);
        map.on('resize', safeReset);

        // Multiple scheduled resets to accommodate CSS transitions, layout shifts, or modal expansion
        const timers = [
            setTimeout(safeReset, 50),
            setTimeout(safeReset, 150),
            setTimeout(safeReset, 300),
            setTimeout(safeReset, 600),
            setTimeout(safeReset, 1000)
        ];

        // ResizeObserver on the map container so any size change immediately aligns the canvas
        let observer: ResizeObserver | null = null;
        const container = map.getContainer();
        if (typeof ResizeObserver !== 'undefined' && container) {
            observer = new ResizeObserver(() => {
                safeReset();
            });
            observer.observe(container);
        }

        return () => {
            map.off('move', safeReset);
            map.off('moveend', safeReset);
            map.off('zoomend', safeReset);
            map.off('viewreset', safeReset);
            map.off('resize', safeReset);

            timers.forEach(clearTimeout);
            if (observer) {
                observer.disconnect();
            }

            if (heatLayerRef.current && map) {
                try {
                    map.removeLayer(heatLayerRef.current);
                } catch {
                    // Ignore removal error
                }
                heatLayerRef.current = null;
            }
        };
    }, [map, safeReset]);

    // Update coordinates & re-align canvas whenever validPoints change
    useEffect(() => {
        if (heatLayerRef.current) {
            try {
                heatLayerRef.current.setLatLngs(validPoints);
                safeReset();
            } catch (err) {
                console.warn('Could not update heatmap coordinates:', err);
            }
        }
    }, [JSON.stringify(validPoints), safeReset]);

    return null;
};

export default HeatmapLayer;
