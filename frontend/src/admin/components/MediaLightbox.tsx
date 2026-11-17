import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { ChevronLeft, ChevronRight, X, ZoomIn, ZoomOut } from 'lucide-react';
import { cx } from '../../preview/lib/cx';

export interface LightboxMediaItem {
  url: string;
  kind?: 'photo' | 'video' | 'document' | string;
  title?: string;
  caption?: string;
  source?: string;
  date?: string;
  badge?: string;
}

interface MediaViewerContextType {
  openMedia: (items: LightboxMediaItem[], initialIndex?: number) => void;
  closeMedia: () => void;
}

const MediaViewerContext = createContext<MediaViewerContextType | null>(null);

export function useMediaViewer() {
  const ctx = useContext(MediaViewerContext);
  if (!ctx) {
    return {
      openMedia: () => {},
      closeMedia: () => {},
    };
  }
  return ctx;
}

/**
 * A full-screen, high-fidelity media lightbox with zoom, pan, navigation, video playback, and responsive controls.
 */
export function MediaLightbox({
  items,
  initialIndex = 0,
  onClose,
}: {
  items: LightboxMediaItem[];
  initialIndex?: number;
  onClose: () => void;
}) {
  const [index, setIndex] = useState(Math.max(0, Math.min(initialIndex, items.length - 1)));
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef({ x: 0, y: 0 });
  const panStartRef = useRef({ x: 0, y: 0 });
  const containerRef = useRef<HTMLDivElement>(null);

  const current = items[index];
  const isVideo = current?.kind === 'video' || (current?.url && /\.(mp4|webm|mov|ogg)$/i.test(current.url));
  const hasMultiple = items.length > 1;

  // Reset zoom & pan when switching media
  useEffect(() => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }, [index]);

  // Lock body scroll while lightbox is open and restore on unmount
  useEffect(() => {
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, []);

  const prev = () => {
    if (!hasMultiple) return;
    setIndex((i) => (i - 1 + items.length) % items.length);
  };

  const next = () => {
    if (!hasMultiple) return;
    setIndex((i) => (i + 1) % items.length);
  };

  const zoomIn = () => {
    setZoom((z) => Math.min(Number((z + 0.5).toFixed(2)), 4));
  };

  const zoomOut = () => {
    setZoom((z) => {
      const nextZ = Math.max(Number((z - 0.5).toFixed(2)), 0.5);
      if (nextZ <= 1) setPan({ x: 0, y: 0 });
      return nextZ;
    });
  };

  const resetZoom = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  };

  const toggleZoom = () => {
    if (zoom === 1) {
      setZoom(2);
    } else {
      resetZoom();
    }
  };

  // Keyboard navigation & controls
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        prev();
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        next();
      } else if (e.key === '+' || e.key === '=') {
        if (!isVideo) {
          e.preventDefault();
          zoomIn();
        }
      } else if (e.key === '-' || e.key === '_') {
        if (!isVideo) {
          e.preventDefault();
          zoomOut();
        }
      } else if (e.key === '0') {
        if (!isVideo) {
          e.preventDefault();
          resetZoom();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [hasMultiple, isVideo, items.length]);

  // Mouse drag panning when zoomed in
  const handleMouseDown = (e: React.MouseEvent) => {
    if (zoom > 1 && !isVideo) {
      setIsDragging(true);
      dragStartRef.current = { x: e.clientX, y: e.clientY };
      panStartRef.current = { ...pan };
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isDragging && zoom > 1) {
      const dx = e.clientX - dragStartRef.current.x;
      const dy = e.clientY - dragStartRef.current.y;
      setPan({
        x: panStartRef.current.x + dx,
        y: panStartRef.current.y + dy,
      });
    }
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  // Mouse wheel zoom
  const handleWheel = (e: React.WheelEvent) => {
    if (isVideo) return;
    if (e.deltaY < 0) {
      zoomIn();
    } else {
      zoomOut();
    }
  };

  if (!current) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Media preview"
      className="fixed inset-0 z-[9999] flex flex-col justify-between bg-black/95 text-white select-none backdrop-blur-md transition-opacity duration-200"
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
    >
      {/* Top Header Bar */}
      <header className="relative z-30 flex items-center justify-between gap-3 border-b border-white/10 bg-black/60 px-4 py-3 sm:px-6">
        {/* Left: Title & metadata */}
        <div className="min-w-0 max-w-[50%]">
          <h2 className="text-sm sm:text-base font-semibold truncate text-white">
            {current.title || (isVideo ? 'Video Evidence' : 'Photo Evidence')}
          </h2>
          {(current.source || current.date || current.caption) && (
            <p className="text-xs text-white/60 truncate mt-0.5">
              {[current.source, current.date, current.caption].filter(Boolean).join(' · ')}
            </p>
          )}
        </div>

        {/* Center: Image Counter */}
        {hasMultiple && (
          <div className="hidden sm:flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-xs font-semibold tracking-wide text-white/90 border border-white/10 shadow-sm">
            <span>{index + 1}</span>
            <span className="text-white/40">/</span>
            <span>{items.length}</span>
          </div>
        )}

        {/* Right: Zoom controls & Close button */}
        <div className="flex items-center gap-1.5 sm:gap-2">
          {!isVideo && (
            <div className="flex items-center bg-white/10 rounded-lg p-0.5 border border-white/10">
              <button
                type="button"
                onClick={zoomOut}
                disabled={zoom <= 0.5}
                className="p-1.5 text-white/80 hover:text-white disabled:text-white/20 hover:bg-white/10 rounded transition-colors"
                title="Zoom out (-)"
                aria-label="Zoom out"
              >
                <ZoomOut size={16} />
              </button>
              <button
                type="button"
                onClick={resetZoom}
                className="px-2 py-1 text-xs font-semibold text-white/80 hover:text-white hover:bg-white/10 rounded transition-colors tabular-nums"
                title="Reset zoom (0)"
                aria-label="Reset zoom"
              >
                {Math.round(zoom * 100)}%
              </button>
              <button
                type="button"
                onClick={zoomIn}
                disabled={zoom >= 4}
                className="p-1.5 text-white/80 hover:text-white disabled:text-white/20 hover:bg-white/10 rounded transition-colors"
                title="Zoom in (+)"
                aria-label="Zoom in"
              >
                <ZoomIn size={16} />
              </button>
            </div>
          )}

          <button
            type="button"
            onClick={onClose}
            className="flex items-center justify-center h-9 w-9 rounded-lg bg-white/10 hover:bg-red-500/80 text-white/90 hover:text-white border border-white/10 transition-colors focus:outline-none focus:ring-2 focus:ring-white/40"
            title="Close (Escape)"
            aria-label="Close media preview"
          >
            <X size={20} />
          </button>
        </div>
      </header>

      {/* Main Preview Container */}
      <div
        ref={containerRef}
        className="relative flex-1 flex items-center justify-center overflow-hidden p-3 sm:p-6"
        onClick={(e) => {
          if (e.target === e.currentTarget) onClose();
        }}
        onWheel={handleWheel}
      >
        {/* Navigation - Left Arrow */}
        {hasMultiple && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              prev();
            }}
            aria-label="Previous media item (Left Arrow)"
            className="absolute left-3 sm:left-6 top-1/2 -translate-y-1/2 z-20 flex h-11 w-11 sm:h-13 sm:w-13 items-center justify-center rounded-full bg-black/60 hover:bg-black/90 text-white/80 hover:text-white border border-white/20 shadow-2xl transition-all hover:scale-105 focus:outline-none focus:ring-2 focus:ring-white/50"
          >
            <ChevronLeft size={28} />
          </button>
        )}

        {/* Media Item: Image or Video */}
        {isVideo ? (
          <div
            className="relative flex items-center justify-center max-h-[82vh] max-w-[90vw]"
            onClick={(e) => e.stopPropagation()}
          >
            <video
              key={current.url}
              src={current.url}
              controls
              autoPlay
              playsInline
              className="max-h-[82vh] max-w-[90vw] rounded-lg shadow-2xl object-contain bg-black"
            />
          </div>
        ) : (
          <div
            className="relative flex items-center justify-center w-full h-full"
            onClick={(e) => {
              if (e.target === e.currentTarget) onClose();
            }}
          >
            <img
              key={current.url}
              src={current.url}
              alt={current.title || 'Case attachment'}
              onMouseDown={handleMouseDown}
              onClick={(e) => {
                e.stopPropagation();
                toggleZoom();
              }}
              draggable={false}
              style={{
                transform: `scale(${zoom}) translate(${pan.x / zoom}px, ${pan.y / zoom}px)`,
                cursor: zoom > 1 ? (isDragging ? 'grabbing' : 'grab') : 'zoom-in',
                maxHeight: '82vh',
                maxWidth: '90vw',
              }}
              className={cx(
                'object-contain rounded-lg shadow-2xl select-none',
                isDragging ? 'transition-none' : 'transition-transform duration-150 ease-out'
              )}
            />
          </div>
        )}

        {/* Navigation - Right Arrow */}
        {hasMultiple && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              next();
            }}
            aria-label="Next media item (Right Arrow)"
            className="absolute right-3 sm:right-6 top-1/2 -translate-y-1/2 z-20 flex h-11 w-11 sm:h-13 sm:w-13 items-center justify-center rounded-full bg-black/60 hover:bg-black/90 text-white/80 hover:text-white border border-white/20 shadow-2xl transition-all hover:scale-105 focus:outline-none focus:ring-2 focus:ring-white/50"
          >
            <ChevronRight size={28} />
          </button>
        )}
      </div>

      {/* Bottom Footer Bar */}
      <footer className="relative z-30 flex items-center justify-between border-t border-white/10 bg-black/60 px-4 py-2.5 sm:px-6 text-xs text-white/60">
        <div className="flex items-center gap-3">
          <span className="sm:hidden font-medium text-white/90">
            {index + 1} of {items.length}
          </span>
          <span className="hidden sm:inline">
            {!isVideo
              ? 'Click image to toggle 2× zoom · Drag to pan · Scroll wheel to zoom'
              : 'Video player controls active'}
          </span>
        </div>
        <div className="flex items-center gap-3 text-right">
          {hasMultiple && <span className="hidden md:inline">← / → Arrow keys to navigate</span>}
          <span>Esc to close</span>
        </div>
      </footer>
    </div>
  );
}

/**
 * Provider wrapping components to give them one-click access to open full-screen media previews.
 */
export function MediaViewerProvider({ children }: { children: ReactNode }) {
  const [activeMedia, setActiveMedia] = useState<{
    items: LightboxMediaItem[];
    initialIndex: number;
  } | null>(null);

  const openMedia = (items: LightboxMediaItem[], initialIndex = 0) => {
    if (!items || items.length === 0) return;
    setActiveMedia({ items, initialIndex });
  };

  const closeMedia = () => {
    setActiveMedia(null);
  };

  return (
    <MediaViewerContext.Provider value={{ openMedia, closeMedia }}>
      {children}
      {activeMedia && (
        <MediaLightbox
          items={activeMedia.items}
          initialIndex={activeMedia.initialIndex}
          onClose={closeMedia}
        />
      )}
    </MediaViewerContext.Provider>
  );
}
