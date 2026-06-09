import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import SubdSidebar from '../../components/SubdSidebar';
import SubdNavbar from '../../components/Navbars/SubdNavbar';
import MapComponent from '../../components/MapComponent';
import Button from '../../components/Button';
import Select from '../../components/Dropdown';

// ─── Mock Data ───────────────────────────────────────────────────────────────
const MOCK_CLAIMS = [
    {
        claim_id: 101,
        report_id: 2004,
        pet_id: 1,
        status: 'Under Review',
        remarks: '',
        similarity_score: 90,
        reported_date: 'June 6, 2026',
        claim_date: 'June 6, 2026',
        claim_time: '10:25 AM',
        sighting_location: 'Selera Homes',
        sighting_lat: 14.8018,
        sighting_lng: 121.0035,
        description: 'Nangangat yung aso na ito mag ingat.',
        sighting_photo: 'https://images.unsplash.com/photo-1589941013453-ec89f33b5e95?w=600&auto=format&fit=crop',
        pet: {
            pet_name: 'Bruno',
            pet_type: 'Dog',
            breed: 'Aspin',
            gender: 'Male',
            primary_color: 'Brown',
            secondary_color: 'Black',
            distinctive_markings: 'Brown ears with black back markings.',
            registered_address: 'Selera Homes',
            registered_since: 'January 2025',
            registered_latitude: 14.801496,
            registered_longitude: 121.003280,
            photo_url: 'https://images.unsplash.com/photo-1543466835-00a7907e9de1?w=600&auto=format&fit=crop',
            owner: {
                name: 'John Doe',
                email: 'johndoe@gmail.com',
                phone: '09283040403',
            },
        },
        evidence_url: 'https://images.unsplash.com/photo-1584036561566-baf241f8022a?w=600&auto=format&fit=crop',
        evidence_filename: 'bruno_vaccine_card.pdf',
        evidence_uploaded: 'Uploaded on June 5, 2026',
        previous_photos: [
            'https://images.unsplash.com/photo-1530281700549-e82e7bf110d6?w=400&auto=format&fit=crop',
            'https://images.unsplash.com/photo-1548199973-03cce0bbc87b?w=400&auto=format&fit=crop',
        ],
        owner_pet_photos: [
            'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=400&auto=format&fit=crop',
            'https://images.unsplash.com/photo-1587300003388-59208cc962cb?w=400&auto=format&fit=crop',
        ],
        supporting_docs: [
            { name: 'Affidavit of Ownership.pdf', color: 'blue' },
            { name: 'Vet Record - Bruno.pdf', color: 'green' },
            { name: 'Barangay Residency.pdf', color: 'orange' },
        ],
        owner_notes: 'Bruno escaped after fireworks during the fiesta and has been missing for 3 days.',
        distance: '50m',
        distance_meters: 50,
        match_found_date: 'June 5, 2026',
        claim_submitted_date: 'June 6, 2026',
    },
    {
        claim_id: 102,
        report_id: 2005,
        pet_id: 2,
        status: 'Evidence Requested',
        remarks: 'Please provide additional owner-pet photos taken before the sighting date.',
        similarity_score: 87,
        reported_date: 'June 5, 2026',
        claim_date: 'June 5, 2026',
        claim_time: '02:40 PM',
        sighting_location: 'Selera Homes',
        sighting_lat: 14.8005,
        sighting_lng: 121.0042,
        description: 'Friendly stray looking for shelter near the subdivision gate.',
        sighting_photo: 'https://images.unsplash.com/photo-1514888286974-6c03e2ca1dba?w=600&auto=format&fit=crop',
        pet: {
            pet_name: 'Max',
            pet_type: 'Dog',
            breed: 'Shih Tzu',
            gender: 'Male',
            primary_color: 'Black',
            secondary_color: 'White',
            distinctive_markings: 'White paws with white chest patch.',
            registered_address: 'Selera Homes',
            registered_since: 'March 2024',
            registered_latitude: 14.7995,
            registered_longitude: 121.0038,
            photo_url: 'https://images.unsplash.com/photo-1530281700549-e82e7bf110d6?w=600&auto=format&fit=crop',
            owner: {
                name: 'Maria Cruz',
                email: 'mariacruz@gmail.com',
                phone: '09187654321',
            },
        },
        evidence_url: '',
        evidence_filename: '',
        evidence_uploaded: '',
        previous_photos: [],
        owner_pet_photos: [],
        supporting_docs: [],
        owner_notes: '',
        distance: '120m',
        distance_meters: 120,
        match_found_date: 'June 4, 2026',
        claim_submitted_date: 'June 5, 2026',
    },
    {
        claim_id: 103,
        report_id: 2006,
        pet_id: 3,
        status: 'Approved',
        remarks: 'Claim verified. Owner has matched photos and coordinates successfully.',
        similarity_score: 95,
        reported_date: 'June 4, 2026',
        claim_date: 'June 4, 2026',
        claim_time: '11:15 AM',
        sighting_location: 'Phase 3, Selera Homes',
        sighting_lat: 14.8022,
        sighting_lng: 121.0028,
        description: 'Fluffy dog stray resting near the subdivision garden.',
        sighting_photo: 'https://images.unsplash.com/photo-1587300003388-59208cc962cb?w=600&auto=format&fit=crop',
        pet: {
            pet_name: 'Brownie',
            pet_type: 'Dog',
            breed: 'Aspin',
            gender: 'Male',
            primary_color: 'Brown',
            secondary_color: 'Tan',
            distinctive_markings: 'Tan legs with dark brown ears.',
            registered_address: 'Phase 3, Selera Homes',
            registered_since: 'February 2023',
            registered_latitude: 14.802461,
            registered_longitude: 121.003280,
            photo_url: 'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=600&auto=format&fit=crop',
            owner: {
                name: 'Juan Cruz',
                email: 'juancruz@gmail.com',
                phone: '09192233445',
            },
        },
        evidence_url: 'https://images.unsplash.com/photo-1584036561566-baf241f8022a?w=600&auto=format&fit=crop',
        evidence_filename: 'brownie_vaccine.pdf',
        evidence_uploaded: 'Uploaded on June 3, 2026',
        previous_photos: [
            'https://images.unsplash.com/photo-1543466835-00a7907e9de1?w=400&auto=format&fit=crop',
        ],
        owner_pet_photos: [
            'https://images.unsplash.com/photo-1548199973-03cce0bbc87b?w=400&auto=format&fit=crop',
        ],
        supporting_docs: [
            { name: 'pet_passport.pdf', color: 'blue' },
        ],
        owner_notes: 'She ran out when we were unloading groceries. Thank you for rescuing her!',
        distance: '25m',
        distance_meters: 25,
        match_found_date: 'June 3, 2026',
        claim_submitted_date: 'June 4, 2026',
    },
];

// ─── Helpers ─────────────────────────────────────────────────────────────────
const getStatusStyles = (status: string) => {
    switch (status) {
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

    const [claims, setClaims] = useState<any[]>(MOCK_CLAIMS);
    const [selectedClaim, setSelectedClaim] = useState<any>(null);
    const [remarks, setRemarks] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [statusFilter, setStatusFilter] = useState('All Claims');
    const [searchQuery, setSearchQuery] = useState('');
    const [viewMode, setViewMode] = useState<'list' | 'review'>('list');
    const [lightboxImage, setLightboxImage] = useState<string | null>(null);
    const [isSimulateModalOpen, setIsSimulateModalOpen] = useState(false);
    const [openKebab, setOpenKebab] = useState<number | null>(null);
    const kebabRef = useRef<HTMLDivElement>(null);

    const [simFormData, setSimFormData] = useState({
        petName: 'Bruno',
        notes: '',
        hasVaccineCard: true,
        docsList: 'pet_registration.jpg',
    });

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

    const fetchBackendClaims = async () => {
        try {
            const url = staffUser?.subdivision_id
                ? `http://localhost:8000/claims/?subdivision_id=${staffUser.subdivision_id}`
                : 'http://localhost:8000/claims/';
            const res = await axios.get(url);
            let merged = [...MOCK_CLAIMS];
            if (res.data?.length > 0) {
                const transformed = res.data.map((bc: any) => {
                    const mock = MOCK_CLAIMS.find(m => m.report_id === bc.report_id);
                    return {
                        claim_id: bc.claim_id,
                        report_id: bc.report_id,
                        pet_id: bc.pet_id,
                        status: bc.status,
                        remarks: bc.remarks || '',
                        similarity_score: mock?.similarity_score || 90,
                        reported_date: bc.report?.created_at ? new Date(bc.report.created_at).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : 'June 6, 2026',
                        claim_date: mock?.claim_date || 'June 6, 2026',
                        claim_time: mock?.claim_time || '10:25 AM',
                        sighting_location: bc.report?.landmark || 'Selera Homes',
                        sighting_lat: bc.report?.latitude ? parseFloat(bc.report.latitude) : 14.8018,
                        sighting_lng: bc.report?.longitude ? parseFloat(bc.report.longitude) : 121.0035,
                        description: bc.report?.description || 'Roaming stray animal',
                        sighting_photo: bc.report?.media?.[0]?.file_url || mock?.sighting_photo || '',
                        pet: {
                            pet_name: bc.pet?.pet_name || 'Unknown',
                            pet_type: bc.pet?.pet_type || 'Dog',
                            breed: bc.pet?.breed || 'Unknown',
                            gender: bc.pet?.gender || 'Unknown',
                            primary_color: bc.pet?.primary_color || 'Brown',
                            secondary_color: bc.pet?.secondary_color || '',
                            distinctive_markings: bc.pet?.distinctive_markings || bc.pet?.color_markings || '',
                            registered_address: bc.pet?.registered_address || 'Selera Homes',
                            registered_since: mock?.pet.registered_since || 'January 2025',
                            registered_latitude: bc.pet?.registered_latitude ? parseFloat(bc.pet.registered_latitude) : 14.801496,
                            registered_longitude: bc.pet?.registered_longitude ? parseFloat(bc.pet.registered_longitude) : 121.003280,
                            photo_url: bc.pet?.photo_url || mock?.pet.photo_url || '',
                            owner: {
                                name: bc.pet?.owner?.name || 'Citizen',
                                email: bc.pet?.owner?.email || '',
                                phone: bc.pet?.owner?.phone || '',
                            },
                        },
                        evidence_url: bc.evidence_url || '',
                        evidence_filename: mock?.evidence_filename || '',
                        evidence_uploaded: mock?.evidence_uploaded || '',
                        previous_photos: mock?.previous_photos || [],
                        owner_pet_photos: mock?.owner_pet_photos || [],
                        supporting_docs: mock?.supporting_docs || [],
                        owner_notes: bc.remarks || '',
                        distance: mock?.distance || '50m',
                        distance_meters: mock?.distance_meters || 50,
                        match_found_date: mock?.match_found_date || 'June 5, 2026',
                        claim_submitted_date: mock?.claim_submitted_date || 'June 6, 2026',
                    };
                });
                merged = [...transformed];
                MOCK_CLAIMS.forEach(m => { if (!merged.some(t => t.report_id === m.report_id)) merged.push(m); });
            }
            const localStr = localStorage.getItem('straysafe_claims_submitted');
            if (localStr) {
                const local = JSON.parse(localStr);
                local.forEach((lc: any) => { merged = merged.filter(m => m.report_id !== lc.report_id); merged.unshift(lc); });
            }
            setClaims(merged);
        } catch {
            let merged = [...MOCK_CLAIMS];
            const localStr = localStorage.getItem('straysafe_claims_submitted');
            if (localStr) {
                const local = JSON.parse(localStr);
                local.forEach((lc: any) => { merged = merged.filter(m => m.report_id !== lc.report_id); merged.unshift(lc); });
            }
            setClaims(merged);
        }
    };

    const handleUpdateStatus = (status: 'Approved' | 'Rejected' | 'Evidence Requested') => {
        if (!selectedClaim) return;
        setIsSubmitting(true);
        setTimeout(() => {
            const updated = claims.map(c => c.claim_id === selectedClaim.claim_id ? { ...c, status, remarks } : c);
            setClaims(updated);
            const fresh = updated.find(c => c.claim_id === selectedClaim.claim_id);
            setSelectedClaim(fresh);
            const localStr = localStorage.getItem('straysafe_claims_submitted');
            if (localStr) {
                const local = JSON.parse(localStr).map((c: any) =>
                    c.claim_id === selectedClaim.claim_id || c.report_id === selectedClaim.report_id
                        ? { ...c, status, remarks } : c
                );
                localStorage.setItem('straysafe_claims_submitted', JSON.stringify(local));
            }
            try { axios.patch(`http://localhost:8000/claims/${selectedClaim.claim_id}/status`, { status, remarks }); } catch { }
            setRemarks('');
            setIsSubmitting(false);
        }, 600);
    };

    const handleSimulateSubmission = () => {
        setIsSubmitting(true);
        setTimeout(() => {
            const newClaim = {
                claim_id: Date.now(),
                report_id: 2000 + Math.floor(Math.random() * 100),
                pet_id: 10,
                status: 'Under Review',
                remarks: '',
                similarity_score: 90,
                reported_date: 'June 6, 2026',
                claim_date: 'June 6, 2026',
                claim_time: '09:00 AM',
                sighting_location: 'Selera Homes',
                sighting_lat: 14.8018,
                sighting_lng: 121.0035,
                description: 'Nangangat yung aso na ito mag ingat.',
                sighting_photo: 'https://images.unsplash.com/photo-1548199973-03cce0bbc87b?w=600&auto=format&fit=crop',
                pet: {
                    pet_name: simFormData.petName,
                    pet_type: 'Dog',
                    breed: 'Aspin',
                    gender: 'Male',
                    primary_color: 'Brown',
                    secondary_color: 'Black',
                    distinctive_markings: 'Brown ears with black back markings.',
                    registered_address: 'Selera Homes',
                    registered_since: 'January 2025',
                    registered_latitude: 14.801496,
                    registered_longitude: 121.003280,
                    photo_url: 'https://images.unsplash.com/photo-1530281700549-e82e7bf110d6?w=600&auto=format&fit=crop',
                    owner: { name: 'John Doe', email: 'johndoe@gmail.com', phone: '09171234567' },
                },
                evidence_url: simFormData.hasVaccineCard ? 'https://images.unsplash.com/photo-1584036561566-baf241f8022a?w=600&auto=format&fit=crop' : '',
                evidence_filename: simFormData.hasVaccineCard ? 'vaccine_card_scan.jpg' : '',
                evidence_uploaded: simFormData.hasVaccineCard ? 'Uploaded on June 6, 2026' : '',
                previous_photos: ['https://images.unsplash.com/photo-1548199973-03cce0bbc87b?w=400&auto=format&fit=crop'],
                owner_pet_photos: ['https://images.unsplash.com/photo-1530281700549-e82e7bf110d6?w=400&auto=format&fit=crop'],
                supporting_docs: simFormData.docsList ? [{ name: simFormData.docsList, color: 'blue' }] : [],
                owner_notes: simFormData.notes || 'Owner submitted simulated claim',
                distance: '50m',
                distance_meters: 50,
                match_found_date: 'June 5, 2026',
                claim_submitted_date: 'June 6, 2026',
            };
            setClaims(prev => [newClaim, ...prev]);
            setIsSubmitting(false);
            setIsSimulateModalOpen(false);
        }, 800);
    };

    const filteredClaims = claims.filter(c => {
        const q = searchQuery.toLowerCase();
        const matchesQ = c.pet?.pet_name?.toLowerCase().includes(q) || c.pet?.owner?.name?.toLowerCase().includes(q) || c.status?.toLowerCase().includes(q);
        const matchesF = statusFilter === 'All Claims' || c.status?.toLowerCase() === statusFilter.toLowerCase();
        return matchesQ && matchesF;
    });

    const pendingCount = claims.filter(c => c.status === 'Under Review' || c.status === 'Pending Review').length;
    const approvedCount = claims.filter(c => c.status === 'Approved').length;
    const rejectedCount = claims.filter(c => c.status === 'Rejected').length;
    const avgMatch = claims.length > 0 ? Math.round(claims.reduce((a, c) => a + (c.similarity_score || 0), 0) / claims.length) : 0;

    const openReview = (claim: any) => { setSelectedClaim(claim); setRemarks(claim.remarks || ''); setViewMode('review'); };

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
                                            onClick={() => setIsSimulateModalOpen(true)}
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
                                                                <img src={claim.pet?.photo_url || claim.sighting_photo} alt={claim.pet?.pet_name} className="w-full h-full object-cover" />
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
                                                    <div className="flex items-start gap-2 px-1">
                                                        <svg className="w-3 h-3 text-[#F97316] mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" /></svg>
                                                        <div className="min-w-0">
                                                            <p className="text-[10px] font-bold text-gray-800 leading-none">{selectedClaim.sighting_location}</p>
                                                            <p className="text-[8px] font-mono text-gray-400 mt-1">{selectedClaim.sighting_lat?.toFixed(6)}, {selectedClaim.sighting_lng?.toFixed(6)}</p>
                                                        </div>
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
                                                            <li className="col-span-2"><span className="text-gray-400 font-semibold">Colors: </span><span className="font-bold text-gray-800">{selectedClaim.pet?.primary_color} {selectedClaim.pet?.secondary_color ? `/ ${selectedClaim.pet.secondary_color}` : ''}</span></li>
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
                                                    <td className="py-2.5 px-4 text-right font-extrabold text-green-600">Match</td>
                                                </tr>
                                                <tr className="hover:bg-gray-50/50">
                                                    <td className="py-2.5 px-4 text-gray-600 font-medium">Breed Similarity</td>
                                                    <td className="py-2.5 px-4 text-right font-extrabold text-green-600">92% Confidence</td>
                                                </tr>
                                                <tr className="hover:bg-gray-50/50">
                                                    <td className="py-2.5 px-4 text-gray-600 font-medium">Color Match</td>
                                                    <td className="py-2.5 px-4 text-right font-extrabold text-green-600">Confirmed</td>
                                                </tr>
                                                <tr className="hover:bg-gray-50/50">
                                                    <td className="py-2.5 px-4 text-gray-600 font-medium">Markings Match</td>
                                                    <td className="py-2.5 px-4 text-right font-extrabold text-green-600">Confirmed</td>
                                                </tr>
                                                <tr className="hover:bg-gray-50/50">
                                                    <td className="py-2.5 px-4 text-gray-600 font-medium">Location Distance</td>
                                                    <td className="py-2.5 px-4 text-right font-bold text-gray-700">{selectedClaim.distance_meters} meters</td>
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
                                                <p className="text-[10px] font-medium opacity-80">Strong similarity detected by AI</p>
                                            </div>
                                        </div>
                                    </div>
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
                                                            <button onClick={() => alert('[Download] Downloading...')} className="p-1.5 bg-white hover:bg-gray-100 border border-gray-200 rounded-lg transition-colors cursor-pointer">
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
                                                <div className="bg-gray-50 border border-gray-100 rounded-xl p-3 min-h-[80px]">
                                                    <p className="text-[11px] font-medium text-gray-600 italic leading-relaxed">
                                                        {selectedClaim.owner_notes || 'No additional notes provided.'}
                                                    </p>
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    {/* D: Location Verification */}
                                    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
                                        <h4 className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-4">D. Location Verification</h4>
                                        <div className="w-full rounded-xl overflow-hidden border border-gray-100" style={{ height: '200px' }}>
                                            <MapComponent
                                                height="100%"
                                                center={[selectedClaim.sighting_lat, selectedClaim.sighting_lng]}
                                                zoom={15}
                                                showHeatmap={false}
                                                showGeofence={true}
                                                markers={[
                                                    { id: 1, lat: selectedClaim.sighting_lat, lng: selectedClaim.sighting_lng, title: 'Sighting Location', category: 'Stray Sighting', color: 'orange' },
                                                    { id: 2, lat: selectedClaim.pet?.registered_latitude || selectedClaim.sighting_lat - 0.0004, lng: selectedClaim.pet?.registered_longitude || selectedClaim.sighting_lng - 0.0003, title: 'Registered Owner Home', category: 'User Location' },
                                                ]}
                                            />
                                        </div>
                                        <div className="grid grid-cols-3 gap-3 mt-3">
                                            <div className="bg-gray-50 rounded-xl p-3 border border-gray-100">
                                                <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Sighting Location</p>
                                                <p className="text-xs font-bold text-gray-800 mt-1">{selectedClaim.sighting_location}</p>
                                                <p className="text-[9px] font-mono text-gray-400 mt-0.5">{selectedClaim.sighting_lat?.toFixed(6)}, {selectedClaim.sighting_lng?.toFixed(5)}</p>
                                            </div>
                                            <div className="bg-gray-50 rounded-xl p-3 border border-gray-100">
                                                <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Registered Address</p>
                                                <p className="text-xs font-bold text-gray-800 mt-1">{selectedClaim.pet?.registered_address}</p>
                                                <p className="text-[9px] font-mono text-gray-400 mt-0.5">{selectedClaim.pet?.registered_latitude?.toFixed(6)}, {selectedClaim.pet?.registered_longitude?.toFixed(6)}</p>
                                            </div>
                                            <div className="bg-gray-50 rounded-xl p-3 border border-gray-100">
                                                <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Distance</p>
                                                <p className="text-xl font-black text-green-600 mt-1">{selectedClaim.distance_meters} meters</p>
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
                                            const steps = [
                                                { label: 'Potential Match Found', date: selectedClaim.match_found_date, done: true, active: false },
                                                { label: 'Claim Submitted', date: selectedClaim.claim_submitted_date, done: true, active: false },
                                                { label: 'Under Review', date: selectedClaim.claim_date, done: selectedClaim.status !== 'Under Review' && selectedClaim.status !== 'Pending Review', active: selectedClaim.status === 'Under Review' || selectedClaim.status === 'Pending Review' },
                                                { label: 'Evidence Requested', date: null, done: selectedClaim.status === 'Approved' || selectedClaim.status === 'Rejected', active: selectedClaim.status === 'Evidence Requested', skip: selectedClaim.status === 'Approved' || selectedClaim.status === 'Rejected' },
                                                { label: 'Approved', date: null, done: selectedClaim.status === 'Approved', active: selectedClaim.status === 'Approved' },
                                                { label: 'Rejected', date: null, done: selectedClaim.status === 'Rejected', active: selectedClaim.status === 'Rejected' },
                                            ];
                                            return (
                                                <div className="flex items-start gap-0 overflow-x-auto pb-2">
                                                    {steps.map((step, i) => (
                                                        <div key={i} className="flex items-start shrink-0" style={{ minWidth: '90px' }}>
                                                            <div className="flex flex-col items-center flex-1">
                                                                {/* Circle */}
                                                                <div className={`w-8 h-8 rounded-full flex items-center justify-center border-2 shrink-0 z-10 text-xs font-black transition-all ${step.active ? 'bg-amber-400 border-amber-400 text-white shadow-md shadow-amber-200' : step.done ? 'bg-green-500 border-green-500 text-white' : 'bg-white border-gray-200 text-gray-300'}`}>
                                                                    {step.done ? '✓' : step.active ? '●' : '○'}
                                                                </div>
                                                                {/* Label */}
                                                                <p className={`text-center text-[8.5px] font-black mt-2 uppercase tracking-wide leading-tight px-1 ${step.active ? 'text-amber-600' : step.done ? 'text-green-600' : 'text-gray-300'}`}>
                                                                    {step.label}
                                                                </p>
                                                                {step.date && (
                                                                    <p className="text-[8px] text-gray-400 text-center mt-0.5 font-medium">{step.date}</p>
                                                                )}
                                                            </div>
                                                            {/* Connector Line */}
                                                            {i < steps.length - 1 && (
                                                                <div className={`h-0.5 w-6 mt-4 shrink-0 ${step.done ? 'bg-green-400' : 'bg-gray-200'}`} />
                                                            )}
                                                        </div>
                                                    ))}
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
                                    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
                                        <h4 className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-4">G. Review Decision</h4>
                                        <div className="space-y-2.5">
                                            <Button
                                                fullWidth
                                                disabled={isSubmitting || selectedClaim.status === 'Approved'}
                                                onClick={() => handleUpdateStatus('Approved')}
                                                className="h-12 justify-start gap-3 bg-green-600 hover:bg-green-700 disabled:bg-gray-100 disabled:text-gray-400 text-white rounded-xl text-xs font-black uppercase tracking-wider transition-all border-0 shadow-sm"
                                                variant={'none' as any}
                                                size="none"
                                            >
                                                <svg className="w-5 h-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                                                <div className="text-left">
                                                    <p className="font-black">Approve Claim</p>
                                                    <p className="text-[9px] font-medium opacity-80 normal-case tracking-normal">Mark as verified and notify Barangay</p>
                                                </div>
                                            </Button>
                                            <Button
                                                fullWidth
                                                disabled={isSubmitting || selectedClaim.status === 'Evidence Requested'}
                                                onClick={() => handleUpdateStatus('Evidence Requested')}
                                                className="h-12 justify-start gap-3 bg-[#F97316] hover:bg-[#EA580C] disabled:bg-gray-100 disabled:text-gray-400 text-white rounded-xl text-xs font-black uppercase tracking-wider transition-all border-0 shadow-sm"
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
                                                className="h-12 justify-start gap-3 bg-red-600 hover:bg-red-700 disabled:bg-gray-100 disabled:text-gray-400 text-white rounded-xl text-xs font-black uppercase tracking-wider transition-all border-0 shadow-sm"
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

                                        {/* Footer Reviewer Info */}
                                        <div className="mt-4 pt-4 border-t border-gray-100 flex flex-wrap items-center justify-between gap-2 text-[9px] text-gray-400 font-medium">
                                            <span>Reviewed By: <strong className="text-gray-600">{staffUser?.name || 'Juan Dela Cruz'}</strong> (Subdivision Leader)</span>
                                            <span>Review Date: {new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })} {new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}</span>
                                            <span>Last Updated: {new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })} {new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}</span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </main>

            {/* ─── Citizen Simulator Modal ─── */}
            {isSimulateModalOpen && (
                <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
                    <div className="relative w-full max-w-lg bg-white rounded-2xl p-7 shadow-2xl flex flex-col max-h-[90vh] overflow-y-auto custom-scrollbar">
                        <div className="flex justify-between items-center pb-4 mb-5 border-b border-gray-100">
                            <div>
                                <h3 className="text-base font-black text-gray-900 uppercase tracking-tight">Claim Submission Simulator</h3>
                                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mt-1">Simulate owner response to AI stray matching</p>
                            </div>
                            <button onClick={() => setIsSimulateModalOpen(false)} className="p-1.5 hover:bg-gray-50 rounded-xl transition-all text-gray-400 hover:text-gray-700 focus:outline-none cursor-pointer">
                                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" /></svg>
                            </button>
                        </div>
                        <div className="space-y-4 text-xs">
                            <div>
                                <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest block mb-1.5">Registered Pet Name</label>
                                <input type="text" value={simFormData.petName} onChange={e => setSimFormData({ ...simFormData, petName: e.target.value })} className="w-full h-10 px-3.5 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#F97316]/20 focus:border-[#F97316]/50 transition-all font-medium" />
                            </div>
                            <div>
                                <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest block mb-1.5">Vaccination Card</label>
                                <div className="border border-dashed border-orange-200 bg-orange-50/20 rounded-xl p-3.5 flex justify-between items-center">
                                    <div className="flex items-center gap-2"><span className="text-lg">📋</span><p className="text-[10.5px] font-bold text-gray-700">vaccine_card_scan.jpg</p></div>
                                    <label className="flex items-center gap-2 cursor-pointer">
                                        <input type="checkbox" checked={simFormData.hasVaccineCard} onChange={e => setSimFormData({ ...simFormData, hasVaccineCard: e.target.checked })} className="w-4 h-4 accent-[#F97316]" />
                                        <span className="text-[9.5px] font-black text-gray-500 uppercase">Attach</span>
                                    </label>
                                </div>
                            </div>
                            <div>
                                <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest block mb-1.5">Supporting Document</label>
                                <input type="text" value={simFormData.docsList} placeholder="e.g. dog_license_2026.pdf" onChange={e => setSimFormData({ ...simFormData, docsList: e.target.value })} className="w-full h-10 px-3.5 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#F97316]/20 focus:border-[#F97316]/50 transition-all font-medium" />
                            </div>
                            <div>
                                <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest block mb-1.5">Additional Notes</label>
                                <textarea value={simFormData.notes} onChange={e => setSimFormData({ ...simFormData, notes: e.target.value })} placeholder="Enter details to prove ownership..." className="w-full h-20 bg-gray-50 border border-gray-200 rounded-xl p-3.5 focus:outline-none focus:ring-2 focus:ring-[#F97316]/20 focus:border-[#F97316]/50 transition-all resize-none font-medium" />
                            </div>
                        </div>
                        <div className="mt-6 flex gap-3">
                            <Button onClick={() => setIsSimulateModalOpen(false)} variant="light" size="none" className="flex-1 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest">Cancel</Button>
                            <Button onClick={handleSimulateSubmission} variant="primary" size="none" className="flex-1 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest">File Simulated Claim</Button>
                        </div>
                    </div>
                </div>
            )}

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
