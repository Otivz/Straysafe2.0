import React, { useState, useEffect, useRef } from 'react';
import { notifyChatUpdated, markReportChatAsSeen } from '../../utils/chatUtils';
import { api } from '../../utils/api';

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
    13: 'Approved'
};

export default function ReportChatDrawer({ isOpen, onClose, report, currentUser }: ReportChatDrawerProps) {
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [inputText, setInputText] = useState('');
    const [isUploadingMedia, setIsUploadingMedia] = useState(false);
    const [selectedImagePreview, setSelectedImagePreview] = useState<string | null>(null);
    const [selectedImageFile, setSelectedImageFile] = useState<File | null>(null);
    const [isTyping] = useState(false);
    const messagesEndRef = useRef<HTMLDivElement | null>(null);
    const fileInputRef = useRef<HTMLInputElement | null>(null);

    const reportId = report?.report_id || 0;
    const isResolved = report?.status_id && [9, 10, 11, 12].includes(report.status_id);

    // Identify Counterpart
    const isCurrentUserReporter = currentUser?.user_id === report?.user_id;
    const counterpartName = isCurrentUserReporter 
        ? 'Subdivision Leader & Responders' 
        : (report?.reporter_name || `Reporter (User #${report?.user_id || '?'})`);
    const counterpartRole = isCurrentUserReporter 
        ? 'Community Operations' 
        : 'Incident Reporter';

    const storageKey = `straysafe_report_chat_${reportId}`;

    // Load messages from Backend API with localStorage cache
    useEffect(() => {
        if (!isOpen || !reportId) return;

        // Mark unread messages as seen immediately upon opening drawer
        markReportChatAsSeen(reportId, currentUser?.user_id);

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
                const response = await api.get(`/chat/reports/${reportId}/messages`);
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
                    markReportChatAsSeen(reportId, currentUser?.user_id);
                } else if (!stored) {
                    // Default initial welcome if empty
                    const defaultMessages: ChatMessage[] = [
                        {
                            id: 'sys-1',
                            senderId: 0,
                            senderName: 'System Bot',
                            senderRole: 'System',
                            text: `🔒 Case chat initialized for Report #STR-${reportId.toString().padStart(4, '0')}. All messages are archived for official records.`,
                            timestamp: 'Just now',
                            isSystemMessage: true,
                            isRead: true
                        }
                    ];
                    setMessages(defaultMessages);
                    localStorage.setItem(storageKey, JSON.stringify(defaultMessages));
                    markReportChatAsSeen(reportId, currentUser?.user_id);
                }
            } catch (error) {
                console.warn('Live chat fetch fallback to local:', error);
            }
        };

        fetchLiveMessages();
    }, [isOpen, reportId, storageKey, report, currentUser]);

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
        notifyChatUpdated(reportId);
        
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
            await api.post(`/chat/reports/${reportId}/messages`, formData, {
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

    const isReportOwner = report && currentUser && report.user_id === currentUser.user_id;
    const isStaffOrLeader = currentUser && currentUser.role_id && currentUser.role_id !== 1;
    const isAuthorized = isStaffOrLeader || isReportOwner;

    if (!isOpen || !report || !isAuthorized) return null;

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
                                title="Back to Reports"
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                                </svg>
                            </button>

                            <div className="relative shrink-0">
                                <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-white/20 border-2 border-white/40 flex items-center justify-center font-bold text-sm text-white overflow-hidden shadow-sm">
                                    {report.reporter_photo ? (
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
                                        #STR-{(report.report_id || 0).toString().padStart(4, '0')}
                                    </span>
                                </div>
                                <p className="text-[10px] sm:text-[11px] text-orange-100 font-medium truncate mt-0.5">
                                    {counterpartRole} • <span className="text-white font-bold">{statusNameMap[report.status_id || 1] || 'Active'}</span>
                                </p>
                            </div>
                        </div>
                    </div>

                    {/* Report Summary Quick Strip */}
                    <div className="px-4 py-2 bg-orange-50/80 border-b border-orange-100 flex items-center justify-between text-xs text-orange-950 shrink-0">
                        <div className="flex items-center gap-1.5 truncate">
                            <span className="font-bold text-orange-700">Incident:</span>
                            <span className="truncate">{report.animal_type || 'Animal'} at {report.landmark || 'Reported Location'}</span>
                        </div>
                        <span className="text-[10px] font-black uppercase tracking-wider bg-white px-2 py-0.5 rounded-md border border-orange-200 text-orange-800 shrink-0">
                            Case Chat
                        </span>
                    </div>

                    {/* Messages Body */}
                    <div className="flex-1 overflow-y-auto p-4 space-y-3.5 bg-slate-50/60 custom-scrollbar">
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

                                    <div className={`max-w-[78%] flex flex-col ${isMe ? 'items-end' : 'items-start'}`}>
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
                                        </div>

                                        <div className="flex items-center gap-1 mt-1 px-1 text-[9px] text-gray-400 font-semibold">
                                            <span>{msg.timestamp}</span>
                                            {isMe && (
                                                msg.isRead ? (
                                                    <span className="text-orange-500 font-bold tracking-tighter" title="Read by recipient">✓✓</span>
                                                ) : (
                                                    <span className="text-gray-400 font-bold" title="Delivered">✓</span>
                                                )
                                            )}
                                        </div>
                                    </div>
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

                    {/* Quick Quick-Prompt Badges */}
                    {!isResolved && (
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
                            <div className="p-3 bg-gray-100 rounded-2xl border border-gray-200 text-center">
                                <p className="text-xs font-bold text-gray-700">🔒 Case Solved & Archived</p>
                                <p className="text-[10px] text-gray-400 mt-0.5">This report is resolved. Messages are archived in read-only mode.</p>
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
