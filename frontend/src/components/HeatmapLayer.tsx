import { useEffect, useRef } from 'react';
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

    useEffect(() => {
        if (!map) return;

        if (heatLayerRef.current) {
            try {
                heatLayerRef.current.setLatLngs(validPoints);
            } catch (err) {
                console.warn('Could not update heatmap points:', err);
            }
            return;
        }

        try {
            // @ts-ignore - heatLayer is added to L by the plugin
            const layer = L.heatLayer(validPoints, {
                radius: 25,
                blur: 15,
                maxZoom: 17,
                gradient: {
                    0.4: 'blue',
                    0.6: 'cyan',
                    0.7: 'lime',
                    0.8: 'yellow',
                    1.0: 'red'
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

                // Guard _reset against 0 height canvas IndexSizeError
                const origReset = anyLayer._reset;
                if (typeof origReset === 'function') {
                    anyLayer._reset = function (this: any) {
                        if (!this._map) return;
                        const size = this._map.getSize();
                        if (!size || size.x <= 0 || size.y <= 0) return;
                        try {
                            origReset.call(this);
                        } catch (e) {
                            console.warn('leaflet-heat reset suppressed:', e);
                        }
                    };
                }

                layer.addTo(map);
                heatLayerRef.current = layer;
            }
        } catch (err) {
            console.warn('Failed to initialize HeatmapLayer:', err);
        }

        return () => {
            if (heatLayerRef.current && map) {
                try {
                    map.removeLayer(heatLayerRef.current);
                } catch (e) {
                    // Ignore removal error
                }
                heatLayerRef.current = null;
            }
        };
    }, [map]);

    // Update coordinates whenever validPoints changes
    useEffect(() => {
        if (heatLayerRef.current) {
            try {
                heatLayerRef.current.setLatLngs(validPoints);
            } catch (err) {
                console.warn('Could not update heatmap coordinates:', err);
            }
        }
    }, [JSON.stringify(validPoints)]);

    return null;
};

export default HeatmapLayer;


