import { useState, useEffect } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import BrgySidebar from '../../components/BrgySidebar';
import BrgyNavbar from '../../components/Navbars/BrgyNavbar';
import Button from '../../components/Button';
import MapComponent from '../../components/MapComponent';
import DataTable from '../../components/DataTable';
import RescueTimeline from '../../components/RescueTimeline';
import AISuggestionPanel from '../../components/AISuggestionPanel';

interface RescueRequest {
    rescue_id: number;
    report_id: number;
    leader_id: number;
    title: string;
    description: string;
    status_id: number;
    created_at: string;
    report?: {
        category_id: number;
        animal_type: string;
        breed?: string;
        condition: string;
        behavior_tags?: string;
        priority_level: string;
        latitude: number;
        longitude: number;
        landmark: string;
        animal_count: number;
        description: string;
        reporter_name?: string;
        status_id: number;
        created_at: string;
        media?: { media_id: number; file_url: string; media_type: string; is_evidence?: boolean }[];
        history?: any[];
        ai_animal_type?: string | null;
        ai_dominant_color?: string | null;
        ai_estimated_size?: string | null;
        ai_possible_breed?: string | null;
        ai_suggested_risk_level?: string | null;
        ai_suggested_priority?: string | null;
        ai_suggested_priority_reason?: string | null;
    };
    leader_name?: string;
    leader_position?: string;
    assigned_staff_name?: string;
    staff_id?: number;
}

const statusMap: Record<number, string> = {
    1: 'Pending Approval',
    2: 'Approved',
    3: 'Rejected',
    4: 'Operation Started',
    5: 'Dispatched',
    6: 'Resolved'
};

const reportStatusMap: Record<number, string> = {
    1: 'Reported',
    2: 'Verified',
    3: 'Rejected',
    4: 'Escalated to Barangay',
    13: 'Approved',
    5: 'Rescue In Progress',
    6: 'Picked Up',
    7: 'Under Observation',
    8: 'Impounded',
    9: 'Claimed by Owner',
    10: 'Released',
    11: 'Resolved',
    12: 'Deceased'
};

const categoryMap: Record<number, string> = {
    1: 'Injured Animal',
    2: 'Aggressive Stray',
    3: 'Possible Rabies Risk',
    4: 'Roaming Pack',
    5: 'Animal Rescue Needed'
};

const BrgyRescueRequests = () => {
    const navigate = useNavigate();
    const [requests, setRequests] = useState<RescueRequest[]>([]);
    const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
    const [loading, setLoading] = useState(true);
    const [viewingRequest, setViewingRequest] = useState<RescueRequest | null>(null);
    const [isStatusModalOpen, setIsStatusModalOpen] = useState(false);
    const [isNavigating, setIsNavigating] = useState(false);
    const [navSource, setNavSource] = useState<'brgy' | 'current'>('brgy');
    const [userLocation, setUserLocation] = useState<[number, number] | null>(null);
    const BRGY_OFFICE: [number, number] = [14.8069, 121.0039]; // R243+QH Santa Maria, Bulacan
    const [statusToUpdate, setStatusToUpdate] = useState<{ requestId: number, reportId: number, statusId: number } | null>(null);
    const [statusMediaFiles, setStatusMediaFiles] = useState<File[]>([]);
    const [isUpdating, setIsUpdating] = useState(false);
    const [statusUpdateMessage, setStatusUpdateMessage] = useState('');
    const [statusUpdateCondition, setStatusUpdateCondition] = useState('');
    const [activeGallery, setActiveGallery] = useState<{ media: any[], index: number } | null>(null);
    const [personnel, setPersonnel] = useState<any[]>([]);
    const [selectedPersonnelId, setSelectedPersonnelId] = useState<number | null>(null);
    const [assignmentRemarks, setAssignmentRemarks] = useState('');
    const [resolvedAddress, setResolvedAddress] = useState('');
    const [isGeocoding, setIsGeocoding] = useState(false);

    const userStr = localStorage.getItem('staff_user') || sessionStorage.getItem('staff_user');
    const currentUser = userStr ? JSON.parse(userStr) : null;

    useEffect(() => {
        if (!userStr || currentUser?.role_id !== 3) {
            navigate('/staff/login');
        }
    }, [navigate, userStr, currentUser]);

    useEffect(() => {
        if (isNavigating && navSource === 'current') {
            if ("geolocation" in navigator) {
                navigator.geolocation.getCurrentPosition(
                    (position) => {
                        setUserLocation([position.coords.latitude, position.coords.longitude]);
                    },
                    (error) => {
                        console.error("Error getting location:", error);
                        setNavSource('brgy');
                    }
                );
            }
        }
    }, [isNavigating, navSource]);

    useEffect(() => {
        if (!viewingRequest?.report) {
            setResolvedAddress('');
            return;
        }

        const report = viewingRequest.report;

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
    }, [viewingRequest]);

    const fetchRequests = async () => {
        try {
            setLoading(true);
            const response = await axios.get('http://localhost:8000/rescue-requests/');
            // Sort by rescue_id descending to show new requests at the top
            const sortedData = (response.data || []).sort((a: any, b: any) => b.rescue_id - a.rescue_id);
            // ONLY show reports that are active (not status 11, 12, or 3)
            const activeRequests = sortedData.filter((req: any) => 
                req.report?.status_id !== 11 && 
                req.report?.status_id !== 12 && 
                req.report?.status_id !== 3
            );
            setRequests(activeRequests);

            // Mark current requests as viewed so sidebar count clears
            try {
                const viewed = JSON.parse(localStorage.getItem('straysafe_viewed_brgy_requests') || '[]');
                const requestIds = activeRequests.map((req: any) => req.rescue_id || req.report_id || req.report?.report_id);
                const updatedViewed = Array.from(new Set([...viewed, ...requestIds]));
                localStorage.setItem('straysafe_viewed_brgy_requests', JSON.stringify(updatedViewed));
                window.dispatchEvent(new Event('straysafe_brgy_viewed'));
            } catch (e) {
                console.warn('Could not mark brgy requests as viewed', e);
            }
        } catch (error) {
            console.error('Error fetching rescue requests:', error);
            setRequests([]);
        } finally {
            setLoading(false);
        }
    };

    const fetchPersonnel = async () => {
        try {
            const response = await axios.get('http://localhost:8000/users/?role_id=3');
            setPersonnel(response.data);
        } catch (error) {
            console.error('Error fetching personnel:', error);
        }
    };

    const openRequestModal = (request: RescueRequest) => {
        console.log("Opening request details:", request);
        setViewingRequest(request);
    };

    useEffect(() => {
        fetchRequests();
        fetchPersonnel();
    }, []);

    const handleUpdateStatus = async () => {
        if (!statusToUpdate || !currentUser) return;

        // Validation: Must select personnel for status 5 (Dispatched)
        if (statusToUpdate.statusId === 5 && !selectedPersonnelId) {
            alert('Please select a personnel to handle this rescue.');
            return;
        }

        setIsUpdating(true);
        try {
            const friendlyDefaults: Record<number, string> = {
                1: "Reported.",
                2: "Incident report has been officially verified by the Subdivision Leader.",
                3: "Report rejected based on verification criteria.",
                4: "Report forwarded to Barangay Operations for official review and approval.",
                13: "Approved by Barangay. Rescue operation is being planned.",
                5: "Rescue team has been dispatched to the location.",
                6: "Picked up by the barangay and in a safe place.",
                7: "Under observation.",
                8: "Securely impounded.",
                9: "Claimed by owner.",
                10: "Safely released.",
                11: "Incident has been resolved.",
                12: "Resolved (animal deceased)."
            };

            const defaultRemark = friendlyDefaults[statusToUpdate.statusId] || `Status updated to ${statusMap[statusToUpdate.statusId] || reportStatusMap[statusToUpdate.statusId]}`;

            // 1. Update Rescue & Report Status in ONE call
            const rescuePayload = {
                status_id: statusToUpdate.statusId, // Use the ACTUAL status (4, 5, 7, etc.)
                barangay_staff_id: currentUser.user_id,
                assigned_personnel_id: selectedPersonnelId,
                remarks: statusUpdateMessage || defaultRemark,
                animal_condition: (statusToUpdate.statusId === 6 || statusToUpdate.statusId === 11) ? statusUpdateCondition : undefined
            };
            const rescueResponse = await axios.patch(`http://localhost:8000/rescue-requests/${statusToUpdate.requestId}`, rescuePayload);

            // 3. Upload Media if any
            if (statusMediaFiles.length > 0 && (statusToUpdate.statusId === 6 || statusToUpdate.statusId === 11)) {
                // Find the history entry we just created in the response
                const newHistoryEntry = rescueResponse.data.report?.history
                    ?.filter((h: any) => h.report_status_id === statusToUpdate.statusId)
                    .sort((a: any, b: any) => (b.history_id || 0) - (a.history_id || 0))[0];

                const newHistoryId = newHistoryEntry?.history_id;

                for (const file of statusMediaFiles) {
                    const formData = new FormData();
                    formData.append('file', file);
                    formData.append('is_evidence', 'true');
                    if (newHistoryId) {
                        formData.append('history_id', newHistoryId.toString());
                    }
                    // Also send status_id for additional indexing
                    formData.append('status_id', statusToUpdate.statusId.toString());

                    try {
                        await axios.post(`http://localhost:8000/reports/${statusToUpdate.reportId}/media`, formData, {
                            headers: { 'Content-Type': 'multipart/form-data' }
                        });
                    } catch (err) {
                        console.error('Media upload failed:', err);
                    }
                }
            }

            alert('Status updated successfully');
            setIsStatusModalOpen(false);
            setStatusMediaFiles([]);
            setStatusUpdateMessage('');
            setStatusUpdateCondition('');
            setSelectedPersonnelId(null);
            setAssignmentRemarks('');
            fetchRequests();
            setViewingRequest(null);
        } catch (error) {
            console.error('Error updating status:', error);
            alert('Failed to update status');
        } finally {
            setIsUpdating(false);
        }
    };

    const openStatusUpdate = (requestId: number, reportId: number, statusId: number) => {
        setStatusToUpdate({ requestId, reportId, statusId });
        setIsStatusModalOpen(true);
        setStatusMediaFiles([]);

        // Pre-fill animal condition from citizen report
        if (viewingRequest?.report?.condition) {
            setStatusUpdateCondition(viewingRequest.report.condition);
        }

        // Pre-fill if already assigned
        if (viewingRequest?.staff_id) {
            setSelectedPersonnelId(viewingRequest.staff_id);
        }
    };

    return (
        <div className="min-h-screen w-full flex bg-[#F8F9FA] font-sans text-gray-800">
            <BrgySidebar 
                isMobileOpen={isMobileSidebarOpen}
                onCloseMobile={() => setIsMobileSidebarOpen(false)}
            />
 
            {/* MAIN CONTENT */}
            <main className="flex-1 flex flex-col h-screen overflow-hidden w-full">
                <BrgyNavbar
                    onMenuToggle={() => setIsMobileSidebarOpen(true)}
                    leftContent={
                        <div className="flex flex-col">
                            <h1 className="text-xl font-black text-gray-900 tracking-tight leading-none uppercase">Rescue Requests</h1>
                            <p className="text-[9px] text-gray-400 font-extrabold uppercase tracking-wider mt-1.5 leading-none">Review and approve rescue operations escalated by Subdivision Leaders</p>
                        </div>
                    }
                />

                <div className="flex-1 overflow-y-auto p-8 flex flex-col gap-8 scrollbar-thin scrollbar-thumb-gray-200 scrollbar-track-transparent">
                    <div className="max-w-7xl mx-auto w-full">
                        <div className="flex justify-end items-center mb-8">
                            <Button variant="light" onClick={fetchRequests} className="flex items-center gap-2">
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                                </svg>
                                Refresh
                            </Button>
                        </div>

                        {/* Data Table Section */}
                        <DataTable
                            loading={loading}
                            data={requests}
                            onRowClick={openRequestModal}
                            emptyMessage="No pending rescue requests."
                            loadingMessage="Syncing rescue operations..."
                            columns={[
                                {
                                    header: "Request ID",
                                    key: "rescue_id",
                                    render: (req) => (
                                        <span className="text-xs font-mono text-gray-400">#REQ-{(req.rescue_id || 0).toString().padStart(4, '0')}</span>
                                    )
                                },
                                {
                                    header: "Title",
                                    key: "title",
                                    render: (req) => (
                                        <div>
                                            <p className="text-sm font-bold text-gray-900">{req.title}</p>
                                            <p className="text-[10px] text-gray-400 truncate max-w-[200px]">{req.description}</p>
                                        </div>
                                    )
                                },
                                {
                                    header: "Escalated By",
                                    key: "leader",
                                    render: (req) => (
                                        <div className="flex items-center gap-2">
                                            <div className="w-6 h-6 rounded-full bg-orange-100 flex items-center justify-center text-[10px] font-bold text-orange-600">
                                                {req.leader_name?.charAt(0) || 'L'}
                                            </div>
                                            <span className="text-xs text-gray-700">{req.leader_name || 'Subd Leader'}</span>
                                        </div>
                                    )
                                },
                                {
                                    header: "Assigned",
                                    key: "assigned",
                                    render: (req) => (
                                        req.assigned_staff_name ? (
                                            <div className="flex items-center gap-2">
                                                <div className="w-5 h-5 rounded-full bg-blue-100 flex items-center justify-center text-[8px] font-bold text-blue-600 border border-blue-200">
                                                    {req.assigned_staff_name.charAt(0)}
                                                </div>
                                                <span className="text-[10px] font-bold text-gray-900">{req.assigned_staff_name}</span>
                                            </div>
                                        ) : (
                                            <span className="text-[10px] font-medium text-gray-400 italic">Not Assigned</span>
                                        )
                                    )
                                },
                                {
                                    header: "Prioritization",
                                    key: "priority",
                                    render: (req) => {
                                        const priority = req.report?.priority_level || 'Medium';
                                        let colorClass = 'bg-gray-50 text-gray-600 border-gray-100';
                                        if (priority.toLowerCase() === 'high' || priority.toLowerCase() === 'emergency') {
                                            colorClass = 'bg-red-50 text-red-600 border-red-100';
                                        } else if (priority.toLowerCase() === 'medium' || priority.toLowerCase() === 'regular') {
                                            colorClass = 'bg-amber-50 text-amber-600 border-amber-100';
                                        } else if (priority.toLowerCase() === 'low') {
                                            colorClass = 'bg-blue-50 text-blue-600 border-blue-100';
                                        }
                                        return (
                                            <span className={`px-3 py-1 rounded-full text-[10px] font-bold border ${colorClass}`}>
                                                {priority}
                                            </span>
                                        );
                                    }
                                },
                                {
                                    header: "Date",
                                    key: "date",
                                    render: (req) => (
                                        <span className="text-xs text-gray-500">
                                            {new Date(req.created_at || req.report?.created_at || Date.now()).toLocaleDateString()}
                                        </span>
                                    )
                                },
                                {
                                    header: "Status",
                                    key: "status",
                                    render: (req) => {
                                        const reportStatus = req.report?.status_id;
                                        const label = reportStatusMap[reportStatus || 0] || statusMap[req.status_id] || "Pending";

                                        let colorClass = "bg-orange-50 text-orange-600 border border-orange-100"; // Default
                                        if (reportStatus === 13) colorClass = "bg-indigo-50 text-indigo-600 border border-indigo-100";
                                        if (reportStatus === 5) colorClass = "bg-blue-600 text-white";
                                        if (reportStatus === 6) colorClass = "bg-amber-50 text-amber-600 border border-amber-100";
                                        if (reportStatus === 11) colorClass = "bg-green-50 text-green-600 border border-green-100";
                                        if (reportStatus === 3 || reportStatus === 12) colorClass = "bg-red-50 text-red-600 border border-red-100";

                                        return (
                                            <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest ${colorClass}`}>
                                                {label}
                                            </span>
                                        );
                                    }
                                },
                                {
                                    header: "Action",
                                    key: "action",
                                    className: "text-right",
                                    render: (req) => (
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                openRequestModal(req);
                                            }}
                                            className="text-[10px] font-bold text-[#F97316] hover:underline"
                                        >
                                            {req.status_id === 1 ? 'Review Request' : 'Update Status'}
                                        </button>
                                    )
                                }
                            ]}
                        />
                    </div>
                </div>
            </main>

            {/* Review Modal */}
            {viewingRequest && (
                <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
                    <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl overflow-hidden animate-in zoom-in-95 duration-200 flex flex-col max-h-[90vh]">
                        <div className="px-8 py-6 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
                            <div>
                                <h3 className="text-xl font-bold text-gray-900">Rescue Request Approval</h3>
                                <p className="text-xs text-gray-500 mt-1">Review full incident intelligence and documentation</p>
                            </div>
                            <button onClick={() => setViewingRequest(null)} className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full transition-all">
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>

                        <div className="overflow-y-auto custom-scrollbar flex-1 bg-[#FBFBFB]">
                            <div className="px-8 py-10 bg-white border-b border-gray-100/50">
                                <div className="flex items-center justify-between relative px-2">
                                    <div className="absolute top-5 left-10 right-10 h-0.5 bg-gray-100 z-0">
                                        <div
                                            className="h-full bg-orange-500 transition-all duration-700"
                                            style={{
                                                width: `${(() => {
                                                    const stages = [1, 2, 4, 13, 5, 6, 11];
                                                    const currentIndex = stages.indexOf(viewingRequest.report?.status_id ?? 1);
                                                    return currentIndex === -1 ? 0 : (currentIndex / (stages.length - 1)) * 100;
                                                })()}%`
                                            }}
                                        />
                                    </div>

                                    {[
                                        { id: 1, label: 'Reported' },
                                        { id: 2, label: 'Verified' },
                                        { id: 4, label: 'Escalated' },
                                        { id: 13, label: 'Approved' },
                                        { id: 5, label: 'Dispatched' },
                                        { id: 6, label: 'Picked Up' },
                                        { id: 11, label: 'Resolved' }
                                    ].map((stage, idx) => {
                                        const displayStatusId = statusToUpdate?.statusId || viewingRequest.report?.status_id || 1;
                                        const stages = [1, 2, 4, 13, 5, 6, 11];
                                        const currentIndex = stages.indexOf(displayStatusId);
                                        const optIndex = stages.indexOf(stage.id);

                                        const isCompleted = currentIndex > optIndex;
                                        const isCurrent = displayStatusId === stage.id;

                                        return (
                                            <div key={stage.id} className="relative z-10 flex flex-col items-center">
                                                <div className={`w-10 h-10 rounded-full flex items-center justify-center transition-all duration-300 ${isCurrent ? 'bg-orange-500 text-white shadow-md ring-4 ring-orange-50' :
                                                    isCompleted ? 'bg-orange-100 text-orange-600 border border-orange-200' :
                                                        'bg-white text-gray-200 border border-gray-100'
                                                    }`}>
                                                    {isCompleted ? (
                                                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>
                                                    ) : (
                                                        <span className="text-xs font-black">{idx + 1}</span>
                                                    )}
                                                </div>
                                                <span className={`mt-2 text-[8px] font-black uppercase tracking-widest ${isCurrent ? 'text-orange-600' : isCompleted ? 'text-gray-600' : 'text-gray-300'}`}>
                                                    {stage.label}
                                                </span>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>

                            <div className="p-8 flex flex-col gap-6">
                                <div className="bg-orange-50 border border-orange-100 rounded-2xl p-6">
                                    <h4 className="text-[10px] font-black text-orange-600 uppercase tracking-widest mb-4">Subdivision Escalation Note</h4>
                                    
                                    {(viewingRequest.report?.endorsement_letter?.title || viewingRequest.title) && (
                                        <p className="text-xs font-black text-orange-600 uppercase tracking-wider mb-2">
                                            {viewingRequest.report?.endorsement_letter?.title || viewingRequest.title}
                                        </p>
                                    )}

                                    <p className="text-sm font-bold text-gray-900 leading-relaxed italic">
                                        "{viewingRequest.report?.endorsement_letter?.letter_content || viewingRequest.description || viewingRequest.notes}"
                                    </p>
                                    
                                    <div className="mt-4 flex items-center gap-3">
                                        <div className="w-8 h-8 rounded-full bg-orange-200 flex items-center justify-center text-[10px] font-bold text-orange-700 border-2 border-white">
                                            {(viewingRequest.report?.endorsement_letter?.leader_name || viewingRequest.leader_name)?.charAt(0) || 'L'}
                                        </div>
                                        <div>
                                            <p className="text-[10px] font-black text-gray-900 uppercase tracking-widest">Sent by:</p>
                                            <p className="text-sm font-black text-orange-700">
                                                {viewingRequest.report?.endorsement_letter?.leader_name || viewingRequest.leader_name || "Subdivision Leader"}
                                            </p>
                                            <p className="text-[9px] text-gray-500 uppercase tracking-widest font-medium">
                                                {viewingRequest.report?.endorsement_letter?.leader_position || viewingRequest.leader_position || "Subdivision Official"} • {new Date(viewingRequest.report?.endorsement_letter?.issued_at || viewingRequest.created_at || viewingRequest.report?.created_at || Date.now()).toLocaleDateString()}
                                            </p>
                                        </div>
                                    </div>
                                    
                                    {(() => {
                                        const fileUrl = viewingRequest.report?.endorsement_letter?.file_url;
                                        if (fileUrl) {
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
                                                            className="w-full py-3 bg-white border border-orange-200 text-orange-600 text-[9px] font-black uppercase tracking-[0.2em] rounded-xl hover:bg-orange-600 hover:text-white transition-all shadow-sm flex items-center justify-center gap-2"
                                                        >
                                                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                                            </svg>
                                                            View Official Endorsement Letter
                                                        </a>
                                                    )}
                                                </div>
                                            );
                                        }

                                        // Fallback to media table if no endorsement letter is loaded
                                        const evidenceFiles = viewingRequest.report?.media?.filter(m => m.is_evidence) || [];
                                        if (evidenceFiles.length === 0) return null;
                                        return (
                                            <div className="mt-5 space-y-3">
                                                <p className="text-[9px] font-black text-orange-600 uppercase tracking-[0.2em]">Endorsement Letter / Evidence</p>
                                                {evidenceFiles.map((m) => {
                                                    const urlLower = m.file_url.toLowerCase();
                                                    const isDoc = urlLower.endsWith('.pdf') || urlLower.endsWith('.doc') || urlLower.endsWith('.docx');
                                                    const isImg = m.media_type === 'Image' || (!isDoc && (urlLower.endsWith('.jpg') || urlLower.endsWith('.jpeg') || urlLower.endsWith('.png') || urlLower.endsWith('.webp')));
                                                    return isImg ? (
                                                        <a key={m.media_id} href={m.file_url} target="_blank" rel="noopener noreferrer" className="block rounded-2xl overflow-hidden border border-orange-100 hover:opacity-90 transition-opacity shadow-sm">
                                                            <img src={m.file_url} className="w-full max-h-64 object-cover" alt="Endorsement letter" />
                                                        </a>
                                                    ) : (
                                                        <button
                                                            key={m.media_id}
                                                            onClick={() => setActiveGallery({ media: [m], index: 0 })}
                                                            className="w-full py-3 bg-white border border-orange-200 text-orange-600 text-[9px] font-black uppercase tracking-[0.2em] rounded-xl hover:bg-orange-600 hover:text-white transition-all shadow-sm flex items-center justify-center gap-2"
                                                        >
                                                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                                            </svg>
                                                            View Official Endorsement Letter
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                        );
                                    })()}
                                </div>

                                {viewingRequest.assigned_staff_name && (
                                    <div className="bg-blue-50/50 border border-blue-100 rounded-2xl p-6">
                                        <h4 className="text-[10px] font-black text-blue-600 uppercase tracking-widest mb-4">Assigned Personnel</h4>
                                        <div className="flex items-center gap-3">
                                            <div className="w-10 h-10 rounded-full bg-blue-600 flex items-center justify-center text-white text-xs font-black shadow-md border-2 border-white">
                                                {viewingRequest.assigned_staff_name.charAt(0)}
                                            </div>
                                            <div>
                                                <p className="text-sm font-black text-gray-900">{viewingRequest.assigned_staff_name}</p>
                                                <p className="text-[9px] text-gray-400 uppercase tracking-widest">Active Responder • Barangay Staff</p>
                                            </div>
                                        </div>
                                    </div>
                                )}

                                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                                    {[
                                        { label: 'Category', value: categoryMap[viewingRequest.report?.category_id || 0] || 'Rescue', color: 'orange' },
                                        { label: 'Animal', value: viewingRequest.report?.animal_type || 'Unknown', color: 'blue' },
                                        { label: 'Condition', value: viewingRequest.report?.condition || 'Unknown', color: 'red' },
                                        { label: 'Priority', value: viewingRequest.report?.priority_level || 'Normal', color: 'orange' },
                                        { label: 'Count', value: viewingRequest.report?.animal_count || '1', color: 'gray' }
                                    ].filter(spec => {
                                        if (spec.label === 'Animal' && viewingRequest.report?.ai_animal_type) {
                                            return viewingRequest.report.ai_animal_type.toLowerCase() !== viewingRequest.report.animal_type?.toLowerCase();
                                        }
                                        if (spec.label === 'Priority' && viewingRequest.report?.ai_suggested_priority) {
                                            const cleanPrio = (p: string) => p.toLowerCase().replace('priority', '').replace('level', '').trim();
                                            return cleanPrio(viewingRequest.report.ai_suggested_priority) !== cleanPrio(viewingRequest.report.priority_level);
                                        }
                                        return true;
                                    }).map((spec, i) => (
                                        <div key={i} className="bg-white border border-gray-100 p-4 rounded-2xl">
                                            <p className="text-[9px] font-black text-gray-400 uppercase tracking-[0.15em] mb-1">{spec.label}</p>
                                            <p className={`text-xs font-black text-gray-900 uppercase tracking-widest`}>{spec.value}</p>
                                        </div>
                                    ))}
                                </div>

                                {/* AI Suggestion Panel */}
                                <AISuggestionPanel
                                    animalType={viewingRequest.report?.animal_type || viewingRequest.report?.ai_animal_type}
                                    dominantColor={(viewingRequest.report as any)?.animal_color || viewingRequest.report?.ai_dominant_color}
                                    estimatedSize={(viewingRequest.report as any)?.estimated_size || viewingRequest.report?.ai_estimated_size}
                                    suggestedRiskLevel={viewingRequest.report?.ai_suggested_risk_level}
                                    suggestedPriority={viewingRequest.report?.ai_suggested_priority}
                                    possibleBreed={(viewingRequest.report as any)?.animal_breed || (viewingRequest.report as any)?.breed || viewingRequest.report?.ai_possible_breed}
                                    description={viewingRequest.report?.description}
                                    categoryName={categoryMap[viewingRequest.report?.category_id || 0]}
                                    suggestedPriorityReason={viewingRequest.report?.ai_suggested_priority_reason}
                                />

                                <div className="bg-white border border-gray-100 rounded-[2.5rem] p-8 shadow-sm">
                                    <h4 className="text-sm font-black text-gray-900 uppercase tracking-widest mb-4">Resident Report Description</h4>
                                    <p className="text-sm text-gray-600 leading-relaxed mb-6 font-medium">
                                        {viewingRequest.report?.description}
                                    </p>

                                    <div className="flex flex-col gap-3">
                                        <div className="flex items-center gap-3 text-gray-500">
                                            <div className="w-8 h-8 rounded-xl bg-orange-50 flex items-center justify-center text-orange-600">
                                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                                            </div>
                                            <div>
                                                <p className="text-[10px] font-black text-gray-900 uppercase tracking-widest">{viewingRequest.report?.landmark}</p>
                                                <p className="text-[11px] text-gray-700 font-semibold mt-0.5">
                                                    {isGeocoding ? 'Resolving street/location...' : resolvedAddress || 'Street address not found'}
                                                </p>
                                                <p className="text-[9px] text-gray-400 uppercase tracking-widest font-medium mt-0.5">Pinpoint Accuracy Verified</p>
                                            </div>
                                        </div>
                                        <div className="w-full h-[300px] rounded-[2rem] overflow-hidden border border-gray-100 relative">
                                            <MapComponent
                                                center={[viewingRequest.report?.latitude || BRGY_OFFICE[0], viewingRequest.report?.longitude || BRGY_OFFICE[1]]}
                                                zoom={16}
                                                markers={[
                                                    {
                                                        id: viewingRequest.report_id,
                                                        lat: viewingRequest.report?.latitude || BRGY_OFFICE[0],
                                                        lng: viewingRequest.report?.longitude || BRGY_OFFICE[1],
                                                        title: viewingRequest.report?.landmark || 'Rescue Site',
                                                        category: categoryMap[viewingRequest.report?.category_id || 0] || 'Rescue',
                                                        priority: viewingRequest.report?.priority_level,
                                                        time: 'Now'
                                                    },
                                                    {
                                                        id: -1,
                                                        lat: BRGY_OFFICE[0],
                                                        lng: BRGY_OFFICE[1],
                                                        title: "Barangay Hall",
                                                        category: "Barangay Office"
                                                    },
                                                    ...(userLocation ? [{
                                                        id: -2,
                                                        lat: userLocation[0],
                                                        lng: userLocation[1],
                                                        title: "Your Location",
                                                        category: "User Location"
                                                    }] : [])
                                                ]}
                                                routing={isNavigating ? {
                                                    start: navSource === 'brgy' ? BRGY_OFFICE : (userLocation || BRGY_OFFICE),
                                                    end: [viewingRequest.report?.latitude || BRGY_OFFICE[0], viewingRequest.report?.longitude || BRGY_OFFICE[1]],
                                                    waypointNames: [navSource === 'brgy' ? "Barangay Office" : "Your Location", viewingRequest.report?.landmark || "Rescue Site"],
                                                    onClose: () => setIsNavigating(false)
                                                } : undefined}
                                                onMarkerClick={(m) => {
                                                    if (m.source) {
                                                        setNavSource(m.source);
                                                        setIsNavigating(true);
                                                    } else {
                                                        setIsNavigating(true);
                                                        setNavSource('brgy');
                                                    }
                                                }}
                                            />
                                        </div>
                                    </div>
                                </div>

                                <div className="px-8 pb-10">
                                    <div className="flex items-center justify-between mb-8">
                                        <div>
                                            <h4 className="text-sm font-black text-gray-900 uppercase tracking-widest">Rescue Operation Timeline</h4>
                                            <p className="text-[9px] text-gray-400 font-bold uppercase tracking-widest mt-1">Full audit trail of status changes and evidence</p>
                                        </div>
                                    </div>

                                    <RescueTimeline
                                        history={viewingRequest.report?.history || []}
                                        currentStatusId={viewingRequest.report?.status_id || 1}
                                    />
                                </div>
                            </div>
                        </div>

                        <div className="px-8 py-6 border-t border-gray-100 bg-gray-50/50 flex flex-col gap-4">
                            {viewingRequest.status_id === 1 ? (
                                <>
                                    <div className="flex gap-3">
                                        <Button
                                            variant="primary"
                                            className="flex-1 !rounded-2xl py-4 flex flex-col items-center gap-1"
                                            onClick={() => openStatusUpdate(viewingRequest.rescue_id, viewingRequest.report_id, 13)}
                                        >
                                            <span className="text-[11px] font-black uppercase tracking-widest">Approve Report Request</span>
                                            <span className="text-[9px] opacity-70 font-medium">Status will change to 'Approved'</span>
                                        </Button>
                                    </div>
                                    <div className="flex gap-3">
                                        <button
                                            onClick={() => openStatusUpdate(viewingRequest.rescue_id, viewingRequest.report_id, 3)}
                                            className="flex-1 py-3 text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] hover:text-red-500 transition-colors"
                                        >
                                            Reject Request
                                        </button>
                                    </div>
                                </>
                            ) : (
                                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                                    {[
                                        { id: 1, label: 'Reported', sub: 'Citizen Post' },
                                        { id: 2, label: 'Verified', sub: 'Leader Vetted' },
                                        { id: 4, label: 'Escalated', sub: 'Subd Request' },
                                        { id: 13, label: 'Approved', sub: 'Barangay Accepted' },
                                        { id: 5, label: 'Dispatched', sub: 'On the way' },
                                        { id: 6, label: 'Picked Up', sub: 'Animal secured' },
                                        { id: 11, label: 'Resolved', sub: 'Operation complete' }
                                    ].map((opt) => {
                                        // Define the strict order of stages for the progress bar
                                        const stages = [1, 2, 4, 13, 5, 6, 11];

                                        // Use the status being updated to if the modal is open, otherwise use current status
                                        const displayStatusId = statusToUpdate?.statusId || viewingRequest.report?.status_id || 1;

                                        const currentIndex = stages.indexOf(displayStatusId);
                                        const optIndex = stages.indexOf(opt.id);

                                        // A stage is "Completed" if it's BEFORE the display status
                                        const isCompleted = currentIndex > optIndex;
                                        // A stage is "Current" if it matches the display status
                                        const isCurrent = displayStatusId === opt.id;

                                        return (
                                            <button
                                                key={opt.id}
                                                onClick={() => openStatusUpdate(viewingRequest.rescue_id, viewingRequest.report_id, opt.id)}
                                                className={`p-4 rounded-2xl border transition-all group text-left relative overflow-hidden ${isCurrent ? 'bg-orange-50 border-orange-500 shadow-md ring-2 ring-orange-100' :
                                                    isCompleted ? 'bg-green-50/30 border-green-200' :
                                                        'bg-white border-gray-100 hover:border-orange-500 hover:shadow-lg'
                                                    }`}
                                            >
                                                {(isCompleted || isCurrent) && (
                                                    <div className="absolute top-2 right-2">
                                                        <div className={`w-4 h-4 rounded-full flex items-center justify-center ${isCurrent ? 'bg-orange-500' : 'bg-green-500'}`}>
                                                            <svg className="w-2.5 h-2.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                                                            </svg>
                                                        </div>
                                                    </div>
                                                )}
                                                <p className={`text-[10px] font-black uppercase tracking-widest ${isCurrent ? 'text-orange-600' : isCompleted ? 'text-green-700' : 'text-gray-900 group-hover:text-orange-600'}`}>
                                                    {opt.label}
                                                </p>
                                                <p className={`text-[9px] mt-0.5 ${isCompleted ? 'text-green-600/70' : 'text-gray-400'}`}>{opt.sub}</p>
                                            </button>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* Status Update Modal */}
            {isStatusModalOpen && statusToUpdate && (
                <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/60 backdrop-blur-md animate-in fade-in duration-300">
                    <div className="bg-white rounded-[2.5rem] shadow-2xl w-full max-w-lg overflow-hidden animate-in zoom-in-95 duration-300">
                        <div className="p-10">
                            <div className="w-16 h-16 rounded-[2rem] bg-orange-50 text-orange-600 flex items-center justify-center mb-8">
                                <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                            </div>

                            <h3 className="text-2xl font-black text-gray-900 mb-2">Update Rescue Status</h3>
                            <p className="text-sm font-bold text-gray-400 uppercase tracking-widest mb-8">
                                New Status: <span className="text-orange-600">{statusMap[statusToUpdate.statusId] || reportStatusMap[statusToUpdate.statusId]}</span>
                            </p>

                            <div className="space-y-6 max-h-[40vh] overflow-y-auto px-1 custom-scrollbar">
                                {/* Personnel Assignment Section - Only show for "Team Dispatched" (5) */}
                                {statusToUpdate.statusId === 5 && (
                                    <div className="space-y-4 bg-orange-50/50 p-6 rounded-[2rem] border border-orange-100">
                                        <div className="flex items-center gap-3 mb-2">
                                            <div className="w-8 h-8 rounded-full bg-orange-600 text-white flex items-center justify-center">
                                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
                                            </div>
                                            <label className="text-[11px] font-black text-gray-900 uppercase tracking-widest">Assign Personnel</label>
                                        </div>

                                        <select
                                            value={selectedPersonnelId || ''}
                                            onChange={(e) => setSelectedPersonnelId(Number(e.target.value))}
                                            className="w-full bg-white border border-gray-100 rounded-xl px-4 py-3 text-xs font-bold text-gray-700 focus:ring-2 focus:ring-orange-500 outline-none shadow-sm"
                                        >
                                            <option value="">Select Personnel...</option>
                                            {personnel.map(p => (
                                                <option key={p.user_id} value={p.user_id}>{p.name}</option>
                                            ))}
                                        </select>

                                        <textarea
                                            placeholder="Special instructions for the team..."
                                            value={assignmentRemarks}
                                            onChange={(e) => setAssignmentRemarks(e.target.value)}
                                            className="w-full bg-white border border-gray-100 rounded-xl px-4 py-3 text-xs font-bold text-gray-700 focus:ring-2 focus:ring-orange-500 outline-none shadow-sm min-h-[80px] resize-none"
                                        />
                                    </div>
                                )}

                                <div className="space-y-2">
                                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Status Message / Title</label>
                                    <textarea
                                        value={statusUpdateMessage}
                                        onChange={(e) => setStatusUpdateMessage(e.target.value)}
                                        placeholder="Describe the update or findings..."
                                        className="w-full bg-gray-50 border-none rounded-2xl p-4 text-xs font-bold text-gray-900 placeholder-gray-300 focus:ring-2 focus:ring-orange-500 outline-none min-h-[100px] resize-none"
                                    />
                                </div>

                                {(statusToUpdate.statusId === 6 || statusToUpdate.statusId === 11) && (
                                    <div className="space-y-3">
                                        <div className="flex justify-between items-end ml-1">
                                            <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Current Animal Condition</label>
                                            {viewingRequest?.report?.condition && (
                                                <span className="text-[9px] font-black text-orange-600 uppercase tracking-tight bg-orange-50 px-2 py-0.5 rounded-lg border border-orange-100">
                                                    Initially Reported: {viewingRequest.report.condition}
                                                </span>
                                            )}
                                        </div>
                                        <div className="grid grid-cols-3 gap-2">
                                            {['Healthy', 'Injured', 'Aggressive', 'Thin', 'Nursing', 'Deceased'].map((cond) => (
                                                <button
                                                    key={cond}
                                                    type="button"
                                                    onClick={() => setStatusUpdateCondition(cond)}
                                                    className={`py-2.5 px-2 rounded-xl text-[10px] font-bold uppercase tracking-wider transition-all border ${statusUpdateCondition === cond
                                                        ? 'bg-orange-500 text-white border-orange-500 shadow-md shadow-orange-100'
                                                        : 'bg-white text-gray-400 border-gray-100 hover:border-orange-200'
                                                        }`}
                                                >
                                                    {cond}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {(statusToUpdate.statusId === 6 || statusToUpdate.statusId === 11) && (
                                    <div className="space-y-4">
                                        <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Add Evidence Photos/Videos</label>
                                        <div
                                            onClick={() => document.getElementById('status-media-upload')?.click()}
                                            className="w-full aspect-video rounded-[2rem] border-2 border-dashed border-gray-200 bg-white flex flex-col items-center justify-center gap-4 cursor-pointer hover:border-orange-500 hover:bg-orange-50/10 transition-all group"
                                        >
                                            {statusMediaFiles.length > 0 ? (
                                                <div className="flex flex-col items-center">
                                                    <span className="text-2xl font-black text-orange-600">{statusMediaFiles.length}</span>
                                                    <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest mt-1">Files Selected</span>
                                                </div>
                                            ) : (
                                                <>
                                                    <div className="w-12 h-12 rounded-2xl bg-gray-50 flex items-center justify-center text-gray-300 group-hover:text-orange-500 transition-colors">
                                                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                                                    </div>
                                                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Tap to select multiple</p>
                                                </>
                                            )}
                                        </div>
                                        <input
                                            id="status-media-upload"
                                            type="file"
                                            multiple
                                            accept="image/*,video/*"
                                            className="hidden"
                                            onChange={(e) => setStatusMediaFiles(Array.from(e.target.files || []))}
                                        />
                                    </div>
                                )}
                            </div>

                            <div className="flex flex-col gap-3 mt-10">
                                <Button
                                    variant="primary"
                                    fullWidth
                                    onClick={handleUpdateStatus}
                                    className="!rounded-2xl py-4 !border-none"
                                    disabled={isUpdating}
                                >
                                    {isUpdating ? 'Updating...' : 'Confirm Status Update'}
                                </Button>
                                <button
                                    onClick={() => {
                                        setIsStatusModalOpen(false);
                                        setStatusMediaFiles([]);
                                        setStatusUpdateMessage('');
                                        setStatusUpdateCondition('');
                                        setSelectedPersonnelId(null);
                                        setAssignmentRemarks('');
                                    }}
                                    className="py-3 text-[10px] font-black text-gray-400 uppercase tracking-widest hover:text-gray-900 transition-colors"
                                >
                                    Cancel
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Gallery Viewer */}
            {activeGallery && (
                <div className="fixed inset-0 z-[9999] bg-black/95 backdrop-blur-2xl flex items-center justify-center p-4 md:p-12" onClick={() => setActiveGallery(null)}>
                    <button className="absolute top-8 right-8 text-white/50 hover:text-white transition-all p-4 rounded-full hover:bg-white/10">
                        <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>

                    {(() => {
                        const currentMedia = activeGallery.media[activeGallery.index];
                        const isVideo = currentMedia.media_type === 'Video' || currentMedia.file_url.toLowerCase().match(/\.(mp4|webm|ogg)$/);
                        const isDoc = currentMedia.media_type === 'Document' || currentMedia.file_url.toLowerCase().match(/\.(pdf|doc|docx)$/);

                        if (isVideo) {
                            return <video src={currentMedia.file_url} controls autoPlay className="max-w-full max-h-full rounded-2xl shadow-2xl ring-1 ring-white/10" onClick={e => e.stopPropagation()} />;
                        }
                        if (isDoc) {
                            return (
                                <div className="w-full h-full flex flex-col items-center justify-center gap-6" onClick={e => e.stopPropagation()}>
                                    <div className="w-full max-w-5xl h-[85vh] bg-white rounded-[2.5rem] overflow-hidden shadow-[0_0_100px_rgba(0,0,0,0.5)] border border-white/20">
                                        <iframe
                                            src={currentMedia.file_url}
                                            className="w-full h-full border-none"
                                            title="Document Viewer"
                                        />
                                    </div>
                                    <div className="flex gap-4">
                                        <a href={currentMedia.file_url} target="_blank" rel="noopener noreferrer" className="px-10 py-4 bg-orange-600 text-white rounded-2xl font-black uppercase tracking-widest hover:bg-orange-700 transition-all shadow-xl shadow-orange-900/20">
                                            Open Direct Link
                                        </a>
                                        <button onClick={() => setActiveGallery(null)} className="px-10 py-4 bg-white/10 text-white rounded-2xl font-black uppercase tracking-widest hover:bg-white/20 transition-all border border-white/10 backdrop-blur-md">
                                            Close Preview
                                        </button>
                                    </div>
                                </div>
                            );
                        }
                        return <img src={currentMedia.file_url} className="max-w-full max-h-full object-contain rounded-2xl shadow-2xl ring-1 ring-white/10" onClick={e => e.stopPropagation()} />;
                    })()}
                </div>
            )}
        </div>
    );
};

export default BrgyRescueRequests;
