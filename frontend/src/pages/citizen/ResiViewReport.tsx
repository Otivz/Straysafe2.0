import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import axios from 'axios';
import RelativeTimestamp from '../../components/RelativeTimestamp';
import { MapContainer, TileLayer, Marker } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';

import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerIconRetina from 'leaflet/dist/images/marker-icon-2x.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';

import ResiNavbar from '../../components/Navbars/ResiNavbar';
import ResiMobileNav from '../../components/Navbars/ResiMobileNav';
import RescueTimeline from '../../components/RescueTimeline';

import ReturnToSeleraButton from '../../components/MapControls/ReturnToSeleraButton';

const DefaultIcon = L.icon({
    iconUrl: markerIcon,
    iconRetinaUrl: markerIconRetina,
    shadowUrl: markerShadow,
    iconSize: [25, 41],
    iconAnchor: [12, 41],
    popupAnchor: [1, -34],
    shadowSize: [41, 41]
});

L.Marker.prototype.options.icon = DefaultIcon;

const reportStatusMap: Record<number, string> = {
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

const categoryMap: Record<number, string> = {
    1: 'Injured Animal',
    2: 'Aggressive Stray',
    3: 'Possible Rabies Risk',
    4: 'Roaming Pack',
    5: 'Animal Rescue Needed'
};

const ResiViewReport = () => {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();

    const [report, setReport] = useState<any | null>(null);
    const [loading, setLoading] = useState(true);
    const [holdingAnimal, setHoldingAnimal] = useState<any | null>(null);
    const [isNavbarMenuOpen, setIsNavbarMenuOpen] = useState(false);
    const [isMobileSearchOpen, setIsMobileSearchOpen] = useState(false);
    const [activeGallery, setActiveGallery] = useState<{ media: any[], index: number } | null>(null);

    // Geocoding address
    const [resolvedAddress, setResolvedAddress] = useState('');
    const [isGeocoding, setIsGeocoding] = useState(false);

    const userStr = localStorage.getItem('resident_user');
    const currentUser = userStr ? JSON.parse(userStr) : null;
    const currentUserId = currentUser ? currentUser.user_id : null;

    const fetchReportDetails = async () => {
        if (!id) return;
        try {
            setLoading(true);
            const response = await axios.get(`http://localhost:8000/reports/${id}`);
            if (response.data) {
                setReport(response.data);

                // Fetch holding animal details if status suggests it is/was in holding
                try {
                    const holdingRes = await axios.get('http://localhost:8000/holding/');
                    const matchingAnimal = holdingRes.data.find((a: any) => a.report_id === Number(id));
                    if (matchingAnimal) {
                        const detailRes = await axios.get(`http://localhost:8000/holding/${matchingAnimal.holding_id}`);
                        setHoldingAnimal(detailRes.data);
                    } else {
                        setHoldingAnimal(null);
                    }
                } catch (err) {
                    console.error('Error fetching holding details:', err);
                    setHoldingAnimal(null);
                }
            } else {
                setReport(null);
                setHoldingAnimal(null);
            }
        } catch (error) {
            console.error('Error fetching report details:', error);
            setReport(null);
            setHoldingAnimal(null);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchReportDetails();
    }, [id]);

    useEffect(() => {
        if (!report) return;

        const fetchAddress = async () => {
            setIsGeocoding(true);
            try {
                const response = await axios.get('https://nominatim.openstreetmap.org/reverse', {
                    params: {
                        format: 'jsonv2',
                        lat: report.latitude,
                        lon: report.longitude,
                        addressdetails: 1
                    },
                    headers: {
                        'Accept-Language': 'en'
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
                    setResolvedAddress(addressStr);
                } else {
                    setResolvedAddress(`${parseFloat(report.latitude.toString()).toFixed(6)}, ${parseFloat(report.longitude.toString()).toFixed(6)}`);
                }
            } catch (err) {
                console.error('Error fetching address from Nominatim:', err);
                setResolvedAddress(`${parseFloat(report.latitude.toString()).toFixed(6)}, ${parseFloat(report.longitude.toString()).toFixed(6)}`);
            } finally {
                setIsGeocoding(false);
            }
        };

        fetchAddress();
    }, [report]);

    const handleBack = () => {
        if (window.history.length > 1) {
            navigate(-1);
        } else {
            navigate('/resident-home');
        }
    };

    if (loading) {
        return (
            <div className="min-h-screen bg-[#F7F7F7] font-sans pb-24">
                <ResiNavbar onMenuToggle={(isOpen) => setIsNavbarMenuOpen(isOpen)} />
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-32 pb-8 flex flex-col items-center justify-center h-[50vh]">
                    <div className="w-10 h-10 border-4 border-[#F97316] border-t-transparent rounded-full animate-spin mb-4" />
                    <p className="text-xs font-black text-gray-400 uppercase tracking-widest">Loading Report Details...</p>
                </div>
                <ResiMobileNav isNavbarMenuOpen={isNavbarMenuOpen} />
            </div>
        );
    }

    if (!report) {
        return (
            <div className="min-h-screen bg-[#F7F7F7] font-sans pb-24">
                <ResiNavbar onMenuToggle={(isOpen) => setIsNavbarMenuOpen(isOpen)} />
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-32 pb-8 flex flex-col items-center justify-center h-[50vh]">
                    <div className="w-16 h-16 bg-red-50 text-red-500 rounded-2xl flex items-center justify-center mb-6 border border-red-100">
                        <svg className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
                    </div>
                    <h2 className="text-xl font-black text-gray-900 uppercase tracking-tight mb-2">Report Not Found</h2>
                    <p className="text-xs text-gray-400 font-semibold mb-6">The incident report you are trying to view does not exist or has been deleted.</p>
                    <button onClick={handleBack} className="px-6 py-3 bg-[#F97316] text-white rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-lg shadow-orange-100">
                        Go Back
                    </button>
                </div>
                <ResiMobileNav isNavbarMenuOpen={isNavbarMenuOpen} />
            </div>
        );
    }

    const originalMedia = report.media?.filter((m: any) => !m.is_evidence) || [];
    const mainImage = originalMedia[0]?.file_url || 'https://images.unsplash.com/photo-1548199973-03cce0bbc87b?q=80&w=2069&auto=format&fit=crop';

    return (
        <div className="min-h-screen bg-[#F7F7F7] font-sans pb-24">
            <ResiNavbar
                onMenuToggle={(isOpen) => setIsNavbarMenuOpen(isOpen)}
                isMobileSearchOpen={isMobileSearchOpen}
                onCloseSearch={() => setIsMobileSearchOpen(false)}
            />

            <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-24 sm:pt-32 pb-24 md:pb-8">

                {/* Back Link Header */}
                <div className="flex items-center justify-between mb-8">
                    <button
                        onClick={handleBack}
                        className="flex items-center gap-2 group text-gray-500 hover:text-[#F97316] transition-colors"
                    >
                        <div className="w-10 h-10 rounded-xl bg-white border border-gray-200 flex items-center justify-center text-gray-400 group-hover:text-[#F97316] group-hover:border-orange-200 transition-all shadow-sm">
                            <svg className="w-5 h-5 transition-transform group-hover:-translate-x-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 19l-7-7 7-7" />
                            </svg>
                        </div>
                        <span className="text-[11px] font-black uppercase tracking-widest text-[#1a1208] group-hover:text-[#F97316] transition-colors">Go Back</span>
                    </button>

                    {report.user_id === currentUserId && report.status_id === 1 && (
                        <button
                            onClick={() => navigate('/resident-home', { state: { editReport: report, isViewMode: false, from: window.location.pathname } })}
                            className="px-5 py-3 bg-[#F97316] text-white rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-[#EA580C] transition-all flex items-center gap-2 shadow-lg shadow-orange-100 cursor-pointer"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                            </svg>
                            Edit Report
                        </button>
                    )}
                </div>

                {/* Cover Banner Title */}
                <div className="bg-white rounded-[2.5rem] border border-gray-100 p-8 sm:p-10 shadow-sm mb-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
                    <div className="flex items-center gap-6">
                        <div className="w-16 h-16 rounded-[1.5rem] bg-orange-50 flex items-center justify-center text-orange-600 border border-orange-100 shrink-0">
                            <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" /></svg>
                        </div>
                        <div>
                            <h1 className="text-xl sm:text-3xl font-black text-gray-900 uppercase tracking-tight">Rescue Case Intelligence</h1>
                            <div className="flex items-center gap-3 mt-1.5">
                                <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Report ID: #STR-{(report.report_id || 0).toString().padStart(4, '0')}</span>
                                <div className="w-1.5 h-1.5 rounded-full bg-gray-200" />
                                <span className="text-[10px] font-black text-orange-600 uppercase tracking-widest">{categoryMap[report.category_id] || 'Incident Report'}</span>
                            </div>
                        </div>
                    </div>
                    <div className="flex items-center gap-3 bg-[#FAFAF9] border border-gray-100 rounded-2xl p-4 w-fit">
                        <div className="flex items-center gap-2">
                            {report.visibility === 'Private' ? (
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                                </svg>
                            ) : (
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                                </svg>
                            )}
                            <span className="text-[10px] font-black text-gray-500 uppercase tracking-widest">{report.visibility} Sighting</span>
                        </div>
                    </div>
                </div>

                {/* Main Details Grid: Combined Media & Information Card on left, Rescue Timeline Card on right */}
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-stretch mt-10">

                    {/* Left Column: Combined Media & Information Card (7/12) */}
                    <div className="lg:col-span-7">
                        <div className="bg-white p-6 sm:p-8 rounded-[2.5rem] border border-gray-100 shadow-sm space-y-8 flex flex-col">
                            {/* Media Showcase Section */}
                            <div>
                                <div
                                    className="aspect-[4/3] rounded-[2rem] overflow-hidden shadow-inner relative group cursor-pointer"
                                    onClick={() => setActiveGallery({ media: originalMedia.length > 0 ? originalMedia : [{ file_url: mainImage, media_type: 'Image' }], index: 0 })}
                                >
                                    <img src={mainImage} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-1000 ease-out" alt="Main stray" />
                                    <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end p-6">
                                        <div className="flex items-center gap-2 text-white">
                                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                                            <span className="text-[10px] font-black uppercase tracking-widest">Click to view full gallery ({originalMedia.length})</span>
                                        </div>
                                    </div>
                                </div>

                                {originalMedia.length > 1 && (
                                    <div className="grid grid-cols-4 gap-3 mt-4">
                                        {originalMedia.slice(1, 5).map((m: any, idx: number) => (
                                            <div
                                                key={m.media_id}
                                                className="aspect-square rounded-xl overflow-hidden cursor-pointer shadow-sm border border-gray-50 relative group"
                                                onClick={() => setActiveGallery({ media: originalMedia, index: idx + 1 })}
                                            >
                                                {m.media_type === 'Video' ? (
                                                    <div className="w-full h-full relative">
                                                        <video src={m.file_url} className="w-full h-full object-cover" />
                                                        <div className="absolute inset-0 bg-black/25 flex items-center justify-center text-white">
                                                            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
                                                        </div>
                                                    </div>
                                                ) : (
                                                    <img src={m.file_url} className="w-full h-full object-cover group-hover:scale-110 transition-transform" alt="thumbnail" />
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>

                            {/* Information Details Section */}
                            {(() => {
                                const rawDesc = report.description || '';
                                const parts = rawDesc.split('|').map(p => p.trim());
                                let extractedPattern = '';
                                let extractedConditions = '';
                                let cleanNotes = '';

                                parts.forEach(part => {
                                    if (part.toLowerCase().startsWith('pattern:')) {
                                        extractedPattern = part.replace(/^pattern:\s*/i, '');
                                    } else if (part.toLowerCase().startsWith('observed conditions:')) {
                                        extractedConditions = part.replace(/^observed conditions:\s*/i, '');
                                    } else if (part.toLowerCase().startsWith('markings:')) {
                                        if (!extractedPattern) extractedPattern = part.replace(/^markings:\s*/i, '');
                                    } else if (part.toLowerCase().startsWith('notes:')) {
                                        cleanNotes = part.replace(/^notes:\s*/i, '');
                                    } else if (!extractedPattern && !extractedConditions && !cleanNotes) {
                                        cleanNotes = part;
                                    }
                                });

                                const displayType = report.animal_type || report.ai_animal_type || 'Unknown';
                                const displayBreed = (report.animal_breed && report.animal_breed.toLowerCase() !== 'unknown') ? report.animal_breed : (report.ai_possible_breed || 'Unknown');
                                const displayColor = report.animal_color || report.ai_dominant_color || 'Unknown';
                                const displaySize = report.estimated_size || report.ai_estimated_size || 'Medium';

                                return (
                                    <div className="space-y-6">
                                        {/* Rescue Status + Date row */}
                                        <div className="grid grid-cols-2 gap-4 pb-6 border-b border-gray-50">
                                            <div>
                                                <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1.5">Rescue Status</p>
                                                <p className="text-sm font-black text-orange-600 uppercase">{reportStatusMap[report.status_id] || 'Unknown'}</p>
                                            </div>
                                            <div>
                                                <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1.5">Date Reported</p>
                                                <p className="text-sm font-black text-[#1a1208] uppercase">
                                                    <RelativeTimestamp date={report.created_at} />
                                                </p>
                                            </div>
                                        </div>

                                        {/* Unified Animal Characteristics */}
                                        <div className="pb-6 space-y-3.5 border-b border-gray-50">
                                            <div className="flex justify-between items-center">
                                                <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Animal Type</span>
                                                <span className="text-xs font-black text-[#1a1208] uppercase">{displayType}</span>
                                            </div>
                                            <div className="flex justify-between items-center">
                                                <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Breed / Variety</span>
                                                <span className="text-xs font-black text-gray-900 uppercase">{displayBreed}</span>
                                            </div>
                                            <div className="flex justify-between items-center">
                                                <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Coat Color</span>
                                                <span className="text-xs font-black text-gray-900 uppercase">{displayColor}</span>
                                            </div>
                                            <div className="flex justify-between items-center">
                                                <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Estimated Size</span>
                                                <span className="text-xs font-black text-gray-900 uppercase">{displaySize}</span>
                                            </div>
                                            <div className="flex justify-between items-center">
                                                <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Animal Count</span>
                                                <span className="text-xs font-black text-gray-900 uppercase">{report.animal_count || 1} Animal(s)</span>
                                            </div>
                                            {extractedPattern && (
                                                <div className="flex justify-between items-center">
                                                    <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Coat Pattern / Markings</span>
                                                    <span className="text-xs font-black text-orange-600 uppercase">{extractedPattern}</span>
                                                </div>
                                            )}
                                            {report.is_possible_owned !== undefined && (
                                                <div className="flex justify-between items-center">
                                                    <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Ownership Indicator</span>
                                                    <span className={`text-xs font-black uppercase ${report.is_possible_owned ? 'text-amber-600' : 'text-gray-600'}`}>
                                                        {report.is_possible_owned ? 'Possible Owned Pet' : 'Uncollared Stray'}
                                                    </span>
                                                </div>
                                            )}
                                            {report.landmark && (
                                                <div className="flex justify-between items-center">
                                                    <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Landmark Location</span>
                                                    <span className="text-xs font-black text-gray-900 uppercase">{report.landmark}</span>
                                                </div>
                                            )}
                                        </div>

                                        {/* Observed Conditions & Incident Details */}
                                        {extractedConditions && (
                                            <div className="pb-6 border-b border-gray-50">
                                                <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-2">Observed Health & Behavior Conditions</p>
                                                <div className="flex flex-wrap gap-2">
                                                    {extractedConditions.split(',').map((cond, i) => (
                                                        <span key={i} className="px-3 py-1 bg-red-50 text-red-600 border border-red-100 rounded-full text-[10px] font-black uppercase tracking-wider">
                                                            🚨 {cond.trim()}
                                                        </span>
                                                    ))}
                                                </div>
                                            </div>
                                        )}

                                        {/* Cleaned Case Notes */}
                                        {cleanNotes && (
                                            <div>
                                                <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-2">Case Description & Notes</p>
                                                <p className="text-sm text-gray-750 leading-relaxed font-medium bg-stone-50/70 p-4 rounded-2xl border border-stone-100 italic">
                                                    "{cleanNotes}"
                                                </p>
                                            </div>
                                        )}
                                    </div>
                                );
                            })()}

                                         {/* Endorsement Letter section */}
                                         {report.endorsement_letter && (
                                              <div className="pt-6 mt-6 border-t border-gray-50 space-y-3">
                                                  <div className="bg-orange-50 border border-orange-100 rounded-3xl p-6">
                                                      <h4 className="text-[10px] font-black text-orange-600 uppercase tracking-widest mb-4">Subdivision Escalation Note</h4>
                                                      
                                                      {report.endorsement_letter.title && (
                                                          <p className="text-xs font-black text-orange-600 uppercase tracking-wider mb-2">
                                                              {report.endorsement_letter.title}
                                                          </p>
                                                      )}
                                                      
                                                      <p className="text-sm font-bold text-gray-900 leading-relaxed italic">
                                                          "{report.endorsement_letter.letter_content}"
                                                      </p>
                                                      
                                                      <div className="mt-4 flex items-center gap-3">
                                                          <div className="w-8 h-8 rounded-full bg-orange-200 flex items-center justify-center text-[10px] font-bold text-orange-700 border-2 border-white">
                                                              {report.endorsement_letter.leader_name?.charAt(0) || 'L'}
                                                          </div>
                                                          <div>
                                                              <p className="text-[10px] font-black text-gray-900 uppercase tracking-widest">Sent by:</p>
                                                              <p className="text-sm font-black text-orange-700">{report.endorsement_letter.leader_name || "Subdivision Leader"}</p>
                                                              <p className="text-[9px] text-gray-500 uppercase tracking-widest font-medium">
                                                                  {report.endorsement_letter.leader_position || "Subdivision Official"} • {new Date(report.endorsement_letter.issued_at).toLocaleDateString()}
                                                              </p>
                                                          </div>
                                                      </div>

                                                      {report.endorsement_letter.file_url && (() => {
                                                          const fileUrl = report.endorsement_letter.file_url;
                                                          const urlLower = fileUrl.toLowerCase();
                                                          const isDoc = urlLower.endsWith('.pdf') || urlLower.endsWith('.doc') || urlLower.endsWith('.docx');
                                                          const isImg = !isDoc && (urlLower.endsWith('.jpg') || urlLower.endsWith('.jpeg') || urlLower.endsWith('.png') || urlLower.endsWith('.webp'));
                                                          
                                                          return (
                                                              <div className="mt-5 space-y-3">
                                                                  <p className="text-[9px] font-black text-orange-600 uppercase tracking-[0.2em]">Endorsement Letter / Evidence</p>
                                                                  {isImg ? (
                                                                      <a href={fileUrl} target="_blank" rel="noopener noreferrer" className="block rounded-2xl overflow-hidden border border-orange-100 hover:opacity-90 transition-opacity shadow-sm">
                                                                          <img src={fileUrl} className="w-full max-h-64 object-cover" alt="Endorsement letter" />
                                                                      </a>
                                                                  ) : (
                                                                      <a
                                                                          href={fileUrl}
                                                                          target="_blank"
                                                                          rel="noopener noreferrer"
                                                                          className="w-full py-3 bg-white border border-orange-200 text-[#F97316] text-[9px] font-black uppercase tracking-[0.2em] rounded-xl hover:bg-orange-600 hover:text-white transition-all shadow-sm flex items-center justify-center gap-2"
                                                                      >
                                                                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                                                          </svg>
                                                                          View Official Endorsement Letter
                                                                      </a>
                                                                  )}
                                                              </div>
                                                          );
                                                      })()}
                                                  </div>
                                              </div>
                                          )}
                        </div>
                    </div>

                    {/* Right Column: Rescue Timeline Card (5/12) */}
                    <div className="lg:col-span-5 relative">
                        <div className="bg-white p-8 rounded-[2.5rem] border border-gray-100 shadow-sm flex flex-col h-full lg:h-auto min-h-[350px] lg:min-h-0 lg:absolute lg:inset-0">
                            <div className="flex items-end justify-between border-b border-gray-50 pb-4 shrink-0 mb-6">
                                <div>
                                    <h3 className="text-lg font-black text-gray-900 uppercase tracking-tight">Rescue Timeline</h3>
                                    <p className="text-[9px] font-bold text-gray-400 uppercase tracking-widest mt-1">Live sync updates from responders</p>
                                </div>
                                <div className="flex items-center gap-2 px-3 py-1.5 bg-green-50 rounded-full border border-green-100">
                                    <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                                    <span className="text-[8px] font-black text-green-600 uppercase tracking-widest">Live Sync</span>
                                </div>
                            </div>
                            <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar">
                                <RescueTimeline
                                    history={(() => {
                                        const h = [...(report.history || [])];
                                        if (holdingAnimal && holdingAnimal.timeline) {
                                            holdingAnimal.timeline.forEach((log: any) => {
                                                // Find media associated with this timeline log (prioritize database relationship)
                                                let logMedia = log.media || [];
                                                if (logMedia.length === 0) {
                                                    logMedia = report.media?.filter((m: any) => {
                                                        if (!m.is_evidence) return false;
                                                        if (m.holding_log_id && m.holding_log_id !== log.log_id) return false;
                                                        const diff = Math.abs(new Date(m.uploaded_at).getTime() - new Date(log.logged_at).getTime());
                                                        return diff <= 120000; // 2 minutes window
                                                    }) || [];
                                                }

                                                // Determine the mapped report status ID based on log title/event
                                                let statusId = 7; // default: Under Observation
                                                const titleLower = log.title.toLowerCase();
                                                if (log.event_type === 'outcome') {
                                                    if (titleLower.includes('deceased')) {
                                                        statusId = 12; // Deceased
                                                    } else if (titleLower.includes('claimed')) {
                                                        statusId = 9; // Claimed by Owner
                                                    } else if (titleLower.includes('released')) {
                                                        statusId = 10; // Released
                                                    } else {
                                                        statusId = 11; // Resolved
                                                    }
                                                }

                                                h.push({
                                                    history_id: 100000 + log.log_id,
                                                    report_status_id: statusId,
                                                    remarks: `${log.title}${log.notes ? ` — ${log.notes}` : ''}`,
                                                    created_at: log.logged_at,
                                                    updater_name: log.staff_name || 'Barangay Staff',
                                                    media: logMedia
                                                });
                                            });
                                        }
                                        return h.sort((a: any, b: any) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
                                    })()}
                                    currentStatusId={report.status_id}
                                    endorsementLetter={report.endorsement_letter}
                                />
                            </div>
                        </div>
                    </div>

                </div>

                {/* Location Intelligence (Map component - below the main content grid) */}
                <div className="bg-gray-900 text-white p-8 rounded-[2.5rem] shadow-xl relative overflow-hidden group mt-10">
                    <div className="absolute top-0 right-0 w-32 h-32 bg-white/5 rounded-full -translate-y-1/2 translate-x-1/2 group-hover:scale-150 transition-transform duration-700" />
                    <div className="relative z-10">
                        <h4 className="text-[10px] font-black text-orange-400 uppercase tracking-[0.2em] mb-4">Location Intelligence</h4>
                        <div className="flex items-start gap-4 mb-6">
                            <div className="w-10 h-10 rounded-2xl bg-white/10 flex items-center justify-center text-orange-400 shrink-0">
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                            </div>
                            <div>
                                <p className="text-sm font-black tracking-tight">{report.landmark || 'No landmark specified'}</p>
                                <p className="text-[9px] font-bold text-white/40 uppercase tracking-widest mt-1">
                                    {isGeocoding ? 'Resolving street...' : resolvedAddress || 'Santa Maria, Bulacan • Selera Homes'}
                                </p>
                            </div>
                        </div>
                        <div className="w-full h-[500px] rounded-2xl overflow-hidden border border-white/10 grayscale-[0.5] hover:grayscale-0 transition-all duration-500">
                            <MapContainer center={[report.latitude, report.longitude]} zoom={16} className="h-full w-full">
                                <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
                                <Marker position={[report.latitude, report.longitude]} />
                                <ReturnToSeleraButton />
                            </MapContainer>
                        </div>
                    </div>
                </div>



            </main>

            <ResiMobileNav
                isNavbarMenuOpen={isNavbarMenuOpen}
                isSearchOpen={isMobileSearchOpen}
                onSearchClick={() => setIsMobileSearchOpen(true)}
            />

            {/* Full-Screen Media Gallery Modal */}
            {activeGallery && (
                <div
                    className="fixed inset-0 z-[9999] bg-[#1a1208]/95 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-300"
                    onClick={() => setActiveGallery(null)}
                >
                    <button
                        className="absolute top-8 right-8 bg-white/10 hover:bg-white/20 text-white rounded-full p-3 transition-all z-[10001]"
                        onClick={(e) => { e.stopPropagation(); setActiveGallery(null); }}
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>

                    {activeGallery.media.length > 1 && (
                        <>
                            <button
                                className="absolute left-8 w-14 h-14 bg-white/10 hover:bg-white/20 text-white rounded-full flex items-center justify-center transition-all z-[10001] backdrop-blur-sm group/btn"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    const newIndex = (activeGallery.index - 1 + activeGallery.media.length) % activeGallery.media.length;
                                    setActiveGallery({ ...activeGallery, index: newIndex });
                                }}
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 group-hover/btn:-translate-x-1 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 19l-7-7 7-7" />
                                </svg>
                            </button>
                            <button
                                className="absolute right-8 w-14 h-14 bg-white/10 hover:bg-white/20 text-white rounded-full flex items-center justify-center transition-all z-[10001] backdrop-blur-sm group/btn"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    const newIndex = (activeGallery.index + 1) % activeGallery.media.length;
                                    setActiveGallery({ ...activeGallery, index: newIndex });
                                }}
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 group-hover/btn:translate-x-1 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
                                </svg>
                            </button>
                        </>
                    )}

                    <div className="relative max-w-5xl max-h-[85vh] w-full h-full flex items-center justify-center" onClick={(e) => e.stopPropagation()}>
                        {activeGallery.media[activeGallery.index].media_type === 'Video' ? (
                            <video
                                src={activeGallery.media[activeGallery.index].file_url}
                                className="w-full h-full object-contain rounded-3xl shadow-2xl animate-in zoom-in-95 duration-500"
                                controls
                                autoPlay
                            />
                        ) : (
                            <img
                                src={activeGallery.media[activeGallery.index].file_url}
                                alt="Full view"
                                className="w-full h-full object-contain rounded-3xl shadow-2xl animate-in zoom-in-95 duration-500"
                            />
                        )}

                        <div className="absolute -bottom-16 left-0 right-0 flex flex-col items-center gap-2">
                            <div className="flex gap-1.5">
                                {activeGallery.media.map((_, i) => (
                                    <div key={i} className={`h-1 rounded-full transition-all duration-300 ${i === activeGallery.index ? 'w-8 bg-[#F97316]' : 'w-2 bg-white/20'}`} />
                                ))}
                            </div>
                            <p className="text-white/40 text-[9px] font-black uppercase tracking-[0.4em]">
                                Media {activeGallery.index + 1} of {activeGallery.media.length} • StraySafe Surveillance
                            </p>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default ResiViewReport;
