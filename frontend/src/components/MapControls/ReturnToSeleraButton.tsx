import React, { useState, useEffect } from 'react';
import ReactDOM from 'react-dom';
import { useMap } from 'react-leaflet';

/**
 * A button overlay that flies the map back to Selera Homes.
 * Uses ReactDOM.createPortal to escape Leaflet's overflow:hidden container,
 * while still keeping access to the map instance via useMap().
 */
const ReturnToSeleraButton: React.FC<{ center?: [number, number]; zoom?: number }> = ({
  center = [14.8013, 121.0031],
  zoom = 15,
}) => {
  const map = useMap();
  const [portalTarget, setPortalTarget] = useState<HTMLDivElement | null>(null);

  useEffect(() => {
    const mapContainer = map.getContainer();
    const parent = mapContainer.parentElement;
    if (!parent) return;

    // Ensure the parent wrapper is relatively positioned
    if (getComputedStyle(parent).position === 'static') {
      parent.style.position = 'relative';
    }

    // Create a portal div outside the leaflet container
    const div = document.createElement('div');
    div.style.position = 'absolute';
    div.style.bottom = '16px';
    div.style.left = '16px';
    div.style.zIndex = '1000';
    div.style.pointerEvents = 'auto';
    parent.appendChild(div);
    setPortalTarget(div);

    return () => {
      if (parent.contains(div)) parent.removeChild(div);
      setPortalTarget(null);
    };
  }, [map]);

  const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    map.flyTo(center, zoom, { duration: 1.5, easeLinearity: 0.25 });
  };

  if (!portalTarget) return null;

  return ReactDOM.createPortal(
    <button
      onClick={handleClick}
      className="flex items-center gap-2 px-3 py-2 bg-white text-[#F97316] font-black text-[10px] uppercase tracking-widest hover:bg-orange-50 transition-colors shadow-[0_4px_12px_rgba(0,0,0,0.15)] rounded-xl border border-orange-100 cursor-pointer"
      title="Return to Selera Homes"
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        style={{ height: '16px', width: '16px' }}
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2.5}
          d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"
        />
      </svg>
      Selera Homes
    </button>,
    portalTarget
  );
};

export default ReturnToSeleraButton;
