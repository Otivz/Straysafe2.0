import React, { useState, useEffect, useRef } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import SubdSidebar from '../../components/SubdSidebar';
import SubdNavbar from '../../components/Navbars/SubdNavbar';
import { api } from '../../utils/api';
import { DEFAULT_AVATAR } from '../../utils/avatar';
import { generateMemorableTitle } from '../../utils/chatUtils';
import PetDetailPanel from '../../components/PetRecords/PetDetailPanel';
import { type PetRecord, mapRawPetToPetRecord } from '../../components/PetRecords/types';

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

const SubdMessages: React.FC = () => {
    const [searchParams] = useSearchParams();
    const navigate = useNavigate();
    const [threads, setThreads] = useState<ThreadItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState<'my' | 'unassigned' | 'all'>('my');
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

    const fetchThreads = async () => {
        try {
            const res = await api.get('/chat/threads');
            if (Array.isArray(res.data)) {
                setThreads(res.data);

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
        try {
            setMessagesLoading(true);
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
                        if (Array.isArray(res.data)) setMessages(res.data);
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
            const formData = new FormData();
            formData.append('message_text', inputText.trim() || 'Sent an attachment');
            if (selectedImageFile) {
                formData.append('file', selectedImageFile);
            }

            const isMatch = selectedThread.thread_mode === 'match' || (selectedThread.match_id !== undefined && selectedThread.match_id !== null && selectedThread.match_id > 0);
            const postEndpoint = isMatch 
                ? `/chat/matches/${selectedThread.match_id}/messages` 
                : `/chat/reports/${selectedThread.report_id}/messages`;

            const res = await api.post(postEndpoint, formData, {
                headers: { 'Content-Type': 'multipart/form-data' }
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

        setSelectedImageFile(file);
        const reader = new FileReader();
        reader.onloadend = () => {
            setSelectedImagePreview(reader.result as string);
        };
        reader.readAsDataURL(file);
    };

    const filteredThreads = threads.filter(thread => {
        const matchesSearch = 
            `report #${thread.report_id}`.toLowerCase().includes(searchTerm.toLowerCase()) ||
            (thread.report?.reporter_name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
            (thread.matched_pet?.pet_name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
            (thread.matched_pet?.owner_name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
            (thread.last_message?.text || '').toLowerCase().includes(searchTerm.toLowerCase());

        if (!matchesSearch) return false;

        if (activeTab === 'my') {
            return thread.report?.assigned_leader_id === currentUser.user_id;
        } else if (activeTab === 'unassigned') {
            return !thread.report?.assigned_leader_id;
        }
        return true;
    });

    const myCases = threads.filter(t => t.report?.assigned_leader_id === currentUser.user_id);
    const unassignedCases = threads.filter(t => !t.report?.assigned_leader_id);
    const myUnreadCount = myCases.reduce((acc, t) => acc + t.unread_count, 0);
    const unassignedUnreadCount = unassignedCases.reduce((acc, t) => acc + t.unread_count, 0);

    return (
        <div className="flex h-screen bg-[#FDFBF7] font-sans antialiased overflow-hidden text-gray-900">
            <SubdSidebar />
            <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
                <SubdNavbar />
                <div className="flex-1 flex overflow-hidden p-6 gap-6 max-w-7xl w-full mx-auto">
                    <div className="w-80 md:w-96 flex flex-col bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden shrink-0">
                        <div className="p-4 border-b border-gray-100 space-y-3">
                            <div className="flex items-center justify-between">
                                <h1 className="text-base font-black text-gray-900 flex items-center gap-2">
                                    <span className="text-xl">💬</span>
                                    <span>Case Messages</span>
                                </h1>
                                <span className="px-2 py-0.5 bg-orange-100 text-[#F97316] rounded-full text-[10px] font-black">
                                    {threads.length} Total
                                </span>
                            </div>

                            <div className="flex bg-gray-100/80 p-1 rounded-2xl gap-1">
                                <button
                                    onClick={() => setActiveTab('my')}
                                    className={`flex-1 py-1.5 px-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                                        activeTab === 'my' 
                                            ? 'bg-white text-gray-900 shadow-2xs font-extrabold' 
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
                                    className={`flex-1 py-1.5 px-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                                        activeTab === 'unassigned' 
                                            ? 'bg-white text-gray-900 shadow-2xs font-extrabold' 
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
                            </div>

                            {/* Search */}
                            <div className="relative">
                                <input
                                    type="text"
                                    placeholder="Search by Report #, resident, pet..."
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
                                        {activeTab === 'my' ? 'No handled cases with active chat' : 'No unassigned conversations'}
                                    </p>
                                    <p className="text-[11px]">
                                        {activeTab === 'my' ? 'Claim reports in the Unassigned tab to manage them here.' : 'Incoming resident inquiries will appear here.'}
                                    </p>
                                </div>
                            ) : (
                                filteredThreads.map(thread => {
                                const isSelected = selectedThread?.thread_id === thread.thread_id;
                                const isMyHandled = thread.report?.assigned_leader_id === currentUser.user_id;
                                const isMatchThread = thread.thread_mode === 'match' || !!thread.matched_pet;

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
                                                        <div className="flex items-center gap-1.5 min-w-0">
                                                            <h3 className="text-xs font-bold text-gray-900 truncate" title={itemTitle}>
                                                                {itemTitle}
                                                            </h3>
                                                            {isMyHandled ? (
                                                                <span className="px-1.5 py-0.2 bg-emerald-100 text-emerald-800 rounded text-[8px] font-black shrink-0">
                                                                    Handled
                                                                </span>
                                                            ) : (
                                                                <span className="px-1.5 py-0.2 bg-amber-100 text-amber-900 rounded text-[8px] font-black shrink-0">
                                                                    Unassigned
                                                                </span>
                                                            )}
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
                                                        🐾 Owner Match
                                                    </span>
                                                ) : (
                                                    <span className="px-1 py-0.2 bg-blue-100 text-blue-800 rounded text-[8px] font-extrabold shrink-0">
                                                        📋 Case Chat
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
                            }))}
                        </div>
                    </div>

                    <div className="flex-1 flex flex-col min-w-0 bg-slate-50/50 rounded-3xl border border-gray-100 shadow-sm overflow-hidden">
                        {selectedThread ? (
                            <>
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
                                </div>

                                <div className="flex-1 overflow-y-auto p-4 space-y-3.5 custom-scrollbar">
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
                                                            src={selectedThread.report?.media_url || selectedThread.report?.reporter_photo || DEFAULT_AVATAR}
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
                                        </div>
                                    ) : (
                                        messages.map(msg => {
                                            if (msg.is_system) {
                                                return (
                                                    <div key={msg.message_id} className="flex justify-center my-2">
                                                        <div className="px-3.5 py-1 rounded-full bg-orange-100/70 border border-orange-200/80 text-[10px] font-bold text-orange-900">{msg.message_text}</div>
                                                    </div>
                                                );
                                            }
                                            const isMe = msg.sender_id === currentUser.user_id;
                                            const isLookAlikeMsg = (
                                                msg.message_text.toLowerCase().includes('look-alike') || 
                                                msg.message_text.toLowerCase().includes('look-alik') || 
                                                msg.message_text.toLowerCase().includes('similarity') || 
                                                msg.message_text.toLowerCase().includes('detected a') ||
                                                msg.message_text.toLowerCase().includes('match for your registered pet') ||
                                                msg.message_text.toLowerCase().includes('side-by-side comparison')
                                            ) && !!selectedThread.matched_pet;

                                            return (
                                                <div key={msg.message_id} className={`flex items-end gap-2 ${isMe ? 'justify-end' : 'justify-start'}`}>
                                                    {!isMe && (
                                                        <div className="w-7 h-7 rounded-full overflow-hidden bg-gray-200 shrink-0 border border-white shadow-2xs">
                                                            <img src={msg.sender_avatar || DEFAULT_AVATAR} alt={msg.sender_name} className="w-full h-full object-cover" onError={(e: any) => { e.target.src = DEFAULT_AVATAR; }} />
                                                        </div>
                                                    )}
                                                    <div className={`${isLookAlikeMsg ? 'max-w-[85%] md:max-w-[75%]' : 'max-w-[70%]'} space-y-1 ${isMe ? 'items-end' : 'items-start'}`}>
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

                                                            {/* Embedded Look-Alike Sighting Comparison Card */}
                                                            {isLookAlikeMsg && selectedThread.matched_pet && (
                                                                <div 
                                                                    onClick={(e) => {
                                                                        e.stopPropagation();
                                                                        navigate(`/resident/reports/${selectedThread.report_id}/match-review`);
                                                                    }}
                                                                    className="mt-3 bg-gradient-to-b from-orange-50/95 via-amber-50/40 to-white text-gray-900 border border-orange-200 rounded-2xl p-3.5 space-y-2.5 shadow-xs cursor-pointer hover:border-orange-400 hover:shadow-md transition-all text-left"
                                                                >
                                                                    <div className="flex items-center justify-between gap-2 border-b border-orange-100 pb-2">
                                                                        <div className="flex items-center gap-1.5">
                                                                            <span className="w-2.5 h-2.5 rounded-full bg-[#F97316] animate-pulse"></span>
                                                                            <span className="text-[11px] font-black uppercase tracking-wider text-orange-950">
                                                                                LOOK-ALIKE SIGHTING COMPARISON
                                                                            </span>
                                                                        </div>
                                                                        <div className="flex items-center gap-1.5">
                                                                            <span className="px-2.5 py-0.5 bg-gradient-to-r from-orange-500 to-amber-500 text-white rounded-full text-[10px] font-black shadow-2xs">
                                                                                {selectedThread.matched_pet.similarity_score || 95}% Match
                                                                            </span>
                                                                            <span className="text-[10px] font-extrabold text-[#F97316] hover:underline">Review ↗</span>
                                                                        </div>
                                                                    </div>

                                                                    {/* Side-by-Side Comparison Boxes */}
                                                                    <div className="grid grid-cols-2 gap-2.5">
                                                                        {/* Sighting Box */}
                                                                        <div className="bg-white rounded-xl border border-gray-200/80 p-2.5 space-y-1.5 shadow-2xs">
                                                                            <div className="flex items-center justify-between text-[9px] font-bold text-gray-500">
                                                                                <span className="px-1.5 py-0.2 bg-orange-100 text-[#F97316] rounded font-black">
                                                                                    Report #{selectedThread.report_id}
                                                                                </span>
                                                                                <span>Sighting</span>
                                                                            </div>
                                                                            <div className="h-28 rounded-lg overflow-hidden relative bg-gray-100 border border-gray-100">
                                                                                <img
                                                                                    src={selectedThread.report?.media_url || selectedThread.report?.reporter_photo || DEFAULT_AVATAR}
                                                                                    alt="Sighting"
                                                                                    className="w-full h-full object-cover"
                                                                                    onError={(e: any) => { e.target.src = DEFAULT_AVATAR; }}
                                                                                />
                                                                                <span className="absolute bottom-1 left-1 px-1.5 py-0.5 bg-black/65 text-white text-[8px] font-black rounded">
                                                                                    Original Photo
                                                                                </span>
                                                                            </div>
                                                                            <div className="grid grid-cols-2 gap-1 text-[9px]">
                                                                                <div className="bg-gray-50 p-1 rounded">
                                                                                    <span className="text-gray-400 block text-[7px]">SPECIES</span>
                                                                                    <span className="font-bold text-gray-800 truncate block">{selectedThread.report?.animal_type || 'Dog'}</span>
                                                                                </div>
                                                                                <div className="bg-gray-50 p-1 rounded">
                                                                                    <span className="text-gray-400 block text-[7px]">BREED</span>
                                                                                    <span className="font-bold text-gray-800 truncate block">{selectedThread.report?.animal_breed || 'Reported Breed'}</span>
                                                                                </div>
                                                                                <div className="bg-gray-50 p-1 rounded">
                                                                                    <span className="text-gray-400 block text-[7px]">COLOR</span>
                                                                                    <span className="font-bold text-gray-800 truncate block">{selectedThread.report?.animal_color || 'Reported Color'}</span>
                                                                                </div>
                                                                                <div className="bg-gray-50 p-1 rounded">
                                                                                    <span className="text-gray-400 block text-[7px]">SIZE</span>
                                                                                    <span className="font-bold text-gray-800 truncate block">Medium</span>
                                                                                </div>
                                                                            </div>
                                                                            <div className="bg-gray-50 p-1 rounded text-[9px]">
                                                                                <span className="text-gray-400 block text-[7px]">LOCATION</span>
                                                                                <p className="font-bold text-gray-800 truncate">{selectedThread.report?.landmark || 'Subdivision Area'}</p>
                                                                            </div>
                                                                        </div>

                                                                        {/* Registered Pet Box */}
                                                                        <div className="bg-white rounded-xl border border-amber-200 p-2.5 space-y-1.5 shadow-2xs">
                                                                            <div className="flex items-center justify-between text-[9px] font-bold text-amber-900">
                                                                                <span className="px-1.5 py-0.2 bg-amber-100 text-amber-900 rounded font-black truncate">
                                                                                    Pet: {selectedThread.matched_pet.pet_name || 'Candidate'}
                                                                                </span>
                                                                                <span className="text-gray-400 font-bold truncate max-w-[80px]">Owner: {selectedThread.matched_pet.owner_name || 'Resident'}</span>
                                                                            </div>
                                                                            <div className="h-28 rounded-lg overflow-hidden relative bg-gray-100 border border-amber-100">
                                                                                <img
                                                                                    src={selectedThread.matched_pet.photo_url || DEFAULT_AVATAR}
                                                                                    alt="Candidate"
                                                                                    className="w-full h-full object-cover"
                                                                                    onError={(e: any) => { e.target.src = DEFAULT_AVATAR; }}
                                                                                />
                                                                                <span className="absolute bottom-1 left-1 px-1.5 py-0.5 bg-amber-600/90 text-white text-[8px] font-black rounded">
                                                                                    Candidate Profile
                                                                                </span>
                                                                            </div>
                                                                            <div className="grid grid-cols-2 gap-1 text-[9px]">
                                                                                <div className="bg-gray-50 p-1 rounded">
                                                                                    <span className="text-gray-400 block text-[7px]">SPECIES</span>
                                                                                    <span className="font-bold text-gray-800 truncate block">Dog</span>
                                                                                </div>
                                                                                <div className="bg-gray-50 p-1 rounded">
                                                                                    <span className="text-gray-400 block text-[7px]">BREED</span>
                                                                                    <span className="font-bold text-gray-800 truncate block">{selectedThread.matched_pet.breed || 'Registered Breed'}</span>
                                                                                </div>
                                                                                <div className="bg-gray-50 p-1 rounded">
                                                                                    <span className="text-gray-400 block text-[7px]">COLOR</span>
                                                                                    <span className="font-bold text-gray-800 truncate block">{selectedThread.matched_pet.color || 'Registered Color'}</span>
                                                                                </div>
                                                                                <div className="bg-gray-50 p-1 rounded">
                                                                                    <span className="text-gray-400 block text-[7px]">SIZE</span>
                                                                                    <span className="font-bold text-gray-800 truncate block">{selectedThread.matched_pet.size || 'Medium'}</span>
                                                                                </div>
                                                                            </div>
                                                                            <div className="bg-gray-50 p-1 rounded text-[9px]">
                                                                                <span className="text-gray-400 block text-[7px]">REGISTERED TO</span>
                                                                                <p className="font-bold text-gray-800 truncate">{selectedThread.matched_pet.owner_name ? `Owned by ${selectedThread.matched_pet.owner_name}` : 'Registered Pet'}</p>
                                                                            </div>
                                                                        </div>
                                                                    </div>

                                                                    {/* Feature Match Score Summary */}
                                                                    <div className="flex items-center gap-1.5 bg-orange-100/60 border border-orange-200/70 px-2.5 py-1 rounded-lg text-[9px] font-bold text-orange-950">
                                                                        <span>✓ High visual and feature match score</span>
                                                                    </div>

                                                                    {/* Action Button */}
                                                                    <button
                                                                        type="button"
                                                                        onClick={(e) => {
                                                                            e.stopPropagation();
                                                                            navigate(`/resident/reports/${selectedThread.report_id}/match-review`);
                                                                        }}
                                                                        className="w-full py-2.5 px-4 bg-gradient-to-r from-[#F97316] to-[#EA580C] hover:from-[#EA580C] hover:to-[#C2410C] text-white rounded-xl text-xs font-black uppercase tracking-wider flex items-center justify-center gap-2 shadow-2xs transition-all cursor-pointer"
                                                                    >
                                                                        <span>🔍 REVIEW POTENTIAL MATCH</span>
                                                                        <span>→</span>
                                                                    </button>
                                                                </div>
                                                            )}
                                                        </div>
                                                    </div>
                                                </div>
                                            );
                                        })
                                    )}
                                    <div ref={messagesEndRef} />
                                </div>

                                <form onSubmit={handleSendMessage} className="p-4 bg-white border-t border-gray-100 flex flex-col gap-2 shrink-0">
                                    {selectedImagePreview && (
                                        <div className="relative inline-block w-20 h-20 rounded-xl overflow-hidden border border-gray-200 mb-1">
                                            <img src={selectedImagePreview} alt="Preview" className="w-full h-full object-cover" />
                                            <button type="button" onClick={() => { setSelectedImageFile(null); setSelectedImagePreview(null); }} className="absolute top-1 right-1 bg-black/60 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs">×</button>
                                        </div>
                                    )}
                                    <div className="flex items-center gap-2">
                                        <button type="button" onClick={() => fileInputRef.current?.click()} className="p-2 text-gray-400 hover:text-gray-600 rounded-xl hover:bg-gray-100 transition-colors cursor-pointer shrink-0">
                                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                                        </button>
                                        <input type="file" ref={fileInputRef} onChange={handleFileChange} accept="image/*" className="hidden" />
                                        <input type="text" placeholder="Type coordination message..." value={inputText} onChange={(e) => setInputText(e.target.value)} className="flex-1 px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-2xl text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-[#F97316]/20 focus:border-[#F97316]" />
                                        <button type="submit" disabled={(!inputText.trim() && !selectedImageFile) || isSending} className="px-4 py-2.5 bg-gradient-to-r from-[#F97316] to-[#EA580C] hover:from-[#EA580C] hover:to-[#C2410C] text-white text-xs font-black rounded-2xl shadow-xs transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50">
                                            <span>Send</span>
                                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" /></svg>
                                        </button>
                                    </div>
                                </form>
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
