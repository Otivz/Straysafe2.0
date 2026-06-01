import { useState, useEffect } from 'react';
import SubdSidebar from '../../components/SubdSidebar';
import SubdNavbar from '../../components/Navbars/SubdNavbar';
import Button from '../../components/Button';
import axios from 'axios';

interface EndorsementDocument {
    doc_id: string;
    report_id: number;
    title: string;
    date_sent: string;
    recipient: string;
    status: 'Received' | 'In Review' | 'Accepted';
    file_type: 'PDF' | 'DOCX' | 'IMAGE';
    file_size: string;
    file_url?: string;
}

const EndorsementArch = () => {
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedDoc, setSelectedDoc] = useState<EndorsementDocument | null>(null);
    const [missionData, setMissionData] = useState<any | null>(null);
    const [loadingMission, setLoadingMission] = useState(false);
    const [docs, setDocs] = useState<EndorsementDocument[]>([]);
    const [loadingDocs, setLoadingDocs] = useState(true);

    const mockMissions = [
        {
            rescue_id: 1042,
            report_id: 1042,
            title: "Aggressive Stray Rescue - Sector 4",
            description: "Requesting immediate rescue for a large aggressive dog near the central playground.",
            escalated_date: "May 12, 2026 10:30 AM",
            status_id: 5, // In Progress (Dispatched)
            leader_name: "Kyla Joy Arriola",
            assigned_staff_name: "Alpha Rescue Squad",
            report: {
                current_status_id: 5,
                animal_type: "Dog",
                animal_breed: "German Shepherd Mix",
                condition: "Aggressive behavior, chasing children near playground",
                landmark: "Central Park Playground",
                priority_level: "High",
                created_at: "2026-05-12T08:30:00Z",
                media: [
                    {
                        media_id: 101,
                        file_url: "https://images.unsplash.com/photo-1589941013453-ec89f33b5e95?auto=format&fit=crop&q=80&w=800",
                        media_type: "Image",
                        is_evidence: false
                    },
                    {
                        media_id: 102,
                        file_url: "https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf",
                        media_type: "Document",
                        is_evidence: true
                    }
                ]
            }
        },
        {
            rescue_id: 1039,
            report_id: 1039,
            title: "Injured Animal Rescue - Block 5",
            description: "Calico cat with injured leg found near block 5 entrance.",
            escalated_date: "May 11, 2026 02:15 PM",
            status_id: 1, // Pending
            leader_name: "Kyla Joy Arriola",
            assigned_staff_name: null,
            report: {
                current_status_id: 4, // Escalated
                animal_type: "Cat",
                animal_breed: "Calico",
                condition: "Limping, possible fracture in front left leg",
                landmark: "Block 5 Main Gate",
                priority_level: "Regular",
                created_at: "2026-05-11T14:15:00Z",
                media: [
                    {
                        media_id: 201,
                        file_url: "https://images.unsplash.com/photo-1533738363-b7f9aef128ce?auto=format&fit=crop&q=80&w=800",
                        media_type: "Image",
                        is_evidence: false
                    },
                    {
                        media_id: 202,
                        file_url: "https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf",
                        media_type: "Document",
                        is_evidence: true
                    }
                ]
            }
        },
        {
            rescue_id: 1025,
            report_id: 1025,
            title: "Perimeter Pack Control",
            description: "Pack of 5-6 dogs roaming near the subdivision perimeter fence.",
            escalated_date: "May 10, 2026 08:00 AM",
            status_id: 6, // Resolved
            leader_name: "Kyla Joy Arriola",
            assigned_staff_name: "Bravo Rescue Team",
            report: {
                current_status_id: 11, // Resolved
                animal_type: "Dog",
                animal_breed: "Mixed Breed",
                condition: "Roaming in pack, possible rabies risk",
                landmark: "North Perimeter Wall",
                priority_level: "Regular",
                created_at: "2026-05-10T08:00:00Z",
                media: [
                    {
                        media_id: 301,
                        file_url: "https://images.unsplash.com/photo-1548199973-03cce0bbc87b?auto=format&fit=crop&q=80&w=800",
                        media_type: "Image",
                        is_evidence: false
                    },
                    {
                        media_id: 302,
                        file_url: "https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf",
                        media_type: "Document",
                        is_evidence: true
                    }
                ]
            }
        }
    ];

    const getStatusStyle = (status: string) => {
        switch (status) {
            case 'Pending': return 'bg-amber-50 text-amber-600 border-amber-100';
            case 'In Progress': return 'bg-blue-50 text-blue-600 border-blue-100';
            case 'Resolved': return 'bg-green-50 text-green-600 border-green-100';
            case 'Rejected': return 'bg-red-50 text-red-600 border-red-100';
            default: return 'bg-gray-50 text-gray-600 border-gray-100';
        }
    };

    const getBarangayStatusName = (statusId?: number) => {
        if (!statusId) return 'Pending';
        switch (statusId) {
            case 1: return 'Pending';
            case 2: return 'Pending';
            case 3: return 'Rejected';
            case 4: return 'In Progress';
            case 5: return 'In Progress';
            case 6: return 'Resolved';
            default: return 'Pending';
        }
    };

    const getTimelineSteps = (mission: any) => {
        const currentStatus = mission?.report?.status_id || mission?.report?.current_status_id || mission?.status_id || 4;
        const hasAssignment = !!mission?.assigned_staff_name;
        const isResolved = currentStatus === 11 || currentStatus === 6 || mission?.status_id === 6 || mission?.barangay_status?.toLowerCase() === 'resolved';
        const isInProgress = currentStatus === 5 || mission?.status_id === 5 || mission?.status_id === 4 || mission?.barangay_status?.toLowerCase() === 'in progress';
        const isTeamAssigned = hasAssignment || isResolved || isInProgress || currentStatus === 13 || (mission?.assignments && mission.assignments.length > 0);
        
        return [
            {
                label: 'Report Received',
                status: 'Resolved',
                timestamp: mission?.report?.created_at ? new Date(mission.report.created_at).toLocaleDateString() : 'N/A',
                note: 'Initial incident report registered.'
            },
            {
                label: 'Endorsed to Barangay',
                status: currentStatus >= 4 ? 'Resolved' : 'Pending',
                timestamp: mission?.escalated_date || (mission?.created_at ? new Date(mission.created_at).toLocaleDateString() : 'N/A'),
                note: 'Official subdivision endorsement sent to Barangay.'
            },
            {
                label: 'Rescue Team Assigned',
                status: isTeamAssigned ? 'Resolved' : (currentStatus === 4 ? 'Pending' : 'Not Started'),
                timestamp: mission?.assignments && mission.assignments.length > 0 ? new Date(mission.assignments[0].assigned_at).toLocaleDateString() : '-',
                note: mission?.assigned_staff_name ? `Assigned to: ${mission.assigned_staff_name}` : (isResolved ? 'Rescue team dispatched and operation completed.' : 'Awaiting Barangay staff assignment.')
            },
            {
                label: 'Rescue In Progress',
                status: isResolved ? 'Resolved' : (isInProgress ? 'In Progress' : 'Not Started'),
                timestamp: '-',
                note: isInProgress ? 'Barangay rescue squad dispatched and on-site.' : (isResolved ? 'Dispatched and completed.' : '-')
            },
            {
                label: 'Mission Resolved',
                status: isResolved ? 'Resolved' : 'Not Started',
                timestamp: '-',
                note: isResolved ? 'Incident resolved successfully. Relocated to safety.' : '-'
            }
        ];
    };

    const handlePreview = async (doc: EndorsementDocument) => {
        setSelectedDoc(doc);
        setLoadingMission(true);
        setMissionData(null);
        try {
            // First, try fetching the escalated rescue request record
            const res = await axios.get(`http://localhost:8000/rescue-requests/report/${doc.report_id}`);
            if (res.data) {
                setMissionData(res.data);
            } else {
                // Secondary check: Fetch the report details directly to load escalated files
                try {
                    const reportRes = await axios.get(`http://localhost:8000/reports/${doc.report_id}`);
                    if (reportRes.data) {
                        setMissionData({
                            rescue_id: null,
                            report_id: reportRes.data.report_id,
                            title: doc.title,
                            description: reportRes.data.description,
                            escalated_date: doc.date_sent,
                            status_id: reportRes.data.status_id,
                            report: reportRes.data
                        });
                    } else {
                        const mockMatch = mockMissions.find(m => m.report_id === doc.report_id);
                        setMissionData(mockMatch || null);
                    }
                } catch (reportErr) {
                    console.error('Failed to fetch direct report details too:', reportErr);
                    const mockMatch = mockMissions.find(m => m.report_id === doc.report_id);
                    setMissionData(mockMatch || null);
                }
            }
        } catch (err) {
            console.error('Failed to fetch live database rescue details, trying direct report:', err);
            try {
                const reportRes = await axios.get(`http://localhost:8000/reports/${doc.report_id}`);
                if (reportRes.data) {
                    setMissionData({
                        rescue_id: null,
                        report_id: reportRes.data.report_id,
                        title: doc.title,
                        description: reportRes.data.description,
                        escalated_date: doc.date_sent,
                        status_id: reportRes.data.status_id,
                        report: reportRes.data
                    });
                    setLoadingMission(false);
                    return;
                }
            } catch (innerErr) {
                console.error('Failed to fetch direct report details too:', innerErr);
            }
            const mockMatch = mockMissions.find(m => m.report_id === doc.report_id);
            setMissionData(mockMatch || null);
        } finally {
            setLoadingMission(false);
        }
    };

    const mockDocs: EndorsementDocument[] = [
        {
            doc_id: "END-2024-0512",
            report_id: 1042,
            title: "Endorsement for Aggressive Stray Rescue - Sector 4",
            date_sent: "May 12, 2024",
            recipient: "Barangay San Vicente Ops",
            status: "Received",
            file_type: "PDF",
            file_size: "1.2 MB",
            file_url: "https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf"
        },
        {
            doc_id: "END-2024-0511",
            report_id: 1039,
            title: "Endorsement for Injured Animal Rescue - Block 5",
            date_sent: "May 11, 2024",
            recipient: "Barangay San Vicente Ops",
            status: "Accepted",
            file_type: "PDF",
            file_size: "850 KB",
            file_url: "https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf"
        },
        {
            doc_id: "END-2024-0510",
            report_id: 1025,
            title: "Endorsement for Perimeter Pack Control",
            date_sent: "May 10, 2024",
            recipient: "Barangay San Vicente Ops",
            status: "Accepted",
            file_type: "PDF",
            file_size: "1.1 MB",
            file_url: "https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf"
        }
    ];

    const fetchDocs = async (showLoading = true) => {
        try {
            if (showLoading) setLoadingDocs(true);
            const response = await axios.get('http://localhost:8000/rescue-requests/');
            if (response.data && response.data.length > 0) {
                const mapped: EndorsementDocument[] = response.data.map((m: any) => {
                    let friendlyStatus: 'Received' | 'In Review' | 'Accepted' = 'Received';
                    const sid = m.status_id;
                    if (sid === 6) friendlyStatus = 'Accepted';
                    else if (sid === 4 || sid === 5) friendlyStatus = 'Accepted';
                    else if (sid === 1 || sid === 2) friendlyStatus = 'Received';
                    else if (sid === 3) friendlyStatus = 'In Review';

                    const media = m.report?.media || [];
                    const escFile = media.find((file: any) => file.is_evidence === true && file.status_id !== 11);
                    const isPdf = escFile?.file_url?.toLowerCase().includes('.pdf');

                    const escDate = m.created_at ? new Date(m.created_at).toLocaleDateString('en-US', {
                        year: 'numeric',
                        month: 'short',
                        day: 'numeric'
                    }) : 'N/A';

                    let docTitle = m.title || `Rescue Request #${m.rescue_id}`;
                    if (!docTitle.toLowerCase().includes('endorsement')) {
                        docTitle = `Endorsement for ${docTitle}`;
                    }

                    return {
                        doc_id: `END-2026-${m.rescue_id.toString().padStart(3, '0')}`,
                        report_id: m.report_id,
                        title: docTitle,
                        date_sent: escDate,
                        recipient: "Barangay San Vicente Ops",
                        status: friendlyStatus,
                        file_type: isPdf ? "PDF" : "IMAGE",
                        file_size: isPdf ? "1.2 MB" : "850 KB",
                        file_url: escFile?.file_url
                    };
                });
                setDocs(mapped);
            } else {
                setDocs(mockDocs);
            }
        } catch (error) {
            console.error('Error fetching endorsement documents:', error);
            setDocs(mockDocs);
        } finally {
            if (showLoading) setLoadingDocs(false);
        }
    };

    const handleDownload = async (doc: EndorsementDocument) => {
        if (!doc.file_url) {
            alert("No uploaded file available for this document.");
            return;
        }

        try {
            const response = await fetch(doc.file_url);
            const blob = await response.blob();
            const blobUrl = window.URL.createObjectURL(blob);
            
            const link = document.createElement('a');
            link.href = blobUrl;
            
            const ext = doc.file_type === 'PDF' ? 'pdf' : 'jpg';
            link.download = `${doc.doc_id}.${ext}`;
            
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            window.URL.revokeObjectURL(blobUrl);
        } catch (error) {
            console.error("Blob download failed, falling back to new window open:", error);
            const link = document.createElement('a');
            link.href = doc.file_url;
            link.target = '_blank';
            link.download = doc.title;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        }
    };

    useEffect(() => {
        fetchDocs(true);
        const interval = setInterval(() => fetchDocs(false), 5000);
        return () => clearInterval(interval);
    }, []);

    useEffect(() => {
        if (!selectedDoc) return;
        
        const pollMission = async () => {
            try {
                const res = await axios.get(`http://localhost:8000/rescue-requests/report/${selectedDoc.report_id}`);
                if (res.data) {
                    setMissionData(res.data);
                }
            } catch (err) {
                console.error('Error polling preview mission:', err);
            }
        };

        const interval = setInterval(pollMission, 5000);
        return () => clearInterval(interval);
    }, [selectedDoc]);

    const filteredDocs = docs.filter(doc => 
        doc.title.toLowerCase().includes(searchTerm.toLowerCase()) || 
        doc.doc_id.toLowerCase().includes(searchTerm.toLowerCase())
    );

    return (
        <div className="flex h-screen bg-[#F8FAFC]">
            <SubdSidebar />

            <div className="flex-1 flex flex-col overflow-hidden">
                <SubdNavbar
                    leftContent={
                        <div className="flex flex-col">
                            <h1 className="text-xl font-black text-gray-900 tracking-tight leading-none">Endorsement Archive</h1>
                            <p className="text-[11px] text-gray-400 font-semibold mt-1.5 leading-none">Repository of all official endorsement letters sent to the Barangay</p>
                        </div>
                    }
                />

                <main className="flex-1 overflow-y-auto p-8 custom-scrollbar">
                    <div className="max-w-7xl mx-auto">
                        
                        {/* Header Section */}
                        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
                            <div className="relative w-full md:w-80 ml-auto">
                                <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-gray-400">
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                                    </svg>
                                </span>
                                <input
                                    type="text"
                                    placeholder="Search documents..."
                                    className="w-full pl-9 pr-4 py-2 bg-white border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-[#F97316] outline-none transition-all"
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                />
                            </div>
                        </div>

                        {/* Document Grid */}
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                            {filteredDocs.map((doc) => (
                                <div key={doc.doc_id} className="group bg-white rounded-[2rem] border border-gray-100 shadow-sm hover:shadow-xl transition-all duration-300 p-6 flex flex-col h-full">
                                    <div className="flex items-start justify-between mb-6">
                                        <div className="w-14 h-14 rounded-2xl bg-orange-50 flex items-center justify-center text-[#F97316] shadow-inner group-hover:bg-[#F97316] group-hover:text-white transition-colors duration-300">
                                            <svg xmlns="http://www.w3.org/2000/svg" className="h-7 w-7" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                            </svg>
                                        </div>
                                        <span className={`px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest border ${
                                            doc.status === 'Accepted' ? 'bg-green-50 text-green-600 border-green-100' : 
                                            'bg-blue-50 text-blue-600 border-blue-100'
                                        }`}>
                                            {doc.status}
                                        </span>
                                    </div>

                                    <h3 className="text-sm font-bold text-gray-900 mb-2 line-clamp-2 leading-relaxed">
                                        {doc.title}
                                    </h3>
                                    
                                    <div className="flex flex-col space-y-1.5 mb-6 mt-auto">
                                        <div className="flex items-center text-[11px] text-gray-400 font-bold uppercase tracking-wider">
                                            <span className="w-4">🆔</span> {doc.doc_id}
                                        </div>
                                        <div className="flex items-center text-[11px] text-gray-400 font-bold uppercase tracking-wider">
                                            <span className="w-4">📅</span> {doc.date_sent}
                                        </div>
                                        <div className="flex items-center text-[11px] text-gray-400 font-bold uppercase tracking-wider">
                                            <span className="w-4">📂</span> {doc.file_size} • {doc.file_type}
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-2 gap-3 pt-4 border-t border-gray-50">
                                        <Button 
                                            variant="light" 
                                            size="sm" 
                                            className="!text-[10px] !font-black uppercase tracking-widest !rounded-xl"
                                            onClick={() => handlePreview(doc)}
                                        >
                                            Preview
                                        </Button>
                                         <Button 
                                             variant="primary" 
                                             size="sm" 
                                             className="!text-[10px] !font-black uppercase tracking-widest !rounded-xl"
                                             onClick={() => handleDownload(doc)}
                                         >
                                             Download
                                         </Button>
                                    </div>
                                </div>
                            ))}

                            {filteredDocs.length === 0 && (
                                <div className="col-span-full bg-white rounded-3xl border border-dashed border-gray-200 p-20 text-center">
                                    <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center mx-auto mb-4">
                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                        </svg>
                                    </div>
                                    <h3 className="text-gray-900 font-bold">No documents found</h3>
                                    <p className="text-gray-400 text-sm mt-1">Try adjusting your search terms.</p>
                                </div>
                            )}
                        </div>

                        {/* Policy Note */}
                        <div className="mt-12 p-8 bg-gray-900 rounded-[2.5rem] text-white relative overflow-hidden shadow-2xl">
                            <div className="absolute top-0 right-0 p-8 opacity-10">
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-32 w-32" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                </svg>
                            </div>
                            <div className="relative z-10">
                                <h4 className="text-lg font-black uppercase tracking-widest mb-4 flex items-center gap-3">
                                    <span className="p-1 bg-[#F97316] rounded-md">
                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-white" viewBox="0 0 20 20" fill="currentColor">
                                            <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                                        </svg>
                                    </span>
                                    Archive Protocol
                                </h4>
                                <p className="text-gray-400 text-sm leading-relaxed max-w-2xl">
                                    The Endorsement Archive stores every official communication sent to the Barangay operations hub. 
                                    These documents serve as legal proof of subdivision request and are used for audit and security 
                                    purposes. Documents are automatically archived upon successful escalation from the Incident Report module.
                                </p>
                            </div>
                        </div>

                    </div>
                </main>
            </div>

            {/* Endorsement Preview Modal */}
            {selectedDoc && (
                <div 
                    onClick={() => {
                        setSelectedDoc(null);
                        setMissionData(null);
                    }}
                    className="fixed inset-0 z-[60] flex items-center justify-center p-4 sm:p-6 bg-black/40 backdrop-blur-sm animate-in fade-in duration-300"
                >
                    <div 
                        onClick={(e) => e.stopPropagation()}
                        className="w-full max-w-2xl bg-white rounded-[2.5rem] shadow-2xl border border-gray-100 overflow-hidden flex flex-col max-h-[90vh] animate-in zoom-in-95 duration-300"
                    >
                        {/* Modal Header */}
                        <header className="px-8 py-6 border-b border-gray-50 flex items-center justify-between bg-white shrink-0">
                            <div>
                                <div className="flex items-center gap-2">
                                    <span className="text-[10px] font-black bg-orange-50 text-[#F97316] px-2 py-1 rounded-md uppercase tracking-widest">
                                        Endorsement Document Preview
                                    </span>
                                    <span className="text-xs font-mono text-gray-400 font-bold">
                                        ID: {selectedDoc.doc_id}
                                    </span>
                                </div>
                                <h2 className="text-lg font-black text-gray-900 mt-1 tracking-tight leading-snug">
                                    {selectedDoc.title}
                                </h2>
                            </div>
                            <button 
                                onClick={() => {
                                    setSelectedDoc(null);
                                    setMissionData(null);
                                }}
                                className="w-10 h-10 rounded-full border border-gray-100 flex items-center justify-center text-gray-400 hover:text-[#B35D25] hover:bg-orange-50/50 transition-all shrink-0"
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </header>

                        {/* Modal Scrollable Body */}
                        <div className="flex-1 overflow-y-auto p-8 space-y-8 scrollbar-thin scrollbar-thumb-gray-200 scrollbar-track-transparent">
                            {/* Document Info Card */}
                            <div className="bg-gray-50/60 border border-gray-100 p-5 rounded-2xl">
                                <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-3">Transmission Details</h3>
                                <div className="grid grid-cols-2 gap-y-3 gap-x-4 text-xs font-medium text-gray-700">
                                    <div><span className="text-gray-400">Date Transmitted:</span> {selectedDoc.date_sent}</div>
                                    <div><span className="text-gray-400">Recipient:</span> {selectedDoc.recipient}</div>
                                    <div><span className="text-gray-400">Format:</span> {selectedDoc.file_type} ({selectedDoc.file_size})</div>
                                    <div>
                                        <span className="text-gray-400">Barangay Status:</span> 
                                        <span className={`ml-2 px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider border ${
                                            selectedDoc.status === 'Accepted' ? 'bg-green-50 text-green-600 border-green-100' : 'bg-blue-50 text-blue-605 border-blue-100'
                                        }`}>
                                            {selectedDoc.status}
                                        </span>
                                    </div>
                                </div>
                            </div>

                            {/* Live Escalated Mission Status (Database Connected) */}
                            <div className="space-y-4">
                                <div className="flex items-center justify-between">
                                    <h3 className="text-xs font-black text-gray-400 uppercase tracking-[0.2em] flex items-center gap-2">
                                        Live Operations Sync
                                    </h3>
                                    <span className="flex items-center gap-1 text-[10px] font-extrabold text-[#F97316] uppercase tracking-wider">
                                        <span className="relative flex h-2 w-2">
                                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-orange-400 opacity-75"></span>
                                            <span className="relative inline-flex rounded-full h-2 w-2 bg-[#F97316]"></span>
                                        </span>
                                        DB Connected
                                    </span>
                                </div>

                                {loadingMission ? (
                                    <div className="py-12 flex flex-col items-center justify-center gap-3">
                                        <div className="w-10 h-10 border-4 border-orange-200 border-t-orange-500 rounded-full animate-spin"></div>
                                        <p className="text-xs font-bold text-gray-400 uppercase tracking-widest animate-pulse">Syncing live mission data...</p>
                                    </div>
                                ) : missionData ? (
                                    (() => {
                                        const media = missionData.report?.media || [];
                                        const escalationFiles = media.filter((m: any) => m.is_evidence === true && m.status_id !== 11);
                                        const originalEvidence = media.filter((m: any) => !m.is_evidence);
                                        const resolutionProof = media.filter((m: any) => m.is_evidence === true && m.status_id === 11);

                                        return (
                                            <div className="space-y-6">
                                                {/* Escalation Endorsement Document Preview */}
                                                <div className="space-y-4">
                                                    <h4 className="text-xs font-black text-gray-400 uppercase tracking-[0.2em] flex items-center gap-2">
                                                        📄 Uploaded Endorsement File Preview
                                                    </h4>
                                                    {escalationFiles.length > 0 ? (
                                                        <div className="space-y-4">
                                                            {escalationFiles.map((file: any) => {
                                                                const isPdf = file.file_url.toLowerCase().includes('.pdf');
                                                                const isImage = file.media_type === 'Image' || /\.(jpg|jpeg|png|webp|gif)$/i.test(file.file_url);

                                                                return (
                                                                    <div key={file.media_id} className="bg-white border border-gray-150 rounded-3xl overflow-hidden shadow-sm flex flex-col">
                                                                        {/* File Header */}
                                                                        <div className="px-6 py-4 bg-gray-50 border-b border-gray-100 flex items-center justify-between">
                                                                            <div className="flex items-center gap-2.5">
                                                                                <span className="text-lg">{isPdf ? '📄' : '🖼️'}</span>
                                                                                <div>
                                                                                    <h4 className="text-xs font-bold text-gray-800">
                                                                                        {isPdf ? 'Official Endorsement Letter (PDF)' : 'Escalation Evidence / Letter Image'}
                                                                                    </h4>
                                                                                    <p className="text-[9px] font-medium text-gray-400 font-mono">MEDIA ID: {file.media_id}</p>
                                                                                </div>
                                                                            </div>
                                                                            <a 
                                                                                href={file.file_url} 
                                                                                target="_blank" 
                                                                                rel="noreferrer" 
                                                                                className="px-3.5 py-1.5 bg-white hover:bg-orange-50 hover:text-[#F97316] hover:border-orange-200 border border-gray-200 text-gray-600 rounded-xl font-black text-[9px] uppercase tracking-widest transition-all"
                                                                            >
                                                                                Open File
                                                                            </a>
                                                                        </div>

                                                                        {/* File Viewport */}
                                                                        <div className="bg-gray-100/30 p-4 flex items-center justify-center min-h-[320px]">
                                                                            {isPdf ? (
                                                                                <div className="w-full h-[400px] bg-white rounded-2xl overflow-hidden border border-gray-150 shadow-inner">
                                                                                    <iframe 
                                                                                        src={file.file_url} 
                                                                                        className="w-full h-full border-none" 
                                                                                        title={`Endorsement Document #${file.media_id} Preview`}
                                                                                    />
                                                                                </div>
                                                                            ) : isImage ? (
                                                                                <div className="relative max-w-full rounded-2xl overflow-hidden border border-gray-200 bg-white group shadow-sm">
                                                                                    <img 
                                                                                        src={file.file_url} 
                                                                                        alt="Escalation Document" 
                                                                                        className="max-h-[380px] w-auto object-contain transition-transform duration-300 group-hover:scale-[1.01]"
                                                                                    />
                                                                                </div>
                                                                            ) : (
                                                                                <div className="p-8 text-center bg-white border border-gray-100 rounded-2xl w-full">
                                                                                    <span className="text-3xl block mb-2">📂</span>
                                                                                    <p className="text-xs font-bold text-gray-700">Non-Previewable Document format</p>
                                                                                    <p className="text-[10px] text-gray-400 mt-1">Please use "Open File" button to view this attachment.</p>
                                                                                </div>
                                                                            )}
                                                                        </div>
                                                                    </div>
                                                                );
                                                            })}
                                                        </div>
                                                    ) : (
                                                        <div className="bg-orange-50/50 border border-dashed border-orange-200 rounded-3xl p-8 text-center flex flex-col items-center justify-center gap-2">
                                                            <span className="text-3xl">⚠️</span>
                                                            <h4 className="text-xs font-bold text-orange-800 uppercase tracking-wider">No Endorsement Document Found</h4>
                                                            <p className="text-[11px] text-orange-700/80 leading-relaxed max-w-sm">
                                                                No uploaded file was found matching the escalation endorsement letter.
                                                            </p>
                                                        </div>
                                                    )}
                                                </div>

                                                {/* Divider */}
                                                <div className="border-t border-gray-100/80 my-6"></div>

                                                {/* Mission Info Grid */}
                                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                                    <div className="bg-gray-50/30 border border-gray-100/80 p-4 rounded-xl">
                                                        <p className="text-[9px] font-black text-gray-400 uppercase tracking-wider mb-1">Target Animal</p>
                                                        <p className="text-xs font-bold text-gray-800">
                                                            {missionData.report?.animal_type || 'Unknown'} {missionData.report?.animal_breed ? `(${missionData.report.animal_breed})` : ''}
                                                        </p>
                                                    </div>
                                                    <div className="bg-gray-50/30 border border-gray-100/80 p-4 rounded-xl">
                                                        <p className="text-[9px] font-black text-gray-400 uppercase tracking-wider mb-1">Operation Location</p>
                                                        <p className="text-xs font-bold text-gray-800">{missionData.report?.landmark || 'Subdivision Boundary'}</p>
                                                    </div>
                                                    <div className="bg-gray-50/30 border border-gray-100/80 p-4 rounded-xl col-span-full">
                                                        <p className="text-[9px] font-black text-gray-400 uppercase tracking-wider mb-1">Incident Condition</p>
                                                        <p className="text-xs font-medium text-gray-600 leading-relaxed">{missionData.report?.condition || missionData.description || 'No specific injuries noted.'}</p>
                                                    </div>
                                                    <div className="bg-gray-50/30 border border-gray-100/80 p-4 rounded-xl">
                                                        <p className="text-[9px] font-black text-gray-400 uppercase tracking-wider mb-1">Assigned Rescue Team</p>
                                                        <p className={`text-xs font-black uppercase tracking-wider ${missionData.assigned_staff_name ? 'text-blue-600' : 'text-gray-400'}`}>
                                                            {missionData.assigned_staff_name || 'Awaiting Dispatch'}
                                                        </p>
                                                    </div>
                                                    <div className="bg-gray-50/30 border border-gray-100/80 p-4 rounded-xl">
                                                        <p className="text-[9px] font-black text-gray-400 uppercase tracking-wider mb-1">Live Status</p>
                                                        <span className={`inline-flex px-2 py-0.5 rounded-full text-[9.5px] font-black uppercase tracking-wider border mt-0.5 ${getStatusStyle(getBarangayStatusName(missionData.status_id))}`}>
                                                            {getBarangayStatusName(missionData.status_id)}
                                                        </span>
                                                    </div>
                                                </div>

                                                {/* Progress Timeline */}
                                                <div className="space-y-6 pt-2">
                                                    <h4 className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em]">Operational Progress Timeline</h4>
                                                    <div className="pl-2 space-y-6">
                                                        {getTimelineSteps(missionData).map((step, idx, arr) => {
                                                            const isLast = idx === arr.length - 1;
                                                            const isCompleted = step.status === 'Resolved';
                                                            const isInProgress = step.status === 'In Progress';
                                                            const isPending = step.status === 'Pending';
                                                            const isNotStarted = step.status === 'Not Started';

                                                            let circleBg = 'bg-gray-50 border-gray-200 text-gray-400';
                                                            let lineBg = 'bg-gray-100';

                                                            if (isCompleted) {
                                                                circleBg = 'bg-green-500 text-white border-green-500';
                                                                lineBg = 'bg-green-500';
                                                            } else if (isInProgress) {
                                                                circleBg = 'bg-blue-500 text-white border-blue-500 shadow-md shadow-blue-500/20';
                                                                lineBg = 'bg-gray-100';
                                                            } else if (isPending) {
                                                                circleBg = 'bg-[#F97316] text-white border-[#F97316] shadow-md shadow-orange-500/20';
                                                                lineBg = 'bg-gray-100';
                                                            }

                                                            return (
                                                                <div key={idx} className="flex items-start relative pb-6 last:pb-0">
                                                                    {!isLast && (
                                                                        <div className={`absolute left-[13px] top-[26px] bottom-0 w-[2px] ${lineBg}`}></div>
                                                                    )}
                                                                    <div className={`w-7 h-7 rounded-full border-2 flex items-center justify-center z-10 shrink-0 font-bold text-[10px] ${circleBg}`}>
                                                                        {isCompleted ? (
                                                                            <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" viewBox="0 0 20 20" fill="currentColor">
                                                                                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                                                                            </svg>
                                                                        ) : isInProgress ? (
                                                                            <span className="relative flex h-1.5 w-1.5">
                                                                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75"></span>
                                                                                <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-white"></span>
                                                                            </span>
                                                                        ) : (
                                                                            <span>{idx + 1}</span>
                                                                        )}
                                                                    </div>
                                                                    <div className="ml-4 flex-1">
                                                                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 mb-0.5">
                                                                            <h4 className={`text-xs font-extrabold ${isNotStarted ? 'text-gray-400' : 'text-gray-900'}`}>{step.label}</h4>
                                                                            {!isNotStarted && step.timestamp && (
                                                                                <span className="text-[9px] font-bold text-gray-400 font-mono">{step.timestamp}</span>
                                                                            )}
                                                                        </div>
                                                                        {step.note && (
                                                                            <p className="text-[11px] font-medium text-gray-500">{step.note}</p>
                                                                        )}
                                                                    </div>
                                                                </div>
                                                            );
                                                        })}
                                                    </div>
                                                </div>

                                                {/* Divider */}
                                                {(originalEvidence.length > 0 || resolutionProof.length > 0) && (
                                                    <div className="border-t border-gray-100/80 my-6"></div>
                                                )}

                                                {/* Original Resident Incident Evidence */}
                                                {originalEvidence.length > 0 && (
                                                    <div className="space-y-4">
                                                        <h4 className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em]">
                                                            Original Resident Evidence
                                                        </h4>
                                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                                            {originalEvidence.map((file: any) => (
                                                                <div key={file.media_id} className="bg-gray-50/30 border border-gray-100/80 p-4 rounded-xl flex flex-col gap-3">
                                                                    <div className="flex items-center justify-between text-[11px] font-bold text-gray-500">
                                                                        <span className="flex items-center gap-1.5 uppercase tracking-wider text-[10px]">
                                                                            🖼️ Incident Media
                                                                        </span>
                                                                        <span className="font-mono text-[9px]">ID: {file.media_id}</span>
                                                                    </div>
                                                                    
                                                                    <div className="relative group overflow-hidden rounded-xl border border-gray-150 bg-white shadow-sm flex-1 flex items-center justify-center">
                                                                        <img 
                                                                            src={file.file_url} 
                                                                            alt="Incident Evidence" 
                                                                            className="w-full max-h-48 object-cover group-hover:scale-[1.01] transition-transform duration-300"
                                                                        />
                                                                    </div>

                                                                    <div className="flex justify-end">
                                                                        <a 
                                                                            href={file.file_url} 
                                                                            target="_blank" 
                                                                            rel="noreferrer" 
                                                                            className="px-3.5 py-1.5 bg-white hover:bg-gray-50 border border-gray-200 text-gray-700 rounded-lg font-bold text-[9.5px] uppercase tracking-wider transition-all text-center"
                                                                        >
                                                                            Open Image
                                                                        </a>
                                                                    </div>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    </div>
                                                )}

                                                {/* Operational Resolution Proof */}
                                                {resolutionProof.length > 0 && (
                                                    <div className="space-y-4">
                                                        <h4 className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em]">
                                                            Resolution Evidence Files
                                                        </h4>
                                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                                            {resolutionProof.map((file: any) => (
                                                                <div key={file.media_id} className="bg-gray-50/30 border border-gray-100/80 p-4 rounded-xl flex flex-col gap-3">
                                                                    <div className="flex items-center justify-between text-[11px] font-bold text-gray-500">
                                                                        <span className="flex items-center gap-1.5 uppercase tracking-wider text-[10px]">
                                                                            ✅ Resolution Proof
                                                                        </span>
                                                                        <span className="font-mono text-[9px]">ID: {file.media_id}</span>
                                                                    </div>
                                                                    
                                                                    <div className="relative group overflow-hidden rounded-xl border border-gray-150 bg-white shadow-sm flex-1 flex items-center justify-center">
                                                                        <img 
                                                                            src={file.file_url} 
                                                                            alt="Resolution Evidence" 
                                                                            className="w-full max-h-48 object-cover group-hover:scale-[1.01] transition-transform duration-300"
                                                                        />
                                                                    </div>

                                                                    <div className="flex justify-end">
                                                                        <a 
                                                                            href={file.file_url} 
                                                                            target="_blank" 
                                                                            rel="noreferrer" 
                                                                            className="px-3.5 py-1.5 bg-white hover:bg-gray-50 border border-gray-200 text-gray-700 rounded-lg font-bold text-[9.5px] uppercase tracking-wider transition-all text-center"
                                                                        >
                                                                            Open Image
                                                                        </a>
                                                                    </div>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })()
                                ) : (
                                    <div className="bg-amber-50/50 border border-amber-100 rounded-xl p-5 text-center">
                                        <p className="text-xs font-bold text-amber-700 uppercase tracking-wider">No Active Tracking Found</p>
                                        <p className="text-[11px] text-amber-600/80 mt-1 leading-relaxed">
                                            This endorsement has not been connected to a live operational rescue request yet, or the report ID is invalid.
                                        </p>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Modal Footer */}
                        <footer className="px-8 py-5 border-t border-gray-50 bg-gray-50/30 flex justify-end shrink-0 gap-3">
                            <button 
                                onClick={() => {
                                    setSelectedDoc(null);
                                    setMissionData(null);
                                }}
                                className="px-6 py-2.5 bg-gray-200 hover:bg-gray-300 text-gray-700 rounded-xl font-bold text-xs uppercase tracking-widest transition-all"
                            >
                                Close Preview
                            </button>
                        </footer>
                    </div>
                </div>
            )}
        </div>
    );
};

export default EndorsementArch;
