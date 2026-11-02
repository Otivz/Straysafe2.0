import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft, ChevronRight, Columns2, Link, RotateCcw, Square, Unlink, X, ZoomIn, ZoomOut } from 'lucide-react';

export interface LightboxItem {
    url: string;
    type?: 'Image' | 'Video' | string;
    caption?: string;
}

export interface CompareSide {
    title: string;
    badge?: string; // e.g. "Reported Sighting" or "Registered Pet"
    items: LightboxItem[];
    initialIndex?: number;
}

export interface MediaLightboxProps {
    items?: LightboxItem[];
    startIndex?: number;
    title?: string;
    onClose: () => void;
    // Side-by-side comparison mode
    compare?: {
        left: CompareSide;
        right: CompareSide;
    };
    initialMode?: 'split' | 'left' | 'right';
}

interface ZoomPaneProps {
    item: LightboxItem;
    title?: string;
    badge?: string;
    index: number;
    total: number;
    onPrev?: () => void;
    onNext?: () => void;
    zoom: number;
    onZoomChange: (z: number) => void;
    onResetZoom: () => void;
    alt: string;
    accentColor?: 'orange' | 'amber' | 'slate';
}

function ZoomablePane({
    item,
    title,
    badge,
    index,
    total,
    onPrev,
    onNext,
    zoom,
    onZoomChange,
    onResetZoom,
    alt,
    accentColor = 'orange',
}: ZoomPaneProps) {
    const isVideo = item.type === 'Video' || /\.(mp4|mov|webm|avi)(\?|$)/i.test(item.url);
    const containerRef = useRef<HTMLDivElement>(null);
    const [pan, setPan] = useState({ x: 0, y: 0 });
    const [isDragging, setIsDragging] = useState(false);
    const dragRef = useRef({ startX: 0, startY: 0, panX: 0, panY: 0 });
    const touchRef = useRef<{ startDist: number; startZoom: number } | null>(null);

    // Reset pan if zoom drops back to 1
    useEffect(() => {
        if (zoom <= 1) {
            setPan({ x: 0, y: 0 });
        }
    }, [zoom, item.url]);

    const handleWheel = (e: React.WheelEvent) => {
        if (isVideo) return;
        e.preventDefault();
        e.stopPropagation();
        if (e.deltaY < 0) {
            onZoomChange(Math.min(4, +(zoom + 0.35).toFixed(2)));
        } else if (e.deltaY > 0) {
            onZoomChange(Math.max(1, +(zoom - 0.35).toFixed(2)));
        }
    };

    const handleMouseDown = (e: React.MouseEvent) => {
        if (isVideo || zoom <= 1 || e.button !== 0) return;
        e.preventDefault();
        setIsDragging(true);
        dragRef.current = {
            startX: e.clientX,
            startY: e.clientY,
            panX: pan.x,
            panY: pan.y,
        };
    };

    const handleMouseMove = (e: React.MouseEvent) => {
        if (!isDragging) return;
        const dx = e.clientX - dragRef.current.startX;
        const dy = e.clientY - dragRef.current.startY;
        setPan({
            x: dragRef.current.panX + dx,
            y: dragRef.current.panY + dy,
        });
    };

    const handleMouseUp = () => {
        setIsDragging(false);
    };

    const handleTouchStart = (e: React.TouchEvent) => {
        if (isVideo) return;
        if (e.touches.length === 2) {
            const dist = Math.hypot(
                e.touches[0].clientX - e.touches[1].clientX,
                e.touches[0].clientY - e.touches[1].clientY
            );
            touchRef.current = { startDist: dist, startZoom: zoom };
        } else if (e.touches.length === 1 && zoom > 1) {
            setIsDragging(true);
            dragRef.current = {
                startX: e.touches[0].clientX,
                startY: e.touches[0].clientY,
                panX: pan.x,
                panY: pan.y,
            };
        }
    };

    const handleTouchMove = (e: React.TouchEvent) => {
        if (isVideo) return;
        if (e.touches.length === 2 && touchRef.current) {
            const dist = Math.hypot(
                e.touches[0].clientX - e.touches[1].clientX,
                e.touches[0].clientY - e.touches[1].clientY
            );
            const ratio = dist / touchRef.current.startDist;
            const newZoom = Math.min(4, Math.max(1, +(touchRef.current.startZoom * ratio).toFixed(2)));
            onZoomChange(newZoom);
        } else if (e.touches.length === 1 && isDragging && zoom > 1) {
            const dx = e.touches[0].clientX - dragRef.current.startX;
            const dy = e.touches[0].clientY - dragRef.current.startY;
            setPan({
                x: dragRef.current.panX + dx,
                y: dragRef.current.panY + dy,
            });
        }
    };

    const handleTouchEnd = (e: React.TouchEvent) => {
        if (e.touches.length < 2) {
            touchRef.current = null;
        }
        if (e.touches.length === 0) {
            setIsDragging(false);
        }
    };

    const handleDoubleClick = (e: React.MouseEvent) => {
        if (isVideo) return;
        e.stopPropagation();
        if (zoom > 1) {
            onResetZoom();
            setPan({ x: 0, y: 0 });
        } else {
            onZoomChange(2.2);
        }
    };

    const badgeBg =
        accentColor === 'orange'
            ? 'bg-orange-500 text-white'
            : accentColor === 'amber'
            ? 'bg-amber-500 text-white'
            : 'bg-slate-700 text-white';

    return (
        <div className="relative flex flex-col h-full w-full rounded-2xl bg-zinc-950/80 border border-white/10 overflow-hidden shadow-2xl select-none">
            {/* Top Bar for Pane */}
            <div className="flex items-center justify-between gap-2 px-3.5 py-2.5 bg-zinc-900/90 border-b border-white/10 shrink-0 z-10">
                <div className="flex items-center gap-2 min-w-0">
                    {badge && (
                        <span className={`px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider shrink-0 shadow-xs ${badgeBg}`}>
                            {badge}
                        </span>
                    )}
                    {title && (
                        <span className="text-xs font-bold text-white truncate max-w-[180px] sm:max-w-[260px]">
                            {title}
                        </span>
                    )}
                </div>

                <div className="flex items-center gap-2 shrink-0">
                    {total > 1 && (
                        <span className="text-[11px] font-semibold text-zinc-400">
                            {index + 1} / {total}
                        </span>
                    )}
                    <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-white/10 text-zinc-300">
                        {Math.round(zoom * 100)}%
                    </span>
                </div>
            </div>

            {/* Interactive Image Viewing Canvas */}
            <div
                ref={containerRef}
                className="relative flex-1 min-h-0 flex items-center justify-center overflow-hidden p-2"
                style={{
                    cursor: isVideo ? 'default' : zoom > 1 ? (isDragging ? 'grabbing' : 'grab') : 'zoom-in',
                    touchAction: 'none',
                }}
                onWheel={handleWheel}
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseUp}
                onTouchStart={handleTouchStart}
                onTouchMove={handleTouchMove}
                onTouchEnd={handleTouchEnd}
                onDoubleClick={handleDoubleClick}
            >
                {isVideo ? (
                    <video
                        key={item.url}
                        src={item.url}
                        controls
                        autoPlay
                        className="max-w-full max-h-full rounded-lg shadow-2xl object-contain"
                        onClick={(e) => e.stopPropagation()}
                    />
                ) : (
                    <img
                        key={item.url}
                        src={item.url}
                        alt={alt}
                        className="max-w-full max-h-full object-contain rounded-lg shadow-2xl pointer-events-none select-none transition-transform duration-75 origin-center will-change-transform"
                        style={{
                            transform: `scale(${zoom}) translate(${pan.x / zoom}px, ${pan.y / zoom}px)`,
                        }}
                        draggable={false}
                    />
                )}

                {/* Multiple photo navigation arrows */}
                {total > 1 && onPrev && onNext && (
                    <>
                        <button
                            type="button"
                            onClick={(e) => {
                                e.stopPropagation();
                                onPrev();
                            }}
                            className="absolute left-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-black/60 hover:bg-black/90 text-white flex items-center justify-center transition-all cursor-pointer shadow-lg z-10 border border-white/15"
                            aria-label="Previous photo"
                            title="Previous photo"
                        >
                            <ChevronLeft className="w-5 h-5" />
                        </button>
                        <button
                            type="button"
                            onClick={(e) => {
                                e.stopPropagation();
                                onNext();
                            }}
                            className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-black/60 hover:bg-black/90 text-white flex items-center justify-center transition-all cursor-pointer shadow-lg z-10 border border-white/15"
                            aria-label="Next photo"
                            title="Next photo"
                        >
                            <ChevronRight className="w-5 h-5" />
                        </button>
                    </>
                )}

                {/* Zoom Tip Overlay for Mobile / First Look */}
                {zoom === 1 && !isVideo && (
                    <div className="absolute bottom-2 left-2 pointer-events-none bg-black/65 backdrop-blur-xs text-zinc-300 text-[10px] font-semibold px-2 py-0.5 rounded-md border border-white/10 opacity-70">
                        Double-tap or pinch to magnify
                    </div>
                )}
            </div>

            {/* Bottom Caption & Fast Presets */}
            <div className="flex items-center justify-between gap-2 px-3 py-1.5 bg-zinc-900/80 border-t border-white/10 shrink-0 text-xs">
                <p className="text-[11px] text-zinc-400 truncate max-w-[200px] sm:max-w-sm">
                    {item.caption || (total > 1 ? `Photo ${index + 1}` : 'Main photo')}
                </p>
                <div className="flex items-center gap-1 shrink-0">
                    <button
                        type="button"
                        onClick={() => onZoomChange(1)}
                        className={`px-1.5 py-0.5 text-[10px] font-bold rounded transition cursor-pointer ${
                            zoom === 1 ? 'bg-white/20 text-white' : 'text-zinc-400 hover:text-white'
                        }`}
                        title="Normal size"
                    >
                        1x
                    </button>
                    <button
                        type="button"
                        onClick={() => onZoomChange(2)}
                        className={`px-1.5 py-0.5 text-[10px] font-bold rounded transition cursor-pointer ${
                            Math.abs(zoom - 2) < 0.1 ? 'bg-white/20 text-white' : 'text-zinc-400 hover:text-white'
                        }`}
                        title="Double zoom"
                    >
                        2x
                    </button>
                    <button
                        type="button"
                        onClick={() => onZoomChange(3)}
                        className={`px-1.5 py-0.5 text-[10px] font-bold rounded transition cursor-pointer ${
                            Math.abs(zoom - 3) < 0.1 ? 'bg-white/20 text-white' : 'text-zinc-400 hover:text-white'
                        }`}
                        title="Triple zoom"
                    >
                        3x
                    </button>
                </div>
            </div>
        </div>
    );
}

// Full-screen photo/video viewer with interactive zoom/magnifier and side-by-side compare.
// Rendered into <body> so it sits above any modal.
export default function MediaLightbox({
    items,
    startIndex = 0,
    title,
    onClose,
    compare,
    initialMode = 'split',
}: MediaLightboxProps) {
    const isCompareMode = Boolean(compare);

    // Single mode state
    const singleItems = items || [];
    const [singleIndex, setSingleIndex] = useState(
        Math.min(Math.max(startIndex, 0), Math.max(singleItems.length - 1, 0))
    );
    const [singleZoom, setSingleZoom] = useState(1);

    // Compare mode state
    const leftItems = compare?.left.items || [];
    const rightItems = compare?.right.items || [];
    const [leftIndex, setLeftIndex] = useState(compare?.left.initialIndex || 0);
    const [rightIndex, setRightIndex] = useState(compare?.right.initialIndex || 0);
    const [leftZoom, setLeftZoom] = useState(1);
    const [rightZoom, setRightZoom] = useState(1);
    const [syncZoom, setSyncZoom] = useState(true);
    const [viewMode, setViewMode] = useState<'split' | 'left' | 'right'>(initialMode);

    const handleLeftZoomChange = (z: number) => {
        setLeftZoom(z);
        if (syncZoom) setRightZoom(z);
    };

    const handleRightZoomChange = (z: number) => {
        setRightZoom(z);
        if (syncZoom) setLeftZoom(z);
    };

    const handleGlobalZoom = (delta: number) => {
        if (!isCompareMode) {
            setSingleZoom((z) => Math.min(4, Math.max(1, +(z + delta).toFixed(2))));
        } else {
            const next = Math.min(4, Math.max(1, +(leftZoom + delta).toFixed(2)));
            setLeftZoom(next);
            setRightZoom(next);
        }
    };

    const handleResetAllZoom = () => {
        setSingleZoom(1);
        setLeftZoom(1);
        setRightZoom(1);
    };

    const currentZoom = isCompareMode ? leftZoom : singleZoom;

    // Keyboard navigation
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                e.stopImmediatePropagation();
                onClose();
            } else if (e.key === '+' || e.key === '=') {
                handleGlobalZoom(0.5);
            } else if (e.key === '-' || e.key === '_') {
                handleGlobalZoom(-0.5);
            } else if (e.key === '0') {
                handleResetAllZoom();
            } else if (!isCompareMode && singleItems.length > 1) {
                if (e.key === 'ArrowRight') setSingleIndex((i) => (i + 1) % singleItems.length);
                if (e.key === 'ArrowLeft') setSingleIndex((i) => (i - 1 + singleItems.length) % singleItems.length);
            }
        };

        window.addEventListener('keydown', onKey, true);
        const prevOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        return () => {
            window.removeEventListener('keydown', onKey, true);
            document.body.style.overflow = prevOverflow;
        };
    }, [isCompareMode, singleItems.length, onClose, leftZoom, singleZoom]);

    // Safety checks
    if (!isCompareMode && !singleItems.length) return null;
    if (isCompareMode && (!leftItems.length || !rightItems.length)) return null;

    const modalTitle = title || (isCompareMode ? 'Side-by-Side Detail Inspection' : 'Photo Viewer');

    return createPortal(
        <div
            className="fixed inset-0 z-[2147483000] bg-black/95 flex flex-col animate-in fade-in duration-150"
            role="dialog"
            aria-modal="true"
            aria-label={modalTitle}
        >
            {/* Main Lightbox Header */}
            <div
                className="flex flex-wrap items-center justify-between gap-3 px-4 sm:px-6 py-3 text-white border-b border-white/10 bg-zinc-950/90 shrink-0"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Title & Mode Switcher */}
                <div className="flex items-center gap-3 min-w-0">
                    <div className="min-w-0">
                        <p className="text-sm sm:text-base font-black tracking-tight truncate flex items-center gap-2">
                            <span>🔍</span>
                            <span>{modalTitle}</span>
                        </p>
                        <p className="text-[11px] text-zinc-400 font-medium hidden sm:block truncate">
                            {isCompareMode
                                ? 'Pinch or drag to magnify and inspect markings side-by-side'
                                : 'Click or pinch to zoom in on markings and details'}
                        </p>
                    </div>

                    {/* Compare View Switcher (Dual vs Left vs Right) */}
                    {isCompareMode && (
                        <div className="flex items-center bg-white/10 p-0.5 rounded-xl border border-white/10 shrink-0 ml-1">
                            <button
                                type="button"
                                onClick={() => setViewMode('split')}
                                className={`flex items-center gap-1 px-2.5 py-1 text-xs font-bold rounded-lg transition cursor-pointer ${
                                    viewMode === 'split' ? 'bg-orange-500 text-white shadow-xs' : 'text-zinc-300 hover:text-white'
                                }`}
                                title="Dual View Side-by-Side"
                            >
                                <Columns2 className="w-3.5 h-3.5" />
                                <span className="hidden md:inline">Dual Compare</span>
                            </button>
                            <button
                                type="button"
                                onClick={() => setViewMode('left')}
                                className={`flex items-center gap-1 px-2.5 py-1 text-xs font-bold rounded-lg transition cursor-pointer ${
                                    viewMode === 'left' ? 'bg-orange-500 text-white shadow-xs' : 'text-zinc-300 hover:text-white'
                                }`}
                                title="Show Left photo only"
                            >
                                <Square className="w-3.5 h-3.5" />
                                <span className="hidden md:inline">{compare?.left.badge || 'Reported'}</span>
                            </button>
                            <button
                                type="button"
                                onClick={() => setViewMode('right')}
                                className={`flex items-center gap-1 px-2.5 py-1 text-xs font-bold rounded-lg transition cursor-pointer ${
                                    viewMode === 'right' ? 'bg-orange-500 text-white shadow-xs' : 'text-zinc-300 hover:text-white'
                                }`}
                                title="Show Right photo only"
                            >
                                <Square className="w-3.5 h-3.5" />
                                <span className="hidden md:inline">{compare?.right.badge || 'Candidate'}</span>
                            </button>
                        </div>
                    )}
                </div>

                {/* Global Zoom & Close Controls */}
                <div className="flex items-center gap-2 shrink-0">
                    {/* Synchronize Zoom button (Compare mode only) */}
                    {isCompareMode && viewMode === 'split' && (
                        <button
                            type="button"
                            onClick={() => setSyncZoom((v) => !v)}
                            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold border transition cursor-pointer ${
                                syncZoom
                                    ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-300'
                                    : 'bg-white/10 border-white/10 text-zinc-400 hover:text-white'
                            }`}
                            title={syncZoom ? 'Zoom is synced across both photos' : 'Photos zoom independently'}
                        >
                            {syncZoom ? <Link className="w-3.5 h-3.5" /> : <Unlink className="w-3.5 h-3.5" />}
                            <span className="hidden lg:inline">{syncZoom ? 'Synced Zoom' : 'Separate Zoom'}</span>
                        </button>
                    )}

                    {/* Master Zoom Controls */}
                    <div className="flex items-center gap-1 bg-white/10 rounded-full px-2 py-1 text-xs border border-white/10 shadow-sm">
                        <button
                            type="button"
                            onClick={() => handleGlobalZoom(-0.5)}
                            disabled={currentZoom <= 1}
                            className="p-1 hover:bg-white/20 rounded-full transition disabled:opacity-30 cursor-pointer disabled:cursor-not-allowed"
                            title="Zoom out (-)"
                            aria-label="Zoom out"
                        >
                            <ZoomOut className="w-4 h-4" />
                        </button>
                        <button
                            type="button"
                            onClick={handleResetAllZoom}
                            className="px-2 py-0.5 text-[11px] font-mono font-bold hover:bg-white/20 rounded transition cursor-pointer"
                            title="Reset zoom (0)"
                        >
                            {Math.round(currentZoom * 100)}%
                        </button>
                        <button
                            type="button"
                            onClick={() => handleGlobalZoom(0.5)}
                            disabled={currentZoom >= 4}
                            className="p-1 hover:bg-white/20 rounded-full transition disabled:opacity-30 cursor-pointer disabled:cursor-not-allowed"
                            title="Zoom in (+)"
                            aria-label="Zoom in"
                        >
                            <ZoomIn className="w-4 h-4" />
                        </button>
                        {currentZoom > 1 && (
                            <button
                                type="button"
                                onClick={handleResetAllZoom}
                                className="p-1 hover:bg-white/20 rounded-full transition cursor-pointer"
                                title="Reset zoom"
                                aria-label="Reset zoom"
                            >
                                <RotateCcw className="w-3.5 h-3.5" />
                            </button>
                        )}
                    </div>

                    {/* Close Button */}
                    <button
                        type="button"
                        onClick={onClose}
                        className="p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors cursor-pointer"
                        aria-label="Close photo inspection"
                        title="Close (Esc)"
                    >
                        <X className="w-5 h-5 sm:w-6 sm:h-6" />
                    </button>
                </div>
            </div>

            {/* Viewing Canvas */}
            <div className="relative flex-1 min-h-0 p-2 sm:p-4 overflow-hidden">
                {isCompareMode && compare ? (
                    /* DUAL COMPARE VIEW */
                    <div
                        className={`w-full h-full gap-3 ${
                            viewMode === 'split'
                                ? 'grid grid-cols-1 md:grid-cols-2'
                                : 'flex items-center justify-center'
                        }`}
                    >
                        {/* Left Pane (Reported Animal) */}
                        {(viewMode === 'split' || viewMode === 'left') && (
                            <ZoomablePane
                                item={leftItems[leftIndex]}
                                title={compare.left.title}
                                badge={compare.left.badge || 'Reported Sighting'}
                                index={leftIndex}
                                total={leftItems.length}
                                onPrev={leftItems.length > 1 ? () => setLeftIndex((i) => (i - 1 + leftItems.length) % leftItems.length) : undefined}
                                onNext={leftItems.length > 1 ? () => setLeftIndex((i) => (i + 1) % leftItems.length) : undefined}
                                zoom={leftZoom}
                                onZoomChange={handleLeftZoomChange}
                                onResetZoom={() => handleLeftZoomChange(1)}
                                alt={compare.left.title}
                                accentColor="orange"
                            />
                        )}

                        {/* Right Pane (Registered Pet / Candidate) */}
                        {(viewMode === 'split' || viewMode === 'right') && (
                            <ZoomablePane
                                item={rightItems[rightIndex]}
                                title={compare.right.title}
                                badge={compare.right.badge || 'Registered Pet'}
                                index={rightIndex}
                                total={rightItems.length}
                                onPrev={rightItems.length > 1 ? () => setRightIndex((i) => (i - 1 + rightItems.length) % rightItems.length) : undefined}
                                onNext={rightItems.length > 1 ? () => setRightIndex((i) => (i + 1) % rightItems.length) : undefined}
                                zoom={rightZoom}
                                onZoomChange={handleRightZoomChange}
                                onResetZoom={() => handleRightZoomChange(1)}
                                alt={compare.right.title}
                                accentColor="amber"
                            />
                        )}
                    </div>
                ) : (
                    /* SINGLE ITEM VIEW */
                    <div className="w-full h-full flex items-center justify-center">
                        <ZoomablePane
                            item={singleItems[singleIndex]}
                            title={title}
                            index={singleIndex}
                            total={singleItems.length}
                            onPrev={singleItems.length > 1 ? () => setSingleIndex((i) => (i - 1 + singleItems.length) % singleItems.length) : undefined}
                            onNext={singleItems.length > 1 ? () => setSingleIndex((i) => (i + 1) % singleItems.length) : undefined}
                            zoom={singleZoom}
                            onZoomChange={setSingleZoom}
                            onResetZoom={() => setSingleZoom(1)}
                            alt={singleItems[singleIndex]?.caption || title || 'Photo'}
                            accentColor="slate"
                        />
                    </div>
                )}
            </div>

            {/* Bottom thumbnail reel for single mode with multiple items */}
            {!isCompareMode && singleItems.length > 1 && (
                <div className="flex justify-center gap-2 px-4 pb-3 overflow-x-auto shrink-0" onClick={(e) => e.stopPropagation()}>
                    {singleItems.map((it, i) => (
                        <button
                            key={`${it.url}-${i}`}
                            type="button"
                            onClick={() => {
                                setSingleIndex(i);
                                setSingleZoom(1);
                            }}
                            className={`w-12 h-12 rounded-md overflow-hidden border-2 shrink-0 cursor-pointer ${
                                i === singleIndex ? 'border-orange-500 scale-105' : 'border-transparent opacity-60 hover:opacity-100'
                            }`}
                            aria-label={`Show item ${i + 1}`}
                        >
                            <img src={it.url} alt="" className="w-full h-full object-cover" />
                        </button>
                    ))}
                </div>
            )}
        </div>,
        document.body
    );
}
