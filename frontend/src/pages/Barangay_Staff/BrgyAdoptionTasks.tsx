import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { CalendarClock, CheckCircle2, ClipboardList, Home, MapPin, Phone, RefreshCw, XCircle } from 'lucide-react';
import BrgySidebar from '../../components/BrgySidebar';
import BrgyNavbar from '../../components/Navbars/BrgyNavbar';
import BrgyBottomNav from '../../components/Navbars/BrgyBottomNav';
import { api } from '../../utils/api';
import { getPetPicture } from '../../utils/avatar';
import {
    AdoptionHandoverModal,
    AdoptionHandoverScheduleModal,
    AdoptionHomeVisitModal,
    AdoptionInterviewModal,
    AdoptionVerificationModal,
} from '../../components/Modals/AdoptionStaffStageModals';
import AdoptionMonitoringModal from '../../components/Modals/AdoptionMonitoringModal';
import { STATUS_LABELS, STATUS_STYLES } from '../../components/Adoption/AdoptionCasePanel';
import { petName } from '../../utils/petName';

// "My Adoption Tasks": tasks assigned to the signed-in Barangay staff member.
// Accept or decline first; accepted tasks open the same stage modals used on the Adoptions page.
// The backend enforces that only the assignee can record each task.

interface TaskAdoption {
    adoption_id: number;
    holding_id: number;
    applicant_name: string;
    contact_no?: string | null;
    address?: string | null;
    pet_name?: string | null;
    pet_type?: string | null;
    pet_photo?: string | null;
    status: string;
    current_stage: string;
    case_owner_name?: string | null;
    interview_scheduled_at?: string | null;
    interview_mode?: string | null;
    interview_location?: string | null;
    interview_recommendation?: string | null;
    home_visit_scheduled_at?: string | null;
    home_visit_type?: string | null;
    home_visit_result?: string | null;
}

interface MyTask {
    assignment_id: number;
    adoption_id: number;
    task_type: string;
    task_label: string;
    milestone_name?: string | null;
    status: string;
    scheduled_at?: string | null;
    due_at?: string | null;
    assigned_at?: string | null;
    assigned_by_name?: string | null;
    decline_reason?: string | null;
    completed_at?: string | null;
    remarks?: string | null;
    can_act: boolean;
    adoption: TaskAdoption;
}

type Tab = 'new' | 'todo' | 'done' | 'history';
type ModalKind =
    | 'verify' | 'interview_schedule' | 'interview_eval' | 'interview_view'
    | 'home_schedule' | 'home_eval' | 'home_view' | 'monitoring' | 'handover_schedule' | 'handover';

const fmt = (d?: string | null) =>
    d ? new Date(d).toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : null;
const STAGE_LABEL: Record<string, string> = {
    Application: 'Application', Verification: 'Verification', Interview: 'Interview', Home_Visit: 'Home Visit', Review: 'Review',
    Approval: 'Approval', Certificate: 'Certificate', Handover: 'Handover', Monitoring: 'Monitoring', Successful_Adoption: 'Completed',
};

export default function BrgyAdoptionTasks() {
    const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
    const [tasks, setTasks] = useState<MyTask[]>([]);
    const [apps, setApps] = useState<Record<number, any>>({});
    const [loading, setLoading] = useState(true);
    const [tab, setTab] = useState<Tab>('new');
    const [busyId, setBusyId] = useState<number | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [toast, setToast] = useState<string | null>(null);
    const [declineFor, setDeclineFor] = useState<MyTask | null>(null);
    const [declineReason, setDeclineReason] = useState('');
    const [modal, setModal] = useState<{ kind: ModalKind; task: MyTask } | null>(null);

    const load = useCallback(async () => {
        try {
            const [taskRes, appRes] = await Promise.all([
                api.get('/adoption-tasks/mine', { params: { scope: 'all' } }),
                api.get('/adoptions/applications').catch(() => ({ data: [] })),
            ]);
            setTasks(Array.isArray(taskRes.data) ? taskRes.data : []);
            const map: Record<number, any> = {};
            (Array.isArray(appRes.data) ? appRes.data : []).forEach((a: any) => { map[a.adoption_id] = a; });
            setApps(map);
            setError(null);
        } catch (err: any) {
            setError(err.response?.data?.detail || 'Could not load your adoption tasks.');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        load();
        const t = setInterval(load, 30000);
        return () => clearInterval(t);
    }, [load]);

    const groups = useMemo(() => ({
        new: tasks.filter((t) => t.status === 'Assigned'),
        todo: tasks.filter((t) => t.status === 'Accepted' || t.status === 'In_Progress'),
        done: tasks.filter((t) => t.status === 'Completed'),
        history: tasks.filter((t) => ['Declined', 'Cancelled', 'Reassigned'].includes(t.status)),
    }), [tasks]);

    useEffect(() => {
        if (!loading && tab === 'new' && groups.new.length === 0 && groups.todo.length > 0) setTab('todo');
    }, [loading]); // eslint-disable-line react-hooks/exhaustive-deps

    const flash = (msg: string) => {
        setToast(msg);
        setTimeout(() => setToast(null), 3500);
    };

    const act = async (task: MyTask, action: 'accept' | 'decline', reason?: string) => {
        setBusyId(task.assignment_id);
        setError(null);
        try {
            await api.post(`/adoption-tasks/${task.assignment_id}/${action}`, action === 'decline' ? { reason } : undefined);
            flash(action === 'accept' ? `Accepted: ${task.task_label}` : `Declined: ${task.task_label}`);
            setDeclineFor(null);
            setDeclineReason('');
            await load();
            if (action === 'accept') setTab('todo');
        } catch (err: any) {
            setError(err.response?.data?.detail || 'Action failed.');
        } finally {
            setBusyId(null);
        }
    };

    const open = (kind: ModalKind, task: MyTask) => setModal({ kind, task });
    const closeModal = () => setModal(null);
    const afterSave = () => { flash('Saved.'); load(); };

    const actionsFor = (t: MyTask) => {
        if (!t.can_act) return [];
        const a = t.adoption;
        switch (t.task_type) {
            case 'Verification':
                return [{ label: 'Verify Documents', kind: 'verify' as ModalKind, primary: true }];
            case 'Interview':
                return [
                    { label: a.interview_scheduled_at ? 'Reschedule Interview' : 'Schedule Interview', kind: 'interview_schedule' as ModalKind },
                    { label: 'Conduct & Record Interview', kind: 'interview_eval' as ModalKind, primary: true },
                ];
            case 'Home_Visit':
                return [
                    { label: a.home_visit_scheduled_at ? 'Reschedule Home Visit' : 'Schedule Home Visit', kind: 'home_schedule' as ModalKind },
                    { label: 'Record Assessment', kind: 'home_eval' as ModalKind, primary: true },
                    ...(a.home_visit_result && a.home_visit_result !== 'Pending' ? [{ label: 'View Assessment', kind: 'home_view' as ModalKind }] : []),
                ];
            case 'Monitoring':
                return [{ label: 'Record Monitoring Assessment', kind: 'monitoring' as ModalKind, primary: true }];
            case 'Handover':
                return [
                    { label: 'Schedule Handover', kind: 'handover_schedule' as ModalKind },
                    { label: 'Confirm Pet Handed Over', kind: 'handover' as ModalKind, primary: true },
                ];
            default:
                return [];
        }
    };

    const viewActionsFor = (t: MyTask) => {
        if (t.task_type === 'Interview') return [{ label: 'View Interview Record', kind: 'interview_view' as ModalKind }];
        if (t.task_type === 'Home_Visit') return [{ label: 'View Assessment', kind: 'home_view' as ModalKind }];
        if (t.task_type === 'Monitoring') return [{ label: 'View Monitoring Records', kind: 'monitoring' as ModalKind }];
        return [];
    };

    const list = groups[tab];
    const TABS: Array<{ id: Tab; label: string }> = [
        { id: 'new', label: `New (${groups.new.length})` },
        { id: 'todo', label: `To do (${groups.todo.length})` },
        { id: 'done', label: `Completed (${groups.done.length})` },
        { id: 'history', label: `Declined / Closed (${groups.history.length})` },
    ];

    const m = modal;
    const mApp = m ? apps[m.task.adoption_id] : null;

    return (
        <div className="flex h-screen bg-[#FDFBF7] font-sans antialiased overflow-hidden text-gray-900">
            <BrgySidebar isMobileOpen={isMobileSidebarOpen} onCloseMobile={() => setIsMobileSidebarOpen(false)} />
            <main className="flex-1 flex flex-col h-screen overflow-hidden w-full min-w-0">
                <BrgyNavbar
                    onMenuToggle={() => setIsMobileSidebarOpen(true)}
                    leftContent={
                        <div className="flex flex-col">
                            <h1 className="text-xl font-black text-gray-900 tracking-tight leading-none uppercase">Adoption Tasks</h1>
                            <p className="hidden sm:block text-[11px] font-semibold text-gray-400 mt-1">Interviews, home visits and monitoring assigned to you</p>
                        </div>
                    }
                />

                <div className="flex-1 overflow-y-auto p-3 sm:p-5 md:p-6 pb-28 lg:pb-8">
                    <div className="max-w-5xl mx-auto space-y-4">
                        <div className="flex items-center justify-between gap-2 flex-wrap">
                            <div className="flex items-center gap-1 bg-white border border-gray-200 rounded-2xl p-1 overflow-x-auto max-w-full">
                                {TABS.map((t) => (
                                    <button
                                        key={t.id}
                                        type="button"
                                        onClick={() => setTab(t.id)}
                                        className={`px-3 py-1.5 rounded-xl text-xs whitespace-nowrap cursor-pointer transition-all ${
                                            tab === t.id ? 'bg-role text-white font-black shadow-xs' : 'text-gray-500 hover:text-gray-800 font-bold'
                                        }`}
                                    >
                                        {t.label}
                                    </button>
                                ))}
                            </div>
                            <button type="button" onClick={() => { setLoading(true); load(); }}
                                className="p-2 rounded-xl border border-gray-200 bg-white text-gray-500 hover:text-gray-800 cursor-pointer" title="Refresh tasks">
                                <RefreshCw className="w-4 h-4" />
                            </button>
                        </div>

                        {error && <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs font-bold text-rose-800">{error}</div>}
                        {toast && <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-xs font-bold text-emerald-800">{toast}</div>}

                        {loading ? (
                            <div className="py-16 text-center text-xs text-gray-400 font-semibold">Loading your tasks...</div>
                        ) : list.length === 0 ? (
                            <div className="py-16 text-center bg-white rounded-3xl border border-gray-100">
                                <ClipboardList className="w-8 h-8 text-gray-300 mx-auto" />
                                <p className="mt-2 text-sm font-black text-gray-700">
                                    {tab === 'new' ? 'No new tasks' : tab === 'todo' ? 'Nothing to do right now' : tab === 'done' ? 'No completed tasks yet' : 'No declined or closed tasks'}
                                </p>
                                <p className="text-xs text-gray-400 mt-1">The Head Officer assigns interviews, home visits and monitoring from the Adoptions page.</p>
                            </div>
                        ) : (
                            <ul className="space-y-3">
                                {list.map((t) => {
                                    const a = t.adoption;
                                    const when = t.task_type === 'Interview' ? (a.interview_scheduled_at || t.scheduled_at)
                                        : t.task_type === 'Home_Visit' ? (a.home_visit_scheduled_at || t.scheduled_at) : t.scheduled_at;
                                    const actions = t.status === 'Completed' ? viewActionsFor(t) : actionsFor(t);
                                    return (
                                        <li key={t.assignment_id} className="bg-white rounded-3xl border border-gray-200/90 shadow-2xs overflow-hidden" data-testid="adoption-task-card">
                                            <div className="p-4 sm:p-5 flex flex-col sm:flex-row gap-4">
                                                <img src={getPetPicture(a.pet_photo || undefined)} alt={a.pet_name || 'Pet'}
                                                    className="w-full sm:w-24 h-36 sm:h-24 rounded-2xl object-cover bg-gray-100 shrink-0" />
                                                <div className="flex-1 min-w-0 space-y-2">
                                                    <div className="flex items-start justify-between gap-2 flex-wrap">
                                                        <div className="min-w-0">
                                                            <h3 className="text-sm font-black text-gray-900">
                                                                {t.task_label}{t.milestone_name ? ` · ${t.milestone_name}` : ''}
                                                            </h3>
                                                            <p className="text-xs text-gray-600 mt-0.5">
                                                                {petName(a) || 'Rescued animal'} · Applicant <strong>{a.applicant_name}</strong> · Stage {STAGE_LABEL[a.current_stage] || a.current_stage}
                                                            </p>
                                                        </div>
                                                        <span className={`px-2 py-1 rounded-lg border text-[10px] font-black shrink-0 ${STATUS_STYLES[t.status] || STATUS_STYLES.Cancelled}`}>
                                                            {STATUS_LABELS[t.status] || t.status}
                                                        </span>
                                                    </div>

                                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 text-[11px] text-gray-600">
                                                        {when && (
                                                            <span className="flex items-center gap-1.5"><CalendarClock className="w-3.5 h-3.5 text-gray-400" />
                                                                {fmt(when)}{t.task_type === 'Interview' && a.interview_mode ? ` · ${a.interview_mode.replace('_', ' ')}` : ''}
                                                            </span>
                                                        )}
                                                        {(t.task_type === 'Home_Visit' || t.task_type === 'Monitoring' || t.task_type === 'Handover') && a.address && (
                                                            <span className="flex items-center gap-1.5 min-w-0"><MapPin className="w-3.5 h-3.5 text-gray-400 shrink-0" /><span className="truncate">{a.address}</span></span>
                                                        )}
                                                        {a.contact_no && t.status !== 'Completed' && (
                                                            <span className="flex items-center gap-1.5"><Phone className="w-3.5 h-3.5 text-gray-400" />{a.contact_no}</span>
                                                        )}
                                                        {t.task_type === 'Interview' && a.interview_location && (
                                                            <span className="flex items-center gap-1.5 min-w-0"><Home className="w-3.5 h-3.5 text-gray-400 shrink-0" /><span className="truncate">{a.interview_location}</span></span>
                                                        )}
                                                        {t.due_at && <span className="font-bold text-amber-700">Due {fmt(t.due_at)}</span>}
                                                    </div>

                                                    <p className="text-[11px] text-gray-400">
                                                        Assigned by {t.assigned_by_name || 'the Head Officer'}{t.assigned_at ? ` · ${fmt(t.assigned_at)}` : ''}
                                                        {t.completed_at ? ` · Completed ${fmt(t.completed_at)}` : ''}
                                                    </p>
                                                    {t.remarks && <p className="text-[11px] bg-gray-50 border border-gray-100 rounded-xl px-3 py-2 text-gray-700">“{t.remarks}”</p>}
                                                    {t.decline_reason && <p className="text-[11px] text-rose-700">You declined: “{t.decline_reason}”</p>}
                                                </div>
                                            </div>

                                            <div className="px-4 sm:px-5 py-3 bg-gray-50/80 border-t border-gray-100 flex items-center justify-end gap-2 flex-wrap">
                                                <Link to={`/brgy/messages?adoptionId=${t.adoption_id}`} className="px-3 py-2 rounded-xl text-xs font-bold text-gray-600 hover:bg-gray-100">
                                                    Message adopter
                                                </Link>
                                                {t.status === 'Assigned' ? (
                                                    <>
                                                        <button type="button" disabled={busyId === t.assignment_id} onClick={() => { setDeclineFor(t); setDeclineReason(''); }}
                                                            className="px-3.5 py-2 rounded-xl border border-rose-200 bg-white text-rose-700 hover:bg-rose-50 text-xs font-black flex items-center gap-1.5 cursor-pointer disabled:opacity-50">
                                                            <XCircle className="w-3.5 h-3.5" /> Decline
                                                        </button>
                                                        <button type="button" disabled={busyId === t.assignment_id} onClick={() => act(t, 'accept')}
                                                            className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black flex items-center gap-1.5 cursor-pointer disabled:opacity-50">
                                                            <CheckCircle2 className="w-3.5 h-3.5" /> {busyId === t.assignment_id ? 'Accepting...' : 'Accept Task'}
                                                        </button>
                                                    </>
                                                ) : (
                                                    actions.map((ac) => (
                                                        <button key={ac.label} type="button" onClick={() => open(ac.kind, t)} disabled={!apps[t.adoption_id]}
                                                            title={!apps[t.adoption_id] ? 'Application details are not available' : undefined}
                                                            className={`px-3.5 py-2 rounded-xl text-xs font-black cursor-pointer disabled:opacity-50 ${
                                                                'primary' in ac && ac.primary ? 'bg-role hover:bg-role-hover text-white' : 'border border-gray-200 bg-white text-gray-700 hover:bg-gray-50'
                                                            }`}>
                                                            {ac.label}
                                                        </button>
                                                    ))
                                                )}
                                            </div>
                                        </li>
                                    );
                                })}
                            </ul>
                        )}
                    </div>
                </div>
                <BrgyBottomNav />
            </main>

            {declineFor && (
                <div className="fixed inset-0 z-[60] bg-black/50 flex items-end sm:items-center justify-center p-0 sm:p-4" role="dialog" aria-label="Decline task">
                    <div className="bg-white w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl p-5 space-y-3 shadow-2xl">
                        <h3 className="text-sm font-black text-gray-900">Decline {declineFor.task_label}?</h3>
                        <p className="text-xs text-gray-500">The case owner is notified and will reassign it. Please give a reason.</p>
                        <textarea value={declineReason} onChange={(e) => setDeclineReason(e.target.value)} rows={3} maxLength={1000}
                            placeholder="e.g. On leave on the scheduled date"
                            className="w-full px-3 py-2 rounded-xl border border-gray-200 text-xs font-medium" />
                        <div className="flex justify-end gap-2">
                            <button type="button" onClick={() => setDeclineFor(null)} className="px-4 py-2 rounded-xl border border-gray-200 text-xs font-bold cursor-pointer">Keep task</button>
                            <button type="button" disabled={declineReason.trim().length < 3 || busyId === declineFor.assignment_id}
                                onClick={() => act(declineFor, 'decline', declineReason.trim())}
                                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-black cursor-pointer disabled:opacity-50">
                                Decline task
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {m && mApp && m.kind === 'verify' && (
                <AdoptionVerificationModal isOpen adoptionId={mApp.adoption_id} applicantName={mApp.full_name} onClose={closeModal} onSuccess={afterSave} />
            )}
            {m && mApp && (m.kind === 'interview_schedule' || m.kind === 'interview_eval' || m.kind === 'interview_view') && (
                <AdoptionInterviewModal isOpen adoptionId={mApp.adoption_id} applicantName={mApp.full_name} existingData={mApp}
                    mode={m.kind === 'interview_schedule' ? 'schedule' : m.kind === 'interview_eval' ? 'evaluate' : 'view_log'}
                    onClose={closeModal} onSuccess={afterSave} />
            )}
            {m && mApp && (m.kind === 'home_schedule' || m.kind === 'home_eval' || m.kind === 'home_view') && (
                <AdoptionHomeVisitModal isOpen adoptionId={mApp.adoption_id} applicantName={mApp.full_name}
                    applicantAddress={mApp.address} applicantContact={mApp.contact_no} existingData={mApp}
                    mode={m.kind === 'home_schedule' ? 'schedule' : m.kind === 'home_eval' ? 'evaluate' : 'view_assessment'}
                    onClose={closeModal} onSuccess={afterSave} />
            )}
            {m && mApp && m.kind === 'monitoring' && (
                <AdoptionMonitoringModal isOpen adoptionId={mApp.adoption_id} animalName={mApp.animal_name || 'Pet'} onClose={closeModal} onUpdate={load} />
            )}
            {m && mApp && m.kind === 'handover_schedule' && (
                <AdoptionHandoverScheduleModal isOpen adoptionId={mApp.adoption_id} animalName={mApp.animal_name || 'Pet'}
                    applicantName={mApp.full_name} existingData={mApp} onClose={closeModal} onSuccess={afterSave} />
            )}
            {m && mApp && m.kind === 'handover' && (
                <AdoptionHandoverModal isOpen adoptionId={mApp.adoption_id} animalName={mApp.animal_name || 'Pet'}
                    applicantName={mApp.full_name} onClose={closeModal} onSuccess={afterSave} />
            )}
        </div>
    );
}
