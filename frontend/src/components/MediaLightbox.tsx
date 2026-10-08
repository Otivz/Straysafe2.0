import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';

export interface LightboxItem {
    url: string;
    type?: 'Image' | 'Video' | string;
    caption?: string;
}

// Full-screen photo/video viewer. Rendered into <body> so it sits above any modal.
// Esc / ✕ / click outside closes it; arrows or ← → keys step through several items.
export default function MediaLightbox({ items, startIndex = 0, title, onClose }: {
    items: LightboxItem[];
    startIndex?: number;
    title?: string;
    onClose: () => void;
}) {
    const [index, setIndex] = useState(Math.min(Math.max(startIndex, 0), Math.max(items.length - 1, 0)));
    const count = items.length;
    const step = useCallback((d: number) => setIndex((i) => (i + d + count) % count), [count]);

    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') { e.stopImmediatePropagation(); onClose(); }
            else if (e.key === 'ArrowRight' && count > 1) step(1);
            else if (e.key === 'ArrowLeft' && count > 1) step(-1);
        };
        window.addEventListener('keydown', onKey, true);
        const prevOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        return () => {
            window.removeEventListener('keydown', onKey, true);
            document.body.style.overflow = prevOverflow;
        };
    }, [count, onClose, step]);

    if (!count) return null;
    const item = items[index];
    const isVideo = item.type === 'Video' || /\.(mp4|mov|webm|avi)(\?|$)/i.test(item.url);

    return createPortal(
        <div
            className="fixed inset-0 z-[20000] bg-black/95 flex flex-col animate-in fade-in duration-150"
            onClick={onClose}
            role="dialog"
            aria-modal="true"
            aria-label={title || 'Photo viewer'}
        >
            <div className="flex items-center justify-between gap-3 px-4 sm:px-6 py-3 text-white shrink-0" onClick={(e) => e.stopPropagation()}>
                <div className="min-w-0">
                    {title && <p className="text-sm font-bold truncate">{title}</p>}
                    {(item.caption || count > 1) && (
                        <p className="text-xs text-white/60 truncate">
                            {count > 1 ? `${index + 1} / ${count}` : ''}{item.caption ? `${count > 1 ? ' · ' : ''}${item.caption}` : ''}
                        </p>
                    )}
                </div>
                <button
                    type="button"
                    onClick={onClose}
                    className="p-2.5 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors cursor-pointer"
                    aria-label="Close full screen view"
                >
                    <X className="w-6 h-6" />
                </button>
            </div>

            <div className="relative flex-1 min-h-0 flex items-center justify-center px-2 sm:px-16 pb-4">
                {isVideo ? (
                    <video
                        key={item.url}
                        src={item.url}
                        controls
                        autoPlay
                        className="max-w-full max-h-full rounded-lg shadow-2xl"
                        onClick={(e) => e.stopPropagation()}
                    />
                ) : (
                    <img
                        key={item.url}
                        src={item.url}
                        alt={item.caption || title || 'Full screen photo'}
                        className="max-w-full max-h-full object-contain rounded-lg shadow-2xl select-none"
                        onClick={(e) => e.stopPropagation()}
                        draggable={false}
                    />
                )}

                {count > 1 && (
                    <>
                        <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); step(-1); }}
                            className="absolute left-2 sm:left-4 top-1/2 -translate-y-1/2 p-3 rounded-full bg-white/10 hover:bg-white/25 text-white transition-colors cursor-pointer"
                            aria-label="Previous photo"
                        >
                            <ChevronLeft className="w-7 h-7" />
                        </button>
                        <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); step(1); }}
                            className="absolute right-2 sm:right-4 top-1/2 -translate-y-1/2 p-3 rounded-full bg-white/10 hover:bg-white/25 text-white transition-colors cursor-pointer"
                            aria-label="Next photo"
                        >
                            <ChevronRight className="w-7 h-7" />
                        </button>
                    </>
                )}
            </div>

            {count > 1 && (
                <div className="flex justify-center gap-2 px-4 pb-4 overflow-x-auto shrink-0" onClick={(e) => e.stopPropagation()}>
                    {items.map((it, i) => (
                        <button
                            key={`${it.url}-${i}`}
                            type="button"
                            onClick={() => setIndex(i)}
                            className={`w-14 h-14 rounded-md overflow-hidden border-2 shrink-0 cursor-pointer ${i === index ? 'border-white' : 'border-transparent opacity-60 hover:opacity-100'}`}
                            aria-label={`Show item ${i + 1}`}
                        >
                            {it.type === 'Video' ? (
                                <div className="w-full h-full bg-white/10 text-white text-[10px] font-bold flex items-center justify-center">▶ Video</div>
                            ) : (
                                <img src={it.url} alt="" className="w-full h-full object-cover" />
                            )}
                        </button>
                    ))}
                </div>
            )}
        </div>,
        document.body
    );
}
