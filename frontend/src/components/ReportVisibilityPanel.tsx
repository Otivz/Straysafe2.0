import { useState } from 'react';
import { Eye, EyeOff, Lock, ShieldCheck, AlertTriangle } from 'lucide-react';
import { api } from '../utils/api';
import { visibilityBadge } from '../utils/reportVisibility';

// Who can see a report (REPORT_VISIBILITY_IMPLEMENTATION.md). The Subdivision Leader handling the case and Admins
// decide; Barangay Staff see the decision read-only. The server enforces every rule; this only shows and asks.
export default function ReportVisibilityPanel({ report, canEdit, onChanged, className = '' }: {
    report: any;
    canEdit: boolean;
    onChanged?: (updated: any) => void;
    className?: string;
}) {
    const [choice, setChoice] = useState<'' | 'Public' | 'Private'>('');
    const [reason, setReason] = useState('');
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');
    if (!report) return null;

    const badge = visibilityBadge(report);
    const decided = Boolean(report.visibility_decided_by);
    const current = report.visibility as string;
    const publicBlocked: string | null = report.public_block_reason || null;
    const needsReason = decided && choice !== '' && choice !== current;

    const save = async () => {
        if (!choice) return;
        if (needsReason && reason.trim().length < 5) {
            setError('Give a reason (at least 5 characters) for changing who can see this report.');
            return;
        }
        setSaving(true);
        setError('');
        try {
            const res = await api.patch(`/reports/${report.report_id}/visibility`, { visibility: choice, reason: reason.trim() || undefined });
            setChoice('');
            setReason('');
            onChanged?.(res.data);
        } catch (e: any) {
            setError(e.response?.data?.detail || 'Could not save the visibility.');
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className={`rounded-2xl border border-gray-200 bg-white p-4 space-y-3 ${className}`}>
            <div className="flex items-center justify-between gap-2">
                <p className="text-[10px] font-black uppercase tracking-widest text-gray-500">Who can see this report</p>
                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider ${badge.isPublic ? 'bg-blue-50 text-blue-700 border border-blue-200' : current === 'Private' ? 'bg-amber-50 text-amber-700 border border-amber-200' : 'bg-gray-100 text-gray-600 border border-gray-200'}`}
                    title={badge.hint}>
                    {badge.isPublic ? <Eye className="w-3 h-3" /> : current === 'Private' ? <Lock className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
                    {badge.label}
                </span>
            </div>
            <p className="text-[11px] font-semibold text-gray-500 leading-snug">{badge.hint}</p>

            {decided ? (
                <p className="text-[10px] font-bold text-gray-500 flex items-start gap-1.5">
                    <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                    <span>
                        Decided by {report.visibility_decided_by_name || 'an official'}
                        {report.visibility_decided_at ? ` on ${new Date(report.visibility_decided_at).toLocaleString()}` : ''}
                        {report.visibility_reason ? ` · "${report.visibility_reason}"` : ''}
                    </span>
                </p>
            ) : report.visibility_needs_review ? (
                <p className="text-[10px] font-bold text-amber-700 flex items-start gap-1.5">
                    <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                    Needs visibility review: the reporter chose Public before leaders decided. It stays hidden from other residents until it is verified.
                </p>
            ) : (
                <p className="text-[10px] font-bold text-gray-500">Not decided yet. Decide when you verify the report, or here.</p>
            )}

            {canEdit ? (
                <div className="space-y-2 pt-1">
                    <div className="grid grid-cols-2 gap-2">
                        {(['Public', 'Private'] as const).map(v => {
                            const blocked = v === 'Public' ? publicBlocked : null;
                            const active = (choice || (decided ? current : '')) === v;
                            return (
                                <button key={v} type="button" disabled={Boolean(blocked) || saving}
                                    onClick={() => { setChoice(v); setError(''); }}
                                    title={blocked || undefined}
                                    className={`py-2 rounded-xl text-[10px] font-black uppercase tracking-wider border-2 transition-all cursor-pointer disabled:cursor-not-allowed disabled:opacity-40 ${active ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'}`}>
                                    {v}
                                </button>
                            );
                        })}
                    </div>
                    {publicBlocked && <p className="text-[10px] font-semibold text-gray-400">Public is not available: {publicBlocked}</p>}
                    {needsReason && (
                        <textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)}
                            placeholder="Why are you changing who can see this report? (required)"
                            className="w-full px-3 py-2 border border-gray-300 rounded-xl text-[11px] font-semibold focus:outline-none focus:border-blue-500 resize-none" />
                    )}
                    {choice && choice !== (decided ? current : '') && (
                        <button type="button" onClick={save} disabled={saving}
                            className="w-full py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white rounded-xl text-[10px] font-black uppercase tracking-widest cursor-pointer">
                            {saving ? 'Saving…' : `Make ${choice}`}
                        </button>
                    )}
                    {error && <p className="text-[10px] font-semibold text-rose-600">{error}</p>}
                </div>
            ) : (
                <p className="text-[10px] font-semibold text-gray-400">Only the Subdivision Leader handling this report can change it.</p>
            )}
        </div>
    );
}
