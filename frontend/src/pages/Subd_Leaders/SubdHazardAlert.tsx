/* eslint-disable react-hooks/exhaustive-deps, react-hooks/set-state-in-effect, @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars */
import { useEffect, useState, FormEvent } from 'react';
import axios from 'axios';
import SubdSidebar from '../../components/SubdSidebar';
import SubdNavbar from '../../components/Navbars/SubdNavbar';

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
    comments: { author: string; text: string }[];
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

    // Feed filters and selection states
    const [selectedCategory, setSelectedCategory] = useState('All');
    const [selectedStatus, setSelectedStatus] = useState('All');
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedAnnouncement, setSelectedAnnouncement] = useState<Announcement | null>(null);
    const [newCommentText, setNewCommentText] = useState('');

    const categories = ['All', 'Emergency', 'Animal Advisory', 'Vaccination Drive', 'Lost and Found'];

    const [announcements, setAnnouncements] = useState<Announcement[]>([]);

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
            comments: item.comments ? item.comments.map((c: any) => ({ author: c.user_name || 'Resident', text: c.comment })) : [],
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
            const res = await axios.get(`http://localhost:8000/announcements/subdivision/${currentUser.subdivision_id}`);
            setAnnouncements(res.data.map(mapApiAnnouncement));
        } catch (err) {
            console.error('Failed to fetch announcements:', err);
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
            await axios.post(`http://localhost:8000/announcements/${id}/react`, {
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
            await axios.post(`http://localhost:8000/announcements/${annId}/comments`, {
                user_id: currentUser.user_id,
                comment: text
            });
            await fetchAnnouncements();
        } catch (err) {
            console.error('Failed to add comment:', err);
            alert('Failed to post comment.');
        }
    };

    const handleToggleStatus = async (id: string, currentStatus: string) => {
        const nextStatus = currentStatus === 'Published' ? 'Draft' : 'Published';
        try {
            await axios.patch(`http://localhost:8000/announcements/${id}/status`, { status: nextStatus });
            await fetchAnnouncements();
        } catch (err) {
            console.error('Failed to toggle status:', err);
            alert('Failed to update status.');
        }
    };

    const handleDeleteAnnouncement = async (id: string) => {
        if (!window.confirm("Are you sure you want to delete this announcement?")) {
            return;
        }
        try {
            await axios.delete(`http://localhost:8000/announcements/${id}`);
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

    const pinnedAnnouncements = filteredAnnouncements.filter(ann => ann.pinned);
    const normalAnnouncements = filteredAnnouncements.filter(ann => !ann.pinned);
    const totalFiltered = filteredAnnouncements.length;

    const categoryStyle = (cat: string) => {
        switch (cat) {
            case 'Emergency': return 'bg-red-50 text-red-600 border-red-100';
            case 'Vaccination Drive': return 'bg-green-50 text-green-700 border-green-100';
            case 'Lost and Found': return 'bg-blue-50 text-blue-600 border-blue-100';
            default: return 'bg-indigo-50 text-indigo-600 border-indigo-100';
        }
    };

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

        const isLive = ann.status === 'Published';

        return (
            <div
                key={ann.id}
                onClick={() => handleOpenFull(ann)}
                className={`bg-white rounded-2xl border border-gray-200/80 border-l-[6px] ${borderStyle(ann.category)} shadow-sm hover:shadow-xl hover:-translate-y-1 hover:border-gray-300/80 hover:shadow-[0_8px_30px_rgba(0,0,0,0.04)] transition-all duration-300 ease-out p-6 flex flex-col sm:flex-row gap-5 items-start justify-between relative cursor-pointer group`}
            >
                <div className="flex gap-4 items-start flex-1 w-full">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${iconContainerStyle(ann.category)}`}>
                        {renderCategoryIcon(ann.category)}
                    </div>

                    <div className="flex flex-col gap-2 flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                            <h3 className="text-[15px] font-bold text-gray-900 leading-snug group-hover:text-[#F97316] transition-colors">
                                {ann.title}
                            </h3>
                            {isPinned && (
                                <span className="inline-flex items-center gap-1 bg-orange-50 text-[#F97316] px-2 py-0.5 rounded-full text-[10px] font-black uppercase border border-orange-100 tracking-wide">
                                    <svg className="w-2.5 h-2.5" fill="currentColor" viewBox="0 0 20 20">
                                        <path d="M10 2a1 1 0 011 1v1.171l1.646-1.647a1 1 0 011.414 1.414L12.414 5.6H15a1 1 0 110 2h-1.646l2.122 2.121a1 1 0 11-1.414 1.414L11.94 9.013V15.6a1 1 0 11-2 0V9.013L7.818 11.15a1 1 0 11-1.414-1.414l2.122-2.121H5.1a1 1 0 110-2h2.586L6.038 3.938a1 1 0 011.414-1.414L9.1 4.171V3a1 1 0 011-1z" />
                                    </svg>
                                    pinned
                                </span>
                            )}
                        </div>

                        <p className="text-[#3B5898] text-[12.5px] leading-relaxed font-medium line-clamp-2">
                            {ann.content}
                        </p>

                        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 mt-1 text-[11px] font-bold text-gray-400">
                            <span className={`px-2.5 py-0.5 rounded-full font-black text-[10px] uppercase tracking-wider ${categoryBadgeStyle(ann.category)}`}>
                                {ann.category}
                            </span>
                            <span className="flex items-center gap-1">
                                <svg className="w-3.5 h-3.5 text-gray-300" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M17.982 18.725A7.488 7.488 0 0012 15.75a7.488 7.488 0 00-5.982 2.975m11.963 0a9 9 0 10-11.963 0m11.963 0A8.966 8.966 0 0112 21a8.966 8.966 0 01-5.982-2.275M15 9.75a3 3 0 11-6 0 3 3 0 016 0z" />
                                </svg>
                                {ann.category === 'Vaccination Drive' ? 'Pet owners' : 'All residents'}
                            </span>
                            <span className="flex items-center gap-1">
                                <svg className="w-3.5 h-3.5 text-gray-300" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5m-9-6h.008v.008H12v-.008zM12 15h.008v.008H12V15zm0 2.25h.008v.008H12v-.008zM9.75 15h.008v.008H9.75V15zm0 2.25h.008v.008H9.75v-.008zM7.5 15h.008v.008H7.5V15zm0 2.25h.008v.008H7.5v-.008zm6.75-4.5h.008v.008h-.008v-.008zm0 2.25h.008v.008h-.008V15zm0 2.25h.008v.008h-.008v-.008zm2.25-4.5h.008v.008H16.5v-.008zm0 2.25h.008v.008H16.5V15z" />
                                </svg>
                                {ann.date}
                            </span>
                            <span className="flex items-center gap-1">
                                <span>📍</span>
                                <span>{ann.location || 'Selera Homes'}</span>
                            </span>
                        </div>

                        {/* Visual separation line */}
                        <div className="w-full border-t border-gray-100 my-1"></div>

                        {/* Bottom social engagement row */}
                        <div className="flex items-center gap-5 text-[11.5px] font-extrabold text-gray-400 select-none">
                            <span
                                className="flex items-center gap-1.5 hover:text-[#F97316] hover:scale-[1.06] active:scale-95 transition-all duration-250 cursor-pointer"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    handleLike(ann.id);
                                }}
                            >
                                <svg className={`w-4 h-4 transition-all duration-300 ${ann.hasLiked ? 'text-[#F97316] fill-[#F97316]' : 'text-gray-300 hover:text-[#F97316]'}`} fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M14 9V5a3 3 0 00-3-3l-4 9v11h11.28a2 2 0 002-1.7l1.38-9a2 2 0 00-2-2.3zM7 22H4a2 2 0 01-2-2v-7a2 2 0 012-2h3" />
                                </svg>
                                <span className={`transition-colors duration-250 ${ann.hasLiked ? 'text-[#F97316]' : ''}`}>{ann.reactions} Likes</span>
                            </span>
                            <span className="flex items-center gap-1.5 hover:text-gray-600 hover:scale-[1.04] active:scale-95 transition-all duration-250">
                                <svg className="w-4 h-4 text-gray-300 transition-colors" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                                </svg>
                                <span>{ann.comments.length} Comments</span>
                            </span>
                            <span className="flex items-center gap-1.5 hover:text-gray-600 hover:scale-[1.04] active:scale-95 transition-all duration-250">
                                <svg className="w-4 h-4 text-gray-300 transition-colors" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                                </svg>
                                <span>{ann.views || 0} Views</span>
                            </span>
                        </div>
                    </div>
                </div>

                <div className="relative shrink-0 align-top self-start mt-1">
                    <button
                        type="button"
                        onClick={(e) => {
                            e.stopPropagation();
                            setOpenMenuId(openMenuId === ann.id ? null : ann.id);
                        }}
                        className="p-1.5 rounded-lg hover:bg-gray-50 border border-transparent hover:border-gray-200/60 text-gray-400 hover:text-gray-700 transition-all shrink-0 cursor-pointer"
                    >
                        <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                            <path d="M10 6a2 2 0 110-4 2 2 0 010 4zM10 12a2 2 0 110-4 2 2 0 010 4zM10 18a2 2 0 110-4 2 2 0 010 4z" />
                        </svg>
                    </button>
                    {openMenuId === ann.id && (
                        <div
                            className="absolute right-0 mt-1 w-32 bg-white rounded-xl shadow-[0_4px_20px_rgba(0,0,0,0.08)] border border-gray-150 py-1 z-30 flex flex-col animate-in fade-in slide-in-from-top-1 duration-150"
                            onClick={(e) => e.stopPropagation()}
                        >
                            <button
                                type="button"
                                onClick={() => {
                                    setOpenMenuId(null);
                                    handleEditAnnouncement(ann);
                                }}
                                className="w-full text-left px-3 py-2 text-[11px] font-bold text-gray-750 hover:bg-orange-50 hover:text-[#F97316] transition-colors flex items-center gap-2 cursor-pointer"
                            >
                                <svg className="w-3.5 h-3.5 text-gray-400" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                                </svg>
                                <span>Edit</span>
                            </button>
                            <button
                                type="button"
                                onClick={() => {
                                    setOpenMenuId(null);
                                    handleDeleteAnnouncement(ann.id);
                                }}
                                className="w-full text-left px-3 py-2 text-[11px] font-bold text-red-650 hover:bg-red-50 hover:text-red-650 transition-colors flex items-center gap-2 cursor-pointer"
                            >
                                <svg className="w-3.5 h-3.5 text-red-400" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                </svg>
                                <span>Delete</span>
                            </button>
                        </div>
                    )}
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
                await axios.put(`http://localhost:8000/announcements/${editAnnouncementId}`, payload);
            } else {
                const created = await axios.post('http://localhost:8000/announcements/', payload);
                announcementId = created.data.announcement_id;
            }

            if (announcementId && mediaFiles.length > 0) {
                for (const file of mediaFiles) {
                    const fd = new FormData();
                    fd.append('file', file);
                    await axios.post(`http://localhost:8000/announcements/${announcementId}/media`, fd, {
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

    return (
        <div className="min-h-screen w-full flex bg-[#FDFDFD] font-sans text-gray-800 relative overflow-hidden">
            {/* Decorative Background Elements */}
            <div className="absolute top-0 left-0 w-[600px] h-[600px] bg-[#F97316]/5 rounded-full blur-[100px] pointer-events-none -translate-x-1/2 -translate-y-1/2 z-0"></div>
            <div className="absolute bottom-0 right-0 w-[800px] h-[800px] bg-orange-50/50 rounded-full blur-[120px] pointer-events-none translate-x-1/3 translate-y-1/3 z-0"></div>

            {/* Sidebar */}
            <div className="z-10 flex shrink-0">
                <SubdSidebar />
            </div>

            {/* Main Content */}
            <main className="flex-1 flex flex-col h-screen overflow-hidden">
                {/* Navbar */}
                <SubdNavbar
                    leftContent={
                        <div className="flex flex-col">
                            <h1 className="text-xl font-black text-gray-900 tracking-tight leading-none">Announcements</h1>
                            <p className="text-[11px] text-gray-400 font-semibold mt-1.5 leading-none">Manage and broadcast advisories to the Stray Safe community</p>
                        </div>
                    }
                />

                {/* Scrollable Content Area */}
                <div className="flex-1 overflow-y-auto p-10 flex flex-col gap-8 scrollbar-thin scrollbar-thumb-gray-200 scrollbar-track-transparent relative z-10">


                    {/* Create Announcement Modal */}
                    {showCreate && (
                        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm" onClick={handleCloseCreateModal}>
                            <div
                                className="bg-white rounded-2xl shadow-2xl w-full max-w-[560px] max-h-[90vh] overflow-y-auto relative animate-[fadeInUp_0.25s_ease-out]"
                                onClick={(e) => e.stopPropagation()}
                            >
                                {/* Modal Header */}
                                <div className="px-8 pt-8 pb-4 border-b border-gray-100">
                                    <div className="flex items-start justify-between">
                                        <div>
                                            <h2 className="text-2xl font-black text-gray-900 tracking-tight">
                                                {editAnnouncementId ? 'Edit Announcement' : 'Create Community Announcement'}
                                            </h2>
                                            <p className="text-sm text-gray-400 mt-1 font-medium">
                                                {editAnnouncementId ? 'Modify details of your announcement and save updates.' : 'Draft and publish important updates for your neighbors. Choose the right category to ensure proper visibility.'}
                                            </p>
                                        </div>
                                        <button
                                            onClick={handleCloseCreateModal}
                                            className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors text-gray-400 hover:text-gray-600 shrink-0 ml-4"
                                        >
                                            <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                                            </svg>
                                        </button>
                                    </div>
                                </div>

                                {/* Modal Body */}
                                <form
                                    onSubmit={(e) => handleSubmit(e)}
                                    className="px-8 py-6 space-y-5"
                                >
                                    {/* Title */}
                                    <div>
                                        <label className="block text-sm font-bold text-gray-700 mb-1.5">Title</label>
                                        <input
                                            type="text"
                                            value={title}
                                            onChange={(e) => setTitle(e.target.value)}
                                            required
                                            placeholder="e.g., Emergency Rabies Advisory"
                                            className="w-full px-4 py-3 bg-white border border-gray-200 rounded-xl text-sm text-gray-700 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#F97316]/20 focus:border-[#F97316]/40 transition-colors"
                                        />
                                        <p className="text-xs text-[#F97316] mt-1 font-semibold italic">Make it concise and descriptive.</p>
                                    </div>

                                    {/* Category & Visibility */}
                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <label className="block text-sm font-bold text-gray-700 mb-1.5">Category</label>
                                            <div className="relative">
                                                <select
                                                    value={category}
                                                    onChange={(e) => setCategory(e.target.value)}
                                                    className="w-full px-4 py-3 bg-white border border-gray-200 rounded-xl text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-[#F97316]/20 focus:border-[#F97316]/40 appearance-none cursor-pointer transition-colors"
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
                                        <div>
                                            <label className="block text-sm font-bold text-gray-700 mb-1.5">Visibility</label>
                                            <div className="relative">
                                                <select
                                                    value={visibility}
                                                    onChange={(e) => setVisibility(e.target.value)}
                                                    className="w-full px-4 py-3 bg-white border border-gray-200 rounded-xl text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-[#F97316]/20 focus:border-[#F97316]/40 appearance-none cursor-pointer transition-colors"
                                                >
                                                    <option value="Public">Public - Visible to all residents in the system</option>
                                                    <option value="Subdivision Only">Subdivision Only - Visible only to registered subdivision residents</option>
                                                    <option value="Barangay Only">Barangay Only - Visible only to barangay officials/responders</option>
                                                </select>
                                                <svg className="w-4 h-4 text-gray-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                                    <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                                                </svg>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Content */}
                                    <div>
                                        <label className="block text-sm font-bold text-gray-700 mb-1.5">Content</label>
                                        <textarea
                                            rows={5}
                                            value={content}
                                            onChange={(e) => setContent(e.target.value)}
                                            required
                                            placeholder="Provide all necessary details about the announcement..."
                                            className="w-full px-4 py-3 bg-[#f8f9fc] border border-gray-200 rounded-xl text-sm text-gray-700 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#F97316]/20 focus:border-[#F97316]/40 resize-none transition-colors"
                                        ></textarea>
                                    </div>

                                    {/* Media Upload — Drag & Drop Zone */}
                                    <div>
                                        <label className="block text-sm font-bold text-[#F97316] mb-2">Media Upload</label>
                                        <div
                                            className="border-2 border-dashed border-[#F97316]/30 bg-orange-50/20 rounded-xl p-6 flex flex-col items-center justify-center gap-2 cursor-pointer hover:bg-orange-50/50 hover:border-[#F97316]/50 transition-colors relative"
                                            onClick={() => document.getElementById('modal-file-input')?.click()}
                                        >
                                            <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" d="M12 16.5V9.75m0 0l3 3m-3-3l-3 3M6.75 19.5a4.5 4.5 0 01-1.41-8.775 5.25 5.25 0 0110.233-2.33 3 3 0 013.758 3.848A3.752 3.752 0 0118 19.5H6.75z" />
                                            </svg>
                                            <p className="text-sm font-bold text-gray-700">Drag and drop files here</p>
                                            <p className="text-xs text-gray-400 font-medium">Support for Images, Videos, or PDFs</p>
                                            <div className="flex items-center gap-2 mt-2">
                                                <span className="inline-flex items-center gap-1 px-3 py-1 bg-white border border-gray-200 rounded-full text-xs font-bold text-gray-600 shadow-sm">
                                                    <svg className="w-3.5 h-3.5 text-[#F97316]" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909M3.75 21h16.5A2.25 2.25 0 0022.5 18.75V5.25A2.25 2.25 0 0020.25 3H3.75A2.25 2.25 0 001.5 5.25v13.5A2.25 2.25 0 003.75 21z" /></svg>
                                                    Image
                                                </span>
                                                <span className="inline-flex items-center gap-1 px-3 py-1 bg-white border border-gray-200 rounded-full text-xs font-bold text-green-600 shadow-sm">
                                                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15.91 11.672a.375.375 0 010 .656l-5.603 3.113a.375.375 0 01-.557-.328V8.887c0-.286.307-.466.557-.327l5.603 3.112z" /></svg>
                                                    Video
                                                </span>
                                                <span className="inline-flex items-center gap-1 px-3 py-1 bg-white border border-gray-200 rounded-full text-xs font-bold text-red-500 shadow-sm">
                                                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" /></svg>
                                                    PDF
                                                </span>
                                            </div>
                                            <input
                                                id="modal-file-input"
                                                type="file"
                                                accept="image/*,video/*,.pdf"
                                                className="hidden"
                                                onChange={(e) => {
                                                    if (e.target.files) {
                                                        setMediaFiles(Array.from(e.target.files));
                                                    }
                                                }}
                                            />
                                        </div>
                                        {mediaFiles.length > 0 && (
                                            <div className="mt-2 flex items-center gap-2 text-xs text-gray-500 font-medium">
                                                <svg className="w-4 h-4 text-green-500" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" /></svg>
                                                {mediaFiles.map(f => f.name).join(', ')}
                                            </div>
                                        )}
                                    </div>

                                    {/* Pin & Expiration Row */}
                                    <div className="flex items-end justify-between gap-6 pt-1">
                                        <div className="flex items-center gap-4">
                                            <div>
                                                <p className="text-sm font-bold text-gray-700">Pin Announcement?</p>
                                                <p className="text-xs text-gray-400 font-medium">Stick to top of feed</p>
                                            </div>
                                            <label className="flex items-center gap-1.5 text-xs font-bold text-gray-700">
                                                <input type="radio" checked={pinned} onChange={() => setPinned(true)} />
                                                Yes
                                            </label>
                                            <label className="flex items-center gap-1.5 text-xs font-bold text-gray-700">
                                                <input type="radio" checked={!pinned} onChange={() => setPinned(false)} />
                                                No
                                            </label>
                                        </div>

                                        {/* Expiration */}
                                        <div>
                                            <label className="block text-sm font-bold text-gray-700 mb-1.5">Expiration (Optional)</label>
                                            <div className="relative">
                                                <input
                                                    type="date"
                                                    value={expiration}
                                                    onChange={(e) => setExpiration(e.target.value)}
                                                    placeholder="mm/dd/yyyy"
                                                    className="w-48 px-4 py-2.5 bg-white border border-gray-200 rounded-xl text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-[#F97316]/20 focus:border-[#F97316]/40 transition-colors"
                                                />
                                            </div>
                                        </div>
                                    </div>

                                    {/* Footer Buttons */}
                                    <div className="flex justify-center gap-3 pt-4 border-t border-gray-100">
                                        <button
                                            type="button"
                                            onClick={(e) => handleSubmit(e, 'Draft')}
                                            className="px-6 py-2.5 rounded-xl border border-gray-300 text-gray-600 font-bold text-sm hover:bg-gray-50 transition-colors"
                                        >
                                            Save as Draft
                                        </button>
                                        <button
                                            type="button"
                                            onClick={(e) => handleSubmit(e, 'Published')}
                                            className="px-8 py-2.5 bg-[#F97316] hover:bg-[#EA580C] hover:scale-[1.02] hover:shadow-[0_8px_20px_rgba(249,115,22,0.25)] active:scale-95 text-white rounded-xl font-bold text-sm transition-all duration-200 cursor-pointer shadow-sm"
                                        >
                                            {editAnnouncementId ? 'Save Changes' : 'Publish Announcement'}
                                        </button>
                                    </div>
                                </form>
                            </div>
                        </div>
                    )}



                    {/* Statistics Row Grid */}
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mt-1">
                        {/* TOTAL */}
                        <div className="bg-white rounded-2xl border border-blue-100 p-5 flex flex-col justify-between shadow-sm min-h-[110px] hover:border-blue-300 hover:-translate-y-1.5 hover:shadow-[0_12px_24px_rgba(59,130,246,0.08)] transition-all duration-300 ease-out group/stat relative overflow-hidden cursor-pointer">
                            <div className="absolute top-0 right-0 w-12 h-12 bg-blue-500/5 rounded-bl-full opacity-0 group-hover/stat:opacity-100 transition-opacity duration-300 pointer-events-none" />
                            <div className="flex justify-between items-start z-10">
                                <div className="flex flex-col">
                                    <span className="text-[10px] font-black uppercase text-gray-400 tracking-wider transition-colors group-hover/stat:text-blue-600">Total</span>
                                    <span className="text-3xl font-black text-gray-800 my-1 transition-transform group-hover/stat:scale-[1.02] origin-left duration-300">{announcements.length}</span>
                                </div>
                                <div className="w-9 h-9 rounded-xl bg-slate-50 text-slate-500 border border-slate-100/80 flex items-center justify-center shrink-0 group-hover/stat:bg-slate-100 group-hover/stat:text-slate-600 group-hover/stat:scale-110 group-hover/stat:rotate-6 transition-all duration-300">
                                    <svg className="w-4.5 h-4.5" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M11 5.882V19.24a1.76 1.76 0 01-3.417.592l-2.147-6.15M18 13a3 3 0 100-6M5.436 13.683A4.001 4.001 0 017 6h1.832c4.1 0 7.625-1.234 9.168-3v14c-1.543-1.766-5.067-3-9.168-3H7a3.988 3.988 0 01-1.564-.317z" />
                                    </svg>
                                </div>
                            </div>
                            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wide z-10">all time</span>
                        </div>
                        {/* ACTIVE */}
                        <div className="bg-white rounded-2xl border border-green-100 p-5 flex flex-col justify-between shadow-sm min-h-[110px] hover:border-green-300 hover:-translate-y-1.5 hover:shadow-[0_12px_24px_rgba(22,163,74,0.08)] transition-all duration-300 ease-out group/stat relative overflow-hidden cursor-pointer">
                            <div className="absolute top-0 right-0 w-12 h-12 bg-green-500/5 rounded-bl-full opacity-0 group-hover/stat:opacity-100 transition-opacity duration-300 pointer-events-none" />
                            <div className="flex justify-between items-start z-10">
                                <div className="flex flex-col">
                                    <span className="text-[10px] font-black uppercase text-gray-400 tracking-wider transition-colors group-hover/stat:text-green-600">Active</span>
                                    <span className="text-3xl font-black text-green-600 my-1 transition-transform group-hover/stat:scale-[1.02] origin-left duration-300">
                                        {announcements.filter(a => a.status === 'Published').length}
                                    </span>
                                </div>
                                <div className="w-9 h-9 rounded-xl bg-green-50 text-green-600 border border-green-100/80 flex items-center justify-center shrink-0 group-hover/stat:bg-green-100 group-hover/stat:scale-110 group-hover/stat:rotate-3 transition-all duration-300">
                                    <span className="relative flex h-4.5 w-4.5 justify-center items-center">
                                        <span className="animate-ping absolute inline-flex h-2.5 w-2.5 rounded-full bg-green-400 opacity-75"></span>
                                        <svg className="relative w-4.5 h-4.5 text-green-600" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15.536a5 5 0 001.414-1.414M12 12v.01M12 12a1 1 0 100-2 1 1 0 000 2z" />
                                        </svg>
                                    </span>
                                </div>
                            </div>
                            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wide z-10">currently live</span>
                        </div>
                        {/* PINNED */}
                        <div className="bg-white rounded-2xl border border-orange-100 p-5 flex flex-col justify-between shadow-sm min-h-[110px] hover:border-orange-300 hover:-translate-y-1.5 hover:shadow-[0_12px_24px_rgba(249,115,22,0.08)] transition-all duration-300 ease-out group/stat relative overflow-hidden cursor-pointer">
                            <div className="absolute top-0 right-0 w-12 h-12 bg-orange-500/5 rounded-bl-full opacity-0 group-hover/stat:opacity-100 transition-opacity duration-300 pointer-events-none" />
                            <div className="flex justify-between items-start z-10">
                                <div className="flex flex-col">
                                    <span className="text-[10px] font-black uppercase text-gray-400 tracking-wider transition-colors group-hover/stat:text-[#F97316]">Pinned</span>
                                    <span className="text-3xl font-black text-[#F97316] my-1 transition-transform group-hover/stat:scale-[1.02] origin-left duration-300">
                                        {announcements.filter(a => a.pinned).length}
                                    </span>
                                </div>
                                <div className="w-9 h-9 rounded-xl bg-orange-50 text-[#F97316] border border-orange-100/80 flex items-center justify-center shrink-0 group-hover/stat:bg-orange-100 group-hover/stat:scale-110 group-hover/stat:-rotate-12 transition-all duration-300">
                                    <svg className="w-4.5 h-4.5" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 17v4m-2-4h4m-8-4h12M8 13v-3a4 4 0 018 0v3H8z" />
                                    </svg>
                                </div>
                            </div>
                            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wide z-10">always on top</span>
                        </div>
                        {/* DRAFT */}
                        <div className="bg-white rounded-2xl border border-amber-100 p-5 flex flex-col justify-between shadow-sm min-h-[110px] hover:border-amber-300 hover:-translate-y-1.5 hover:shadow-[0_12px_24px_rgba(217,119,6,0.08)] transition-all duration-300 ease-out group/stat relative overflow-hidden cursor-pointer">
                            <div className="absolute top-0 right-0 w-12 h-12 bg-amber-500/5 rounded-bl-full opacity-0 group-hover/stat:opacity-100 transition-opacity duration-300 pointer-events-none" />
                            <div className="flex justify-between items-start z-10">
                                <div className="flex flex-col">
                                    <span className="text-[10px] font-black uppercase text-gray-400 tracking-wider transition-colors group-hover/stat:text-amber-600">Draft</span>
                                    <span className="text-3xl font-black text-amber-600 my-1 transition-transform group-hover/stat:scale-[1.02] origin-left duration-300">
                                        {announcements.filter(a => a.status === 'Draft').length}
                                    </span>
                                </div>
                                <div className="w-9 h-9 rounded-xl bg-amber-50 text-amber-600 border border-amber-100/80 flex items-center justify-center shrink-0 group-hover/stat:bg-amber-100 group-hover/stat:scale-110 group-hover/stat:rotate-12 transition-all duration-300">
                                    <svg className="w-4.5 h-4.5" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                    </svg>
                                </div>
                            </div>
                            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wide z-10">not published</span>
                        </div>
                    </div>

                    {/* Toolbar: Pills Filters & Search Bar */}
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-t border-gray-100 pt-5 mt-2">
                        {/* Left: Filter Pills */}
                        <div className="flex items-center gap-2">
                            {['All', 'Active', 'Draft', 'Pinned'].map((tab) => {
                                const isActive = selectedStatus === tab;
                                return (
                                    <button
                                        key={tab}
                                        type="button"
                                        onClick={() => setSelectedStatus(tab)}
                                        className={`px-4 py-2 text-xs font-black rounded-lg border transition-all uppercase tracking-wider ${isActive
                                            ? 'bg-[#F97316] text-white border-[#F97316] shadow-sm'
                                            : 'bg-white border-gray-200 text-gray-500 hover:bg-gray-50 hover:border-orange-200 hover:text-[#F97316] hover:scale-[1.02] active:scale-95 cursor-pointer'
                                            }`}
                                    >
                                        {tab}
                                    </button>
                                );
                            })}
                        </div>

                        {/* Right: Search bar & Category dropdown */}
                        <div className="flex flex-wrap items-center gap-2 flex-1 md:justify-end">
                            {/* Search bar */}
                            <div className="relative flex-1 min-w-[200px] max-w-xs">
                                <svg className="w-3.5 h-3.5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                                </svg>
                                <input
                                    type="text"
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    placeholder="Search announcements..."
                                    className="w-full pl-8 pr-3 py-2 text-xs font-bold bg-white border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#F97316]/20 focus:border-[#F97316]/40 placeholder-gray-400 transition-colors"
                                />
                            </div>

                            {/* Category dropdown */}
                            <div className="relative">
                                <select
                                    value={selectedCategory}
                                    onChange={(e) => setSelectedCategory(e.target.value)}
                                    className="appearance-none pl-3 pr-7 py-2 text-xs font-bold bg-white border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#F97316]/20 focus:border-[#F97316]/40 text-gray-700 cursor-pointer transition-colors uppercase tracking-wider"
                                >
                                    <option value="All">All Categories</option>
                                    <option value="Emergency">Emergency</option>
                                    <option value="Animal Advisory">Animal Advisory</option>
                                    <option value="Vaccination Drive">Vaccination Drive</option>
                                    <option value="Lost and Found">Lost and Found</option>
                                </select>
                                <svg className="w-3.5 h-3.5 text-gray-400 absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                                    <path d="M19 9l-7 7-7-7" strokeLinecap="round" strokeLinejoin="round" />
                                </svg>
                            </div>

                            {/* New Announcement button beside Category Dropdown */}
                            <button
                                onClick={() => { handleCloseCreateModal(); setShowCreate(true); }}
                                className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#F97316] hover:bg-[#EA580C] text-white font-black text-xs uppercase tracking-wider transition-all duration-300 hover:scale-[1.02] hover:shadow-[0_4px_12px_rgba(249,115,22,0.2)] active:scale-95 shrink-0 cursor-pointer group shadow-sm"
                            >
                                <span className="text-sm font-bold transition-transform duration-300 group-hover:rotate-90">+</span>
                                <span>New Announcement</span>
                            </button>
                        </div>
                    </div>

                    {/* Announcement Feed vertical stacked list */}
                    <div className="flex flex-col gap-4">
                        {filteredAnnouncements.length === 0 ? (
                            <div className="text-center py-16 bg-white rounded-2xl border border-gray-200 border-dashed text-gray-400 text-sm font-semibold shadow-sm">
                                No announcements found matching filters.
                            </div>
                        ) : (
                            filteredAnnouncements.map((ann) => renderUniformCard(ann))
                        )}
                    </div>

                    {/* Results count */}
                    {announcements.length > 0 && (
                        <div className="text-xs text-gray-500 font-bold border-t border-gray-100 pt-4 mt-1">
                            Showing {totalFiltered} of {announcements.length} announcement{announcements.length !== 1 ? 's' : ''}
                        </div>
                    )}

                    {/* View Full Announcement Modal */}
                    {selectedAnnouncement && (
                        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
                            <div className="bg-white w-full max-w-2xl rounded-[2.5rem] overflow-hidden border border-gray-100 shadow-2xl flex flex-col max-h-[90vh]">
                                {/* Modal Header */}
                                <div className="p-6 border-b border-gray-100 flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        <span className={`text-[10px] font-black uppercase px-2.5 py-1 rounded-full ${selectedAnnouncement.category === 'Emergency' ? 'bg-red-50 text-red-600' :
                                                selectedAnnouncement.category === 'Vaccination Drive' ? 'bg-green-50 text-green-700' :
                                                    selectedAnnouncement.category === 'Lost and Found' ? 'bg-blue-50 text-blue-700' :
                                                        'bg-violet-50 text-violet-700'
                                            }`}>
                                            {selectedAnnouncement.category}
                                        </span>
                                        {selectedAnnouncement.pinned && (
                                            <span className="text-[#dc2626] text-xs font-bold flex items-center gap-1">
                                                📌 Pinned
                                            </span>
                                        )}
                                    </div>
                                    <button
                                        onClick={() => setSelectedAnnouncement(null)}
                                        className="p-2 rounded-full hover:bg-gray-100 text-gray-400 hover:text-gray-700 transition-colors"
                                    >
                                        <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"></path>
                                        </svg>
                                    </button>
                                </div>

                                {/* Modal Body */}
                                <div className="flex-1 overflow-y-auto p-8 space-y-6 scrollbar-thin">
                                    <div>
                                        <h2 className="text-2xl font-black text-gray-900 leading-tight mb-3">
                                            {selectedAnnouncement.title}
                                        </h2>

                                        <div className="text-sm text-gray-700 space-y-1.5 mb-6 border-y border-gray-100 py-4">
                                            <p><span className="font-black">Category:</span> {selectedAnnouncement.category}</p>
                                            <p><span className="font-black">Visibility:</span> {selectedAnnouncement.visibility}</p>
                                            <p><span className="font-black">Posted By:</span> Subdivision Leader</p>
                                            <p><span className="font-black">Posted On:</span> {selectedAnnouncement.date}</p>
                                        </div>

                                        <p className="text-gray-700 text-sm leading-relaxed whitespace-pre-line font-medium">
                                            {selectedAnnouncement.content}
                                        </p>
                                    </div>

                                    <div className="border-t border-gray-100 pt-6">
                                        <h4 className="text-sm font-black text-gray-900 mb-2">Location:</h4>
                                        <p className="text-sm text-gray-700">📍 {selectedAnnouncement.location || 'Selera Homes'}</p>
                                    </div>

                                    <div className="border-t border-gray-100 pt-6">
                                        <h4 className="text-sm font-black text-gray-900 mb-3">Attached Media:</h4>
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                            {(selectedAnnouncement.attachedMedia || []).length === 0 && (
                                                <p className="text-xs text-gray-400">No attachment uploaded.</p>
                                            )}
                                            {(selectedAnnouncement.attachedMedia || []).map((media, idx) => (
                                                <div key={`${media.file_url}-${idx}`} className="border border-gray-100 rounded-xl p-3">
                                                    {media.media_type === 'Image' ? (
                                                        <img src={media.file_url} alt="Announcement attachment" className="w-full h-40 object-cover rounded-lg" />
                                                    ) : media.media_type === 'Video' ? (
                                                        <video src={media.file_url} controls className="w-full h-40 rounded-lg" />
                                                    ) : (
                                                        <a href={media.file_url} target="_blank" rel="noopener noreferrer" className="text-sm font-bold text-[#F97316] hover:underline">
                                                            PDF Preview
                                                        </a>
                                                    )}
                                                </div>
                                            ))}
                                        </div>
                                    </div>

                                    {/* Beautiful Engagement metrics and Like button inside modal positioned at the bottom of attached media */}
                                    <div className="flex flex-wrap items-center gap-4 text-xs font-bold text-gray-500 border-t border-gray-100 pt-6 mt-2">
                                        <button
                                            type="button"
                                            onClick={() => handleLike(selectedAnnouncement.id)}
                                            className="flex items-center gap-2 hover:text-[#F97316] hover:bg-orange-50/50 px-4 py-2 rounded-full border border-gray-150 bg-white transition-all cursor-pointer shadow-sm active:scale-95"
                                        >
                                            <svg className={`w-4 h-4 ${selectedAnnouncement.hasLiked ? 'text-[#F97316] fill-[#F97316]' : 'text-gray-400'}`} fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" d="M14 9V5a3 3 0 00-3-3l-4 9v11h11.28a2 2 0 002-1.7l1.38-9a2 2 0 00-2-2.3zM7 22H4a2 2 0 01-2-2v-7a2 2 0 012-2h3" />
                                            </svg>
                                            <span className={selectedAnnouncement.hasLiked ? 'text-[#F97316]' : ''}>
                                                {selectedAnnouncement.reactions} Likes
                                            </span>
                                        </button>
                                        <span className="flex items-center gap-2 bg-gray-50 px-4 py-2 rounded-full border border-gray-150">
                                            <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                                            </svg>
                                            <span>{selectedAnnouncement.comments.length} Comments</span>
                                        </span>
                                        <span className="flex items-center gap-2 bg-gray-50 px-4 py-2 rounded-full border border-gray-150">
                                            <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                                <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                                            </svg>
                                            <span>{selectedAnnouncement.views || 0} Views</span>
                                        </span>
                                    </div>

                                    {/* Comments Section */}
                                    <div className="border-t border-gray-100 pt-6">
                                        <h3 className="text-sm font-black text-gray-950 mb-4 flex items-center gap-2">
                                            <span>💬</span> Comments ({selectedAnnouncement.comments.length})
                                        </h3>

                                        {/* Comments List */}
                                        <div className="space-y-4 mb-6">
                                            {selectedAnnouncement.comments.length === 0 ? (
                                                <p className="text-xs text-gray-400 italic">No comments yet. Be the first to comment!</p>
                                            ) : (
                                                selectedAnnouncement.comments.map((comment, i) => (
                                                    <div key={i} className="flex gap-3 items-start bg-gray-50/50 p-3 rounded-2xl border border-gray-100">
                                                        <div className="w-8 h-8 rounded-full bg-orange-50 text-[#F97316] flex items-center justify-center text-xs font-black shrink-0">
                                                            {(comment.author || 'Resident').charAt(0).toUpperCase()}
                                                        </div>
                                                        <div>
                                                            <div className="text-xs font-bold text-gray-800">{comment.author || 'Resident'}</div>
                                                            <div className="text-xs text-gray-600 mt-1 font-medium">{comment.text}</div>
                                                        </div>
                                                    </div>
                                                ))
                                            )}
                                        </div>

                                        {/* Add Comment Input */}
                                        <form
                                            onSubmit={(e) => {
                                                e.preventDefault();
                                                if (!newCommentText.trim()) return;
                                                handleAddComment(selectedAnnouncement.id, newCommentText);
                                                setNewCommentText('');
                                            }}
                                            className="flex gap-3 items-center"
                                        >
                                            <div className="w-8 h-8 rounded-full bg-gray-100 text-gray-500 flex items-center justify-center text-xs font-black shrink-0">
                                                SL
                                            </div>
                                            <input
                                                type="text"
                                                placeholder="Write a comment..."
                                                value={newCommentText}
                                                onChange={(e) => setNewCommentText(e.target.value)}
                                                className="flex-1 px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-[#F97316]/20"
                                            />
                                            <button
                                                type="submit"
                                                className="bg-[#F97316] hover:bg-[#EA580C] text-white font-black text-xs px-4 py-2.5 rounded-xl transition-colors shrink-0 cursor-pointer hover:scale-[1.02] active:scale-95"
                                            >
                                                Post
                                            </button>
                                        </form>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </main>
        </div>
    );
};

export default SubdHazardAlert;
