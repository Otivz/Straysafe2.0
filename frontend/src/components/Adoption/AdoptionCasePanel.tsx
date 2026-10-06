import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, ClipboardList, Crown, Loader2, UserPlus, X } from 'lucide-react';
import { api } from '../../utils/api';

// Case owner + task assignments for one adoption application (Barangay side).
// Every rule is enforced by the backend; this panel only mirrors it (e.g. hides Assign for non-owners).

export interface CaseAssignment {
    assignment_id: number;
    adoption_id: number;
    task_type: string;
    task_label: string;
    milestone_name?: string | null;
    assigned_to?: number | null;
    assigned_to_name?: string | null;
    assigned_by_name?: string | null;
    status: string;
    scheduled_at?: string | null;
    due_at?: string | null;
    assigned_at?: string | null;
    accepted_at?: string | null;
    decline_reason?: string | null;
    completed_at?: string | null;
    remarks?: string | null;
}

interface CaseInfo {
    adoption_id: number;
    case_owner_id?: number | null;
    case_owner_name?: string | null;
    is_owner: boolean;
    can_claim: boolean;
    can_assign: boolean;
    assignments: CaseAssignment[];
}

interface StaffOption {
    user_id: number;
    name: string;
    position_name?: string | null;
    is_head_officer?: boolean;
    open_tasks?: number;
}

const TASKS: Array<{ type: string; label: string; hint: string }> = [
    { type: 'Verification', label: 'Document Verification', hint: 'ID, residency and blacklist checks' },
    { type: 'Interview', label: 'Interview', hint: 'Conduct & record the interview' },
    { type: 'Home_Visit', label: 'Home Visit', hint: 'Schedule, inspect and record the assessment' },
    { type: 'Handover', label: 'Handover', hint: 'Release the pet to the adopter' },
    { type: 'Monitoring', label: 'Monitoring', hint: 'Day 7 / 14 / 30 welfare assessments' },
];

const OPEN = ['Assigned', 'Accepted', 'In_Progress'];

export const STATUS_STYLES: Record<string, string> = {
    Assigned: 'bg-amber-50 text-amber-800 border-amber-200',
    Accepted: 'bg-blue-50 text-blue-800 border-blue-200',
    In_Progress: 'bg-indigo-50 text-indigo-800 border-indigo-200',
    Completed: 'bg-emerald-50 text-emerald-800 border-emerald-200',
    Declined: 'bg-rose-50 text-rose-800 border-rose-200',
    Cancelled: 'bg-slate-100 text-slate-600 border-slate-200',
    Reassigned: 'bg-slate-100 text-slate-600 border-slate-200',
};
export const STATUS_LABELS: Record<string, string> = {
    Assigned: 'Waiting for acceptance',
    Accepted: 'Accepted',
    In_Progress: 'In progress',
    Completed: 'Completed',
    Declined: 'Declined',
    Cancelled: 'Cancelled',
    Reassigned: 'Reassigned',
};

const fmt = (d?: string | null) => (d ? new Date(d).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '');

const PENDING_DECISION: Record<string, string> = {
    Verification_Failed_Pending_Decision: 'The assigned staff recorded a FAILED verification.',
    Interview_Unsuccessful_Pending_Decision: 'The assigned interviewer rated the interview UNSUCCESSFUL.',
    Home_Visit_Not_Suitable_Pending_Decision: 'The assigned inspector assessed the home as NOT SUITABLE.',
};

// A step counts as done once the application has moved past it, even if nobody was formally assigned to it
// (for example Verification is completed when the application is accepted).
const STAGE_ORDER = ['Application', 'Verification', 'Interview', 'Home_Visit', 'Review', 'Approval', 'Certificate', 'Handover', 'Monitoring', 'Successful_Adoption'];
const DONE_WHEN_STAGE_REACHES: Record<string, string> = {
    Verification: 'Interview',
    Interview: 'Home_Visit',
    Home_Visit: 'Review',
    Handover: 'Monitoring',
    Monitoring: 'Successful_Adoption',
};
const stageAlreadyDone = (taskType: string, currentStage?: string | null) => {
    const reached = DONE_WHEN_STAGE_REACHES[taskType];
    if (!reached || !currentStage) return false;
    const now = STAGE_ORDER.indexOf(currentStage);
    return now >= 0 && now >= STAGE_ORDER.indexOf(reached);
};

interface Props {
    adoptionId: number;
    /** The application's current stage; steps before it are shown as completed. */
    currentStage?: string | null;
    applicationStageStatus?: string | null;
    /** Changes whenever the application row changes (e.g. after a stage modal saves) to refresh the panel. */
    refreshToken?: string;
    onChanged?: () => void;
    onRejectRequested?: () => void;
}

export default function AdoptionCasePanel({ adoptionId, currentStage, applicationStageStatus, refreshToken, onChanged, onRejectRequested }: Props) {
    const [info, setInfo] = useState<CaseInfo | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);
    const [assigning, setAssigning] = useState<string | null>(null);
    const [staff, setStaff] = useState<StaffOption[]>([]);
    const [target, setTarget] = useState<number | ''>('');
    const [dueAt, setDueAt] = useState('');
    const [remarks, setRemarks] = useState('');

    const load = useCallback(async () => {
        try {
            const res = await api.get(`/adoptions/${adoptionId}/case`);
            setInfo(res.data);
            setError(null);
        } catch (err: any) {
            setError(err.response?.data?.detail || 'Could not load case assignments.');
        } finally {
            setLoading(false);
        }
    }, [adoptionId]);

    // Reload on open and whenever the application row changes (refreshToken)
    useEffect(() => {
        load();
    }, [load, refreshToken]);

    const openAssign = async (taskType: string) => {
        setAssigning(taskType);
        setTarget('');
        setDueAt('');
        setRemarks('');
        try {
            const res = await api.get(`/adoptions/${adoptionId}/assignable-staff`);
            setStaff(Array.isArray(res.data) ? res.data : []);
        } catch {
            setStaff([]);
        }
    };

    const run = async (fn: () => Promise<unknown>) => {
        setBusy(true);
        setError(null);
        try {
            await fn();
            await load();
            onChanged?.();
        } catch (err: any) {
            setError(err.response?.data?.detail || 'Action failed.');
        } finally {
            setBusy(false);
        }
    };

    const submitAssign = () => {
        if (!assigning || target === '') return;
        run(async () => {
            await api.post(`/adoptions/${adoptionId}/assignments`, {
                task_type: assigning,
                assigned_to: target,
                due_at: dueAt ? new Date(dueAt).toISOString() : undefined,
                remarks: remarks.trim() || undefined,
            });
            setAssigning(null);
        });
    };

    if (loading) {
        return (
            <div className="p-4 rounded-2xl border border-slate-200 bg-white text-xs text-slate-500 flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" /> Loading case assignments...
            </div>
        );
    }
    if (!info) {
        return error ? <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs font-bold text-rose-800">{error}</div> : null;
    }

    const byTask = (type: string) => info.assignments.filter((a) => a.task_type === type);
    const decisionNote = applicationStageStatus ? PENDING_DECISION[applicationStageStatus] : undefined;

    return (
        <div className="rounded-2xl border border-slate-200 bg-white shadow-2xs overflow-hidden" data-testid="adoption-case-panel">
            <div className="px-4 py-3 border-b border-slate-100 bg-slate-50/80 flex items-center justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-2 min-w-0">
                    <ClipboardList className="w-4 h-4 text-slate-600 shrink-0" />
                    <h4 className="text-xs font-black uppercase tracking-wider text-slate-800">Case Handling & Assignments</h4>
                </div>
                <div className="flex items-center gap-2 text-xs">
                    <Crown className="w-3.5 h-3.5 text-amber-600" />
                    {info.case_owner_name ? (
                        <span className="font-bold text-slate-800">
                            Case owner: {info.case_owner_name}{info.is_owner ? ' (you)' : ''}
                        </span>
                    ) : (
                        <span className="font-bold text-amber-700">No case owner yet</span>
                    )}
                    {info.can_claim && (
                        <button
                            type="button"
                            disabled={busy}
                            onClick={() => run(() => api.post(`/adoptions/${adoptionId}/claim`))}
                            className="ml-1 px-3 py-1 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-black text-[11px] cursor-pointer disabled:opacity-50"
                        >
                            Claim case
                        </button>
                    )}
                </div>
            </div>

            {decisionNote && (
                <div className="px-4 py-3 bg-rose-50 border-b border-rose-200 flex items-start gap-2 text-xs text-rose-900">
                    <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                    <div className="flex-1">
                        <p className="font-black">Decision needed</p>
                        <p>{decisionNote} Review the assessment, then reject the application or have the task redone.</p>
                    </div>
                    {info.can_assign && onRejectRequested && (
                        <button
                            type="button"
                            onClick={onRejectRequested}
                            className="px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white font-black text-[11px] cursor-pointer shrink-0"
                        >
                            Reject application
                        </button>
                    )}
                </div>
            )}

            {error && <div className="mx-4 mt-3 p-2.5 rounded-xl bg-rose-50 border border-rose-200 text-xs font-bold text-rose-800">{error}</div>}

            <ul className="divide-y divide-slate-100">
                {TASKS.map((task) => {
                    const rows = byTask(task.type);
                    const current = rows.filter((a) => OPEN.includes(a.status)).slice(-1)[0];
                    const last = current || rows.slice(-1)[0];
                    const stageDone = stageAlreadyDone(task.type, currentStage);
                    const isDone = stageDone || rows.some((a) => a.status === 'Completed' && !a.milestone_name);
                    return (
                        <li key={task.type} className="px-4 py-3 flex flex-col gap-2">
                            <div className="flex items-center justify-between gap-3 flex-wrap">
                                <div className="min-w-0">
                                    <p className="text-xs font-black text-slate-900">{task.label}</p>
                                    {isDone && (
                                        <p className="text-[11px] font-black text-emerald-700 mt-0.5 flex items-center gap-1" data-testid="task-done">
                                            <span className="w-4 h-4 rounded-full bg-emerald-600 text-white inline-flex items-center justify-center text-[10px] leading-none">✓</span>
                                            Completed{last?.assigned_to_name && last.status === 'Completed' ? ` by ${last.assigned_to_name}` : ''}
                                        </p>
                                    )}
                                    {last ? (
                                        <p className="text-[11px] text-slate-600 mt-0.5 flex items-center gap-1.5 flex-wrap">
                                            <span className="font-bold">{last.assigned_to_name || 'Staff'}</span>
                                            <span className={`px-1.5 py-0.5 rounded-md border text-[10px] font-black ${STATUS_STYLES[last.status] || STATUS_STYLES.Cancelled}`}>
                                                {STATUS_LABELS[last.status] || last.status}
                                            </span>
                                            {last.milestone_name && <span>· {last.milestone_name}</span>}
                                            {last.scheduled_at && <span>· {fmt(last.scheduled_at)}</span>}
                                            {last.status === 'Declined' && last.decline_reason && <span className="text-rose-700">· “{last.decline_reason}”</span>}
                                        </p>
                                    ) : !isDone ? (
                                        <p className="text-[11px] text-slate-400 mt-0.5">Not assigned · {task.hint}</p>
                                    ) : null}
                                </div>
                                {info.can_assign && !isDone && (
                                    <div className="flex items-center gap-1.5 shrink-0">
                                        {current && (
                                            <button
                                                type="button"
                                                disabled={busy}
                                                onClick={() => run(() => api.post(`/adoption-tasks/${current.assignment_id}/cancel`, { reason: 'Withdrawn by case owner' }))}
                                                className="px-2.5 py-1 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 text-[11px] font-bold cursor-pointer disabled:opacity-50"
                                            >
                                                Cancel
                                            </button>
                                        )}
                                        <button
                                            type="button"
                                            disabled={busy}
                                            onClick={() => openAssign(task.type)}
                                            className="px-2.5 py-1 rounded-lg bg-role hover:bg-role-hover text-white text-[11px] font-black flex items-center gap-1 cursor-pointer disabled:opacity-50"
                                        >
                                            <UserPlus className="w-3.5 h-3.5" />
                                            {current ? 'Reassign' : 'Assign'}
                                        </button>
                                    </div>
                                )}
                            </div>

                            {assigning === task.type && (
                                <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
                                    <div className="flex items-center justify-between">
                                        <p className="text-[11px] font-black text-slate-800">Assign {task.label}</p>
                                        <button type="button" onClick={() => setAssigning(null)} className="p-1 text-slate-400 hover:text-slate-700 cursor-pointer" aria-label="Close">
                                            <X className="w-3.5 h-3.5" />
                                        </button>
                                    </div>
                                    <select
                                        value={target}
                                        onChange={(e) => setTarget(e.target.value ? Number(e.target.value) : '')}
                                        className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs font-semibold"
                                        aria-label={`Staff for ${task.label}`}
                                    >
                                        <option value="">-- Select Barangay Staff --</option>
                                        {staff.map((s) => (
                                            <option key={s.user_id} value={s.user_id}>
                                                {s.name}{s.position_name ? ` (${s.position_name})` : ''}{s.open_tasks ? ` · ${s.open_tasks} open` : ''}
                                            </option>
                                        ))}
                                    </select>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                        <label className="text-[11px] text-slate-600 font-bold">
                                            Due (optional)
                                            <input type="datetime-local" value={dueAt} onChange={(e) => setDueAt(e.target.value)}
                                                className="mt-1 w-full px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white text-xs font-medium" />
                                        </label>
                                        <label className="text-[11px] text-slate-600 font-bold">
                                            Note for the assignee (optional)
                                            <input type="text" value={remarks} onChange={(e) => setRemarks(e.target.value)} maxLength={500}
                                                className="mt-1 w-full px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white text-xs font-medium" />
                                        </label>
                                    </div>
                                    <p className="text-[10px] text-slate-500">
                                        {task.type === 'Interview' || task.type === 'Home_Visit'
                                            ? 'Tip: you can also assign while scheduling. The assignee accepts the task, then conducts and records it.'
                                            : 'The assignee accepts the task on their Adoption Tasks page, then records it.'}
                                    </p>
                                    <button
                                        type="button"
                                        disabled={busy || target === ''}
                                        onClick={submitAssign}
                                        className="w-full py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black cursor-pointer disabled:opacity-50"
                                    >
                                        {busy ? 'Assigning...' : 'Assign task'}
                                    </button>
                                </div>
                            )}
                        </li>
                    );
                })}
            </ul>
        </div>
    );
}
