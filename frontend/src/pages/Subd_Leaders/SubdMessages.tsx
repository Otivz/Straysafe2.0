/* eslint-disable react-hooks/exhaustive-deps, @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars */
import React, { useState, useEffect, useRef } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import SubdSidebar from '../../components/SubdSidebar';
import SubdNavbar from '../../components/Navbars/SubdNavbar';
import SubdBottomNav from '../../components/Navbars/SubdBottomNav';
import { api } from '../../utils/api';
import { DEFAULT_AVATAR } from '../../utils/avatar';
import { generateMemorableTitle } from '../../utils/chatUtils';
import PetDetailPanel from '../../components/PetRecords/PetDetailPanel';
import { type PetRecord, mapRawPetToPetRecord } from '../../components/PetRecords/types';
import { uploadDirectToCloudinary } from '../../utils/cloudinaryUpload';
import { validateFile } from '../../utils/uploadValidation';

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

const HISTORY_STATUS_IDS = [3, 9, 10, 11, 12, 14]; // 3: Rejected, 9: Claimed by Owner, 10: Released, 11: Incident Resolved, 12: Deceased, 14: False Alarm / Dismissed

const formatThreadTime = (dateStr?: string) => {
    if (!dateStr) return '';
    try {
        const d = new Date(dateStr);
        if (isNaN(d.getTime())) return '';
        const now = new Date();
        const diffMs = now.getTime() - d.getTime();
        const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
        if (diffDays === 0) {
            return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
        } else if (diffDays === 1) {
            return 'Yesterday';
        } else if (diffDays < 7) {
            return `${diffDays} days ago`;
        } else {
            return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
        }
    } catch {
        return '';
    }
};

const formatMessageTime = (dateStr?: string) => {
    if (!dateStr) return '';
    try {
        const d = new Date(dateStr);
        if (isNaN(d.getTime())) return '';
        return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    } catch {
        return '';
    }
};

const SubdMessages: React.FC = () => {
    const [searchParams] = useSearchParams();
    const navigate = useNavigate();
    const [threads, setThreads] = useState<ThreadItem[]>(() => getCachedData<ThreadItem[]>('subd_chat_threads') || []);
    const [loading, setLoading] = useState<boolean>(() => !getCachedData<ThreadItem[]>('subd_chat_threads'));
    const [activeTab, setActiveTab] = useState<'my' | 'unassigned' | 'past'>('my');
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedThread, setSelectedThread] = useState<ThreadItem | null>(null);
    const [messages, setMessages] = useState<MessageItem[]>([]);
    const [messagesLoading, setMessagesLoading] = useState(false);
    const [inputText, setInputText] = useState('');
    const [selectedImageFile, setSelectedImageFile] = useState<File | null>(null);
    const [selectedImagePreview, setSelectedImagePreview] = useState<string | null>(null);
    const [isSending, setIsSending] = useState(false);
    const [isClaiming, setIsClaiming] = useState(false);
    const [selectedPetDetail, setSelectedPetDetail] = useState<PetRecord | null>(null);
    const [isLoadingPetDetail, setIsLoadingPetDetail] = useState(false);
    const [showChatOptions, setShowChatOptions] = useState(false);
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

    const handleOpenPetDetail = async (petData: any) => {
        if (!petData) return;
        setIsLoadingPetDetail(true);
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
        } finally {
            setIsLoadingPetDetail(false);
        }
    };

    const messagesEndRef = useRef<HTMLDivElement | null>(null);
    const fileInputRef = useRef<HTMLInputElement | null>(null);

    const userStr = localStorage.getItem('staff_user') || sessionStorage.getItem('staff_user') || localStorage.getItem('resident_user');
    const currentUser = userStr ? JSON.parse(userStr) : { user_id: 2, name: 'Subdivision Leader', role_id: 2 };

    const getMessageCacheKey = (thread: ThreadItem) => {
        const isMatch = thread.thread_mode === 'match' || (thread.match_id !== undefined && thread.match_id !== null && thread.match_id > 0);
        return isMatch ? `subd_chat_msgs_m_${thread.match_id}` : `subd_chat_msgs_r_${thread.report_id}`;
    };

    const fetchThreads = async () => {
        try {
            const res = await api.get('/chat/threads');
            if (Array.isArray(res.data)) {
                setThreads(res.data);
                setCachedData('subd_chat_threads', res.data);

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
                        if (match.report?.assigned_leader_id !== currentUser.user_id) {
                            setActiveTab('unassigned');
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

    const handleClaimCase = async (reportId: number) => {
        try {
            setIsClaiming(true);
            await api.post(`/reports/${reportId}/claim`);
            await fetchThreads();
            setSelectedThread(prev => prev ? {
                ...prev,
                report: prev.report ? {
                    ...prev.report,
                    assigned_leader_id: currentUser.user_id,
                    assigned_leader_name: currentUser.name
                } : undefined
            } : null);
            setActiveTab('my');
        } catch (err: any) {
            console.error('Error claiming report:', err);
            alert(err.response?.data?.detail || 'Failed to claim this report.');
        } finally {
            setIsClaiming(false);
        }
    };

    const handleSendMessage = async (e?: React.FormEvent) => {
        if (e) e.preventDefault();
        if ((!inputText.trim() && !selectedImageFile) || !selectedThread || isSending) return;

        try {
            setIsSending(true);
            let mediaUrl: string | null = null;
            if (selectedImageFile) {
                try {
                    const result = await uploadDirectToCloudinary(selectedImageFile, 'chat_media');
                    mediaUrl = result.url;
                } catch (uploadErr: any) {
                    setIsSending(false);
                    alert(uploadErr?.message || 'Failed to upload attachment. Please try again.');
                    return;
                }
            }

            const isMatch = selectedThread.thread_mode === 'match' || (selectedThread.match_id !== undefined && selectedThread.match_id !== null && selectedThread.match_id > 0);
            const postEndpoint = isMatch 
                ? `/chat/matches/${selectedThread.match_id}/messages` 
                : `/chat/reports/${selectedThread.report_id}/messages`;

            const res = await api.post(postEndpoint, {
                message_text: inputText.trim() || (mediaUrl ? '(Photo attached)' : 'Sent a message'),
                media_url: mediaUrl
            });

            if (res.data) {
                setMessages(prev => [...prev, res.data]);
                setInputText('');
                setSelectedImageFile(null);
                setSelectedImagePreview(null);
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
        if (!file) return;

        const validation = validateFile(file);
        if (!validation.valid) {
            alert(validation.error);
            e.target.value = '';
            return;
        }

        setSelectedImageFile(file);
        const reader = new FileReader();
        reader.onloadend = () => {
            setSelectedImagePreview(reader.result as string);
        };
        reader.readAsDataURL(file);
    };

    const isPastReport = (t: ThreadItem) => {
        if (t.is_closed) return true;
        const isMatch = t.thread_mode === 'match' || !!t.matched_pet;
        const sId = t.report?.current_status_id || t.report?.status_id;
        if (!sId) return false;
        
        // Match inquiry chats stay active during Claimed by Owner (status 9) for handover coordination
        if (isMatch) {
            return [3, 11, 12, 14].includes(Number(sId));
        }
        return HISTORY_STATUS_IDS.includes(Number(sId));
    };

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
            return thread.report?.assigned_leader_id === currentUser.user_id && !isPastReport(thread);
        } else if (activeTab === 'unassigned') {
            return !thread.report?.assigned_leader_id && !isPastReport(thread);
        } else if (activeTab === 'past') {
            return isPastReport(thread);
        }
        return true;
    }).sort((a, b) => {
        const timeA = new Date(a.last_message?.sent_at || a.updated_at || a.created_at).getTime();
        const timeB = new Date(b.last_message?.sent_at || b.updated_at || b.created_at).getTime();
        return timeB - timeA;
    });

    const myCases = threads.filter(t => t.report?.assigned_leader_id === currentUser.user_id && !isPastReport(t));
    const unassignedCases = threads.filter(t => !t.report?.assigned_leader_id && !isPastReport(t));
    const pastCases = threads.filter(t => isPastReport(t));
    const myUnreadCount = myCases.reduce((acc, t) => acc + t.unread_count, 0);
    const unassignedUnreadCount = unassignedCases.reduce((acc, t) => acc + t.unread_count, 0);
    const pastUnreadCount = pastCases.reduce((acc, t) => acc + t.unread_count, 0);

    return (
        <div className="flex h-screen bg-[#FDFBF7] font-sans antialiased overflow-hidden text-gray-900">
            <SubdSidebar mobileOpen={mobileMenuOpen} onMobileClose={() => setMobileMenuOpen(false)} />
            <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
                {/* On mobile: Hide top navbar when full-screen conversation view is active */}
                <div className={`${selectedThread ? 'hidden md:block' : 'block'}`}>
                    <SubdNavbar onMenuToggle={() => setMobileMenuOpen(true)} />
                </div>

                {/* Content Container */}
                <div className="flex-1 flex overflow-hidden p-0 md:p-6 pb-0 md:pb-6 gap-6 max-w-7xl w-full mx-auto">
                    
                    {/* ─── 1. CONVERSATION / THREAD LIST PANEL ─── */}
                    {/* Mobile: 100% width, hidden when selectedThread is open. Desktop: always 96 width */}
                    <div className={`w-full md:w-96 flex flex-col bg-white md:rounded-3xl md:border md:border-gray-100 md:shadow-sm overflow-hidden shrink-0 ${
                        selectedThread ? 'hidden md:flex' : 'flex'
                    }`}>
                        {/* Messages Header Banner */}
                        <div className="p-4 sm:p-5 border-b border-gray-100 space-y-3.5 bg-white">
                            <div className="flex items-center justify-between">
                                <div>
                                    <h1 className="text-lg font-black text-gray-900 flex items-center gap-2">
                                        <span className="text-2xl">💬</span>
                                        <span>Messages</span>
                                    </h1>
                                    <p className="text-[11px] text-gray-400 font-bold mt-0.5">Stay connected with your community</p>
                                </div>
                                <span className="px-2.5 py-1 bg-orange-50 text-[#F97316] border border-orange-100/80 rounded-full text-[10px] font-black">
                                    {threads.length} Total
                                </span>
                            </div>

                            {/* Case Tabs Switcher */}
                            <div className="flex bg-gray-100/80 p-1 rounded-2xl gap-1">
                                <button
                                    onClick={() => setActiveTab('my')}
                                    className={`flex-1 py-2 px-2 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                                        activeTab === 'my' 
                                            ? 'bg-white text-[#F97316] shadow-sm font-black' 
                                            : 'text-gray-500 hover:text-gray-900'
                                    }`}
                                >
                                    <span>My Cases</span>
                                    <span className={`px-1.5 py-0.2 rounded-full text-[9px] font-black ${
                                        activeTab === 'my' ? 'bg-orange-100 text-[#F97316]' : 'bg-gray-200 text-gray-600'
                                    }`}>
                                        {myCases.length}
                                    </span>
                                    {myUnreadCount > 0 && (
                                        <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse"></span>
                                    )}
                                </button>

                                <button
                                    onClick={() => setActiveTab('unassigned')}
                                    className={`flex-1 py-2 px-2 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                                        activeTab === 'unassigned' 
                                            ? 'bg-white text-[#F97316] shadow-sm font-black' 
                                            : 'text-gray-500 hover:text-gray-900'
                                    }`}
                                >
                                    <span>Unassigned</span>
                                    <span className={`px-1.5 py-0.2 rounded-full text-[9px] font-black ${
                                        activeTab === 'unassigned' ? 'bg-orange-100 text-[#F97316]' : 'bg-gray-200 text-gray-600'
                                    }`}>
                                        {unassignedCases.length}
                                    </span>
                                    {unassignedUnreadCount > 0 && (
                                        <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse"></span>
                                    )}
                                </button>

                                <button
                                    onClick={() => setActiveTab('past')}
                                    className={`flex-1 py-2 px-2 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                                        activeTab === 'past' 
                                            ? 'bg-white text-[#F97316] shadow-sm font-black' 
                                            : 'text-gray-500 hover:text-gray-900'
                                    }`}
                                >
                                    <span>Past Reports</span>
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
                                    placeholder="Search by report #, status, resident..."
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                    className="w-full pl-9 pr-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-xs font-medium focus:outline-none focus:ring-2 focus:ring-[#F97316]/20 focus:border-[#F97316]"
                                />
                                <svg className="w-4 h-4 text-gray-400 absolute left-3 top-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                                </svg>
                            </div>
                        </div>

                        {/* Thread Cards List */}
                        <div className="flex-1 overflow-y-auto divide-y divide-gray-100 pb-36 md:pb-0 custom-scrollbar">
                            {loading ? (
                                <div className="p-8 text-center text-gray-400 text-xs font-medium animate-pulse">
                                    Loading conversations...
                                </div>
                            ) : filteredThreads.length === 0 ? (
                                <div className="p-8 text-center text-gray-400 space-y-2">
                                    <span className="text-3xl">📭</span>
                                    <p className="text-xs font-bold text-gray-600">
                                        {activeTab === 'my' 
                                            ? 'No handled cases with active chat' 
                                            : activeTab === 'unassigned' 
                                                ? 'No unassigned conversations' 
                                                : 'No past or archived reports'}
                                    </p>
                                    <p className="text-[11px] max-w-xs mx-auto">
                                        {activeTab === 'my' 
                                            ? 'Claim reports in the Unassigned tab to coordinate with reporters.' 
                                            : activeTab === 'unassigned' 
                                                ? 'Incoming resident inquiries and reported strays will appear here.' 
                                                : 'Completed, resolved, or dismissed report messages will appear here.'}
                                    </p>
                                </div>
                            ) : (
                                filteredThreads.map(thread => {
                                    const isSelected = selectedThread?.thread_id === thread.thread_id;
                                    const isMyHandled = thread.report?.assigned_leader_id === currentUser.user_id;
                                    const isMatchThread = thread.thread_mode === 'match' || !!thread.matched_pet;
                                    const isPast = isPastReport(thread);

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
                                        <button
                                            key={thread.thread_id}
                                            onClick={() => setSelectedThread(thread)}
                                            className={`w-full text-left p-3.5 sm:p-4 flex items-start gap-3.5 transition-colors cursor-pointer ${
                                                isSelected 
                                                    ? 'bg-orange-50/90 md:border-r-4 md:border-[#F97316]' 
                                                    : 'hover:bg-gray-50/80 bg-white'
                                            }`}
                                        >
                                            {/* Pet / Case Thumbnail */}
                                            <div className="relative w-12 h-12 rounded-2xl overflow-hidden bg-gray-100 shrink-0 border border-gray-200 shadow-2xs">
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

                                            {/* Details & Latest Message Preview */}
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center justify-between gap-1">
                                                    <h3 className="text-xs font-black text-gray-900 truncate" title={itemTitle}>
                                                        {itemTitle}
                                                    </h3>
                                                    <div className="flex items-center gap-1.5 shrink-0">
                                                        <span className="text-[10px] text-gray-400 font-semibold">
                                                            {formatThreadTime(thread.last_message?.sent_at || thread.updated_at || thread.created_at)}
                                                        </span>
                                                        {thread.unread_count > 0 ? (
                                                            <span className="w-4 h-4 rounded-full bg-[#F97316] text-white text-[9px] font-black flex items-center justify-center shadow-xs">
                                                                {thread.unread_count}
                                                            </span>
                                                        ) : (
                                                            <span className="text-gray-300 text-xs font-bold">›</span>
                                                        )}
                                                    </div>
                                                </div>

                                                <div className="flex items-center gap-1.5 mt-1">
                                                    {thread.report?.status_id ? (
                                                        <span className={`px-2 py-0.5 rounded-md text-[8px] font-black shrink-0 border ${getReportStatusBadgeStyle(thread.report.status_id)}`}>
                                                            {getReportStatusLabel(thread.report.status_id)}
                                                        </span>
                                                    ) : isPast ? (
                                                        <span className="px-2 py-0.5 bg-gray-100 text-gray-700 rounded-md text-[8px] font-black shrink-0 border border-gray-200">
                                                            Closed
                                                        </span>
                                                    ) : isMyHandled ? (
                                                        <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 rounded-md text-[8px] font-black shrink-0">
                                                            Handled
                                                        </span>
                                                    ) : (
                                                        <span className="px-2 py-0.5 bg-amber-100 text-amber-900 rounded-md text-[8px] font-black shrink-0">
                                                            Unassigned
                                                        </span>
                                                    )}

                                                    {isMatchThread ? (
                                                        <span className="px-1.5 py-0.5 bg-orange-50 text-[#F97316] rounded-md text-[8px] font-extrabold shrink-0 border border-orange-200/60">
                                                            🐾 Owner Match
                                                        </span>
                                                    ) : (
                                                        <span className="px-1.5 py-0.5 bg-blue-50 text-blue-800 rounded-md text-[8px] font-extrabold shrink-0 border border-blue-200/60">
                                                            📋 Case Chat
                                                        </span>
                                                    )}
                                                </div>

                                                <p className="text-[11px] text-gray-500 font-medium truncate mt-1">
                                                    Reporter: {isMatchThread ? (thread.matched_pet?.owner_name || 'Resident') : (thread.report?.reporter_name || 'Resident')}
                                                </p>

                                                {thread.last_message && (
                                                    <p className="text-[11px] text-gray-500 truncate mt-0.5">
                                                        <span className="font-semibold text-gray-700">{thread.last_message.sender_name}: </span>
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

                    {/* ─── 2. CONVERSATION / CHAT PANEL ─── */}
                    {/* Mobile: Fullscreen when selectedThread !== null. Desktop: flex-1 */}
                    <div className={`flex-1 flex flex-col min-w-0 bg-[#F8FAFC] md:rounded-3xl md:border md:border-gray-100 md:shadow-sm overflow-hidden h-full ${
                        selectedThread ? 'flex' : 'hidden md:flex'
                    }`}>
                        {selectedThread ? (
                            <>
                                {/* TOP CHAT HEADER */}
                                <div className="p-3 sm:p-4 bg-white border-b border-gray-100 flex items-center justify-between shrink-0 shadow-xs relative z-20">
                                    <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
                                        {/* Mobile Back Button: returns to conversation list */}
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setSelectedThread(null);
                                                setShowChatOptions(false);
                                            }}
                                            className="md:hidden w-8 h-8 rounded-full bg-orange-50 hover:bg-orange-100 border border-orange-200 text-[#F97316] flex items-center justify-center shrink-0 cursor-pointer active:scale-95 transition-all"
                                            title="Back to Messages List"
                                        >
                                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 19l-7-7 7-7" />
                                            </svg>
                                        </button>

                                        {/* Animal Avatar on Desktop */}
                                        <div className="w-10 h-10 rounded-xl overflow-hidden bg-gray-100 shrink-0 border border-gray-200 hidden sm:block">
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
                                                    <>
                                                        <h2 className="text-xs sm:text-sm font-black text-gray-900 truncate" title={headerTitle}>
                                                            {headerTitle}
                                                        </h2>
                                                        <div className="flex items-center gap-1.5 flex-wrap mt-0.5">
                                                            {selectedThread.report?.status_id ? (
                                                                <span className={`px-2 py-0.2 rounded text-[8px] font-black border shrink-0 ${getReportStatusBadgeStyle(selectedThread.report.status_id)}`}>
                                                                    {getReportStatusLabel(selectedThread.report.status_id)}
                                                                </span>
                                                            ) : isPastReport(selectedThread) ? (
                                                                <span className="px-2 py-0.2 rounded text-[8px] font-black border bg-gray-100 text-gray-700 border-gray-200 shrink-0">
                                                                    Resolved
                                                                </span>
                                                            ) : (
                                                                <span className="px-2 py-0.2 rounded text-[8px] font-black border bg-emerald-50 text-emerald-700 border-emerald-200 shrink-0">
                                                                    Active Case
                                                                </span>
                                                            )}
                                                            <span className="px-2 py-0.2 rounded text-[8px] font-bold bg-blue-50 text-blue-700 border border-blue-100 shrink-0">
                                                                Case #SR-{String(selectedThread.report_id).padStart(4, '0')}
                                                            </span>
                                                        </div>
                                                    </>
                                                );
                                            })()}
                                        </div>
                                    </div>

                                    {/* Right Actions: Desktop Buttons + Mobile 3-Dots Menu */}
                                    <div className="flex items-center gap-2 shrink-0">
                                        <div className="hidden sm:flex items-center gap-2">
                                            <button
                                                onClick={() => navigate(`/subd/reports/${selectedThread.report_id}`)}
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

                                        {/* Mobile 3-dots Menu */}
                                        <div className="relative">
                                            <button
                                                type="button"
                                                onClick={() => setShowChatOptions(!showChatOptions)}
                                                className="p-1.5 rounded-full hover:bg-gray-100 text-gray-600 transition-colors cursor-pointer"
                                                title="Options"
                                            >
                                                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z" />
                                                </svg>
                                            </button>

                                            {showChatOptions && (
                                                <div className="absolute right-0 top-full mt-2 w-48 bg-white rounded-2xl shadow-xl border border-gray-100 py-1.5 z-50 animate-in fade-in zoom-in-95 duration-150">
                                                    <button
                                                        onClick={() => {
                                                            setShowChatOptions(false);
                                                            navigate(`/subd/reports/${selectedThread.report_id}`);
                                                        }}
                                                        className="w-full px-4 py-2.5 text-left text-xs font-bold text-gray-700 hover:bg-orange-50 hover:text-[#F97316] flex items-center gap-2 cursor-pointer"
                                                    >
                                                        <span>📋</span>
                                                        <span>View Case Details</span>
                                                    </button>
                                                    {selectedThread.matched_pet && (
                                                        <button
                                                            onClick={() => {
                                                                setShowChatOptions(false);
                                                                navigate(`/resident/reports/${selectedThread.report_id}/match-review`);
                                                            }}
                                                            className="w-full px-4 py-2.5 text-left text-xs font-bold text-gray-700 hover:bg-orange-50 hover:text-[#F97316] flex items-center gap-2 cursor-pointer"
                                                        >
                                                            <span>🔍</span>
                                                            <span>Review AI Match</span>
                                                        </button>
                                                    )}
                                                    <button
                                                        onClick={() => {
                                                            setShowChatOptions(false);
                                                            fetchMessagesForThread(selectedThread);
                                                        }}
                                                        className="w-full px-4 py-2.5 text-left text-xs font-bold text-gray-700 hover:bg-orange-50 hover:text-[#F97316] flex items-center gap-2 cursor-pointer"
                                                    >
                                                        <span>🔄</span>
                                                        <span>Refresh Chat</span>
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>

                                {/* RESIDENT CONTACT BANNER (Under Header) */}
                                <div className="bg-white border-b border-gray-100 px-4 py-2.5 flex items-center justify-between gap-3 shadow-2xs">
                                    <div className="flex items-center gap-3 min-w-0">
                                        <div className="w-10 h-10 rounded-2xl overflow-hidden bg-gray-100 border border-gray-200 shadow-2xs shrink-0">
                                            <img
                                                src={selectedThread.report?.reporter_photo || selectedThread.counterpart?.avatar || DEFAULT_AVATAR}
                                                alt="Resident Avatar"
                                                className="w-full h-full object-cover"
                                                onError={(e: any) => { e.target.src = DEFAULT_AVATAR; }}
                                            />
                                        </div>
                                        <div className="min-w-0">
                                            <p className="text-xs font-black text-gray-900 truncate">
                                                {selectedThread.matched_pet?.owner_name || selectedThread.report?.reporter_name || 'Resident'}
                                            </p>
                                            <p className="text-[10px] text-gray-400 font-bold truncate">
                                                Resident • {selectedThread.report?.subdivision_name || 'Selera Homes'}
                                            </p>
                                        </div>
                                    </div>

                                    <button
                                        type="button"
                                        onClick={() => navigate(`/subd/reports/${selectedThread.report_id}`)}
                                        className="w-9 h-9 rounded-full bg-blue-50 text-blue-600 hover:bg-blue-100 border border-blue-100 flex items-center justify-center shrink-0 cursor-pointer transition-all"
                                        title="Resident Details"
                                    >
                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                                        </svg>
                                    </button>
                                </div>

                                {/* UNASSIGNED BANNER IF APPLICABLE */}
                                {!selectedThread.report?.assigned_leader_id ? (
                                    <div className="bg-amber-500/10 border-b border-amber-300 px-4 py-3 flex items-center justify-between gap-3 shrink-0">
                                        <div className="flex items-center gap-2.5 text-xs text-amber-950 font-bold min-w-0">
                                            <span className="text-base">⚠️</span>
                                            <div className="min-w-0">
                                                <p className="font-extrabold uppercase text-[10px] tracking-wider text-amber-900">Unassigned Report</p>
                                                <p className="text-[11px] text-amber-800 font-semibold truncate">Claim this case to become the designated officer handling messages.</p>
                                            </div>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={() => handleClaimCase(selectedThread.report_id)}
                                            disabled={isClaiming}
                                            className="px-4 py-2 bg-[#F97316] hover:bg-[#EA580C] text-white text-[11px] font-black rounded-xl shadow-xs transition-all uppercase tracking-wider shrink-0 cursor-pointer disabled:opacity-50"
                                        >
                                            {isClaiming ? 'Claiming...' : '🛡️ Claim This Case'}
                                        </button>
                                    </div>
                                ) : selectedThread.report?.assigned_leader_id !== currentUser.user_id && (
                                    <div className="bg-blue-500/10 border-b border-blue-200 px-4 py-2.5 flex items-center justify-between gap-3 shrink-0">
                                        <div className="flex items-center gap-2 text-xs text-blue-950 font-bold min-w-0">
                                            <span>👤</span>
                                            <p className="text-[11px] text-blue-900 truncate">
                                                Primary Handler: <strong>{selectedThread.report?.assigned_leader_name || `Officer #${selectedThread.report?.assigned_leader_id}`}</strong>
                                            </p>
                                        </div>
                                    </div>
                                )}

                                {/* CHAT MESSAGES BODY */}
                                <div className="flex-1 overflow-y-auto p-4 space-y-3.5 custom-scrollbar">
                                    {/* Date Separator Pill */}
                                    <div className="flex justify-center my-2">
                                        <span className="px-3 py-1 rounded-full bg-gray-200/70 text-gray-600 text-[10px] font-black uppercase tracking-wider">
                                            Today: {new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                                        </span>
                                    </div>

                                    {/* AI Look-Alike Match Banner Card */}
                                    {selectedThread.matched_pet && (
                                        <div className="bg-gradient-to-b from-orange-50/95 via-amber-50/40 to-white text-gray-900 border border-orange-200 rounded-2xl p-4 space-y-3 shadow-sm mb-4">
                                            <div className="flex items-center justify-between gap-2 border-b border-orange-100 pb-2">
                                                <div className="flex items-center gap-2">
                                                    <span className="w-2.5 h-2.5 rounded-full bg-[#F97316] animate-pulse"></span>
                                                    <span className="text-xs font-black uppercase tracking-wider text-orange-950">
                                                        AI Potential Look-Alike Match Details
                                                    </span>
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    <span className="px-2.5 py-0.5 bg-gradient-to-r from-orange-500 to-amber-500 text-white rounded-full text-[10px] font-black shadow-2xs">
                                                        {selectedThread.matched_pet.similarity_score || 95}% Match
                                                    </span>
                                                    <button
                                                        type="button"
                                                        onClick={() => navigate(`/resident/reports/${selectedThread.report_id}/match-review`)}
                                                        className="text-xs font-extrabold text-[#F97316] hover:underline cursor-pointer"
                                                    >
                                                        Review Sighting ↗
                                                    </button>
                                                </div>
                                            </div>

                                            <div className="grid grid-cols-2 gap-3">
                                                <div className="bg-white rounded-xl border border-gray-200/80 p-2.5 space-y-2 shadow-2xs">
                                                    <div className="flex items-center justify-between text-[9px] font-bold text-gray-500">
                                                        <span className="px-1.5 py-0.2 bg-orange-100 text-[#F97316] rounded font-black">
                                                            Report #{selectedThread.report_id}
                                                        </span>
                                                        <span>Reported Sighting</span>
                                                    </div>
                                                    <div className="h-32 rounded-lg overflow-hidden relative bg-gray-100 border border-gray-100">
                                                        <img
                                                            src={selectedThread.report?.media_url || (selectedThread.matched_pet as any)?.sighting_photo_url || DEFAULT_AVATAR}
                                                            alt="Sighting"
                                                            className="w-full h-full object-cover"
                                                            onError={(e: any) => { e.target.src = DEFAULT_AVATAR; }}
                                                        />
                                                        <span className="absolute bottom-1 left-1 px-1.5 py-0.5 bg-black/65 text-white text-[8px] font-black rounded">
                                                            Original Photo
                                                        </span>
                                                    </div>
                                                    <div className="grid grid-cols-2 gap-1 text-[9px]">
                                                        <div className="bg-gray-50 p-1.5 rounded">
                                                            <span className="text-gray-400 block text-[8px]">SPECIES</span>
                                                            <span className="font-bold text-gray-800 truncate block">{selectedThread.report?.animal_type || 'Dog'}</span>
                                                        </div>
                                                        <div className="bg-gray-50 p-1.5 rounded">
                                                            <span className="text-gray-400 block text-[8px]">BREED</span>
                                                            <span className="font-bold text-gray-800 truncate block">{selectedThread.report?.animal_breed || 'Reported Breed'}</span>
                                                        </div>
                                                        <div className="bg-gray-50 p-1.5 rounded">
                                                            <span className="text-gray-400 block text-[8px]">COLOR</span>
                                                            <span className="font-bold text-gray-800 truncate block">{selectedThread.report?.animal_color || 'Reported Color'}</span>
                                                        </div>
                                                        <div className="bg-gray-50 p-1.5 rounded">
                                                            <span className="text-gray-400 block text-[8px]">LOCATION</span>
                                                            <span className="font-bold text-gray-800 truncate block">{selectedThread.report?.landmark || 'Subdivision Area'}</span>
                                                        </div>
                                                    </div>
                                                </div>

                                                <div className="bg-white rounded-xl border border-amber-200 p-2.5 space-y-2 shadow-2xs">
                                                    <div className="flex items-center justify-between text-[9px] font-bold text-amber-900">
                                                        <span className="px-1.5 py-0.2 bg-amber-100 text-amber-900 rounded font-black truncate">
                                                            Pet: {selectedThread.matched_pet.pet_name || 'Candidate'}
                                                        </span>
                                                        <button
                                                            type="button"
                                                            onClick={() => handleOpenPetDetail(selectedThread.matched_pet)}
                                                            disabled={isLoadingPetDetail}
                                                            className="px-2 py-0.5 bg-amber-500 hover:bg-amber-600 text-white rounded text-[8px] font-black uppercase tracking-wider flex items-center gap-1 transition-all cursor-pointer shadow-2xs shrink-0"
                                                        >
                                                            <span>🐾 View Record</span>
                                                            <span>↗</span>
                                                        </button>
                                                    </div>
                                                    <div 
                                                        onClick={() => handleOpenPetDetail(selectedThread.matched_pet)}
                                                        className="h-32 rounded-lg overflow-hidden relative bg-gray-100 border border-amber-100 cursor-pointer group"
                                                    >
                                                        <img
                                                            src={selectedThread.matched_pet.photo_url || DEFAULT_AVATAR}
                                                            alt="Candidate"
                                                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                                                            onError={(e: any) => { e.target.src = DEFAULT_AVATAR; }}
                                                        />
                                                        <span className="absolute bottom-1 left-1 px-1.5 py-0.5 bg-amber-600/90 text-white text-[8px] font-black rounded flex items-center gap-1">
                                                            <span>Registered Profile</span>
                                                            <span className="text-[7px] text-amber-200">• Click for details ↗</span>
                                                        </span>
                                                    </div>
                                                    <div className="grid grid-cols-2 gap-1 text-[9px]">
                                                        <div className="bg-gray-50 p-1.5 rounded">
                                                            <span className="text-gray-400 block text-[8px]">BREED</span>
                                                            <span className="font-bold text-gray-800 truncate block">{selectedThread.matched_pet.breed || 'Registered Breed'}</span>
                                                        </div>
                                                        <div className="bg-gray-50 p-1.5 rounded">
                                                            <span className="text-gray-400 block text-[8px]">COLOR</span>
                                                            <span className="font-bold text-gray-800 truncate block">{selectedThread.matched_pet.color || 'Registered Color'}</span>
                                                        </div>
                                                        <div className="bg-gray-50 p-1.5 rounded">
                                                            <span className="text-gray-400 block text-[8px]">SIZE</span>
                                                            <span className="font-bold text-gray-800 truncate block">{selectedThread.matched_pet.size || 'Medium'}</span>
                                                        </div>
                                                        <div className="bg-gray-50 p-1.5 rounded">
                                                            <span className="text-gray-400 block text-[8px]">OWNER</span>
                                                            <span className="font-bold text-gray-800 truncate block">{selectedThread.matched_pet.owner_name || 'Resident'}</span>
                                                        </div>
                                                    </div>

                                                    <button
                                                        type="button"
                                                        onClick={() => handleOpenPetDetail(selectedThread.matched_pet)}
                                                        disabled={isLoadingPetDetail}
                                                        className="w-full py-1.5 bg-amber-50 hover:bg-amber-100 border border-amber-200 text-amber-900 rounded-lg text-[9px] font-black uppercase tracking-wider flex items-center justify-center gap-1 transition-all cursor-pointer shadow-2xs"
                                                    >
                                                        <span>📋 Open Full Animal Record Modal</span>
                                                        <span className="text-[10px]">↗</span>
                                                    </button>
                                                </div>
                                            </div>

                                            <button
                                                type="button"
                                                onClick={() => navigate(`/resident/reports/${selectedThread.report_id}/match-review`)}
                                                className="w-full py-2.5 px-4 bg-gradient-to-r from-[#F97316] to-[#EA580C] hover:from-[#EA580C] hover:to-[#C2410C] text-white rounded-xl text-xs font-black uppercase tracking-wider flex items-center justify-center gap-2 shadow-2xs transition-all cursor-pointer"
                                            >
                                                <span>🔍 Review Potential Match Sighting</span>
                                                <span>→</span>
                                            </button>
                                        </div>
                                    )}

                                    {messagesLoading ? (
                                        <div className="p-6 text-center text-gray-400 text-xs animate-pulse">Loading messages...</div>
                                    ) : messages.length === 0 ? (
                                        <div className="p-10 text-center text-gray-400 space-y-2">
                                            <span className="text-3xl">💬</span>
                                            <p className="text-xs font-bold text-gray-600">No messages sent yet</p>
                                            <p className="text-[11px]">Type below to coordinate with the reporter.</p>
                                        </div>
                                    ) : (
                                        messages.map(msg => {
                                            if (msg.is_system) {
                                                return (
                                                    <div key={msg.message_id} className="my-3 p-3 bg-white border border-gray-100 rounded-2xl flex items-start gap-2.5 shadow-2xs max-w-md mx-auto">
                                                        <span className="w-6 h-6 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center text-xs font-black shrink-0">✓</span>
                                                        <div className="flex-1 min-w-0">
                                                            <p className="text-xs font-black text-gray-900">Case Updated</p>
                                                            <p className="text-[11px] text-gray-600 mt-0.5">{msg.message_text}</p>
                                                            <span className="text-[9px] text-gray-400 mt-1 block">{formatMessageTime(msg.sent_at)}</span>
                                                        </div>
                                                    </div>
                                                );
                                            }
                                            const isMe = msg.sender_id === currentUser.user_id;

                                            return (
                                                <div key={msg.message_id} className={`flex items-end gap-2.5 ${isMe ? 'justify-end' : 'justify-start'}`}>
                                                    {!isMe && (
                                                        <div className="w-8 h-8 rounded-full overflow-hidden bg-gray-200 shrink-0 border border-white shadow-2xs mb-1">
                                                            <img 
                                                                src={msg.sender_avatar || selectedThread.report?.reporter_photo || DEFAULT_AVATAR} 
                                                                alt={msg.sender_name} 
                                                                className="w-full h-full object-cover" 
                                                                onError={(e: any) => { e.target.src = DEFAULT_AVATAR; }} 
                                                            />
                                                        </div>
                                                    )}

                                                    <div className={`max-w-[78%] sm:max-w-[70%] space-y-1 ${isMe ? 'items-end' : 'items-start'}`}>
                                                        <div className={`p-3.5 rounded-2xl text-xs leading-relaxed shadow-2xs ${
                                                            isMe 
                                                                ? 'bg-gradient-to-r from-[#F97316] to-[#EA580C] text-white rounded-br-xs' 
                                                                : 'bg-white text-gray-900 rounded-bl-xs border border-gray-100'
                                                        }`}>
                                                            {msg.media_url && (
                                                                <div className="mb-2 rounded-xl overflow-hidden border border-black/10 max-h-48">
                                                                    <img src={msg.media_url} alt="Attachment" className="w-full h-full object-cover" />
                                                                </div>
                                                            )}
                                                            <p className="whitespace-pre-wrap font-medium">{msg.message_text}</p>
                                                        </div>

                                                        {/* Timestamp & Read Checkmark */}
                                                        <div className={`flex items-center gap-1 text-[10px] text-gray-400 ${isMe ? 'justify-end pr-1' : 'justify-start pl-1'}`}>
                                                            <span>{formatMessageTime(msg.sent_at)}</span>
                                                        </div>
                                                    </div>

                                                    {isMe && (
                                                        <div className="w-8 h-8 rounded-full overflow-hidden bg-orange-100 shrink-0 border border-white shadow-2xs mb-1">
                                                            <img 
                                                                src={currentUser.avatar || DEFAULT_AVATAR} 
                                                                alt="Officer Avatar" 
                                                                className="w-full h-full object-cover" 
                                                                onError={(e: any) => { e.target.src = DEFAULT_AVATAR; }} 
                                                            />
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        })
                                    )}
                                    <div ref={messagesEndRef} />
                                </div>

                                {/* FIXED BOTTOM COMPOSER */}
                                {isPastReport(selectedThread) ? (
                                    <div className="p-4 bg-gray-50 border-t border-gray-200 text-center shrink-0 flex items-center justify-center gap-3">
                                        <div className="w-8 h-8 rounded-full bg-gray-200 text-gray-500 flex items-center justify-center text-sm font-bold shrink-0">
                                            🔒
                                        </div>
                                        <div className="text-left">
                                            <p className="text-xs font-bold text-gray-700">Case Resolved & Archived</p>
                                            <p className="text-[11px] text-gray-500">This report has been resolved and direct messaging is in read-only mode.</p>
                                        </div>
                                    </div>
                                ) : (
                                    <form onSubmit={handleSendMessage} className="p-3 sm:p-4 bg-white border-t border-gray-100 flex flex-col gap-2 shrink-0 shadow-lg relative z-20">
                                        {selectedImagePreview && (
                                            <div className="relative inline-block w-20 h-20 rounded-xl overflow-hidden border border-gray-200 mb-1">
                                                <img src={selectedImagePreview} alt="Preview" className="w-full h-full object-cover" />
                                                <button type="button" onClick={() => { setSelectedImageFile(null); setSelectedImagePreview(null); }} className="absolute top-1 right-1 bg-black/60 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs">×</button>
                                            </div>
                                        )}
                                        <div className="flex items-center gap-2">
                                            {/* Attachment paperclip button */}
                                            <button 
                                                type="button" 
                                                onClick={() => fileInputRef.current?.click()} 
                                                className="w-10 h-10 rounded-full bg-gray-100 hover:bg-gray-200 text-gray-600 flex items-center justify-center transition-colors cursor-pointer shrink-0"
                                                title="Attach image"
                                            >
                                                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                                                </svg>
                                            </button>
                                            <input type="file" ref={fileInputRef} onChange={handleFileChange} accept="image/*" className="hidden" />
                                            
                                            {/* Input text */}
                                            <input 
                                                type="text" 
                                                placeholder="Type a message..." 
                                                value={inputText} 
                                                onChange={(e) => setInputText(e.target.value)} 
                                                className="flex-1 px-4 py-3 bg-gray-50 border border-gray-200 rounded-full text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-[#F97316]/20 focus:border-[#F97316]" 
                                            />

                                            {/* Circular Orange Send button */}
                                            <button 
                                                type="submit" 
                                                disabled={(!inputText.trim() && !selectedImageFile) || isSending} 
                                                className="w-10 h-10 rounded-full bg-[#F97316] hover:bg-[#EA580C] active:scale-95 text-white flex items-center justify-center shadow-md shadow-orange-500/25 transition-all cursor-pointer disabled:opacity-40 shrink-0"
                                                title="Send Message"
                                            >
                                                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 transform rotate-90 translate-x-0.5" viewBox="0 0 20 20" fill="currentColor">
                                                    <path d="M10.894 2.553a1 1 0 00-1.788 0l-7 14a1 1 0 001.169 1.409l5-1.429A1 1 0 009 15.571V11a1 1 0 112 0v4.571a1 1 0 00.725.962l5 1.428a1 1 0 001.17-1.408l-7-14z" />
                                                </svg>
                                            </button>
                                        </div>
                                    </form>
                                )}
                            </>
                        ) : (
                            <div className="flex-1 flex flex-col items-center justify-center text-gray-400 p-8 text-center space-y-3">
                                <span className="text-4xl">💬</span>
                                <h3 className="text-sm font-extrabold text-gray-700">No conversation selected</h3>
                                <p className="text-xs max-w-sm">Select a case report or match inquiry from the left panel to coordinate directly with the reporter or pet owner.</p>
                            </div>
                        )}
                    </div>
                </div>

                {/* Bottom Navigation on Mobile: Only shown when in thread list screen */}
                {!selectedThread && (
                    <div className="md:hidden">
                        <SubdBottomNav />
                    </div>
                )}
            </div>

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

export default SubdMessages;
