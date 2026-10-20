import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Crop, X } from 'lucide-react';

// Crop one animal out of a photo (MULTI_ANIMAL_REPORT_PLAN.md). Drag on the photo to draw the box, drag inside the box
// to move it, and drag a corner handle to resize it. The crop is cut from the full-resolution image on a canvas (no
// extra library) and returned as a JPEG file. The original photo is never changed.

type Box = { x: number; y: number; w: number; h: number };   // in displayed-image pixels
type Corner = 'nw' | 'ne' | 'sw' | 'se';
const MIN = 24;                                              // smallest box side, in displayed pixels

export default function PhotoCropper({ src, onCropped, onClose, title = 'Crop the animal' }: {
    src: string;                                   // image URL (Cloudinary) or an object URL of a local file
    onCropped: (file: File, previewUrl: string) => void;
    onClose: () => void;
    title?: string;
}) {
    const imgRef = useRef<HTMLImageElement>(null);
    const [box, setBox] = useState<Box | null>(null);
    const [error, setError] = useState('');
    const [loaded, setLoaded] = useState(false);
    const drag = useRef<{ mode: 'draw' | 'move' | 'resize'; sx: number; sy: number; start: Box | null; corner?: Corner } | null>(null);

    useEffect(() => { setBox(null); setLoaded(false); setError(''); }, [src]);

    const point = (e: React.PointerEvent) => {
        const r = imgRef.current!.getBoundingClientRect();
        return { x: Math.min(Math.max(e.clientX - r.left, 0), r.width), y: Math.min(Math.max(e.clientY - r.top, 0), r.height), r };
    };
    const inside = (p: { x: number; y: number }, b: Box | null) => !!b && p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h;

    const onDown = (e: React.PointerEvent) => {
        if (!loaded) return;
        (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
        const p = point(e);
        drag.current = inside(p, box) ? { mode: 'move', sx: p.x, sy: p.y, start: box } : { mode: 'draw', sx: p.x, sy: p.y, start: null };
        if (!inside(p, box)) setBox({ x: p.x, y: p.y, w: 0, h: 0 });
    };
    const onHandleDown = (corner: Corner) => (e: React.PointerEvent) => {
        e.stopPropagation();
        if (!box) return;
        (e.currentTarget.parentElement?.parentElement as Element | null)?.setPointerCapture?.(e.pointerId);
        const p = point(e);
        drag.current = { mode: 'resize', sx: p.x, sy: p.y, start: box, corner };
    };
    const onMove = (e: React.PointerEvent) => {
        if (!drag.current) return;
        const { x, y, r } = point(e);
        const d = drag.current;
        if (d.mode === 'draw') {
            setBox({ x: Math.min(d.sx, x), y: Math.min(d.sy, y), w: Math.abs(x - d.sx), h: Math.abs(y - d.sy) });
        } else if (d.mode === 'move' && d.start) {
            const nx = Math.min(Math.max(d.start.x + (x - d.sx), 0), r.width - d.start.w);
            const ny = Math.min(Math.max(d.start.y + (y - d.sy), 0), r.height - d.start.h);
            setBox({ ...d.start, x: nx, y: ny });
        } else if (d.mode === 'resize' && d.start && d.corner) {
            // the opposite corner stays put; the dragged corner follows the pointer (kept inside the photo)
            const s = d.start;
            let left = s.x, top = s.y, right = s.x + s.w, bottom = s.y + s.h;
            if (d.corner.includes('w')) left = Math.min(x, right - MIN);
            if (d.corner.includes('e')) right = Math.max(x, left + MIN);
            if (d.corner.includes('n')) top = Math.min(y, bottom - MIN);
            if (d.corner.includes('s')) bottom = Math.max(y, top + MIN);
            left = Math.max(0, left); top = Math.max(0, top);
            right = Math.min(r.width, right); bottom = Math.min(r.height, bottom);
            setBox({ x: left, y: top, w: right - left, h: bottom - top });
        }
    };
    const onUp = () => { drag.current = null; };

    const apply = async () => {
        const img = imgRef.current;
        if (!img || !box || box.w < 20 || box.h < 20) {
            setError('Drag on the photo to draw a box around one animal.');
            return;
        }
        const r = img.getBoundingClientRect();
        const sx = img.naturalWidth / r.width, sy = img.naturalHeight / r.height;
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(box.w * sx);
        canvas.height = Math.round(box.h * sy);
        const ctx = canvas.getContext('2d');
        if (!ctx) { setError('This browser cannot crop images.'); return; }
        try {
            ctx.drawImage(img, box.x * sx, box.y * sy, box.w * sx, box.h * sy, 0, 0, canvas.width, canvas.height);
            const blob: Blob | null = await new Promise((res) => canvas.toBlob(res, 'image/jpeg', 0.92));
            if (!blob) throw new Error('empty');
            const file = new File([blob], `animal-crop-${Date.now()}.jpg`, { type: 'image/jpeg' });
            onCropped(file, URL.createObjectURL(blob));
        } catch {
            setError('This photo could not be cropped here. Upload a close-up photo instead.');
        }
    };

    const handle = (corner: Corner, cls: string) => (
        <span onPointerDown={onHandleDown(corner)}
            className={`absolute w-5 h-5 sm:w-3.5 sm:h-3.5 bg-white border-2 border-[var(--color-role,#F97316)] rounded-full shadow pointer-events-auto touch-none ${cls}`}
            style={{ cursor: corner === 'nw' || corner === 'se' ? 'nwse-resize' : 'nesw-resize' }} />
    );

    return createPortal(
        <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/70 p-2 sm:p-4" onClick={onClose}>
            <div className="bg-white dark:bg-[#151B26] rounded-3xl w-full max-w-2xl p-3 sm:p-5 space-y-3 sm:space-y-4 shadow-2xl max-h-[96vh] overflow-y-auto"
                onClick={(e) => e.stopPropagation()}>
                <div className="flex items-center justify-between">
                    <p className="text-sm font-black text-gray-900 dark:text-white flex items-center gap-2"><Crop className="w-4 h-4 text-role" /> {title}</p>
                    <button type="button" onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-white/10 cursor-pointer"><X className="w-4 h-4" /></button>
                </div>
                <p className="text-[11px] font-semibold text-gray-500">
                    Drag on the photo to draw a box around <strong>one</strong> animal. Drag inside the box to move it, or drag a
                    corner to resize it. The original photo is kept unchanged.
                </p>
                <div className="relative mx-auto w-fit max-h-[72vh] sm:max-h-[60vh] select-none touch-none"
                    onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}>
                    <img ref={imgRef} src={src} crossOrigin="anonymous" alt="Photo to crop" draggable={false}
                        onLoad={() => setLoaded(true)} onError={() => setError('The photo could not be loaded for cropping.')}
                        className="max-h-[72vh] sm:max-h-[60vh] max-w-full block rounded-xl" />
                    {box && box.w > 0 && (
                        <div className="absolute border-2 border-white shadow-[0_0_0_9999px_rgba(0,0,0,0.5)] rounded-md pointer-events-none"
                            style={{ left: box.x, top: box.y, width: box.w, height: box.h }}>
                            {box.w >= MIN && box.h >= MIN && (
                                <>
                                    {handle('nw', '-top-2.5 -left-2.5 sm:-top-2 sm:-left-2')}
                                    {handle('ne', '-top-2.5 -right-2.5 sm:-top-2 sm:-right-2')}
                                    {handle('sw', '-bottom-2.5 -left-2.5 sm:-bottom-2 sm:-left-2')}
                                    {handle('se', '-bottom-2.5 -right-2.5 sm:-bottom-2 sm:-right-2')}
                                </>
                            )}
                        </div>
                    )}
                </div>
                {error && <p className="text-[11px] font-semibold text-rose-600">{error}</p>}
                <div className="flex justify-end gap-2">
                    <button type="button" onClick={onClose} className="px-4 py-2 rounded-xl border border-gray-200 text-xs font-black text-gray-600 hover:bg-gray-50 cursor-pointer">Cancel</button>
                    <button type="button" onClick={apply} disabled={!loaded}
                        className="px-4 py-2 rounded-xl bg-role hover:bg-role-hover text-white text-xs font-black disabled:opacity-50 cursor-pointer">Use this crop</button>
                </div>
            </div>
        </div>,
        document.body,
    );
}
