import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Minus, Plus, Printer, X } from 'lucide-react';
import AdoptionCertificateDocument from './AdoptionCertificateDocument';
import './adoptionDetails.css';

// The certificate is a US Letter page (8.5 x 11 in = 816 x 1056 CSS px); the viewer scales that page to the screen
export const LETTER_WIDTH_PX = 816;

interface Props {
    adoptionId: number;
    applicationData: any;
    refreshKey: number;
    printOnOpen?: boolean;
    onClose: () => void;
}

/** View the existing official document on demand; its content/verification remain unchanged. */
export default function AdoptionCertificateViewer({ adoptionId, applicationData, refreshKey, printOnOpen, onClose }: Props) {
    const dialog = useRef<HTMLDivElement>(null);
    const viewport = useRef<HTMLDivElement>(null);
    const paper = useRef<HTMLDivElement>(null);
    const close = useRef(onClose);
    close.current = onClose;
    const [fitScale, setFitScale] = useState(1);
    const [zoom, setZoom] = useState<number | null>(null);
    const [height, setHeight] = useState(1200);
    const [ready, setReady] = useState(false);
    const printed = useRef(false);
    const scale = zoom ?? fitScale;

    useEffect(() => {
        const previous = document.activeElement as HTMLElement | null;
        const overflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        dialog.current?.focus();
        const keydown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') { event.preventDefault(); close.current(); }
            if (event.key !== 'Tab') return;
            const controls = Array.from(dialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], input, [tabindex="0"]') || []);
            const first = controls[0], last = controls[controls.length - 1];
            if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog.current)) {
                event.preventDefault(); last?.focus();
            } else if (!event.shiftKey && document.activeElement === last) {
                event.preventDefault(); first?.focus();
            }
        };
        document.addEventListener('keydown', keydown);
        return () => { document.body.style.overflow = overflow; document.removeEventListener('keydown', keydown); previous?.focus(); };
    }, []);

    useEffect(() => {
        const measure = () => {
            if (viewport.current) setFitScale(Math.min(1, Math.max(0.15, (viewport.current.clientWidth - 24) / LETTER_WIDTH_PX)));
            if (paper.current) {
                setHeight(paper.current.scrollHeight);
                setReady(Boolean(paper.current.querySelector('#straysafe-adoption-certificate-root')));
            }
        };
        const resize = new ResizeObserver(measure);
        if (viewport.current) resize.observe(viewport.current);
        if (paper.current) resize.observe(paper.current);
        const mutation = new MutationObserver(measure);
        if (paper.current) mutation.observe(paper.current, { childList: true, subtree: true });
        measure();
        return () => { resize.disconnect(); mutation.disconnect(); };
    }, []);

    useEffect(() => {
        if (!printOnOpen || !ready || printed.current) return;
        printed.current = true;
        const frame = requestAnimationFrame(() => { if (typeof window.print === 'function') window.print(); });
        return () => cancelAnimationFrame(frame);
    }, [printOnOpen, ready]);

    return createPortal(
        <div className="adoption-certificate-backdrop" onClick={event => { if (event.target === event.currentTarget) close.current(); }}>
        <div className="adoption-certificate-viewer" ref={dialog} role="dialog" aria-modal="true" aria-labelledby="certificate-viewer-title" tabIndex={-1}>
            <header className="certificate-viewer-toolbar">
                <div className="min-w-0 flex-1">
                    <h2 id="certificate-viewer-title" className="font-black text-sm sm:text-base">Adoption certificate</h2>
                    <p className="text-xs text-slate-500">Fit to screen or zoom for a closer look.</p>
                </div>
                <button type="button" onClick={() => close.current()} aria-label="Close certificate preview" className="certificate-viewer-button"><X className="w-5 h-5" /></button>
                <div className="flex items-center gap-1 w-full sm:w-auto flex-wrap">
                    <button type="button" onClick={() => setZoom(null)} className="certificate-viewer-button">Fit</button>
                    <button type="button" aria-label="Zoom out" disabled={scale <= 0.2} onClick={() => setZoom(Math.max(0.2, scale - 0.15))} className="certificate-viewer-button"><Minus className="w-4 h-4" /></button>
                    <output className="text-xs font-bold min-w-10 text-center" aria-label="Certificate zoom">{Math.round(scale * 100)}%</output>
                    <button type="button" aria-label="Zoom in" disabled={scale >= 1.5} onClick={() => setZoom(Math.min(1.5, scale + 0.15))} className="certificate-viewer-button"><Plus className="w-4 h-4" /></button>
                    <button type="button" disabled={!ready || typeof window.print !== 'function'} onClick={() => window.print()} className="certificate-viewer-button ml-auto"><Printer className="w-4 h-4" /> Print</button>
                </div>
            </header>
            <div ref={viewport} className="certificate-viewer-scroll" tabIndex={0} aria-label="Scrollable certificate document">
                <div className="certificate-scaled-space" style={{ width: LETTER_WIDTH_PX * scale, height: height * scale }}>
                    <div ref={paper} className="certificate-viewer-paper" style={{ transform: `scale(${scale})` }}>
                        <AdoptionCertificateDocument key={`${adoptionId}-${refreshKey}`} adoptionId={adoptionId} applicationData={applicationData} />
                    </div>
                </div>
            </div>
        </div>
        </div>, document.body,
    );
}
