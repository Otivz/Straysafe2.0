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
  // Live navigation: the start moves; keep the same route control (no rebuild, no re-zoom after the first fit)
  keepView?: boolean;
}

const RoutingControl = ({ start, end, waypointNames, onRoutingUpdate, onClose, keepView }: RoutingControlProps) => {
  const map = useMap();
  const controlRef = useRef<any>(null);
  const startRef = useRef(start);
  startRef.current = start;
  const onUpdateRef = useRef(onRoutingUpdate);
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onUpdateRef.current = onRoutingUpdate;
  }, [onRoutingUpdate]);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    const start = startRef.current;
    if (!map || !start || !end || isNaN(start[0]) || isNaN(start[1]) || isNaN(end[0]) || isNaN(end[1])) return;

    let isMounted = true;
    let routingControl: any = null;

    try {
      routingControl = L.Routing.control({
        waypoints: [
          waypointNames?.[0]
            ? L.Routing.waypoint(L.latLng(start[0], start[1]), waypointNames[0])
            : L.latLng(start[0], start[1]),
          waypointNames?.[1]
            ? L.Routing.waypoint(L.latLng(end[0], end[1]), waypointNames[1])
            : L.latLng(end[0], end[1])
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
        collapsible: true,
        createMarker: () => null
      }).addTo(map);
      controlRef.current = routingControl;

      // Add a cancel navigation (X) button to the directions panel container
      const container = routingControl.getContainer();
      if (container) {
        container.style.position = 'relative';
        const cancelBtn = document.createElement('button');
        cancelBtn.innerHTML = 'Cancel Route';
        cancelBtn.title = 'Stop Navigating';
        cancelBtn.style.display = 'block';
        cancelBtn.style.width = 'calc(100% - 16px)';
        cancelBtn.style.margin = '8px';
        cancelBtn.style.padding = '8px';
        cancelBtn.style.backgroundColor = '#ef4444';
        cancelBtn.style.color = '#ffffff';
        cancelBtn.style.border = 'none';
        cancelBtn.style.borderRadius = '12px';
        cancelBtn.style.fontWeight = '800';
        cancelBtn.style.fontSize = '11px';
        cancelBtn.style.textTransform = 'uppercase';
        cancelBtn.style.letterSpacing = '0.05em';
        cancelBtn.style.cursor = 'pointer';
        cancelBtn.style.textAlign = 'center';
        cancelBtn.style.transition = 'all 0.2s';
        cancelBtn.style.boxShadow = '0 2px 8px rgba(239, 68, 68, 0.3)';

        cancelBtn.onmouseenter = () => { cancelBtn.style.backgroundColor = '#dc2626'; };
        cancelBtn.onmouseleave = () => { cancelBtn.style.backgroundColor = '#ef4444'; };

        cancelBtn.onclick = (e: MouseEvent) => {
          e.preventDefault();
          e.stopPropagation();
          if (onCloseRef.current) onCloseRef.current();
        };

        container.appendChild(cancelBtn);
      }

      routingControl.on('routingerror', (e: any) => {
        if (isMounted) {
          console.warn("Routing error:", e?.error || e);
        }
      });

      routingControl.on('routesfound', (e: any) => {
        if (!isMounted) return;
        // fit the map to the route once; while navigating, don't keep jumping the view
        if (keepView) routingControl.options.fitSelectedRoutes = false;
        const routes = e?.routes;
        if (routes && routes[0] && routes[0].summary) {
          const summary = routes[0].summary;
          if (onUpdateRef.current) {
            onUpdateRef.current({
              distance: (summary.totalDistance / 1000).toFixed(1) + " km",
              time: Math.round(summary.totalTime / 60) + " mins"
            });
          }
        }
      });
    } catch (err) {
      console.warn("Error creating routing control:", err);
    }

    return () => {
      isMounted = false;
      controlRef.current = null;
      if (routingControl) {
        try {
          routingControl.off();
        } catch { }
        try {
          if (map) {
            map.removeControl(routingControl);
          }
        } catch { }
      }
    };
  }, [map, end[0], end[1], waypointNames?.[0], waypointNames?.[1], keepView]);

  // A new start (you moved): move the first waypoint of the existing route instead of rebuilding it
  useEffect(() => {
    const ctl = controlRef.current;
    if (!ctl || !start || isNaN(start[0]) || isNaN(start[1])) return;
    try {
      const wps = ctl.getWaypoints();
      const cur = wps?.[0]?.latLng;
      if (cur && Math.abs(cur.lat - start[0]) < 1e-7 && Math.abs(cur.lng - start[1]) < 1e-7) return;
      ctl.spliceWaypoints(0, 1, waypointNames?.[0]
        ? L.Routing.waypoint(L.latLng(start[0], start[1]), waypointNames[0])
        : L.latLng(start[0], start[1]));
    } catch (err) {
      console.warn("Could not move the route start:", err);
    }
  }, [start[0], start[1]]);

  return null;
};

export default RoutingControl;
