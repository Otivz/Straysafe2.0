import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Cpu, Layers } from 'lucide-react';
import api from '../utils/api';
import { cloudinaryResized } from '../utils/cloudinaryImage';
import { DEFAULT_PET_AVATAR } from '../utils/avatar';

// A group report (MULTI_ANIMAL_REPORT_PLAN.md) has one AI summary, made from the original photo, so it may describe
// only one of the animals. This lists each animal record's own AI analysis next to it. Officials only.
type AnimalAI = {
    animal_type?: string | null; color?: string | null; breed?: string | null; size?: string | null;
    risk_level?: string | null; reason?: string | null; behavior?: string | null; photo_status?: string | null;
};
type Card = { report_id: number; label: string; photo_url?: string | null; animal_type?: string | null;
    animal_color?: string | null; status_name?: string | null; ai?: AnimalAI };

const RISK_STYLE: Record<string, string> = {
    'High Risk': 'bg-rose-50 text-rose-700 border-rose-200',
    'Medium Risk': 'bg-amber-50 text-amber-700 border-amber-200',
    'Low Risk': 'bg-emerald-50 text-emerald-700 border-emerald-200',
};

export default function GroupAISummary({ reportId, basePath }: { reportId: number; basePath: string }) {
    const [cards, setCards] = useState<Card[] | null>(null);

    useEffect(() => {
        let alive = true;
        api.get(`/reports/${reportId}/split-group`)
            .then((res) => { if (alive) setCards(res.data?.is_group ? (res.data.children || []) : []); })
            .catch(() => { if (alive) setCards([]); });
        return () => { alive = false; };
    }, [reportId]);

    if (!cards || cards.length === 0) return null;
    return (
        <div className="rounded-2xl border border-role-border bg-role-soft/40 p-3.5 space-y-2.5">
            <div className="flex items-start gap-2">
                <Layers className="w-4 h-4 text-role mt-0.5 shrink-0" />
                <div>
                    <p className="text-[11px] font-black text-gray-900 uppercase tracking-wider">AI per animal · {cards.length} animals</p>
                    <p className="text-[10px] font-semibold text-gray-500 leading-snug">
                        The AI summary below was made from the original photo, so it may describe only one animal.
                        Each animal record has its own analysis. Priority stays the group's.
                    </p>
                </div>
            </div>
            <div className="space-y-2">
                {cards.map((c) => {
                    const ai = c.ai || {};
                    const traits = [ai.animal_type || c.animal_type, ai.color || c.animal_color, ai.breed, ai.size]
                        .filter((t) => t && t !== 'Unknown').join(' · ');
                    const pending = !ai.risk_level && !ai.reason && !ai.breed;
                    return (
                        <Link key={c.report_id} to={`${basePath}/${c.report_id}`}
                            className="flex gap-2.5 p-2 rounded-xl bg-white dark:bg-white/5 border border-gray-100 hover:border-role-border transition-colors">
                            <img src={c.photo_url ? cloudinaryResized(c.photo_url, 96) : DEFAULT_PET_AVATAR} alt={c.label}
                                className="w-11 h-11 rounded-lg object-cover shrink-0" />
                            <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-1.5 flex-wrap">
                                    <span className="text-[11px] font-black text-gray-900 dark:text-white">{c.label}</span>
                                    <span className="text-[9px] font-bold text-gray-400">#{c.report_id}</span>
                                    {ai.risk_level && (
                                        <span className={`px-1.5 py-0.5 rounded-full border text-[9px] font-black ${RISK_STYLE[ai.risk_level] || 'bg-gray-50 text-gray-600 border-gray-200'}`}>
                                            {ai.risk_level}
                                        </span>
                                    )}
                                </div>
                                {traits && <p className="text-[10px] font-semibold text-gray-600 truncate">{traits}</p>}
                                <p className="text-[10px] text-gray-500 leading-snug line-clamp-2 flex items-start gap-1">
                                    <Cpu className="w-3 h-3 mt-px shrink-0 text-gray-400" />
                                    <span>{pending ? 'AI analysis is still running for this animal.' : (ai.behavior || ai.reason)}</span>
                                </p>
                            </div>
                        </Link>
                    );
                })}
            </div>
        </div>
    );
}
