import React, { useState, useEffect, useRef } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import BrgySidebar from '../../components/BrgySidebar';
import BrgyNavbar from '../../components/Navbars/BrgyNavbar';
import { api } from '../../utils/api';
import { DEFAULT_AVATAR } from '../../utils/avatar';
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
    const [activeTab, setActiveTab] = useState<'my' | 'all' | 'past'>(isHeadOfficer ? 'all' : 'my');
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

    const myCases = threads.filter(t => (t.is_assigned || (!isHeadOfficer && t.can_interact)) && !isPastReport(t));
    const allCases = threads.filter(t => !isPastReport(t));
    const pastCases = threads.filter(t => isPastReport(t));

    const myUnreadCount = myCases.reduce((acc, t) => acc + t.unread_count, 0);
    const allUnreadCount = allCases.reduce((acc, t) => acc + t.unread_count, 0);
    const pastUnreadCount = pastCases.reduce((acc, t) => acc + t.unread_count, 0);

    const filteredThreads = threads.filter(thread => {
        const matchesSearch = 
            `report #${thread.report_id}`.toLowerCase().includes(searchTerm.toLowerCase()) ||
            (thread.report?.reporter_name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
            (thread.matched_pet?.pet_name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
            (thread.matched_pet?.owner_name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
            (thread.last_message?.text || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
            (thread.report?.status_id ? getReportStatusLabel(thread.report.status_id).toLowerCase().includes(searchTerm.toLowerCase()) : false);

        if (!matchesSearch) return false;

        if (activeTab === 'my') {
            return (thread.is_assigned || (!isHeadOfficer && thread.can_interact)) && !isPastReport(thread);
        } else if (activeTab === 'all') {
            return !isPastReport(thread);
        } else if (activeTab === 'past') {
            return isPastReport(thread);
        }
        return true;
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

                <div className="flex-1 flex overflow-hidden p-4 sm:p-6 gap-6 max-w-7xl w-full mx-auto">
                    {/* LEFT PANEL: THREAD LIST */}
                    <div className="w-80 md:w-96 flex flex-col bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden shrink-0">
                        <div className="p-4 border-b border-gray-100 space-y-3">
                            <div className="flex items-center justify-between">
                                <h1 className="text-base font-black text-gray-900 flex items-center gap-2">
                                    <span className="text-xl">💬</span>
                                    <span>Incident Chats</span>
                                </h1>
                                <span className="px-2 py-0.5 bg-orange-100 text-[#F97316] rounded-full text-[10px] font-black">
                                    {threads.length} Total
                                </span>
                            </div>

                            {/* Tabs */}
                            <div className="flex bg-gray-100/80 p-1 rounded-2xl gap-1">
                                {isHeadOfficer ? (
                                    <>
                                        <button
                                            onClick={() => setActiveTab('all')}
                                            className={`flex-1 py-1.5 px-2 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1 cursor-pointer ${
                                                activeTab === 'all' 
                                                    ? 'bg-white text-gray-900 shadow-2xs font-extrabold' 
                                                    : 'text-gray-500 hover:text-gray-900'
                                            }`}
                                        >
                                            <span>All Reports</span>
                                            <span className={`px-1.5 py-0.2 rounded-full text-[9px] font-black ${
                                                activeTab === 'all' ? 'bg-orange-100 text-[#F97316]' : 'bg-gray-200 text-gray-600'
                                            }`}>
                                                {allCases.length}
                                            </span>
                                            {allUnreadCount > 0 && (
                                                <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse"></span>
                                            )}
                                        </button>

                                        <button
                                            onClick={() => setActiveTab('my')}
                                            className={`flex-1 py-1.5 px-2 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1 cursor-pointer ${
                                                activeTab === 'my' 
                                                    ? 'bg-white text-gray-900 shadow-2xs font-extrabold' 
                                                    : 'text-gray-500 hover:text-gray-900'
                                            }`}
                                        >
                                            <span>My Handled</span>
                                            <span className={`px-1.5 py-0.2 rounded-full text-[9px] font-black ${
                                                activeTab === 'my' ? 'bg-orange-100 text-[#F97316]' : 'bg-gray-200 text-gray-600'
                                            }`}>
                                                {myCases.length}
                                            </span>
                                            {myUnreadCount > 0 && (
                                                <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse"></span>
                                            )}
                                        </button>
                                    </>
                                ) : (
                                    <button
                                        onClick={() => setActiveTab('my')}
                                        className={`flex-1 py-1.5 px-2 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1 cursor-pointer ${
                                            activeTab === 'my' 
                                                ? 'bg-white text-gray-900 shadow-2xs font-extrabold' 
                                                : 'text-gray-500 hover:text-gray-900'
                                        }`}
                                    >
                                        <span>Assigned Reports</span>
                                        <span className={`px-1.5 py-0.2 rounded-full text-[9px] font-black ${
                                            activeTab === 'my' ? 'bg-emerald-100 text-emerald-800' : 'bg-gray-200 text-gray-600'
                                        }`}>
                                            {myCases.length}
                                        </span>
                                        {myUnreadCount > 0 && (
                                            <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse"></span>
                                        )}
                                    </button>
                                )}

                                <button
                                    onClick={() => setActiveTab('past')}
                                    className={`flex-1 py-1.5 px-2 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1 cursor-pointer ${
                                        activeTab === 'past' 
                                            ? 'bg-white text-gray-900 shadow-2xs font-extrabold' 
                                            : 'text-gray-500 hover:text-gray-900'
                                    }`}
                                >
                                    <span>Past</span>
                                    <span className={`px-1.5 py-0.2 rounded-full text-[9px] font-black ${
                                        activeTab === 'past' ? 'bg-orange-100 text-[#F97316]' : 'bg-gray-200 text-gray-600'
                                    }`}>
                                        {pastCases.length}
                                    </span>
                                    {pastUnreadCount > 0 && (
                                        <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse"></span>
                                    )}
                                </button>
                            </div>

                            {/* Search */}
                            <div className="relative">
                                <input
                                    type="text"
                                    placeholder="Search Report #, animal, resident..."
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                    className="w-full pl-9 pr-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-[#F97316]/20 focus:border-[#F97316]"
                                />
                                <svg className="w-4 h-4 text-gray-400 absolute left-3 top-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                                </svg>
                            </div>
                        </div>

                        {/* Thread List */}
                        <div className="flex-1 overflow-y-auto divide-y divide-gray-50">
                            {loading ? (
                                <div className="p-6 text-center text-gray-400 text-xs font-medium animate-pulse">
                                    Loading conversations...
                                </div>
                            ) : filteredThreads.length === 0 ? (
                                <div className="p-8 text-center text-gray-400 space-y-2">
                                    <span className="text-3xl">📭</span>
                                    <p className="text-xs font-bold text-gray-600">
                                        {activeTab === 'my' 
                                            ? 'No assigned incident cases currently' 
                                            : activeTab === 'all' 
                                                ? 'No active incident reports in barangay' 
                                                : 'No past or archived reports'}
                                    </p>
                                    <p className="text-[11px]">
                                        {activeTab === 'my' 
                                            ? 'Reports where you are dispatched or assigned will appear here.' 
                                            : activeTab === 'all' 
                                                ? 'Active incidents in this barangay will be listed here.' 
                                                : 'Completed or resolved case messages appear here.'}
                                    </p>
                                </div>
                            ) : (
                                filteredThreads.map(thread => {
                                    const isSelected = selectedThread?.thread_id === thread.thread_id;
                                    const isMatchThread = thread.thread_mode === 'match' || !!thread.matched_pet;
                                    const isPast = isPastReport(thread);
                                    const threadCanSend = thread.can_interact ?? (isHeadOfficer || thread.is_assigned);

                                    return (
                                        <button
                                            key={thread.thread_id}
                                            onClick={() => setSelectedThread(thread)}
                                            className={`w-full text-left p-3.5 flex items-start gap-3 transition-colors ${
                                                isSelected ? 'bg-orange-50/80 border-r-4 border-[#F97316]' : 'hover:bg-gray-50'
                                            }`}
                                        >
                                            <div className="relative w-11 h-11 rounded-xl overflow-hidden bg-gray-100 shrink-0 border border-gray-200 shadow-2xs">
                                                <img
                                                    src={isMatchThread ? (thread.matched_pet?.photo_url || DEFAULT_AVATAR) : (thread.report?.media_url || thread.report?.reporter_photo || DEFAULT_AVATAR)}
                                                    alt="Thumbnail"
                                                    className="w-full h-full object-cover"
                                                    onError={(e: any) => { e.target.src = DEFAULT_AVATAR; }}
                                                />
                                                {isMatchThread && (
                                                    <span className="absolute bottom-0 inset-x-0 bg-[#F97316] text-white text-[7px] font-black text-center py-0.2 uppercase">
                                                        Match
                                                    </span>
                                                )}
                                            </div>

                                            <div className="flex-1 min-w-0">
                                                {(() => {
                                                    const itemTitle = generateMemorableTitle({
                                                        isMatch: isMatchThread,
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

                                                    return (
                                                        <div className="flex items-center justify-between gap-1">
                                                            <div className="flex items-center gap-1.5 min-w-0 flex-wrap">
                                                                <h3 className="text-xs font-bold text-gray-900 truncate" title={itemTitle}>
                                                                    {itemTitle}
                                                                </h3>
                                                                {thread.report?.status_id ? (
                                                                    <span className={`px-1.5 py-0.2 rounded text-[8px] font-black shrink-0 border ${getReportStatusBadgeStyle(thread.report.status_id)}`}>
                                                                        {getReportStatusLabel(thread.report.status_id)}
                                                                    </span>
                                                                ) : isPast ? (
                                                                    <span className="px-1.5 py-0.2 bg-gray-100 text-gray-700 rounded text-[8px] font-black shrink-0 border border-gray-200">
                                                                        Closed
                                                                    </span>
                                                                ) : null}

                                                                {/* Role / Assignment Badge */}
                                                                {thread.is_assigned ? (
                                                                    <span className="px-1.5 py-0.2 bg-emerald-100 text-emerald-800 rounded text-[8px] font-black shrink-0">
                                                                        ✓ Assigned
                                                                    </span>
                                                                ) : isHeadOfficer ? (
                                                                    <span className="px-1.5 py-0.2 bg-purple-100 text-purple-800 rounded text-[8px] font-black shrink-0">
                                                                        👑 Oversight
                                                                    </span>
                                                                ) : !threadCanSend ? (
                                                                    <span className="px-1.5 py-0.2 bg-gray-100 text-gray-600 rounded text-[8px] font-bold shrink-0">
                                                                        👀 View Only
                                                                    </span>
                                                                ) : null}
                                                            </div>

                                                            {thread.unread_count > 0 && (
                                                                <span className="px-1.5 py-0.2 bg-[#F97316] text-white rounded-full text-[9px] font-black shrink-0">
                                                                    {thread.unread_count}
                                                                </span>
                                                            )}
                                                        </div>
                                                    );
                                                })()}

                                                <div className="flex items-center gap-1 mt-0.5">
                                                    {isMatchThread ? (
                                                        <span className="px-1 py-0.2 bg-orange-100 text-[#F97316] rounded text-[8px] font-extrabold shrink-0">
                                                            🐾 Match
                                                        </span>
                                                    ) : (
                                                        <span className="px-1 py-0.2 bg-blue-100 text-blue-800 rounded text-[8px] font-extrabold shrink-0">
                                                            📋 Case
                                                        </span>
                                                    )}
                                                    <p className="text-[11px] text-gray-500 font-medium truncate">
                                                        {isMatchThread 
                                                            ? `Owner: ${thread.matched_pet?.owner_name || 'Resident'}`
                                                            : `Reporter: ${thread.report?.reporter_name || 'Resident'}`
                                                        }
                                                    </p>
                                                </div>

                                                {thread.last_message && (
                                                    <p className="text-[10px] text-gray-400 truncate mt-1">
                                                        <span className="font-semibold text-gray-600">{thread.last_message.sender_name}: </span>
                                                        {thread.last_message.text}
                                                    </p>
                                                )}
                                            </div>
                                        </button>
                                    );
                                })
                            )}
                        </div>
                    </div>

                    {/* RIGHT PANEL: CHAT VIEW */}
                    <div className="flex-1 flex flex-col min-w-0 bg-slate-50/50 rounded-3xl border border-gray-100 shadow-sm overflow-hidden">
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
                                <div className="p-4 bg-white border-b border-gray-100 flex items-center justify-between shrink-0 shadow-2xs">
                                    <div className="flex items-center gap-3 min-w-0">
                                        <div className="w-10 h-10 rounded-xl overflow-hidden bg-gray-100 shrink-0 border border-gray-200">
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
