import { useEffect, useRef, useState } from 'react';
import { Bell, CheckCheck, RefreshCw, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../utils/api';
import { whenVisible } from '../../utils/visibleInterval';
import NotificationPanel from './NotificationPanel';

interface NotificationItem {
    notification_id: number;
    title: string;
    message: string;
    type?: string;
    created_at: string;
    is_read: boolean;
    is_archived?: boolean;
    related_id?: number | null;
}

export default function AdminNotificationMenu({ userId }: { userId?: number }) {
    const navigate = useNavigate();
    const triggerRef = useRef<HTMLButtonElement>(null);
    const [isOpen, setIsOpen] = useState(false);
    const [notifications, setNotifications] = useState<NotificationItem[]>([]);
    const [loading, setLoading] = useState(false);
    const [marking, setMarking] = useState(false);
    const [filter, setFilter] = useState<'all' | 'unread'>('all');
    const [selectedId, setSelectedId] = useState<number | null>(null);
    const [error, setError] = useState('');
    const active = notifications.filter(n => !n.is_archived && n.type !== 'message' && n.type !== 'match_message');
    const unread = active.filter(n => !n.is_read).length;
    const selected = active.find(n => n.notification_id === selectedId);

    const refresh = async () => {
        if (!userId) return;
        try {
            const response = await api.get('/notifications/me');
            if (Array.isArray(response.data)) setNotifications(response.data);
            setError('');
        } catch {
            setError('Could not load notifications. Please try refreshing.');
        }
    };
    useEffect(() => {
        setLoading(true);
        refresh().finally(() => setLoading(false));
        const interval = setInterval(whenVisible(refresh), 30000);
        return () => clearInterval(interval);
    }, [userId]);

    const markAll = async () => {
        if (!userId || marking || unread === 0) return;
        setMarking(true);
        try {
            await api.post(`/notifications/mark-all-read/${userId}`);
            setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
            setError('');
        } catch {
            setError('Could not mark notifications as read. Please try again.');
        } finally {
            setMarking(false);
        }
    };
    const openDetail = async (notification: NotificationItem) => {
        setSelectedId(notification.notification_id);
        if (!notification.is_read) {
            try {
                await api.patch(`/notifications/${notification.notification_id}`, { is_read: true });
                setNotifications(prev => prev.map(n => n.notification_id === notification.notification_id ? { ...n, is_read: true } : n));
            } catch {
                setError('Could not mark this notification as read. Please try again.');
            }
        }
    };
    const reportTypes = ['status_update', 'status_change', 'report_status', 'report_visibility', 'comment', 'rescue', 'rescue_assigned', 'report_assigned', 'new_report'];

    return <>
        <button
            ref={triggerRef}
            onClick={() => setIsOpen(open => !open)}
            className="relative p-2.5 text-slate-500 hover:text-[#F97316] hover:bg-orange-50/70 rounded-xl transition-all cursor-pointer border border-transparent hover:border-orange-100/70"
            title="System Notifications"
            aria-label="Notifications"
            aria-haspopup="dialog"
            aria-expanded={isOpen}
        >
            <Bell className="h-5.5 w-5.5" strokeWidth={1.75} />
            {unread > 0 && <span className="absolute -top-1 -right-1 min-w-5 h-5 px-1 bg-rose-500 text-white text-[10px] font-black rounded-full flex items-center justify-center ring-2 ring-white">{unread > 9 ? '9+' : unread}</span>}
        </button>
        <NotificationPanel isOpen={isOpen} onClose={() => setIsOpen(false)} triggerRef={triggerRef}>
            <div className="px-4 py-3 border-b border-gray-100 flex flex-wrap items-center justify-between gap-2 shrink-0">
                <div>
                    <h3 className="text-sm font-black text-gray-900 dark:text-white">Notifications</h3>
                    <p className="text-[11px] text-gray-500">{unread} unread</p>
                </div>
                <div className="flex items-center justify-end gap-1 w-full sm:w-auto">
                    <button onClick={markAll} disabled={marking || unread === 0} className="px-2 text-[11px] font-bold text-orange-600 flex items-center gap-1 disabled:opacity-50">
                        <CheckCheck size={16} /> {marking ? 'Marking read…' : 'Mark all read'}
                    </button>
                    <button onClick={refresh} title="Refresh notifications" className="p-2 text-gray-500"><RefreshCw size={18} /></button>
                    <button onClick={() => setIsOpen(false)} title="Close notifications" className="p-2 text-gray-500"><X size={20} /></button>
                </div>
            </div>
            <div className="px-4 py-2 border-b border-gray-100 flex gap-2 shrink-0">
                {(['all', 'unread'] as const).map(value => <button key={value} onClick={() => { setFilter(value); setSelectedId(null); }} className={`px-3 rounded-lg text-xs font-bold ${filter === value ? 'bg-orange-50 text-orange-600' : 'text-gray-500'}`}>
                    {value === 'all' ? `All (${active.length})` : `Unread (${unread})`}
                </button>)}
            </div>
            {error && <p role="alert" className="px-4 py-2 text-xs text-red-600 shrink-0">{error}</p>}
            <div data-notification-list className="flex-1 sm:max-h-[28rem] divide-y divide-gray-100">
                {loading && active.length === 0 ? <p className="p-8 text-center text-sm text-gray-500">Loading updates…</p> : selected ? (
                    <div className="p-4 space-y-3">
                        <button onClick={() => setSelectedId(null)} className="text-xs font-bold text-orange-600">← Back to notifications</button>
                        <h4 className="font-bold text-sm dark:text-white">{selected.title}</h4>
                        <time className="block text-xs text-gray-500" dateTime={selected.created_at}>{new Date(selected.created_at).toLocaleString()}</time>
                        <p className="text-sm text-gray-600 dark:text-gray-300 whitespace-pre-wrap">{selected.message}</p>
                        {selected.related_id && reportTypes.includes(selected.type ?? '') && <button className="text-xs font-bold text-orange-600" onClick={() => { setIsOpen(false); navigate(`/admin/reports/${selected.related_id}`); }}>Open report →</button>}
                    </div>
                ) : <>
                    {active.filter(n => filter === 'all' || !n.is_read).map(n => <button key={n.notification_id} onClick={() => openDetail(n)} className={`w-full text-left p-4 flex flex-col gap-1 ${n.is_read ? 'bg-white dark:bg-[#151C2C]' : 'bg-orange-50/60 dark:bg-orange-950/30'} hover:bg-orange-50 dark:hover:bg-orange-950/40`}>
                        <span className="text-xs font-bold text-gray-900 dark:text-white">{!n.is_read && <span aria-label="Unread" className="inline-block w-2 h-2 bg-orange-500 rounded-full mr-2" />}{n.title}</span>
                        <span className="text-xs text-gray-600 dark:text-gray-300 whitespace-pre-wrap">{n.message}</span>
                        <time dateTime={n.created_at} className="text-[11px] text-gray-500">{new Date(n.created_at).toLocaleString()}</time>
                    </button>)}
                    {!active.some(n => filter === 'all' || !n.is_read) && <p className="p-8 text-center text-sm text-gray-500">{filter === 'unread' ? 'You have read all notifications.' : 'No notifications yet.'}</p>}
                </>}
            </div>
        </NotificationPanel>
    </>;
}
