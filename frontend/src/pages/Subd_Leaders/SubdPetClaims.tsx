import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { DEFAULT_PET_AVATAR, getPetPicture } from '../../utils/avatar';
import SubdSidebar from '../../components/SubdSidebar';
import SubdNavbar from '../../components/Navbars/SubdNavbar';
import MapComponent from '../../components/MapComponent';
import Button from '../../components/Button';
import Select from '../../components/Dropdown';
import { getCachedData, setCachedData } from '../../utils/cache';

// ─── Helpers ─────────────────────────────────────────────────────────────────
const getStatusStyles = (status: string) => {
    switch (status) {
        case 'Handover Complete':
        case 'Pet Received': return 'bg-emerald-100 border-emerald-300 text-emerald-800 font-bold';
        case 'Approved': return 'bg-green-50 border-green-200 text-green-700';
        case 'Rejected': return 'bg-red-50 border-red-200 text-red-600';
        case 'Evidence Requested': return 'bg-blue-50 border-blue-200 text-blue-600';
        case 'Under Review':
        case 'Pending Review': return 'bg-amber-50 border-amber-200 text-amber-600';
        default: return 'bg-orange-50 border-orange-200 text-[#F97316]';
    }
};

const getInitials = (name: string) => {
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
};

const avatarColors = ['bg-violet-100 text-violet-600', 'bg-pink-100 text-pink-600', 'bg-sky-100 text-sky-700', 'bg-teal-100 text-teal-600', 'bg-amber-100 text-amber-700'];
const getAvatarColor = (name: string) => avatarColors[name.charCodeAt(0) % avatarColors.length];

const docColors: Record<string, string> = {
    blue: 'text-blue-500',
    green: 'text-green-500',
    orange: 'text-[#F97316]',
};

// ─── Component ────────────────────────────────────────────────────────────────
const SubdPetClaims = () => {
    const navigate = useNavigate();

    const [claims, setClaims] = useState<any[]>(() => getCachedData<any[]>('subd_pet_claims') || []);
    const [selectedClaim, setSelectedClaim] = useState<any>(null);
    const [remarks, setRemarks] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [statusFilter, setStatusFilter] = useState('All Claims');
    const [searchQuery, setSearchQuery] = useState('');
    const [viewMode, setViewMode] = useState<'list' | 'review'>('list');
    const [roadDistance, setRoadDistance] = useState<number | null>(null);
    const [lightboxImage, setLightboxImage] = useState<string | null>(null);
    const [openKebab, setOpenKebab] = useState<number | null>(null);
    const kebabRef = useRef<HTMLDivElement>(null);
    const [viewReportAddress, setViewReportAddress] = useState('');
    const [isViewReportAddressLoading, setIsViewReportAddressLoading] = useState(false);

    useEffect(() => {
        setRoadDistance(null);
        if (!selectedClaim || !selectedClaim.sighting_lat || !selectedClaim.sighting_lng) {
            setViewReportAddress('');
            return;
        }

        const fetchAddress = async () => {
            setIsViewReportAddressLoading(true);
            try {
                const response = await axios.get('https://nominatim.openstreetmap.org/reverse', {
                    params: {
                        format: 'jsonv2',
                        lat: selectedClaim.sighting_lat,
                        lon: selectedClaim.sighting_lng,
                        addressdetails: 1
                    }
                });
                if (response.data && response.data.address) {
                    const addr = response.data.address;
                    const parts = [];
                    const road = addr.road || addr.pedestrian || addr.path || '';
                    if (road) parts.push(road);
                    const neighbourhood = addr.neighbourhood || addr.village || addr.suburb || '';
                    if (neighbourhood && neighbourhood !== road) {
                        parts.push(neighbourhood);
                    }
                    const city = addr.city || addr.town || addr.municipality || '';
                    if (city) parts.push(city);

                    const addressStr = parts.join(', ') || response.data.display_name;
                    setViewReportAddress(addressStr);
                } else {
                    setViewReportAddress(`${selectedClaim.sighting_lat.toFixed(6)}, ${selectedClaim.sighting_lng.toFixed(6)}`);
                }
            } catch (err) {
                console.error('Error fetching street address:', err);
                setViewReportAddress(`${selectedClaim.sighting_lat.toFixed(6)}, ${selectedClaim.sighting_lng.toFixed(6)}`);
            } finally {
                setIsViewReportAddressLoading(false);
            }
        };

        fetchAddress();
    }, [selectedClaim?.claim_id]);

    const staffUserStr = localStorage.getItem('staff_user') || sessionStorage.getItem('staff_user');
    const staffUser = staffUserStr ? JSON.parse(staffUserStr) : null;

    useEffect(() => {
        if (!staffUser) {
            navigate('/staff/login');
            return;
        }
        fetchBackendClaims();
    }, []);

    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (kebabRef.current && !kebabRef.current.contains(e.target as Node)) {
                setOpenKebab(null);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const calculateHaversine = (lat1: number, lon1: number, lat2: number, lon2: number) => {
        const R = 6371e3;
        const q1 = lat1 * Math.PI/180;
        const q2 = lat2 * Math.PI/180;
        const dq = (lat2-lat1) * Math.PI/180;
        const dl = (lon2-lon1) * Math.PI/180;
        const a = Math.sin(dq/2) * Math.sin(dq/2) +
                  Math.cos(q1) * Math.cos(q2) *
                  Math.sin(dl/2) * Math.sin(dl/2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
        return R * c; // meters
    };

    const transformClaim = (bc: any) => {
        const sightingLat = bc.report?.latitude ? parseFloat(bc.report.latitude) : 14.8018;
        const sightingLng = bc.report?.longitude ? parseFloat(bc.report.longitude) : 121.0035;

        const rawPetLat = bc.pet?.registered_latitude ?? bc.pet?.owner?.latitude ?? bc.claimant?.latitude ?? null;
        const rawPetLng = bc.pet?.registered_longitude ?? bc.pet?.owner?.longitude ?? bc.claimant?.longitude ?? null;

        const petLat = rawPetLat !== null ? parseFloat(rawPetLat) : (sightingLat - 0.0004);
        const petLng = rawPetLng !== null ? parseFloat(rawPetLng) : (sightingLng - 0.0003);

        const computedMeters = calculateHaversine(sightingLat, sightingLng, petLat, petLng);

        return {
            report: bc.report,
            claim_id: bc.claim_id,
            report_id: bc.report_id,
            pet_id: bc.pet_id,
            status: bc.status,
            remarks: bc.remarks || '',
            similarity_score: (() => {
                if (bc.match_score !== undefined && bc.match_score !== null) {
                    return bc.match_score;
                }
                if (bc.similarity_score !== undefined && bc.similarity_score !== null) {
                    return bc.similarity_score;
                }
                const match = bc.remarks?.match(/AI detected a (\d+)% potential match/i);
                return match ? parseInt(match[1]) : 90;
            })(),
            reported_date: bc.report?.created_at ? new Date(bc.report.created_at).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : 'June 6, 2026',
            claim_date: bc.created_at ? new Date(bc.created_at).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : 'June 6, 2026',
            claim_time: bc.created_at ? new Date(bc.created_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) : '10:25 AM',
            sighting_location: bc.report?.landmark || 'Selera Homes',
            sighting_lat: sightingLat,
            sighting_lng: sightingLng,
            description: bc.report?.description || 'Roaming stray animal',
            sighting_photo: bc.report?.media?.[0]?.file_url || '',
            pet: {
                pet_name: bc.pet?.pet_name || 'Unknown',
                pet_type: bc.pet?.pet_type || 'Dog',
                breed: bc.pet?.breed || 'Unknown',
                gender: bc.pet?.gender || 'Unknown',
                primary_color: bc.pet?.primary_color || 'Brown',
                secondary_color: bc.pet?.secondary_color || '',
                tertiary_color: bc.pet?.tertiary_color || '',
                distinctive_markings: bc.pet?.distinctive_markings || bc.pet?.color_markings || '',
                registered_address: bc.pet?.registered_address || bc.pet?.owner?.address || bc.claimant?.address || 'Registered Owner Address',
                registered_since: bc.pet?.created_at ? new Date(bc.pet.created_at).toLocaleDateString('en-US', { month: 'long', year: 'numeric' }) : 'January 2025',
                registered_latitude: petLat,
                registered_longitude: petLng,
                photo_url: bc.pet?.photo_url || '',
                owner: {
                    name: bc.pet?.owner?.name || 'Citizen',
                    email: bc.pet?.owner?.email || '',
                    phone: bc.pet?.owner?.phone || '',
                },
            },
            evidence_url: bc.vaccine_card_url || bc.evidence_url || '',
            evidence_filename: (bc.vaccine_card_url || bc.evidence_url) ? (bc.vaccine_card_url || bc.evidence_url).split('/').pop() : '',
            evidence_uploaded: bc.updated_at ? `Uploaded on ${new Date(bc.updated_at).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}` : '',
            previous_photos: bc.additional_photos_url ? [bc.additional_photos_url] : (bc.pet?.photo_url ? [bc.pet.photo_url] : []),
            owner_pet_photos: [bc.pet?.photo_front_url, bc.pet?.photo_left_url, bc.pet?.photo_right_url].filter(Boolean),
            supporting_docs: [
                bc.vet_record_url && { name: bc.vet_record_url.split('/').pop(), url: bc.vet_record_url, color: 'blue' },
                bc.registration_record_url && { name: bc.registration_record_url.split('/').pop(), url: bc.registration_record_url, color: 'green' }
            ].filter(Boolean),
            owner_notes: bc.remarks || '',
            distinctive_markings: bc.distinctive_markings || '',
            distance: computedMeters < 1000 ? `${Math.round(computedMeters)}m` : `${(computedMeters/1000).toFixed(1)}km`,
            distance_meters: Math.round(computedMeters),
            distance_str: computedMeters < 1000 ? `${Math.round(computedMeters)} meters` : `${(computedMeters/1000).toFixed(1)} km`,
            match_found_date: bc.report?.created_at ? new Date(bc.report.created_at).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : 'June 5, 2026',
            claim_submitted_date: bc.created_at ? new Date(bc.created_at).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : 'June 6, 2026',
            evidence_requested_date: (bc.status === 'Evidence Requested' || bc.status === 'Approved' || bc.status === 'Rejected') && bc.updated_at ? new Date(bc.updated_at).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : null,
            approved_date: bc.status === 'Approved' && bc.updated_at ? new Date(bc.updated_at).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : null,
            rejected_date: bc.status === 'Rejected' && bc.updated_at ? new Date(bc.updated_at).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : null,
        };
    };

    const updateWalkingDistances = async (claimsList: any[]) => {
        try {
            const updated = await Promise.all(claimsList.map(async (c) => {
                if (!c.sighting_lat || !c.sighting_lng || !c.pet?.registered_latitude || !c.pet?.registered_longitude) {
                    return c;
                }
                try {
                    const walkingUrl = `https://router.project-osrm.org/route/v1/walking/${c.sighting_lng},${c.sighting_lat};${c.pet.registered_longitude},${c.pet.registered_latitude}?overview=false`;
                    const res = await axios.get(walkingUrl);
                    const dist = res.data?.routes?.[0]?.distance;
                    if (dist && !isNaN(dist)) {
                        return {
                            ...c,
                            distance: dist < 1000 ? `${Math.round(dist)}m` : `${(dist/1000).toFixed(1)}km`,
                            distance_meters: Math.round(dist),
                            distance_str: dist < 1000 ? `${Math.round(dist)} meters` : `${(dist/1000).toFixed(1)} km`,
                        };
                    }
                } catch {
                    // ignore error and keep default
                }
                return c;
            }));
            setClaims(updated);
        } catch (e) {
            console.warn("Could not update walking distances", e);
        }
    };

    const fetchBackendClaims = async () => {
        try {
            const url = staffUser?.subdivision_id
                ? `http://localhost:8000/claims/?subdivision_id=${staffUser.subdivision_id}`
                : 'http://localhost:8000/claims/';
            const res = await axios.get(url);
            if (res.data?.length > 0) {
                const transformed = res.data.map((bc: any) => transformClaim(bc));
                setClaims(transformed);
                setCachedData('subd_pet_claims', transformed);
                updateWalkingDistances(transformed);
                
                // Mark claims as viewed so sidebar notification count clears after viewing
                try {
                    const viewed = JSON.parse(localStorage.getItem('straysafe_viewed_subd_claims') || '[]');
                    const claimIds = transformed.map((c: any) => c.claim_id);
                    const updatedViewed = Array.from(new Set([...viewed, ...claimIds]));
                    localStorage.setItem('straysafe_viewed_subd_claims', JSON.stringify(updatedViewed));
                    window.dispatchEvent(new Event('straysafe_claims_viewed'));
                } catch (e) {
                    console.warn('Could not mark claims as viewed', e);
                }
                
                // Keep selectedClaim in sync with fetched data if it was set
                if (selectedClaim) {
                    const fresh = transformed.find((c: any) => c.claim_id === selectedClaim.claim_id);
                    if (fresh) {
                        setSelectedClaim(fresh);
                    }
                }
            } else {
                setClaims([]);
            }
        } catch (err) {
            console.error("Failed to fetch claims", err);
            if (!getCachedData('subd_pet_claims')) {
                setClaims([]);
            }
        }
    };

    const handleUpdateStatus = async (status: 'Approved' | 'Rejected' | 'Evidence Requested' | 'Handover Complete') => {
        if (!selectedClaim) return;
        setIsSubmitting(true);
        try {
            const res = await axios.patch(`http://localhost:8000/claims/${selectedClaim.claim_id}/status`, {
                status,
                remarks
            });
            const transformed = transformClaim(res.data);
            setClaims(prev => prev.map(c => c.claim_id === selectedClaim.claim_id ? transformed : c));
            setSelectedClaim(transformed);
            setRemarks('');
        } catch (err) {
            console.error("Failed to update status", err);
            alert("Failed to update claim status. Please try again.");
        } finally {
            setIsSubmitting(false);
        }
    };



    const filteredClaims = claims.filter(c => {
        const q = searchQuery.toLowerCase();
        const matchesQ = c.pet?.pet_name?.toLowerCase().includes(q) || c.pet?.owner?.name?.toLowerCase().includes(q) || c.status?.toLowerCase().includes(q);
        const matchesF = statusFilter === 'All Claims' || 
            (statusFilter === 'Under Review' && (c.status === 'Under Review' || c.status === 'Pending Review')) ||
            c.status?.toLowerCase() === statusFilter.toLowerCase();
        return matchesQ && matchesF;
    });

    const pendingCount = claims.filter(c => c.status === 'Under Review' || c.status === 'Pending Review').length;
    const approvedCount = claims.filter(c => c.status === 'Approved').length;
    const rejectedCount = claims.filter(c => c.status === 'Rejected').length;
    const avgMatch = claims.length > 0 ? Math.round(claims.reduce((a, c) => a + (c.similarity_score || 0), 0) / claims.length) : 0;

    const openReview = (claim: any) => { 
        setSelectedClaim(claim); 
        setRoadDistance(claim.distance_meters || null);
        setRemarks(claim.remarks || ''); 
        setViewMode('review'); 
    };

    // ─── Render ──────────────────────────────────────────────────────────────
    return (
        <div className="min-h-screen w-full flex bg-[#F8F9FA] font-sans text-gray-800">
            <SubdSidebar />

            <main className="flex-1 flex flex-col h-screen overflow-hidden">
                <SubdNavbar leftContent={
                    <div className="flex flex-col">
                        <h1 className="text-xl font-black text-gray-900 tracking-tight leading-none uppercase">Pet Claims</h1>
                        <p className="text-[9px] text-gray-400 font-extrabold uppercase tracking-wider mt-1.5 leading-none">
                            Review and manage ownership claims generated by AI Pet Matching System.
                        </p>
                    </div>
                } />

                <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-5 custom-scrollbar bg-[#FAFAF9]">

                    {viewMode === 'list' ? (
                        /* ===================== LIST VIEW ===================== */
                        <>
                            {/* Stat Cards */}
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 shrink-0">
                                {/* Pending Review */}
                                <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm flex items-center gap-4">
                                    <div className="w-11 h-11 rounded-xl bg-amber-50 flex items-center justify-center shrink-0">
                                        <svg className="w-5 h-5 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                                        </svg>
                                    </div>
                                    <div>
                                        <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest leading-none">Pending Review</p>
                                        <p className="text-2xl font-black text-gray-800 mt-1 leading-none">{pendingCount}</p>
                                        <p className="text-[9px] text-gray-400 mt-0.5 font-semibold">claims</p>
                                    </div>
                                </div>

                                {/* Approved Claims */}
                                <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm flex items-center gap-4">
                                    <div className="w-11 h-11 rounded-xl bg-green-50 flex items-center justify-center shrink-0">
                                        <svg className="w-5 h-5 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                                        </svg>
                                    </div>
                                    <div>
                                        <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest leading-none">Approved Claims</p>
                                        <p className="text-2xl font-black text-green-600 mt-1 leading-none">{approvedCount}</p>
                                        <p className="text-[9px] text-gray-400 mt-0.5 font-semibold">total approved</p>
                                    </div>
                                </div>

                                {/* Rejected Claims */}
                                <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm flex items-center gap-4">
                                    <div className="w-11 h-11 rounded-xl bg-red-50 flex items-center justify-center shrink-0">
                                        <svg className="w-5 h-5 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
                                        </svg>
                                    </div>
                                    <div>
                                        <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest leading-none">Rejected Claims</p>
                                        <p className="text-2xl font-black text-red-500 mt-1 leading-none">{rejectedCount}</p>
                                        <p className="text-[9px] text-gray-400 mt-0.5 font-semibold">total rejected</p>
                                    </div>
                                </div>

                                {/* Avg Match Score */}
                                <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm flex items-center gap-4">
                                    <div className="w-11 h-11 rounded-xl bg-blue-50 flex items-center justify-center shrink-0">
                                        <svg className="w-5 h-5 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                                        </svg>
                                    </div>
                                    <div>
                                        <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest leading-none">Avg Match Score</p>
                                        <p className="text-2xl font-black text-blue-600 mt-1 leading-none">{avgMatch}%</p>
                                        <p className="text-[9px] text-gray-400 mt-0.5 font-semibold">this month</p>
                                    </div>
                                </div>
                            </div>

                            {/* Table Card */}
                            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm flex flex-col flex-1 min-h-[400px] overflow-hidden">
                                {/* Toolbar */}
                                <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 p-5 border-b border-gray-100">
                                    {/* Search */}
                                    <div className="relative flex-1 w-full sm:max-w-xs">
                                        <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                                        </svg>
                                        <input
                                            type="text"
                                            placeholder="Search claimant or pet name..."
                                            value={searchQuery}
                                            onChange={e => setSearchQuery(e.target.value)}
                                            className="w-full h-9 pl-9 pr-3 bg-gray-50 border border-gray-200 rounded-lg text-xs font-medium focus:outline-none focus:ring-2 focus:ring-[#F97316]/20 focus:border-[#F97316]/50 transition-all"
                                        />
                                    </div>

                                    {/* Match % filter dummy */}
                                    <Select
                                        value="Match Percentage"
                                        onChange={() => { }}
                                        options={[
                                            { value: 'Match Percentage', label: 'Match Percentage' },
                                            { value: 'High', label: 'High (90%+)' },
                                            { value: 'Medium', label: 'Medium (75–89%)' },
                                        ]}
                                        className="!h-9 !py-0 !text-xs !rounded-lg !font-medium"
                                    />

                                    {/* Status filter */}
                                    <Select
                                        value={statusFilter}
                                        onChange={e => setStatusFilter(e.target.value)}
                                        options={[
                                            { value: 'All Claims', label: 'Status' },
                                            { value: 'Under Review', label: 'Under Review' },
                                            { value: 'Evidence Requested', label: 'Evidence Requested' },
                                            { value: 'Approved', label: 'Approved' },
                                            { value: 'Rejected', label: 'Rejected' },
                                        ]}
                                        className="!h-9 !py-0 !text-xs !rounded-lg !font-medium"
                                    />

                                    {/* Date Range dummy */}
                                    <Select
                                        value="Date Range"
                                        onChange={() => { }}
                                        options={[
                                            { value: 'Date Range', label: 'Date Range' },
                                            { value: 'Today', label: 'Today' },
                                            { value: 'This Week', label: 'This Week' },
                                            { value: 'This Month', label: 'This Month' },
                                        ]}
                                        className="!h-9 !py-0 !text-xs !rounded-lg !font-medium"
                                    />

                                    <div className="flex gap-2 ml-auto">
                                        <button
                                            onClick={() => { setStatusFilter('All Claims'); setSearchQuery(''); }}
                                            className="h-9 px-3 text-xs font-semibold text-gray-500 hover:text-gray-700 border border-gray-200 rounded-lg hover:bg-gray-50 transition-all cursor-pointer"
                                        >
                                            ↺ Reset
                                        </button>
                                        <Button
                                            onClick={() => window.print()}
                                            variant="primary"
                                            size="sm"
                                            className="h-9 gap-1.5"
                                        >
                                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                                            </svg>
                                            Export
                                        </Button>
                                    </div>
                                </div>

                                {/* Table */}
                                <div className="flex-1 overflow-y-auto custom-scrollbar">
                                    <table className="w-full text-left border-collapse">
                                        <thead>
                                            <tr className="border-b border-gray-100 text-[10px] font-black text-gray-400 uppercase tracking-widest bg-gray-50/80 sticky top-0 z-10">
                                                <th className="py-3.5 px-5">Claimant</th>
                                                <th className="py-3.5 px-5">Pet Name</th>
                                                <th className="py-3.5 px-5">Match %</th>
                                                <th className="py-3.5 px-5">Distance</th>
                                                <th className="py-3.5 px-5">Status</th>
                                                <th className="py-3.5 px-5">Claim Date</th>
                                                <th className="py-3.5 px-5 text-right">Action</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-gray-50">
                                            {filteredClaims.length === 0 ? (
                                                <tr>
                                                    <td colSpan={7} className="text-center py-16 text-gray-300 font-black uppercase tracking-widest text-xs">
                                                        No matching pet claims found
                                                    </td>
                                                </tr>
                                            ) : filteredClaims.map(claim => (
                                                <tr key={claim.claim_id} className="hover:bg-gray-50/70 transition-colors">
                                                    {/* Claimant */}
                                                    <td className="py-4 px-5">
                                                        <div className="flex items-center gap-3">
                                                            <div className={`w-9 h-9 rounded-full flex items-center justify-center text-xs font-black shrink-0 ${getAvatarColor(claim.pet?.owner?.name || 'A')}`}>
                                                                {getInitials(claim.pet?.owner?.name || 'AN')}
                                                            </div>
                                                            <div className="min-w-0">
                                                                <p className="text-xs font-extrabold text-gray-800 truncate">{claim.pet?.owner?.name}</p>
                                                                <p className="text-[10px] text-gray-400 font-medium truncate">{claim.pet?.owner?.email}</p>
                                                            </div>
                                                        </div>
                                                    </td>

                                                    {/* Pet Name */}
                                                    <td className="py-4 px-5">
                                                        <div className="flex items-center gap-2.5">
                                                            <div className="w-9 h-9 rounded-xl overflow-hidden border border-gray-100 shrink-0 bg-gray-50">
                                                                <img 
                                                                    src={getPetPicture(claim.pet?.photo_url || claim.sighting_photo)} 
                                                                    alt={claim.pet?.pet_name} 
                                                                    className="w-full h-full object-cover" 
                                                                    onError={(e) => { e.currentTarget.src = DEFAULT_PET_AVATAR; }}
                                                                />
                                                            </div>
                                                            <div>
                                                                <p className="text-xs font-extrabold text-gray-800">{claim.pet?.pet_name}</p>
                                                                <p className="text-[10px] text-gray-400 font-medium">{claim.pet?.pet_type} ({claim.pet?.breed})</p>
                                                            </div>
                                                        </div>
                                                    </td>

                                                    {/* Match % */}
                                                    <td className="py-4 px-5">
                                                        <span className="text-xs font-black text-green-600">
                                                            {claim.similarity_score}%
                                                        </span>
                                                    </td>

                                                    {/* Distance */}
                                                    <td className="py-4 px-5">
                                                        <span className={`text-xs font-black ${claim.distance_meters <= 50 ? 'text-green-600' : claim.distance_meters <= 100 ? 'text-amber-500' : 'text-red-500'}`}>
                                                            {claim.distance || `${claim.distance_meters}m`}
                                                        </span>
                                                    </td>

                                                    {/* Status */}
                                                    <td className="py-4 px-5">
                                                        <span className={`px-2.5 py-1 rounded-full text-[9px] font-black uppercase tracking-wider border leading-none inline-block ${getStatusStyles(claim.status)}`}>
                                                            {claim.status}
                                                        </span>
                                                    </td>

                                                    {/* Claim Date */}
                                                    <td className="py-4 px-5">
                                                        <p className="text-xs font-semibold text-gray-700">{claim.claim_date}</p>
                                                        <p className="text-[10px] text-gray-400 font-medium">{claim.claim_time}</p>
                                                    </td>

                                                    {/* Action */}
                                                    <td className="py-4 px-5">
                                                        <div className="flex items-center justify-end gap-1.5">
                                                            <Button
                                                                onClick={() => openReview(claim)}
                                                                variant="primary"
                                                                size="sm"
                                                                className="gap-1.5 text-[10px]"
                                                            >
                                                                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                                                                </svg>
                                                                View
                                                            </Button>
                                                            {/* Kebab */}
                                                            <div className="relative" ref={openKebab === claim.claim_id ? kebabRef : undefined}>
                                                                <button
                                                                    onClick={() => setOpenKebab(openKebab === claim.claim_id ? null : claim.claim_id)}
                                                                    className="w-8 h-8 rounded-lg hover:bg-gray-100 flex items-center justify-center text-gray-400 hover:text-gray-600 transition-all cursor-pointer"
                                                                >
                                                                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                                                                        <path d="M12 5a1.5 1.5 0 110 3 1.5 1.5 0 010-3zm0 5.5a1.5 1.5 0 110 3 1.5 1.5 0 010-3zm0 5.5a1.5 1.5 0 110 3 1.5 1.5 0 010-3z" />
                                                                    </svg>
                                                                </button>
                                                                {openKebab === claim.claim_id && (
                                                                    <div className="absolute right-0 top-full mt-1 w-40 bg-white rounded-xl shadow-lg border border-gray-100 z-50 py-1">
                                                                        <button onClick={() => { openReview(claim); setOpenKebab(null); }} className="w-full text-left px-4 py-2.5 text-xs font-semibold text-gray-700 hover:bg-gray-50 transition-colors cursor-pointer">View Details</button>
                                                                        <button onClick={() => { setOpenKebab(null); }} className="w-full text-left px-4 py-2.5 text-xs font-semibold text-gray-700 hover:bg-gray-50 transition-colors cursor-pointer">Export PDF</button>
                                                                        <div className="border-t border-gray-100 my-1" />
                                                                        <button onClick={() => { setOpenKebab(null); }} className="w-full text-left px-4 py-2.5 text-xs font-semibold text-red-500 hover:bg-red-50 transition-colors cursor-pointer">Archive Claim</button>
                                                                    </div>
                                                                )}
                                                            </div>
                                                        </div>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </>
                    ) : selectedClaim && (
                        /* ===================== REVIEW VIEW ===================== */
                        <div className="flex flex-col gap-5">
                            {/* Back */}
                            <div className="shrink-0 flex items-center gap-3">
                                <button
                                    onClick={() => setViewMode('list')}
                                    className="flex items-center gap-2 text-xs font-black uppercase tracking-widest text-gray-500 hover:text-[#F97316] transition-colors focus:outline-none cursor-pointer"
                                >
                                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                                    </svg>
                                    Back to Pet Claims
                                </button>
                                <span className="text-gray-300">/</span>
                                <span className="text-xs font-black text-gray-400 uppercase tracking-widest">{selectedClaim.pet?.pet_name} Ownership Claim</span>
                            </div>

                            {/* Review Header Card */}
                            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 shrink-0">
                                <div className="flex flex-col lg:flex-row justify-between items-start gap-4">
                                    <div>
                                        <div className="flex items-center gap-3 mb-2">
                                            <h2 className="text-xl font-black text-gray-900">
                                                {selectedClaim.pet?.pet_name} Ownership Claim
                                            </h2>
                                            <button className="text-gray-300 hover:text-gray-500 transition-colors cursor-pointer">
                                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
                                                </svg>
                                            </button>
                                        </div>
                                        <p className="text-xs font-semibold text-[#F97316] mb-3">Potential Match Found</p>
                                        <div className="flex flex-wrap items-center gap-4 text-xs text-gray-500 font-medium">
                                            <span className="flex items-center gap-1.5">
                                                <svg className="w-3.5 h-3.5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" /></svg>
                                                {selectedClaim.sighting_location}
                                            </span>
                                            <span className="flex items-center gap-1.5">
                                                <svg className="w-3.5 h-3.5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                                                {selectedClaim.reported_date}
                                            </span>
                                        </div>
                                    </div>
                                    <div className="flex items-start gap-3 shrink-0">
                                        {/* AI Match Score Badge */}
                                        <div className="text-center bg-green-50 border border-green-200 rounded-xl px-5 py-3">
                                            <p className="text-[9px] font-black text-green-600 uppercase tracking-widest mb-0.5">AI Match Score</p>
                                            <p className="text-3xl font-black text-green-600 leading-none">{selectedClaim.similarity_score}%</p>
                                        </div>
                                        {/* Status Badge */}
                                        <div className={`text-center rounded-xl px-5 py-3 border ${getStatusStyles(selectedClaim.status)}`}>
                                            <p className="text-[9px] font-black uppercase tracking-widest mb-0.5">Status</p>
                                            <p className="text-sm font-black uppercase leading-tight">{selectedClaim.status}</p>
                                        </div>
                                    </div>
                                </div>

                                {/* Privacy Banner */}
                                <div className="mt-4 flex items-center gap-2.5 bg-amber-50 border border-amber-200 rounded-xl p-3">
                                    <span className="text-base">🔒</span>
                                    <p className="text-[10px] font-semibold text-amber-700">
                                        <strong>Privacy Rule Active:</strong> Reporter identities are hidden. Owners can only view matches for their registered pets.
                                    </p>
                                </div>
                            </div>

                            {/* Main 2-column grid */}
                            <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">

                                {/* ─── LEFT COLUMN ─── */}
                                <div className="lg:col-span-5 space-y-5">

                                    {/* A: Pet Comparison (Sighting vs. Registered) */}
                                    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
                                        <h4 className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-4">A. Pet Comparison (Sighting vs. Registered)</h4>
                                        
                                        <div className="grid grid-cols-2 gap-5">
                                            {/* Reported Side */}
                                            <div className="space-y-3">
                                                <div className="flex items-center justify-between">
                                                    <p className="text-[9px] font-black text-[#F97316] uppercase tracking-widest">Sighting Data</p>
                                                    <span className="text-[9px] font-bold text-gray-400">{selectedClaim.reported_date}</span>
                                                </div>
                                                <div className="relative rounded-xl overflow-hidden bg-gray-50 border border-gray-100 h-44 shadow-inner">
                                                    <img
                                                        src={selectedClaim.sighting_photo}
                                                        alt="Reported Stray"
                                                        className="w-full h-full object-cover"
                                                    />
                                                    <button
                                                        onClick={() => setLightboxImage(selectedClaim.sighting_photo)}
                                                        className="absolute top-2 right-2 w-7 h-7 bg-white/90 hover:bg-white rounded-lg flex items-center justify-center shadow-sm transition-all cursor-pointer border-0"
                                                    >
                                                        <svg className="w-3.5 h-3.5 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v3m0 0v3m0-3h3m-3 0H7" /></svg>
                                                    </button>
                                                </div>
                                                <div className="space-y-2">
                                                    <div className="bg-gray-50 rounded-xl p-3 border border-gray-100">
                                                        <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest block mb-1">Description</span>
                                                        <p className="text-[10px] font-medium text-gray-600 italic leading-relaxed">"{selectedClaim.description}"</p>
                                                    </div>
                                                    <div className="bg-orange-50/30 rounded-xl p-3 border border-orange-100">
                                                        <span className="text-[9px] font-black text-[#F97316] uppercase tracking-widest block mb-2">Sighting Details</span>
                                                        <ul className="grid grid-cols-2 gap-x-2 gap-y-1.5 text-[10px]">
                                                            <li><span className="text-gray-400 font-semibold">Breed: </span><span className="font-bold text-gray-800 truncate block">{selectedClaim.report?.animal_breed || selectedClaim.report?.ai_possible_breed || "Unknown"}</span></li>
                                                            <li><span className="text-gray-400 font-semibold">Type: </span><span className="font-bold text-gray-800">{selectedClaim.report?.animal_type || selectedClaim.report?.ai_animal_type || "Unknown"}</span></li>
                                                            <li className="col-span-2"><span className="text-gray-400 font-semibold">Colors: </span><span className="font-bold text-gray-800">{selectedClaim.report?.animal_color || selectedClaim.report?.ai_dominant_color || "Unknown"}</span></li>
                                                            <li className="col-span-2">
                                                                <span className="text-gray-400 font-semibold">Street: </span>
                                                                <span className="font-bold text-gray-800 truncate block">
                                                                    {isViewReportAddressLoading ? 'Resolving street...' : (viewReportAddress || selectedClaim.sighting_location)}
                                                                </span>
                                                            </li>
                                                        </ul>
                                                    </div>
                                                </div>
                                            </div>

                                            {/* Registered Side */}
                                            <div className="space-y-3">
                                                <div className="flex items-center justify-between">
                                                    <p className="text-[9px] font-black text-blue-600 uppercase tracking-widest">Registered Profile</p>
                                                    <span className="text-[9px] font-bold text-blue-400">Since {selectedClaim.pet?.registered_since || '2025'}</span>
                                                </div>
                                                <div className="relative rounded-xl overflow-hidden bg-gray-50 border border-gray-100 h-44 shadow-inner">
                                                    <img
                                                        src={selectedClaim.pet?.photo_url}
                                                        alt="Registered Pet"
                                                        className="w-full h-full object-cover"
                                                    />
                                                    <button
                                                        onClick={() => setLightboxImage(selectedClaim.pet?.photo_url)}
                                                        className="absolute top-2 right-2 w-7 h-7 bg-white/90 hover:bg-white rounded-lg flex items-center justify-center shadow-sm transition-all cursor-pointer border-0"
                                                    >
                                                        <svg className="w-3.5 h-3.5 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v3m0 0v3m0-3h3m-3 0H7" /></svg>
                                                    </button>
                                                </div>
                                                <div className="space-y-2">
                                                    <div className="bg-blue-50/30 rounded-xl p-3 border border-blue-100">
                                                        <span className="text-[9px] font-black text-blue-400 uppercase tracking-widest block mb-2">Pet Details</span>
                                                        <ul className="grid grid-cols-2 gap-x-2 gap-y-1.5 text-[10px]">
                                                            <li className="col-span-2"><span className="text-gray-400 font-semibold">Name: </span><span className="font-bold text-gray-800">{selectedClaim.pet?.pet_name}</span></li>
                                                            <li><span className="text-gray-400 font-semibold">Breed: </span><span className="font-bold text-gray-800 truncate block">{selectedClaim.pet?.breed}</span></li>
                                                            <li><span className="text-gray-400 font-semibold">Type: </span><span className="font-bold text-gray-800">{selectedClaim.pet?.pet_type}</span></li>
                                                            <li className="col-span-2"><span className="text-gray-400 font-semibold">Colors: </span><span className="font-bold text-gray-800">{[selectedClaim.pet?.primary_color, selectedClaim.pet?.secondary_color, selectedClaim.pet?.tertiary_color].filter(Boolean).join(' / ') || 'Unknown'}</span></li>
                                                            <li className="col-span-2"><span className="text-gray-400 font-semibold">Markings: </span><span className="font-bold text-gray-800 leading-tight">{selectedClaim.pet?.distinctive_markings}</span></li>
                                                        </ul>
                                                    </div>
                                                    <div className="flex items-center gap-2 px-1">
                                                        <div className={`w-7 h-7 rounded-full flex items-center justify-center text-[9px] font-black shrink-0 ${getAvatarColor(selectedClaim.pet?.owner?.name || 'A')}`}>
                                                            {getInitials(selectedClaim.pet?.owner?.name || 'AN')}
                                                        </div>
                                                        <div className="min-w-0">
                                                            <p className="text-[10px] font-black text-gray-800 leading-none">{selectedClaim.pet?.owner?.name}</p>
                                                            <p className="text-[9px] text-gray-400 font-medium mt-0.5">Verified Owner</p>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    {/* B: AI Comparison Results */}
                                    {(() => {
                                        const pBreed = (selectedClaim.pet?.breed || "").toLowerCase().trim();
                                        const rBreed = (selectedClaim.report?.ai_possible_breed || "").toLowerCase().trim();
                                        const rReportedBreed = (selectedClaim.report?.animal_breed || "").toLowerCase().trim();
                                        const breedMatches = pBreed && (
                                            (rBreed && (pBreed === rBreed || pBreed.includes(rBreed) || rBreed.includes(pBreed))) ||
                                            (rReportedBreed && (pBreed === rReportedBreed || pBreed.includes(rReportedBreed) || rReportedBreed.includes(pBreed)))
                                        );

                                        const rColorRaw = selectedClaim.report?.animal_color || selectedClaim.report?.ai_dominant_color || "";
                                        const rColors = rColorRaw.toLowerCase().split(/,| and |\/|\s+/).map((c: string) => c.trim()).filter(Boolean);
                                        const pPrimary = (selectedClaim.pet?.primary_color || "").toLowerCase().trim();
                                        const pSecondary = (selectedClaim.pet?.secondary_color || "").toLowerCase().trim();
                                        const colorMatches = (pPrimary && rColors.includes(pPrimary)) || (pSecondary && rColors.includes(pSecondary));

                                        const speciesMatches = selectedClaim.pet?.pet_type?.toLowerCase() === (selectedClaim.report?.animal_type || selectedClaim.report?.ai_animal_type || 'dog').toLowerCase();
                                        const markingsExist = !!(selectedClaim.pet?.distinctive_markings || selectedClaim.pet?.color_markings);

                                        return (
                                            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
                                                <h4 className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-4">B. AI Comparison Results</h4>
                                                <table className="w-full text-xs border border-gray-100 rounded-xl overflow-hidden">
                                                    <thead>
                                                        <tr className="bg-gray-50 border-b border-gray-100">
                                                            <th className="py-2.5 px-4 text-left text-[9px] font-black text-gray-400 uppercase tracking-widest">Category</th>
                                                            <th className="py-2.5 px-4 text-right text-[9px] font-black text-gray-400 uppercase tracking-widest">Result</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody className="divide-y divide-gray-50">
                                                        <tr className="hover:bg-gray-50/50">
                                                            <td className="py-2.5 px-4 text-gray-600 font-medium">Visual Similarity</td>
                                                            <td className="py-2.5 px-4 text-right font-extrabold text-[#F97316]">{selectedClaim.similarity_score}%</td>
                                                        </tr>
                                                        <tr className="hover:bg-gray-50/50">
                                                            <td className="py-2.5 px-4 text-gray-600 font-medium">Species Match</td>
                                                            <td className={`py-2.5 px-4 text-right font-extrabold ${speciesMatches ? 'text-green-600' : 'text-red-500'}`}>
                                                                {speciesMatches ? 'Match' : 'Mismatch'}
                                                            </td>
                                                        </tr>
                                                        <tr className="hover:bg-gray-50/50">
                                                            <td className="py-2.5 px-4 text-gray-600 font-medium">Breed Similarity</td>
                                                            <td className={`py-2.5 px-4 text-right font-extrabold ${breedMatches ? 'text-green-600' : 'text-amber-500'}`}>
                                                                {breedMatches ? 'Confirmed' : 'No Direct Match'}
                                                            </td>
                                                        </tr>
                                                        <tr className="hover:bg-gray-50/50">
                                                            <td className="py-2.5 px-4 text-gray-600 font-medium">Color Match</td>
                                                            <td className={`py-2.5 px-4 text-right font-extrabold ${colorMatches ? 'text-green-600' : 'text-amber-500'}`}>
                                                                {colorMatches ? 'Confirmed' : 'No Direct Match'}
                                                            </td>
                                                        </tr>
                                                        <tr className="hover:bg-gray-50/50">
                                                            <td className="py-2.5 px-4 text-gray-600 font-medium">Markings Match</td>
                                                            <td className={`py-2.5 px-4 text-right font-extrabold ${markingsExist ? 'text-green-600' : 'text-gray-400'}`}>
                                                                {markingsExist ? 'Confirmed' : 'Not Specified'}
                                                            </td>
                                                        </tr>
                                                        <tr className="hover:bg-gray-50/50">
                                                            <td className="py-2.5 px-4 text-gray-600 font-medium">Location Distance</td>
                                                            <td className="py-2.5 px-4 text-right font-bold text-gray-700">
                                                                {roadDistance !== null 
                                                                    ? (roadDistance < 1000 ? `${Math.round(roadDistance)} meters` : `${(roadDistance / 1000).toFixed(1)} km`)
                                                                    : (selectedClaim.distance_str || `${selectedClaim.distance_meters} meters`)}
                                                            </td>
                                                        </tr>
                                                    </tbody>
                                                </table>
                                                {/* Decision Badge */}
                                                <div className={`mt-4 p-3 rounded-xl flex items-center gap-3 border ${selectedClaim.similarity_score >= 90 ? 'bg-green-50 border-green-200 text-green-700' : selectedClaim.similarity_score >= 80 ? 'bg-amber-50 border-amber-200 text-amber-700' : 'bg-red-50 border-red-200 text-red-600'}`}>
                                                    <svg className="w-5 h-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                                                    <div>
                                                        <p className="text-xs font-black uppercase tracking-wider">
                                                            {selectedClaim.similarity_score >= 90 ? 'HIGH PROBABILITY MATCH' : selectedClaim.similarity_score >= 80 ? 'MEDIUM PROBABILITY MATCH' : 'LOW PROBABILITY MATCH'}
                                                        </p>
                                                        <p className="text-[10px] font-medium opacity-80">
                                                            {selectedClaim.similarity_score >= 90 ? 'Strong similarity detected by AI' : selectedClaim.similarity_score >= 80 ? 'Moderate similarity detected by AI' : 'Low similarity detected by AI'}
                                                        </p>
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })()}
                                </div>

                                {/* ─── RIGHT COLUMN ─── */}
                                <div className="lg:col-span-7 space-y-5">

                                    {/* C: Ownership Evidence */}
                                    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
                                        <h4 className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-4">C. Ownership Evidence</h4>
                                        <div className="grid grid-cols-3 gap-4 mb-4">
                                            {/* Vaccination Records */}
                                            <div>
                                                <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-2">Vaccination Records</p>
                                                {selectedClaim.evidence_url ? (
                                                    <div className="border border-gray-100 rounded-xl p-3 bg-gray-50 space-y-2">
                                                        <div className="flex items-center gap-2">
                                                            <svg className="w-4 h-4 text-blue-500 shrink-0" fill="currentColor" viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8l-6-6zm-1 1.5L18.5 9H13V3.5z" /></svg>
                                                            <p className="text-[9px] font-bold text-gray-600 truncate">{selectedClaim.evidence_filename || 'vaccine_card.pdf'}</p>
                                                        </div>
                                                        <p className="text-[8px] text-gray-400">{selectedClaim.evidence_uploaded}</p>
                                                        <div className="flex gap-1.5">
                                                            <button onClick={() => setLightboxImage(selectedClaim.evidence_url)} className="p-1.5 bg-white hover:bg-gray-100 border border-gray-200 rounded-lg transition-colors cursor-pointer">
                                                                <svg className="w-3 h-3 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                                                            </button>
                                                            <button onClick={() => window.open(selectedClaim.evidence_url, '_blank')} className="p-1.5 bg-white hover:bg-gray-100 border border-gray-200 rounded-lg transition-colors cursor-pointer">
                                                                <svg className="w-3 h-3 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                                                            </button>
                                                        </div>
                                                    </div>
                                                ) : (
                                                    <div className="border border-dashed border-gray-200 rounded-xl p-4 text-center bg-gray-50">
                                                        <p className="text-[9px] font-black text-gray-400 uppercase">Not Uploaded</p>
                                                    </div>
                                                )}
                                            </div>

                                            {/* Previous Pet Photos */}
                                            <div>
                                                <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-2">Previous Pet Photos</p>
                                                {selectedClaim.previous_photos?.length > 0 ? (
                                                    <div className="grid grid-cols-2 gap-1.5">
                                                        {selectedClaim.previous_photos.slice(0, 4).map((photo: string, i: number) => (
                                                            <div key={i} onClick={() => setLightboxImage(photo)} className="h-16 rounded-lg overflow-hidden border border-gray-100 bg-gray-50 cursor-pointer group">
                                                                <img src={photo} alt={`prev-${i}`} className="w-full h-full object-cover transition-transform group-hover:scale-110" />
                                                            </div>
                                                        ))}
                                                    </div>
                                                ) : (
                                                    <div className="border border-dashed border-gray-200 rounded-xl p-4 text-center bg-gray-50 h-16 flex items-center justify-center">
                                                        <p className="text-[9px] font-black text-gray-300 uppercase">No Photos</p>
                                                    </div>
                                                )}
                                            </div>

                                            {/* Owner-Pet Photos */}
                                            <div>
                                                <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-2">Owner-Pet Photos</p>
                                                {selectedClaim.owner_pet_photos?.length > 0 ? (
                                                    <div className="grid grid-cols-2 gap-1.5">
                                                        {selectedClaim.owner_pet_photos.slice(0, 4).map((photo: string, i: number) => (
                                                            <div key={i} onClick={() => setLightboxImage(photo)} className="h-16 rounded-lg overflow-hidden border border-gray-100 bg-gray-50 cursor-pointer group">
                                                                <img src={photo} alt={`owner-pet-${i}`} className="w-full h-full object-cover transition-transform group-hover:scale-110" />
                                                            </div>
                                                        ))}
                                                    </div>
                                                ) : (
                                                    <div className="border border-dashed border-gray-200 rounded-xl p-4 text-center bg-gray-50 h-16 flex items-center justify-center">
                                                        <p className="text-[9px] font-black text-gray-300 uppercase">No Photos</p>
                                                    </div>
                                                )}
                                            </div>
                                        </div>

                                        {/* Supporting Docs + Additional Notes */}
                                        <div className="grid grid-cols-2 gap-4">
                                            <div>
                                                <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-2">Supporting Documents</p>
                                                <div className="space-y-1.5">
                                                    {selectedClaim.supporting_docs?.length > 0 ? selectedClaim.supporting_docs.map((doc: any, i: number) => (
                                                        <div key={i} className="flex items-center justify-between p-2.5 bg-gray-50 border border-gray-100 rounded-xl">
                                                            <div className="flex items-center gap-2 min-w-0">
                                                                <svg className={`w-4 h-4 shrink-0 ${docColors[doc.color] || 'text-gray-400'}`} fill="currentColor" viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8l-6-6zm-1 1.5L18.5 9H13V3.5z" /></svg>
                                                                <span className="text-[10px] font-bold text-gray-700 truncate">{typeof doc === 'string' ? doc : doc.name}</span>
                                                            </div>
                                                            <button onClick={() => alert(`[Download] ${typeof doc === 'string' ? doc : doc.name}`)} className="p-1 hover:bg-gray-200 rounded-lg transition-colors cursor-pointer border-0 bg-transparent">
                                                                <svg className="w-3 h-3 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                                                            </button>
                                                        </div>
                                                    )) : (
                                                        <p className="text-[10px] text-gray-400 font-semibold py-2 text-center">No documents provided.</p>
                                                    )}
                                                </div>
                                            </div>
                                            <div>
                                                <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-2">Additional Notes from Owner</p>
                                                <div className="bg-gray-50 border border-gray-100 rounded-xl p-3 min-h-[80px] space-y-3">
                                                    {selectedClaim.distinctive_markings && (
                                                        <div className="pb-2 border-b border-gray-250">
                                                            <span className="text-[8px] font-black uppercase text-[#F97316] tracking-wider block mb-0.5">Distinctive Markings (Not visible in photos)</span>
                                                            <p className="text-[11px] font-bold text-gray-700 leading-normal">{selectedClaim.distinctive_markings}</p>
                                                        </div>
                                                    )}
                                                    <div>
                                                        <span className="text-[8px] font-black uppercase text-gray-400 tracking-wider block mb-0.5">Remarks / Notes</span>
                                                        <p className="text-[11px] font-medium text-gray-600 italic leading-relaxed">
                                                            {selectedClaim.owner_notes || 'No additional notes provided.'}
                                                        </p>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    {/* D: Location Verification */}
                                    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
                                        <h4 className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-4">D. Location Verification</h4>
                                        <div className="w-full rounded-xl overflow-hidden border border-gray-100" style={{ height: '220px' }}>
                                            <MapComponent
                                                height="100%"
                                                center={[selectedClaim.sighting_lat, selectedClaim.sighting_lng]}
                                                zoom={16}
                                                showHeatmap={false}
                                                showGeofence={true}
                                                showLandmarks={false}
                                                showConnectingLine={true}
                                                onRouteCalculated={(dist: number) => {
                                                    setRoadDistance(dist);
                                                    if (selectedClaim && Math.round(dist) !== selectedClaim.distance_meters) {
                                                        const updatedClaim = {
                                                            ...selectedClaim,
                                                            distance: dist < 1000 ? `${Math.round(dist)}m` : `${(dist/1000).toFixed(1)}km`,
                                                            distance_meters: Math.round(dist),
                                                            distance_str: dist < 1000 ? `${Math.round(dist)} meters` : `${(dist/1000).toFixed(1)} km`,
                                                        };
                                                        setSelectedClaim(updatedClaim);
                                                        setClaims(prev => prev.map(c => c.claim_id === selectedClaim.claim_id ? updatedClaim : c));
                                                    }
                                                }}
                                                markers={[
                                                    { id: 1, lat: selectedClaim.sighting_lat, lng: selectedClaim.sighting_lng, title: viewReportAddress || selectedClaim.sighting_location || 'Sighting Location', category: 'Stray Sighting', color: 'orange' },
                                                    { id: 2, lat: selectedClaim.pet?.registered_latitude, lng: selectedClaim.pet?.registered_longitude, title: selectedClaim.pet?.registered_address || selectedClaim.pet?.owner?.address || 'Registered Owner Address', category: 'User Location' },
                                                ]}
                                            />
                                        </div>
                                        <div className="grid grid-cols-3 gap-3 mt-3">
                                            <div className="bg-gray-50 rounded-xl p-3 border border-gray-100">
                                                <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Sighting Location</p>
                                                <p className="text-xs font-bold text-gray-800 mt-1">{selectedClaim.sighting_location}</p>
                                                <p className="text-[9px] font-bold text-gray-400 mt-0.5">
                                                    {isViewReportAddressLoading ? 'Resolving street...' : (viewReportAddress || selectedClaim.sighting_location)}
                                                </p>
                                            </div>
                                            <div className="bg-gray-50 rounded-xl p-3 border border-gray-100">
                                                <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Registered Address</p>
                                                <p className="text-xs font-bold text-gray-800 mt-1 leading-snug">{selectedClaim.pet?.registered_address || selectedClaim.pet?.owner?.address || 'Registered Owner Address'}</p>
                                            </div>
                                            <div className="bg-gray-50 rounded-xl p-3 border border-gray-100">
                                                <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Distance</p>
                                                <p className="text-xl font-black text-green-600 mt-1">
                                                    {roadDistance !== null 
                                                        ? (roadDistance < 1000 ? `${Math.round(roadDistance)} meters` : `${(roadDistance / 1000).toFixed(1)} km`)
                                                        : (selectedClaim.distance_str || `${selectedClaim.distance_meters} meters`)}
                                                </p>
                                                <div className="flex items-center gap-1 mt-0.5">
                                                    <span className="text-[9px] font-black text-gray-400 uppercase">Same Subdivision:</span>
                                                    <span className="text-[9px] font-black text-green-600">Yes ✓</span>
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    {/* E: Claim Lifecycle Timeline */}
                                    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
                                        <h4 className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-4">E. Claim Lifecycle Timeline</h4>
                                        {(() => {
                                            const claimSubmitted = selectedClaim.status !== 'Potential Owner Match' && selectedClaim.status !== 'Possible Match Found';
                                            const steps = [
                                                { label: 'Potential Match Found', date: selectedClaim.match_found_date, done: true, active: false, waiting: false },
                                                { label: 'Claim Submitted', date: claimSubmitted ? selectedClaim.claim_submitted_date : 'Waiting for owner...', done: claimSubmitted, active: false, waiting: !claimSubmitted },
                                                { label: 'Under Review', date: claimSubmitted ? selectedClaim.claim_submitted_date : null, done: claimSubmitted && selectedClaim.status !== 'Under Review' && selectedClaim.status !== 'Pending Review', active: claimSubmitted && (selectedClaim.status === 'Under Review' || selectedClaim.status === 'Pending Review'), waiting: false },
                                                { label: 'Evidence Requested', date: selectedClaim.evidence_requested_date, done: selectedClaim.status === 'Approved' || selectedClaim.status === 'Rejected', active: selectedClaim.status === 'Evidence Requested', skip: selectedClaim.status === 'Approved' || selectedClaim.status === 'Rejected', waiting: false },
                                                { label: 'Approved', date: selectedClaim.approved_date, done: selectedClaim.status === 'Approved', active: selectedClaim.status === 'Approved', waiting: false },
                                                { label: 'Rejected', date: selectedClaim.rejected_date, done: selectedClaim.status === 'Rejected', active: selectedClaim.status === 'Rejected', waiting: false },
                                            ];
                                            return (
                                                <div className="flex items-start gap-0 overflow-x-auto pb-2">
                                                    {steps.map((step, i) => {
                                                        if (step.label === 'Rejected' && selectedClaim.status !== 'Rejected') {
                                                            return null;
                                                        }
                                                        if (step.label === 'Approved' && selectedClaim.status === 'Rejected') {
                                                            return null;
                                                        }
                                                        return (
                                                            <div key={i} className="flex items-start shrink-0" style={{ minWidth: '90px' }}>
                                                                <div className="flex flex-col items-center flex-1">
                                                                    {/* Circle */}
                                                                    <div className={`w-8 h-8 rounded-full flex items-center justify-center border-2 shrink-0 z-10 text-xs font-black transition-all ${
                                                                        step.active ? 'bg-amber-400 border-amber-400 text-white shadow-md shadow-amber-200'
                                                                        : step.done ? 'bg-green-500 border-green-500 text-white'
                                                                        : (step as any).waiting ? 'bg-gray-50 border-gray-300 border-dashed text-gray-300'
                                                                        : 'bg-white border-gray-200 text-gray-300'
                                                                    }`}>
                                                                        {step.done ? '✓' : step.active ? '●' : (step as any).waiting ? '?' : '○'}
                                                                    </div>
                                                                    {/* Label */}
                                                                    <p className={`text-center text-[8.5px] font-black mt-2 uppercase tracking-wide leading-tight px-1 ${
                                                                        step.active ? 'text-amber-600'
                                                                        : step.done ? 'text-green-600'
                                                                        : (step as any).waiting ? 'text-gray-400'
                                                                        : 'text-gray-300'
                                                                    }`}>
                                                                        {step.label}
                                                                    </p>
                                                                    {step.date && (
                                                                        <p className={`text-[8px] text-center mt-0.5 font-medium ${(step as any).waiting ? 'text-amber-400 italic' : 'text-gray-400'}`}>{step.date}</p>
                                                                    )}
                                                                </div>
                                                                {/* Connector Line */}
                                                                {i < steps.length - 1 && (
                                                                    <div className={`h-0.5 w-6 mt-4 shrink-0 ${step.done ? 'bg-green-400' : 'bg-gray-200'}`} />
                                                                )}
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            );
                                        })()}
                                    </div>

                                    {/* F: Review Remarks */}
                                    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
                                        <h4 className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-3">F. Review Remarks (Sent to Owner)</h4>
                                        <textarea
                                            value={remarks}
                                            onChange={e => setRemarks(e.target.value)}
                                            placeholder="Please provide additional owner-pet photos taken before the sighting date."
                                            className="w-full h-20 bg-gray-50 border border-gray-200 rounded-xl p-3.5 text-xs font-medium focus:outline-none focus:bg-white focus:ring-2 focus:ring-[#F97316]/20 focus:border-[#F97316]/50 transition-all resize-none leading-relaxed"
                                        />
                                        <p className="text-[9px] text-gray-400 font-medium mt-1.5">Optional remarks to guide the owner on what to submit.</p>
                                    </div>

                                    {/* G: Review Decision */}
                                    {selectedClaim.status !== 'Potential Owner Match' && selectedClaim.status !== 'Possible Match Found' && (
                                        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
                                            <h4 className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-4">G. Review Decision & Handover</h4>
                                            
                                            {selectedClaim.status === 'Handover Complete' || selectedClaim.status === 'Pet Received' ? (
                                                <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl space-y-2">
                                                    <div className="flex items-center gap-2 text-emerald-800 font-black text-xs uppercase tracking-wider">
                                                        <span>🎉</span>
                                                        <span>Pet Handover / Receipt Successfully Completed</span>
                                                    </div>
                                                    <p className="text-[11px] text-emerald-700 font-medium">
                                                        The animal has been verified, picked up, and safely reunited with its registered owner. The incident report and messaging are now officially archived.
                                                    </p>
                                                </div>
                                            ) : selectedClaim.status === 'Approved' ? (
                                                <div className="space-y-3">
                                                    <div className="p-3.5 bg-green-50 border border-green-200 rounded-xl space-y-1.5">
                                                        <div className="flex items-center gap-1.5 text-green-900 font-black text-xs uppercase tracking-wide">
                                                            <span>✓</span>
                                                            <span>Claim Approved — Ready for Pickup / Handover</span>
                                                        </div>
                                                        <p className="text-[11px] text-green-800 font-medium leading-relaxed">
                                                            Direct messaging is active with the owner. Once the resident picks up their pet, click the button below to complete the handover.
                                                        </p>
                                                    </div>

                                                    <div className="flex flex-col sm:flex-row gap-2">
                                                        <Button
                                                            fullWidth
                                                            disabled={isSubmitting}
                                                            onClick={() => handleUpdateStatus('Handover Complete')}
                                                            className="h-12 justify-start gap-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-black uppercase tracking-wider transition-all border-0 shadow-sm flex-1 cursor-pointer"
                                                            variant={'none' as any}
                                                            size="none"
                                                        >
                                                            <svg className="w-5 h-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>
                                                            <div className="text-left">
                                                                <p className="font-black">🤝 Mark Handover Complete</p>
                                                                <p className="text-[9px] font-medium opacity-90 normal-case tracking-normal">Confirm pet is reunited and close report</p>
                                                            </div>
                                                        </Button>

                                                        <Button
                                                            disabled={isSubmitting}
                                                            onClick={() => navigate(`/subd-messages?reportId=${selectedClaim.report_id}&openMatch=true`)}
                                                            className="h-12 px-4 justify-center gap-2 bg-orange-50 hover:bg-orange-100 text-[#F97316] border border-orange-200 rounded-xl text-xs font-black uppercase tracking-wider transition-all shadow-2xs shrink-0 cursor-pointer"
                                                            variant={'none' as any}
                                                            size="none"
                                                        >
                                                            <span>💬</span>
                                                            <span>Open Chat</span>
                                                        </Button>
                                                    </div>
                                                </div>
                                            ) : (
                                                <div className="space-y-2.5">
                                                    <Button
                                                        fullWidth
                                                        disabled={isSubmitting}
                                                        onClick={() => handleUpdateStatus('Approved')}
                                                        className="h-12 justify-start gap-3 bg-green-600 hover:bg-green-700 disabled:bg-gray-100 disabled:text-gray-400 text-white rounded-xl text-xs font-black uppercase tracking-wider transition-all border-0 shadow-sm cursor-pointer"
                                                        variant={'none' as any}
                                                        size="none"
                                                    >
                                                        <svg className="w-5 h-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                                                        <div className="text-left">
                                                            <p className="font-black">Approve Claim</p>
                                                            <p className="text-[9px] font-medium opacity-80 normal-case tracking-normal">Verify ownership and enable handover coordination</p>
                                                        </div>
                                                    </Button>
                                                    <Button
                                                        fullWidth
                                                        disabled={isSubmitting || selectedClaim.status === 'Evidence Requested'}
                                                        onClick={() => handleUpdateStatus('Evidence Requested')}
                                                        className="h-12 justify-start gap-3 bg-[#F97316] hover:bg-[#EA580C] disabled:bg-gray-100 disabled:text-gray-400 text-white rounded-xl text-xs font-black uppercase tracking-wider transition-all border-0 shadow-sm cursor-pointer"
                                                        variant={'none' as any}
                                                        size="none"
                                                    >
                                                        <svg className="w-5 h-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" /></svg>
                                                        <div className="text-left">
                                                            <p className="font-black">Request More Evidence</p>
                                                            <p className="text-[9px] font-medium opacity-80 normal-case tracking-normal">Ask owner for additional documents</p>
                                                        </div>
                                                    </Button>
                                                    <Button
                                                        fullWidth
                                                        disabled={isSubmitting || selectedClaim.status === 'Rejected'}
                                                        onClick={() => handleUpdateStatus('Rejected')}
                                                        className="h-12 justify-start gap-3 bg-red-600 hover:bg-red-700 disabled:bg-gray-100 disabled:text-gray-400 text-white rounded-xl text-xs font-black uppercase tracking-wider transition-all border-0 shadow-sm cursor-pointer"
                                                        variant={'none' as any}
                                                        size="none"
                                                    >
                                                        <svg className="w-5 h-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                                                        <div className="text-left">
                                                            <p className="font-black">Reject Claim</p>
                                                            <p className="text-[9px] font-medium opacity-80 normal-case tracking-normal">Insufficient evidence to approve</p>
                                                        </div>
                                                    </Button>
                                                </div>
                                            )}

                                            {/* Footer Reviewer Info */}
                                            <div className="mt-4 pt-4 border-t border-gray-100 flex flex-wrap items-center justify-between gap-2 text-[9px] text-gray-400 font-medium">
                                                <span>Reviewed By: <strong className="text-gray-600">{staffUser?.name || 'Juan Dela Cruz'}</strong> (Subdivision Leader)</span>
                                                <span>Review Date: {new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })} {new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}</span>
                                                <span>Last Updated: {new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })} {new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}</span>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </main>

            {/* ─── Citizen Simulator Modal ─── */}


            {/* ─── Lightbox ─── */}
            {lightboxImage && (
                <div className="fixed inset-0 z-[2000] bg-black/85 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setLightboxImage(null)}>
                    <div className="relative max-w-3xl w-full" onClick={e => e.stopPropagation()}>
                        <button onClick={() => setLightboxImage(null)} className="absolute -top-12 right-0 px-4 py-2 bg-white/10 hover:bg-white/20 rounded-full text-white text-xs font-black transition-all cursor-pointer uppercase tracking-widest border-0 flex items-center gap-2">
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" /></svg>
                            Close
                        </button>
                        <div className="w-full max-h-[80vh] rounded-2xl overflow-hidden bg-black flex items-center justify-center shadow-2xl border border-white/10">
                            <img src={lightboxImage} className="max-w-full max-h-[80vh] object-contain" alt="Preview" />
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default SubdPetClaims;
