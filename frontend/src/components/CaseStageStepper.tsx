import { Link } from 'react-router-dom';
import { Check, Minus, MapPin, Truck, ShieldCheck, Home, Info } from 'lucide-react';
import type { CaseStages, CaseStep, WhereNow, WhereTone } from '../utils/caseStages';

// Resident view of where a case is (RESCUE_TIMELINE_IMPROVEMENT_PLAN.md, Phase 1): five steps with done / current /
// upcoming / skipped states. Tapping a reached step scrolls the timeline to the entry where it happened.
// Phase 2: the banner on top says in one sentence where the animal is now.

const TONES: Record<WhereTone, { box: string; icon: string; Icon: any }> = {
    progress: { box: 'bg-role-soft/60 border-role-border/60 dark:bg-role-strong/20 dark:border-role-strong/40', icon: 'bg-role text-white', Icon: MapPin },
    rescue: { box: 'bg-orange-50 border-orange-200 dark:bg-orange-950/30 dark:border-orange-900/50', icon: 'bg-orange-500 text-white', Icon: Truck },
    safe: { box: 'bg-emerald-50 border-emerald-200 dark:bg-emerald-950/30 dark:border-emerald-900/50', icon: 'bg-emerald-600 text-white', Icon: ShieldCheck },
    good: { box: 'bg-emerald-50 border-emerald-200 dark:bg-emerald-950/30 dark:border-emerald-900/50', icon: 'bg-emerald-600 text-white', Icon: Home },
    closed: { box: 'bg-slate-50 border-slate-200 dark:bg-gray-800/60 dark:border-gray-700', icon: 'bg-slate-500 text-white', Icon: Info },
};

function WhereNowBanner({ where }: { where: WhereNow }) {
    const t = TONES[where.tone];
    return (
        <div className={`flex items-start gap-2.5 rounded-xl border px-3 py-2.5 mb-3 ${t.box}`} role="status">
            <span className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${t.icon}`}><t.Icon className="w-4 h-4" /></span>
            <div className="min-w-0">
                <p className="text-[9px] font-black uppercase tracking-widest text-gray-500 dark:text-gray-400">Where is the animal now</p>
                <p className="text-xs font-semibold text-gray-800 dark:text-gray-100 leading-snug">
                    {where.parts.map((p, i) => (p.strong ? <strong key={i} className="font-black">{p.text}</strong> : <span key={i}>{p.text}</span>))}
                </p>
                {where.mergedInto && (
                    <Link to={`/resident/reports/${where.mergedInto}`} className="inline-block mt-1 text-[10px] font-black uppercase tracking-wider text-role hover:underline">
                        Open Case #{where.mergedInto}
                    </Link>
                )}
            </div>
        </div>
    );
}

const fmt = (d: string | null) => {
    if (!d) return '';
    const t = new Date(d);
    if (isNaN(t.getTime())) return '';
    return t.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
};

export default function CaseStageStepper({ stages, whereNow, onStepClick, className = '' }: {
    stages: CaseStages;
    whereNow?: WhereNow;
    onStepClick?: (step: CaseStep) => void;
    className?: string;
}) {
    const { steps, currentIndex, currentLabel, outcome } = stages;
    const sadEnding = outcome !== null && outcome !== 'good';
    const doneTone = (i: number) => (sadEnding && i === steps.length - 1 ? 'bg-slate-500 text-white' : 'bg-emerald-600 text-white');
    const lineTone = (i: number) => (steps[i + 1] && steps[i + 1].state !== 'upcoming' ? 'bg-emerald-500' : 'bg-gray-200 dark:bg-gray-700');
    const clickable = (s: CaseStep) => Boolean(onStepClick) && (s.state === 'done' || s.state === 'current');

    const node = (s: CaseStep, i: number) => {
        const base = 'w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-black shrink-0 transition-all';
        if (s.state === 'done') return <span className={`${base} ${doneTone(i)}`}><Check className="w-3.5 h-3.5" /></span>;
        if (s.state === 'current') return <span className={`${base} bg-role text-white ring-4 ring-role-soft dark:ring-role-strong/40`}>{i + 1}</span>;
        if (s.state === 'skipped') return <span className={`${base} border-2 border-dashed border-gray-300 dark:border-gray-600 text-gray-400`}><Minus className="w-3 h-3" /></span>;
        return <span className={`${base} border-2 border-gray-200 dark:border-gray-700 text-gray-400 bg-white dark:bg-[#1E2738]`}>{i + 1}</span>;
    };

    const sub = (s: CaseStep) => (s.state === 'skipped' ? 'Not needed' : s.state === 'upcoming' ? '' : fmt(s.date));
    const current = steps[currentIndex];

    return (
        <div className={`rounded-2xl border border-gray-100 dark:border-gray-800 bg-white dark:bg-[#1E2738] p-3 sm:p-4 ${className}`}>
            {whereNow && <WhereNowBanner where={whereNow} />}
            {/* Phones: one line + progress segments */}
            <div className="sm:hidden">
                <div className="flex items-center justify-between gap-2">
                    <p className="text-[10px] font-black uppercase tracking-widest text-gray-500 dark:text-gray-400">
                        Step {currentIndex + 1} of {steps.length} · {current?.label}
                    </p>
                    {outcome && <span className={`text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full ${sadEnding ? 'bg-slate-100 text-slate-600 dark:bg-gray-800 dark:text-gray-300' : 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300'}`}>Closed</span>}
                </div>
                <div className="mt-2 grid grid-cols-5 gap-1" aria-hidden="true">
                    {steps.map((s, i) => (
                        <button key={s.key} type="button" disabled={!clickable(s)} onClick={() => onStepClick?.(s)} title={s.label}
                            className={`h-1.5 rounded-full ${s.state === 'done' ? (sadEnding && i === steps.length - 1 ? 'bg-slate-400' : 'bg-emerald-500') : s.state === 'current' ? 'bg-role' : s.state === 'skipped' ? 'bg-gray-200 dark:bg-gray-700 opacity-60' : 'bg-gray-200 dark:bg-gray-700'}`} />
                    ))}
                </div>
                {!whereNow && <p className="mt-2 text-xs font-bold text-gray-800 dark:text-gray-100">{currentLabel}</p>}
            </div>

            {/* Wider screens: the five steps */}
            <div className="hidden sm:block">
                <ol className="flex items-start">
                    {steps.map((s, i) => (
                        <li key={s.key} className="flex-1 min-w-0 flex flex-col items-center relative">
                            {i < steps.length - 1 && (
                                <span className={`absolute top-3.5 left-1/2 w-full h-0.5 ${lineTone(i)}`} aria-hidden="true" />
                            )}
                            <button type="button" disabled={!clickable(s)} onClick={() => onStepClick?.(s)}
                                className="relative z-10 flex flex-col items-center gap-1 px-1 disabled:cursor-default cursor-pointer group"
                                aria-current={s.state === 'current' ? 'step' : undefined}
                                title={clickable(s) ? 'Show this in the timeline' : undefined}>
                                {node(s, i)}
                                <span className={`text-[10px] font-black uppercase tracking-wider text-center leading-tight ${s.state === 'current' ? 'text-role' : s.state === 'done' ? 'text-gray-800 dark:text-gray-100' : 'text-gray-400'} ${clickable(s) ? 'group-hover:underline' : ''}`}>
                                    {s.label}
                                </span>
                                <span className="text-[9px] font-semibold text-gray-400 text-center leading-tight min-h-[11px]">{sub(s)}</span>
                            </button>
                        </li>
                    ))}
                </ol>
                {!whereNow && <p className="mt-2 text-center text-xs font-bold text-gray-800 dark:text-gray-100">{currentLabel}</p>}
            </div>
        </div>
    );
}
