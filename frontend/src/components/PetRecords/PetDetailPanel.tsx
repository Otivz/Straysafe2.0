import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    AlertTriangle,
    FileText,
    ExternalLink,
    ScrollText
} from 'lucide-react';
import { type PetRecord } from './types';

const VERIFICATION_METHODS = [
    { key: 'approved_claim', label: 'Approved pet claim', hint: 'The resident filed a claim for this pet and it was approved.' },
    { key: 'returned_to_owner', label: 'Animal was returned to this owner', hint: 'Handed over in person after a report / holding stay.' },
    { key: 'in_person_proof', label: 'Owner showed proof in person', hint: 'Vaccination card, old photos with the pet, or registration papers.' },
    { key: 'barangay_adoption', label: 'Barangay adoption handover', hint: 'Adopted through the Barangay adoption process.' },
];
import { DEFAULT_PET_AVATAR, getPetPicture, DEFAULT_AVATAR, getProfilePicture } from '../../utils/avatar';
import api from '../../utils/api';
import WarningDetailsModal from '../Modals/WarningDetailsModal';

interface PetDetailPanelProps {
    pet: PetRecord | null;
    onClose?: () => void;
    hideRegisteredPets?: boolean; // When true, viewed by citizen/owner
    onEditClick?: (pet: PetRecord) => void;
    onReportLostClick?: (pet: PetRecord) => void;
    onOwnerAssigned?: () => void;
    onDeletePet?: (petId: string) => void;
}

const PetDetailPanel: React.FC<PetDetailPanelProps> = ({
    pet,
    onClose,
    hideRegisteredPets = false,
    onEditClick,
    onReportLostClick,
    onOwnerAssigned,
    onDeletePet
}) => {
    const navigate = useNavigate();
    const [activeTab, setActiveTab] = useState<'info' | 'health' | 'behavior' | 'incident'>('info');
    const [isQrOpen, setIsQrOpen] = useState(false);
    const [qrData, setQrData] = useState<any | null>(null);
    const [isLoadingQr, setIsLoadingQr] = useState(false);
    const [isEvidenceOpen, setIsEvidenceOpen] = useState(false);
    const [incidentClaims, setIncidentClaims] = useState<any[]>([]);
    const [incidentReports, setIncidentReports] = useState<any[]>([]);
    const [petWarnings, setPetWarnings] = useState<any[]>([]);
    const [isLoadingIncidents, setIsLoadingIncidents] = useState<boolean>(false);
    const [historyFilter, setHistoryFilter] = useState<'all' | 'warnings' | 'reports' | 'resolved' | 'ongoing'>('all');
    const [selectedWarningModal, setSelectedWarningModal] = useState<any | null>(null);
    const [isWarningDetailsOpen, setIsWarningDetailsOpen] = useState(false);

    const handleOpenQrModal = async () => {
        if (!pet) return;
        setIsQrOpen(true);
        if (!qrData) {
            setIsLoadingQr(true);
            try {
                const res = await api.get(`/pets/${pet.id}/qr`);
                setQrData(res.data);
            } catch (err) {
                console.error("Failed to load pet QR code:", err);
            } finally {
                setIsLoadingQr(false);
            }
        }
    };

    // Photo Update State
    const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
    const [currentPhoto, setCurrentPhoto] = useState<string | null>(null);
    const [isFullscreenImageOpen, setIsFullscreenImageOpen] = useState(false);
    const photoInputRef = useRef<HTMLInputElement>(null);

    // Role detection
    const getCurrentUser = () => {
        try {
            const adminRaw = sessionStorage.getItem('admin_user') || localStorage.getItem('admin_user');
            if (adminRaw) return JSON.parse(adminRaw);
            const staffRaw = sessionStorage.getItem('staff_user') || localStorage.getItem('staff_user');
            if (staffRaw) return JSON.parse(staffRaw);
            const resRaw = sessionStorage.getItem('resident_user') || localStorage.getItem('resident_user');
            if (resRaw) return JSON.parse(resRaw);
            const userRaw = sessionStorage.getItem('user') || localStorage.getItem('user');
            if (userRaw) return JSON.parse(userRaw);
        } catch { }
        return null;
    };

    const currentUser = getCurrentUser();
    const currentUserId = currentUser?.user_id || currentUser?.id;

    const getCurrentUserRole = () => {
        if (currentUser) {
            if (Number(currentUser?.role_id) === 4 || currentUser?.role === 'Admin') return 4;
            if (currentUser?.role_id) return Number(currentUser.role_id);
        }
        const pathname = window.location.pathname;
        if (pathname.startsWith('/admin')) return 4;
        if (pathname.startsWith('/subd')) return 2;
        if (pathname.startsWith('/brgy')) return 3;
        return 1;
    };

    const userRoleId = getCurrentUserRole();
    const isAdmin = userRoleId === 4;

    // Assign Owner State
    const [isAssignOwnerModalOpen, setIsAssignOwnerModalOpen] = useState(false);
    const [verificationMethod, setVerificationMethod] = useState<string>('');
    const [usersList, setUsersList] = useState<any[]>([]);
    const [isLoadingUsers, setIsLoadingUsers] = useState(false);
    const [userSearchTerm, setUserSearchTerm] = useState('');
    const [selectedOwner, setSelectedOwner] = useState<any | null>(null);
    const [isAssigning, setIsAssigning] = useState(false);
    const [assignError, setAssignError] = useState<string | null>(null);

    // Resident must accept staff-assigned ownership; latest request for this pet (Pending / Rejected / Accepted)
    const [ownerConfirmation, setOwnerConfirmation] = useState<any | null>(null);
    const loadOwnerConfirmation = async () => {
        if (!pet?.id || userRoleId === 1) return;
        try {
            const res = await api.get(`/pet-ownership/by-pet/${pet.id}`);
            setOwnerConfirmation(res.data || null);
        } catch {
            setOwnerConfirmation(null);
        }
    };
    useEffect(() => {
        setOwnerConfirmation(null);
        loadOwnerConfirmation();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [pet?.id]);
    const cancelOwnerConfirmation = async () => {
        if (!ownerConfirmation) return;
        try {
            await api.post(`/pet-ownership/${ownerConfirmation.confirmation_id}/cancel`);
        } finally {
            loadOwnerConfirmation();
        }
    };

    // Delete Pet State
    const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);

    const handleDeletePet = async () => {
        if (!pet) return;
        try {
            setIsDeleting(true);
            await api.delete(`/pets/${pet.id}`);
            setIsConfirmingDelete(false);
            if (onDeletePet) {
                onDeletePet(pet.id);
            }
            if (onClose) {
                onClose();
            }
        } catch (err: any) {
            console.error('Error deleting pet:', err);
            alert(err.response?.data?.detail || 'Failed to delete pet record.');
        } finally {
            setIsDeleting(false);
        }
    };

    useEffect(() => {
        if (!pet) return;

        let isMounted = true;
        const fetchPetIncidents = async () => {
            setIsLoadingIncidents(true);
            try {
                const petId = Number(pet.id);
                const ownerId = pet.rawPetObj?.owner_id;

                const claimsRes = await api.get(ownerId ? `/claims/?owner_id=${ownerId}` : '/claims/');
                const allClaims = Array.isArray(claimsRes.data) ? claimsRes.data : [];

                // Strictly filter claims for THIS specific pet ID only (newest first)
                const petClaims = allClaims
                    .filter((c: any) => {
                        const cPetId = c.pet_id || (c.pet && c.pet.pet_id);
                        return Number(cPetId) === petId;
                    })
                    .sort((a: any, b: any) => {
                        const timeA = new Date(a.created_at || 0).getTime();
                        const timeB = new Date(b.created_at || 0).getTime();
                        if (timeA !== timeB) return timeB - timeA;
                        return (b.claim_id || 0) - (a.claim_id || 0);
                    });

                const reportsRes = await api.get('/reports/');
                const allReports = Array.isArray(reportsRes.data) ? reportsRes.data : [];
                const claimReportIds = new Set(petClaims.map((c: any) => c.report_id));

                // Fetch official warning citations for this pet
                let warningsList: any[] = [];
                try {
                    const warningsRes = await api.get(`/warnings/pet/${petId}`);
                    warningsList = Array.isArray(warningsRes.data) ? warningsRes.data : [];
                } catch (wErr) {
                    console.error("Error loading pet warnings:", wErr);
                }

                // Find all reports directly linked to pet, or linked via claim, or linked via duplicate/primary relationship
                const directPetReportIds = new Set(
                    allReports
                        .filter((r: any) => r.pet_id && Number(r.pet_id) === petId)
                        .map((r: any) => r.report_id)
                );

                const linkedPrimaryReportIds = new Set(
                    allReports
                        .filter((r: any) => directPetReportIds.has(r.report_id) && r.duplicate_of_report_id)
                        .map((r: any) => r.duplicate_of_report_id)
                );

                const matchedReports = allReports
                    .filter((r: any) => {
                        if (directPetReportIds.has(r.report_id)) return true;
                        if (linkedPrimaryReportIds.has(r.report_id)) return true;
                        if (claimReportIds.has(r.report_id)) return true;
                        return false;
                    })
                    .map((r: any) => {
                        if (r.duplicate_of_report_id) {
                            const primary = allReports.find((p: any) => p.report_id === r.duplicate_of_report_id);
                            return { ...r, primaryReport: primary || null };
                        }
                        return r;
                    })
                    .sort((a: any, b: any) => {
                        const timeA = new Date(a.created_at || a.reported_at || 0).getTime();
                        const timeB = new Date(b.created_at || b.reported_at || 0).getTime();
                        if (timeA !== timeB) return timeB - timeA;
                        return (b.report_id || 0) - (a.report_id || 0);
                    });

                if (isMounted) {
                    setIncidentClaims(petClaims);
                    setIncidentReports(matchedReports);
                    setPetWarnings(warningsList);
                }
            } catch (err) {
                console.error("Error loading pet incident history:", err);
            } finally {
                if (isMounted) setIsLoadingIncidents(false);
            }
        };

        fetchPetIncidents();

        return () => {
            isMounted = false;
        };
    }, [pet?.id, activeTab]);

    // Helper to evaluate incident/report status for pet history
    const getReportHistoryStatus = (report: any, matchingClaim: any) => {
        const claimStatus = matchingClaim?.status ? String(matchingClaim.status).trim() : null;
        const claimStatusLower = claimStatus ? claimStatus.toLowerCase() : '';

        const reportStatusId = report.current_status_id || report.status_id || report.status?.status_id;
        const reportStatusName = (report.status?.status_name || report.status_name || '').trim();
        const reportStatusLower = reportStatusName.toLowerCase();

        // Check if this report was merged into a primary report (Status 18: Merged — Duplicate)
        const isMergedDuplicate = reportStatusId === 18 || Boolean(report.duplicate_of_report_id);
        if (isMergedDuplicate) {
            const primary = report.primaryReport;
            const priId = report.duplicate_of_report_id || (primary ? primary.report_id : null);
            const priStatusId = primary ? (primary.current_status_id || primary.status_id) : null;
            const priStatusName = (primary?.status?.status_name || primary?.status_name || '').toLowerCase();
            const priClaim = primary ? incidentClaims.find((c: any) => c.report_id === primary.report_id) : null;
            const priClaimStatus = (priClaim?.status || '').toLowerCase();

            const isPriResolved = [
                'handover complete',
                'pet received',
                'approved'
            ].includes(priClaimStatus) ||
                [9, 10, 11, 12].includes(priStatusId) ||
                priStatusName.includes('resolved') ||
                priStatusName.includes('claimed by owner') ||
                priStatusName.includes('released');

            if (isPriResolved) {
                const priRef = priId ? `Case #${priId}` : 'Consolidated Case';
                return {
                    category: 'resolved' as const,
                    isResolved: true,
                    badgeLabel: priRef ? `Resolved • ${priRef}` : 'Resolved',
                    statusPillText: 'Resolved',
                    detailText: `Resolved via ${priRef}`,
                    badgeClass: 'bg-emerald-50 text-emerald-700 border-emerald-200 shadow-2xs font-black',
                    cardBorder: 'border-l-4 border-l-emerald-500',
                    dotClass: 'bg-emerald-500',
                    idBadgeClass: 'bg-emerald-50 text-emerald-700 border-emerald-200'
                };
            } else {
                // Primary is ongoing!
                const priRef = priId ? `Case #${priId}` : 'Primary Case';
                return {
                    category: 'ongoing' as const,
                    isResolved: false,
                    badgeLabel: `Ongoing • Merged into ${priRef}`,
                    statusPillText: 'Ongoing',
                    detailText: `Merged into ${priRef}`,
                    badgeClass: 'bg-blue-50 text-blue-700 border-blue-200 shadow-2xs font-black',
                    cardBorder: 'border-l-4 border-l-blue-500',
                    dotClass: 'bg-blue-500',
                    idBadgeClass: 'bg-blue-50 text-blue-700 border-blue-200'
                };
            }
        }

        // 1. Resolved / Done (Green)
        const isClaimResolved = [
            'handover complete',
            'pet received',
            'approved'
        ].includes(claimStatusLower);

        const isReportResolved = [9, 10, 11, 12, 14, 17].includes(reportStatusId) ||
            reportStatusLower.includes('resolved') ||
            reportStatusLower.includes('claimed by owner') ||
            reportStatusLower.includes('released') ||
            reportStatusLower.includes('deceased');

        if (isClaimResolved || isReportResolved) {
            let detail = '';
            if (claimStatusLower === 'handover complete') detail = 'Handover Complete';
            else if (claimStatusLower === 'pet received') detail = 'Pet Received';
            else if (claimStatusLower === 'approved') detail = 'Claim Approved';
            else if (reportStatusId === 9 || reportStatusLower.includes('claimed by owner')) detail = 'Claimed by Owner';
            else if (reportStatusId === 10 || reportStatusLower.includes('released')) detail = 'Released';
            else if (reportStatusId === 11 || reportStatusLower.includes('resolved')) detail = 'Incident Resolved';
            else if (reportStatusId === 12 || reportStatusLower.includes('deceased')) detail = 'Deceased';
            else if (reportStatusId === 14) detail = 'False Alarm';
            else if (reportStatusId === 17) detail = 'Cannot Be Found';
            else if (claimStatus) detail = claimStatus;
            else if (reportStatusName) detail = reportStatusName;

            const label = detail && detail.toLowerCase() !== 'resolved' ? `Resolved • ${detail}` : 'Resolved';

            return {
                category: 'resolved' as const,
                isResolved: true,
                badgeLabel: label,
                statusPillText: 'Resolved',
                detailText: detail || 'Resolved',
                badgeClass: 'bg-emerald-50 text-emerald-700 border-emerald-200 shadow-2xs font-black',
                cardBorder: 'border-l-4 border-l-emerald-500',
                dotClass: 'bg-emerald-500',
                idBadgeClass: 'bg-emerald-50 text-emerald-700 border-emerald-200'
            };
        }

        // 2. Closed / Rejected (Red/Rose)
        if (claimStatusLower === 'rejected' || reportStatusId === 3 || reportStatusLower.includes('rejected')) {
            return {
                category: 'rejected' as const,
                isResolved: false,
                badgeLabel: 'Closed • Rejected',
                statusPillText: 'Closed',
                detailText: 'Rejected',
                badgeClass: 'bg-rose-50 text-rose-700 border-rose-200 shadow-2xs font-black',
                cardBorder: 'border-l-4 border-l-rose-400',
                dotClass: 'bg-rose-500',
                idBadgeClass: 'bg-rose-50 text-rose-700 border-rose-200'
            };
        }

        // 3. Ongoing (Blue)
        let ongoingDetail = 'In Progress';
        if (claimStatusLower === 'pending review') ongoingDetail = 'Pending Review';
        else if (claimStatusLower === 'evidence requested') ongoingDetail = 'Evidence Requested';
        else if (claimStatusLower === 'potential owner match' || claimStatusLower === 'possible match found') ongoingDetail = 'Potential Match';
        else if (claimStatus) ongoingDetail = claimStatus;
        else if (report.custody_status && report.custody_status !== 'Sighting') ongoingDetail = report.custody_status;
        else if (reportStatusId === 1 || reportStatusLower === 'reported') ongoingDetail = 'Sighting Reported';
        else if (reportStatusId === 2 || reportStatusLower === 'verified') ongoingDetail = 'Verified Sighting';
        else if (reportStatusId === 4) ongoingDetail = 'Escalated to Barangay';
        else if (reportStatusId === 5) ongoingDetail = 'Rescue In Progress';
        else if (reportStatusId === 6) ongoingDetail = 'Picked Up';
        else if (reportStatusId === 7) ongoingDetail = 'Under Observation';
        else if (reportStatusId === 8) ongoingDetail = 'Impounded';
        else if (reportStatusId === 15) ongoingDetail = 'Disputed';
        else if (reportStatusId === 16) ongoingDetail = 'Under Investigation';
        else if (reportStatusName) ongoingDetail = reportStatusName;

        return {
            category: 'ongoing' as const,
            isResolved: false,
            badgeLabel: `● Ongoing • ${ongoingDetail}`,
            statusPillText: 'Ongoing',
            detailText: ongoingDetail,
            badgeClass: 'bg-blue-50 text-blue-700 border-blue-200 shadow-2xs font-black',
            cardBorder: 'border-l-4 border-l-blue-500',
            dotClass: 'bg-blue-500',
            idBadgeClass: 'bg-blue-50 text-blue-700 border-blue-200'
        };
    };

    const processedReports = useMemo(() => {
        return incidentReports.map((report: any) => {
            const matchingClaim = incidentClaims.find((c: any) => c.report_id === report.report_id);
            const matchingWarning = petWarnings.find((w: any) => w.report_id === report.report_id);
            const statusInfo = getReportHistoryStatus(report, matchingClaim);
            return {
                ...report,
                matchingClaim,
                matchingWarning,
                statusInfo
            };
        });
    }, [incidentReports, incidentClaims, petWarnings]);

    const resolvedCount = useMemo(() => processedReports.filter(r => r.statusInfo.category === 'resolved').length, [processedReports]);
    const ongoingCount = useMemo(() => processedReports.filter(r => r.statusInfo.category === 'ongoing').length, [processedReports]);
    const warningsCount = useMemo(() => petWarnings.length, [petWarnings]);

    // Chronological Pet History Events (Append-only timeline)
    const chronologicalTimelineEvents = useMemo(() => {
        if (!pet) return [];
        const events: any[] = [];

        // 1. Pet Registration
        const regDate = pet.registeredAt || pet.rawPetObj?.created_at;
        if (regDate) {
            events.push({
                id: 'event-registration',
                type: 'registration',
                date: new Date(regDate),
                title: 'Registered in Official Pet Database',
                badgeText: 'Registration',
                badgeStyle: 'bg-indigo-50 text-indigo-700 border-indigo-200',
                dotColor: 'bg-indigo-500',
                description: `Pet record created and registered into STRAY-SAFE by ${pet.registeredByName || pet.rawPetObj?.registered_by_name || 'Subdivision Leader / Staff'}.`,
                icon: '📝',
                meta: {
                    registeredBy: pet.registeredByName || pet.rawPetObj?.registered_by_name || 'Subdivision Leader / Staff',
                    registeredAt: regDate
                }
            });
        }

        // 2. Vaccination Event
        if (pet.isVaccinated) {
            const vDate = pet.vaccinationDate ? new Date(pet.vaccinationDate) : (regDate ? new Date(regDate) : new Date());
            events.push({
                id: 'event-vaccination',
                type: 'vaccination',
                date: vDate,
                title: 'Vaccination & Medical Record Logged',
                badgeText: 'Vaccinated',
                badgeStyle: 'bg-emerald-50 text-emerald-700 border-emerald-200',
                dotColor: 'bg-emerald-500',
                description: `Rabies and core vaccination verified in municipal registry.${pet.vaccinationDate ? ` Administered on ${pet.vaccinationDate}.` : ''}`,
                icon: '💉',
                meta: {
                    vaccinationDate: pet.vaccinationDate,
                    vaccineCardUrl: pet.vaccineCardUrl
                }
            });
        }

        // 3. Official Warnings Issued (only standalone warnings without a linked report; report-linked warnings are embedded inside their respective Report card)
        petWarnings.forEach((w: any) => {
            if (w.report_id) return; // Linked to a report; shown directly inside that report card to prevent duplicate cards
            const wDate = w.issued_at || w.created_at ? new Date(w.issued_at || w.created_at) : new Date();
            events.push({
                id: `event-warning-${w.warning_id}`,
                type: 'warning',
                date: wDate,
                title: '⚠️ WARNING ISSUED',
                badgeText: w.status || 'Issued',
                badgeStyle: 'bg-rose-50 text-rose-700 border-rose-200 font-black',
                dotColor: 'bg-rose-500',
                description: w.warning_reason || w.description,
                icon: '⚠️',
                warning: w,
                reportId: w.report_id,
                reportRef: w.report_ref_display || (w.report_id ? `#REPORT-${w.report_id}` : null),
                issuer: `${w.issuer_name || 'Official'} (${w.issuer_role || 'Staff'})`,
                warningType: w.warning_type || w.violation_type || w.warning_level
            });
        });

        // 4. Incident Reports / Stray Sightings
        processedReports.forEach((r: any) => {
            const rDate = r.created_at || r.reported_at ? new Date(r.created_at || r.reported_at) : new Date();
            const year = rDate.getFullYear();
            const refStr = `#REPORT-${year}-${String(r.report_id).padStart(5, '0')}`;
            events.push({
                id: `event-report-${r.report_id}`,
                type: 'report',
                date: rDate,
                title: `Reported Stray / Sighting (${refStr})`,
                badgeText: r.statusInfo?.statusPillText || 'Reported',
                badgeStyle: r.statusInfo?.badgeClass || 'bg-blue-50 text-blue-700 border-blue-200',
                dotColor: r.statusInfo?.dotClass || 'bg-blue-500',
                description: r.description || `Sighting recorded at ${r.landmark || 'Community Area'}. Priority: ${r.condition || r.priority_level || 'Medium'}.`,
                icon: '📋',
                report: r,
                reportId: r.report_id,
                reportRef: refStr,
                matchingWarning: r.matchingWarning
            });
        });

        // Sort all events chronologically (newest first)
        return events.sort((a, b) => b.date.getTime() - a.date.getTime());
    }, [pet, petWarnings, processedReports]);

    const filteredReports = useMemo(() => {
        if (historyFilter === 'resolved') {
            return processedReports.filter(r => r.statusInfo.category === 'resolved');
        }
        if (historyFilter === 'ongoing') {
            return processedReports.filter(r => r.statusInfo.category === 'ongoing');
        }
        return processedReports;
    }, [processedReports, historyFilter]);

    // Owner search: active resident accounts in the caller's area only (no staff / admin accounts)
    useEffect(() => {
        if (!isAssignOwnerModalOpen || selectedOwner) return;
        const q = userSearchTerm.trim();
        if (q.length < 2) { setUsersList([]); return; }
        const t = setTimeout(async () => {
            setIsLoadingUsers(true);
            try {
                const res = await api.get('/report-returns/owner-search', { params: { q } });
                setUsersList(Array.isArray(res.data) ? res.data : []);
            } catch {
                setUsersList([]);
            } finally {
                setIsLoadingUsers(false);
            }
        }, 300);
        return () => clearTimeout(t);
    }, [userSearchTerm, isAssignOwnerModalOpen, selectedOwner]);

    useEffect(() => {
        if (isAssignOwnerModalOpen) {
            setSelectedOwner(null);
            setUsersList([]);
            setAssignError(null);
            setVerificationMethod('');
            // Linking an owner recorded without an account: start the search with their name
            const known = !pet?.owner_id ? pet?.offlineOwnerName : null;
            setUserSearchTerm(known || '');
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isAssignOwnerModalOpen]);

    const handleAssignOwnerSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setAssignError(null);
        if (hasOwner && !isAdmin) {
            setAssignError('Only System Administrators can request an owner change for a pet that already has an owner.');
            return;
        }
        if (!selectedOwner) {
            setAssignError("Search and select the owner's resident account.");
            return;
        }
        if (!verificationMethod) {
            setAssignError('Choose how the ownership was verified.');
            return;
        }
        try {
            setIsAssigning(true);
            const queryParams = new URLSearchParams({
                owner_id: String(selectedOwner.user_id),
                verified_claim: 'true',
                process_type: hasOwner ? `admin_reassignment:${verificationMethod}` : verificationMethod,
            });
            await api.post(`/pets/${pet!.id}/assign-owner?${queryParams.toString()}`);
            setIsAssignOwnerModalOpen(false);
            await loadOwnerConfirmation();
            if (onOwnerAssigned) {
                onOwnerAssigned();
            }
        } catch (err: any) {
            const detail = err.response?.data?.detail || 'Failed to send the ownership request.';
            setAssignError(typeof detail === 'string' ? detail : 'Failed to send the ownership request.');
        } finally {
            setIsAssigning(false);
        }
    };

    if (!pet) return null;

    const hasOwner = Boolean(
        (pet.owner_id || pet.rawPetObj?.owner_id || pet.rawPetObj?.owner?.user_id) &&
        !pet.ownerName.toLowerCase().includes('no owner') &&
        !pet.ownerName.toLowerCase().includes('unassigned') &&
        !pet.ownerName.toLowerCase().includes('community')
    );

    // Known owner without a StraySafe account (recorded on a Returned to Owner outcome)
    const offlineOwner = !hasOwner && pet.offlineOwnerName
        ? {
            name: pet.offlineOwnerName,
            phone: pet.rawPetObj?.emergency_contact_phone || null,
            address: pet.rawPetObj?.registered_address || null,
        }
        : null;

    // Registrant check: Did current user register this pet?
    const isRegistrant = Boolean(
        currentUserId && (
            (pet.registered_by_user_id && Number(pet.registered_by_user_id) === Number(currentUserId)) ||
            (pet.rawPetObj?.registered_by_user_id && Number(pet.rawPetObj.registered_by_user_id) === Number(currentUserId)) ||
            (pet.rawPetObj?.registered_by?.user_id && Number(pet.rawPetObj.registered_by.user_id) === Number(currentUserId)) ||
            (pet.registeredByName && currentUser?.name && pet.registeredByName.toLowerCase().includes(currentUser.name.toLowerCase())) ||
            (!pet.registered_by_user_id && !pet.rawPetObj?.registered_by_user_id) // Default fallback for existing records
        )
    );

    const isPetOwner = Boolean(
        currentUserId && (
            (pet.owner_id && Number(pet.owner_id) === Number(currentUserId)) ||
            (pet.rawPetObj?.owner_id && Number(pet.rawPetObj.owner_id) === Number(currentUserId))
        )
    );

    const isImpounded = Boolean(
        pet.status?.toLowerCase() === 'impounded' ||
        pet.rawPetObj?.status?.toLowerCase() === 'impounded' ||
        pet.rawPetObj?.custody_status?.toLowerCase() === 'impounded' ||
        incidentReports.some(r => r.status_id === 8 || r.current_status_id === 8 || (r.custody_status && r.custody_status.toLowerCase() === 'impounded'))
    );

    // Edit permission rule:
    // - Admin: always allowed
    // - Resident / Citizen: only if they are the pet owner
    // - Subdivision Leader / Staff: only as long as they are the one who registered AND no one has adopted the pet (!hasOwner && isRegistrant)
    const canEditPet = !isImpounded && (isAdmin || (hideRegisteredPets ? isPetOwner : (!hasOwner && isRegistrant)));

    // Status pill style helper
    const getStatusStyle = (status: string) => {
        if (isImpounded) return 'bg-amber-100 text-amber-800 border-amber-300 shadow-2xs font-black';
        switch (status?.toLowerCase()) {
            case 'active':
            case 'healthy':
                return 'bg-green-50 text-green-600 border-green-100';
            case 'lost':
                return 'bg-red-50 text-red-600 border-red-100';
            case 'found':
                return 'bg-blue-50 text-blue-600 border-blue-100';
            case 'rescued':
                return 'bg-orange-50 text-[#F97316] border-orange-100';
            case 'deceased':
                return 'bg-gray-100 text-gray-600 border-gray-200';
            case 'impounded':
                return 'bg-amber-100 text-amber-800 border-amber-300';
            default:
                return 'bg-amber-50 text-amber-600 border-amber-100';
        }
    };


    useEffect(() => {
        if (pet) {
            setCurrentPhoto(pet.avatar);
        }
    }, [pet?.avatar, pet?.id]);

    const handleUpdatePetPhoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file || !pet) return;
        try {
            setIsUploadingPhoto(true);
            const formData = new FormData();
            formData.append('file', file);
            const res = await api.post(`/pets/${pet.id}/photo`, formData, {
                headers: { 'Content-Type': 'multipart/form-data' }
            });
            if (res.data?.photo_url) {
                setCurrentPhoto(res.data.photo_url);
                pet.avatar = res.data.photo_url;
                if (pet.rawPetObj) pet.rawPetObj.photo_url = res.data.photo_url;
            }
            if (onOwnerAssigned) onOwnerAssigned();
        } catch (err) {
            console.error('Failed to update pet photo:', err);
        } finally {
            setIsUploadingPhoto(false);
            if (photoInputRef.current) photoInputRef.current.value = '';
        }
    };

    return (
        <div className="bg-[#FAFAF9] w-full h-full flex flex-col animate-in fade-in duration-500 overflow-hidden font-sans relative">
            {/* Header */}
            <header className="shrink-0 z-30 bg-white px-4 sm:px-8 py-3.5 sm:py-5 flex items-center justify-between border-b border-gray-100">
                <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
                    <div className="w-2 sm:w-2.5 h-5 sm:h-6 bg-[#F97316] rounded-full shrink-0"></div>
                    <h1 className="text-sm sm:text-lg font-black text-[#1a1208] uppercase tracking-wider truncate">Pet Profile Detailed Panel</h1>
                </div>
                <div className="flex items-center gap-2 sm:gap-3 shrink-0">
                    <button
                        onClick={onClose}
                        className="w-8 h-8 sm:w-10 sm:h-10 rounded-full border border-gray-100 flex items-center justify-center text-gray-400 hover:text-[#1a1208] hover:bg-gray-50 transition-all cursor-pointer shrink-0"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 sm:h-5 sm:w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>
            </header>

            {/* Content Area */}
            <div className="flex-1 overflow-y-auto p-4 sm:p-6 md:p-8 space-y-5 sm:space-y-6 scrollbar-thin scrollbar-thumb-gray-200 scrollbar-track-transparent">

                {/* Hero Profile Block */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 sm:gap-6">
                    {/* Large Photo Overlay */}
                    <div className="lg:col-span-2 relative h-[220px] sm:h-[280px] md:h-[320px] rounded-2xl sm:rounded-[2rem] overflow-hidden group shadow-lg border border-gray-100 bg-[#1a1208]">
                        <img
                            src={getPetPicture(currentPhoto || pet.avatar)}
                            alt={pet.name}
                            className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
                            onError={(e: any) => { e.target.src = DEFAULT_PET_AVATAR; }}
                        />

                        {/* Change Photo Button for Staff / Subdivision Leaders */}
                        {!hideRegisteredPets && (
                            <>
                                <input
                                    type="file"
                                    ref={photoInputRef}
                                    accept="image/*"
                                    onChange={handleUpdatePetPhoto}
                                    className="hidden"
                                />
                                <button
                                    type="button"
                                    onClick={() => photoInputRef.current?.click()}
                                    disabled={isUploadingPhoto}
                                    className="absolute top-3.5 right-3.5 sm:top-6 sm:right-6 z-20 px-2.5 sm:px-3.5 py-1.5 sm:py-2 bg-black/60 hover:bg-[#B35D25] backdrop-blur-md text-white rounded-xl text-[10px] sm:text-[11px] font-black uppercase tracking-wider border border-white/20 transition-all flex items-center gap-1.5 shadow-lg cursor-pointer disabled:opacity-50"
                                >
                                    <span>📷</span>
                                    <span>{isUploadingPhoto ? 'Uploading...' : 'Change Photo'}</span>
                                </button>
                            </>
                        )}

                        <div 
                            className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/25 to-transparent flex flex-col justify-end p-4 sm:p-8 sm:p-10 cursor-pointer"
                            onClick={() => setIsFullscreenImageOpen(true)}
                        >
                            <div className="flex flex-wrap items-center gap-2 mb-1.5 sm:mb-2">
                                <span className={`px-2.5 sm:px-4 py-1 sm:py-1.5 rounded-full text-[10px] sm:text-xs font-black uppercase tracking-widest border ${getStatusStyle(pet.status)}`}>
                                    {isImpounded ? 'IMPOUNDED' : pet.status}
                                </span>
                                {isImpounded ? (
                                    <span className="px-2.5 sm:px-3.5 py-1 sm:py-1.5 rounded-full text-[9px] sm:text-[11px] font-black uppercase tracking-widest bg-amber-900 text-amber-100 shadow-sm border border-amber-700">
                                        ⚖️ Under Government Custody • Ineligible for Claim / Adoption
                                    </span>
                                ) : !hasOwner && pet.offlineOwnerName ? (
                                    <span className="px-2.5 sm:px-3.5 py-1 sm:py-1.5 rounded-full text-[9px] sm:text-[11px] font-black uppercase tracking-widest bg-emerald-600 text-white shadow-sm">
                                        🏠 Owner Without StraySafe Account
                                    </span>
                                ) : !hasOwner && (
                                    <span className="px-2.5 sm:px-3.5 py-1 sm:py-1.5 rounded-full text-[9px] sm:text-[11px] font-black uppercase tracking-widest bg-amber-500 text-white shadow-sm">
                                        🐾 Unassigned / No Owner Yet
                                    </span>
                                )}
                            </div>
                            <h2 className="text-2xl sm:text-3xl md:text-4xl font-black text-white uppercase tracking-tight leading-tight">{pet.name}</h2>
                            <p className="text-[10px] sm:text-xs font-bold text-gray-300 uppercase tracking-widest mt-0.5">{pet.breed} • {pet.species} • {pet.sizeCategory || 'Medium'} Size</p>
                        </div>
                    </div>

                    {/* Vitals Summary Card / Quick Actions */}
                    <div className="flex flex-col justify-between gap-5 sm:gap-6">
                        {/* Vitals summary */}
                        <div className="bg-white rounded-2xl sm:rounded-[2rem] p-4 sm:p-6 shadow-sm border border-gray-100 space-y-4 sm:space-y-5">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <span className="text-[#F97316]">
                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V8a2 2 0 00-2-2h-5m-4 0V5a2 2 0 114 0v1m-4 0a2 2 0 104 0m-5 8a2 2 0 100-4 2 2 0 000 4zm0 0c1.306 0 2.417.835 2.83 2M9 14a3.001 3.001 0 00-2.83 2M15 11h3m-3 4h3" />
                                        </svg>
                                    </span>
                                    <h3 className="text-[11px] font-black text-gray-500 uppercase tracking-widest">Registry Details</h3>
                                </div>
                                {!hasOwner ? (
                                    <span className="text-[9px] font-black uppercase tracking-wider text-amber-700 bg-amber-50 px-2 py-0.5 rounded-lg border border-amber-200">
                                        Community Animal
                                    </span>
                                ) : (
                                    <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400">
                                        SYS-PET-REG
                                    </span>
                                )}
                            </div>
                            <div className="space-y-3.5 sm:space-y-4">
                                <div className="flex justify-between items-center">
                                    <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">Record ID</span>
                                    <span className="text-xs font-black text-[#1a1208]">{pet.idNumber}</span>
                                </div>
                                <div className="border-t border-gray-50"></div>
                                <div className="flex justify-between items-center">
                                    <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">Owner</span>
                                    {hasOwner ? (
                                        <div className="flex items-center gap-2 max-w-[170px]">
                                            <img
                                                src={getProfilePicture(pet.ownerPhoto || pet.rawPetObj?.owner?.profile_picture)}
                                                alt={pet.ownerName}
                                                className="w-5 h-5 rounded-full object-cover border border-gray-200 shrink-0"
                                                onError={(e) => { (e.currentTarget as HTMLImageElement).src = DEFAULT_AVATAR; }}
                                            />
                                            <span className="text-xs font-black text-[#1a1208] uppercase truncate">{pet.ownerName}</span>
                                        </div>
                                    ) : pet.offlineOwnerName ? (
                                        <span className="text-xs font-black text-[#1a1208] uppercase truncate max-w-[170px]" title="Owner has no StraySafe account">
                                            {pet.offlineOwnerName} <span className="text-[9px] text-gray-400 normal-case">(no account)</span>
                                        </span>
                                    ) : (
                                        <span className="text-xs font-black text-amber-800 uppercase italic">No Owner (Unassigned)</span>
                                    )}
                                </div>
                                <div className="border-t border-gray-50"></div>
                                <div className="flex justify-between items-center">
                                    <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">Email</span>
                                    <span className="text-xs font-black text-[#1a1208] truncate max-w-[150px]">{hasOwner ? pet.ownerEmail : '—'}</span>
                                </div>
                                <div className="border-t border-gray-50"></div>
                                <div className="flex justify-between items-center">
                                    <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">Contact</span>
                                    <span className="text-xs font-black text-[#1a1208]">{hasOwner ? (pet.ownerPhone || 'No Contact') : '—'}</span>
                                </div>
                            </div>
                        </div>

                        {/* Action Buttons for Citizen Owner */}
                        {hideRegisteredPets && (
                            <div className="space-y-3">
                                <div className="flex gap-3">
                                    {canEditPet && (
                                        <button
                                            onClick={() => onEditClick && onEditClick(pet)}
                                            className="flex-1 py-3 bg-[#F97316] hover:bg-[#E2620D] text-white rounded-xl font-black text-sm uppercase tracking-widest shadow-xs hover:scale-[1.01] transition-all cursor-pointer flex items-center justify-center gap-2"
                                        >
                                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                            </svg>
                                            Edit Pet
                                        </button>
                                    )}

                                    {pet.status?.toLowerCase() !== 'lost' && (
                                        <button
                                            onClick={() => onReportLostClick && onReportLostClick(pet)}
                                            className="flex-1 py-3 bg-red-50 hover:bg-red-100 text-red-600 rounded-xl font-black text-sm uppercase tracking-widest border border-red-100 hover:scale-[1.01] transition-all cursor-pointer flex items-center justify-center gap-2"
                                        >
                                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                                            </svg>
                                            Report Lost
                                        </button>
                                    )}
                                </div>

                                <div className="flex gap-2">
                                    <button
                                        onClick={handleOpenQrModal}
                                        className="flex-1 py-2.5 bg-white hover:bg-gray-50 text-gray-700 rounded-xl font-black text-xs uppercase tracking-widest border border-gray-200 hover:scale-[1.01] transition-all cursor-pointer flex items-center justify-center gap-1.5"
                                    >
                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v1m0 11v1m4-12h1a2 2 0 012 2v1m-9 9h1a2 2 0 012 2v1M4 12H3m18 0h-1m-2-5H8a2 2 0 00-2 2v8a2 2 0 002 2h8a2 2 0 002-2V9a2 2 0 00-2-2z" />
                                        </svg>
                                        QR Tag
                                    </button>

                                    <button
                                        onClick={() => navigate(`/resident/pet/${pet.id}/scan-history`)}
                                        className="flex-1 py-2.5 bg-white hover:bg-gray-50 text-gray-700 rounded-xl font-black text-xs uppercase tracking-widest border border-gray-200 hover:scale-[1.01] transition-all cursor-pointer flex items-center justify-center gap-1.5"
                                    >
                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
                                        </svg>
                                        Sightings
                                    </button>

                                    <button
                                        onClick={() => setIsConfirmingDelete(true)}
                                        className="flex-1 py-2.5 bg-white hover:bg-red-50 text-red-500 rounded-xl font-black text-xs uppercase tracking-widest border border-gray-200 hover:border-red-200 hover:scale-[1.01] transition-all cursor-pointer flex items-center justify-center gap-1.5"
                                    >
                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                        </svg>
                                        Remove
                                    </button>
                                </div>
                            </div>
                        )}

                        {/* Action Buttons for Subd Leader */}
                        {!hideRegisteredPets && (
                            <div className="space-y-3">
                                {canEditPet && (
                                    <button
                                        onClick={() => onEditClick && onEditClick(pet)}
                                        className="w-full py-3.5 bg-orange-50 hover:bg-orange-100 text-[#F97316] rounded-2xl font-black text-xs uppercase tracking-widest border border-orange-200 hover:scale-[1.02] transition-all cursor-pointer flex items-center justify-center gap-2"
                                    >
                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                        </svg>
                                        Edit Pet Details
                                    </button>
                                )}

                                {/* Owner Assignment / Reassignment Action */}
                                {isImpounded ? (
                                    /* Impounded animals are strictly in government custody and cannot be claimed or adopted */
                                    <div className="w-full py-3.5 px-4 bg-amber-50 text-amber-900 border border-amber-300 rounded-2xl font-black text-xs uppercase tracking-wider flex items-center justify-center gap-2 text-center shadow-xs">
                                        <span>⚖️</span>
                                        <span>Impounded (Ineligible for Claim / Adoption)</span>
                                    </div>
                                ) : hasOwner ? (
                                    /* Only System Admin can change/reassign an already registered pet */
                                    isAdmin && (
                                        <button
                                            onClick={() => setIsAssignOwnerModalOpen(true)}
                                            className="w-full py-3.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl font-black text-xs uppercase tracking-widest shadow-md hover:scale-[1.02] transition-all cursor-pointer flex items-center justify-center gap-2"
                                        >
                                            <span>👤</span>
                                            Change / Reassign Owner
                                        </button>
                                    )
                                ) : offlineOwner ? (
                                    /* Known owner without an account: only offer to link their account once they sign up */
                                    <button
                                        onClick={() => setIsAssignOwnerModalOpen(true)}
                                        className="w-full py-3.5 bg-white hover:bg-sky-50 text-sky-800 border border-sky-300 rounded-2xl font-black text-xs uppercase tracking-widest shadow-xs transition-all cursor-pointer flex items-center justify-center gap-2"
                                        title={`${offlineOwner.name} has no StraySafe account yet`}
                                    >
                                        <span>🔗</span>
                                        Link Owner's StraySafe Account
                                    </button>
                                ) : (
                                    /* Subdivision Leaders (Resident Claim), Barangay Staff, and Admin */
                                    <button
                                        onClick={() => setIsAssignOwnerModalOpen(true)}
                                        className="w-full py-3.5 bg-amber-600 hover:bg-amber-700 text-white rounded-2xl font-black text-xs uppercase tracking-widest shadow-md hover:scale-[1.02] transition-all cursor-pointer flex items-center justify-center gap-2"
                                    >
                                        <span>🐾</span>
                                        {userRoleId === 2
                                            ? 'Assign Verified Resident Owner'
                                            : 'Assign Owner (Claim / Turnover)'}
                                    </button>
                                )}

                                <button
                                    onClick={handleOpenQrModal}
                                    className="w-full py-3.5 bg-[#F97316] hover:bg-[#E2620D] text-white rounded-2xl font-black text-xs uppercase tracking-widest shadow-md hover:scale-[1.02] transition-all cursor-pointer flex items-center justify-center gap-2"
                                >
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v1m0 11v1m4-12h1a2 2 0 012 2v1m-9 9h1a2 2 0 012 2v1M4 12H3m18 0h-1m-2-5H8a2 2 0 00-2 2v8a2 2 0 002 2h8a2 2 0 002-2V9a2 2 0 00-2-2z" />
                                    </svg>
                                    View QR Tag
                                </button>

                                <button
                                    onClick={() => navigate(`/resident/pet/${pet.id}/scan-history?mode=subd`)}
                                    className="w-full py-3.5 bg-gray-50 hover:bg-gray-100 text-gray-700 rounded-2xl font-black text-xs uppercase tracking-widest border border-gray-200 hover:scale-[1.02] transition-all cursor-pointer flex items-center justify-center gap-2"
                                >
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
                                    </svg>
                                    Sightings
                                </button>

                                {/* Remove Pet Record: Only Admin can remove records from the officer/staff view */}
                                {isAdmin && (
                                    <button
                                        onClick={() => setIsConfirmingDelete(true)}
                                        className="w-full py-3.5 bg-red-50 hover:bg-red-100 text-red-600 rounded-2xl font-black text-xs uppercase tracking-widest border border-red-200 hover:scale-[1.02] transition-all cursor-pointer flex items-center justify-center gap-2"
                                    >
                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                        </svg>
                                        Remove Pet Record
                                    </button>
                                )}
                            </div>
                        )}
                    </div>
                </div>

                {/* Pet Owner Profile & Information (Visible ONLY on Subd, Brgy, and Admin pet records) */}
                {!hideRegisteredPets && (
                    <div className="bg-gradient-to-br from-orange-50/40 via-amber-50/20 to-white rounded-[2rem] p-6 sm:p-7 border-2 border-orange-200/80 shadow-xs space-y-5 animate-in fade-in duration-300">
                        <div className="flex items-center justify-between flex-wrap gap-3 border-b border-orange-200/60 pb-4">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-[#F97316] to-[#ea580c] text-white flex items-center justify-center text-lg font-black shadow-md shadow-orange-500/20">
                                    👤
                                </div>
                                <div>
                                    <h3 className="text-sm font-black text-gray-900 uppercase tracking-tight flex items-center gap-2">
                                        Pet Owner Information
                                        {isImpounded ? (
                                            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-amber-200 text-amber-950 border border-amber-400">
                                                ⚖️ Impounded Animal
                                            </span>
                                        ) : hasOwner ? (
                                            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-emerald-100 text-emerald-800 border border-emerald-300">
                                                Registered Owner
                                            </span>
                                        ) : offlineOwner ? (
                                            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-sky-100 text-sky-800 border border-sky-300">
                                                Known Owner · No Account
                                            </span>
                                        ) : (
                                            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-amber-100 text-amber-800 border border-amber-300">
                                                Community Animal
                                            </span>
                                        )}
                                    </h3>
                                    <p className="text-xs text-gray-500 font-medium">
                                        {isImpounded
                                            ? 'This animal has been officially impounded and is under government custody.'
                                            : hasOwner
                                                ? 'Resident profile and contact details linked to this registered pet'
                                                : offlineOwner
                                                    ? 'Owner recorded when the animal was returned. They do not have a StraySafe account.'
                                                    : 'No pet parent or owner currently associated with this animal record'}
                                    </p>
                                </div>
                            </div>

                            {/* Quick Action to Reassign / Register */}
                            {isImpounded ? (
                                <span className="px-3 py-1.5 bg-amber-100/90 text-amber-900 text-[10px] font-black uppercase tracking-wider rounded-xl border border-amber-300 flex items-center gap-1.5 shadow-2xs">
                                    <span>⚖️</span>
                                    <span>Ineligible for Claim / Adoption</span>
                                </span>
                            ) : hasOwner ? (
                                isAdmin ? (
                                    <button
                                        type="button"
                                        onClick={() => setIsAssignOwnerModalOpen(true)}
                                        className="px-3.5 py-2 bg-white hover:bg-orange-50 text-[#F97316] hover:text-[#ea580c] text-xs font-black uppercase tracking-wider rounded-xl border border-orange-300 transition-all shadow-2xs flex items-center gap-1.5 cursor-pointer"
                                    >
                                        <span>✏️</span>
                                        <span>Reassign Owner</span>
                                    </button>
                                ) : (
                                    <span className="px-3 py-1.5 bg-white/80 text-gray-500 text-[10px] font-black uppercase tracking-wider rounded-xl border border-gray-200 flex items-center gap-1.5 shadow-2xs">
                                        <span>🔒</span>
                                        <span>Owner Record Locked</span>
                                    </span>
                                )
                            ) : (
                                <button
                                    type="button"
                                    onClick={() => setIsAssignOwnerModalOpen(true)}
                                    className="px-3.5 py-2 bg-white hover:bg-orange-50 text-[#F97316] hover:text-[#ea580c] text-xs font-black uppercase tracking-wider rounded-xl border border-orange-300 transition-all shadow-2xs flex items-center gap-1.5 cursor-pointer"
                                >
                                    <span>{offlineOwner ? '🔗' : '🐾'}</span>
                                    <span>{offlineOwner ? 'Link StraySafe Account' : (userRoleId === 2 ? 'Assign Resident Owner' : 'Assign Owner')}</span>
                                </button>
                            )}
                        </div>

                        {ownerConfirmation?.status === 'Pending' && (
                            <div className="p-3.5 rounded-2xl bg-sky-50 border border-sky-200 flex items-center justify-between gap-3 flex-wrap" data-testid="owner-confirmation-pending">
                                <p className="text-xs text-sky-900 font-semibold">
                                    ⏳ Waiting for <strong>{ownerConfirmation.proposed_owner_name}</strong> to accept ownership
                                    {ownerConfirmation.proposed_by_name ? ` (requested by ${ownerConfirmation.proposed_by_name})` : ''}.
                                    The owner is not changed until they accept.
                                </p>
                                <button
                                    type="button"
                                    onClick={cancelOwnerConfirmation}
                                    className="px-3 py-1.5 rounded-xl bg-white border border-sky-300 text-sky-800 text-[10px] font-black uppercase tracking-wider cursor-pointer hover:bg-sky-100"
                                >
                                    Cancel Request
                                </button>
                            </div>
                        )}
                        {ownerConfirmation?.status === 'Rejected' && !hasOwner && (
                            <div className="p-3.5 rounded-2xl bg-rose-50 border border-rose-200 text-xs text-rose-900 font-semibold" data-testid="owner-confirmation-rejected">
                                ⚠️ <strong>{ownerConfirmation.proposed_owner_name}</strong> rejected ownership — the wrong account may have been selected.
                                {ownerConfirmation.reject_reason ? <> Reason: “{ownerConfirmation.reject_reason}”.</> : null} Verify the owner and assign the correct account.
                            </div>
                        )}

                        {hasOwner ? (
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-5 items-stretch">
                                {/* Profile Photo & Primary Identity */}
                                <div className="flex items-center gap-4 p-4 bg-white rounded-2xl border border-orange-100 shadow-2xs">
                                    <div className="relative w-16 h-16 rounded-2xl overflow-hidden border-2 border-orange-200 shrink-0 shadow-sm bg-gray-50">
                                        <img
                                            src={getProfilePicture(pet.ownerPhoto || pet.rawPetObj?.owner?.profile_picture)}
                                            alt={pet.ownerName}
                                            className="w-full h-full object-cover"
                                            onError={(e) => { (e.currentTarget as HTMLImageElement).src = DEFAULT_AVATAR; }}
                                        />
                                    </div>
                                    <div className="min-w-0">
                                        <p className="text-[10px] font-black text-gray-400 uppercase tracking-wider">Owner Profile</p>
                                        <h4 className="text-base font-black text-gray-900 truncate uppercase leading-tight">{pet.ownerName}</h4>
                                        {(pet.owner_id || pet.rawPetObj?.owner_id) && (
                                            <p className="text-[11px] font-bold text-gray-500 mt-0.5">
                                                User ID: <span className="font-mono font-black text-[#F97316]">#{pet.owner_id || pet.rawPetObj?.owner_id}</span>
                                            </p>
                                        )}
                                    </div>
                                </div>

                                {/* Contact Information */}
                                <div className="space-y-2.5 p-4 bg-white rounded-2xl border border-orange-100 shadow-2xs flex flex-col justify-center">
                                    <div>
                                        <span className="text-[10px] font-black text-gray-400 uppercase tracking-wider block">Phone Number</span>
                                        {pet.ownerPhone && pet.ownerPhone !== 'No Contact' && pet.ownerPhone !== 'No phone' ? (
                                            <a
                                                href={`tel:${pet.ownerPhone}`}
                                                className="text-xs font-black text-gray-900 hover:text-[#F97316] transition-colors flex items-center gap-1.5 mt-0.5"
                                            >
                                                <span>📞</span>
                                                <span>{pet.ownerPhone}</span>
                                            </a>
                                        ) : (
                                            <span className="text-xs font-bold text-gray-400 italic">No phone number recorded</span>
                                        )}
                                    </div>
                                    <div className="border-t border-gray-100 pt-2">
                                        <span className="text-[10px] font-black text-gray-400 uppercase tracking-wider block">Email Address</span>
                                        {pet.ownerEmail && pet.ownerEmail !== 'No Email' && pet.ownerEmail !== 'No email' ? (
                                            <a
                                                href={`mailto:${pet.ownerEmail}`}
                                                className="text-xs font-black text-gray-900 hover:text-[#F97316] transition-colors truncate block mt-0.5"
                                            >
                                                <span>✉️ {pet.ownerEmail}</span>
                                            </a>
                                        ) : (
                                            <span className="text-xs font-bold text-gray-400 italic">No email provided</span>
                                        )}
                                    </div>
                                </div>

                                {/* Address & Community Details */}
                                <div className="p-4 bg-white rounded-2xl border border-orange-100 shadow-2xs space-y-2 flex flex-col justify-center">
                                    <div>
                                        <span className="text-[10px] font-black text-gray-400 uppercase tracking-wider block">Registered Address</span>
                                        <p className="text-xs font-black text-gray-800 leading-snug mt-0.5 flex items-start gap-1.5">
                                            <span className="shrink-0 mt-0.5">📍</span>
                                            <span>{pet.ownerAddress || pet.rawPetObj?.registered_address || pet.rawPetObj?.owner?.address || 'Community residence on file'}</span>
                                        </p>
                                    </div>
                                    {pet.registeredByName && (
                                        <div className="border-t border-gray-100 pt-1.5">
                                            <span className="text-[9px] font-bold text-gray-400 uppercase tracking-wider block">Registered By</span>
                                            <span className="text-[11px] font-black text-gray-700 truncate block">{pet.registeredByName}</span>
                                        </div>
                                    )}
                                </div>
                            </div>
                        ) : isImpounded ? (
                            <div className="p-5 bg-amber-50/90 rounded-2xl border border-amber-300 flex items-center justify-between gap-4 flex-wrap">
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 rounded-xl bg-amber-200/80 text-amber-900 flex items-center justify-center text-lg font-black shrink-0">
                                        ⚖️
                                    </div>
                                    <div>
                                        <h4 className="text-xs font-black text-amber-950 uppercase tracking-wide">Impounded Animal Record</h4>
                                        <p className="text-xs text-amber-800 font-medium">
                                            This animal has been officially impounded by municipal authorities and is under government custody. It cannot be claimed or put up for adoption.
                                        </p>
                                    </div>
                                </div>
                                <span className="px-3 py-1.5 bg-amber-100 text-amber-900 border border-amber-300 text-[10px] font-black uppercase tracking-wider rounded-xl">
                                    Status: Impounded
                                </span>
                            </div>
                        ) : offlineOwner ? (
                            <div className="space-y-3">
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-5 items-stretch">
                                    <div className="flex items-center gap-4 p-4 bg-white rounded-2xl border border-sky-100 shadow-2xs">
                                        <div className="w-16 h-16 rounded-2xl bg-sky-50 border-2 border-sky-200 text-sky-700 flex items-center justify-center text-2xl font-black shrink-0">
                                            {offlineOwner.name.charAt(0).toUpperCase()}
                                        </div>
                                        <div className="min-w-0">
                                            <p className="text-[10px] font-black text-gray-400 uppercase tracking-wider">Owner (No Account)</p>
                                            <h4 className="text-base font-black text-gray-900 truncate uppercase leading-tight">{offlineOwner.name}</h4>
                                            <p className="text-[11px] font-bold text-sky-700 mt-0.5">Not a StraySafe user</p>
                                        </div>
                                    </div>
                                    <div className="p-4 bg-white rounded-2xl border border-sky-100 shadow-2xs flex flex-col justify-center">
                                        <span className="text-[10px] font-black text-gray-400 uppercase tracking-wider block">Phone Number</span>
                                        {offlineOwner.phone ? (
                                            <a href={`tel:${offlineOwner.phone}`} className="text-xs font-black text-gray-900 hover:text-[#F97316] transition-colors flex items-center gap-1.5 mt-0.5">
                                                <span>📞</span>
                                                <span>{offlineOwner.phone}</span>
                                            </a>
                                        ) : (
                                            <span className="text-xs font-bold text-gray-400 italic">No phone number recorded</span>
                                        )}
                                    </div>
                                    <div className="p-4 bg-white rounded-2xl border border-sky-100 shadow-2xs flex flex-col justify-center">
                                        <span className="text-[10px] font-black text-gray-400 uppercase tracking-wider block">Address</span>
                                        <p className="text-xs font-black text-gray-800 leading-snug mt-0.5 flex items-start gap-1.5">
                                            <span className="shrink-0 mt-0.5">📍</span>
                                            <span>{offlineOwner.address || 'No address recorded'}</span>
                                        </p>
                                    </div>
                                </div>
                                <p className="text-[11px] text-sky-800 bg-sky-50 border border-sky-200 rounded-xl px-3.5 py-2.5 font-medium">
                                    If this owner creates a StraySafe account later, use <strong>Link StraySafe Account</strong> to make them the registered owner.
                                </p>
                            </div>
                        ) : (
                            <div className="p-5 bg-amber-50/60 rounded-2xl border border-amber-200/80 flex items-center justify-between gap-4 flex-wrap">
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 rounded-xl bg-amber-200/70 text-amber-800 flex items-center justify-center text-lg font-black shrink-0">
                                        🐾
                                    </div>
                                    <div>
                                        <h4 className="text-xs font-black text-amber-950 uppercase tracking-wide">Community Animal / Unassigned Pet</h4>
                                        <p className="text-xs text-amber-800 font-medium">
                                            {userRoleId === 2
                                                ? 'This pet has no registered owner. Subdivision Leaders can assign a verified resident owner. (Adoptions are managed exclusively by Barangay).'
                                                : 'This pet currently has no registered owner profile associated with it.'}
                                        </p>
                                    </div>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => setIsAssignOwnerModalOpen(true)}
                                    className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white text-xs font-black uppercase tracking-wider rounded-xl transition-all shadow-sm cursor-pointer"
                                >
                                    {userRoleId === 2 ? '+ Assign Resident Owner' : '+ Assign Owner Now'}
                                </button>
                            </div>
                        )}
                    </div>
                )}

                {/* Styled Category Tabs */}
                <div className="space-y-4 sm:space-y-6">
                    <div className="flex items-center gap-4 sm:gap-8 border-b border-gray-100 overflow-x-auto pb-1 scrollbar-none">
                        {[
                            {
                                id: 'info', label: 'Pet Information', icon: (
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                    </svg>
                                )
                            },
                            {
                                id: 'health', label: 'Health Information', icon: (
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
                                    </svg>
                                )
                            },
                            {
                                id: 'behavior', label: 'Behavior Information', icon: (
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                                    </svg>
                                )
                            },
                            {
                                id: 'incident', label: 'Pet History', icon: (
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                                    </svg>
                                )
                            }
                        ].map((tab) => (
                            <button
                                key={tab.id}
                                onClick={() => setActiveTab(tab.id as any)}
                                className={`pb-3 sm:pb-4 text-[11px] sm:text-xs font-black uppercase tracking-wider transition-all relative shrink-0 cursor-pointer flex items-center gap-1.5 ${activeTab === tab.id ? 'text-[#F97316]' : 'text-gray-400 hover:text-gray-600'
                                    }`}
                            >
                                <span className={activeTab === tab.id ? 'text-[#F97316]' : 'text-gray-300'}>{tab.icon}</span>
                                {tab.label}
                                {activeTab === tab.id && (
                                    <div className="absolute bottom-0 left-0 right-0 h-1 bg-[#F97316] rounded-t-full"></div>
                                )}
                            </button>
                        ))}
                    </div>

                    {/* Tab Panels */}
                    <div className="bg-white rounded-2xl sm:rounded-[2rem] p-4 sm:p-6 border border-gray-100 shadow-sm animate-in fade-in slide-in-from-bottom-2 duration-300">

                        {/* Tab 1: Pet Information */}
                        {activeTab === 'info' && (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div className="space-y-4">
                                    <h4 className="text-xs font-black text-gray-400 uppercase tracking-widest">Base Statistics</h4>
                                    <div className="space-y-2.5">
                                        <div className="flex justify-between items-center bg-[#FAFAF9] px-4 py-3 rounded-xl border border-gray-100/60">
                                            <span className="text-xs font-bold text-gray-500">Gender</span>
                                            <span className="text-xs font-black text-[#1a1208] uppercase">{pet.gender}</span>
                                        </div>
                                        <div className="flex justify-between items-center bg-[#FAFAF9] px-4 py-3 rounded-xl border border-gray-100/60">
                                            <span className="text-xs font-bold text-gray-500">Estimated Age</span>
                                            <span className="text-xs font-black text-[#1a1208] uppercase">{pet.age}</span>
                                        </div>
                                        <div className="flex justify-between items-center bg-[#FAFAF9] px-4 py-3 rounded-xl border border-gray-100/60">
                                            <span className="text-xs font-bold text-gray-500">Species</span>
                                            <span className="text-xs font-black text-[#1a1208] uppercase">{pet.species}</span>
                                        </div>
                                        <div className="flex justify-between items-center bg-[#FAFAF9] px-4 py-3 rounded-xl border border-gray-100/60">
                                            <span className="text-xs font-bold text-gray-500">Size Category</span>
                                            <span className="text-xs font-black text-[#1a1208] uppercase">{pet.sizeCategory || 'Medium'}</span>
                                        </div>
                                    </div>
                                </div>

                                <div className="space-y-4">
                                    <h4 className="text-xs font-black text-gray-400 uppercase tracking-widest">Physical Attributes</h4>
                                    <div className="space-y-2.5">
                                        <div className="flex justify-between items-center bg-[#FAFAF9] px-4 py-3 rounded-xl border border-gray-100/60">
                                            <span className="text-xs font-bold text-gray-500">Weight</span>
                                            <span className="text-xs font-black text-[#1a1208] uppercase">{pet.weight || 'Unknown'}</span>
                                        </div>
                                        <div className="flex justify-between items-center bg-[#FAFAF9] px-4 py-3 rounded-xl border border-gray-100/60">
                                            <span className="text-xs font-bold text-gray-500">Primary Color</span>
                                            <span className="text-xs font-black text-[#1a1208] uppercase">{pet.primaryColor || 'Brown'}</span>
                                        </div>
                                        {pet.secondaryColor && pet.secondaryColor !== 'None' && (
                                            <div className="flex justify-between items-center bg-[#FAFAF9] px-4 py-3 rounded-xl border border-gray-100/60">
                                                <span className="text-xs font-bold text-gray-500">Secondary Color</span>
                                                <span className="text-xs font-black text-[#1a1208] uppercase">{pet.secondaryColor}</span>
                                            </div>
                                        )}
                                        {pet.tertiaryColor && pet.tertiaryColor !== 'None' && (
                                            <div className="flex justify-between items-center bg-[#FAFAF9] px-4 py-3 rounded-xl border border-gray-100/60">
                                                <span className="text-xs font-bold text-gray-500">Third Color (Tertiary)</span>
                                                <span className="text-xs font-black text-[#1a1208] uppercase">{pet.tertiaryColor}</span>
                                            </div>
                                        )}
                                        <div className="flex justify-between items-center bg-[#FAFAF9] px-4 py-3 rounded-xl border border-gray-100/60">
                                            <span className="text-xs font-bold text-gray-500">Color Markings</span>
                                            <span className="text-xs font-black text-[#1a1208] uppercase truncate max-w-[200px]">{pet.colorMarkings || 'None'}</span>
                                        </div>
                                    </div>
                                </div>

                                {/* Registration Record */}
                                <div className="space-y-3 md:col-span-2 border-t border-gray-100 pt-5">
                                    <h4 className="text-xs font-black text-gray-400 uppercase tracking-widest">Registration Record</h4>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                                        <div className="bg-[#FAFAF9] p-3.5 rounded-2xl border border-gray-100 flex items-center gap-3">
                                            <div className="w-9 h-9 rounded-xl bg-orange-100 text-[#F97316] flex items-center justify-center text-base font-black shrink-0">
                                                📝
                                            </div>
                                            <div className="min-w-0">
                                                <span className="text-[10px] font-black text-gray-400 uppercase tracking-wider block">Registered By</span>
                                                <span className="text-xs font-black text-[#1a1208] truncate block">{pet.registeredByName || pet.rawPetObj?.registered_by_name || 'Subdivision Leader / Staff'}</span>
                                            </div>
                                        </div>

                                        <div className="bg-[#FAFAF9] p-3.5 rounded-2xl border border-gray-100 flex items-center gap-3">
                                            <div className="w-9 h-9 rounded-xl bg-indigo-100 text-indigo-600 flex items-center justify-center text-base font-black shrink-0">
                                                📅
                                            </div>
                                            <div className="min-w-0">
                                                <span className="text-[10px] font-black text-gray-400 uppercase tracking-wider block">Registration Date</span>
                                                <span className="text-xs font-black text-[#1a1208] truncate block">
                                                    {pet.registeredAt || pet.rawPetObj?.created_at ? new Date(pet.registeredAt || pet.rawPetObj?.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'Recently Registered'}
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Tab 2: Health Information */}
                        {activeTab === 'health' && (
                            <div className="space-y-8">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                    <div className="space-y-4">
                                        <h4 className="text-xs font-black text-gray-400 uppercase tracking-widest">Vaccination Records</h4>
                                        <div className="bg-[#FAFAF9] p-5 rounded-2xl border border-gray-100 flex items-center justify-between">
                                            <div>
                                                <p className="text-xs font-black text-[#1a1208] uppercase mb-0.5">Rabies & Core Registry</p>
                                                <p className="text-[10px] text-gray-400 font-bold uppercase">
                                                    {pet.isVaccinated ? `Vaccinated on: ${pet.vaccinationDate || 'Unknown'}` : 'Not Registered'}
                                                </p>
                                            </div>
                                            <span className={`px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-wider border ${pet.isVaccinated ? 'bg-green-50 text-green-600 border-green-100' : 'bg-red-50 text-red-600 border-red-100'}`}>
                                                {pet.isVaccinated ? 'Vaccinated' : 'Not Vaccinated'}
                                            </span>
                                        </div>
                                    </div>

                                    <div className="space-y-4">
                                        <h4 className="text-xs font-black text-gray-400 uppercase tracking-widest">Spay/Neuter Status</h4>
                                        <div className="bg-[#FAFAF9] p-5 rounded-2xl border border-gray-100 flex items-center justify-between">
                                            <div>
                                                <p className="text-xs font-black text-[#1a1208] uppercase mb-0.5">Spayed / Neutered State</p>
                                                <p className="text-[10px] text-gray-400 font-bold uppercase">Surgical alignment record</p>
                                            </div>
                                            <span className={`px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-wider border ${pet.isNeutered ? 'bg-green-50 text-green-600 border-green-100' : 'bg-gray-100 text-gray-600 border-gray-200'}`}>
                                                {pet.isNeutered ? 'Neutered' : 'No'}
                                            </span>
                                        </div>
                                    </div>
                                </div>

                                <div className="space-y-4">
                                    <h4 className="text-xs font-black text-gray-400 uppercase tracking-widest">Health Conditions & Remarks</h4>
                                    <div className="bg-[#FAFAF9] p-6 rounded-2xl border border-gray-100">
                                        <p className="text-sm font-semibold text-[#1a1208] leading-relaxed">{pet.healthCondition}</p>
                                        {pet.notes && (
                                            <p className="text-xs font-medium text-gray-400 mt-4 border-t border-gray-200/50 pt-3">
                                                <span className="font-bold uppercase tracking-widest text-[9px]">Additional Notes:</span> {pet.notes}
                                            </p>
                                        )}
                                    </div>
                                </div>

                                <div className="space-y-4">
                                    <h4 className="text-xs font-black text-gray-400 uppercase tracking-widest">Supporting Document / Evidence</h4>
                                    {pet.vaccineCardUrl ? (
                                        <div className="bg-[#FAFAF9] p-6 rounded-[2rem] border border-gray-100 flex flex-col md:flex-row md:items-center justify-between gap-6 shadow-sm">
                                            <div className="flex items-center gap-4">
                                                <div className="w-12 h-12 rounded-2xl bg-orange-50 flex items-center justify-center text-[#F97316]">
                                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                                                    </svg>
                                                </div>
                                                <div>
                                                    <p className="text-sm font-black text-[#1a1208] uppercase mb-0.5">Vaccination Card / Support File</p>
                                                    <p className="text-[10px] text-gray-400 font-bold uppercase">Uploaded document for official verification</p>
                                                </div>
                                            </div>

                                            <div className="flex items-center gap-3">
                                                {!pet.vaccineCardUrl.toLowerCase().endsWith('.pdf') ? (
                                                    <div className="flex items-center gap-4">
                                                        <div
                                                            className="w-14 h-14 rounded-xl overflow-hidden border border-gray-200 shadow-sm cursor-pointer hover:shadow-md transition-all group relative"
                                                            onClick={() => setIsEvidenceOpen(true)}
                                                        >
                                                            <img src={pet.vaccineCardUrl} alt="Vaccination Evidence" className="w-full h-full object-cover transition-all duration-300 group-hover:scale-110" />
                                                            <div className="absolute inset-0 bg-black/10 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                                                                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                                                                </svg>
                                                            </div>
                                                        </div>
                                                        <button
                                                            onClick={() => setIsEvidenceOpen(true)}
                                                            className="px-5 py-3 bg-[#B35D25] hover:bg-[#974A1A] text-white rounded-xl text-[10px] font-black uppercase tracking-widest transition-all cursor-pointer"
                                                        >
                                                            Inspect Document
                                                        </button>
                                                    </div>
                                                ) : (
                                                    <a
                                                        href={pet.vaccineCardUrl}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        className="px-5 py-3 bg-[#B35D25] hover:bg-[#974A1A] text-white rounded-xl text-[10px] font-black uppercase tracking-widest transition-all inline-flex items-center gap-2"
                                                    >
                                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                                                        </svg>
                                                        Open PDF Document
                                                    </a>
                                                )}
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="bg-[#FAFAF9] p-8 rounded-[2rem] border border-dashed border-gray-200 text-center flex flex-col items-center justify-center gap-2">
                                            <div className="w-10 h-10 rounded-full bg-gray-50 flex items-center justify-center text-gray-400">
                                                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                                </svg>
                                            </div>
                                            <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">No vaccination card or supporting document uploaded</p>
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}

                        {/* Tab 3: Behavior Information */}
                        {activeTab === 'behavior' && (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                <div className="space-y-5">
                                    <h4 className="text-xs font-black text-gray-400 uppercase tracking-widest">Social Temperament</h4>
                                    <div className="bg-[#FAFAF9] p-5 rounded-2xl border border-gray-100 flex items-center justify-between">
                                        <div>
                                            <p className="text-xs font-black text-[#1a1208] uppercase mb-0.5">Temperament Profile</p>
                                            <p className="text-[10px] text-gray-400 font-bold uppercase">Behavioral classification</p>
                                        </div>
                                        <span className={`px-3.5 py-1.5 rounded-full text-[9px] font-black uppercase tracking-widest border ${(pet.temperament || '').toLowerCase() === 'aggressive'
                                            ? 'bg-rose-50 text-rose-600 border-rose-200'
                                            : (pet.temperament || '').toLowerCase() === 'friendly'
                                                ? 'bg-emerald-50 text-emerald-600 border-emerald-200'
                                                : 'bg-orange-50 text-[#F97316] border-orange-100'
                                            }`}>
                                            {pet.temperament || 'Friendly'}
                                        </span>
                                    </div>
                                </div>

                                <div className="space-y-5">
                                    <h4 className="text-xs font-black text-gray-400 uppercase tracking-widest font-bold">Behavior Triggers</h4>
                                    <div className="space-y-4">
                                        <div className="flex justify-between items-center bg-[#FAFAF9] px-5 py-3.5 rounded-xl">
                                            <div className="flex items-center gap-2">
                                                <span className="text-xs font-bold text-gray-500">Has Bite History?</span>
                                                {Boolean(pet.hasBiteHistory ?? pet.has_bite_history) && (
                                                    <span className="text-[9px] font-bold px-2 py-0.5 bg-rose-100 text-rose-800 rounded-md">
                                                        {(pet.biteIncidentCount ?? pet.bite_incident_count ?? 1)} incident(s)
                                                    </span>
                                                )}
                                            </div>
                                            <span className={`text-xs font-black uppercase ${Boolean(pet.hasBiteHistory ?? pet.has_bite_history) ? 'text-red-500 font-extrabold' : 'text-green-600 font-extrabold'
                                                }`}>
                                                {Boolean(pet.hasBiteHistory ?? pet.has_bite_history) ? 'YES' : 'NO'}
                                            </span>
                                        </div>
                                        <div className="flex justify-between items-center bg-[#FAFAF9] px-5 py-3.5 rounded-xl">
                                            <div className="flex items-center gap-2">
                                                <span className="text-xs font-bold text-gray-500">Chase Behavior?</span>
                                                {Boolean(pet.chaseBehavior ?? pet.chase_behavior) && (
                                                    <span className="text-[9px] font-bold px-2 py-0.5 bg-amber-100 text-amber-800 rounded-md">
                                                        {(pet.chaseIncidentCount ?? pet.chase_incident_count ?? 1)} incident(s)
                                                    </span>
                                                )}
                                            </div>
                                            <span className={`text-xs font-black uppercase ${Boolean(pet.chaseBehavior ?? pet.chase_behavior) ? 'text-red-500 font-extrabold' : 'text-green-600 font-extrabold'
                                                }`}>
                                                {Boolean(pet.chaseBehavior ?? pet.chase_behavior) ? 'YES' : 'NO'}
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Tab 4: Pet History & Incident Activity */}
                        {activeTab === 'incident' && (
                            <div className="space-y-8 animate-in fade-in duration-300">
                                {isLoadingIncidents ? (
                                    <div className="py-12 flex flex-col items-center justify-center gap-3">
                                        <div className="w-8 h-8 border-3 border-[#F97316] border-t-transparent rounded-full animate-spin"></div>
                                        <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">Loading pet history & incident timeline...</p>
                                    </div>
                                ) : (
                                    <div className="space-y-6">
                                        {/* Header & Sub-filter tabs */}
                                        <div className="flex items-center justify-between flex-wrap gap-4 border-b border-gray-100 pb-4">
                                            <div>
                                                <h4 className="text-sm font-black text-[#1a1208] uppercase tracking-wider flex items-center gap-2">
                                                    <ScrollText className="w-4 h-4 text-[#F97316]" />
                                                    <span>Pet History & Incident Activity</span>
                                                </h4>
                                                <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">
                                                    Append-only chronological audit log, sightings, and official warning citations for {pet.name}
                                                </p>
                                            </div>

                                            {/* Filter Tabs */}
                                            <div className="flex items-center gap-2 flex-wrap">
                                                <button
                                                    type="button"
                                                    onClick={() => setHistoryFilter('all')}
                                                    className={`px-3.5 py-1.5 rounded-full text-[10px] font-black uppercase tracking-wider transition-all cursor-pointer ${historyFilter === 'all'
                                                        ? 'bg-[#1a1208] text-white shadow-xs'
                                                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                                                        }`}
                                                >
                                                    All History ({chronologicalTimelineEvents.length})
                                                </button>

                                                <button
                                                    type="button"
                                                    onClick={() => setHistoryFilter('warnings')}
                                                    className={`px-3.5 py-1.5 rounded-full text-[10px] font-black uppercase tracking-wider transition-all cursor-pointer flex items-center gap-1.5 ${historyFilter === 'warnings'
                                                        ? 'bg-rose-600 text-white shadow-xs'
                                                        : warningsCount > 0
                                                            ? 'bg-rose-50 text-rose-700 hover:bg-rose-100 border border-rose-200/80 font-black'
                                                            : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                                                        }`}
                                                >
                                                    <AlertTriangle className="w-3 h-3" />
                                                    <span>Warnings ({warningsCount})</span>
                                                </button>

                                                <button
                                                    type="button"
                                                    onClick={() => setHistoryFilter('reports')}
                                                    className={`px-3.5 py-1.5 rounded-full text-[10px] font-black uppercase tracking-wider transition-all cursor-pointer ${historyFilter === 'reports'
                                                        ? 'bg-[#1a1208] text-white shadow-xs'
                                                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                                                        }`}
                                                >
                                                    Sightings ({processedReports.length})
                                                </button>

                                                <button
                                                    type="button"
                                                    onClick={() => setHistoryFilter('resolved')}
                                                    className={`px-3.5 py-1.5 rounded-full text-[10px] font-black uppercase tracking-wider transition-all cursor-pointer flex items-center gap-1.5 ${historyFilter === 'resolved'
                                                        ? 'bg-emerald-600 text-white shadow-xs'
                                                        : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200/80'
                                                        }`}
                                                >
                                                    <span className={`w-1.5 h-1.5 rounded-full ${historyFilter === 'resolved' ? 'bg-white' : 'bg-emerald-500'}`}></span>
                                                    Resolved ({resolvedCount})
                                                </button>

                                                <button
                                                    type="button"
                                                    onClick={() => setHistoryFilter('ongoing')}
                                                    className={`px-3.5 py-1.5 rounded-full text-[10px] font-black uppercase tracking-wider transition-all cursor-pointer flex items-center gap-1.5 ${historyFilter === 'ongoing'
                                                        ? 'bg-blue-600 text-white shadow-xs'
                                                        : 'bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200/80'
                                                        }`}
                                                >
                                                    <span className={`w-1.5 h-1.5 rounded-full ${historyFilter === 'ongoing' ? 'bg-white' : 'bg-blue-500'}`}></span>
                                                    Ongoing ({ongoingCount})
                                                </button>
                                            </div>
                                        </div>

                                        {/* VIEW 1: WARNINGS ONLY FILTER */}
                                        {historyFilter === 'warnings' && (
                                            <div className="space-y-5">
                                                {petWarnings.length === 0 ? (
                                                    <div className="bg-[#FAFAF9] rounded-3xl p-8 border border-dashed border-gray-200 text-center space-y-3">
                                                        <div className="w-12 h-12 mx-auto rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center text-xl font-black">
                                                            ✓
                                                        </div>
                                                        <p className="text-xs font-black text-gray-800 uppercase tracking-wide">
                                                            No Official Warnings Issued
                                                        </p>
                                                        <p className="text-[11px] text-gray-400 font-bold">
                                                            {pet.name} maintains a clean community record with no warning citations on file.
                                                        </p>
                                                    </div>
                                                ) : (
                                                    petWarnings.map((warning: any) => {
                                                        const issuedDate = new Date(warning.issued_at || warning.created_at);
                                                        const dateStr = issuedDate.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
                                                        const timeStr = issuedDate.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });

                                                        return (
                                                            <div
                                                                key={warning.warning_id}
                                                                className="bg-gradient-to-br from-rose-50/50 via-white to-orange-50/20 rounded-3xl p-6 border-2 border-rose-200/90 shadow-sm space-y-5"
                                                            >
                                                                <div className="flex flex-wrap items-center justify-between gap-4 border-b border-rose-100 pb-4">
                                                                    <div className="flex items-center gap-3">
                                                                        <div className="w-11 h-11 rounded-2xl bg-rose-500 text-white flex items-center justify-center font-black shadow-md shadow-rose-500/20 shrink-0">
                                                                            <AlertTriangle className="w-6 h-6" />
                                                                        </div>
                                                                        <div>
                                                                            <div className="flex items-center gap-2 flex-wrap">
                                                                                <h5 className="text-sm font-black text-rose-950 uppercase tracking-tight">
                                                                                    ⚠ WARNING ISSUED
                                                                                </h5>
                                                                                <span className="text-[10px] px-2.5 py-0.5 bg-rose-100 text-rose-800 rounded-full font-extrabold uppercase tracking-wider border border-rose-200">
                                                                                    {warning.status || 'Issued'}
                                                                                </span>
                                                                            </div>
                                                                            <p className="text-[11px] text-gray-500 font-bold mt-0.5">
                                                                                {dateStr} — {timeStr}
                                                                            </p>
                                                                        </div>
                                                                    </div>

                                                                    <div className="flex items-center gap-2 flex-wrap">
                                                                        {warning.report_id && (
                                                                            <button
                                                                                type="button"
                                                                                onClick={() => {
                                                                                    const targetUrl = userRoleId === 2
                                                                                        ? `/subd/reports/${warning.report_id}`
                                                                                        : (userRoleId === 3 ? `/brgy/reports/${warning.report_id}` : (userRoleId === 4 ? `/admin/reports/${warning.report_id}` : `/resident/reports/${warning.report_id}`));
                                                                                    navigate(targetUrl);
                                                                                }}
                                                                                className="px-4 py-2 bg-rose-100 hover:bg-rose-200 text-rose-800 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all cursor-pointer flex items-center gap-1.5 shadow-2xs"
                                                                            >
                                                                                <FileText className="w-3.5 h-3.5" />
                                                                                <span>View Related Report</span>
                                                                                <ExternalLink className="w-3 h-3" />
                                                                            </button>
                                                                        )}
                                                                        <button
                                                                            type="button"
                                                                            onClick={() => {
                                                                                setSelectedWarningModal(warning);
                                                                                setIsWarningDetailsOpen(true);
                                                                            }}
                                                                            className="px-4 py-2 bg-[#1a1208] hover:bg-[#2c2010] text-white rounded-xl text-[10px] font-black uppercase tracking-wider transition-all cursor-pointer shadow-xs"
                                                                        >
                                                                            Warning Details
                                                                        </button>
                                                                    </div>
                                                                </div>

                                                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 text-xs">
                                                                    <div className="bg-white p-4 rounded-2xl border border-gray-100 shadow-2xs">
                                                                        <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest block mb-1">Warning Type:</span>
                                                                        <p className="font-black text-[#1a1208] uppercase text-xs">
                                                                            {warning.warning_type || warning.violation_type || warning.warning_level}
                                                                        </p>
                                                                    </div>
                                                                    <div className="bg-white p-4 rounded-2xl border border-gray-100 shadow-2xs">
                                                                        <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest block mb-1">Related Report:</span>
                                                                        <p className="font-black text-blue-700 text-xs">
                                                                            {warning.report_ref_display || (warning.report_id ? `#REPORT-${warning.report_id}` : 'Direct Citation')}
                                                                        </p>
                                                                    </div>
                                                                    <div className="sm:col-span-2 bg-white p-4 rounded-2xl border border-gray-100 shadow-2xs">
                                                                        <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest block mb-1">Reason:</span>
                                                                        <p className="font-bold text-gray-800 leading-relaxed text-xs">
                                                                            {warning.warning_reason || warning.description}
                                                                        </p>
                                                                    </div>
                                                                    <div className="bg-white p-4 rounded-2xl border border-gray-100 shadow-2xs">
                                                                        <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest block mb-1">Issued By:</span>
                                                                        <p className="font-black text-gray-800 text-xs">
                                                                            {warning.issuer_name || 'Barangay Staff'} <span className="text-gray-500 font-bold">({warning.issuer_role || 'Staff'})</span>
                                                                        </p>
                                                                    </div>
                                                                    <div className="bg-white p-4 rounded-2xl border border-gray-100 shadow-2xs">
                                                                        <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest block mb-1">Status:</span>
                                                                        <p className="font-black text-emerald-700 uppercase text-xs">
                                                                            {warning.status || 'Issued'}
                                                                        </p>
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        );
                                                    })
                                                )}
                                            </div>
                                        )}

                                        {/* VIEW 2: UNIFIED CHRONOLOGICAL APPEND-ONLY TIMELINE */}
                                        {historyFilter === 'all' && (
                                            <div className="space-y-6">
                                                {chronologicalTimelineEvents.length === 0 ? (
                                                    <div className="bg-[#FAFAF9] rounded-3xl p-8 border border-dashed border-gray-200 text-center space-y-3">
                                                        <div className="w-12 h-12 mx-auto rounded-2xl bg-gray-100 text-gray-400 flex items-center justify-center text-xl">
                                                            📋
                                                        </div>
                                                        <p className="text-xs font-black text-gray-700 uppercase tracking-wide">
                                                            No History Events Logged
                                                        </p>
                                                        <p className="text-[11px] text-gray-400 font-bold">
                                                            No recorded events found for {pet.name}.
                                                        </p>
                                                    </div>
                                                ) : (
                                                    <div className="relative pl-6 sm:pl-8 space-y-6">
                                                        {/* Crisp vertical connecting line */}
                                                        <div className="absolute left-[13px] sm:left-[17px] top-4 bottom-4 w-[2px] bg-slate-200 rounded-full" />

                                                        {chronologicalTimelineEvents.map((event: any) => {
                                                            const dateStr = event.date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
                                                            const timeStr = event.date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });

                                                            // Event Type A: WARNING
                                                            if (event.type === 'warning') {
                                                                const w = event.warning;
                                                                return (
                                                                    <div key={event.id} className="relative pl-4 sm:pl-6 group">
                                                                        {/* Node Dot */}
                                                                        <div className="absolute -left-[19px] sm:-left-[23px] top-3.5 w-7 h-7 rounded-full bg-rose-600 text-white flex items-center justify-center text-xs font-black ring-4 ring-rose-100 shadow-sm z-10">
                                                                            ⚠️
                                                                        </div>

                                                                        <div className="bg-gradient-to-br from-rose-50/60 via-white to-orange-50/30 rounded-3xl p-5 sm:p-6 border-2 border-rose-200 shadow-sm space-y-4">
                                                                            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-rose-100 pb-3">
                                                                                <div>
                                                                                    <div className="flex items-center gap-2 flex-wrap">
                                                                                        <h5 className="text-xs sm:text-sm font-black text-rose-950 uppercase tracking-wide">
                                                                                            ⚠ WARNING ISSUED
                                                                                        </h5>
                                                                                        <span className="text-[9px] px-2 py-0.5 bg-rose-100 text-rose-800 rounded-full font-black uppercase">
                                                                                            {w.status || 'Issued'}
                                                                                        </span>
                                                                                    </div>
                                                                                    <p className="text-[10px] text-gray-500 font-bold mt-0.5">
                                                                                        {dateStr} — {timeStr}
                                                                                    </p>
                                                                                </div>

                                                                                <div className="flex items-center gap-2 flex-wrap">
                                                                                    {w.report_id && (
                                                                                        <button
                                                                                            type="button"
                                                                                            onClick={() => {
                                                                                                const targetUrl = userRoleId === 2
                                                                                                    ? `/subd/reports/${w.report_id}`
                                                                                                    : (userRoleId === 3 ? `/brgy/reports/${w.report_id}` : (userRoleId === 4 ? `/admin/reports/${w.report_id}` : `/resident/reports/${w.report_id}`));
                                                                                                navigate(targetUrl);
                                                                                            }}
                                                                                            className="px-3.5 py-1.5 bg-rose-100 hover:bg-rose-200 text-rose-800 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all cursor-pointer flex items-center gap-1 shadow-2xs"
                                                                                        >
                                                                                            <span>View Related Report</span>
                                                                                            <ExternalLink className="w-3 h-3" />
                                                                                        </button>
                                                                                    )}
                                                                                    <button
                                                                                        type="button"
                                                                                        onClick={() => {
                                                                                            setSelectedWarningModal(w);
                                                                                            setIsWarningDetailsOpen(true);
                                                                                        }}
                                                                                        className="px-3.5 py-1.5 bg-[#1a1208] hover:bg-[#2c2010] text-white rounded-xl text-[10px] font-black uppercase tracking-wider transition-all cursor-pointer shadow-xs"
                                                                                    >
                                                                                        Warning Details
                                                                                    </button>
                                                                                </div>
                                                                            </div>

                                                                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                                                                                <div className="bg-white p-3.5 rounded-2xl border border-gray-100 shadow-2xs">
                                                                                    <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest block mb-0.5">Warning Type:</span>
                                                                                    <p className="font-black text-[#1a1208] uppercase text-xs">{w.warning_type || w.violation_type || w.warning_level}</p>
                                                                                </div>
                                                                                <div className="bg-white p-3.5 rounded-2xl border border-gray-100 shadow-2xs">
                                                                                    <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest block mb-0.5">Related Report:</span>
                                                                                    <p className="font-black text-blue-700 text-xs">{w.report_ref_display || (w.report_id ? `#REPORT-${w.report_id}` : 'Direct Citation')}</p>
                                                                                </div>
                                                                                <div className="sm:col-span-2 bg-white p-3.5 rounded-2xl border border-gray-100 shadow-2xs">
                                                                                    <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest block mb-0.5">Reason:</span>
                                                                                    <p className="font-bold text-gray-800 leading-relaxed text-xs">{w.warning_reason || w.description}</p>
                                                                                </div>
                                                                                <div className="bg-white p-3.5 rounded-2xl border border-gray-100 shadow-2xs">
                                                                                    <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest block mb-0.5">Issued By:</span>
                                                                                    <p className="font-black text-gray-800 text-xs">{w.issuer_name || 'Barangay Staff'} <span className="text-gray-500 font-bold">({w.issuer_role || 'Staff'})</span></p>
                                                                                </div>
                                                                                <div className="bg-white p-3.5 rounded-2xl border border-gray-100 shadow-2xs">
                                                                                    <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest block mb-0.5">Status:</span>
                                                                                    <p className="font-black text-emerald-700 uppercase text-xs">{w.status || 'Issued'}</p>
                                                                                </div>
                                                                            </div>
                                                                        </div>
                                                                    </div>
                                                                );
                                                            }

                                                            // Event Type B: SIGHTING REPORT
                                                            if (event.type === 'report') {
                                                                const r = event.report;
                                                                const statusInfo = r.statusInfo;
                                                                const mediaPhoto = (r.media && r.media.length > 0) ? r.media[0].file_url : null;
                                                                const matchingWarning = r.matchingWarning;

                                                                return (
                                                                    <div key={event.id} className="relative pl-4 sm:pl-6 group">
                                                                        {/* Node Dot */}
                                                                        <div className={`absolute -left-[19px] sm:-left-[23px] top-3.5 w-7 h-7 rounded-full text-white flex items-center justify-center text-xs font-black ring-4 shadow-sm z-10 ${statusInfo.category === 'resolved' ? 'bg-emerald-600 ring-emerald-100' : 'bg-blue-600 ring-blue-100'
                                                                            }`}>
                                                                            📋
                                                                        </div>

                                                                        <div className={`bg-[#FAFAF9] rounded-3xl p-5 sm:p-6 border border-gray-100 shadow-sm space-y-4 ${statusInfo.cardBorder}`}>
                                                                            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-200/60 pb-3">
                                                                                <div className="flex items-center gap-3">
                                                                                    <span className={`w-9 h-9 rounded-xl font-black text-xs flex items-center justify-center border shadow-xs ${statusInfo.idBadgeClass}`}>
                                                                                        #{r.report_id}
                                                                                    </span>
                                                                                    <div>
                                                                                        <h5 className="text-xs sm:text-sm font-black text-[#1a1208] uppercase">
                                                                                            Reported Stray / Sighting ({event.reportRef})
                                                                                        </h5>
                                                                                        <p className="text-[10px] text-gray-400 font-bold uppercase">
                                                                                            {dateStr} — {timeStr}
                                                                                        </p>
                                                                                    </div>
                                                                                </div>

                                                                                <div className="flex items-center gap-2 flex-wrap">
                                                                                    <span className={`px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-wider border shadow-2xs flex items-center gap-1.5 ${statusInfo.badgeClass}`}>
                                                                                        <span className={`w-1.5 h-1.5 rounded-full ${statusInfo.dotClass}`}></span>
                                                                                        <span>{statusInfo.badgeLabel}</span>
                                                                                    </span>
                                                                                    <button
                                                                                        type="button"
                                                                                        onClick={() => {
                                                                                            const targetUrl = userRoleId === 2
                                                                                                ? `/subd/reports/${r.report_id}`
                                                                                                : (userRoleId === 3 ? `/brgy/reports/${r.report_id}` : (userRoleId === 4 ? `/admin/reports/${r.report_id}` : `/resident/reports/${r.report_id}`));
                                                                                            navigate(targetUrl);
                                                                                        }}
                                                                                        className="px-3.5 py-1.5 bg-[#1a1208] hover:bg-[#2c2010] text-white rounded-xl text-[10px] font-black uppercase tracking-wider transition-all cursor-pointer flex items-center gap-1 shadow-xs"
                                                                                    >
                                                                                        View Report
                                                                                        <ExternalLink className="w-3 h-3" />
                                                                                    </button>
                                                                                </div>
                                                                            </div>

                                                                            {/* Warning Banner if warning was issued for this report */}
                                                                            {matchingWarning && (
                                                                                <div className="p-3 bg-rose-50 border border-rose-200 rounded-2xl flex items-center justify-between gap-3 text-xs">
                                                                                    <div className="flex items-center gap-2 min-w-0">
                                                                                        <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                                                                                        <span className="font-black text-rose-950 truncate">
                                                                                            Official Warning Issued: <span className="text-rose-800">{matchingWarning.warning_type || matchingWarning.violation_type}</span>
                                                                                        </span>
                                                                                    </div>
                                                                                    <button
                                                                                        type="button"
                                                                                        onClick={() => {
                                                                                            setSelectedWarningModal(matchingWarning);
                                                                                            setIsWarningDetailsOpen(true);
                                                                                        }}
                                                                                        className="px-3 py-1 bg-white hover:bg-rose-100 text-rose-800 text-[9px] font-black uppercase tracking-wider rounded-lg border border-rose-200 transition-all cursor-pointer shadow-2xs shrink-0"
                                                                                    >
                                                                                        Warning Details
                                                                                    </button>
                                                                                </div>
                                                                            )}

                                                                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                                                                                {mediaPhoto && (
                                                                                    <div className="w-full h-32 rounded-2xl overflow-hidden bg-gray-100 border border-gray-200 shadow-2xs">
                                                                                        <img src={mediaPhoto} alt="Sighting Media" className="w-full h-full object-cover" />
                                                                                    </div>
                                                                                )}
                                                                                <div className={`${mediaPhoto ? 'sm:col-span-2' : 'sm:col-span-3'} space-y-2 text-xs`}>
                                                                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                                                                        <div className="bg-white p-3 rounded-xl border border-gray-100">
                                                                                            <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest block mb-0.5">Location</span>
                                                                                            <span className="font-black text-gray-800 truncate block">{r.landmark || 'Selera Homes'}</span>
                                                                                        </div>
                                                                                        <div className="bg-white p-3 rounded-xl border border-gray-100">
                                                                                            <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest block mb-0.5">Condition</span>
                                                                                            <span className="font-black text-[#F97316] uppercase truncate block">{r.condition || r.priority_level || 'Medium'}</span>
                                                                                        </div>
                                                                                    </div>
                                                                                    {r.description && (
                                                                                        <div className="bg-white p-3 rounded-xl border border-gray-100">
                                                                                            <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest block mb-0.5">Notes</span>
                                                                                            <p className="text-gray-700 font-semibold line-clamp-2">{r.description}</p>
                                                                                        </div>
                                                                                    )}
                                                                                </div>
                                                                            </div>
                                                                        </div>
                                                                    </div>
                                                                );
                                                            }

                                                            // Event Type C: REGISTRATION / VACCINATION
                                                            return (
                                                                <div key={event.id} className="relative pl-4 sm:pl-6 group">
                                                                    {/* Node Dot */}
                                                                    <div className={`absolute -left-[19px] sm:-left-[23px] top-3.5 w-7 h-7 rounded-full text-white flex items-center justify-center text-xs font-black ring-4 shadow-sm z-10 ${event.type === 'vaccination' ? 'bg-emerald-600 ring-emerald-100' : 'bg-indigo-600 ring-indigo-100'
                                                                        }`}>
                                                                        {event.icon}
                                                                    </div>

                                                                    <div className="bg-[#FAFAF9] rounded-3xl p-5 border border-gray-100 shadow-sm space-y-2">
                                                                        <div className="flex items-center justify-between gap-3">
                                                                            <div>
                                                                                <h5 className="text-xs sm:text-sm font-black text-[#1a1208] uppercase">
                                                                                    {event.title}
                                                                                </h5>
                                                                                <p className="text-[10px] text-gray-400 font-bold uppercase">
                                                                                    {dateStr}
                                                                                </p>
                                                                            </div>
                                                                            <span className={`px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-wider border shadow-2xs ${event.badgeStyle}`}>
                                                                                {event.badgeText}
                                                                            </span>
                                                                        </div>
                                                                        <p className="text-xs font-semibold text-gray-600 leading-relaxed">
                                                                            {event.description}
                                                                        </p>
                                                                    </div>
                                                                </div>
                                                            );
                                                        })}
                                                    </div>
                                                )}
                                            </div>
                                        )}

                                        {/* VIEW 3: FILTERED REPORTS ONLY (Reports, Resolved, Ongoing) */}
                                        {['reports', 'resolved', 'ongoing'].includes(historyFilter) && (
                                            <div className="space-y-6">
                                                {filteredReports.length === 0 ? (
                                                    <div className="bg-[#FAFAF9] rounded-3xl p-8 border border-dashed border-gray-200 text-center space-y-3">
                                                        <div className="w-12 h-12 mx-auto rounded-2xl bg-gray-100 text-gray-400 flex items-center justify-center text-xl">
                                                            📋
                                                        </div>
                                                        <p className="text-xs font-black text-gray-700 uppercase tracking-wide">
                                                            No {historyFilter === 'resolved' ? 'Resolved' : historyFilter === 'ongoing' ? 'Ongoing' : 'Sighting'} Reports Found
                                                        </p>
                                                        <p className="text-[11px] text-gray-400 font-bold">
                                                            There are currently no {historyFilter} reports recorded for {pet.name}.
                                                        </p>
                                                        <button
                                                            type="button"
                                                            onClick={() => setHistoryFilter('all')}
                                                            className="px-4 py-2 bg-orange-50 hover:bg-orange-100 text-[#F97316] text-[10px] font-black uppercase tracking-wider rounded-xl transition-all cursor-pointer"
                                                        >
                                                            Show All History
                                                        </button>
                                                    </div>
                                                ) : (
                                                    <div className="space-y-6">
                                                        {filteredReports.map((report: any) => {
                                                            const matchingClaim = report.matchingClaim;
                                                            const matchingWarning = report.matchingWarning;
                                                            const statusInfo = report.statusInfo;
                                                            const mediaPhoto = (report.media && report.media.length > 0) ? report.media[0].file_url : null;

                                                            return (
                                                                <div key={report.report_id} className={`bg-[#FAFAF9] rounded-3xl p-6 border border-gray-100 shadow-sm space-y-6 transition-all ${statusInfo.cardBorder}`}>
                                                                    {/* Header Bar */}
                                                                    <div className="flex flex-wrap items-center justify-between gap-4 border-b border-gray-200/60 pb-4">
                                                                        <div className="flex items-center gap-3">
                                                                            <span className={`w-10 h-10 rounded-2xl font-black text-xs flex items-center justify-center border shadow-xs ${statusInfo.idBadgeClass}`}>
                                                                                #{report.report_id}
                                                                            </span>
                                                                            <div>
                                                                                <h5 className="text-xs font-black text-[#1a1208] uppercase">Reported Stray / Sighting for {pet.name}</h5>
                                                                                <p className="text-[10px] text-gray-400 font-bold uppercase">
                                                                                    Date: {new Date(report.created_at || report.reported_at).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })}
                                                                                </p>
                                                                            </div>
                                                                        </div>

                                                                        <div className="flex items-center gap-3 flex-wrap">
                                                                            <span className={`px-4 py-1.5 rounded-full text-[10px] uppercase tracking-wider border shadow-xs flex items-center gap-1.5 ${statusInfo.badgeClass}`}>
                                                                                <span className={`w-2 h-2 rounded-full ${statusInfo.dotClass} ${statusInfo.category === 'ongoing' ? 'animate-pulse' : ''}`}></span>
                                                                                <span>{statusInfo.badgeLabel}</span>
                                                                            </span>
                                                                            <button
                                                                                type="button"
                                                                                onClick={() => {
                                                                                    const targetUrl = userRoleId === 2
                                                                                        ? `/subd/reports/${report.report_id}`
                                                                                        : (userRoleId === 3 ? `/brgy/reports/${report.report_id}` : (userRoleId === 4 ? `/admin/reports/${report.report_id}` : `/resident/reports/${report.report_id}`));
                                                                                    navigate(targetUrl);
                                                                                }}
                                                                                className="px-4 py-2.5 bg-[#1a1208] hover:bg-[#2c2010] text-white rounded-xl text-[10px] font-black uppercase tracking-widest transition-all cursor-pointer flex items-center gap-1.5 shadow-sm hover:scale-[1.02]"
                                                                            >
                                                                                <span>View Report</span>
                                                                                <ExternalLink className="w-3.5 h-3.5" />
                                                                            </button>
                                                                        </div>
                                                                    </div>

                                                                    {/* Prominent Warning Banner if warning was issued */}
                                                                    {matchingWarning && (
                                                                        <div className="p-4 bg-gradient-to-r from-rose-50 to-orange-50/50 border-2 border-rose-200 rounded-2xl flex items-center justify-between gap-4 text-xs shadow-2xs">
                                                                            <div className="flex items-center gap-2.5 min-w-0">
                                                                                <div className="w-8 h-8 rounded-xl bg-rose-500 text-white flex items-center justify-center font-black shrink-0 shadow-sm shadow-rose-500/20">
                                                                                    <AlertTriangle className="w-4 h-4" />
                                                                                </div>
                                                                                <div>
                                                                                    <span className="font-black text-rose-950 uppercase tracking-wide block">
                                                                                        ⚠️ Official Warning Issued for this Incident
                                                                                    </span>
                                                                                    <span className="text-[11px] text-rose-800 font-bold block truncate">
                                                                                        {matchingWarning.warning_type || matchingWarning.violation_type} • Issued by {matchingWarning.issuer_name || 'Staff'} ({matchingWarning.issuer_role || 'Official'})
                                                                                    </span>
                                                                                </div>
                                                                            </div>
                                                                            <button
                                                                                type="button"
                                                                                onClick={() => {
                                                                                    setSelectedWarningModal(matchingWarning);
                                                                                    setIsWarningDetailsOpen(true);
                                                                                }}
                                                                                className="px-3.5 py-1.5 bg-rose-600 hover:bg-rose-700 text-white text-[10px] font-black uppercase tracking-wider rounded-xl transition-all cursor-pointer shadow-xs shrink-0"
                                                                            >
                                                                                Warning Details
                                                                            </button>
                                                                        </div>
                                                                    )}

                                                                    {/* Body Content */}
                                                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                                                        {mediaPhoto ? (
                                                                            <div className="w-full h-44 rounded-2xl overflow-hidden bg-gray-100 border border-gray-200 shadow-sm relative group">
                                                                                <img src={mediaPhoto} alt="Report Evidence" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                                                                                <span className="absolute bottom-2 left-2 px-2.5 py-1 bg-black/60 backdrop-blur-sm text-white rounded-lg text-[9px] font-bold uppercase tracking-wider">Sighting Media</span>
                                                                            </div>
                                                                        ) : (
                                                                            <div className="w-full h-44 rounded-2xl bg-gray-100 border border-dashed border-gray-200 flex flex-col items-center justify-center text-gray-400 text-xs font-bold uppercase gap-2">
                                                                                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                                                                </svg>
                                                                                <span>No Photo Attached</span>
                                                                            </div>
                                                                        )}

                                                                        <div className="md:col-span-2 space-y-4">
                                                                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                                                                <div className="bg-white p-4 rounded-2xl border border-gray-100 shadow-xs">
                                                                                    <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest block mb-1">Sighting Location</span>
                                                                                    <span className="text-xs font-black text-[#1a1208] uppercase truncate block">{report.landmark || 'Selera Homes'}</span>
                                                                                </div>
                                                                                <div className="bg-white p-4 rounded-2xl border border-gray-100 shadow-xs">
                                                                                    <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest block mb-1">Condition / Priority</span>
                                                                                    <span className="text-xs font-black text-[#F97316] uppercase truncate block">{report.condition || report.priority_level || 'Medium'}</span>
                                                                                </div>
                                                                            </div>

                                                                            {report.description && (
                                                                                <div className="bg-white p-4 rounded-2xl border border-gray-100 shadow-xs">
                                                                                    <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest block mb-1">Incident Report Notes</span>
                                                                                    <p className="text-xs font-semibold text-gray-700 leading-relaxed line-clamp-2">{report.description}</p>
                                                                                </div>
                                                                            )}

                                                                            {matchingClaim && (
                                                                                <div className={`p-4 rounded-2xl border shadow-xs space-y-1 ${statusInfo.category === 'resolved'
                                                                                    ? 'bg-emerald-50/70 border-emerald-200/70'
                                                                                    : 'bg-blue-50/70 border-blue-200/70'
                                                                                    }`}>
                                                                                    <div className="flex items-center justify-between">
                                                                                        <span className={`text-[9px] font-black uppercase tracking-widest block ${statusInfo.category === 'resolved' ? 'text-emerald-700' : 'text-blue-700'
                                                                                            }`}>
                                                                                            {statusInfo.category === 'resolved' ? '✓ Claim Resolution & Handover Notes' : 'ℹ Claim & Processing Remarks'}
                                                                                        </span>
                                                                                        <span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded-md ${statusInfo.category === 'resolved' ? 'bg-emerald-100 text-emerald-800' : 'bg-blue-100 text-blue-800'
                                                                                            }`}>
                                                                                            {matchingClaim.status}
                                                                                        </span>
                                                                                    </div>
                                                                                    <p className="text-xs font-bold text-[#1a1208]">
                                                                                        {matchingClaim.remarks || "Claim verified and confirmed by authorized personnel."}
                                                                                    </p>
                                                                                </div>
                                                                            )}
                                                                        </div>
                                                                    </div>
                                                                </div>
                                                            );
                                                        })}
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        )}

                    </div>
                </div>

            </div>



            {/* Vaccine Card / Evidence Lightbox Modal */}
            {isEvidenceOpen && pet.vaccineCardUrl && (
                <div className="fixed inset-0 z-[600] flex items-center justify-center p-4">
                    <div
                        className="absolute inset-0 bg-stone-900/60 backdrop-blur-md animate-in fade-in duration-300"
                        onClick={() => setIsEvidenceOpen(false)}
                    />
                    <div className="relative w-full max-w-2xl bg-white rounded-[2.5rem] p-8 shadow-2xl overflow-hidden animate-in zoom-in-95 duration-300 text-center">
                        <div className="flex justify-between items-center mb-6">
                            <div className="text-left">
                                <h3 className="text-lg font-black text-[#1a1208] uppercase tracking-tight">Vaccine Card & Supporting Evidence</h3>
                                <p className="text-[9px] font-black text-[#F97316] uppercase tracking-widest">{pet.name} • {pet.idNumber}</p>
                            </div>
                            <button
                                onClick={() => setIsEvidenceOpen(false)}
                                className="w-8 h-8 rounded-full border border-gray-100 flex items-center justify-center text-gray-400 hover:text-[#1a1208] hover:bg-gray-50 transition-all cursor-pointer"
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>

                        <div className="w-full max-h-[450px] overflow-auto bg-gray-50 border border-gray-100 rounded-3xl p-4 flex items-center justify-center relative mb-6 shadow-inner group">
                            <img
                                src={pet.vaccineCardUrl}
                                className="max-w-full max-h-[400px] object-contain rounded-2xl shadow-md border border-gray-100"
                                alt="Vaccination Card Evidence"
                            />
                        </div>

                        <div className="flex gap-4">
                            <button
                                onClick={() => setIsEvidenceOpen(false)}
                                className="flex-1 py-4 bg-gray-50 hover:bg-gray-100 text-gray-700 rounded-2xl text-xs font-black uppercase tracking-widest border border-gray-200 transition-all cursor-pointer"
                            >
                                Close Preview
                            </button>
                            <a
                                href={pet.vaccineCardUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex-1 py-4 bg-[#B35D25] hover:bg-[#974A1A] text-white rounded-2xl text-xs font-black uppercase tracking-widest transition-all cursor-pointer flex items-center justify-center gap-2"
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                                </svg>
                                Open Original
                            </a>
                        </div>
                    </div>
                </div>
            )}
            {/* Assign Owner Modal — sends an ownership request the resident must accept */}
            {isAssignOwnerModalOpen && (
                <div className="fixed inset-0 z-[600] flex items-center justify-center p-4">
                    <div
                        className="absolute inset-0 bg-[#1a1208]/60 backdrop-blur-md animate-in fade-in duration-300"
                        onClick={() => !isAssigning && setIsAssignOwnerModalOpen(false)}
                    />
                    <div className="relative w-full max-w-lg bg-white rounded-[2rem] shadow-2xl overflow-hidden animate-in zoom-in-95 duration-300 flex flex-col max-h-[92vh]">
                        {/* Header */}
                        <div className="px-6 sm:px-7 pt-6 pb-4 border-b border-gray-100 flex items-start justify-between gap-3">
                            <div className="flex items-center gap-3 min-w-0">
                                <img
                                    src={getPetPicture(pet.avatar)}
                                    alt={pet.name}
                                    className="w-12 h-12 rounded-2xl object-cover border-2 border-orange-100 shrink-0"
                                    onError={(e) => { (e.currentTarget as HTMLImageElement).src = DEFAULT_PET_AVATAR; }}
                                />
                                <div className="min-w-0">
                                    <h3 className="text-base font-black text-[#1a1208] tracking-tight">
                                        {hasOwner ? 'Request Owner Change' : offlineOwner ? "Link Owner's StraySafe Account" : 'Send Ownership Request'}
                                    </h3>
                                    <p className="text-[11px] font-bold text-gray-400 truncate">
                                        {pet.name} · {pet.idNumber}
                                        {hasOwner && <> · current owner: <span className="text-[#B35D25]">{pet.ownerName}</span></>}
                                    </p>
                                </div>
                            </div>
                            <button
                                type="button"
                                onClick={() => !isAssigning && setIsAssignOwnerModalOpen(false)}
                                className="w-8 h-8 rounded-full border border-gray-100 flex items-center justify-center text-gray-400 hover:text-gray-900 shrink-0 cursor-pointer"
                            >
                                ✕
                            </button>
                        </div>

                        {hasOwner && !isAdmin ? (
                            <div className="p-6 sm:p-7 space-y-4">
                                <div className="p-4 bg-amber-50 border border-amber-200 rounded-2xl flex items-start gap-3">
                                    <span className="text-xl">🔒</span>
                                    <p className="text-xs text-amber-900 font-medium leading-relaxed">
                                        This pet already has a registered owner. Only System Administrators can request an owner change.
                                    </p>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => setIsAssignOwnerModalOpen(false)}
                                    className="w-full py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-2xl text-xs font-black uppercase tracking-wider cursor-pointer"
                                >
                                    Close
                                </button>
                            </div>
                        ) : (
                            <form onSubmit={handleAssignOwnerSubmit} className="flex flex-col min-h-0 flex-1">
                                <div className="px-6 sm:px-7 py-5 space-y-5 overflow-y-auto">
                                    {assignError && (
                                        <div className="p-3 bg-red-50 border border-red-200 rounded-2xl text-xs font-bold text-red-700">{assignError}</div>
                                    )}

                                    {/* Step 1: who */}
                                    <div className="space-y-2.5">
                                        <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest">1 · Find the owner's resident account</p>
                                        {offlineOwner && (
                                            <p className="text-[11px] text-sky-800 bg-sky-50 border border-sky-200 rounded-xl px-3 py-2">
                                                Recorded owner without an account: <strong>{offlineOwner.name}</strong>. Search for the account they created.
                                            </p>
                                        )}
                                        {selectedOwner ? (
                                            <div className="p-3.5 rounded-2xl border-2 border-[#B35D25] bg-orange-50/60 flex items-center gap-3">
                                                <div className="w-10 h-10 rounded-xl bg-[#B35D25] text-white flex items-center justify-center font-black shrink-0">
                                                    {(selectedOwner.name || '?').charAt(0).toUpperCase()}
                                                </div>
                                                <div className="min-w-0 flex-1 text-xs">
                                                    <p className="font-black text-gray-900 truncate">{selectedOwner.name}</p>
                                                    <p className="text-[10px] text-gray-500 truncate">{[selectedOwner.phone, selectedOwner.email].filter(Boolean).join(' • ')}</p>
                                                    {selectedOwner.address && <p className="text-[10px] text-gray-500 truncate">📍 {selectedOwner.address}</p>}
                                                </div>
                                                <button
                                                    type="button"
                                                    onClick={() => setSelectedOwner(null)}
                                                    className="text-[10px] font-black text-[#B35D25] uppercase cursor-pointer shrink-0"
                                                >
                                                    Change
                                                </button>
                                            </div>
                                        ) : (
                                            <>
                                                <input
                                                    type="text"
                                                    autoFocus
                                                    value={userSearchTerm}
                                                    onChange={(e) => setUserSearchTerm(e.target.value)}
                                                    placeholder="Type a name, email or phone (min. 2 characters)"
                                                    className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-2xl text-xs font-bold text-gray-900 placeholder-gray-400 focus:bg-white focus:border-[#B35D25] outline-none"
                                                />
                                                {userSearchTerm.trim().length < 2 ? (
                                                    <p className="text-[10px] text-gray-400 px-1">Only active resident accounts in your area are listed. Staff and admin accounts can't be pet owners.</p>
                                                ) : isLoadingUsers ? (
                                                    <p className="text-[11px] text-gray-400 px-1">Searching…</p>
                                                ) : usersList.length === 0 ? (
                                                    <p className="text-[11px] text-gray-500 bg-gray-50 rounded-xl p-3">
                                                        No resident account matches. If the owner has no account, record them through the report's <strong>Returned to Owner</strong> outcome instead.
                                                    </p>
                                                ) : (
                                                    <div className="max-h-48 overflow-y-auto space-y-1.5 pr-1 custom-scrollbar">
                                                        {usersList.map((u) => (
                                                            <button
                                                                key={u.user_id}
                                                                type="button"
                                                                onClick={() => setSelectedOwner(u)}
                                                                className="w-full text-left p-2.5 rounded-xl border border-gray-100 bg-white hover:border-[#B35D25] hover:bg-orange-50/40 flex items-center gap-3 cursor-pointer transition-colors"
                                                            >
                                                                <div className="w-8 h-8 rounded-lg bg-gray-100 text-gray-600 flex items-center justify-center text-xs font-black shrink-0">
                                                                    {(u.name || '?').charAt(0).toUpperCase()}
                                                                </div>
                                                                <div className="min-w-0">
                                                                    <p className="text-xs font-black text-gray-900 truncate">{u.name}</p>
                                                                    <p className="text-[10px] text-gray-500 truncate">{[u.phone, u.email].filter(Boolean).join(' • ')}</p>
                                                                </div>
                                                            </button>
                                                        ))}
                                                    </div>
                                                )}
                                            </>
                                        )}
                                    </div>

                                    {/* Step 2: how was it verified */}
                                    <div className="space-y-2">
                                        <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest">2 · How was ownership verified?</p>
                                        <div className="grid grid-cols-1 gap-1.5">
                                            {VERIFICATION_METHODS.filter((m) => !(m.key === 'barangay_adoption' && userRoleId === 2)).map((m) => (
                                                <label
                                                    key={m.key}
                                                    className={`flex items-start gap-2.5 p-2.5 rounded-xl border cursor-pointer transition-colors ${
                                                        verificationMethod === m.key ? 'border-[#B35D25] bg-orange-50/50' : 'border-gray-100 hover:bg-gray-50'
                                                    }`}
                                                >
                                                    <input
                                                        type="radio"
                                                        name="verification-method"
                                                        checked={verificationMethod === m.key}
                                                        onChange={() => setVerificationMethod(m.key)}
                                                        className="mt-0.5 accent-[#B35D25] cursor-pointer"
                                                    />
                                                    <span>
                                                        <span className="block text-xs font-black text-gray-900">{m.label}</span>
                                                        <span className="block text-[10px] text-gray-500">{m.hint}</span>
                                                    </span>
                                                </label>
                                            ))}
                                        </div>
                                    </div>

                                    {/* What happens next */}
                                    <div className="p-3.5 rounded-2xl bg-sky-50 border border-sky-200 text-[11px] text-sky-900 leading-relaxed">
                                        <strong>{selectedOwner?.name || 'The resident'}</strong> will get a notification and must tap <strong>“Yes, it's mine”</strong> on their My Pets page.
                                        {hasOwner ? ' The current owner stays on record until then.' : ' The pet stays unassigned until then.'} If they reject it, you'll be notified to check the owner again.
                                    </div>
                                </div>

                                {/* Footer */}
                                <div className="px-6 sm:px-7 py-4 border-t border-gray-100 flex gap-3 bg-gray-50/60">
                                    <button
                                        type="button"
                                        onClick={() => setIsAssignOwnerModalOpen(false)}
                                        disabled={isAssigning}
                                        className="flex-1 py-3 bg-white border border-gray-200 hover:bg-gray-100 text-gray-700 rounded-xl text-xs font-black uppercase tracking-wider cursor-pointer"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        type="submit"
                                        disabled={isAssigning || !selectedOwner || !verificationMethod}
                                        className="flex-1 py-3 bg-[#B35D25] hover:bg-[#974A1A] text-white rounded-xl text-xs font-black uppercase tracking-wider shadow-md disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed"
                                    >
                                        {isAssigning ? 'Sending…' : 'Send Ownership Request'}
                                    </button>
                                </div>
                            </form>
                        )}
                    </div>
                </div>
            )}

            {/* Remove Pet Confirmation Modal */}
            {isConfirmingDelete && pet && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#1a1208]/60 backdrop-blur-sm animate-in fade-in duration-200">
                    <div className="relative w-full max-w-md bg-white rounded-3xl p-6 md:p-8 shadow-2xl space-y-6 animate-in zoom-in-95 duration-200">
                        <div className="w-14 h-14 rounded-2xl bg-red-50 text-red-600 flex items-center justify-center text-2xl shrink-0 mx-auto border border-red-100 shadow-sm">
                            🐾
                        </div>

                        <div className="text-center space-y-3">
                            <h3 className="text-xl font-black text-gray-900 uppercase tracking-tight">Remove this pet?</h3>
                            <p className="text-xs text-gray-600 font-medium leading-relaxed">
                                This pet will be removed from your active pet list. Previous reports, records, QR history, and other related information will remain in the system.
                            </p>
                            <div className="p-3 bg-gray-50 rounded-2xl border border-gray-100 text-left">
                                <span className="text-[10px] font-black text-gray-400 uppercase tracking-wider block">Pet to Remove</span>
                                <span className="text-xs font-black text-gray-900 block mt-0.5">{pet.name} {pet.breed ? `(${pet.breed})` : ''}</span>
                            </div>
                        </div>

                        <div className="flex gap-3 pt-2">
                            <button
                                type="button"
                                onClick={() => setIsConfirmingDelete(false)}
                                disabled={isDeleting}
                                className="flex-1 py-3.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-2xl text-xs font-black uppercase tracking-wider transition-all cursor-pointer disabled:opacity-50"
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                onClick={handleDeletePet}
                                disabled={isDeleting}
                                className="flex-1 py-3.5 bg-red-600 hover:bg-red-700 text-white rounded-2xl text-xs font-black uppercase tracking-wider shadow-lg shadow-red-900/20 transition-all cursor-pointer disabled:opacity-50 flex items-center justify-center gap-2"
                            >
                                {isDeleting ? (
                                    <>
                                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                        <span>Removing...</span>
                                    </>
                                ) : (
                                    <span>Remove Pet</span>
                                )}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Real StraySafe QR Tag Lightbox Modal */}
            {isQrOpen && (
                <div
                    className="fixed inset-0 z-[700] flex items-center justify-center p-4 bg-black/70 backdrop-blur-md animate-in fade-in duration-200"
                    onClick={() => setIsQrOpen(false)}
                >
                    <div
                        className="bg-white rounded-[2.5rem] p-8 max-w-sm w-full shadow-2xl border border-amber-100 animate-in zoom-in-95 duration-200 text-center relative"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <button
                            onClick={() => setIsQrOpen(false)}
                            className="absolute top-5 right-5 w-8 h-8 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-gray-500 hover:text-gray-900 transition-colors cursor-pointer"
                        >
                            ✕
                        </button>

                        <div className="w-12 h-12 rounded-2xl bg-amber-100 text-amber-700 flex items-center justify-center text-xl font-black mx-auto mb-2">
                            🐾
                        </div>
                        <h3 className="text-xl font-black text-[#1a1208] uppercase tracking-tight mb-1">
                            Pet ID QR Code
                        </h3>
                        <p className="text-[10px] font-extrabold text-gray-400 uppercase tracking-widest mb-5">
                            StraySafe Smart Identification Tag
                        </p>

                        <div className="w-56 h-56 mx-auto bg-amber-50/50 border-4 border-dashed border-[#F97316]/30 rounded-3xl p-3 flex flex-col items-center justify-center relative mb-4 shadow-inner">
                            {isLoadingQr ? (
                                <div className="flex flex-col items-center justify-center gap-2">
                                    <div className="w-8 h-8 border-3 border-amber-500 border-t-transparent rounded-full animate-spin"></div>
                                    <span className="text-[11px] text-gray-400 font-bold">Generating real QR tag...</span>
                                </div>
                            ) : qrData?.qr_image_url ? (
                                <img
                                    src={qrData.qr_image_url}
                                    alt="Live StraySafe Pet QR Code"
                                    className="w-full h-full object-contain rounded-2xl shadow-xs bg-white p-1.5"
                                />
                            ) : (
                                <div className="flex flex-col items-center justify-center gap-1 text-center p-2">
                                    <span className="text-2xl">⚠️</span>
                                    <span className="text-[11px] text-gray-500 font-bold">QR Tag not generated yet</span>
                                </div>
                            )}
                        </div>

                        <div className="space-y-1 mb-5">
                            <p className="text-lg font-black text-[#1a1208] uppercase">{pet.name}</p>
                            <p className="text-[11px] font-black text-[#F97316] uppercase tracking-widest">{pet.idNumber || `P-${pet.id.padStart(5, '0')}`}</p>
                            {qrData?.qr_token && (
                                <p className="text-[10px] font-mono font-bold text-gray-500 bg-gray-100 px-2 py-0.5 rounded-md inline-block mt-1">
                                    Tag ID: {qrData.qr_token.slice(0, 10).toUpperCase()}
                                </p>
                            )}
                            <p className="text-[11px] text-gray-500 font-semibold px-2 pt-1 leading-relaxed">
                                Scan to retrieve vaccine verification, owner contact details, and emergency subdivision records.
                            </p>
                        </div>

                        <div className="space-y-2">
                            <button
                                type="button"
                                onClick={() => {
                                    setIsQrOpen(false);
                                    navigate(hideRegisteredPets ? `/resident/pet/${pet.id}/qr` : `/subd/pet/${pet.id}/qr?mode=subd`);
                                }}
                                className="w-full py-3.5 bg-[#B35D25] hover:bg-[#964E1F] text-white rounded-2xl text-xs font-black uppercase tracking-wider transition-all shadow-md cursor-pointer flex items-center justify-center gap-1.5"
                            >
                                <span>Open Full Printable Card</span>
                                <span>↗</span>
                            </button>
                            <button
                                type="button"
                                onClick={() => setIsQrOpen(false)}
                                className="w-full py-3 bg-[#1a1208] hover:bg-[#2c2010] text-white rounded-2xl text-xs font-black uppercase tracking-widest transition-all cursor-pointer"
                            >
                                Close QR Tag
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Fullscreen Image Modal */}
            {isFullscreenImageOpen && (
                <div
                    className="fixed inset-0 z-[800] flex items-center justify-center bg-black/90 backdrop-blur-sm animate-in fade-in duration-300"
                    onClick={() => setIsFullscreenImageOpen(false)}
                >
                    <button
                        onClick={() => setIsFullscreenImageOpen(false)}
                        className="absolute top-6 right-6 w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-colors cursor-pointer z-50"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                    <img
                        src={getPetPicture(currentPhoto || pet.avatar)}
                        alt={pet.name}
                        className="max-w-[90vw] max-h-[90vh] object-contain animate-in zoom-in-95 duration-300"
                        onError={(e: any) => { e.target.src = DEFAULT_PET_AVATAR; }}
                        onClick={(e) => e.stopPropagation()}
                    />
                </div>
            )}

            {/* Warning Details Modal */}
            <WarningDetailsModal
                isOpen={isWarningDetailsOpen}
                onClose={() => {
                    setIsWarningDetailsOpen(false);
                    setSelectedWarningModal(null);
                }}
                warning={selectedWarningModal}
            />
        </div>
    );
};

export default PetDetailPanel;
