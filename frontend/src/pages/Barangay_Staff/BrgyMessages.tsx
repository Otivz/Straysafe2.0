import React, { useState, useEffect, useRef } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import BrgySidebar from '../../components/BrgySidebar';
import BrgyNavbar from '../../components/Navbars/BrgyNavbar';
import BrgyBottomNav from '../../components/Navbars/BrgyBottomNav';
import { api } from '../../utils/api';
import { DEFAULT_AVATAR, getProfilePicture } from '../../utils/avatar';
import { generateMemorableTitle } from '../../utils/chatUtils';
import PetDetailPanel from '../../components/PetRecords/PetDetailPanel';
import { type PetRecord, mapRawPetToPetRecord } from '../../components/PetRecords/types';
import { getCachedData, setCachedData } from '../../utils/cache';
import { getReportStatusLabel, getReportStatusBadgeStyle } from '../../utils/reportStatus';

interface ThreadItem {
    thread_id: number;
    thread_type?: 'Report' | 'Direct' | string;
    thread_mode?: 'report' | 'match';
    report_id: number;
    match_id?: number | null;
    title: string;
    is_closed: boolean;
    can_interact?: boolean;
    is_assigned?: boolean;
    created_at: string;
    updated_at: string;
    report?: {
        report_id: number;
        user_id?: number;
        reporter_name?: string;
        reporter_photo?: string;
        animal_type?: string;
        animal_breed?: string;
        animal_color?: string;
        category_id?: number;
        category_name?: string;
        status_id?: number;
        current_status_id?: number;
        landmark?: string;
        street_address?: string;
        subdivision_name?: string;
        media_url?: string;
        assigned_leader_id?: number;
        assigned_leader_name?: string;
    };
    matched_pet?: {
        pet_id?: number;
        pet_name?: string;
        photo_url?: string;
        breed?: string;
        color?: string;
        size?: string;
        owner_id?: number;
        owner_name?: string;
        similarity_score?: number;
    };
    counterpart?: {
        user_id?: number;
        name?: string;
        role?: string;
        avatar?: string;
    };
    last_message?: {
        message_id: number;
        text: string;
        sender_id: number;
        sender_name: string;
        sent_at: string;
        is_read: boolean;
    };
    unread_count: number;
}

interface MessageItem {
    message_id: number;
    thread_id: number;
    sender_id: number;
    sender_name: string;
    sender_role: string;
    sender_avatar?: string;
    message_text: string;
    media_url?: string;
    is_read: boolean;
    is_system: boolean;
    sent_at: string;
}

const HISTORY_STATUS_IDS = [3, 9, 10, 11, 12, 14];

const BrgyMessages: React.FC = () => {
    const [searchParams] = useSearchParams();
    const navigate = useNavigate();
    const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);

    const userStr = localStorage.getItem('staff_user') || sessionStorage.getItem('staff_user') || localStorage.getItem('resident_user');
    const currentUser = userStr ? JSON.parse(userStr) : { user_id: 0, name: 'Barangay Staff', role_id: 3, is_head_officer: false };
    const isHeadOfficer = Boolean(currentUser.is_head_officer || currentUser.role_id === 4 || currentUser.role_id === 5);

    const [threads, setThreads] = useState<ThreadItem[]>(() => getCachedData<ThreadItem[]>('brgy_chat_threads') || []);
    const [loading, setLoading] = useState<boolean>(() => !getCachedData<ThreadItem[]>('brgy_chat_threads'));
    const [activeTab, setActiveTab] = useState<'my' | 'all' | 'matches' | 'reports' | 'past'>('all');
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedThread, setSelectedThread] = useState<ThreadItem | null>(null);
    const [messages, setMessages] = useState<MessageItem[]>([]);
    const [messagesLoading, setMessagesLoading] = useState(false);
    const [inputText, setInputText] = useState('');
    const [selectedImageFile, setSelectedImageFile] = useState<File | null>(null);
    const [selectedImagePreview, setSelectedImagePreview] = useState<string | null>(null);
    const [isSending, setIsSending] = useState(false);
    const [selectedPetDetail, setSelectedPetDetail] = useState<PetRecord | null>(null);

    const messagesEndRef = useRef<HTMLDivElement | null>(null);
    const fileInputRef = useRef<HTMLInputElement | null>(null);

    const handleOpenPetDetail = async (petData: any) => {
        if (!petData) return;
        try {
            const petId = petData.pet_id || petData.id;
            if (petId) {
                const res = await api.get(`/pets/${petId}`);
                setSelectedPetDetail(mapRawPetToPetRecord(res.data));
            } else {
                setSelectedPetDetail(mapRawPetToPetRecord(petData));
            }
        } catch (e) {
            console.error("Failed to load pet details:", e);
            setSelectedPetDetail(mapRawPetToPetRecord(petData));
        }
    };

    const getMessageCacheKey = (thread: ThreadItem) => {
        const isMatch = thread.thread_mode === 'match' || (thread.match_id !== undefined && thread.match_id !== null && thread.match_id > 0);
        return isMatch ? `brgy_chat_msgs_m_${thread.match_id}` : `brgy_chat_msgs_r_${thread.report_id}`;
    };

    const fetchThreads = async () => {
        try {
            const res = await api.get('/chat/threads');
            if (Array.isArray(res.data)) {
                setThreads(res.data);
                setCachedData('brgy_chat_threads', res.data);

                const reportParam = searchParams.get('reportId');
                const matchParam = searchParams.get('matchId');
                if ((reportParam || matchParam) && !selectedThread) {
                    const match = res.data.find((t: ThreadItem) => {
                        if (matchParam && t.match_id === Number(matchParam)) return true;
                        if (reportParam && t.report_id === Number(reportParam)) return true;
                        return false;
                    });
                    if (match) {
                        setSelectedThread(match);
                        if (!match.is_assigned && !isHeadOfficer) {
                            setActiveTab('all');
                        }
                    }
                }
            }
        } catch (err) {
            console.error('Error fetching chat threads:', err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchThreads();
        const interval = setInterval(fetchThreads, 5000);
        return () => clearInterval(interval);
    }, [searchParams]);

    const fetchMessagesForThread = async (thread: ThreadItem) => {
        const cacheKey = getMessageCacheKey(thread);
        const cached = getCachedData<MessageItem[]>(cacheKey);
        if (cached && cached.length > 0) {
            setMessages(cached);
            setMessagesLoading(false);
        } else {
            setMessagesLoading(true);
        }

        try {
            const isMatch = thread.thread_mode === 'match' || (thread.match_id !== undefined && thread.match_id !== null && thread.match_id > 0);
            const endpoint = isMatch 
                ? `/chat/matches/${thread.match_id}/messages` 
                : `/chat/reports/${thread.report_id}/messages`;
            const readEndpoint = isMatch 
                ? `/chat/matches/${thread.match_id}/read` 
                : `/chat/reports/${thread.report_id}/read`;

            const res = await api.get(endpoint);
            if (Array.isArray(res.data)) {
                setMessages(res.data);
                setCachedData(cacheKey, res.data);
            }
            await api.patch(readEndpoint).catch(() => {});
        } catch (err) {
            console.error('Error fetching messages:', err);
        } finally {
            setMessagesLoading(false);
        }
    };

    useEffect(() => {
        if (selectedThread) {
            fetchMessagesForThread(selectedThread);
            const isMatch = selectedThread.thread_mode === 'match' || (selectedThread.match_id !== undefined && selectedThread.match_id !== null && selectedThread.match_id > 0);
            const endpoint = isMatch 
                ? `/chat/matches/${selectedThread.match_id}/messages` 
                : `/chat/reports/${selectedThread.report_id}/messages`;

            const msgInterval = setInterval(() => {
                api.get(endpoint)
                    .then(res => {
                        if (Array.isArray(res.data)) {
                            setMessages(res.data);
                            setCachedData(getMessageCacheKey(selectedThread), res.data);
                        }
                    })
                    .catch(() => {});
            }, 3000);
            return () => clearInterval(msgInterval);
        }
    }, [selectedThread?.thread_id]);

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    const handleSendMessage = async (e?: React.FormEvent) => {
        if (e) e.preventDefault();
        if ((!inputText.trim() && !selectedImageFile) || !selectedThread || isSending) return;

        const canInteract = selectedThread.can_interact ?? (isHeadOfficer || selectedThread.is_assigned);
        if (!canInteract || isPastReport(selectedThread)) return;

        try {
            setIsSending(true);
            const formData = new FormData();
            formData.append('message_text', inputText.trim() || 'Sent an attachment');
            if (selectedImageFile) {
                formData.append('file', selectedImageFile);
            }

            const isMatch = selectedThread.thread_mode === 'match' || (selectedThread.match_id !== undefined && selectedThread.match_id !== null && selectedThread.match_id > 0);
            const endpoint = isMatch 
                ? `/chat/matches/${selectedThread.match_id}/messages` 
                : `/chat/reports/${selectedThread.report_id}/messages`;

            const res = await api.post(endpoint, formData, {
                headers: { 'Content-Type': 'multipart/form-data' }
            });

            if (res.data) {
                const newMsg: MessageItem = res.data;
                setMessages(prev => [...prev, newMsg]);
                setInputText('');
                setSelectedImageFile(null);
                setSelectedImagePreview(null);
                setCachedData(getMessageCacheKey(selectedThread), [...messages, newMsg]);
                fetchThreads();
            }
        } catch (err: any) {
            console.error('Error sending message:', err);
            alert(err.response?.data?.detail || 'Failed to send message.');
        } finally {
            setIsSending(false);
        }
    };

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            setSelectedImageFile(file);
            setSelectedImagePreview(URL.createObjectURL(file));
        }
    };

    const formatTime = (dateStr?: string) => {
        if (!dateStr) return '';
        try {
            const date = new Date(dateStr);
            const now = new Date();
            const diffMs = now.getTime() - date.getTime();
            const diffMins = Math.floor(diffMs / (1000 * 60));
            const diffHours = Math.floor(diffMins / 60);
            const diffDays = Math.floor(diffHours / 24);

            if (diffMins < 1) return 'Just now';
            if (diffMins < 60) return `${diffMins}m ago`;
            if (diffHours < 24) return `${diffHours}h ago`;
            if (diffDays === 1) return '1 day ago';
            if (diffDays < 7) return `${diffDays} days ago`;
            return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
        } catch {
            return '';
        }
    };

    const isPastReport = (t: ThreadItem) => {
        if (t.is_closed) return true;
        const isMatch = t.thread_mode === 'match' || !!t.matched_pet;
        const sId = t.report?.current_status_id || t.report?.status_id;
        if (!sId) return false;
        
        if (isMatch) {
            return [3, 11, 12, 14].includes(Number(sId));
        }
        return HISTORY_STATUS_IDS.includes(Number(sId));
    };

    const matchesCases = threads.filter(t => (t.thread_mode === 'match' || !!t.matched_pet) && !isPastReport(t));
    const reportsCases = threads.filter(t => t.thread_mode !== 'match' && !t.matched_pet && !isPastReport(t));
    const myCases = threads.filter(t => (t.is_assigned || (!isHeadOfficer && t.can_interact)) && !isPastReport(t));
    const allCases = threads.filter(t => !isPastReport(t));
    const pastCases = threads.filter(t => isPastReport(t));

    const totalUnreadCount = threads.reduce((acc, t) => acc + (t.unread_count || 0), 0);
    const myUnreadCount = myCases.reduce((acc, t) => acc + t.unread_count, 0);
    const allUnreadCount = allCases.reduce((acc, t) => acc + t.unread_count, 0);
    const matchesUnreadCount = matchesCases.reduce((acc, t) => acc + t.unread_count, 0);
    const reportsUnreadCount = reportsCases.reduce((acc, t) => acc + t.unread_count, 0);
    const pastUnreadCount = pastCases.reduce((acc, t) => acc + t.unread_count, 0);

    const filteredThreads = threads.filter(thread => {
        const isMatch = thread.thread_mode === 'match' || !!thread.matched_pet;
        const matchesSearch = 
            !searchTerm.trim() ||
            `report #${thread.report_id}`.toLowerCase().includes(searchTerm.toLowerCase()) ||
            (thread.report?.reporter_name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
            (thread.matched_pet?.pet_name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
            (thread.matched_pet?.owner_name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
            (thread.last_message?.text || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
            (thread.title || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
            (thread.report?.landmark || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
            (thread.report?.status_id ? getReportStatusLabel(thread.report.status_id).toLowerCase().includes(searchTerm.toLowerCase()) : false);

        if (!matchesSearch) return false;

        if (activeTab === 'matches') {
            return isMatch && !isPastReport(thread);
        } else if (activeTab === 'reports') {
            return !isMatch && !isPastReport(thread);
        } else if (activeTab === 'my') {
            return (thread.is_assigned || (!isHeadOfficer && thread.can_interact)) && !isPastReport(thread);
        } else if (activeTab === 'past') {
            return isPastReport(thread);
        }
        return !isPastReport(thread);
    }).sort((a, b) => {
        const timeA = new Date(a.last_message?.sent_at || a.updated_at || a.created_at).getTime();
        const timeB = new Date(b.last_message?.sent_at || b.updated_at || b.created_at).getTime();
        return timeB - timeA;
    });

    const selectedCanInteract = selectedThread 
        ? (selectedThread.can_interact ?? (isHeadOfficer || selectedThread.is_assigned))
        : false;

    return (
        <div className="flex h-screen bg-[#FDFBF7] font-sans antialiased overflow-hidden text-gray-900">
            <BrgySidebar 
                isMobileOpen={isMobileSidebarOpen}
                onCloseMobile={() => setIsMobileSidebarOpen(false)}
            />
            
            <main className="flex-1 flex flex-col h-screen overflow-hidden w-full min-w-0">
                <BrgyNavbar 
                    onMenuToggle={() => setIsMobileSidebarOpen(true)}
                    leftContent={
                        <div className="flex flex-col">
                            <div className="flex items-center gap-2">
                                <h1 className="text-xl font-black text-gray-900 tracking-tight leading-none uppercase">Case Messages</h1>
                                {isHeadOfficer && (
                                    <span className="px-2 py-0.5 bg-purple-100 text-purple-800 rounded-full text-[10px] font-black uppercase tracking-wider">
                                        👑 Head Officer Oversight
                                    </span>
                                )}
                            </div>
                        </div>
                    }
                />

                <div className="flex-1 flex overflow-hidden p-2 sm:p-4 md:p-6 pb-24 lg:pb-6 gap-4 lg:gap-6 max-w-7xl w-full mx-auto">
                    {/* LEFT PANEL: THREAD LIST */}
                    <div className={`flex flex-col bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden shrink-0 ${
                        selectedThread ? 'hidden md:flex md:w-80 lg:w-96' : 'w-full md:w-80 lg:w-96 flex'
                    }`}>
                        {/* Panel Header */}
                        <div className="px-4 sm:px-5 py-3.5 border-b border-gray-100 flex items-center justify-between bg-gradient-to-r from-orange-50/40 via-white to-white shrink-0">
                            <div className="flex items-center gap-2.5">
                                <div className="w-8 h-8 rounded-lg bg-orange-100/80 text-[#F97316] flex items-center justify-center font-bold">
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4.5 w-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                                    </svg>
                                </div>
                                <div>
                                    <h3 className="text-sm font-black text-gray-900 tracking-tight leading-none">Case Messages</h3>
                                    <p className="text-[11px] font-semibold text-gray-400 mt-1">
                                        {totalUnreadCount > 0 ? `${totalUnreadCount} unread message${totalUnreadCount > 1 ? 's' : ''}` : 'All caught up!'}
                                    </p>
                                </div>
                            </div>

                            <button
                                onClick={fetchThreads}
                                className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors cursor-pointer"
                                title="Refresh messages"
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                                </svg>
                            </button>
                        </div>

                        {/* Filter Tabs & Search Bar */}
                        <div className="px-3.5 py-2.5 border-b border-gray-100 bg-gray-50/70 flex flex-col gap-2 shrink-0">
                            <div className="flex items-center justify-between gap-1.5 overflow-x-auto custom-scrollbar pb-0.5">
                                <div className="flex items-center gap-1 shrink-0">
                                    <button
                                        type="button"
                                        onClick={() => setActiveTab('all')}
                                        className={`px-2.5 py-1 text-xs rounded-lg transition-all cursor-pointer whitespace-nowrap ${
                                            activeTab === 'all'
                                                ? 'bg-white text-[#F97316] shadow-xs border border-orange-100/80 font-black'
                                                : 'text-gray-500 hover:text-gray-800 font-bold'
                                        }`}
                                    >
                                        All ({allCases.length})
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setActiveTab('matches')}
                                        className={`px-2.5 py-1 text-xs rounded-lg transition-all cursor-pointer whitespace-nowrap ${
                                            activeTab === 'matches'
                                                ? 'bg-white text-[#F97316] shadow-xs border border-orange-100/80 font-black'
                                                : 'text-gray-500 hover:text-gray-800 font-bold'
                                        }`}
                                    >
                                        Matches ({matchesCases.length})
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setActiveTab('reports')}
                                        className={`px-2.5 py-1 text-xs rounded-lg transition-all cursor-pointer whitespace-nowrap ${
                                            activeTab === 'reports'
                                                ? 'bg-white text-blue-600 shadow-xs border border-blue-100/80 font-black'
                                                : 'text-gray-500 hover:text-gray-800 font-bold'
                                        }`}
                                    >
                                        Reports ({reportsCases.length})
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setActiveTab('my')}
                                        className={`px-2.5 py-1 text-xs rounded-lg transition-all cursor-pointer whitespace-nowrap ${
                                            activeTab === 'my'
                                                ? 'bg-white text-emerald-700 shadow-xs border border-emerald-100/80 font-black'
                                                : 'text-gray-500 hover:text-gray-800 font-bold'
                                        }`}
                                    >
                                        {isHeadOfficer ? 'My Handled' : 'Assigned'} ({myCases.length})
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setActiveTab('past')}
                                        className={`px-2.5 py-1 text-xs rounded-lg transition-all cursor-pointer whitespace-nowrap ${
                                            activeTab === 'past'
                                                ? 'bg-white text-gray-900 shadow-xs border border-gray-200 font-black'
                                                : 'text-gray-500 hover:text-gray-800 font-bold'
                                        }`}
                                    >
                                        Past ({pastCases.length})
                                    </button>
                                </div>
                            </div>

                            {/* Search Input */}
                            <div className="relative">
                                <input
                                    type="text"
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                    placeholder="Search report #, resident, pet, keywords..."
                                    className="w-full pl-8 pr-3 py-1.5 text-xs bg-white border border-gray-200 text-gray-800 placeholder-gray-400 rounded-xl focus:outline-none focus:border-[#F97316] font-medium"
                                />
                                <svg className="w-3.5 h-3.5 text-gray-400 absolute left-2.5 top-2.5 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                                </svg>
                            </div>
                        </div>

                        {/* Thread List */}
                        <div className="flex-1 overflow-y-auto divide-y divide-gray-100">
                            {loading ? (
                                <div className="py-12 flex flex-col items-center justify-center text-gray-400">
                                    <div className="w-7 h-7 border-2 border-[#F97316] border-t-transparent rounded-full animate-spin"></div>
                                    <p className="text-xs font-medium mt-3 text-gray-500">Loading messages...</p>
                                </div>
                            ) : filteredThreads.length === 0 ? (
                                <div className="py-12 px-6 text-center">
                                    <div className="w-12 h-12 rounded-2xl bg-orange-50 text-[#F97316] flex items-center justify-center mx-auto mb-3">
                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                                        </svg>
                                    </div>
                                    <p className="text-xs font-bold text-gray-800">No messages found</p>
                                    <p className="text-[11px] text-gray-400 mt-0.5">
                                        {searchTerm ? 'Try another search keyword.' : 'Case chats and match inquiries will appear here.'}
                                    </p>
                                </div>
                            ) : (
                                filteredThreads.map(thread => {
                                    const isSelected = selectedThread?.thread_id === thread.thread_id;
                                    const isMatch = thread.thread_mode === 'match' || !!thread.matched_pet;
                                    const isPast = isPastReport(thread);

                                    const rawThumbnail = isMatch 
                                        ? (thread.matched_pet?.photo_url || thread.report?.media_url) 
                                        : (thread.report?.media_url || thread.report?.reporter_photo);

                                    const thumbnail = rawThumbnail 
                                        ? (rawThumbnail.startsWith('http') || rawThumbnail.startsWith('data:') ? rawThumbnail : getProfilePicture(rawThumbnail))
                                        : null;

                                    const counterpartName = isMatch 
                                        ? (thread.matched_pet?.owner_name || 'Pet Owner') 
                                        : (thread.report?.reporter_name || 'Resident');

                                    const roleBadge = isMatch ? 'PET OWNER' : 'INCIDENT REPORTER';

                                    const displayTitle = generateMemorableTitle({
                                        isMatch,
                                        reportId: thread.report_id,
                                        categoryName: thread.report?.category_name,
                                        categoryId: thread.report?.category_id,
                                        animalType: thread.report?.animal_type,
                                        animalBreed: thread.report?.animal_breed,
                                        animalColor: thread.report?.animal_color,
                                        streetAddress: thread.report?.street_address,
                                        landmark: thread.report?.landmark,
                                        subdivisionName: thread.report?.subdivision_name,
                                        matchedPetName: thread.matched_pet?.pet_name,
                                        matchedPetBreed: thread.matched_pet?.breed,
                                        serverTitle: thread.title
                                    });

                                    const timeStr = formatTime(thread.last_message?.sent_at || thread.updated_at || thread.created_at);

                                    return (
                                        <button
                                            key={thread.thread_id}
                                            type="button"
                                            onClick={() => setSelectedThread(thread)}
                                            className={`w-full text-left p-3.5 sm:p-4 flex items-start gap-3.5 cursor-pointer transition-all duration-200 group relative border-b border-gray-50 ${
                                                isSelected
                                                    ? 'bg-orange-50/70 border-r-4 border-r-[#F97316]'
                                                    : thread.unread_count > 0
                                                        ? 'bg-orange-50/30 hover:bg-orange-50/60'
                                                        : 'bg-white hover:bg-gray-50/80'
                                            }`}
                                        >
                                            {/* Unread indicator bar */}
                                            {thread.unread_count > 0 && (
                                                <div className="absolute left-0 top-3 bottom-3 w-1 bg-[#F97316] rounded-r-full shadow-xs"></div>
                                            )}

                                            {/* Thumbnail / Avatar */}
                                            <div className="relative shrink-0 mt-0.5">
                                                <div className="w-10 h-10 rounded-xl bg-gray-100 border border-gray-200 overflow-hidden flex items-center justify-center shadow-2xs">
                                                    {thumbnail ? (
                                                        <img
                                                            src={thumbnail}
                                                            alt="Thumbnail"
                                                            className="w-full h-full object-cover"
                                                            onError={(e: any) => { e.target.src = DEFAULT_AVATAR; }}
                                                        />
                                                    ) : (
                                                        <span className="text-base">
                                                            {isMatch ? '🐾' : '📋'}
                                                        </span>
                                                    )}
                                                </div>
                                                <span className={`absolute -bottom-1 -right-1 px-1 py-0.2 rounded text-[7px] font-black uppercase tracking-wider text-white shadow-2xs ${
                                                    isMatch ? 'bg-[#F97316]' : 'bg-blue-600'
                                                }`}>
                                                    {isMatch ? 'Match' : 'Report'}
                                                </span>
                                            </div>

                                            {/* Thread Details */}
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center justify-between gap-1 mb-0.5">
                                                    <h4
                                                        className={`text-xs truncate ${thread.unread_count > 0 ? 'font-black text-gray-900' : 'font-bold text-gray-800'}`}
                                                        title={displayTitle}
                                                    >
                                                        {displayTitle}
                                                    </h4>
                                                    <span className="text-[10px] text-gray-400 font-medium shrink-0">
                                                        {timeStr}
                                                    </span>
                                                </div>

                                                <div className="flex items-center gap-1.5 mb-1 flex-wrap">
                                                    <span className="text-[11px] font-semibold text-gray-600 truncate">
                                                        {counterpartName}
                                                    </span>
                                                    <span className="text-[8px] font-extrabold px-1.5 py-0.2 rounded bg-gray-100 text-gray-500 border border-gray-200/50 uppercase tracking-wider">
                                                        {roleBadge}
                                                    </span>
                                                    {thread.is_assigned && (
                                                        <span className="text-[8px] font-extrabold px-1.5 py-0.2 rounded bg-emerald-100 text-emerald-800 border border-emerald-200/50 uppercase tracking-wider">
                                                            ✓ Assigned
                                                        </span>
                                                    )}
                                                    {isHeadOfficer && !thread.is_assigned && (
                                                        <span className="text-[8px] font-extrabold px-1.5 py-0.2 rounded bg-purple-100 text-purple-800 border border-purple-200/50 uppercase tracking-wider">
                                                            👑 Oversight
                                                        </span>
                                                    )}
                                                </div>

                                                <div className="flex items-center justify-between gap-2">
                                                    <p className={`text-xs truncate ${thread.unread_count > 0 ? 'font-bold text-gray-900' : 'text-gray-500'}`}>
                                                        {thread.last_message?.text ? (
                                                            <span>
                                                                {thread.last_message.sender_name ? `${thread.last_message.sender_name}: ` : ''}
                                                                {thread.last_message.text}
                                                            </span>
                                                        ) : 'Official coordination channel established.'}
                                                    </p>
                                                    {thread.unread_count > 0 && (
                                                        <span className="min-w-[16px] h-[16px] px-1 rounded-full bg-[#F97316] text-white text-[9px] font-black flex items-center justify-center shrink-0 shadow-2xs">
                                                            {thread.unread_count}
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                        </button>
                                    );
                                })
                            )}
                        </div>

                        {/* Panel Footer */}
                        <div className="p-3 border-t border-gray-100 bg-gray-50/80 flex items-center justify-between shrink-0">
                            <span className="text-[11px] font-semibold text-gray-400">
                                Barangay Operations Inbox
                            </span>
                            <span className="text-[10px] font-bold text-orange-600 bg-orange-50 px-2 py-0.5 rounded-full border border-orange-100">
                                {threads.length} Channels
                            </span>
                        </div>
                    </div>

                    {/* RIGHT PANEL: CHAT VIEW */}
                    <div className={`flex-1 flex flex-col min-w-0 bg-slate-50/50 rounded-3xl border border-gray-100 shadow-sm overflow-hidden ${
                        selectedThread ? 'flex w-full' : 'hidden md:flex'
                    }`}>
                        {selectedThread ? (
                            <>
                                {/* Case Interaction Status Bar */}
                                {selectedThread.is_assigned ? (
                                    <div className="bg-emerald-500/10 border-b border-emerald-200 px-4 py-2 flex items-center justify-between gap-3 shrink-0">
                                        <div className="flex items-center gap-2 text-xs text-emerald-950 font-bold min-w-0">
                                            <span>🛡️</span>
                                            <p className="text-[11px] text-emerald-900 truncate">
                                                <strong>Assigned Field Responder:</strong> You are assigned to this report and can interact directly with the case coordination chat.
                                            </p>
                                        </div>
                                    </div>
                                ) : isHeadOfficer ? (
                                    <div className="bg-purple-500/10 border-b border-purple-200 px-4 py-2 flex items-center justify-between gap-3 shrink-0">
                                        <div className="flex items-center gap-2 text-xs text-purple-950 font-bold min-w-0">
                                            <span>👑</span>
                                            <p className="text-[11px] text-purple-900 truncate">
                                                <strong>Barangay Head Officer (In Charge):</strong> Full supervisory access to interact with all messages in this report.
                                            </p>
                                        </div>
                                    </div>
                                ) : !selectedCanInteract ? (
                                    <div className="bg-amber-500/10 border-b border-amber-200 px-4 py-2 flex items-center justify-between gap-3 shrink-0">
                                        <div className="flex items-center gap-2 text-xs text-amber-950 font-bold min-w-0">
                                            <span>👀</span>
                                            <p className="text-[11px] text-amber-900 truncate">
                                                <strong>Read-Only Mode:</strong> Only barangay responders assigned to this report can chat. You can monitor the history.
                                            </p>
                                        </div>
                                    </div>
                                ) : null}

                                {/* Header */}
                                <div className="p-3 sm:p-4 bg-white border-b border-gray-100 flex items-center justify-between shrink-0 shadow-2xs gap-2">
                                    <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
                                        {/* Mobile Back to Conversation List Button */}
                                        <button
                                            type="button"
                                            onClick={() => setSelectedThread(null)}
                                            className="md:hidden p-2 -ml-1 rounded-xl bg-orange-50 text-[#F97316] hover:bg-orange-100 transition-colors flex items-center gap-1 shrink-0 font-black text-xs cursor-pointer"
                                            title="Back to conversation list"
                                        >
                                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 19l-7-7 7-7" />
                                            </svg>
                                            <span className="text-[11px]">Chats</span>
                                        </button>

                                        <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl overflow-hidden bg-gray-100 shrink-0 border border-gray-200">
                                            <img
                                                src={selectedThread.matched_pet?.photo_url || selectedThread.report?.media_url || DEFAULT_AVATAR}
                                                alt="Report"
                                                className="w-full h-full object-cover"
                                                onError={(e: any) => { e.target.src = DEFAULT_AVATAR; }}
                                            />
                                        </div>
                                        <div className="min-w-0">
                                            {(() => {
                                                const headerTitle = generateMemorableTitle({
                                                    isMatch: selectedThread.thread_mode === 'match' || !!selectedThread.matched_pet,
                                                    reportId: selectedThread.report_id,
                                                    categoryName: selectedThread.report?.category_name,
                                                    categoryId: selectedThread.report?.category_id,
                                                    animalType: selectedThread.report?.animal_type,
                                                    animalBreed: selectedThread.report?.animal_breed,
                                                    animalColor: selectedThread.report?.animal_color,
                                                    streetAddress: selectedThread.report?.street_address,
                                                    landmark: selectedThread.report?.landmark,
                                                    subdivisionName: selectedThread.report?.subdivision_name,
                                                    matchedPetName: selectedThread.matched_pet?.pet_name,
                                                    matchedPetBreed: selectedThread.matched_pet?.breed,
                                                    serverTitle: selectedThread.title
                                                });

                                                return (
                                                    <div className="flex items-center gap-2 flex-wrap">
                                                        <h2 className="text-sm font-extrabold text-gray-900 truncate" title={headerTitle}>
                                                            {headerTitle}
                                                        </h2>
                                                        {selectedThread.report?.status_id ? (
                                                            <span className={`px-2 py-0.5 rounded-full text-[9px] font-black border shrink-0 ${getReportStatusBadgeStyle(selectedThread.report.status_id)}`}>
                                                                {getReportStatusLabel(selectedThread.report.status_id)}
                                                            </span>
                                                        ) : isPastReport(selectedThread) && (
                                                            <span className="px-2 py-0.5 rounded-full text-[9px] font-black border bg-gray-100 text-gray-700 border-gray-200 shrink-0">
                                                                Archived Case
                                                            </span>
                                                        )}
                                                        {selectedThread.matched_pet && (
                                                            <span className="px-2 py-0.5 bg-orange-100 text-[#F97316] rounded-full text-[10px] font-black">
                                                                {selectedThread.matched_pet.similarity_score || 95}% Match
                                                            </span>
                                                        )}
                                                    </div>
                                                );
                                            })()}
                                            <p className="text-xs text-gray-500 font-medium truncate">
                                                {selectedThread.thread_mode === 'match' || selectedThread.matched_pet
                                                    ? `🐾 Direct Verification with Pet Owner: ${selectedThread.matched_pet?.owner_name || 'Resident'}`
                                                    : `📍 ${selectedThread.report?.landmark || 'Subdivision Area'} • Reporter: ${selectedThread.report?.reporter_name || 'Resident'}`
                                                }
                                            </p>
                                        </div>
                                    </div>

                                    <div className="flex items-center gap-2 shrink-0">
                                        <button
                                            onClick={() => navigate(`/brgy/rescue-requests/${selectedThread.report_id}`)}
                                            className="px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold text-xs rounded-xl transition-all flex items-center gap-1.5 cursor-pointer"
                                        >
                                            <span>📋 View Report</span>
                                        </button>
                                        {selectedThread.matched_pet && (
                                            <button
                                                onClick={() => navigate(`/resident/reports/${selectedThread.report_id}/match-review`)}
                                                className="px-3 py-1.5 bg-[#F97316] hover:bg-[#EA580C] text-white font-bold text-xs rounded-xl transition-all flex items-center gap-1.5 cursor-pointer shadow-2xs"
                                            >
                                                <span>🔍 Review Match</span>
                                            </button>
                                        )}
                                    </div>
                                </div>

                                {/* Messages Container */}
                                <div className="flex-1 overflow-y-auto p-4 space-y-3.5 custom-scrollbar">
                                    {selectedThread.matched_pet && (
                                        <div 
                                            onClick={() => handleOpenPetDetail(selectedThread.matched_pet)}
                                            className="bg-white rounded-2xl border border-orange-200 p-3.5 flex items-center justify-between gap-3 shadow-2xs cursor-pointer hover:border-orange-400 transition-all mb-2"
                                        >
                                            <div className="flex items-center gap-3">
                                                <div className="w-12 h-12 rounded-xl overflow-hidden bg-gray-100 border border-gray-200">
                                                    <img src={selectedThread.matched_pet.photo_url || DEFAULT_AVATAR} alt="Pet" className="w-full h-full object-cover" />
                                                </div>
                                                <div>
                                                    <div className="flex items-center gap-2">
                                                        <h4 className="text-xs font-black text-gray-900">{selectedThread.matched_pet.pet_name}</h4>
                                                        <span className="px-2 py-0.2 bg-orange-100 text-[#F97316] rounded-full text-[9px] font-black">
                                                            {selectedThread.matched_pet.similarity_score || 95}% Match
                                                        </span>
                                                    </div>
                                                    <p className="text-[11px] text-gray-500">{selectedThread.matched_pet.breed || 'Dog'} • {selectedThread.matched_pet.color || 'Mixed'}</p>
                                                    <p className="text-[10px] text-gray-400">Owner: {selectedThread.matched_pet.owner_name || 'Resident'}</p>
                                                </div>
                                            </div>
                                            <span className="text-xs font-bold text-[#F97316]">View Pet Profile →</span>
                                        </div>
                                    )}

                                    {messagesLoading ? (
                                        <div className="text-center py-8 text-gray-400 text-xs font-medium animate-pulse">
                                            Loading conversation history...
                                        </div>
                                    ) : messages.length === 0 ? (
                                        <div className="text-center py-12 text-gray-400 space-y-2">
                                            <span className="text-3xl">💬</span>
                                            <p className="text-xs font-bold text-gray-600">No messages in this case yet</p>
                                            <p className="text-[11px]">Send an initial message to coordinate response or update the resident.</p>
                                        </div>
                                    ) : (
                                        messages.map(msg => {
                                            if (msg.is_system) {
                                                return (
                                                    <div key={msg.message_id} className="flex justify-center my-2">
                                                        <div className="bg-gray-100/90 text-gray-600 px-3.5 py-1.5 rounded-full text-[11px] font-semibold max-w-md text-center border border-gray-200/60 shadow-2xs">
                                                            {msg.message_text}
                                                        </div>
                                                    </div>
                                                );
                                            }

                                            const isMe = msg.sender_id === currentUser.user_id;

                                            return (
                                                <div key={msg.message_id} className={`flex items-end gap-2 ${isMe ? 'justify-end' : 'justify-start'}`}>
                                                    {!isMe && (
                                                        <div className="w-7 h-7 rounded-full overflow-hidden bg-gray-200 shrink-0 border border-white shadow-2xs">
                                                            <img src={msg.sender_avatar || DEFAULT_AVATAR} alt={msg.sender_name} className="w-full h-full object-cover" onError={(e: any) => { e.target.src = DEFAULT_AVATAR; }} />
                                                        </div>
                                                    )}
                                                    <div className={`max-w-[70%] space-y-1 ${isMe ? 'items-end' : 'items-start'}`}>
                                                        <div className={`flex items-center gap-1.5 text-[10px] text-gray-400 ${isMe ? 'justify-end' : 'justify-start'}`}>
                                                            <span className="font-bold text-gray-700">{isMe ? 'You' : msg.sender_name}</span>
                                                            <span>•</span>
                                                            <span>{msg.sender_role}</span>
                                                        </div>

                                                        <div className={`p-3.5 rounded-2xl text-xs leading-relaxed shadow-2xs ${
                                                            isMe 
                                                                ? 'bg-gradient-to-r from-[#F97316] to-[#EA580C] text-white rounded-br-none' 
                                                                : 'bg-white text-gray-900 rounded-bl-none border border-gray-100'
                                                        }`}>
                                                            {msg.media_url && (
                                                                <div className="mb-2 rounded-xl overflow-hidden border border-black/10 max-h-48">
                                                                    <img src={msg.media_url} alt="Attachment" className="w-full h-full object-cover" />
                                                                </div>
                                                            )}
                                                            <p className="whitespace-pre-wrap font-medium">{msg.message_text}</p>
                                                        </div>
                                                    </div>
                                                </div>
                                            );
                                        })
                                    )}
                                    <div ref={messagesEndRef} />
                                </div>

                                {/* Input or Read-Only Notice */}
                                {isPastReport(selectedThread) ? (
                                    <div className="p-4 bg-gray-50 border-t border-gray-200 text-center shrink-0 flex items-center justify-center gap-3">
                                        <div className="w-8 h-8 rounded-full bg-gray-200 text-gray-500 flex items-center justify-center text-sm font-bold shrink-0">
                                            🔒
                                        </div>
                                        <div className="text-left">
                                            <p className="text-xs font-bold text-gray-700">Case Resolved & Archived</p>
                                            <p className="text-[11px] text-gray-500">This report has been resolved and direct messaging is in read-only mode for both officers and residents.</p>
                                        </div>
                                    </div>
                                ) : !selectedCanInteract ? (
                                    <div className="p-4 bg-amber-50 border-t border-amber-200 text-center shrink-0 flex items-center justify-center gap-3">
                                        <div className="w-8 h-8 rounded-full bg-amber-100 text-amber-800 flex items-center justify-center text-sm font-bold shrink-0">
                                            🔒
                                        </div>
                                        <div className="text-left">
                                            <p className="text-xs font-bold text-amber-900">Case Coordination (View Only)</p>
                                            <p className="text-[11px] text-amber-700">
                                                Only Barangay personnel assigned to this incident report can interact and send messages. Higher role officers can monitor and view all messages.
                                            </p>
                                        </div>
                                    </div>
                                ) : (
                                    <form onSubmit={handleSendMessage} className="p-4 bg-white border-t border-gray-100 flex flex-col gap-2 shrink-0">
                                        {selectedImagePreview && (
                                            <div className="relative inline-block w-20 h-20 rounded-xl overflow-hidden border border-gray-200 mb-1">
                                                <img src={selectedImagePreview} alt="Preview" className="w-full h-full object-cover" />
                                                <button type="button" onClick={() => { setSelectedImageFile(null); setSelectedImagePreview(null); }} className="absolute top-1 right-1 bg-black/60 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs cursor-pointer">×</button>
                                            </div>
                                        )}
                                        <div className="flex items-center gap-2">
                                            <button type="button" onClick={() => fileInputRef.current?.click()} className="p-2 text-gray-400 hover:text-gray-600 rounded-xl hover:bg-gray-100 transition-colors cursor-pointer shrink-0">
                                                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                                            </button>
                                            <input type="file" ref={fileInputRef} onChange={handleFileChange} accept="image/*" className="hidden" />
                                            <input type="text" placeholder="Type coordination message to resident / team..." value={inputText} onChange={(e) => setInputText(e.target.value)} className="flex-1 px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-2xl text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-[#F97316]/20 focus:border-[#F97316]" />
                                            <button type="submit" disabled={(!inputText.trim() && !selectedImageFile) || isSending} className="px-4 py-2.5 bg-gradient-to-r from-[#F97316] to-[#EA580C] hover:from-[#EA580C] hover:to-[#C2410C] text-white text-xs font-black rounded-2xl shadow-xs transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50">
                                                <span>Send</span>
                                                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" /></svg>
                                            </button>
                                        </div>
                                    </form>
                                )}
                            </>
                        ) : (
                            <div className="flex-1 flex flex-col items-center justify-center text-gray-400 p-8 text-center space-y-3">
                                <span className="text-4xl">💬</span>
                                <h3 className="text-sm font-extrabold text-gray-700">No conversation selected</h3>
                                <p className="text-xs max-w-sm">Select an incident report from the list to view or coordinate with the reporter and responders.</p>
                            </div>
                        )}
                    </div>
                </div>

                <BrgyBottomNav />
            </main>

            {/* Nested Pet Details Modal */}
            {selectedPetDetail && (
                <div className="fixed inset-0 z-[150] flex items-center justify-center p-4 sm:p-10 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
                    <div className="w-full max-w-6xl rounded-[3rem] shadow-2xl animate-in zoom-in-95 duration-200 bg-white overflow-hidden flex flex-col max-h-[90vh] border border-gray-100">
                        <PetDetailPanel
                            pet={selectedPetDetail}
                            onClose={() => setSelectedPetDetail(null)}
                        />
                    </div>
                </div>
            )}
        </div>
    );
};

export default BrgyMessages;
