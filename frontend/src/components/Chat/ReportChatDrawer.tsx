import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { notifyChatUpdated, markReportChatAsSeen, generateMemorableTitle } from '../../utils/chatUtils';
import { api } from '../../utils/api';
import { DEFAULT_AVATAR } from '../../utils/avatar';

export interface ChatMessage {
    id: string;
    senderId: number;
    senderName: string;
    senderRole: string; // 'Citizen' | 'Subdivision Leader' | 'Barangay Staff' | 'Admin'
    senderAvatar?: string;
    text: string;
    mediaUrl?: string;
    timestamp: string;
    isRead?: boolean;
    isSystemMessage?: boolean;
}

export interface MatchedPetInfo {
    pet_id?: number;
    pet_name?: string;
    photo_url?: string;
    species?: string;
    breed?: string;
    color?: string;
    size?: string;
    owner_name?: string;
    registered_address?: string;
    similarity_score?: number;
    sighting_photo_url?: string;
    sighting_species?: string;
    sighting_breed?: string;
    sighting_color?: string;
    sighting_size?: string;
    sighting_landmark?: string;
    sighting_description?: string;
    key_evidence_bullets?: string[];
}

interface ReportChatDrawerProps {
    isOpen: boolean;
    onClose: () => void;
    report: {
        report_id: number;
        user_id: number;
        reporter_name?: string;
        reporter_photo?: string;
        animal_type?: string;
        category_id?: number;
        status_id?: number;
        landmark?: string;
        created_at?: string;
    } | null;
    currentUser: {
        user_id: number;
        name: string;
        role_id: number; // 1: Citizen, 2: Subdivision Leader, 3: Barangay Staff, 4: Admin
        profile_picture?: string;
    } | null;
    customCounterpartName?: string;
    customCounterpartRole?: string;
    initialMessageSnippet?: string;
    matchedPet?: MatchedPetInfo | null;
    matchId?: number;
    threadMode?: 'report' | 'match';
    highlightMatch?: boolean;
}

const roleNameMap: Record<number, string> = {
    1: 'Citizen',
    2: 'Subdivision Leader',
    3: 'Barangay Staff',
    4: 'System Admin'
};

const statusNameMap: Record<number, string> = {
    1: 'Reported',
    2: 'Verified',
    3: 'Rejected',
    4: 'Escalated to Barangay',
    5: 'Rescue In Progress',
    6: 'Picked Up',
    7: 'Under Observation',
    8: 'Impounded',
    9: 'Claimed by Owner',
    10: 'Released',
    11: 'Resolved',
    12: 'Deceased',
    13: 'Approved',
    14: 'False Alarm / Dismissed'
};

export default function ReportChatDrawer({
    isOpen,
    onClose,
    report,
    currentUser,
    customCounterpartName,
    customCounterpartRole,
    initialMessageSnippet,
    matchedPet,
    matchId,
    threadMode = 'report',
    highlightMatch
}: ReportChatDrawerProps) {
    const navigate = useNavigate();
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [inputText, setInputText] = useState(initialMessageSnippet || '');
    const [isUploadingMedia, setIsUploadingMedia] = useState(false);
    const [selectedImagePreview, setSelectedImagePreview] = useState<string | null>(null);
    const [selectedImageFile, setSelectedImageFile] = useState<File | null>(null);
    const [isTyping] = useState(false);
    const messagesEndRef = useRef<HTMLDivElement | null>(null);
    const fileInputRef = useRef<HTMLInputElement | null>(null);

    const [autoMatchId, setAutoMatchId] = useState<number | undefined>(matchId);
    const [localMatchedPet, setLocalMatchedPet] = useState<MatchedPetInfo | null>(matchedPet || null);

    const reportId = report?.report_id || 0;
    const rawStatusId = (report as any)?.current_status_id || report?.status_id;
    const effectiveMatchId = autoMatchId || matchId || 0;
    const isReporter = currentUser && report && currentUser.user_id === report.user_id;
    const isMatchMode = (threadMode === 'match') || (threadMode !== 'report' && effectiveMatchId > 0 && !isReporter);

    // If match mode: match chat remains open for coordination during Claimed by Owner (ID 9). Only closes on 3, 11, 12, 14.
    const isResolved = isMatchMode 
        ? Boolean(rawStatusId && [3, 11, 12, 14].includes(Number(rawStatusId)))
        : Boolean(rawStatusId && [3, 9, 10, 11, 12, 14].includes(Number(rawStatusId)));
    const isClaimApprovedPendingPickup = isMatchMode && Number(rawStatusId) === 9;

    const shouldHighlightMatch = highlightMatch || threadMode === 'match' || (typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('highlightMatch') === 'true');

    const storageKey = isMatchMode 
        ? `straysafe_match_chat_${effectiveMatchId}` 
        : `straysafe_report_chat_${reportId}`;

    const messagesGetUrl = isMatchMode 
        ? `/chat/matches/${effectiveMatchId}/messages` 
        : `/chat/reports/${reportId}/messages`;

    const messagesPostUrl = isMatchMode 
        ? `/chat/matches/${effectiveMatchId}/messages` 
        : `/chat/reports/${reportId}/messages`;

    const markReadUrl = isMatchMode 
        ? `/chat/matches/${effectiveMatchId}/read` 
        : `/chat/reports/${reportId}/read`;

    useEffect(() => {
        if (matchId) {
            setAutoMatchId(matchId);
        }
    }, [matchId]);

    useEffect(() => {
        if (matchedPet) {
            setLocalMatchedPet(matchedPet);
            return;
        }
        if (isOpen && reportId && threadMode !== 'report') {
            api.get(`/matches/report/${reportId}`)
                .then(res => {
                    if (Array.isArray(res.data) && res.data.length > 0) {
                        const myMatch = res.data.find((m: any) => m.matched_pet?.owner_id === currentUser?.user_id) || res.data[0];
                        if (myMatch && myMatch.match_id) {
                            setAutoMatchId(myMatch.match_id);
                        }
                        if (myMatch && myMatch.matched_pet) {
                            setLocalMatchedPet({
                                pet_id: myMatch.matched_pet.pet_id,
                                pet_name: myMatch.matched_pet.pet_name,
                                photo_url: myMatch.matched_pet.photo_url,
                                species: myMatch.matched_pet.species || myMatch.matched_pet.animal_type || 'Dog',
                                breed: myMatch.matched_pet.breed,
                                color: myMatch.matched_pet.color || `${myMatch.matched_pet.primary_color || ''} ${myMatch.matched_pet.secondary_color || ''}`.trim(),
                                size: myMatch.matched_pet.size,
                                owner_name: myMatch.matched_pet.owner?.name,
                                registered_address: myMatch.matched_pet.owner?.address || myMatch.matched_pet.registered_address,
                                similarity_score: myMatch.similarity_score || 95,
                                sighting_photo_url: (report as any)?.media?.[0]?.file_url || (report as any)?.reporter_photo || (report as any)?.photo_url,
                                sighting_species: report?.animal_type,
                                sighting_breed: (report as any)?.animal_breed || (report as any)?.ai_possible_breed,
                                sighting_color: (report as any)?.animal_color || (report as any)?.ai_dominant_color,
                                sighting_size: (report as any)?.animal_size || (report as any)?.ai_estimated_size,
                                sighting_landmark: report?.landmark,
                                key_evidence_bullets: myMatch.evidence_bullets || ['High visual and feature match score']
                            });
                        }
                    }
                })
                .catch(err => console.warn('Could not auto-fetch match details for drawer:', err));
        }
    }, [isOpen, reportId, matchedPet, currentUser]);

    // Identify Counterpart
    const isResidentUser = !currentUser || currentUser.role_id === 1;

    const counterpartName = customCounterpartName || (isResidentUser
        ? ((report as any)?.assigned_leader_name ? `${(report as any).assigned_leader_name} (Subdivision Leader)` : 'Subdivision Leader & Responders')
        : (localMatchedPet?.owner_name 
            ? `${localMatchedPet.owner_name} (Owner of ${localMatchedPet.pet_name || 'Pet'})` 
            : (report?.reporter_name || `Resident (User #${report?.user_id || '?'})`)));

    const counterpartRole = customCounterpartRole || (isResidentUser
        ? (isMatchMode ? 'Pet Owner / Reviewer' : 'Subdivision Operations')
        : (localMatchedPet?.owner_name ? 'Registered Pet Owner' : 'Incident Reporter'));

    useEffect(() => {
        if (isOpen && initialMessageSnippet && !inputText) {
            setInputText(initialMessageSnippet);
        }
    }, [isOpen, initialMessageSnippet]);

    // Load messages from Backend API with localStorage cache
    useEffect(() => {
        if (!isOpen) return;
        if (!isMatchMode && !reportId) return;
        if (isMatchMode && !effectiveMatchId) return;

        // Mark unread messages as seen immediately upon opening drawer
        if (isMatchMode) {
            api.patch(markReadUrl).catch(() => {});
        } else {
            markReportChatAsSeen(reportId, currentUser?.user_id);
        }

        // 1. Initial cached messages for instant rendering
        const stored = localStorage.getItem(storageKey);
        if (stored) {
            try {
                const parsed: ChatMessage[] = JSON.parse(stored);
                // Mark incoming as read in local view
                const viewed = parsed.map(m => (!currentUser || m.senderId !== currentUser.user_id ? { ...m, isRead: true } : m));
                setMessages(viewed);
            } catch (err) {
                console.error('Error loading cached chat messages:', err);
            }
        }

        // 2. Fetch live messages from Backend Database
        const fetchLiveMessages = async () => {
            try {
                const response = await api.get(messagesGetUrl);
                if (response.data && Array.isArray(response.data) && response.data.length > 0) {
                    const mapped: ChatMessage[] = response.data.map((m: any) => ({
                        id: `msg-${m.message_id}`,
                        senderId: m.sender_id,
                        senderName: m.sender_name || 'User',
                        senderRole: m.sender_role || 'Citizen',
                        senderAvatar: m.sender_avatar,
                        text: m.message_text,
                        mediaUrl: m.media_url,
                        timestamp: m.sent_at 
                            ? new Date(m.sent_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) 
                            : 'Recently',
                        isRead: true, // Seen since user opened the drawer
                        isSystemMessage: m.is_system
                    }));
                    setMessages(mapped);
                    localStorage.setItem(storageKey, JSON.stringify(mapped));
                    if (isMatchMode) {
                        api.patch(markReadUrl).catch(() => {});
                    } else {
                        markReportChatAsSeen(reportId, currentUser?.user_id);
                    }
                } else if (!stored) {
                    // Default initial welcome if empty
                    const defaultMessages: ChatMessage[] = [
                        {
                            id: 'sys-1',
                            senderId: 0,
                            senderName: 'System Bot',
                            senderRole: 'System',
                            text: isMatchMode
                                ? `🔒 Direct verification channel initialized for Pet Look-Alike Match #${effectiveMatchId}. Messages are private between you and the owner/officer.`
                                : `🔒 Case chat initialized for Report #STR-${reportId.toString().padStart(4, '0')}. All messages are archived for official records.`,
                            timestamp: 'Just now',
                            isSystemMessage: true,
                            isRead: true
                        }
                    ];
                    setMessages(defaultMessages);
                    localStorage.setItem(storageKey, JSON.stringify(defaultMessages));
                    if (isMatchMode) {
                        api.patch(markReadUrl).catch(() => {});
                    } else {
                        markReportChatAsSeen(reportId, currentUser?.user_id);
                    }
                }
            } catch (error) {
                console.warn('Live chat fetch fallback to local:', error);
            }
        };

        fetchLiveMessages();
    }, [isOpen, reportId, effectiveMatchId, isMatchMode, storageKey, messagesGetUrl, markReadUrl, report, currentUser]);

    // Auto-scroll to bottom
    useEffect(() => {
        if (isOpen) {
            messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
        }
    }, [messages, isOpen, isTyping]);

    const handleSendMessage = async (e?: React.FormEvent) => {
        if (e) e.preventDefault();
        const trimmed = inputText.trim();
        if (!trimmed && !selectedImagePreview) return;
        if (isResolved) return;

        const now = new Date();
        const timeFormatted = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

        // Optimistic UI update
        const tempMessage: ChatMessage = {
            id: `msg-${Date.now()}`,
            senderId: currentUser?.user_id || 999,
            senderName: currentUser?.name || 'Authorized Responder',
            senderRole: roleNameMap[currentUser?.role_id || 2] || 'Subdivision Leader',
            senderAvatar: currentUser?.profile_picture,
            text: trimmed,
            mediaUrl: selectedImagePreview || undefined,
            timestamp: timeFormatted,
            isRead: false
        };

        const updated = [...messages, tempMessage];
        setMessages(updated);
        localStorage.setItem(storageKey, JSON.stringify(updated));
        if (!isMatchMode) {
            notifyChatUpdated(reportId);
        }
        
        const currentInput = trimmed;
        const currentFile = selectedImageFile;
        setInputText('');
        setSelectedImagePreview(null);
        setSelectedImageFile(null);

        // Send to backend
        try {
            const formData = new FormData();
            formData.append('message_text', currentInput || '(Photo attached)');
            if (currentFile) {
                formData.append('file', currentFile);
            }
            await api.post(messagesPostUrl, formData, {
                headers: { 'Content-Type': 'multipart/form-data' }
            });
        } catch (err) {
            console.error('Error sending message to backend:', err);
        }
    };

    const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setSelectedImageFile(file);
        setIsUploadingMedia(true);
        const reader = new FileReader();
        reader.onloadend = () => {
            setSelectedImagePreview(reader.result as string);
            setIsUploadingMedia(false);
        };
        reader.readAsDataURL(file);
    };

    if (!isOpen || !report || !currentUser) return null;

    return (
        <div className="fixed inset-0 z-[99999] overflow-hidden">
            {/* Backdrop */}
            <div 
                className="absolute inset-0 bg-black/50 backdrop-blur-xs transition-opacity animate-in fade-in duration-300"
                onClick={onClose}
            />

            {/* Slide-over / Full Screen Mobile Container */}
            <div className="fixed inset-0 sm:inset-y-0 sm:right-0 sm:left-auto max-w-full flex pointer-events-none z-[99999]">
                <div className="w-full sm:w-screen sm:max-w-md h-full pointer-events-auto bg-white shadow-2xl flex flex-col sm:border-l border-gray-200 animate-in slide-in-from-right duration-300">
                    
                    {/* Header */}
                    <div className="p-3.5 sm:p-4 bg-gradient-to-r from-orange-500 via-orange-600 to-amber-500 text-white flex items-center justify-between shadow-md shrink-0">
                        <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
                            {/* Back Button */}
                            <button
                                onClick={onClose}
                                className="p-1.5 -ml-1 rounded-full hover:bg-white/20 active:scale-90 transition-all text-white flex items-center justify-center cursor-pointer shrink-0"
                                title={isMatchMode ? "Back to Match Review" : "Back to Reports"}
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                                </svg>
                            </button>

                            <div className="relative shrink-0">
                                <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-white/20 border-2 border-white/40 flex items-center justify-center font-bold text-sm text-white overflow-hidden shadow-sm">
                                    {report?.reporter_photo ? (
                                        <img src={report.reporter_photo} alt="" className="w-full h-full object-cover" />
                                    ) : (
                                        counterpartName.charAt(0).toUpperCase()
                                    )}
                                </div>
                                <span className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-emerald-400 border-2 border-white rounded-full"></span>
                            </div>

                            <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-1.5 flex-wrap">
                                    <h3 className="font-extrabold text-xs sm:text-sm truncate tracking-tight text-white leading-tight">
                                        {counterpartName}
                                    </h3>
                                    <span className="px-1.5 py-0.5 bg-white/20 text-white rounded-full text-[8px] sm:text-[9px] font-black uppercase tracking-wider shrink-0">
                                        {isMatchMode ? `MATCH #${effectiveMatchId}` : `#STR-${(report?.report_id || 0).toString().padStart(4, '0')}`}
                                    </span>
                                </div>
                                <p className="text-[10px] sm:text-[11px] text-orange-100 font-medium truncate mt-0.5">
                                    {counterpartRole} • <span className="text-white font-bold">{isMatchMode ? 'Direct Look-Alike Inquiry' : (statusNameMap[report?.status_id || 1] || 'Active')}</span>
                                </p>
                            </div>
                        </div>
                    </div>

                    {/* Report Summary Quick Strip */}
                    <div className="px-4 py-2 bg-orange-50/80 border-b border-orange-100 flex items-center justify-between text-xs text-orange-950 shrink-0">
                        {(() => {
                            const memorableSummary = generateMemorableTitle({
                                isMatch: isMatchMode,
                                reportId: report?.report_id || reportId,
                                categoryName: (report as any)?.category_name,
                                categoryId: (report as any)?.category_id,
                                animalType: (report as any)?.animal_type,
                                animalBreed: (report as any)?.animal_breed,
                                animalColor: (report as any)?.animal_color,
                                streetAddress: (report as any)?.street_address || (report as any)?.address,
                                landmark: report?.landmark,
                                subdivisionName: (report as any)?.subdivision_name,
                                matchedPetName: localMatchedPet?.pet_name,
                                matchedPetBreed: localMatchedPet?.breed || localMatchedPet?.species,
                            });

                            return (
                                <div className="flex items-center gap-1.5 truncate max-w-[75%]">
                                    <span className="font-bold text-orange-700">{isMatchMode ? 'Pet Match:' : 'Case:'}</span>
                                    <span className="truncate font-semibold text-gray-800" title={memorableSummary}>
                                        {memorableSummary}
                                    </span>
                                </div>
                            );
                        })()}
                        <span className="text-[10px] font-black uppercase tracking-wider bg-white px-2 py-0.5 rounded-md border border-orange-200 text-orange-800 shrink-0">
                            {isMatchMode ? 'Direct Match Chat' : 'Case Chat'}
                        </span>
                    </div>

                    {isClaimApprovedPendingPickup && (
                        <div className="bg-green-500/10 border-b border-green-200 px-4 py-2 flex items-center justify-between gap-2 shrink-0">
                            <div className="flex items-center gap-2 text-xs text-green-950 font-bold min-w-0">
                                <span>🐾</span>
                                <p className="text-[11px] text-green-900 truncate">
                                    <strong>Claim Approved:</strong> Chat is open to coordinate meeting time & pet pickup.
                                </p>
                            </div>
                        </div>
                    )}

                    {/* Messages Body */}
                    <div className="flex-1 overflow-y-auto p-4 space-y-3.5 bg-slate-50/60 custom-scrollbar">
                        {/* Prominent AI Potential Match Card in Chat */}
                        {localMatchedPet && report?.report_id && (
                            <div className={`mb-3 bg-gradient-to-b from-orange-50/95 via-amber-50/40 to-white text-gray-900 border rounded-2xl p-3.5 space-y-3 shadow-xs transition-all ${
                                shouldHighlightMatch ? 'border-[#F97316] ring-2 ring-orange-300 shadow-md' : 'border-orange-200'
                            }`}>
                                <div className="flex items-center justify-between gap-2 border-b border-orange-100 pb-2">
                                    <div className="flex items-center gap-1.5">
                                        <span className="w-2.5 h-2.5 rounded-full bg-[#F97316] animate-pulse"></span>
                                        <span className="text-[11px] font-black uppercase tracking-wider text-orange-950">
                                            AI Potential Match Sighting
                                        </span>
                                    </div>
                                    <span className="px-2 py-0.5 bg-gradient-to-r from-orange-500 to-amber-500 text-white rounded-full text-[9px] font-black shadow-2xs">
                                        {localMatchedPet.similarity_score || 95}% Match
                                    </span>
                                </div>

                                {/* Side-by-Side Comparison */}
                                <div className="grid grid-cols-2 gap-2">
                                    {/* Sighting Photo & Info */}
                                    <div className="bg-white rounded-xl border border-gray-200 p-2 space-y-1.5 shadow-2xs">
                                        <div className="flex items-center justify-between gap-1 text-[8px] font-bold text-gray-500">
                                            <span className="px-1.5 py-0.2 bg-orange-100 text-[#F97316] rounded font-black">
                                                Report #{report.report_id}
                                            </span>
                                            <span>Sighting</span>
                                        </div>
                                        <div className="h-24 rounded-lg overflow-hidden relative bg-gray-100 border border-gray-100">
                                            <img
                                                src={localMatchedPet.sighting_photo_url || (report as any)?.reporter_photo || DEFAULT_AVATAR}
                                                alt="Sighting"
                                                className="w-full h-full object-cover"
                                                onError={(e: any) => { e.target.src = DEFAULT_AVATAR; }}
                                            />
                                            <span className="absolute bottom-1 left-1 px-1 py-0.2 bg-black/65 text-white text-[7px] font-black rounded">
                                                Original Photo
                                            </span>
                                        </div>
                                        <div className="grid grid-cols-2 gap-1 text-[8px]">
                                            <div className="bg-gray-50 p-1 rounded">
                                                <span className="text-gray-400 block text-[7px]">SPECIES</span>
                                                <span className="font-bold text-gray-800 truncate block">{localMatchedPet.sighting_species || report.animal_type || 'Dog'}</span>
                                            </div>
                                            <div className="bg-gray-50 p-1 rounded">
                                                <span className="text-gray-400 block text-[7px]">BREED</span>
                                                <span className="font-bold text-gray-800 truncate block">{localMatchedPet.sighting_breed || 'Shih Tzu'}</span>
                                            </div>
                                            <div className="bg-gray-50 p-1 rounded">
                                                <span className="text-gray-400 block text-[7px]">COLOR</span>
                                                <span className="font-bold text-gray-800 truncate block">{localMatchedPet.sighting_color || 'White & Black'}</span>
                                            </div>
                                            <div className="bg-gray-50 p-1 rounded">
                                                <span className="text-gray-400 block text-[7px]">SIZE</span>
                                                <span className="font-bold text-gray-800 truncate block">{localMatchedPet.sighting_size || 'Small'}</span>
                                            </div>
                                        </div>
                                        <div className="bg-gray-50 p-1 rounded text-[8px]">
                                            <span className="text-gray-400 block text-[7px]">LOCATION</span>
                                            <p className="font-bold text-gray-800 truncate">{localMatchedPet.sighting_landmark || report.landmark || 'Subdivision Area'}</p>
                                        </div>
                                    </div>

                                    {/* Candidate Pet Photo & Info */}
                                    <div className="bg-white rounded-xl border border-amber-200 p-2 space-y-1.5 shadow-2xs">
                                        <div className="flex items-center justify-between gap-1 text-[8px] font-bold text-amber-900">
                                            <span className="px-1.5 py-0.2 bg-amber-100 text-amber-900 rounded font-black truncate">
                                                Pet: {localMatchedPet.pet_name || 'Candidate'}
                                            </span>
                                            <span className="text-gray-400 truncate max-w-[50px]">{localMatchedPet.owner_name ? `Owner: ${localMatchedPet.owner_name}` : 'Registered'}</span>
                                        </div>
                                        <div className="h-24 rounded-lg overflow-hidden relative bg-gray-100 border border-amber-100">
                                            <img
                                                src={localMatchedPet.photo_url || DEFAULT_AVATAR}
                                                alt="Candidate"
                                                className="w-full h-full object-cover"
                                                onError={(e: any) => { e.target.src = DEFAULT_AVATAR; }}
                                            />
                                            <span className="absolute bottom-1 left-1 px-1 py-0.2 bg-amber-600/90 text-white text-[7px] font-black rounded">
                                                Registered Pet
                                            </span>
                                        </div>
                                        <div className="grid grid-cols-2 gap-1 text-[8px]">
                                            <div className="bg-gray-50 p-1 rounded">
                                                <span className="text-gray-400 block text-[7px]">SPECIES</span>
                                                <span className="font-bold text-gray-800 truncate block">{localMatchedPet.species || 'Dog'}</span>
                                            </div>
                                            <div className="bg-gray-50 p-1 rounded">
                                                <span className="text-gray-400 block text-[7px]">BREED</span>
                                                <span className="font-bold text-gray-800 truncate block">{localMatchedPet.breed || 'Shih Tzu'}</span>
                                            </div>
                                            <div className="bg-gray-50 p-1 rounded">
                                                <span className="text-gray-400 block text-[7px]">COLOR</span>
                                                <span className="font-bold text-gray-800 truncate block">{localMatchedPet.color || 'White & Black'}</span>
                                            </div>
                                            <div className="bg-gray-50 p-1 rounded">
                                                <span className="text-gray-400 block text-[7px]">SIZE</span>
                                                <span className="font-bold text-gray-800 truncate block">{localMatchedPet.size || 'Small'}</span>
                                            </div>
                                        </div>
                                        <div className="bg-gray-50 p-1 rounded text-[8px]">
                                            <span className="text-gray-400 block text-[7px]">REGISTERED TO</span>
                                            <p className="font-bold text-gray-800 truncate">{localMatchedPet.registered_address || (localMatchedPet.owner_name ? `Owned by ${localMatchedPet.owner_name}` : 'Registered Pet')}</p>
                                        </div>
                                    </div>
                                </div>

                                {/* Review Potential Match Button */}
                                <button
                                    type="button"
                                    onClick={() => {
                                        onClose();
                                        navigate(`/resident/reports/${report.report_id}/match-review`);
                                    }}
                                    className="w-full py-2.5 px-3 bg-gradient-to-r from-[#F97316] to-[#EA580C] hover:from-[#EA580C] hover:to-[#C2410C] text-white rounded-xl text-xs font-black uppercase tracking-wider flex items-center justify-center gap-1.5 shadow-2xs transition-all cursor-pointer active:scale-[0.98]"
                                >
                                    <span>🔍 Review Potential Match</span>
                                    <span>→</span>
                                </button>
                            </div>
                        )}

                        {messages.map((msg) => {
                            if (msg.isSystemMessage) {
                                return (
                                    <div key={msg.id} className="flex justify-center my-3">
                                        <div className="px-3.5 py-1.5 rounded-xl bg-orange-100/70 border border-orange-200/80 text-[10px] font-bold text-orange-900 text-center max-w-[90%] shadow-2xs leading-relaxed">
                                            {msg.text}
                                        </div>
                                    </div>
                                );
                            }

                            const isMe = msg.senderId === (currentUser?.user_id || 999);

                            return (
                                <div key={msg.id} className={`flex items-end gap-2 ${isMe ? 'justify-end' : 'justify-start'}`}>
                                    {!isMe && (
                                        <div className="w-7 h-7 rounded-full bg-orange-100 border border-orange-200 flex items-center justify-center font-bold text-xs text-orange-700 shrink-0 mb-1 overflow-hidden shadow-2xs">
                                            {msg.senderAvatar ? (
                                                <img src={msg.senderAvatar} alt="" className="w-full h-full object-cover" />
                                            ) : (
                                                msg.senderName.charAt(0).toUpperCase()
                                            )}
                                        </div>
                                    )}

                                    {(() => {
                                        const isLookAlikeMsg = (msg.text.toLowerCase().includes('look-alike') || 
                                                                msg.text.toLowerCase().includes('look-alik') || 
                                                                msg.text.toLowerCase().includes('similarity') || 
                                                                msg.text.toLowerCase().includes('detected a')) && !!localMatchedPet;

                                        return (
                                            <div className={`${isLookAlikeMsg ? 'max-w-[95%]' : 'max-w-[80%]'} flex flex-col ${isMe ? 'items-end' : 'items-start'}`}>
                                                <div className="flex items-center gap-1.5 mb-1 px-1">
                                                    <span className="text-[10px] font-bold text-gray-600 truncate max-w-[120px]">
                                                        {isMe ? 'You' : msg.senderName}
                                                    </span>
                                                    <span className="text-[8px] font-bold uppercase tracking-wider px-1 py-0.2 bg-gray-100 rounded text-gray-500">
                                                        {msg.senderRole}
                                                    </span>
                                                </div>

                                                <div className={`p-3.5 rounded-2xl text-xs leading-relaxed shadow-xs ${
                                                    isMe 
                                                        ? 'bg-gradient-to-tr from-orange-600 to-amber-500 text-white rounded-br-xs' 
                                                        : 'bg-white text-gray-800 border border-gray-200/80 rounded-bl-xs'
                                                }`}>
                                                    {msg.mediaUrl && (
                                                        <div className="mb-2 rounded-xl overflow-hidden border border-black/10 max-h-44">
                                                            <img src={msg.mediaUrl} alt="attachment" className="w-full h-full object-cover hover:scale-105 transition-transform" />
                                                        </div>
                                                    )}
                                                    <p className="whitespace-pre-wrap break-words font-medium">{msg.text}</p>

                                                    {/* Full Embedded Look-Alike Sighting Comparison Card */}
                                                    {isLookAlikeMsg && localMatchedPet && report?.report_id && (
                                                        <div 
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                onClose();
                                                                navigate(`/resident/reports/${report.report_id}/match-review`);
                                                            }}
                                                            className="mt-3 bg-gradient-to-b from-orange-50/95 via-amber-50/40 to-white text-gray-900 border border-orange-200 rounded-2xl p-3 space-y-2.5 shadow-xs cursor-pointer hover:border-orange-400 hover:shadow-md transition-all text-left"
                                                        >
                                                            <div className="flex items-center justify-between gap-2 border-b border-orange-100 pb-2">
                                                                <div className="flex items-center gap-1.5">
                                                                    <span className="w-2 h-2 rounded-full bg-[#F97316] animate-pulse"></span>
                                                                    <span className="text-[10px] font-black uppercase tracking-wider text-orange-950">
                                                                        Look-Alike Sighting Comparison
                                                                    </span>
                                                                </div>
                                                                <div className="flex items-center gap-1">
                                                                    <span className="px-2 py-0.5 bg-gradient-to-r from-orange-500 to-amber-500 text-white rounded-full text-[9px] font-extrabold shadow-2xs">
                                                                        {localMatchedPet.similarity_score || 95}% Match
                                                                    </span>
                                                                    <span className="text-[9px] font-extrabold text-[#F97316]">Review ↗</span>
                                                                </div>
                                                            </div>

                                                            {/* Side-by-Side Cards */}
                                                            <div className="grid grid-cols-2 gap-2">
                                                                {/* Sighting */}
                                                                <div className="bg-white rounded-xl border border-gray-200/80 p-2 space-y-1.5">
                                                                    <div className="flex items-center justify-between gap-1 text-[8px] font-bold text-gray-500">
                                                                        <span className="px-1.5 py-0.2 bg-orange-100 text-[#F97316] rounded font-black">
                                                                            Report #{report.report_id}
                                                                        </span>
                                                                        <span>Sighting</span>
                                                                    </div>
                                                                    <div className="h-24 rounded-lg overflow-hidden relative bg-gray-100 border border-gray-100">
                                                                        <img
                                                                            src={localMatchedPet.sighting_photo_url || (report as any)?.reporter_photo || DEFAULT_AVATAR}
                                                                            alt="Sighting"
                                                                            className="w-full h-full object-cover"
                                                                            onError={(e: any) => { e.target.src = DEFAULT_AVATAR; }}
                                                                        />
                                                                        <span className="absolute bottom-1 left-1 px-1 py-0.2 bg-black/65 text-white text-[7px] font-black rounded">
                                                                            Original Photo
                                                                        </span>
                                                                    </div>
                                                                    <div className="grid grid-cols-2 gap-1 text-[8px]">
                                                                        <div className="bg-gray-50 p-1 rounded">
                                                                            <span className="text-gray-400 block text-[7px]">SPECIES</span>
                                                                            <span className="font-bold text-gray-800 truncate block">{localMatchedPet.sighting_species || report.animal_type || 'Dog'}</span>
                                                                        </div>
                                                                        <div className="bg-gray-50 p-1 rounded">
                                                                            <span className="text-gray-400 block text-[7px]">BREED</span>
                                                                            <span className="font-bold text-gray-800 truncate block">{localMatchedPet.sighting_breed || 'Shih Tzu'}</span>
                                                                        </div>
                                                                        <div className="bg-gray-50 p-1 rounded">
                                                                            <span className="text-gray-400 block text-[7px]">COLOR</span>
                                                                            <span className="font-bold text-gray-800 truncate block">{localMatchedPet.sighting_color || 'White and Black'}</span>
                                                                        </div>
                                                                        <div className="bg-gray-50 p-1 rounded">
                                                                            <span className="text-gray-400 block text-[7px]">SIZE</span>
                                                                            <span className="font-bold text-gray-800 truncate block">{localMatchedPet.sighting_size || 'Small'}</span>
                                                                        </div>
                                                                    </div>
                                                                    <div className="bg-gray-50 p-1 rounded text-[8px]">
                                                                        <span className="text-gray-400 block text-[7px]">LOCATION</span>
                                                                        <p className="font-bold text-gray-800 truncate">{localMatchedPet.sighting_landmark || report.landmark || 'Selera Homes'}</p>
                                                                    </div>
                                                                </div>

                                                                {/* Registered Pet Candidate */}
                                                                <div className="bg-white rounded-xl border border-amber-200 p-2 space-y-1.5">
                                                                    <div className="flex items-center justify-between gap-1 text-[8px] font-bold text-amber-900">
                                                                        <span className="px-1.5 py-0.2 bg-amber-100 text-amber-900 rounded font-black truncate">
                                                                            Pet: {localMatchedPet.pet_name || 'Candidate'}
                                                                        </span>
                                                                        <span className="text-gray-400 truncate max-w-[50px]">{localMatchedPet.owner_name ? `Owner: ${localMatchedPet.owner_name}` : 'Registered'}</span>
                                                                    </div>
                                                                    <div className="h-24 rounded-lg overflow-hidden relative bg-gray-100 border border-amber-100">
                                                                        <img
                                                                            src={localMatchedPet.photo_url || DEFAULT_AVATAR}
                                                                            alt="Candidate"
                                                                            className="w-full h-full object-cover"
                                                                            onError={(e: any) => { e.target.src = DEFAULT_AVATAR; }}
                                                                        />
                                                                        <span className="absolute bottom-1 left-1 px-1 py-0.2 bg-amber-600/90 text-white text-[7px] font-black rounded">
                                                                            Candidate Profile
                                                                        </span>
                                                                    </div>
                                                                    <div className="grid grid-cols-2 gap-1 text-[8px]">
                                                                        <div className="bg-gray-50 p-1 rounded">
                                                                            <span className="text-gray-400 block text-[7px]">SPECIES</span>
                                                                            <span className="font-bold text-gray-800 truncate block">{localMatchedPet.species || 'Dog'}</span>
                                                                        </div>
                                                                        <div className="bg-gray-50 p-1 rounded">
                                                                            <span className="text-gray-400 block text-[7px]">BREED</span>
                                                                            <span className="font-bold text-gray-800 truncate block">{localMatchedPet.breed || 'Shih Tzu'}</span>
                                                                        </div>
                                                                        <div className="bg-gray-50 p-1 rounded">
                                                                            <span className="text-gray-400 block text-[7px]">COLOR</span>
                                                                            <span className="font-bold text-gray-800 truncate block">{localMatchedPet.color || 'White Black'}</span>
                                                                        </div>
                                                                        <div className="bg-gray-50 p-1 rounded">
                                                                            <span className="text-gray-400 block text-[7px]">SIZE</span>
                                                                            <span className="font-bold text-gray-800 truncate block">{localMatchedPet.size || 'Small'}</span>
                                                                        </div>
                                                                    </div>
                                                                    <div className="bg-gray-50 p-1 rounded text-[8px]">
                                                                        <span className="text-gray-400 block text-[7px]">REGISTERED TO</span>
                                                                        <p className="font-bold text-gray-800 truncate">{localMatchedPet.registered_address || (localMatchedPet.owner_name ? `Owned by ${localMatchedPet.owner_name}` : 'Registered Pet')}</p>
                                                                    </div>
                                                                </div>
                                                            </div>

                                                            {/* Evidence Summary */}
                                                            {localMatchedPet.key_evidence_bullets && (
                                                                <div className="flex flex-wrap gap-1">
                                                                    {localMatchedPet.key_evidence_bullets.slice(0, 2).map((b, i) => (
                                                                        <span key={i} className="px-1.5 py-0.2 bg-orange-100/70 text-orange-900 rounded text-[8px] font-bold">
                                                                            ✓ {b}
                                                                        </span>
                                                                    ))}
                                                                </div>
                                                            )}
                                                            {/* Action Link Button */}
                                                            <button
                                                                type="button"
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    onClose();
                                                                    navigate(`/resident/reports/${report.report_id}/match-review`);
                                                                }}
                                                                className="w-full py-2 px-3 bg-[#F97316] hover:bg-[#EA580C] text-white rounded-xl text-[10px] font-black uppercase tracking-wider flex items-center justify-center gap-1.5 shadow-2xs transition-all cursor-pointer"
                                                            >
                                                                <span>🔍 Review Potential Match</span>
                                                                <span>→</span>
                                                            </button>
                                                        </div>
                                                    )}
                                                </div>

                                                <div className="flex items-center gap-1 mt-1 px-1 text-[9px] text-gray-400 font-semibold">
                                                    <span>{msg.timestamp}</span>
                                                    {isMe && (
                                                        msg.isRead ? (
                                                            <span className="text-[#F97316] font-bold tracking-tight flex items-center gap-0.5 ml-0.5" title="Read by recipient">
                                                                <span>✓</span>
                                                                <span className="text-[9px] font-bold">Seen</span>
                                                            </span>
                                                        ) : (
                                                            <span className="text-gray-400 font-bold ml-0.5" title="Delivered">✓</span>
                                                        )
                                                    )}
                                                </div>
                                            </div>
                                        );
                                    })()}
                                </div>
                            );
                        })}

                        {/* Typing indicator */}
                        {isTyping && (
                            <div className="flex items-center gap-2 text-xs text-gray-400 italic bg-white/80 p-2.5 rounded-2xl w-fit border border-gray-200 animate-pulse">
                                <div className="flex gap-1">
                                    <div className="w-1.5 h-1.5 rounded-full bg-orange-400 animate-bounce"></div>
                                    <div className="w-1.5 h-1.5 rounded-full bg-orange-400 animate-bounce [animation-delay:0.2s]"></div>
                                    <div className="w-1.5 h-1.5 rounded-full bg-orange-400 animate-bounce [animation-delay:0.4s]"></div>
                                </div>
                                <span>{counterpartName} is typing...</span>
                            </div>
                        )}

                        <div ref={messagesEndRef} />
                    </div>

                    {/* Quick Quick-Prompt Badges (Subdivision Leaders / Staff only) */}
                    {!isResolved && !isResidentUser && (
                        <div className="px-3.5 py-2.5 bg-white border-t border-gray-100 flex items-center gap-1.5 overflow-x-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none] shrink-0">
                            {[
                                "Is the animal still at the scene?",
                                "Team is en route now",
                                "Can you share exact landmark?",
                                "Animal has been secured"
                            ].map((prompt, idx) => (
                                <button
                                    key={idx}
                                    type="button"
                                    onClick={() => setInputText(prompt)}
                                    className="px-2.5 py-1 bg-gray-50 hover:bg-orange-50 border border-gray-200 hover:border-orange-200 text-[10px] font-semibold text-gray-600 hover:text-orange-600 rounded-full whitespace-nowrap transition-all cursor-pointer shrink-0"
                                >
                                    {prompt}
                                </button>
                            ))}
                        </div>
                    )}

                    {/* Image Attachment Preview */}
                    {selectedImagePreview && (
                        <div className="p-3 bg-orange-50 border-t border-orange-100 flex items-center justify-between shrink-0">
                            <div className="flex items-center gap-2">
                                <img src={selectedImagePreview} alt="Preview" className="w-12 h-12 object-cover rounded-lg border border-orange-200 shadow-xs" />
                                <div>
                                    <p className="text-[11px] font-bold text-orange-950">Photo Attached</p>
                                    <p className="text-[9px] text-orange-600">Ready to send with your message</p>
                                </div>
                            </div>
                            <button
                                type="button"
                                onClick={() => setSelectedImagePreview(null)}
                                className="w-6 h-6 rounded-full bg-rose-100 text-rose-600 hover:bg-rose-200 flex items-center justify-center font-bold text-xs cursor-pointer"
                            >
                                ✕
                            </button>
                        </div>
                    )}

                    {/* Input Footer */}
                    <div className="p-3 sm:p-3.5 bg-white border-t border-gray-200 shrink-0 pb-6 sm:pb-3.5">
                        {isResolved ? (
                            <div className="p-3 bg-gray-50 rounded-2xl border border-gray-200 text-center space-y-1">
                                <p className="text-xs font-bold text-gray-700">🔒 Case Resolved & Archived</p>
                                <p className="text-[10px] text-gray-500 leading-relaxed">
                                    This report has been resolved and direct messaging is in read-only mode. If you need any further assistance, please contact the subdivision office directly.
                                </p>
                            </div>
                        ) : (
                            <form onSubmit={handleSendMessage} className="flex items-center gap-2">
                                <input
                                    type="file"
                                    ref={fileInputRef}
                                    accept="image/*"
                                    className="hidden"
                                    onChange={handleImageUpload}
                                />
                                
                                <button
                                    type="button"
                                    onClick={() => fileInputRef.current?.click()}
                                    disabled={isUploadingMedia}
                                    className="p-2.5 text-gray-400 hover:text-orange-600 hover:bg-orange-50 rounded-xl transition-all border border-gray-200 cursor-pointer shrink-0"
                                    title="Attach image"
                                >
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                    </svg>
                                </button>

                                <input
                                    type="text"
                                    value={inputText}
                                    onChange={(e) => setInputText(e.target.value)}
                                    placeholder="Type message to responder/reporter..."
                                    className="flex-1 min-w-0 bg-gray-50 border border-gray-200 rounded-xl px-3.5 py-2.5 text-xs text-gray-800 font-medium focus:outline-none focus:border-orange-500 focus:bg-white transition-all placeholder:text-gray-400"
                                />

                                <button
                                    type="submit"
                                    disabled={!inputText.trim() && !selectedImagePreview}
                                    className="p-2.5 bg-orange-600 hover:bg-orange-700 active:scale-95 text-white rounded-xl transition-all shadow-md shadow-orange-600/20 disabled:opacity-40 disabled:pointer-events-none cursor-pointer shrink-0 flex items-center justify-center"
                                    title="Send Message"
                                >
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                                        <path d="M10.894 2.553a1 1 0 00-1.788 0l-7 14a1 1 0 001.169 1.409l5-1.429A1 1 0 009 15.571V11a1 1 0 112 0v4.571a1 1 0 00.725.962l5 1.428a1 1 0 001.17-1.408l-7-14z" />
                                    </svg>
                                </button>
                            </form>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
