import { useEffect, useState } from 'react';
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
}

const SubdHazardAlert = () => {
    const userStr = localStorage.getItem('staff_user') || sessionStorage.getItem('staff_user');
    const currentUser = userStr ? JSON.parse(userStr) : null;
    // New state for Announcement/Broadcast module
    const [showCreate, setShowCreate] = useState(false);
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
    const [selectedAnnouncement, setSelectedAnnouncement] = useState<Announcement | null>(null);
    const [newCommentText, setNewCommentText] = useState('');

    const categories = ['All', 'Emergency', 'Animal Advisory', 'Vaccination Drive', 'Lost and Found'];

    const [announcements, setAnnouncements] = useState<Announcement[]>([]);

    const formatPostedDate = (raw: string) => {
        const dt = new Date(raw);
        if (Number.isNaN(dt.getTime())) return raw;
        return dt.toLocaleDateString('en-US') + ' • ' + dt.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    };

    const mapApiAnnouncement = (item: any): Announcement => {
        const imageMedia = item.media?.find((m: any) => m.media_type === 'Image');
        const mediaUrl = imageMedia?.file_url || item.media?.[0]?.file_url || undefined;
        const dateObj = item.posted_on ? new Date(item.posted_on) : null;
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
            dateDay: dateObj ? String(dateObj.getDate()).padStart(2, '0') : undefined,
            dateMonth: dateObj ? dateObj.toLocaleDateString('en-US', { month: 'short' }).toUpperCase() : undefined,
            attachedMedia: item.media || []
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

    const filteredAnnouncements = announcements.filter(ann => {
        if (selectedCategory === 'All') return true;
        return ann.category.toLowerCase() === selectedCategory.toLowerCase();
    });

    const pinnedAnnouncements = filteredAnnouncements.filter(ann => ann.pinned);
    const normalAnnouncements = filteredAnnouncements.filter(ann => !ann.pinned);

    // Group remaining into left and right columns
    const leftColAnnouncements: Announcement[] = [];
    const rightColAnnouncements: Announcement[] = [];

    normalAnnouncements.forEach((ann, index) => {
        if (ann.category === 'Vaccination Drive') {
            rightColAnnouncements.push(ann);
        } else if (ann.category === 'Lost and Found' || ann.category === 'Animal Advisory') {
            leftColAnnouncements.push(ann);
        } else {
            if (index % 2 === 0) {
                leftColAnnouncements.push(ann);
            } else {
                rightColAnnouncements.push(ann);
            }
        }
    });

    const renderNormalCard = (ann: Announcement) => {
        if (ann.category === 'Lost and Found') {
            return (
                <div key={ann.id} className="bg-white rounded-3xl p-6 border border-gray-100 shadow-sm hover:shadow-md transition-shadow flex flex-col justify-between h-full min-h-[300px]">
                    <div>
                        <div className="flex items-center justify-between mb-3">
                            <span className="bg-[#e8f0fe] text-[#1a73e8] text-[10px] font-black uppercase px-2.5 py-1 rounded-full">
                                Lost & Found
                            </span>
                            <span className="text-[10px] font-bold text-gray-400">{ann.date}</span>
                        </div>
                        <h3 className="text-base font-extrabold text-gray-900 mb-1">{ann.title}</h3>
                        <p className="text-gray-500 text-xs font-semibold leading-relaxed mb-4 line-clamp-3">{ann.content}</p>
                        {ann.mediaUrl && (
                            <img src={ann.mediaUrl} alt={ann.title} className="w-full h-44 object-cover rounded-2xl mb-4 border border-gray-50 shadow-sm" />
                        )}
                    </div>
                    <div className="flex items-center justify-between border-t border-gray-100 pt-3.5 mt-auto">
                        <button
                            onClick={() => handleLike(ann.id)}
                            className="flex items-center gap-1.5 text-xs font-bold text-gray-500 hover:text-[#F97316] transition-colors"
                        >
                            <svg className={`w-4 h-4 ${ann.hasLiked ? 'text-[#F97316]' : 'text-gray-400'}`} fill={ann.hasLiked ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M14 10h4.764a2 2 0 011.789 2.894l-3.5 7A2 2 0 0115.263 21h-4.017c-.163 0-.326-.02-.485-.06L7 20m7-10V5a2 2 0 00-2-2h-.095c-.5 0-.905.405-.905.905 0 .714-.211 1.412-.608 2.006L7 11v9m7-10h-2M7 20H5a2 2 0 01-2-2v-6a2 2 0 012-2h2.5"></path>
                            </svg>
                            <span>{ann.reactions}</span>
                        </button>
                        <button
                            onClick={() => handleOpenFull(ann)}
                            className="text-xs font-black text-[#0B57D0] hover:text-[#0045b5] transition-colors"
                        >
                            {ann.actionText || 'Contact Finder'}
                        </button>
                    </div>
                </div>
            );
        } else if (ann.category === 'Vaccination Drive') {
            return (
                <div key={ann.id} className="bg-white rounded-3xl p-5 border border-gray-100 shadow-sm hover:shadow-md transition-shadow flex flex-col gap-0">
                    <div className="flex flex-row gap-4 justify-between items-stretch">
                        <div className="flex-1 flex flex-col justify-between min-w-0">
                            <div>
                                <div className="flex items-center justify-between mb-2">
                                    <span className="bg-[#e6f4ea] text-[#137333] text-[10px] font-black uppercase px-2.5 py-1 rounded-full">
                                        Vaccination Drive
                                    </span>
                                    <span className="text-[10px] font-bold text-gray-400">{ann.date}</span>
                                </div>
                                <h3 className="text-sm font-extrabold text-gray-900 mb-1 leading-tight">{ann.title}</h3>
                                <p className="text-gray-500 text-xs font-semibold leading-relaxed line-clamp-2">{ann.content}</p>
                            </div>
                            {/* Date Block & Location info */}
                            <div className="flex items-center gap-3 border-t border-gray-100 pt-3 mt-3">
                                <div className="bg-[#f0f4f9] rounded-xl p-2 flex flex-col items-center justify-center min-w-[44px] border border-gray-100">
                                    {ann.dateDay && <span className="text-base font-black text-[#0B57D0] leading-none">{ann.dateDay}</span>}
                                    {ann.dateMonth && <span className="text-[7px] font-bold text-gray-500 uppercase tracking-wider mt-0.5">{ann.dateMonth}</span>}
                                </div>
                                <div>
                                    {ann.location && <div className="text-xs font-black text-gray-800">{ann.location}</div>}
                                    {ann.extraDetails && <div className="text-[10px] font-bold text-gray-400 mt-0.5">{ann.extraDetails}</div>}
                                </div>
                            </div>
                        </div>
                        {ann.mediaUrl && (
                            <img src={ann.mediaUrl} alt={ann.title} className="w-36 max-h-[220px] object-cover rounded-2xl border border-gray-50 shadow-sm shrink-0" />
                        )}
                    </div>
                    {/* Engagement Row: Likes, Comments, Views */}
                    <div className="border-t border-gray-100 pt-3 mt-3 flex flex-wrap items-center gap-5 text-xs font-semibold text-gray-500">
                        <button
                            onClick={() => handleLike(ann.id)}
                            className={`flex items-center gap-1.5 transition-colors ${ann.hasLiked ? 'text-[#137333]' : 'hover:text-[#137333]'}`}
                        >
                            <svg className={`w-4 h-4 ${ann.hasLiked ? 'text-[#137333]' : 'text-gray-400'}`} fill={ann.hasLiked ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M14 10h4.764a2 2 0 011.789 2.894l-3.5 7A2 2 0 0115.263 21h-4.017c-.163 0-.326-.02-.485-.06L7 20m7-10V5a2 2 0 00-2-2h-.095c-.5 0-.905.405-.905.905 0 .714-.211 1.412-.608 2.006L7 11v9m7-10h-2M7 20H5a2 2 0 01-2-2v-6a2 2 0 012-2h2.5"></path>
                            </svg>
                            <span>{ann.reactions} {ann.reactions === 1 ? 'Like' : 'Likes'}</span>
                        </button>
                        <button
                            onClick={() => handleOpenFull(ann)}
                            className="flex items-center gap-1.5 hover:text-[#0B57D0] transition-colors"
                        >
                            <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"></path>
                            </svg>
                            <span>{ann.comments.length} {ann.comments.length === 1 ? 'Comment' : 'Comments'}</span>
                        </button>
                        <span className="flex items-center gap-1.5">
                            <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"></path>
                            </svg>
                            <span>{ann.views} Views</span>
                        </span>
                    </div>
                </div>
            );
        } else {
            // default / Animal Advisory layout
            const isEmergency = ann.category === 'Emergency';
            const badgeBg = isEmergency ? 'bg-[#fce8e6] text-[#c5221f]' : 'bg-[#f0f4ff] text-[#4f46e5]';
            const badgeLabel = isEmergency ? 'Emergency' : ann.category;
            return (
                <div key={ann.id} className="bg-white rounded-3xl p-6 border border-gray-100 shadow-sm hover:shadow-md transition-shadow flex flex-col justify-between h-full min-h-[220px]">
                    <div>
                        <div className="flex items-center justify-between mb-3">
                            <span className={`text-[10px] font-black uppercase px-2.5 py-1 rounded-full ${badgeBg}`}>
                                {badgeLabel}
                            </span>
                            <span className="text-[10px] font-bold text-gray-400">{ann.date}</span>
                        </div>
                        <h3 className="text-base font-extrabold text-gray-900 mb-1">{ann.title}</h3>
                        <p className="text-gray-500 text-xs font-semibold leading-relaxed mb-4 line-clamp-3">{ann.content}</p>
                    </div>
                    {ann.mediaUrl && (
                        <img src={ann.mediaUrl} alt={ann.title} className="w-full h-40 object-cover rounded-2xl mb-4 border border-gray-50 shadow-sm" />
                    )}
                    {isEmergency && (
                        <button
                            onClick={() => handleOpenFull(ann)}
                            className="w-full mt-auto border border-[#0B57D0] hover:bg-[#eaf1fb] text-[#0B57D0] font-black text-xs py-2.5 rounded-xl text-center transition-colors"
                        >
                            View Full Announcement
                        </button>
                    )}
                </div>
            );
        }
    };

    return (
        <div className="min-h-screen w-full flex bg-[#FDFDFD] font-sans text-gray-800 relative overflow-hidden">
            {/* Decorative Background Elements */}
            <div className="absolute top-0 left-0 w-[600px] h-[600px] bg-[#B35D25]/5 rounded-full blur-[100px] pointer-events-none -translate-x-1/2 -translate-y-1/2 z-0"></div>
            <div className="absolute bottom-0 right-0 w-[800px] h-[800px] bg-orange-50/50 rounded-full blur-[120px] pointer-events-none translate-x-1/3 translate-y-1/3 z-0"></div>

            {/* Sidebar */}
            <div className="z-10 flex shrink-0">
                <SubdSidebar />
            </div>

            {/* Main Content */}
            <main className="flex-1 flex flex-col h-screen overflow-hidden">
                {/* Navbar */}
                <SubdNavbar />

                {/* Scrollable Content Area */}
                <div className="flex-1 overflow-y-auto p-10 flex flex-col gap-8 scrollbar-thin scrollbar-thumb-gray-200 scrollbar-track-transparent relative z-10">


                    {/* Create Announcement Modal */}
                    {showCreate && (
                        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm" onClick={() => setShowCreate(false)}>
                            <div
                                className="bg-white rounded-2xl shadow-2xl w-full max-w-[560px] max-h-[90vh] overflow-y-auto relative animate-[fadeInUp_0.25s_ease-out]"
                                onClick={(e) => e.stopPropagation()}
                            >
                                {/* Modal Header */}
                                <div className="px-8 pt-8 pb-4 border-b border-gray-100">
                                    <div className="flex items-start justify-between">
                                        <div>
                                            <h2 className="text-2xl font-black text-gray-900 tracking-tight">Create Community Announcement</h2>
                                            <p className="text-sm text-gray-400 mt-1 font-medium">Draft and publish important updates for your neighbors. Choose the right category to ensure proper visibility.</p>
                                        </div>
                                        <button
                                            onClick={() => setShowCreate(false)}
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
                                    onSubmit={async (e) => {
                                        e.preventDefault();
                                        if (!currentUser?.user_id) return;
                                        try {
                                            const created = await axios.post('http://localhost:8000/announcements/', {
                                                created_by: currentUser.user_id,
                                                title,
                                                category,
                                                visibility,
                                                content,
                                                pinned,
                                                expiration: expiration ? new Date(expiration).toISOString() : null,
                                                location: location || null,
                                                subdivision_id: currentUser.subdivision_id || null
                                            });

                                            const announcementId = created.data.announcement_id;
                                            for (const file of mediaFiles) {
                                                const fd = new FormData();
                                                fd.append('file', file);
                                                await axios.post(`http://localhost:8000/announcements/${announcementId}/media`, fd, {
                                                    headers: { 'Content-Type': 'multipart/form-data' }
                                                });
                                            }

                                            await fetchAnnouncements();
                                            setShowCreate(false);
                                            setTitle('');
                                            setContent('');
                                            setLocation('');
                                            setPinned(false);
                                            setExpiration('');
                                            setMediaFiles([]);
                                        } catch (err) {
                                            console.error('Failed to publish announcement:', err);
                                            alert('Failed to publish announcement.');
                                        }
                                    }}
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
                                            className="w-full px-4 py-3 bg-white border border-gray-200 rounded-xl text-sm text-gray-700 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#0B57D0]/20 focus:border-[#0B57D0]/40 transition-colors"
                                        />
                                        <p className="text-xs text-[#0B57D0] mt-1 font-semibold italic">Make it concise and descriptive.</p>
                                    </div>

                                    {/* Category & Visibility */}
                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <label className="block text-sm font-bold text-gray-700 mb-1.5">Category</label>
                                            <div className="relative">
                                                <select
                                                    value={category}
                                                    onChange={(e) => setCategory(e.target.value)}
                                                    className="w-full px-4 py-3 bg-white border border-gray-200 rounded-xl text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-[#0B57D0]/20 focus:border-[#0B57D0]/40 appearance-none cursor-pointer transition-colors"
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
                                                    className="w-full px-4 py-3 bg-white border border-gray-200 rounded-xl text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-[#0B57D0]/20 focus:border-[#0B57D0]/40 appearance-none cursor-pointer transition-colors"
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
                                            className="w-full px-4 py-3 bg-[#f8f9fc] border border-gray-200 rounded-xl text-sm text-gray-700 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#0B57D0]/20 focus:border-[#0B57D0]/40 resize-none transition-colors"
                                        ></textarea>
                                    </div>

                                    {/* Media Upload — Drag & Drop Zone */}
                                    <div>
                                        <label className="block text-sm font-bold text-[#0B57D0] mb-2">Media Upload</label>
                                        <div
                                            className="border-2 border-dashed border-[#0B57D0]/30 bg-[#f0f4ff]/50 rounded-xl p-6 flex flex-col items-center justify-center gap-2 cursor-pointer hover:bg-[#e8f0fe] hover:border-[#0B57D0]/50 transition-colors relative"
                                            onClick={() => document.getElementById('modal-file-input')?.click()}
                                        >
                                            <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" d="M12 16.5V9.75m0 0l3 3m-3-3l-3 3M6.75 19.5a4.5 4.5 0 01-1.41-8.775 5.25 5.25 0 0110.233-2.33 3 3 0 013.758 3.848A3.752 3.752 0 0118 19.5H6.75z" />
                                            </svg>
                                            <p className="text-sm font-bold text-gray-700">Drag and drop files here</p>
                                            <p className="text-xs text-gray-400 font-medium">Support for Images, Videos, or PDFs</p>
                                            <div className="flex items-center gap-2 mt-2">
                                                <span className="inline-flex items-center gap-1 px-3 py-1 bg-white border border-gray-200 rounded-full text-xs font-bold text-gray-600 shadow-sm">
                                                    <svg className="w-3.5 h-3.5 text-[#0B57D0]" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909M3.75 21h16.5A2.25 2.25 0 0022.5 18.75V5.25A2.25 2.25 0 0020.25 3H3.75A2.25 2.25 0 001.5 5.25v13.5A2.25 2.25 0 003.75 21z" /></svg>
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
                                                    className="w-48 px-4 py-2.5 bg-white border border-gray-200 rounded-xl text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-[#0B57D0]/20 focus:border-[#0B57D0]/40 transition-colors"
                                                />
                                            </div>
                                        </div>
                                    </div>

                                    {/* Footer Buttons */}
                                    <div className="flex justify-center gap-3 pt-4 border-t border-gray-100">
                                        <button
                                            type="button"
                                            onClick={() => setShowCreate(false)}
                                            className="px-6 py-2.5 rounded-xl border border-gray-300 text-gray-600 font-bold text-sm hover:bg-gray-50 transition-colors"
                                        >
                                            Save as Draft
                                        </button>
                                        <button
                                            type="submit"
                                            className="px-8 py-2.5 bg-[#c5221f] hover:bg-[#a51d1a] text-white rounded-xl font-bold text-sm transition-colors shadow-sm"
                                        >
                                            Publish Announcement
                                        </button>
                                    </div>
                                </form>
                            </div>
                        </div>
                    )}

                    {/* Filters & Sorting */}
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mt-2">
                        <div className="flex flex-wrap gap-2">
                            {categories.map((cat) => {
                                const isActive = selectedCategory === cat;
                                return (
                                    <button
                                        key={cat}
                                        onClick={() => setSelectedCategory(cat)}
                                        className={`px-4 py-2 rounded-full text-xs font-bold transition-all ${isActive
                                            ? 'bg-[#0B57D0] text-white shadow-sm'
                                            : 'bg-[#eaf1fb] text-[#001d35] hover:bg-[#dce6f5]'
                                            }`}
                                    >
                                        {cat}
                                    </button>
                                );
                            })}
                        </div>

                        {/* Sort & Create — right side of filter row */}
                        <div className="flex items-center gap-3 self-end md:self-auto">
                            {/* Sort dropdown */}
                            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-200 bg-white text-xs font-semibold text-gray-700 shadow-sm cursor-pointer hover:bg-gray-50 transition-colors">
                                <span>Sort: <strong className="text-gray-900">Newest</strong></span>
                                <svg className="w-3 h-3 text-gray-500" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                                    <path d="M19 9l-7 7-7-7" strokeLinecap="round" strokeLinejoin="round"></path>
                                </svg>
                            </div>

                            {/* Create Announcement Button */}
                            <button
                                onClick={() => setShowCreate(!showCreate)}
                                className="flex items-center gap-2 px-5 py-2 rounded-xl bg-[#0B57D0] hover:bg-[#0045b5] text-white font-black text-xs uppercase tracking-wider transition-colors shadow-sm whitespace-nowrap"
                            >
                                + Create Announcement
                            </button>
                        </div>
                    </div>

                    {/* Pinned Announcements */}
                    {pinnedAnnouncements.map((ann) => (
                        <div
                            key={ann.id}
                            className="bg-white rounded-2xl p-6 border border-[#c5221f] border-l-[6px] shadow-sm relative overflow-hidden flex flex-col md:flex-row gap-6 justify-between transition-shadow hover:shadow-md shrink-0"
                        >
                            {/* Left Side: Content */}
                            <div className="flex-1 flex flex-col justify-between">
                                <div>
                                    {/* Top Row Badges & Meta */}
                                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
                                        <div className="flex items-center gap-2">
                                            <span className="bg-[#c5221f] text-white text-[10px] font-black uppercase px-3 py-1 rounded-full flex items-center gap-1.5">
                                                <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                                                    <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                                                </svg>
                                                Emergency
                                            </span>
                                            <span className="text-gray-500 text-xs font-semibold flex items-center gap-1.5">
                                                <svg className="w-3.5 h-3.5 text-[#c5221f]" fill="currentColor" viewBox="0 0 20 20">
                                                    <path d="M10 2a1 1 0 011 1v1.171l1.646-1.647a1 1 0 011.414 1.414L12.414 5.6H15a1 1 0 110 2h-1.646l2.122 2.121a1 1 0 11-1.414 1.414L11.94 9.013V15.6a1 1 0 11-2 0V9.013L7.818 11.15a1 1 0 11-1.414-1.414l2.122-2.121H5.1a1 1 0 110-2h2.586L6.038 3.938a1 1 0 011.414-1.414L9.1 4.171V3a1 1 0 011-1z" />
                                                </svg>
                                                Pinned Announcement
                                            </span>
                                        </div>

                                        <div className="flex items-center gap-4 text-xs font-medium text-gray-500">
                                            {ann.location && (
                                                <span className="flex items-center gap-1.5">
                                                    <svg className="w-3.5 h-3.5 text-gray-400" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                                                        <path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"></path>
                                                        <path strokeLinecap="round" strokeLinejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"></path>
                                                    </svg>
                                                    {ann.location}
                                                </span>
                                            )}
                                            <span className="flex items-center gap-1.5">
                                                <svg className="w-3.5 h-3.5 text-gray-400" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                                                </svg>
                                                {ann.date}
                                            </span>
                                        </div>
                                    </div>

                                    {/* Title & Body */}
                                    <h2 className="text-[19px] font-bold text-[#c5221f] mb-2 leading-tight">
                                        {ann.title}
                                    </h2>
                                    <p className="text-[#3c4043] text-[13px] leading-relaxed mb-6 font-medium whitespace-pre-line">
                                        {ann.content}
                                    </p>
                                </div>

                                {/* Engagement & View Action */}
                                <div className="border-t border-gray-100 pt-4 flex flex-wrap items-center gap-6 text-xs font-semibold text-gray-500 mt-auto">
                                    <button
                                        onClick={() => handleLike(ann.id)}
                                        className="flex items-center gap-1.5 hover:text-blue-600 transition-colors"
                                    >
                                        <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M14 9V5a3 3 0 00-3-3l-4 9v11h11.28a2 2 0 002-1.7l1.38-9a2 2 0 00-2-2.3zM7 22H4a2 2 0 01-2-2v-7a2 2 0 012-2h3"></path>
                                        </svg>
                                        <span>{ann.reactions} Reactions</span>
                                    </button>
                                    <button
                                        onClick={() => handleOpenFull(ann)}
                                        className="flex items-center gap-1.5 hover:text-blue-600 transition-colors"
                                    >
                                        <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"></path>
                                        </svg>
                                        <span>{ann.comments.length} Comments</span>
                                    </button>
                                    <span className="flex items-center gap-1.5">
                                        <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path>
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"></path>
                                        </svg>
                                        <span>{ann.views} Views</span>
                                    </span>
                                </div>
                            </div>

                            {/* Right Side: Image and Button */}
                            <div className="w-full md:w-64 flex flex-col justify-between gap-4 shrink-0">
                                {ann.mediaUrl ? (
                                    <img
                                        src={ann.mediaUrl}
                                        alt={ann.title}
                                        className="w-full h-36 object-cover rounded-xl border border-gray-100 shadow-sm"
                                    />
                                ) : (
                                    <div className="w-full h-36 bg-gray-50 border border-gray-100 rounded-xl flex items-center justify-center text-gray-400 text-sm">
                                        No Image Provided
                                    </div>
                                )}
                                <button
                                    onClick={() => handleOpenFull(ann)}
                                    className="w-full bg-[#c5221f] hover:bg-[#a61919] text-white font-extrabold text-[13px] py-3.5 px-4 rounded-xl flex items-center justify-between transition-colors shadow-sm mt-3"
                                >
                                    <span>View Full Announcement</span>
                                    <span className="text-lg font-black leading-none">→</span>
                                </button>
                            </div>
                        </div>
                    ))}

                    {/* Community Feed Grid */}
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 shrink-0">
                        {/* Left Column: Lost & Found / Animal Advisory */}
                        <div className="flex flex-col gap-6">
                            {leftColAnnouncements.map((ann) => renderNormalCard(ann))}
                        </div>

                        {/* Right Columns: Vaccination Drive / Double Span Cards */}
                        <div className="lg:col-span-2 flex flex-col gap-6">
                            {rightColAnnouncements.map((ann) => renderNormalCard(ann))}
                        </div>
                    </div>

                    {/* View Full Announcement Modal */}
                    {selectedAnnouncement && (
                        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
                            <div className="bg-white w-full max-w-2xl rounded-[2.5rem] overflow-hidden border border-gray-100 shadow-2xl flex flex-col max-h-[90vh]">
                                {/* Modal Header */}
                                <div className="p-6 border-b border-gray-100 flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        <span className={`text-[10px] font-black uppercase px-2.5 py-1 rounded-full ${selectedAnnouncement.category === 'Emergency' ? 'bg-[#fce8e6] text-[#c5221f]' : 'bg-[#eaf1fb] text-[#0b57d0]'
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
                                                        <a href={media.file_url} target="_blank" rel="noopener noreferrer" className="text-sm font-bold text-[#0B57D0] hover:underline">
                                                            PDF Preview
                                                        </a>
                                                    )}
                                                </div>
                                            ))}
                                        </div>
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
                                                        <div className="w-8 h-8 rounded-full bg-[#0B57D0]/10 text-[#0B57D0] flex items-center justify-center text-xs font-black shrink-0">
                                                            {comment.author.charAt(0).toUpperCase()}
                                                        </div>
                                                        <div>
                                                            <div className="text-xs font-bold text-gray-800">{comment.author}</div>
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
                                                className="flex-1 px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-[#0B57D0]/20"
                                            />
                                            <button
                                                type="submit"
                                                className="bg-[#0B57D0] hover:bg-[#0045b5] text-white font-black text-xs px-4 py-2.5 rounded-xl transition-colors shrink-0"
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
