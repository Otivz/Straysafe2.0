import { useEffect, useRef, useState } from 'react';
import type { CSSProperties, ReactNode, RefObject } from 'react';
import { createPortal } from 'react-dom';
import './notificationPanel.css';

interface NotificationPanelProps {
    isOpen: boolean;
    onClose: () => void;
    triggerRef: RefObject<HTMLElement | null>;
    children: ReactNode;
    className?: string;
}

// Keep the panel mounted so closing it preserves its list, filters and scroll position.
// Portaling also keeps mobile panels outside sticky headers and transformed ancestors.
export default function NotificationPanel({ isOpen, onClose, triggerRef, children, className = '' }: NotificationPanelProps) {
    const panelRef = useRef<HTMLDivElement>(null);
    const closeRef = useRef(onClose);
    const [position, setPosition] = useState({ top: 80, right: 16 });
    useEffect(() => { closeRef.current = onClose; }, [onClose]);

    useEffect(() => {
        if (!isOpen) return;
        const panel = panelRef.current;
        const mobile = window.matchMedia('(max-width: 639px)');
        const updatePosition = () => {
            const bounds = triggerRef.current?.getBoundingClientRect();
            if (bounds && bounds.width === 0) {
                closeRef.current();
                return;
            }
            setPosition({
                top: Math.max(8, Math.min((bounds?.bottom ?? 68) + 12, window.innerHeight - 160)),
                right: Math.max(16, window.innerWidth - (bounds?.right ?? window.innerWidth - 16)),
            });
        };
        updatePosition();
        panel?.focus({ preventScroll: true });
        const previousOverflow = document.body.style.overflow;
        const updateScrollLock = () => { document.body.style.overflow = mobile.matches ? 'hidden' : previousOverflow; };
        updateScrollLock();
        const dismiss = (event: PointerEvent) => {
            const target = event.target as Node;
            if (!panel?.contains(target) && !triggerRef.current?.contains(target)) closeRef.current();
        };
        const handleKey = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                event.preventDefault();
                closeRef.current();
                triggerRef.current?.querySelector<HTMLElement>('button')?.focus();
                if (triggerRef.current?.tagName === 'BUTTON') triggerRef.current.focus();
            }
            if (event.key === 'Tab' && mobile.matches && panel) {
                const buttons = [...panel.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], [tabindex="0"]')];
                const first = buttons[0];
                const last = buttons[buttons.length - 1];
                if (event.shiftKey && (document.activeElement === first || document.activeElement === panel)) {
                    event.preventDefault(); last?.focus();
                } else if (!event.shiftKey && document.activeElement === last) {
                    event.preventDefault(); first?.focus();
                }
            }
        };
        document.addEventListener('pointerdown', dismiss);
        document.addEventListener('keydown', handleKey);
        window.addEventListener('resize', updatePosition);
        mobile.addEventListener('change', updateScrollLock);
        return () => {
            document.body.style.overflow = previousOverflow;
            document.removeEventListener('pointerdown', dismiss);
            document.removeEventListener('keydown', handleKey);
            window.removeEventListener('resize', updatePosition);
            mobile.removeEventListener('change', updateScrollLock);
        };
    }, [isOpen, triggerRef]);

    return createPortal(
        <div
            ref={panelRef}
            role="dialog"
            aria-label="Notifications"
            tabIndex={-1}
            hidden={!isOpen}
            data-notification-panel="true"
            className={`notification-panel bg-white dark:bg-[#151C2C] border border-gray-100 dark:border-gray-800 shadow-2xl ${className}`}
            style={{ '--notification-top': `${position.top}px`, '--notification-right': `${position.right}px` } as CSSProperties}
        >
            {children}
        </div>, document.body,
    );
}
