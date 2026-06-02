import { useEffect, useRef } from "react";
import { useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet-routing-machine";
import "leaflet-routing-machine/dist/leaflet-routing-machine.css";

// Fix for routing machine types
declare global {
  namespace L {
    namespace Routing {
      function control(options: any): any;
      function osrmv1(options: any): any;
      function waypoint(latLng: L.LatLng, name?: string, options?: any): any;
    }
  }
}

interface RoutingControlProps {
  start: [number, number];
  end: [number, number];
  waypointNames?: [string, string];
  onRoutingUpdate?: (data: { distance: string; time: string }) => void;
  onClose?: () => void;
}

const RoutingControl = ({ start, end, waypointNames, onRoutingUpdate, onClose }: RoutingControlProps) => {
  const map = useMap();
  const onUpdateRef = useRef(onRoutingUpdate);
  
  useEffect(() => {
    onUpdateRef.current = onRoutingUpdate;
  }, [onRoutingUpdate]);

  useEffect(() => {
    if (!map) return;

    console.log("Routing from:", start, "to:", end);

    const routingControl = L.Routing.control({
      waypoints: [
        L.latLng(start[0], start[1]),
        L.latLng(end[0], end[1])
      ],
      router: L.Routing.osrmv1({
        serviceUrl: 'https://router.project-osrm.org/route/v1',
        useHints: false
      }),
      lineOptions: {
        styles: [
          { color: '#ffffff', weight: 10, opacity: 0.8 }, // Outer white border
          { color: '#F97316', weight: 6, opacity: 1 }      // Solid orange line
        ],
        extendToWaypoints: true,
        missingRouteTolerance: 1
      },
      addWaypoints: false,
      draggableWaypoints: false,
      fitSelectedRoutes: true,
      showAlternatives: false,
      createMarker: () => null
    }).addTo(map);

    // Add a close (x) button to the directions panel container
    const container = routingControl.getContainer();
    if (container) {
      container.style.position = 'relative';
      const closeBtn = document.createElement('button');
      closeBtn.innerHTML = '×';
      closeBtn.title = 'Close directions';
      closeBtn.style.position = 'absolute';
      closeBtn.style.top = '6px';
      closeBtn.style.right = '12px';
      closeBtn.style.background = 'none';
      closeBtn.style.border = 'none';
      closeBtn.style.fontSize = '24px';
      closeBtn.style.fontWeight = 'bold';
      closeBtn.style.color = '#9ca3af';
      closeBtn.style.cursor = 'pointer';
      closeBtn.style.padding = '0';
      closeBtn.style.lineHeight = '1';
      closeBtn.style.zIndex = '1000';
      closeBtn.style.transition = 'color 0.2s';

      closeBtn.onmouseenter = () => { closeBtn.style.color = '#ef4444'; };
      closeBtn.onmouseleave = () => { closeBtn.style.color = '#9ca3af'; };
      
      closeBtn.onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (onClose) onClose();
      };
      
      container.appendChild(closeBtn);
    }

    routingControl.on('routingerror', (e: any) => {
        console.error("Routing error:", e.error);
    });

    routingControl.on('routesfound', (e: any) => {
        const routes = e.routes;
        const summary = routes[0].summary;
        if (onUpdateRef.current) {
            onUpdateRef.current({
                distance: (summary.totalDistance / 1000).toFixed(1) + " km",
                time: Math.round(summary.totalTime / 60) + " mins"
            });
        }
    });

    return () => {
        if (map && routingControl) {
            try {
                routingControl.setWaypoints([]);
            } catch (err) {
                console.error("Error setting empty waypoints during cleanup:", err);
            }
            map.removeControl(routingControl);
        }
    };
  }, [map, start[0], start[1], end[0], end[1], waypointNames]);

  return null;
};

export default RoutingControl;
