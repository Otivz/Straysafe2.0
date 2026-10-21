import { useEffect, useState } from 'react';

// Quick navigation between the sections of a long report page. Only sections that are on the page
// and visible for this report are listed. Phones: a collapsible grid (no sideways swiping); desktop: one wrapping row.
const SectionJumpNav = ({ sections, dep }: { sections: Array<[string, string]>; dep: unknown }) => {
    const [present, setPresent] = useState<string[]>([]);
    const [open, setOpen] = useState(false);

    useEffect(() => {
        const t = setTimeout(() => {
            setPresent(sections.map(([id]) => id).filter((id) => {
                const el = document.getElementById(id);
                return !!el && el.getClientRects().length > 0;
            }));
        }, 300);
        return () => clearTimeout(t);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [dep]);

    if (present.length < 2) return null;

    const jump = (id: string) => {
        document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        setOpen(false);
    };

    return (
        <nav aria-label="Jump to section" className="bg-white border border-gray-200/80 rounded-2xl p-2">
            <button
                type="button"
                onClick={() => setOpen((o) => !o)}
                aria-expanded={open}
                className="md:hidden w-full h-9 px-2 flex items-center justify-between text-xs font-black text-gray-700 cursor-pointer"
            >
                <span>Jump to section</span>
                <svg className={`w-4 h-4 text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5} aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
            </button>
            <div className={`${open ? 'grid' : 'hidden'} md:flex grid-cols-2 min-[400px]:grid-cols-3 md:flex-wrap md:items-center gap-1.5 pt-1.5 md:pt-0`}>
                <span className="hidden md:inline px-2 text-[11px] font-bold text-gray-400">Jump to</span>
                {sections.filter(([id]) => present.includes(id)).map(([id, label]) => (
                    <button
                        key={id}
                        type="button"
                        onClick={() => jump(id)}
                        className="h-9 px-3 rounded-xl text-xs font-bold text-gray-700 bg-gray-50 hover:bg-role-soft hover:text-role-hover cursor-pointer transition-colors truncate"
                    >
                        {label}
                    </button>
                ))}
            </div>
        </nav>
    );
};

export default SectionJumpNav;
