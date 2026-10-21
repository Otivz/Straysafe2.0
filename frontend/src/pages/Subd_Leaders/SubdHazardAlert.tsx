/* eslint-disable react-hooks/exhaustive-deps, react-hooks/set-state-in-effect, @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars */
import { useEffect, useState, type FormEvent } from 'react';
import { createPortal } from 'react-dom';
import api from '../../utils/api';
import SubdSidebar from '../../components/SubdSidebar';
import SubdNavbar from '../../components/Navbars/SubdNavbar';
import SubdBottomNav from '../../components/Navbars/SubdBottomNav';
import { getCachedData, setCachedData } from '../../utils/cache';

// Announcement type for broadcast module
interface Announcement {
    id: string;
    title: string;
    category: string; // e.g., 'Emergency', 'Animal Advisory', 'Vaccination Drive', 'Lost and Found'
    visibility: string; // 'Public', 'Subdivision Only', 'Barangay Only'
    content: string;
    media: File[]; // placeholder for uploaded files
    pinned: boolean;
    expiration?: string;
    location?: string;
    date: string; // formatted display date
    reactions: number;
    comments: { author: string; text: string; createdAt?: string; photo?: string | null }[];
    mediaUrl?: string;
    actionText?: string;
    dateDay?: string;
    dateMonth?: string;
    extraDetails?: string;
    views: number;
    hasLiked?: boolean;
    attachedMedia?: { file_url: string; media_type: string }[];
    status?: string;
}

const SubdHazardAlert = () => {
    const userStr = localStorage.getItem('staff_user') || sessionStorage.getItem('staff_user');
    const currentUser = userStr ? JSON.parse(userStr) : null;
    // New state for Announcement/Broadcast module
    const [showCreate, setShowCreate] = useState(false);
    const [editAnnouncementId, setEditAnnouncementId] = useState<string | null>(null);
    const [openMenuId, setOpenMenuId] = useState<string | null>(null);
    const [title, setTitle] = useState('');
    const [category, setCategory] = useState('Emergency');
    const [visibility, setVisibility] = useState('Public');
    const [content, setContent] = useState('');
    const [pinned, setPinned] = useState(false);
    const [expiration, setExpiration] = useState('');
    const [location, setLocation] = useState('');
    const [mediaFiles, setMediaFiles] = useState<File[]>([]);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isDragging, setIsDragging] = useState(false);

    // Feed filters and selection states
    const [selectedCategory, setSelectedCategory] = useState('All');
    const [selectedStatus, setSelectedStatus] = useState('All');
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedAnnouncement, setSelectedAnnouncement] = useState<Announcement | null>(null);
    const [newCommentText, setNewCommentText] = useState('');
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

    const [announcements, setAnnouncements] = useState<Announcement[]>(() => getCachedData<Announcement[]>('subd_announcements') || []);
    // false until the first fetch finishes when nothing was cached (shows placeholders, not "nothing found")
    const [hasLoaded, setHasLoaded] = useState<boolean>(() => Boolean(getCachedData<Announcement[]>('subd_announcements')));

    const formatPostedDate = (raw?: string | null) => {
        if (!raw) return 'Just now';
        const dt = new Date(raw);
        if (Number.isNaN(dt.getTime())) return raw;
        return dt.toLocaleDateString('en-US') + ' • ' + dt.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    };

    const mapApiAnnouncement = (item: any): Announcement => {
        const imageMedia = item.media?.find((m: any) => m.media_type === 'Image');
        const mediaUrl = imageMedia?.file_url || item.media?.[0]?.file_url || undefined;
        const dateObj = item.posted_on ? new Date(item.posted_on) : null;
        const isValidDate = dateObj && !Number.isNaN(dateObj.getTime());
        return {
            id: String(item.announcement_id),
            title: item.title,
            category: item.category || 'Animal Advisory',
            visibility: item.visibility || 'Public',
            content: item.content,
            media: [],
            pinned: !!item.pinned,
            expiration: item.expiration || undefined,
            location: item.location || 'Selera Homes',
            date: item.posted_on ? formatPostedDate(item.posted_on) : 'Just now',
            reactions: item.reactions ? item.reactions.length : 0,
            comments: item.comments ? item.comments.map((c: any) => ({ author: c.user_name || 'Resident', text: c.comment, createdAt: c.created_at, photo: c.user_photo })) : [],
            views: 0,
            mediaUrl,
            hasLiked: item.reactions ? item.reactions.some((r: any) => r.user_id === currentUser?.user_id) : false,
            dateDay: isValidDate ? String(dateObj.getDate()).padStart(2, '0') : undefined,
            dateMonth: isValidDate ? dateObj.toLocaleDateString('en-US', { month: 'short' }).toUpperCase() : undefined,
            attachedMedia: item.media || [],
            status: item.status || 'Published'
        };
    };

    const fetchAnnouncements = async () => {
        if (!currentUser?.subdivision_id) return;
        try {
            const res = await api.get(`/announcements/subdivision/${currentUser.subdivision_id}`);
            const mapped = res.data.map(mapApiAnnouncement);
            setAnnouncements(mapped);
            setCachedData('subd_announcements', mapped);
        } catch (err) {
            console.error('Failed to fetch announcements:', err);
        } finally {
            setHasLoaded(true);
        }
    };

    useEffect(() => {
        fetchAnnouncements();
    }, [currentUser?.subdivision_id]);

    useEffect(() => {
        if (selectedAnnouncement) {
            const updated = announcements.find(ann => ann.id === selectedAnnouncement.id);
            if (updated) {
                setSelectedAnnouncement(updated);
            }
        }
    }, [announcements]);

    // Create modal open: keep the page behind it still
    useEffect(() => {
        if (!showCreate) return;
        const previous = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        return () => { document.body.style.overflow = previous; };
    }, [showCreate]);

    // Details modal open: keep the page behind it still, and let Esc close it
    useEffect(() => {
        if (!selectedAnnouncement) return;
        const previous = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setSelectedAnnouncement(null); };
        window.addEventListener('keydown', onKey);
        return () => {
            document.body.style.overflow = previous;
            window.removeEventListener('keydown', onKey);
        };
    }, [selectedAnnouncement?.id]);

    useEffect(() => {
        const handleWindowClick = () => {
            setOpenMenuId(null);
        };
        window.addEventListener('click', handleWindowClick);
        return () => {
            window.removeEventListener('click', handleWindowClick);
        };
    }, []);

    const handleLike = async (id: string) => {
        if (!currentUser?.user_id) return;
        try {
            await api.post(`/announcements/${id}/react`, {
                user_id: currentUser.user_id,
                reaction_type: "Like"
            });
            await fetchAnnouncements();
        } catch (err) {
            console.error('Failed to like announcement:', err);
        }
    };

    const handleOpenFull = (ann: Announcement) => {
        setSelectedAnnouncement(ann);
    };

    const handleAddComment = async (annId: string, text: string) => {
        if (!currentUser?.user_id) return;
        try {
            await api.post(`/announcements/${annId}/comments`, {
                user_id: currentUser.user_id,
                comment: text
            });
            await fetchAnnouncements();
        } catch (err) {
            console.error('Failed to add comment:', err);
            alert('Failed to post comment.');
        }
    };

    const handleDeleteAnnouncement = async (id: string) => {
        if (!window.confirm("Are you sure you want to delete this announcement?")) {
            return;
        }
        try {
            await api.delete(`/announcements/${id}`);
            await fetchAnnouncements();
        } catch (err) {
            console.error('Failed to delete announcement:', err);
            alert('Failed to delete announcement.');
        }
    };

    const handleEditAnnouncement = (ann: Announcement) => {
        setEditAnnouncementId(ann.id);
        setTitle(ann.title);
        setContent(ann.content);
        setCategory(ann.category);
        setVisibility(ann.visibility);
        setPinned(ann.pinned);
        // Expiration from date
        if (ann.expiration) {
            const expDate = new Date(ann.expiration);
            if (!Number.isNaN(expDate.getTime())) {
                setExpiration(expDate.toISOString().split('T')[0]);
            } else {
                setExpiration('');
            }
        } else {
            setExpiration('');
        }
        setLocation(ann.location || '');
        setMediaFiles([]);
        setShowCreate(true);
    };

    const filteredAnnouncements = announcements.filter(ann => {
        const matchesCategory = selectedCategory === 'All' || ann.category.toLowerCase() === selectedCategory.toLowerCase();
        const matchesSearch = searchQuery === '' ||
            ann.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
            ann.content.toLowerCase().includes(searchQuery.toLowerCase());
        const matchesStatus = selectedStatus === 'All' ||
            (selectedStatus === 'Active' && ann.status === 'Published') ||
            (selectedStatus === 'Draft' && ann.status === 'Draft') ||
            (selectedStatus === 'Pinned' && ann.pinned);
        return matchesCategory && matchesSearch && matchesStatus;
    }).sort((a, b) => {
        if (a.pinned && !b.pinned) return -1;
        if (!a.pinned && b.pinned) return 1;
        return 0;
    });

    // const pinnedAnnouncements = filteredAnnouncements.filter(ann => ann.pinned);
    // const normalAnnouncements = filteredAnnouncements.filter(ann => !ann.pinned);
    const totalFiltered = filteredAnnouncements.length;

    /* const categoryStyle = (cat: string) => {
        switch (cat) {
            case 'Emergency': return 'bg-red-50 text-red-600 border-red-100';
            case 'Vaccination Drive': return 'bg-green-50 text-green-700 border-green-100';
            case 'Lost and Found': return 'bg-blue-50 text-blue-600 border-blue-100';
            default: return 'bg-indigo-50 text-indigo-600 border-indigo-100';
        }
    }; */

    const renderUniformCard = (ann: Announcement) => {
        const isPinned = ann.pinned;

        const borderStyle = (cat: string) => {
            switch (cat) {
                case 'Emergency': return 'border-l-[#c5221f]';
                case 'Vaccination Drive': return 'border-l-green-500';
                case 'Lost and Found': return 'border-l-[#0B57D0]';
                default: return 'border-l-violet-500';
            }
        };

        const iconContainerStyle = (cat: string) => {
            switch (cat) {
                case 'Emergency': return 'bg-red-50 text-red-500';
                case 'Vaccination Drive': return 'bg-green-50 text-green-600';
                case 'Lost and Found': return 'bg-blue-50 text-[#0B57D0]';
                default: return 'bg-violet-50 text-violet-600';
            }
        };

        const categoryBadgeStyle = (cat: string) => {
            switch (cat) {
                case 'Emergency': return 'bg-red-50 text-red-600';
                case 'Vaccination Drive': return 'bg-green-50 text-green-700';
                case 'Lost and Found': return 'bg-blue-50 text-blue-700';
                default: return 'bg-violet-50 text-violet-700';
            }
        };

        const renderCategoryIcon = (cat: string) => {
            switch (cat) {
                case 'Emergency':
                    return (
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                        </svg>
                    );
                case 'Vaccination Drive':
                    return (
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                        </svg>
                    );
                case 'Lost and Found':
                    return (
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                        </svg>
                    );
                default:
                    return (
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12a7.5 7.5 0 0015 0m-15 0a7.5 7.5 0 1115 0m-15 0H3m16.5 0H21m-1.5 0H12m-8.457 3.077l1.41-.513m14.095-.513l1.41.513M5.106 17.785l1.15-.827m11.488-.827l1.15.827M8.14 21.27l.73-1.01m6.26 1.01l-.73-1.01" />
                        </svg>
                    );
            }
        };

        // const isLive = ann.status === 'Published';

        return (
            <div
                key={ann.id}
                onClick={() => handleOpenFull(ann)}
                className={`bg-white rounded-2xl border border-gray-100 border-l-4 ${borderStyle(ann.category)} hover:shadow-md hover:border-gray-200 transition-all duration-200 p-3 sm:p-4 relative cursor-pointer group active:scale-[0.995]`}
            >
                {/* Top: category icon, title (+ pinned / draft), actions */}
                <div className="flex items-start gap-3">
                    <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${iconContainerStyle(ann.category)}`}>
                        {renderCategoryIcon(ann.category)}
                    </div>
                    <div className="min-w-0 flex-1 pt-0.5">
                        <h3 className="text-[15px] font-bold text-gray-900 leading-snug line-clamp-2 break-words group-hover:text-role transition-colors">
                            {ann.title}
                        </h3>
                        {(isPinned || ann.status === 'Draft') && (
                            <div className="flex items-center gap-1.5 mt-1">
                                {isPinned && (
                                    <span className="inline-flex items-center gap-1 bg-role-soft text-role px-2 py-0.5 rounded-full text-[10px] font-black border border-role-muted">
                                        <svg className="w-2.5 h-2.5" fill="currentColor" viewBox="0 0 20 20">
                                            <path d="M10 2a1 1 0 011 1v1.171l1.646-1.647a1 1 0 011.414 1.414L12.414 5.6H15a1 1 0 110 2h-1.646l2.122 2.121a1 1 0 11-1.414 1.414L11.94 9.013V15.6a1 1 0 11-2 0V9.013L7.818 11.15a1 1 0 11-1.414-1.414l2.122-2.121H5.1a1 1 0 110-2h2.586L6.038 3.938a1 1 0 011.414-1.414L9.1 4.171V3a1 1 0 011-1z" />
                                        </svg>
                                        Pinned
                                    </span>
                                )}
                                {ann.status === 'Draft' && (
                                    <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-amber-50 text-amber-700 border border-amber-200">Draft</span>
                                )}
                            </div>
                        )}
                    </div>

                    <div className="relative shrink-0 -mr-1 -mt-1">
                        <button
                            type="button"
                            onClick={(e) => {
                                e.stopPropagation();
                                setOpenMenuId(openMenuId === ann.id ? null : ann.id);
                            }}
                            className="w-9 h-9 rounded-lg hover:bg-gray-50 text-gray-400 hover:text-gray-700 transition-all flex items-center justify-center cursor-pointer"
                            aria-label="Announcement actions"
                        >
                            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                                <path d="M10 6a2 2 0 110-4 2 2 0 010 4zM10 12a2 2 0 110-4 2 2 0 010 4zM10 18a2 2 0 110-4 2 2 0 010 4z" />
                            </svg>
                        </button>
                        {openMenuId === ann.id && (
                            <div
                                className="absolute right-0 mt-1 w-36 bg-white rounded-xl shadow-[0_4px_20px_rgba(0,0,0,0.08)] border border-gray-100 py-1 z-30 flex flex-col animate-in fade-in slide-in-from-top-1 duration-150"
                                onClick={(e) => e.stopPropagation()}
                            >
                                <button
                                    type="button"
                                    onClick={() => {
                                        setOpenMenuId(null);
                                        handleEditAnnouncement(ann);
                                    }}
                                    className="w-full text-left px-3 h-10 text-xs font-bold text-gray-700 hover:bg-role-soft hover:text-role transition-colors flex items-center gap-2 cursor-pointer"
                                >
                                    <svg className="w-3.5 h-3.5 text-gray-400" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                                    </svg>
                                    Edit
                                </button>
                                <button
                                    type="button"
                                    onClick={() => {
                                        setOpenMenuId(null);
                                        handleDeleteAnnouncement(ann.id);
                                    }}
                                    className="w-full text-left px-3 h-10 text-xs font-bold text-red-600 hover:bg-red-50 transition-colors flex items-center gap-2 cursor-pointer"
                                >
                                    <svg className="w-3.5 h-3.5 text-red-400" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                    </svg>
                                    Delete
                                </button>
                            </div>
                        )}
                    </div>
                </div>

                {/* Middle: preview, then metadata */}
                <p className="text-[13px] text-gray-600 leading-relaxed line-clamp-2 break-words mt-2">
                    {ann.content}
                </p>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 mt-2 text-[11px] font-semibold text-gray-500">
                    <span className={`px-2 py-0.5 rounded-full font-black text-[10px] uppercase tracking-wide ${categoryBadgeStyle(ann.category)}`}>
                        {ann.category}
                    </span>
                    <span className="inline-flex items-center gap-1">
                        <svg className="w-3.5 h-3.5 text-gray-400" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M17.982 18.725A7.488 7.488 0 0012 15.75a7.488 7.488 0 00-5.982 2.975m11.963 0a9 9 0 10-11.963 0m11.963 0A8.966 8.966 0 0112 21a8.966 8.966 0 01-5.982-2.275M15 9.75a3 3 0 11-6 0 3 3 0 016 0z" />
                        </svg>
                        {ann.category === 'Vaccination Drive' ? 'Pet owners' : 'All residents'}
                    </span>
                    <span className="inline-flex items-center gap-1">
                        <svg className="w-3.5 h-3.5 text-gray-400" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
                        </svg>
                        {ann.date}
                    </span>
                    <span className="inline-flex items-center gap-1 min-w-0">
                        <svg className="w-3.5 h-3.5 text-gray-400 shrink-0" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                            <path strokeLinecap="round" strokeLinejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                        </svg>
                        <span className="truncate">{ann.location || 'Selera Homes'}</span>
                    </span>
                </div>

                {/* Bottom: engagement in one row */}
                <div className="flex items-center gap-4 mt-2.5 pt-2.5 border-t border-gray-100 text-xs font-bold text-gray-500 select-none">
                    <button
                        type="button"
                        className={`inline-flex items-center gap-1.5 h-8 -ml-1 px-1 rounded-lg hover:text-role active:scale-95 transition-all cursor-pointer ${ann.hasLiked ? 'text-role' : ''}`}
                        onClick={(e) => {
                            e.stopPropagation();
                            handleLike(ann.id);
                        }}
                        aria-pressed={!!ann.hasLiked}
                        aria-label="Like"
                    >
                        <svg className={`w-4 h-4 ${ann.hasLiked ? 'text-role fill-role' : 'text-gray-400'}`} fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M14 9V5a3 3 0 00-3-3l-4 9v11h11.28a2 2 0 002-1.7l1.38-9a2 2 0 00-2-2.3zM7 22H4a2 2 0 01-2-2v-7a2 2 0 012-2h3" />
                        </svg>
                        {ann.reactions} <span className="hidden sm:inline font-semibold">Likes</span>
                    </button>
                    <span className="inline-flex items-center gap-1.5">
                        <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                        </svg>
                        {ann.comments.length} <span className="hidden sm:inline font-semibold">Comments</span>
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                        <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                            <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                        </svg>
                        {ann.views || 0} <span className="hidden sm:inline font-semibold">Views</span>
                    </span>
                </div>
            </div>
        );
    };

    const handleCloseCreateModal = () => {
        setShowCreate(false);
        setEditAnnouncementId(null);
        setTitle('');
        setContent('');
        setLocation('');
        setPinned(false);
        setExpiration('');
        setMediaFiles([]);
    };

    const handleSubmit = async (e: FormEvent, targetStatus?: string) => {
        e.preventDefault();
        if (!currentUser?.user_id) return;
        try {
            const payload = {
                created_by: currentUser.user_id,
                title,
                category,
                visibility,
                content,
                pinned,
                expiration: expiration ? new Date(expiration).toISOString() : null,
                location: location || null,
                subdivision_id: currentUser.subdivision_id || null,
                status: targetStatus || (editAnnouncementId ? announcements.find(a => a.id === editAnnouncementId)?.status : 'Published')
            };

            let announcementId = editAnnouncementId;
            if (editAnnouncementId) {
                await api.put(`/announcements/${editAnnouncementId}`, payload);
            } else {
                const created = await api.post('/announcements/', payload);
                announcementId = created.data.announcement_id;
            }

            if (announcementId && mediaFiles.length > 0) {
                for (const file of mediaFiles) {
                    const fd = new FormData();
                    fd.append('file', file);
                    await api.post(`/announcements/${announcementId}/media`, fd, {
                        headers: { 'Content-Type': 'multipart/form-data' }
                    });
                }
            }

            await fetchAnnouncements();
            handleCloseCreateModal();
        } catch (err) {
            console.error('Failed to submit announcement:', err);
            alert('Failed to submit announcement.');
        }
    };

    const submitAs = async (e: FormEvent, targetStatus?: string) => {
        if (isSubmitting) { e.preventDefault(); return; }
        setIsSubmitting(true);
        try {
            await handleSubmit(e, targetStatus);
        } finally {
            setIsSubmitting(false);
        }
    };

    // Same file types the picker accepts (image/*, video/*, .pdf)
    const acceptedDrop = (f: File) =>
        f.type.startsWith('image/') || f.type.startsWith('video/') || f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf');

    return (
        <div className="flex h-screen bg-[#F8FAFC]">
            <SubdSidebar mobileOpen={mobileMenuOpen} onMobileClose={() => setMobileMenuOpen(false)} />

            <div className="flex-1 flex flex-col overflow-hidden">
                {/* Navbar */}
                <SubdNavbar
                    onMenuToggle={() => setMobileMenuOpen(true)}
                    leftContent={
                        <div className="flex flex-col">
                            <h1 className="text-xl font-black text-gray-900 tracking-tight leading-none uppercase">Announcements</h1>
                            <p className="text-[9px] text-gray-400 font-extrabold uppercase tracking-wider mt-1.5 leading-none">Manage and broadcast advisories to the Stray Safe community</p>
                        </div>
                    }
                />

                {/* Scrollable Content Area */}
                <main className="flex-1 overflow-y-auto px-3 py-4 sm:p-6 md:p-8 pb-36 md:pb-8 flex flex-col custom-scrollbar">
                    <div className="max-w-5xl mx-auto w-full flex flex-col gap-3 sm:gap-4">


                    {/* Create Announcement Modal */}
                    {showCreate && createPortal(
                        <div className="fixed inset-0 z-[9999] flex items-stretch sm:items-center justify-center sm:p-4 bg-black/50 backdrop-blur-sm" onClick={handleCloseCreateModal}>
                            <div
                                role="dialog"
                                aria-modal="true"
                                aria-labelledby="create-announcement-title"
                                className="bg-white w-full max-w-full sm:max-w-[600px] min-w-0 h-[100dvh] sm:h-auto sm:max-h-[90dvh] sm:rounded-2xl shadow-2xl flex flex-col overflow-hidden animate-[fadeInUp_0.25s_ease-out]"
                                onClick={(e) => e.stopPropagation()}
                            >
                                {/* Header (stays put) */}
                                <div className="shrink-0 px-4 sm:px-6 pt-[max(0.75rem,env(safe-area-inset-top))] sm:pt-4 pb-3 border-b border-gray-100 flex items-start justify-between gap-3">
                                    <div className="min-w-0">
                                        <h2 id="create-announcement-title" className="text-lg font-black text-gray-900 tracking-tight leading-tight">
                                            {editAnnouncementId ? 'Edit Announcement' : 'New Announcement'}
                                        </h2>
                                        <p className="text-xs text-gray-500 mt-0.5 font-medium">
                                            {editAnnouncementId ? 'Update the details and save your changes.' : 'Share important updates with your community.'}
                                        </p>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={handleCloseCreateModal}
                                        aria-label="Close"
                                        className="w-10 h-10 -mr-1.5 -mt-1 shrink-0 rounded-full hover:bg-gray-100 transition-colors text-gray-400 hover:text-gray-700 flex items-center justify-center cursor-pointer"
                                    >
                                        <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                                        </svg>
                                    </button>
                                </div>

                                <form
                                    onSubmit={(e) => submitAs(e)}
                                    className="flex-1 min-h-0 flex flex-col"
                                >
                                    {/* Body (scrolls) */}
                                    <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-4 sm:px-6 py-4 flex flex-col gap-4">
                                        {/* Title */}
                                        <div className="min-w-0">
                                            <label htmlFor="ann-title" className="block text-xs font-bold text-gray-700 mb-1">Title</label>
                                            <input
                                                id="ann-title"
                                                type="text"
                                                value={title}
                                                onChange={(e) => setTitle(e.target.value)}
                                                required
                                                placeholder="e.g., Emergency Rabies Advisory"
                                                className="w-full min-w-0 max-w-full h-11 px-3 bg-white border border-gray-200 rounded-xl text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-role/20 focus:border-role/40 transition-colors"
                                            />
                                            <p className="text-[11px] text-role mt-1 font-semibold italic">Make it concise and descriptive.</p>
                                        </div>

                                        {/* Category & Visibility: stacked on phones, side by side from 640px */}
                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 min-w-0">
                                            <div className="min-w-0">
                                                <label htmlFor="ann-category" className="block text-xs font-bold text-gray-700 mb-1">Category</label>
                                                <div className="relative min-w-0">
                                                    <select
                                                        id="ann-category"
                                                        value={category}
                                                        onChange={(e) => setCategory(e.target.value)}
                                                        className="w-full min-w-0 max-w-full h-11 px-3 bg-white border border-gray-200 rounded-xl text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-role/20 focus:border-role/40 transition-colors pr-9 appearance-none cursor-pointer truncate"
                                                    >
                                                        <option value="Emergency">Emergency (Urgent public safety alerts)</option>
                                                        <option value="Animal Advisory">Animal Advisory</option>
                                                        <option value="Vaccination Drive">Vaccination Drive</option>
                                                        <option value="Lost and Found">Lost and Found</option>
                                                    </select>
                                                    <svg className="w-4 h-4 text-gray-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                                                        <path d="M19 9l-7 7-7-7" strokeLinecap="round" strokeLinejoin="round" />
                                                    </svg>
                                                </div>
                                            </div>
                                            <div className="min-w-0">
                                                <label htmlFor="ann-visibility" className="block text-xs font-bold text-gray-700 mb-1">Visibility</label>
                                                <div className="relative min-w-0">
                                                    <select
                                                        id="ann-visibility"
                                                        value={visibility}
                                                        onChange={(e) => setVisibility(e.target.value)}
                                                        className="w-full min-w-0 max-w-full h-11 px-3 bg-white border border-gray-200 rounded-xl text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-role/20 focus:border-role/40 transition-colors pr-9 appearance-none cursor-pointer truncate"
                                                    >
                                                        <option value="Public">Public - Visible to all residents in the system</option>
                                                        <option value="Subdivision Only">Subdivision Only - Visible only to registered subdivision residents</option>
                                                        <option value="Barangay Only">Barangay Only - Visible only to barangay officials/responders</option>
                                                    </select>
                                                    <svg className="w-4 h-4 text-gray-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                                                        <path d="M19 9l-7 7-7-7" strokeLinecap="round" strokeLinejoin="round" />
                                                    </svg>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Content */}
                                        <div className="min-w-0">
                                            <label htmlFor="ann-content" className="block text-xs font-bold text-gray-700 mb-1">Content</label>
                                            <textarea
                                                id="ann-content"
                                                rows={5}
                                                value={content}
                                                onChange={(e) => setContent(e.target.value)}
                                                required
                                                placeholder="Provide all necessary details about the announcement..."
                                                className="w-full min-w-0 max-w-full px-3 py-2.5 bg-[#f8f9fc] border border-gray-200 rounded-xl text-sm leading-relaxed text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-role/20 focus:border-role/40 resize-y min-h-[120px] transition-colors break-words"
                                            ></textarea>
                                        </div>

                                        {/* Media upload: tap to choose, or drop a file on desktop */}
                                        <div className="min-w-0">
                                            <span className="block text-xs font-bold text-gray-700 mb-1">Media <span className="font-semibold text-gray-400">(optional)</span></span>
                                            <button
                                                type="button"
                                                onClick={() => document.getElementById('modal-file-input')?.click()}
                                                onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                                                onDragLeave={() => setIsDragging(false)}
                                                onDrop={(e) => {
                                                    e.preventDefault();
                                                    setIsDragging(false);
                                                    const dropped = Array.from(e.dataTransfer.files).filter(acceptedDrop);
                                                    if (dropped.length > 0) setMediaFiles(dropped.slice(0, 1));
                                                }}
                                                className={`w-full min-w-0 flex items-center gap-3 p-3 rounded-xl border-2 border-dashed text-left transition-colors cursor-pointer ${isDragging ? 'border-role bg-role-soft' : 'border-role/30 bg-role-soft/20 hover:bg-role-soft/50 hover:border-role/50'}`}
                                            >
                                                <span className="w-10 h-10 rounded-xl bg-white border border-role-muted text-role flex items-center justify-center shrink-0">
                                                    <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                                                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 16.5V9.75m0 0l3 3m-3-3l-3 3M6.75 19.5a4.5 4.5 0 01-1.41-8.775 5.25 5.25 0 0110.233-2.33 3 3 0 013.758 3.848A3.752 3.752 0 0118 19.5H6.75z" />
                                                    </svg>
                                                </span>
                                                <span className="min-w-0">
                                                    <span className="block text-sm font-bold text-gray-800">
                                                        Tap to upload<span className="hidden md:inline"> or drag a file here</span>
                                                    </span>
                                                    <span className="block text-[11px] text-gray-500 font-medium">Image, video or PDF</span>
                                                </span>
                                            </button>
                                            <input
                                                id="modal-file-input"
                                                type="file"
                                                accept="image/*,video/*,.pdf"
                                                className="hidden"
                                                onChange={(e) => {
                                                    if (e.target.files) {
                                                        setMediaFiles(Array.from(e.target.files));
                                                    }
                                                    e.target.value = '';
                                                }}
                                            />
                                            {mediaFiles.length > 0 && (
                                                <ul className="mt-2 flex flex-col gap-1.5">
                                                    {mediaFiles.map((f, i) => (
                                                        <li key={`${f.name}-${i}`} className="flex items-center gap-2 min-w-0 pl-3 pr-1 h-11 rounded-xl bg-gray-50 border border-gray-100">
                                                            <svg className="w-4 h-4 text-green-500 shrink-0" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" /></svg>
                                                            <span className="text-xs font-semibold text-gray-700 truncate flex-1 min-w-0" title={f.name}>{f.name}</span>
                                                            <button
                                                                type="button"
                                                                onClick={() => setMediaFiles(prev => prev.filter((_, j) => j !== i))}
                                                                aria-label={`Remove ${f.name}`}
                                                                className="w-9 h-9 shrink-0 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 flex items-center justify-center cursor-pointer"
                                                            >
                                                                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                                                            </button>
                                                        </li>
                                                    ))}
                                                </ul>
                                            )}
                                        </div>

                                        {/* Pin: its own row */}
                                        <fieldset className="min-w-0 flex items-center justify-between gap-3 py-3 border-y border-gray-100">
                                            <legend className="sr-only">Pin announcement</legend>
                                            <div className="min-w-0">
                                                <p className="text-sm font-bold text-gray-800">Pin announcement</p>
                                                <p className="text-[11px] text-gray-500 font-medium">Keeps it at the top of the feed</p>
                                            </div>
                                            <div className="grid grid-cols-2 gap-1 p-1 bg-gray-100 rounded-xl shrink-0">
                                                <label className={`h-9 px-4 rounded-lg text-xs font-black flex items-center justify-center cursor-pointer transition-all has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-role/30 ${pinned ? 'bg-white text-role shadow-2xs' : 'text-gray-500'}`}>
                                                    <input type="radio" name="ann-pinned" className="sr-only" checked={pinned} onChange={() => setPinned(true)} />
                                                    Yes
                                                </label>
                                                <label className={`h-9 px-4 rounded-lg text-xs font-black flex items-center justify-center cursor-pointer transition-all has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-role/30 ${!pinned ? 'bg-white text-gray-800 shadow-2xs' : 'text-gray-500'}`}>
                                                    <input type="radio" name="ann-pinned" className="sr-only" checked={!pinned} onChange={() => setPinned(false)} />
                                                    No
                                                </label>
                                            </div>
                                        </fieldset>

                                        {/* Expiration: its own row */}
                                        <div className="min-w-0">
                                            <label htmlFor="ann-expiration" className="block text-xs font-bold text-gray-700 mb-1">
                                                Expiration Date <span className="font-semibold text-gray-400">(Optional)</span>
                                            </label>
                                            <input
                                                id="ann-expiration"
                                                type="date"
                                                value={expiration}
                                                onChange={(e) => setExpiration(e.target.value)}
                                                placeholder="mm/dd/yyyy"
                                                className="w-full min-w-0 max-w-full h-11 px-3 bg-white border border-gray-200 rounded-xl text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-role/20 focus:border-role/40 transition-colors appearance-none"
                                            />
                                        </div>
                                    </div>

                                    {/* Footer (stays at the bottom, above the phone's home bar) */}
                                    <div className="shrink-0 border-t border-gray-100 bg-white px-4 sm:px-6 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] grid grid-cols-1 min-[340px]:grid-cols-2 sm:flex sm:justify-end gap-2">
                                        <button
                                            type="button"
                                            disabled={isSubmitting}
                                            onClick={(e) => submitAs(e, 'Draft')}
                                            className="h-11 px-4 min-w-0 rounded-xl border border-gray-300 bg-white text-gray-700 font-bold text-sm hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors cursor-pointer"
                                        >
                                            Save Draft
                                        </button>
                                        <button
                                            type="button"
                                            disabled={isSubmitting}
                                            onClick={(e) => submitAs(e, 'Published')}
                                            className="h-11 px-5 min-w-0 bg-role hover:bg-role-hover active:scale-95 disabled:opacity-60 disabled:cursor-not-allowed text-white rounded-xl font-black text-sm transition-all cursor-pointer shadow-sm truncate"
                                        >
                                            {isSubmitting ? 'Saving…' : editAnnouncementId ? 'Save Changes' : (
                                                <><span className="sm:hidden">Publish</span><span className="hidden sm:inline">Publish Announcement</span></>
                                            )}
                                        </button>
                                    </div>
                                </form>
                            </div>
                        </div>
                    , document.body)}

                    {/* Heading (phones; desktop shows it in the top bar) + New Announcement */}
                    <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0 md:hidden">
                            <h1 className="text-lg font-black text-gray-900 tracking-tight leading-tight">Announcements</h1>
                            <p className="text-xs font-semibold text-gray-500 truncate">Manage community updates and advisories.</p>
                        </div>
                        <button
                            type="button"
                            onClick={() => { handleCloseCreateModal(); setShowCreate(true); }}
                            className="h-10 px-4 md:ml-auto shrink-0 inline-flex items-center gap-1.5 rounded-xl bg-role hover:bg-role-hover text-white font-black text-sm shadow-sm active:scale-95 transition-all cursor-pointer"
                        >
                            <span className="text-base leading-none">+</span>
                            <span>New</span><span className="hidden sm:inline -ml-1">&nbsp;Announcement</span>
                        </button>
                    </div>

                    {/* Statistics */}
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3">
                        {([
                            { label: 'Total', sub: 'All time', value: announcements.length, tone: 'bg-slate-50 text-slate-600', num: 'text-gray-900',
                              icon: 'M11 5.882V19.24a1.76 1.76 0 01-3.417.592l-2.147-6.15M18 13a3 3 0 100-6M5.436 13.683A4.001 4.001 0 017 6h1.832c4.1 0 7.625-1.234 9.168-3v14c-1.543-1.766-5.067-3-9.168-3H7a3.988 3.988 0 01-1.564-.317z' },
                            { label: 'Active', sub: 'Currently live', value: announcements.filter(a => a.status === 'Published').length, tone: 'bg-green-50 text-green-600', num: 'text-green-700',
                              icon: 'M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15.536a5 5 0 001.414-1.414M12 12v.01M12 12a1 1 0 100-2 1 1 0 000 2z' },
                            { label: 'Pinned', sub: 'Always on top', value: announcements.filter(a => a.pinned).length, tone: 'bg-role-soft text-role', num: 'text-role',
                              icon: 'M12 17v4m-2-4h4m-8-4h12M8 13v-3a4 4 0 018 0v3H8z' },
                            { label: 'Draft', sub: 'Not published', value: announcements.filter(a => a.status === 'Draft').length, tone: 'bg-amber-50 text-amber-600', num: 'text-amber-700',
                              icon: 'M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z' },
                        ]).map((m) => (
                            <div key={m.label} className="bg-white rounded-2xl border border-gray-100 p-3 flex items-center gap-2.5 min-w-0">
                                <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${m.tone}`}>
                                    <svg className="w-4.5 h-4.5" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" d={m.icon} />
                                    </svg>
                                </div>
                                <div className="min-w-0">
                                    <p className={`text-2xl font-black leading-none ${m.num}`}>{m.value}</p>
                                    <p className="text-[11px] font-bold text-gray-500 leading-tight mt-1 truncate">{m.label} <span className="font-semibold text-gray-400">· {m.sub}</span></p>
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* Status tabs (segmented) */}
                    <div className="grid grid-cols-4 gap-1 p-1 bg-gray-100 rounded-2xl" role="tablist">
                        {([
                            ['All', announcements.length],
                            ['Active', announcements.filter(a => a.status === 'Published').length],
                            ['Draft', announcements.filter(a => a.status === 'Draft').length],
                            ['Pinned', announcements.filter(a => a.pinned).length],
                        ] as const).map(([tab, count]) => {
                            const isActive = selectedStatus === tab;
                            return (
                                <button
                                    key={tab}
                                    type="button"
                                    role="tab"
                                    aria-selected={isActive}
                                    onClick={() => setSelectedStatus(tab)}
                                    className={`h-9 rounded-xl text-xs font-black transition-all inline-flex items-center justify-center gap-1 cursor-pointer ${isActive
                                        ? 'bg-white text-role shadow-2xs'
                                        : 'text-gray-500 hover:text-gray-800'
                                    }`}
                                >
                                    {tab}
                                    <span className={`text-[10px] font-black ${isActive ? 'text-role/70' : 'text-gray-400'}`}>{count}</span>
                                </button>
                            );
                        })}
                    </div>

                    {/* Search + category */}
                    <div className="flex flex-col sm:flex-row gap-2">
                        <div className="relative flex-1 min-w-0">
                            <svg className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                            </svg>
                            <input
                                type="text"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                placeholder="Search announcements"
                                className="w-full h-10 pl-9 pr-3 text-sm bg-white border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-role/20 focus:border-role/40 placeholder:text-gray-400 transition-colors"
                            />
                        </div>
                        <div className="relative sm:w-56">
                            <select
                                value={selectedCategory}
                                onChange={(e) => setSelectedCategory(e.target.value)}
                                className="w-full h-10 appearance-none pl-3 pr-8 text-sm font-semibold bg-white border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-role/20 focus:border-role/40 text-gray-700 cursor-pointer transition-colors"
                                aria-label="Category"
                            >
                                <option value="All">All categories</option>
                                <option value="Emergency">Emergency</option>
                                <option value="Animal Advisory">Animal Advisory</option>
                                <option value="Vaccination Drive">Vaccination Drive</option>
                                <option value="Lost and Found">Lost and Found</option>
                            </select>
                            <svg className="w-4 h-4 text-gray-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                                <path d="M19 9l-7 7-7-7" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                        </div>
                    </div>

                    {/* Announcement Feed vertical stacked list */}
                    <div className="flex flex-col gap-2.5 sm:gap-3">
                        {!hasLoaded && announcements.length === 0 ? (
                            [1, 2, 3].map((n) => (
                                <div key={n} className="bg-white rounded-2xl border border-gray-100 p-4 animate-pulse">
                                    <div className="flex gap-3">
                                        <div className="w-9 h-9 rounded-xl bg-gray-200 shrink-0" />
                                        <div className="flex-1 space-y-2 pt-1">
                                            <div className="h-4 w-2/3 bg-gray-200 rounded" />
                                            <div className="h-3 w-full bg-gray-100 rounded" />
                                            <div className="h-3 w-1/2 bg-gray-100 rounded" />
                                        </div>
                                    </div>
                                </div>
                            ))
                        ) : filteredAnnouncements.length === 0 ? (
                            <div className="text-center py-10 px-4 bg-white rounded-2xl border border-dashed border-gray-200">
                                <div className="w-12 h-12 rounded-full bg-role-soft text-role mx-auto flex items-center justify-center">
                                    <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M11 5.882V19.24a1.76 1.76 0 01-3.417.592l-2.147-6.15M18 13a3 3 0 100-6M5.436 13.683A4.001 4.001 0 017 6h1.832c4.1 0 7.625-1.234 9.168-3v14c-1.543-1.766-5.067-3-9.168-3H7a3.988 3.988 0 01-1.564-.317z" />
                                    </svg>
                                </div>
                                <p className="text-sm font-black text-gray-800 mt-3">
                                    {announcements.length === 0 ? 'No announcements yet' : 'No announcements match these filters'}
                                </p>
                                <p className="text-xs text-gray-500 mt-1">
                                    {announcements.length === 0 ? 'Post an update or advisory for your subdivision.' : 'Try another tab, category or search word.'}
                                </p>
                                {announcements.length > 0 && (selectedStatus !== 'All' || selectedCategory !== 'All' || searchQuery) && (
                                    <button
                                        type="button"
                                        onClick={() => { setSelectedStatus('All'); setSelectedCategory('All'); setSearchQuery(''); }}
                                        className="mt-3 h-9 px-4 rounded-xl border border-gray-200 text-xs font-black text-gray-700 hover:border-role-border hover:text-role transition-all cursor-pointer"
                                    >
                                        Clear filters
                                    </button>
                                )}
                            </div>
                        ) : (
                            filteredAnnouncements.map((ann) => renderUniformCard(ann))
                        )}
                    </div>

                    {/* Results count */}
                    {announcements.length > 0 && (
                        <div className="text-xs text-gray-500 font-semibold">
                            Showing {totalFiltered} of {announcements.length} announcement{announcements.length !== 1 ? 's' : ''}
                        </div>
                    )}

                    {/* View Full Announcement Modal */}
                    {selectedAnnouncement && createPortal(
                        <div
                            className="fixed inset-0 z-[9999] flex items-stretch justify-center bg-black/60 animate-fade-in"
                            onClick={() => setSelectedAnnouncement(null)}
                        >
                            <div
                                role="dialog"
                                aria-modal="true"
                                aria-labelledby="announcement-details-title"
                                onClick={(e) => e.stopPropagation()}
                                className="bg-white w-full min-w-0 h-[100dvh] overflow-hidden flex flex-col"
                            >
                                {/* Header (stays put while the body scrolls) */}
                                <div className="shrink-0 px-4 pt-[max(0.75rem,env(safe-area-inset-top))] pb-3 sm:px-6 border-b border-gray-100 flex items-start justify-between gap-3">
                                    <div className="min-w-0">
                                        <p className="text-sm font-black text-gray-900">Announcement Details</p>
                                        <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                                            <span className={`text-[10px] font-black uppercase tracking-wide px-2 py-0.5 rounded-full ${selectedAnnouncement.category === 'Emergency' ? 'bg-red-50 text-red-600' :
                                                selectedAnnouncement.category === 'Vaccination Drive' ? 'bg-green-50 text-green-700' :
                                                    selectedAnnouncement.category === 'Lost and Found' ? 'bg-blue-50 text-blue-700' :
                                                        'bg-violet-50 text-violet-700'
                                                }`}>
                                                {selectedAnnouncement.category}
                                            </span>
                                            {selectedAnnouncement.pinned && (
                                                <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-role-soft text-role border border-role-muted">📌 Pinned</span>
                                            )}
                                            {selectedAnnouncement.status === 'Draft' && (
                                                <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200">Draft</span>
                                            )}
                                        </div>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => setSelectedAnnouncement(null)}
                                        className="w-10 h-10 -mr-1.5 -mt-1 shrink-0 rounded-full hover:bg-gray-100 text-gray-400 hover:text-gray-700 transition-colors flex items-center justify-center cursor-pointer"
                                        aria-label="Close"
                                    >
                                        <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"></path>
                                        </svg>
                                    </button>
                                </div>

                                {/* Body (scrolls) */}
                                <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden overscroll-contain px-4 sm:px-6 py-4 scrollbar-thin">
                                    <div className="max-w-3xl mx-auto w-full min-w-0">
                                    <h2 id="announcement-details-title" className="text-xl sm:text-2xl font-black text-gray-900 leading-tight break-words">
                                        {selectedAnnouncement.title}
                                    </h2>

                                    {/* Info rows */}
                                    <dl className="mt-3 grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1.5 text-xs">
                                        <dt className="font-bold text-gray-400">Audience</dt>
                                        <dd className="font-semibold text-gray-700 min-w-0 break-words">{selectedAnnouncement.visibility}</dd>
                                        <dt className="font-bold text-gray-400">Posted by</dt>
                                        <dd className="font-semibold text-gray-700 min-w-0">Subdivision Leader</dd>
                                        <dt className="font-bold text-gray-400">Posted on</dt>
                                        <dd className="font-semibold text-gray-700 min-w-0">{selectedAnnouncement.date}</dd>
                                        <dt className="font-bold text-gray-400">Location</dt>
                                        <dd className="font-semibold text-gray-700 min-w-0 break-words">📍 {selectedAnnouncement.location || 'Selera Homes'}</dd>
                                    </dl>

                                    <p className="mt-4 pt-4 border-t border-gray-100 text-gray-700 text-sm leading-relaxed whitespace-pre-line break-words">
                                        {selectedAnnouncement.content}
                                    </p>

                                    {/* Attached media */}
                                    {(selectedAnnouncement.attachedMedia || []).length > 0 && (
                                        <div className="mt-4 flex flex-col gap-2">
                                            {(selectedAnnouncement.attachedMedia || []).map((media, idx) => (
                                                media.media_type === 'Image' ? (
                                                    <a
                                                        key={`${media.file_url}-${idx}`}
                                                        href={media.file_url}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        className="block rounded-xl overflow-hidden bg-gray-50 border border-gray-100"
                                                        title="Open full size"
                                                    >
                                                        <img src={media.file_url} alt={`Attachment ${idx + 1}`} className="block w-full max-w-full max-h-[60vh] object-contain mx-auto" />
                                                    </a>
                                                ) : media.media_type === 'Video' ? (
                                                    <video key={`${media.file_url}-${idx}`} src={media.file_url} controls className="block w-full max-w-full max-h-[60vh] rounded-xl bg-black" />
                                                ) : (
                                                    <a
                                                        key={`${media.file_url}-${idx}`}
                                                        href={media.file_url}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        className="flex items-center gap-2 h-11 px-3 rounded-xl border border-gray-100 bg-gray-50 text-sm font-bold text-role hover:underline min-w-0"
                                                    >
                                                        <span>📄</span><span className="truncate">PDF Preview</span>
                                                    </a>
                                                )
                                            ))}
                                        </div>
                                    )}

                                    {/* Engagement */}
                                    <div className="mt-4 py-2 border-y border-gray-100 flex items-center gap-1 text-xs font-bold text-gray-500">
                                        <button
                                            type="button"
                                            onClick={() => handleLike(selectedAnnouncement.id)}
                                            aria-pressed={!!selectedAnnouncement.hasLiked}
                                            className={`inline-flex items-center gap-1.5 h-9 px-2.5 rounded-lg hover:bg-role-soft hover:text-role active:scale-95 transition-all cursor-pointer ${selectedAnnouncement.hasLiked ? 'text-role' : ''}`}
                                        >
                                            <svg className={`w-4 h-4 ${selectedAnnouncement.hasLiked ? 'text-role fill-role' : 'text-gray-400'}`} fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" d="M14 9V5a3 3 0 00-3-3l-4 9v11h11.28a2 2 0 002-1.7l1.38-9a2 2 0 00-2-2.3zM7 22H4a2 2 0 01-2-2v-7a2 2 0 012-2h3" />
                                            </svg>
                                            {selectedAnnouncement.reactions} <span className="font-semibold">Likes</span>
                                        </button>
                                        <span className="inline-flex items-center gap-1.5 h-9 px-2.5">
                                            <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                                            </svg>
                                            {selectedAnnouncement.comments.length} <span className="font-semibold">Comments</span>
                                        </span>
                                        <span className="inline-flex items-center gap-1.5 h-9 px-2.5">
                                            <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                                <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                                            </svg>
                                            {selectedAnnouncement.views || 0} <span className="font-semibold">Views</span>
                                        </span>
                                    </div>

                                    {/* Comments */}
                                    <h3 className="mt-3 mb-2 text-sm font-black text-gray-900">
                                        Comments <span className="text-gray-400 font-bold">({selectedAnnouncement.comments.length})</span>
                                    </h3>
                                    {selectedAnnouncement.comments.length === 0 ? (
                                        <p className="text-xs text-gray-400 py-3 text-center bg-gray-50 rounded-xl">No comments yet. Be the first to comment!</p>
                                    ) : (
                                        <ul className="flex flex-col divide-y divide-gray-100">
                                            {selectedAnnouncement.comments.map((comment, i) => {
                                                const when = comment.createdAt ? new Date(comment.createdAt) : null;
                                                return (
                                                    <li key={i} className="flex gap-2.5 items-start py-2.5 min-w-0">
                                                        {comment.photo ? (
                                                            <img src={comment.photo} alt="" className="w-8 h-8 rounded-full object-cover shrink-0" />
                                                        ) : (
                                                            <div className="w-8 h-8 rounded-full bg-role-soft text-role flex items-center justify-center text-xs font-black shrink-0">
                                                                {(comment.author || 'Resident').charAt(0).toUpperCase()}
                                                            </div>
                                                        )}
                                                        <div className="min-w-0 flex-1">
                                                            <div className="flex flex-wrap items-baseline gap-x-2">
                                                                <span className="text-xs font-bold text-gray-800 break-words">{comment.author || 'Resident'}</span>
                                                                {when && !Number.isNaN(when.getTime()) && (
                                                                    <span className="text-[10px] font-semibold text-gray-400">
                                                                        {when.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                                                                    </span>
                                                                )}
                                                            </div>
                                                            <p className="text-[13px] text-gray-700 mt-0.5 leading-snug whitespace-pre-line break-words">{comment.text}</p>
                                                        </div>
                                                    </li>
                                                );
                                            })}
                                        </ul>
                                    )}
                                    </div>
                                </div>

                                {/* Comment composer (stays at the bottom, above the phone's home bar) */}
                                <form
                                    onSubmit={(e) => {
                                        e.preventDefault();
                                        if (!newCommentText.trim()) return;
                                        handleAddComment(selectedAnnouncement.id, newCommentText);
                                        setNewCommentText('');
                                    }}
                                    className="shrink-0 border-t border-gray-100 bg-white px-3 sm:px-6 pt-2.5 pb-[max(0.625rem,env(safe-area-inset-bottom))] flex items-center gap-2 min-w-0"
                                >
                                    <div className="w-8 h-8 rounded-full bg-gray-100 text-gray-500 flex items-center justify-center text-[10px] font-black shrink-0">
                                        SL
                                    </div>
                                    <input
                                        type="text"
                                        placeholder="Write a comment..."
                                        aria-label="Write a comment"
                                        value={newCommentText}
                                        onChange={(e) => setNewCommentText(e.target.value)}
                                        className="flex-1 min-w-0 h-10 px-3 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-role/20 focus:border-role/40"
                                    />
                                    <button
                                        type="submit"
                                        disabled={!newCommentText.trim()}
                                        aria-label="Post comment"
                                        className="h-10 w-10 sm:w-auto sm:px-4 shrink-0 inline-flex items-center justify-center gap-1.5 bg-role hover:bg-role-hover disabled:opacity-40 disabled:cursor-not-allowed text-white font-black text-xs rounded-xl transition-all cursor-pointer active:scale-95"
                                    >
                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" />
                                        </svg>
                                        <span className="hidden sm:inline">Post</span>
                                    </button>
                                </form>
                            </div>
                        </div>
                    , document.body)}
                    </div>
                </main>
                <SubdBottomNav />
            </div>
        </div>
    );
};

export default SubdHazardAlert;
