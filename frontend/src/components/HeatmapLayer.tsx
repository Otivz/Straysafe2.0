import { useEffect } from 'react';
import { useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet.heat';

interface HeatmapLayerProps {
    points: [number, number, number][]; // [lat, lng, intensity]
    options?: L.HeatMapOptions;
}

const HeatmapLayer = ({ points, options }: HeatmapLayerProps) => {
    const map = useMap();

    useEffect(() => {
        if (!map) return;

        // @ts-ignore - heatLayer is added to L by the plugin
        const heatLayer = L.heatLayer(points, {
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
        }).addTo(map);

        return () => {
            map.removeLayer(heatLayer);
        };
    }, [map, points, options]);

    return null;
};

export default HeatmapLayer;
