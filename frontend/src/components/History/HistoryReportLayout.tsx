import { useId, useRef, useState, type ReactNode } from 'react';

const views = [
    { id: 'summary', label: 'Summary' },
    { id: 'details', label: 'Report details' },
    { id: 'activity', label: 'Activity' },
] as const;

interface HistoryReportLayoutProps {
    reportId: number;
    category: string;
    landmark?: string;
    summary: ReactNode;
    details: ReactNode;
    activity: ReactNode;
}

/** Keeps the existing history components in three focused, keyboard-accessible views. */
export default function HistoryReportLayout({ reportId, category, landmark, summary, details, activity }: HistoryReportLayoutProps) {
    const [active, setActive] = useState(0);
    const id = useId();
    const tabs = useRef<(HTMLButtonElement | null)[]>([]);
    const content = [summary, details, activity];

    return (
        <div data-history-layout className="min-w-0 space-y-6">
            <header className="space-y-1.5">
                <p className="text-xs font-medium text-gray-500">Report history</p>
                <h2 className="text-2xl font-semibold tracking-tight text-gray-900 sm:text-3xl">Report #{reportId}</h2>
                <p className="break-words text-sm text-gray-500">{category}{landmark ? ` · ${landmark}` : ''}</p>
            </header>

            <div role="tablist" aria-label="History report sections" className="flex gap-1 border-b border-gray-200">
                {views.map((view, index) => (
                    <button key={view.id} ref={node => { tabs.current[index] = node; }} type="button" role="tab"
                        id={`${id}-${view.id}-tab`} aria-controls={`${id}-${view.id}-panel`}
                        aria-selected={active === index} tabIndex={active === index ? 0 : -1}
                        onClick={() => setActive(index)}
                        onKeyDown={event => {
                            let next: number;
                            if (event.key === 'ArrowRight') next = (index + 1) % views.length;
                            else if (event.key === 'ArrowLeft') next = (index + views.length - 1) % views.length;
                            else if (event.key === 'Home') next = 0;
                            else if (event.key === 'End') next = views.length - 1;
                            else return;
                            event.preventDefault();
                            setActive(next);
                            tabs.current[next]?.focus();
                        }}
                        className={`min-h-11 border-b-2 px-3 py-3 text-sm font-medium transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-role sm:px-5 ${active === index
                            ? 'border-role text-gray-900' : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-900'}`}>
                        {view.label}
                    </button>
                ))}
            </div>

            {views.map((view, index) => (
                <div key={view.id} role="tabpanel" id={`${id}-${view.id}-panel`} aria-labelledby={`${id}-${view.id}-tab`}
                    hidden={active !== index} tabIndex={0} className="min-w-0 focus-visible:outline-2 focus-visible:outline-role">
                    {active === index && content[index]}
                </div>
            ))}
        </div>
    );
}
