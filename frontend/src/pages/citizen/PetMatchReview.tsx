import { useState, useEffect } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../../utils/api';
import { validateFile, UPLOAD_ACCEPT } from '../../utils/uploadValidation';
import { uploadDirectToCloudinary } from '../../utils/cloudinaryUpload';
import { DEFAULT_PET_AVATAR, getPetPicture } from '../../utils/avatar';
import Button from '../../components/Button';
import ResiNavbar from '../../components/Navbars/ResiNavbar';
import ReportChatDrawer from '../../components/Chat/ReportChatDrawer';
import MapComponent from '../../components/MapComponent';
import { compressImageFile } from '../../utils/imageCompress';
import { Camera, Upload, X, CheckCircle2, AlertTriangle, Loader2, Sparkles, PawPrint } from 'lucide-react';


import { SELERA_DEFAULT_CENTER, isValidLatLng } from '../../utils/coverageArea';
import { petName } from '../../utils/petName';
const parseReportDescription = (description: string) => {
    if (!description) return { cleanNotes: '', pattern: '', conditions: '', markings: '' };
    
    if (description.includes('|') || description.toLowerCase().includes('pattern:') || description.toLowerCase().includes('observed conditions:') || description.toLowerCase().includes('markings:') || description.toLowerCase().includes('notes:')) {
        const parts = description.split('|').map((p: string) => p.trim());
        let pattern = '';
        let conditions = '';
        let markings = '';
        let cleanNotes = '';

        parts.forEach((part: string) => {
            if (part.toLowerCase().startsWith('pattern:')) {
                pattern = part.replace(/^pattern:\s*/i, '').trim();
            } else if (part.toLowerCase().startsWith('observed conditions:')) {
                conditions = part.replace(/^observed conditions:\s*/i, '').trim();
            } else if (part.toLowerCase().startsWith('markings:')) {
                markings = part.replace(/^markings:\s*/i, '').trim();
            } else if (part.toLowerCase().startsWith('notes:')) {
                cleanNotes = part.replace(/^notes:\s*/i, '').trim();
            } else if (!pattern && !conditions && !markings && !cleanNotes) {
                cleanNotes = part.trim();
            }
        });

        return { cleanNotes, pattern, conditions, markings };
    }

    return { cleanNotes: description.trim(), pattern: '', conditions: '', markings: '' };
};

const PetMatchReview = () => {
    const { reportId } = useParams();
    const navigate = useNavigate();
    const [searchParams, setSearchParams] = useSearchParams();
    const [report, setReport] = useState<any>(null);
    const [myPets, setMyPets] = useState<any[]>([]);
    const [selectedPetId, setSelectedPetId] = useState<number | null>(null);

    // Multi-Report Case State
    const [caseData, setCaseData] = useState<any>(null);
    const [caseReports, setCaseReports] = useState<any[]>([]);
    const [activeTabReportId, setActiveTabReportId] = useState<number | null>(null);

    // Proof of ownership already submitted for this pet (earlier claim): then the owner just answers Yes / No
    const [proofOnFile, setProofOnFile] = useState<any>(null);
    const [useNewProof, setUseNewProof] = useState(false);
    const [reuseProofOnFile, setReuseProofOnFile] = useState(true);
    useEffect(() => {
        setProofOnFile(null);
        setUseNewProof(false);
        setReuseProofOnFile(true);
        if (!selectedPetId) return;
        api.get('/claims/proof-on-file', { params: { pet_id: selectedPetId } })
            .then((res) => {
                const data = res.data?.has_proof ? res.data : null;
                setProofOnFile(data);
                if (data) setReuseProofOnFile(true);
            })
            .catch(() => setProofOnFile(null));
    }, [selectedPetId]);
    const [remarks, setRemarks] = useState('');
    const [loading, setLoading] = useState(true);
    const [existingClaim, setExistingClaim] = useState<any>(null);
    const [evidenceFile, setEvidenceFile] = useState<File | null>(null);
    const [vaccineCardFile, setVaccineCardFile] = useState<File | null>(null);
    const [vetRecordFile, setVetRecordFile] = useState<File | null>(null);
    const [petRegRecordFile, setPetRegRecordFile] = useState<File | null>(null);
    const [additionalPhotosFile, setAdditionalPhotosFile] = useState<File | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [disputeReason, setDisputeReason] = useState('');
    const [petLat, setPetLat] = useState<number | null>(null);
    const [petLng, setPetLng] = useState<number | null>(null);
    const [roadDistance, setRoadDistance] = useState<number | null>(null);

    // Confirmation & Proof upload states
    const [isMyPetConfirmed, setIsMyPetConfirmed] = useState(false);
    const [prevPhotoName, setPrevPhotoName] = useState<string>('');
    const [vaccineCardName, setVaccineCardName] = useState<string>('');
    const [vetRecordName, setVetRecordName] = useState<string>('');
    const [petRegRecordName, setPetRegRecordName] = useState<string>('');
    const [distinctiveMarkings, setDistinctiveMarkings] = useState('');
    const [showUploadForm, setShowUploadForm] = useState(false);
    const [reportMatchRecord, setReportMatchRecord] = useState<any>(null);
    const [allReportMatches, setAllReportMatches] = useState<any[]>([]);
    const [isChatOpen, setIsChatOpen] = useState(false);
    const [confirmDialog, setConfirmDialog] = useState<'confirm' | 'reject' | null>(null);
    const [decisionRemarks, setDecisionRemarks] = useState('');
    const [sightingFeedbackNote, setSightingFeedbackNote] = useState('');
    const [isEditingSightingResponse, setIsEditingSightingResponse] = useState(false);
    const [directAccessRedirectedNotice, setDirectAccessRedirectedNotice] = useState(false);
    const [isPetReceivedModalOpen, setIsPetReceivedModalOpen] = useState(false);
    const [reunionPhotoFile, setReunionPhotoFile] = useState<File | null>(null);
    const [reunionPreviewUrl, setReunionPreviewUrl] = useState<string | null>(null);
    const [reunionNotes, setReunionNotes] = useState('');
    const [isSubmittingReunion, setIsSubmittingReunion] = useState(false);
    const [reunionSuccessAlert, setReunionSuccessAlert] = useState(false);

    // Lightbox / Image Viewer States
    const [viewingImage, setViewingImage] = useState<{
        url: string;
        title: string;
        subtitle?: string;
        type: 'stray' | 'pet';
    } | null>(null);
    const [isSideBySideModalOpen, setIsSideBySideModalOpen] = useState(false);

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                setViewingImage(null);
                setIsSideBySideModalOpen(false);
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, []);

    const userStr = localStorage.getItem('resident_user') || sessionStorage.getItem('resident_user') || localStorage.getItem('staff_user') || sessionStorage.getItem('staff_user');
    const currentUser = userStr ? JSON.parse(userStr) : null;

    useEffect(() => {
        if (searchParams.get('openChat') === 'true' || searchParams.get('chat') === 'true') {
            setIsChatOpen(true);
        }
    }, [searchParams]);

    useEffect(() => {
        setRoadDistance(null);
    }, [selectedPetId, reportId]);

    useEffect(() => {
        if (!currentUser) {
            navigate('/login');
            return;
        }
        fetchDetails();
    }, [reportId, currentUser?.user_id]);

    const fetchDetails = async () => {
        setLoading(true);
        try {
            // 1. Fetch Consolidated Multi-Report Case Review Data
            let cData: any = null;
            try {
                const caseReviewRes = await api.get(`/matches/case-review/${reportId}`, {
                    params: {
                        pet_id: searchParams.get('pet_id') || undefined,
                        match_id: searchParams.get('match_id') || undefined
                    }
                });
                cData = caseReviewRes.data;
                setCaseData(cData);
                const tabs = cData.reports || [];
                setCaseReports(tabs);

                // Determine active tab: check ?tab= first, then preserve activeTabReportId, then current reportId, then canonical claim
                const tabParam = searchParams.get('tab') ? parseInt(searchParams.get('tab')!) : null;
                const currentReportIdNum = parseInt(reportId || '0');
                const initialClaimReportId = cData.canonical_claim_report_id || (tabs.length > 0 ? tabs[0].report_id : currentReportIdNum);

                // Scenario F: If accessing a merged sighting directly before initial claim is completed,
                // direct the owner to the Initial Claim tab
                if (tabs.length > 1 && !cData.initial_claim_completed && !tabParam && currentReportIdNum !== initialClaimReportId) {
                    setActiveTabReportId(initialClaimReportId);
                    setDirectAccessRedirectedNotice(true);
                } else {
                    const preferredTab = tabParam || activeTabReportId;
                    if (preferredTab && tabs.some((t: any) => t.report_id === preferredTab)) {
                        setActiveTabReportId(preferredTab);
                    } else if (tabs.some((t: any) => t.report_id === currentReportIdNum)) {
                        setActiveTabReportId(currentReportIdNum);
                    } else if (cData.canonical_claim_report_id && tabs.some((t: any) => t.report_id === cData.canonical_claim_report_id)) {
                        setActiveTabReportId(cData.canonical_claim_report_id);
                    } else if (tabs.length > 0) {
                        setActiveTabReportId(tabs[0].report_id);
                    }
                }
            } catch (caseErr: any) {
                console.warn("Could not load case-review endpoint:", caseErr);
            }

            // 2. Fetch Report details (fallback / augmentation)
            const reportRes = await api.get(`/reports/${reportId}`);
            const repData = reportRes.data;

            if (repData.latitude && repData.longitude) {
                try {
                    const geoRes = await fetch(
                        `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${repData.latitude}&lon=${repData.longitude}`
                    );
                    const geoData = await geoRes.json();
                    if (geoData && geoData.display_name) {
                        repData.street_address = geoData.display_name;
                    }
                } catch (e) {
                    console.warn("Reverse geocode failed", e);
                }
            }

            setReport(repData);

            // 3. Fetch Owner's pets (Strictly exclude Deceased pets)
            let activePets: any[] = [];
            try {
                const petsRes = await api.get(`/pets/owner/${currentUser.user_id}`);
                activePets = petsRes.data.filter((p: any) => p.status && p.status.toLowerCase() !== 'deceased');
            } catch (e) {
                console.warn("Could not load pets for owner", e);
            }

            // Inject pet from case review payload if available
            if (cData?.pet && !activePets.some(p => p.pet_id === cData.pet.pet_id)) {
                activePets.push(cData.pet);
            }

            // 4. Fetch matched candidate pet from Report Matches
            let targetMatchedPetId: number | null = cData?.pet?.pet_id || null;
            try {
                const matchRes = await api.get(`/matches/report/${reportId}`);
                if (Array.isArray(matchRes.data) && matchRes.data.length > 0) {
                    setAllReportMatches(matchRes.data);
                    
                    // Match belonging to current owner or primary match
                    const userMatch = matchRes.data.find((m: any) => m.matched_pet?.owner_id === currentUser.user_id) || matchRes.data[0];
                    if (userMatch) {
                        setReportMatchRecord(userMatch);
                        if (userMatch.matched_pet_id && !targetMatchedPetId) {
                            targetMatchedPetId = userMatch.matched_pet_id;
                        }
                    }

                    for (const m of matchRes.data) {
                        if (m.matched_pet && !activePets.some(p => p.pet_id === m.matched_pet.pet_id)) {
                            activePets.push(m.matched_pet);
                        }
                    }
                }
            } catch (e) {
                console.warn("Could not load report matches", e);
            }

            setMyPets(activePets);

            // 5. Setup Claim data
            let matchingClaim = cData?.claim || null;
            if (!matchingClaim) {
                try {
                    const claimsRes = await api.get(`/claims/?owner_id=${currentUser.user_id}`);
                    const rid = parseInt(reportId || '0');
                    matchingClaim = claimsRes.data.find((c: any) => (c.report_id === rid || (c.case_report_ids || []).includes(rid)) && c.pet?.status?.toLowerCase() !== 'deceased');
                } catch (e) {
                    console.warn("Could not load backend claims", e);
                }
            }

            // Fallback to local storage only if backend has no record of this claim
            if (!matchingClaim) {
                const localClaimsStr = localStorage.getItem('straysafe_claims_submitted');
                if (localClaimsStr) {
                    const localClaims = JSON.parse(localClaimsStr);
                    matchingClaim = localClaims.find((c: any) => c.report_id === parseInt(reportId || '0') && c.pet.owner?.email === currentUser?.email && c.pet?.status?.toLowerCase() !== 'deceased');
                }
            }

            if (matchingClaim) {
                setExistingClaim(matchingClaim);
                setSelectedPetId(matchingClaim.pet_id);
                if (matchingClaim.pet?.registered_latitude && matchingClaim.pet?.registered_longitude) {
                    setPetLat(parseFloat(matchingClaim.pet.registered_latitude));
                    setPetLng(parseFloat(matchingClaim.pet.registered_longitude));
                }
            } else if (targetMatchedPetId) {
                setSelectedPetId(targetMatchedPetId);
                const matchedPetObj = activePets.find(p => p.pet_id === targetMatchedPetId);
                if (matchedPetObj?.registered_latitude && matchedPetObj?.registered_longitude) {
                    setPetLat(parseFloat(matchedPetObj.registered_latitude));
                    setPetLng(parseFloat(matchedPetObj.registered_longitude));
                }
            } else if (activePets.length > 0) {
                setSelectedPetId(activePets[0].pet_id);
                if (activePets[0].registered_latitude && activePets[0].registered_longitude) {
                    setPetLat(parseFloat(activePets[0].registered_latitude));
                    setPetLng(parseFloat(activePets[0].registered_longitude));
                }
            }
        } catch (err) {
            console.error("Error fetching match review details:", err);
        } finally {
            setLoading(false);
        }
    };


    // Validates a proof-of-ownership file before storing it, so residents get
    // instant feedback instead of a failed upload after submitting the claim.
    const pickValidatedFile = (
        file: File | null,
        setFile: (f: File | null) => void,
        setName?: (n: string) => void
    ) => {
        if (!file) {
            setFile(null);
            setName?.('');
            return;
        }
        const result = validateFile(file);
        if (!result.valid) {
            alert(result.error);
            return;
        }
        setFile(file);
        setName?.(file.name);
    };

    const handleSubmitClaim = async (reuseProofFromClaimId?: number) => {
        if (!selectedPetId) {
            alert("Please select which of your pets this matches.");
            return;
        }
        setIsSubmitting(true);
        try {
            const matchedPet = myPets.find(p => p.pet_id === selectedPetId);
            
            // Build detailed claim object for local storage simulation
            const claimId = Date.now();
            const newClaim = {
                claim_id: claimId,
                report_id: parseInt(reportId || '0'),
                pet_id: selectedPetId,
                status: "Pending Review",
                remarks: "",
                similarity_score: typeof getSimilarityScore === 'function' ? parseInt(getSimilarityScore()) : 90,
                reported_date: new Date().toISOString().slice(0, 10),
                sighting_location: report.landmark || "Selera Homes",
                sighting_lat: parseFloat(report.latitude) || null,
                sighting_lng: parseFloat(report.longitude) || null,
                description: report.description || "Roaming stray animal Sighting",
                sighting_photo: report.media?.[0]?.file_url || "",
                
                pet: {
                    pet_name: matchedPet?.pet_name || "Pet",
                    pet_type: matchedPet?.pet_type || "Dog",
                    breed: matchedPet?.breed || "",
                    gender: matchedPet?.gender || "",
                    primary_color: matchedPet?.primary_color || "",
                    secondary_color: matchedPet?.secondary_color || "",
                    distinctive_markings: distinctiveMarkings || matchedPet?.distinctive_markings || "",
                    registered_address: matchedPet?.registered_address || matchedPet?.owner?.address || "",
                    registered_latitude: matchedPet?.registered_latitude || null,
                    registered_longitude: matchedPet?.registered_longitude || null,
                    photo_url: matchedPet?.photo_url || "",
                    owner: {
                        name: currentUser?.name || "Citizen Owner",
                        email: currentUser?.email || "",
                        phone: currentUser?.phone || ""
                    }
                },
                
                evidence_url: "",
                vaccine_card_url: "",
                vet_record_url: "",
                registration_record_url: "",
                additional_photos_url: "",
                distinctive_markings: distinctiveMarkings || "",
                previous_photos: [],
                supporting_docs: [
                    vetRecordName ? `vet_records_${vetRecordName}` : "",
                    petRegRecordName ? `pet_reg_${petRegRecordName}` : ""
                ].filter(d => d),
                owner_notes: remarks || "Ownership claim submitted with proofs."
            };

            let claimData = newClaim;
            let backendSucceeded = false;
            let uploadErrors = [];

            // 1. Upload any selected files directly to Cloudinary first
            let uploadedVaccineUrl = '';
            let uploadedVetUrl = '';
            let uploadedRegUrl = '';
            let uploadedPhotoUrl = '';

            if (vaccineCardFile) {
                try {
                    const { url } = await uploadDirectToCloudinary(vaccineCardFile, 'claims');
                    uploadedVaccineUrl = url;
                } catch (e: any) {
                    uploadErrors.push(`Vaccination Card: ${e.message}`);
                }
            }
            if (vetRecordFile) {
                try {
                    const { url } = await uploadDirectToCloudinary(vetRecordFile, 'claims');
                    uploadedVetUrl = url;
                } catch (e: any) {
                    uploadErrors.push(`Veterinary Records: ${e.message}`);
                }
            }
            if (petRegRecordFile) {
                try {
                    const { url } = await uploadDirectToCloudinary(petRegRecordFile, 'claims');
                    uploadedRegUrl = url;
                } catch (e: any) {
                    uploadErrors.push(`Registration Certificate: ${e.message}`);
                }
            }
            if (additionalPhotosFile) {
                try {
                    const { url } = await uploadDirectToCloudinary(additionalPhotosFile, 'claims');
                    uploadedPhotoUrl = url;
                } catch (e: any) {
                    uploadErrors.push(`Additional Photos: ${e.message}`);
                }
            }

            // 2. Post claim to backend with URLs included
            try {
                const res = await api.post('/claims/', {
                    report_id: parseInt(reportId || '0'),
                    pet_id: selectedPetId,
                    remarks: remarks || "I confirm this is my pet.",
                    distinctive_markings: distinctiveMarkings,
                    vaccine_card_url: uploadedVaccineUrl || undefined,
                    vet_record_url: uploadedVetUrl || undefined,
                    registration_record_url: uploadedRegUrl || undefined,
                    additional_photos_url: uploadedPhotoUrl || undefined,
                    ...(typeof reuseProofFromClaimId === 'number' ? { reuse_proof_from_claim_id: reuseProofFromClaimId } : {})
                });
                claimData = res.data;
                backendSucceeded = true;
            } catch (err: any) {
                console.error("Could not post claim to backend:", err);
                alert("Could not submit the claim to the server. Your claim details might not be visible to the administrators. Technical error: " + (err.response?.data?.detail || err.message));
            }

            if (uploadErrors.length > 0) {
                alert("Claim details saved, but the following ownership proofs failed to upload:\n- " + uploadErrors.join("\n- ") + "\n\nPlease try uploading these files again from your Claims Dashboard.");
            }

            // Save to localStorage list for full frontend dashboard sync
            const finalClaim = {
                ...newClaim,
                claim_id: claimData.claim_id || newClaim.claim_id,
                status: claimData.status || newClaim.status,
                remarks: claimData.remarks || newClaim.remarks,
                evidence_url: claimData.evidence_url || newClaim.evidence_url,
                vaccine_card_url: claimData.vaccine_card_url || newClaim.vaccine_card_url,
                vet_record_url: claimData.vet_record_url || newClaim.vet_record_url,
                registration_record_url: claimData.registration_record_url || newClaim.registration_record_url,
                additional_photos_url: claimData.additional_photos_url || newClaim.additional_photos_url,
                distinctive_markings: claimData.distinctive_markings || newClaim.distinctive_markings,
                pet: claimData.pet ? {
                    ...newClaim.pet,
                    ...claimData.pet,
                    owner: claimData.pet.owner ? {
                        ...newClaim.pet.owner,
                        ...claimData.pet.owner
                    } : newClaim.pet.owner
                } : newClaim.pet
            };

            const localClaimsStr = localStorage.getItem('straysafe_claims_submitted');
            const localClaims = localClaimsStr ? JSON.parse(localClaimsStr) : [];
            const filteredLocal = localClaims.filter((c: any) => c.report_id !== parseInt(reportId || '0'));
            filteredLocal.push(finalClaim);
            localStorage.setItem('straysafe_claims_submitted', JSON.stringify(filteredLocal));

            setExistingClaim(finalClaim);

            // Sync with backend report_matches owner feedback
            try {
                const matchRes = await api.get(`/matches/report/${reportId}`);
                if (Array.isArray(matchRes.data) && matchRes.data.length > 0) {
                    const matchingRecord = matchRes.data.find((m: any) => m.matched_pet_id === selectedPetId);
                    if (matchingRecord && matchingRecord.status !== 'NOT_A_MATCH') {
                        const feedbackRes = await api.post(`/matches/${matchingRecord.match_id}/owner-feedback`, {
                            owner_confirmation: "OWNER_CONFIRMED",
                            remarks: remarks || "Owner confirmed match and submitted ownership proofs."
                        });
                        setAllReportMatches(prev => prev.map(m => m.match_id === feedbackRes.data.match_id ? feedbackRes.data : m));
                    }
                }
            } catch (matchErr) {
                console.warn("Could not sync owner feedback to match record:", matchErr);
            }

            alert("Claim filed successfully. Subdivision leaders and Barangay officials have been notified for verification.");
        } catch (err: any) {
            console.error(err);
            alert("Failed to submit claim.");
        } finally {
            setIsSubmitting(false);
        }
    };

    const findOwnMatch = () => allReportMatches.find(
        (m: any) => m.matched_pet_id === selectedPetId && m.matched_pet?.owner_id === currentUser?.user_id
    );

    // "Yes, this is my pet" (after confirmation dialog): records the owner's half of the
    // two-way confirmation, then continues to the optional proof-of-ownership claim step.
    const handleConfirmMatch = async () => {
        const matchToConfirm = findOwnMatch();
        if (matchToConfirm && matchToConfirm.status === 'NOT_A_MATCH') {
            // A staff "Not a Match" is only reopened through Request a Second Review, with the owner's reason
            setConfirmDialog(null);
            alert('Staff marked this sighting as not your pet. Use "Request a Second Review" and explain why it is your pet.');
            return;
        }
        if (matchToConfirm && matchToConfirm.owner_confirmation_status !== 'OWNER_CONFIRMED') {
            setIsSubmitting(true);
            try {
                const res = await api.post(`/matches/${matchToConfirm.match_id}/owner-feedback`, {
                    owner_confirmation: "OWNER_CONFIRMED",
                    remarks: decisionRemarks.trim() || "Owner confirmed this sighting is their pet.",
                    report_id: parseInt(reportId || '0')
                });
                setAllReportMatches(prev => prev.map(m => m.match_id === res.data.match_id ? res.data : m));
                setReportMatchRecord(res.data);
                await fetchDetails();
            } catch (err: any) {
                console.error("Failed to confirm match:", err);
                alert("Could not confirm the match: " + (err.response?.data?.detail || err.message));
                setIsSubmitting(false);
                return;
            }
            setIsSubmitting(false);
        }
        setConfirmDialog(null);
        setDecisionRemarks('');
        setIsMyPetConfirmed(true);
    };

    // Staff said Not a Match but the owner says it is their pet: send it back for one more official review.
    const handleRequestSecondReview = async () => {
        const m = findOwnMatch();
        if (!m) return;
        if (disputeReason.trim().length < 5) {
            alert('Please explain why this is your pet (e.g. a scar, collar, or vaccination record).');
            return;
        }
        setIsSubmitting(true);
        try {
            const res = await api.post(`/matches/${m.match_id}/owner-feedback`, {
                owner_confirmation: "OWNER_CONFIRMED",
                remarks: disputeReason.trim(),
                second_review_reason: disputeReason.trim(),
                report_id: parseInt(reportId || '0')
            });
            setAllReportMatches(prev => prev.map(x => x.match_id === res.data.match_id ? res.data : x));
            setReportMatchRecord(res.data);
            await fetchDetails();
            setDisputeReason('');
        } catch (err: any) {
            alert("Could not request a second review: " + (err.response?.data?.detail || err.message));
        } finally {
            setIsSubmitting(false);
        }
    };

    // "No, not my pet" (after confirmation dialog): final rejection, the sighting is not linked to the pet.
    const handleRejectMatch = async () => {
        const matchToReject = findOwnMatch();
        if (!matchToReject) {
            setConfirmDialog(null);
            navigate('/resident-home');
            return;
        }
        if (matchToReject.owner_confirmation_status !== 'OWNER_REJECTED') {
            setIsSubmitting(true);
            try {
                const res = await api.post(`/matches/${matchToReject.match_id}/owner-feedback`, {
                    owner_confirmation: "OWNER_REJECTED",
                    remarks: decisionRemarks.trim() || "Owner reported this sighting is not their pet.",
                    report_id: parseInt(reportId || '0')
                });
                setAllReportMatches(prev => prev.map(m => m.match_id === res.data.match_id ? res.data : m));
                setReportMatchRecord(res.data);
                await fetchDetails();
            } catch (err: any) {
                console.error("Failed to record match rejection:", err);
                alert("Could not record your response: " + (err.response?.data?.detail || err.message));
                setIsSubmitting(false);
                return;
            }
            setIsSubmitting(false);
        }
        setConfirmDialog(null);
        setDecisionRemarks('');
        setIsMyPetConfirmed(false);
    };

    const handleUploadEvidence = async () => {
        if (!existingClaim?.claim_id) return;

        const filesToUpload: { file: File; documentType: string; label: string }[] = [];
        if (vaccineCardFile) filesToUpload.push({ file: vaccineCardFile, documentType: 'vaccine_card', label: 'Vaccination Card' });
        if (vetRecordFile) filesToUpload.push({ file: vetRecordFile, documentType: 'vet_record', label: 'Veterinary Records' });
        if (petRegRecordFile) filesToUpload.push({ file: petRegRecordFile, documentType: 'registration_record', label: 'Registration Certificate' });
        if (additionalPhotosFile) filesToUpload.push({ file: additionalPhotosFile, documentType: 'additional_photo', label: 'Additional Photos' });
        if (evidenceFile) filesToUpload.push({ file: evidenceFile, documentType: 'evidence', label: 'Supporting Evidence' });

        if (filesToUpload.length === 0 && !distinctiveMarkings.trim() && !remarks.trim()) {
            alert("Please select at least one proof of ownership file (Vaccination Card, Vet Records, Registration, or Photos) or enter distinctive markings.");
            return;
        }

        setIsSubmitting(true);
        let updatedClaim = existingClaim;
        const uploadErrors: string[] = [];

        try {
            for (const item of filesToUpload) {
                try {
                    const { url } = await uploadDirectToCloudinary(item.file, 'claims');
                    const res = await api.post(`/claims/${existingClaim.claim_id}/evidence`, {
                        file_url: url,
                        document_type: item.documentType,
                        distinctive_markings: distinctiveMarkings.trim() || undefined,
                        remarks: remarks.trim() || undefined
                    });
                    updatedClaim = res.data;
                } catch (upErr: any) {
                    console.error(`Failed to upload ${item.label}:`, upErr);
                    uploadErrors.push(`${item.label}: ${upErr.response?.data?.detail || upErr.message}`);
                }
            }

            if (filesToUpload.length === 0 && (distinctiveMarkings.trim() || remarks.trim())) {
                const res = await api.patch(`/claims/${existingClaim.claim_id}/status`, {
                    status: existingClaim.status === 'Evidence Requested' ? 'Pending Review' : existingClaim.status,
                    remarks: remarks.trim() || existingClaim.remarks
                });
                updatedClaim = res.data;
            }

            setExistingClaim(updatedClaim);
            setEvidenceFile(null);
            setVaccineCardFile(null);
            setVaccineCardName('');
            setVetRecordFile(null);
            setVetRecordName('');
            setPetRegRecordFile(null);
            setPetRegRecordName('');
            setAdditionalPhotosFile(null);
            setPrevPhotoName('');

            if (uploadErrors.length > 0) {
                alert("Some files failed to upload:\n- " + uploadErrors.join("\n- "));
            } else {
                alert("Proof of ownership submitted successfully! Subdivision leaders have been notified and can now verify your claim.");
            }
            await fetchDetails();
        } catch (err: any) {
            console.error("Evidence upload error:", err);
            alert("Failed to submit evidence: " + (err.response?.data?.detail || err.message));
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleOpenPetReceivedModal = () => {
        setIsPetReceivedModalOpen(true);
        setReunionNotes('');
        setReunionPhotoFile(null);
        setReunionPreviewUrl(null);
    };

    const handleReunionPhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        if (!file.type.startsWith('image/')) {
            alert('Please select an image file (JPEG, PNG, or WebP).');
            return;
        }
        if (file.size > 15 * 1024 * 1024) {
            alert('File is too large. Please select an image under 15MB.');
            return;
        }
        setReunionPhotoFile(file);
        setReunionPreviewUrl(URL.createObjectURL(file));
    };

    const handleSubmitPetReceived = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!existingClaim?.claim_id) return;
        if (!reunionPhotoFile) {
            alert('Please attach or take a reunion photo with your pet to confirm safe recovery.');
            return;
        }

        setIsSubmittingReunion(true);
        try {
            // 1. Compress and upload reunion photo directly to Cloudinary
            const compressed = await compressImageFile(reunionPhotoFile);
            const { url } = await uploadDirectToCloudinary(compressed, 'claims');

            // 2. Submit status update to claims API
            const res = await api.patch(`/claims/${existingClaim.claim_id}/status`, {
                status: "Pet Received",
                handover_photo_url: url,
                remarks: reunionNotes.trim() || "Confirmed received by owner with reunion photo."
            });

            setExistingClaim(res.data);
            setIsPetReceivedModalOpen(false);
            setReunionSuccessAlert(true);
            setTimeout(() => setReunionSuccessAlert(false), 7000);
            await fetchDetails();
        } catch (err: any) {
            console.error("Failed to mark pet received:", err);
            alert(err.response?.data?.detail || "Failed to mark pet as received. Please try again.");
        } finally {
            setIsSubmittingReunion(false);
        }
    };

    const handleMergedSightingResponse = async (responseType: 'OWNER_CONFIRMED' | 'OWNER_REJECTED' | 'UNSURE') => {
        const targetMatch = currentMatch || (activeTabObj?.match) || activeMatch;
        if (!targetMatch?.match_id) {
            alert("Match record for this sighting was not found.");
            return;
        }
        setIsSubmitting(true);
        try {
            if (targetMatch.owner_verification_requested_at && !targetMatch.owner_verification_answered_at) {
                const ovAnswer = responseType === 'OWNER_CONFIRMED' ? 'YES' : responseType === 'OWNER_REJECTED' ? 'NO' : 'UNSURE';
                try {
                    await api.post(`/matches/${targetMatch.match_id}/owner-verification`, {
                        answer: ovAnswer,
                        note: sightingFeedbackNote.trim() || undefined
                    });
                } catch (ovErr) {
                    console.warn("Owner verification endpoint sync notice:", ovErr);
                }
            }

            const res = await api.post(`/matches/${targetMatch.match_id}/owner-feedback`, {
                owner_confirmation: responseType,
                remarks: sightingFeedbackNote.trim() || undefined,
                report_id: currentReport?.report_id
            });

            // Update tab in caseReports state immediately for responsiveness
            setCaseReports(prev => prev.map(tab => {
                if (tab.report_id === currentReport?.report_id) {
                    return {
                        ...tab,
                        owner_confirmation_status: res.data.owner_confirmation_status,
                        tab_status: res.data.owner_confirmation_status === 'OWNER_CONFIRMED' ? 'Confirmed by Owner' :
                                   res.data.owner_confirmation_status === 'OWNER_REJECTED' ? 'Rejected' :
                                   res.data.owner_confirmation_status === 'UNSURE' ? 'Unsure' : tab.tab_status,
                        match: {
                            ...tab.match,
                            ...res.data
                        }
                    };
                }
                return tab;
            }));

            // Only update reportMatchRecord if on the initial claim tab
            if (isInitialClaimTab) {
                setReportMatchRecord(res.data);
                setAllReportMatches(prev => prev.map(m => m.match_id === res.data.match_id ? res.data : m));
            }

            setSightingFeedbackNote('');
            await fetchDetails();
            alert(
                responseType === 'OWNER_CONFIRMED' ? '✓ Thank you! You confirmed this sighting as your pet.' :
                responseType === 'OWNER_REJECTED' ? '✕ Response recorded. Subdivision Leaders have been notified to review this merge.' :
                '❓ Response recorded as Unsure. Staff will investigate further.'
            );
        } catch (err: any) {
            console.error("Failed to submit sighting confirmation:", err);
            alert("Could not save your response: " + (err.response?.data?.detail || err.message));
        } finally {
            setIsSubmitting(false);
        }
    };

    if (loading) {
        return (
            <div className="min-h-screen bg-[#FAFAF9] flex items-center justify-center">
                <div className="w-12 h-12 border-4 border-[#F97316] border-t-transparent rounded-full animate-spin" />
            </div>
        );
    }

    if (!report) {
        return (
            <div className="min-h-screen bg-[#FAFAF9] flex items-center justify-center p-8">
                <div className="text-center bg-white rounded-3xl border p-12 max-w-md">
                    <h2 className="text-2xl font-black uppercase text-gray-800">Report Not Found</h2>
                    <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mt-2">The stray animal report could not be retrieved.</p>
                    <Button variant="primary" onClick={() => navigate('/resident-home')} className="mt-6">Return Home</Button>
                </div>
            </div>
        );
    }

    // Active Tab and Active Report
    const activeTabObj = (caseReports.length > 0 && activeTabReportId)
        ? (caseReports.find((r: any) => r.report_id === activeTabReportId) || caseReports[0])
        : (caseReports.length > 0 ? caseReports[0] : null);

    const currentReport = activeTabObj?.report || report;
    const currentMatch = activeTabObj?.match || null;
    const isInitialClaimTab = activeTabObj ? activeTabObj.is_initial_claim : !report?.duplicate_of_report_id;
    const activeTabStatus = activeTabObj?.tab_status || (existingClaim ? existingClaim.status : 'Awaiting Response');

    const initialClaimReportId = caseData?.canonical_claim_report_id || (caseReports.length > 0 ? caseReports[0].report_id : parseInt(reportId || '0'));
    const initialClaimTab = caseReports.find((t: any) => t.report_id === initialClaimReportId) || (caseReports.length > 0 ? caseReports[0] : null);
    const initialClaimTabLabel = initialClaimTab?.tab_label || 'Initial Claim';

    const isInitialClaimCompleted = Boolean(
        caseData?.initial_claim_completed ||
        (caseData?.claim && (
            caseData.claim.vaccine_card_url ||
            caseData.claim.vet_record_url ||
            caseData.claim.registration_record_url ||
            caseData.claim.additional_photos_url ||
            caseData.claim.evidence_url ||
            ['Pending Review', 'Approved', 'Handover Complete', 'Pet Received'].includes(caseData.claim.status)
        ) && initialClaimTab?.owner_confirmation_status !== 'OWNER_REJECTED') ||
        (existingClaim && (
            existingClaim.vaccine_card_url ||
            existingClaim.vet_record_url ||
            existingClaim.registration_record_url ||
            existingClaim.additional_photos_url ||
            existingClaim.evidence_url ||
            ['Pending Review', 'Approved', 'Handover Complete', 'Pet Received'].includes(existingClaim.status)
        ) && initialClaimTab?.owner_confirmation_status !== 'OWNER_REJECTED')
    );

    const handleTabClick = (repId: number) => {
        setActiveTabReportId(repId);
        setIsEditingSightingResponse(false);
        setSightingFeedbackNote('');
        setSearchParams((prev) => {
            const next = new URLSearchParams(prev);
            next.set('tab', repId.toString());
            return next;
        }, { replace: true });
    };

    const getTabBadgeClass = (status: string, isActive: boolean) => {
        switch (status) {
            case 'Ownership Claim Incomplete':
                return isActive
                    ? 'bg-amber-100 text-amber-900 border-2 border-amber-400 font-black shadow-2xs'
                    : 'bg-amber-50 text-amber-900 border border-amber-200 font-bold';
            case 'Awaiting Response':
                return isActive
                    ? 'bg-orange-100 text-orange-900 border-2 border-orange-400 font-black shadow-2xs'
                    : 'bg-orange-50 text-orange-900 border border-orange-200 font-bold';
            case 'Claim Pending Review':
                return isActive
                    ? 'bg-blue-100 text-blue-900 border-2 border-blue-400 font-black shadow-2xs'
                    : 'bg-blue-50 text-blue-800 border border-blue-200 font-bold';
            case 'Confirmed by Owner':
                return isActive
                    ? 'bg-emerald-100 text-emerald-900 border-2 border-emerald-400 font-black shadow-2xs'
                    : 'bg-emerald-50 text-emerald-800 border border-emerald-200 font-bold';
            case 'Rejected':
                return isActive
                    ? 'bg-red-100 text-red-900 border-2 border-red-400 font-black shadow-2xs'
                    : 'bg-red-50 text-red-800 border border-red-200 font-bold';
            case 'Unsure':
                return isActive
                    ? 'bg-purple-100 text-purple-900 border-2 border-purple-400 font-black shadow-2xs'
                    : 'bg-purple-50 text-purple-800 border border-purple-200 font-bold';
            case 'Officially Verified':
            case 'Claim Approved':
                return isActive
                    ? 'bg-emerald-100 text-emerald-900 border-2 border-emerald-400 font-black shadow-2xs'
                    : 'bg-emerald-50 text-emerald-800 border border-emerald-200 font-bold';
            default:
                return isActive
                    ? 'bg-gray-100 text-gray-900 border-2 border-gray-400 font-black shadow-2xs'
                    : 'bg-gray-50 text-gray-700 border border-gray-200 font-bold';
        }
    };

    const matchedPet = myPets.find(p => p.pet_id === selectedPetId) || caseData?.pet;
    
    // Sighting & Registered Coordinates
    const hasSightingLocation = isValidLatLng(currentReport?.latitude, currentReport?.longitude);
    // Without a saved sighting location the map is centred on Selera Homes but no sighting pin is drawn.
    const sightingLat = hasSightingLocation ? parseFloat(currentReport.latitude) : SELERA_DEFAULT_CENTER[0];
    const sightingLng = hasSightingLocation ? parseFloat(currentReport.longitude) : SELERA_DEFAULT_CENTER[1];

    const rawRegisteredLat = petLat !== null ? petLat : (
        matchedPet?.registered_latitude ? parseFloat(matchedPet.registered_latitude) : (
            matchedPet?.owner?.latitude ? parseFloat(matchedPet.owner.latitude) : (
                currentUser?.latitude ? parseFloat(currentUser.latitude) : null
            )
        )
    );
    const rawRegisteredLng = petLng !== null ? petLng : (
        matchedPet?.registered_longitude ? parseFloat(matchedPet.registered_longitude) : (
            matchedPet?.owner?.longitude ? parseFloat(matchedPet.owner.longitude) : (
                currentUser?.longitude ? parseFloat(currentUser.longitude) : null
            )
        )
    );

    // Only use a real saved location; never invent a nearby point for the owner's home.
    const hasRegisteredLocation = rawRegisteredLat !== null && rawRegisteredLng !== null &&
        !Number.isNaN(rawRegisteredLat) && !Number.isNaN(rawRegisteredLng);
    const registeredLat = hasRegisteredLocation ? (rawRegisteredLat as number) : sightingLat;
    const registeredLng = hasRegisteredLocation ? (rawRegisteredLng as number) : sightingLng;

    const registeredAddress = matchedPet?.registered_address || matchedPet?.owner?.address || currentUser?.address || "Registered Owner Address";
    const sightingAddress = currentReport?.street_address || currentReport?.address || (currentReport?.landmark ? `${currentReport.landmark}, Selera Homes` : "Selera Homes");

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

    const haversineMeters = calculateHaversine(sightingLat, sightingLng, registeredLat, registeredLng);
    const displayDistanceMeters = roadDistance !== null ? Math.round(roadDistance) : Math.round(haversineMeters);
    const displayDistanceStr = !hasRegisteredLocation || !hasSightingLocation
        ? 'Unknown'
        : displayDistanceMeters < 1000 ? `${displayDistanceMeters} meters away` : `${(displayDistanceMeters/1000).toFixed(1)} km away`;

    const activeMatch = currentMatch || (isInitialClaimTab ? (allReportMatches.find(m => m.matched_pet_id === selectedPetId) || (reportMatchRecord?.matched_pet_id === selectedPetId ? reportMatchRecord : null)) : null);
    const ownerStatus: string | undefined = activeMatch?.owner_confirmation_status;

    const getSimilarityScore = () => {
        if (activeMatch && activeMatch.similarity_score !== undefined && activeMatch.similarity_score !== null) {
            return `${activeMatch.similarity_score}%`;
        }
        if (existingClaim && existingClaim.pet_id === selectedPetId && existingClaim.remarks) {
            const match = existingClaim.remarks.match(/AI detected a (\d+)% potential match/i);
            if (match) {
                return `${match[1]}%`;
            }
        }
        if (!activeMatch) {
            return "0%";
        }
        return "90%";
    };

    const getSimilarityLabel = () => {
        if (activeMatch && activeMatch.similarity_score !== undefined && activeMatch.similarity_score !== null) {
            const score = activeMatch.similarity_score;
            if (score >= 75) return "High Probability Sighting";
            if (score >= 60) return "Medium Probability Sighting";
            return "Low Probability Sighting";
        }
        if (existingClaim && existingClaim.pet_id === selectedPetId && existingClaim.remarks) {
            const match = existingClaim.remarks.match(/AI detected a (\d+)% potential match/i);
            if (match) {
                const score = parseInt(match[1]);
                if (score >= 75) return "High Probability Sighting";
                if (score >= 60) return "Medium Probability Sighting";
                return "Low Probability Sighting";
            }
        }
        if (!activeMatch) {
            return "No Match / Species Contrast";
        }
        return "High Probability Sighting";
    };

    const getAiExplanation = () => {
        if (activeMatch && activeMatch.ai_explanation) {
            return activeMatch.ai_explanation;
        }
        if (existingClaim && existingClaim.pet_id === selectedPetId && existingClaim.remarks) {
            const parts = existingClaim.remarks.split(/AI detected a \d+% potential match\.\s*/i);
            if (parts.length > 1 && parts[1]) {
                return parts[1];
            }
            return existingClaim.remarks;
        }
        if (!activeMatch) {
            return "No matching AI candidate record detected between this sighting and the selected pet.";
        }
        return "AI detected strong similarity in breed, markings, and facial features between this sighting and registered pet profile.";
    };

    const parsedDesc = currentReport?.description ? parseReportDescription(currentReport.description) : null;
    const reportPattern = parsedDesc?.pattern || (currentReport?.coat_pattern && currentReport.coat_pattern.toLowerCase() !== 'unknown' ? currentReport.coat_pattern : (currentReport?.animal_pattern && currentReport.animal_pattern.toLowerCase() !== 'unknown' ? currentReport.animal_pattern : (currentReport?.ai_coat_pattern && currentReport.ai_coat_pattern.toLowerCase() !== 'unknown' ? currentReport.ai_coat_pattern : null)));
    const reportMarkings = parsedDesc?.markings || (currentReport?.distinctive_markings && currentReport.distinctive_markings.toLowerCase() !== 'unknown' && currentReport.distinctive_markings.toLowerCase() !== 'none' ? currentReport.distinctive_markings : (currentReport?.color_markings && currentReport.color_markings.toLowerCase() !== 'unknown' && currentReport.color_markings.toLowerCase() !== 'none' ? currentReport.color_markings : (currentReport?.ai_distinctive_markings && currentReport.ai_distinctive_markings.toLowerCase() !== 'unknown' && currentReport.ai_distinctive_markings.toLowerCase() !== 'none' ? currentReport.ai_distinctive_markings : null)));
    const displaySightingMarkings = Array.from(new Set([reportPattern, reportMarkings].filter(Boolean))).join(' • ');

    const getBreedColorMatch = () => {
        if (!matchedPet || !currentReport) return { text: "NO", desc: "No data to compare" };

        const pSpecies = (matchedPet.pet_type || matchedPet.species || "").toLowerCase().trim();
        const rSpecies = (currentReport.animal_type || currentReport.ai_animal_type || "").toLowerCase().trim();
        if (pSpecies && rSpecies && pSpecies !== rSpecies && pSpecies !== "unknown" && rSpecies !== "unknown") {
            return { text: "NO", desc: `Species mismatch (${pSpecies.toUpperCase()} vs ${rSpecies.toUpperCase()})` };
        }

        const pBreed = (matchedPet.breed || "").toLowerCase().trim();
        const rBreed = (currentReport.ai_possible_breed || "").toLowerCase().trim();
        const rReportedBreed = (currentReport.animal_breed || "").toLowerCase().trim();
        const breedMatches = pBreed && (
            (rBreed && (pBreed === rBreed || pBreed.includes(rBreed) || rBreed.includes(pBreed))) ||
            (rReportedBreed && (pBreed === rReportedBreed || pBreed.includes(rReportedBreed) || rReportedBreed.includes(pBreed)))
        );

        const reportColorRaw = currentReport.animal_color || currentReport.ai_dominant_color || "";
        const rColors = reportColorRaw.toLowerCase().split(/,| and |\/|\s+/).map((c: string) => c.trim()).filter(Boolean);
        const pMarkings = (matchedPet.distinctive_markings || matchedPet.color_markings || "").toLowerCase();
        const pPrimary = (matchedPet.primary_color || "").toLowerCase().trim();
        const pSecondary = (matchedPet.secondary_color || "").toLowerCase().trim();
        const pTertiary = (matchedPet.tertiary_color || "").toLowerCase().trim();
        const primaryMatches = pPrimary && rColors.includes(pPrimary);
        const secondaryMatches = pSecondary && rColors.includes(pSecondary);
        const tertiaryMatches = pTertiary && rColors.includes(pTertiary);

        const rPatternLower = (reportPattern || "").toLowerCase();
        const rMarkingsLower = (reportMarkings || "").toLowerCase();
        const patternMatches = (rPatternLower && pMarkings && (pMarkings.includes(rPatternLower) || rPatternLower.includes(pMarkings))) ||
                               (rMarkingsLower && pMarkings && (pMarkings.includes(rMarkingsLower) || rMarkingsLower.includes(pMarkings)));
        const markingsMatches = rColors.some((c: string) => c && pMarkings.includes(c)) || Boolean(patternMatches);
        const colorMatches = primaryMatches || secondaryMatches || tertiaryMatches || markingsMatches;

        if (breedMatches && colorMatches) {
            return { text: "YES", desc: "Breed & color/markings match" };
        } else if (breedMatches) {
            return { text: "PARTIAL", desc: "Breed matches" };
        } else if (colorMatches) {
            return { text: "PARTIAL", desc: "Color/markings match" };
        }
        return { text: "NO", desc: "No direct match" };
    };

    const breedColorMatch = getBreedColorMatch();

    const isMergedReport = Boolean(
        (caseReports.length > 1 && !isInitialClaimTab) ||
        (!activeTabObj && (report?.duplicate_of_report_id || report?.current_status_id === 18))
    );

    const activeVaccineUrl = existingClaim?.vaccine_card_url || existingClaim?.evidence_url || proofOnFile?.vaccine_card_url || proofOnFile?.evidence_url;
    const activePhotos = Array.from(new Set([
        existingClaim?.additional_photos_url,
        proofOnFile?.additional_photos_url,
        existingClaim?.pet?.photo_url,
        matchedPet?.photo_url
    ].filter(Boolean) as string[]));
    const activeVetUrl = existingClaim?.vet_record_url || proofOnFile?.vet_record_url;
    const activeRegUrl = existingClaim?.registration_record_url || proofOnFile?.registration_record_url;
    const activeMarkings = existingClaim?.distinctive_markings || proofOnFile?.distinctive_markings || matchedPet?.distinctive_markings || '';
    const activeRemarks = existingClaim?.remarks || proofOnFile?.remarks || '';

    return (
        <div className="min-h-screen bg-[#FAFAF9] font-sans pb-24">
            <ResiNavbar />

            <main className="max-w-6xl mx-auto p-4 sm:p-8 pt-24 sm:pt-32">
                <div className="mb-8">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                        <div>
                            <h1 className="text-4xl font-black text-[#1a1208] uppercase tracking-tighter">Owner <span className="text-[#F97316]">Match Review</span></h1>
                            <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mt-2">Review stray animal sightings matching your registered pet</p>
                        </div>
                        {currentReport?.report_id && (
                            <div className="flex items-center gap-2 self-start sm:self-auto flex-wrap">
                                <span className="px-3.5 py-2 bg-orange-50 border border-orange-200 text-[#EA580C] rounded-2xl text-xs font-black uppercase tracking-wider flex items-center gap-1.5 shadow-2xs">
                                    <span>🔍 {activeTabObj ? activeTabObj.tab_label : `Sighting Report #${currentReport.report_id}`}</span>
                                </span>
                                <button
                                    type="button"
                                    onClick={() => navigate(`/resident/reports/${currentReport.report_id}`)}
                                    className="px-4 py-2 bg-white hover:bg-stone-50 border border-stone-200 text-stone-700 text-xs font-black uppercase tracking-wider rounded-2xl transition-all shadow-2xs flex items-center gap-1.5 cursor-pointer"
                                >
                                    <span>View Report Details</span>
                                    <span>→</span>
                                </button>
                            </div>
                        )}
                    </div>
                </div>

                {/* Direct Access Notification Banner */}
                {directAccessRedirectedNotice && (
                    <div className="mb-6 p-4 sm:p-5 bg-gradient-to-r from-amber-50 to-orange-50 border-2 border-amber-300 rounded-[2rem] flex items-center justify-between gap-4 text-amber-950 shadow-sm animate-in fade-in">
                        <div className="flex items-center gap-3">
                            <span className="text-2xl flex-shrink-0">ℹ️</span>
                            <p className="text-xs font-bold leading-relaxed">
                                You opened a merged sighting directly. We directed you to the <strong>{initialClaimTabLabel} tab (Report #{initialClaimReportId})</strong> first to complete your ownership claim and upload proof before confirming additional sightings.
                            </p>
                        </div>
                        <button
                            type="button"
                            onClick={() => setDirectAccessRedirectedNotice(false)}
                            className="px-3 py-1.5 bg-amber-100 hover:bg-amber-200 border border-amber-300 text-amber-900 font-black text-[10px] uppercase rounded-xl transition-colors cursor-pointer shrink-0"
                        >
                            Dismiss ✕
                        </button>
                    </div>
                )}

                {/* Dynamic Multi-Report Tab Navigation Bar */}
                {caseReports.length > 1 && (
                    <div className="bg-white rounded-[2rem] border border-gray-100 shadow-lg p-4 sm:p-5 mb-8">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3 px-1">
                            <div className="flex items-center gap-2.5">
                                <span className="text-xs font-black text-[#1a1208] uppercase tracking-wider">
                                    Case Sightings & Reports
                                </span>
                                <span className="text-[10px] font-black bg-orange-50 text-[#EA580C] border border-orange-200 px-2.5 py-0.5 rounded-full uppercase tracking-wider">
                                    {caseReports.length} Sightings Linked
                                </span>
                            </div>
                            <div className="flex items-center gap-2 text-[10px] font-bold text-gray-400 uppercase tracking-widest">
                                <span>Case #{caseData?.case_root_id || report?.report_id}</span>
                                {caseData?.canonical_claim_report_id && (
                                    <span className="text-gray-500 font-extrabold">• Initial Claim on Report #{caseData.canonical_claim_report_id}</span>
                                )}
                            </div>
                        </div>

                        <div className="flex items-center gap-2.5 overflow-x-auto pb-1 scrollbar-thin">
                            {caseReports.map((tab) => {
                                const isActive = tab.report_id === (activeTabObj?.report_id || activeTabReportId);
                                return (
                                    <button
                                        key={tab.report_id}
                                        type="button"
                                        onClick={() => handleTabClick(tab.report_id)}
                                        className={`flex items-center gap-2.5 px-4 py-3 rounded-2xl text-xs font-black uppercase tracking-wider transition-all cursor-pointer whitespace-nowrap flex-shrink-0 border ${
                                            isActive
                                                ? 'bg-orange-50/90 text-[#C2410C] border-2 border-[#F97316] ring-2 ring-[#F97316]/20 shadow-sm scale-[1.01]'
                                                : 'bg-[#FAFAF9] hover:bg-orange-50/50 hover:border-orange-200 text-stone-700 border-stone-200'
                                        }`}
                                    >
                                        {isActive && (
                                            <span className="w-2 h-2 rounded-full bg-[#F97316] animate-pulse flex-shrink-0" />
                                        )}
                                        <span>
                                            Report #{tab.report_id} — {tab.tab_label}
                                        </span>
                                        {!tab.is_initial_claim && !isInitialClaimCompleted && (
                                            <span className="text-[10px]" title="Locked until initial claim with proof is submitted">🔒</span>
                                        )}
                                        <span className={`text-[9px] px-2.5 py-0.5 rounded-full uppercase tracking-tight ${
                                            getTabBadgeClass(tab.tab_status, isActive)
                                        }`}>
                                            {tab.tab_status}
                                        </span>
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                )}

                <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
                    {/* Left: Comparison Cards */}
                    <div className="lg:col-span-8 space-y-8">
                        {/* Alert: Ownership Claim Incomplete */}
                        {isInitialClaimTab && activeTabStatus === 'Ownership Claim Incomplete' && (
                            <div className="bg-amber-50 border-2 border-amber-300 rounded-[2rem] p-5 sm:p-6 flex items-start gap-4 text-amber-950 shadow-sm animate-in fade-in">
                                <span className="text-2xl flex-shrink-0">⚠️</span>
                                <div className="space-y-1">
                                    <h4 className="text-xs font-black uppercase tracking-wide text-amber-900">
                                        Ownership Claim Incomplete
                                    </h4>
                                    <p className="text-xs font-medium text-amber-800 leading-relaxed">
                                        You confirmed that this is your registered pet, but your ownership claim is incomplete because proof documents have not been submitted yet. Please upload at least one proof of ownership below (vaccine card, vet record, or photos) to complete your claim for official verification.
                                    </p>
                                </div>
                            </div>
                        )}

                        <div className="bg-white rounded-[2.5rem] border border-gray-100 shadow-xl overflow-hidden p-6 sm:p-8">
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6 pb-3 border-b border-gray-100">
                                <div>
                                    <div className="flex items-center gap-2">
                                        <h2 className="text-base font-black text-[#1a1208] uppercase tracking-wide">Photo Comparison</h2>
                                        {activeTabObj && (
                                            <span className="text-[10px] font-black uppercase px-2.5 py-0.5 rounded-full bg-stone-100 text-stone-700">
                                                {activeTabObj.tab_label} (Report #{currentReport?.report_id})
                                            </span>
                                        )}
                                    </div>
                                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mt-0.5">Click any image to expand & inspect details</p>
                                </div>
                                {currentReport?.media?.[0]?.file_url && matchedPet?.photo_url && (
                                    <button
                                        type="button"
                                        onClick={() => setIsSideBySideModalOpen(true)}
                                        className="px-3.5 py-2 bg-orange-50 hover:bg-orange-100 border border-orange-200 text-[#F97316] text-[10px] font-black uppercase tracking-wider rounded-xl transition-all cursor-pointer flex items-center gap-1.5 self-start sm:self-auto shadow-xs"
                                    >
                                        <span>🔍</span>
                                        <span>Compare Fullscreen Dual-View</span>
                                    </button>
                                )}
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                {/* Stray Report Photo */}
                                <div className="space-y-4">
                                    <div className="flex justify-between items-center">
                                        <div className="flex items-center gap-2">
                                            <span className="text-xs font-black text-[#F97316] bg-orange-50 px-3.5 py-1.5 rounded-full uppercase tracking-widest leading-none">Reported Stray</span>
                                            <span className="text-xs font-black text-gray-700 bg-gray-100 px-2.5 py-1 rounded-full uppercase tracking-wider">Report #{currentReport?.report_id}</span>
                                        </div>
                                    </div>
                                    <div 
                                        onClick={() => {
                                            if (currentReport?.media && currentReport.media[0]?.file_url) {
                                                setViewingImage({
                                                    url: currentReport.media[0].file_url,
                                                    title: `Reported Stray Sighting (Report #${currentReport.report_id})`,
                                                    subtitle: `${currentReport.animal_type || currentReport.ai_animal_type || 'Stray Animal'} • ${sightingAddress}`,
                                                    type: 'stray'
                                                });
                                            }
                                        }}
                                        className="relative h-64 rounded-3xl overflow-hidden bg-gray-50 border border-gray-100 group cursor-pointer shadow-xs hover:shadow-md hover:border-orange-200 transition-all"
                                    >
                                        {currentReport?.media && currentReport.media.length > 0 ? (
                                             <>
                                                 <img src={currentReport.media[0].file_url} alt="Stray Sighting" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                                                 <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex items-center justify-center">
                                                     <span className="px-4 py-2 bg-white/95 text-[#1a1208] text-xs font-black uppercase tracking-wider rounded-2xl shadow-lg flex items-center gap-2">
                                                         <svg className="w-4 h-4 text-[#F97316]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                             <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v3m0 0v3m0-3h3m-3 0H7" />
                                                         </svg>
                                                         <span>Click to Expand</span>
                                                     </span>
                                                 </div>
                                                 <span className="absolute bottom-3 left-3 px-3 py-1 bg-black/60 backdrop-blur-md text-white text-[10px] font-bold rounded-xl flex items-center gap-1.5 pointer-events-none">
                                                     <span>🔍</span> Click to inspect
                                                 </span>
                                             </>
                                        ) : (
                                            <div className="w-full h-full flex items-center justify-center text-gray-300">No Photo</div>
                                        )}
                                    </div>
                                    <div className="bg-gray-50 rounded-2xl p-4 space-y-2">
                                        <div className="flex items-center justify-between">
                                            <p className="text-xs font-black text-[#1a1208] uppercase">Sighting Details</p>
                                            <span className="text-[10px] font-black text-[#F97316] uppercase tracking-wider">Report #{currentReport?.report_id}</span>
                                        </div>
                                        <p className="text-xs text-gray-500 font-bold">Report Number: <span className="text-[#1a1208] font-black">Report #{currentReport?.report_id} {currentReport?.duplicate_of_report_id ? `(Merged into Case #${currentReport.duplicate_of_report_id})` : ''}</span></p>
                                        <p className="text-xs text-gray-500 font-bold">Species: <span className="text-[#1a1208]">{currentReport?.animal_type || currentReport?.ai_animal_type || "Dog"}</span></p>
                                        <p className="text-xs text-gray-500 font-bold">Breed: <span className="text-[#1a1208]">{currentReport?.animal_breed || currentReport?.ai_possible_breed || "Unknown"}</span></p>
                                        <p className="text-xs text-gray-500 font-bold">Color: <span className="text-[#1a1208]">{currentReport?.animal_color || currentReport?.ai_dominant_color || "Unknown"}</span></p>
                                        {displaySightingMarkings && (
                                            <p className="text-xs text-gray-500 font-bold">Pattern / Markings: <span className="text-[#1a1208]">{displaySightingMarkings}</span></p>
                                        )}
                                        <p className="text-xs text-gray-500 font-bold">Location: <span className="text-[#1a1208]">{sightingAddress}</span></p>
                                    </div>
                                </div>

                                {/* Registered Pet Photo */}
                                <div className="space-y-4">
                                    <div className="flex justify-between items-center">
                                        <span className="text-xs font-black text-gray-500 bg-gray-50 px-3.5 py-1.5 rounded-full uppercase tracking-widest leading-none">Your Registered Pet</span>
                                    </div>
                                    <div 
                                        onClick={() => {
                                            if (matchedPet && matchedPet.photo_url) {
                                                setViewingImage({
                                                    url: getPetPicture(matchedPet.photo_url),
                                                    title: matchedPet.pet_name || "Your Registered Pet",
                                                    subtitle: `${matchedPet.pet_type || 'Pet'} • ${matchedPet.breed || 'Registered Breed'}`,
                                                    type: 'pet'
                                                });
                                            }
                                        }}
                                        className={`relative h-64 rounded-3xl overflow-hidden bg-gray-50 border border-gray-100 group shadow-xs ${matchedPet?.photo_url ? 'cursor-pointer hover:shadow-md hover:border-orange-200' : ''} transition-all`}
                                    >
                                        {matchedPet && matchedPet.photo_url ? (
                                            <>
                                                <img src={getPetPicture(matchedPet.photo_url)} alt={matchedPet.pet_name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" onError={(e) => { e.currentTarget.src = DEFAULT_PET_AVATAR; }} />
                                                <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex items-center justify-center">
                                                    <span className="px-4 py-2 bg-white/95 text-[#1a1208] text-xs font-black uppercase tracking-wider rounded-2xl shadow-lg flex items-center gap-2">
                                                        <svg className="w-4 h-4 text-[#F97316]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v3m0 0v3m0-3h3m-3 0H7" />
                                                        </svg>
                                                        <span>Click to Expand</span>
                                                    </span>
                                                </div>
                                                <span className="absolute bottom-3 left-3 px-3 py-1 bg-black/60 backdrop-blur-md text-white text-[10px] font-bold rounded-xl flex items-center gap-1.5 pointer-events-none">
                                                    <span>🔍</span> Click to inspect
                                                </span>
                                            </>
                                        ) : (
                                            <div className="w-full h-full flex items-center justify-center text-gray-300">Select a pet below</div>
                                        )}
                                    </div>
                                    <div className="bg-gray-50 rounded-2xl p-4 space-y-2">
                                        <p className="text-xs font-black text-[#1a1208] uppercase">{matchedPet ? matchedPet.pet_name : "Pet Details"}</p>
                                        <p className="text-xs text-gray-500 font-bold">Species: <span className="text-[#1a1208]">{matchedPet?.pet_type || "Select a pet"}</span></p>
                                        {matchedPet?.gender && (
                                            <p className="text-xs text-gray-500 font-bold">Gender: <span className="text-[#1a1208]">{matchedPet.gender}</span></p>
                                        )}
                                        <p className="text-xs text-gray-500 font-bold">Breed: <span className="text-[#1a1208]">{matchedPet?.breed || "Select a pet"}</span></p>
                                        <p className="text-xs text-gray-500 font-bold">Colors: <span className="text-[#1a1208]">{matchedPet ? ([matchedPet.primary_color, matchedPet.secondary_color, matchedPet.tertiary_color].filter(Boolean).join(", ") || "Unknown") : "Select a pet"}</span></p>
                                        {(matchedPet?.color_markings || matchedPet?.distinctive_markings) && (
                                            <p className="text-xs text-gray-500 font-bold">Pattern / Markings: <span className="text-[#1a1208]">{matchedPet.color_markings || matchedPet.distinctive_markings}</span></p>
                                        )}
                                        {matchedPet && (
                                            <p className="text-xs text-gray-500 font-bold">Address: <span className="text-[#1a1208]">{registeredAddress}</span></p>
                                        )}
                                    </div>

                                </div>
                            </div>
                        </div>

                        {/* Location Verification Map */}
                        {matchedPet && (
                            <div className="bg-white rounded-[2.5rem] border border-gray-100 shadow-xl p-6 sm:p-8 space-y-5">
                                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                                    <div>
                                        <h3 className="text-lg font-black text-[#1a1208] uppercase tracking-tight">Location Verification</h3>
                                        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mt-0.5">
                                            {hasRegisteredLocation ? 'Route from your registered pet address to the sighting location' : 'Where your pet was sighted'}
                                        </p>
                                    </div>
                                    {hasRegisteredLocation && (
                                        <span className="self-start sm:self-auto text-[10px] font-black text-green-600 bg-green-50 border border-green-100 px-3 py-1 rounded-full uppercase tracking-wider">
                                            Same Subdivision: Selera Homes ✓
                                        </span>
                                    )}
                                </div>

                                {!hasRegisteredLocation && (
                                    <div className="p-3 bg-amber-50 border border-amber-200 rounded-2xl text-xs font-semibold text-amber-900">
                                        📍 Your home location isn't saved yet, so we can't show the route or distance. Pin your home on the map in <b>Settings</b> and come back.
                                    </div>
                                )}

                                <div className="w-full rounded-2xl overflow-hidden border border-gray-100" style={{ height: '260px' }}>
                                    <MapComponent
                                        height="100%"
                                        center={[sightingLat, sightingLng]}
                                        zoom={16}
                                        showHeatmap={false}
                                        showGeofence={true}
                                        showLandmarks={false}
                                        showConnectingLine={hasRegisteredLocation && hasSightingLocation}
                                        onRouteCalculated={(dist: number) => setRoadDistance(dist)}
                                        onViewDetails={(marker: any) => {
                                            const targetId = marker?.rawData?.report_id || (marker?.id > 0 ? marker.id : null) || currentReport?.report_id || reportId;
                                            if (targetId) {
                                                navigate(`/resident/reports/${targetId}`);
                                            }
                                        }}
                                        markers={[
                                            ...(hasSightingLocation ? [{
                                                id: currentReport?.report_id || (reportId ? parseInt(reportId) : 1),
                                                lat: sightingLat,
                                                lng: sightingLng,
                                                title: sightingAddress,
                                                category: 'Stray Sighting',
                                                color: 'orange',
                                                priority: currentReport?.priority_level || 'Medium',
                                                time: currentReport?.created_at ? new Date(currentReport.created_at).toLocaleDateString([], { month: 'short', day: 'numeric' }) : 'Recently',
                                                rawData: {
                                                    ...currentReport,
                                                    report_id: currentReport?.report_id || (reportId ? parseInt(reportId) : 1),
                                                    media: currentReport?.media || (currentReport?.media?.[0]?.file_url ? [{ file_url: currentReport.media[0].file_url }] : []),
                                                },
                                            }] : []),
                                            ...(hasRegisteredLocation
                                                ? [{
                                                    id: -2,
                                                    lat: registeredLat,
                                                    lng: registeredLng,
                                                    title: registeredAddress,
                                                    category: 'User Location',
                                                    color: 'blue',
                                                }]
                                                : []),
                                        ]}
                                    />
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-1">
                                    <div className="bg-orange-50/40 border border-orange-100 hover:border-orange-300 rounded-2xl p-4 transition-all group">
                                        <div className="flex items-center justify-between">
                                            <p className="text-[9px] font-black text-[#F97316] uppercase tracking-widest">Sighting Location</p>
                                            <span className="text-[9px] font-bold text-orange-400 group-hover:text-orange-600 transition-colors">Hover pin on map 📍</span>
                                        </div>
                                        <p className="text-xs font-bold text-[#1a1208] mt-1">{sightingAddress}</p>
                                    </div>
                                    <div className="bg-gray-50 rounded-2xl p-4 border border-gray-100">
                                        <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Registered Address</p>
                                        <p className="text-xs font-bold text-[#1a1208] mt-1 leading-relaxed">{registeredAddress}</p>
                                    </div>
                                    <div className="bg-gray-50 rounded-2xl p-4 border border-gray-100">
                                        <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Calculated Distance</p>
                                        <p className="text-xl font-black text-green-600 mt-1">{displayDistanceStr}</p>
                                        <p className="text-[9px] font-bold text-gray-400 uppercase mt-0.5">Via subdivision streets</p>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Match Analysis Details */}
                        {matchedPet && (
                            <div className="bg-white rounded-[2.5rem] border border-gray-100 shadow-xl p-6 sm:p-8 space-y-6">
                                <h3 className="text-lg font-black text-[#1a1208] uppercase tracking-tight">AI Matching Analysis</h3>
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                    <div className="bg-orange-50/40 border border-orange-100 rounded-2xl p-4 text-center">
                                        <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1">Visual Similarity</p>
                                        <p className="text-2xl font-black text-[#F97316]">{getSimilarityScore()}</p>
                                        <p className="text-[9px] font-bold text-[#F97316] uppercase mt-1">{getSimilarityLabel()}</p>
                                    </div>
                                    <div className="bg-gray-50 rounded-2xl p-4 text-center">
                                        <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1">Geofence Proximity</p>
                                        <p className="text-2xl font-black text-green-600">Selera Homes</p>
                                        <p className="text-[9px] font-bold text-green-600 uppercase mt-1">Inside Reporting Boundary ✓</p>
                                    </div>
                                    <div className="bg-gray-50 rounded-2xl p-4 text-center">
                                        <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1">Breed & Color Match</p>
                                        <p className={`text-2xl font-black ${breedColorMatch.text === 'YES' ? 'text-green-600' : breedColorMatch.text === 'PARTIAL' ? 'text-amber-500' : 'text-red-500'}`}>{breedColorMatch.text}</p>
                                        <p className={`text-[9px] font-bold uppercase mt-1 ${breedColorMatch.text === 'YES' ? 'text-green-600' : breedColorMatch.text === 'PARTIAL' ? 'text-amber-500' : 'text-red-500'}`}>{breedColorMatch.desc}</p>
                                    </div>
                                </div>
                                {getAiExplanation() && (
                                    <div className="mt-4 p-4 bg-orange-50/20 border border-orange-100/50 rounded-2xl">
                                        <p className="text-[9px] font-black text-orange-500 uppercase tracking-widest mb-1.5">AI Copilot Analysis</p>
                                        <p className="text-xs text-[#4a3b28] font-bold leading-relaxed">{getAiExplanation()}</p>
                                    </div>
                                )}
                            </div>
                        )}

                    </div>

                    {/* Right: Claim Form or Status Tracker */}
                    <div className="lg:col-span-4 space-y-8">
                        {activeMatch && (
                            <div className="bg-white rounded-[2.5rem] border border-gray-100 shadow-xl p-6 sm:p-8 space-y-4">
                                <h3 className="text-lg font-black text-[#1a1208] uppercase tracking-tight">Match Confirmation</h3>
                                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest leading-relaxed">
                                    Added to your pet's record only when both you and a reviewing official confirm
                                </p>
                                <div className="space-y-2">
                                    <div className="flex items-center justify-between bg-gray-50 rounded-2xl px-4 py-3">
                                        <span className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Official Review</span>
                                        <span className={`text-[10px] font-black uppercase ${
                                            activeMatch.status === 'CONFIRMED_MATCH' ? 'text-green-600' :
                                            activeMatch.status === 'NOT_A_MATCH' ? 'text-red-500' :
                                            activeMatch.status === 'UNABLE_TO_VERIFY' ? 'text-amber-500' : 'text-gray-400'
                                        }`}>
                                            {activeMatch.status === 'CONFIRMED_MATCH' ? '✓ Confirmed' :
                                             activeMatch.status === 'NOT_A_MATCH' ? '✕ Not a Match' :
                                             activeMatch.status === 'UNABLE_TO_VERIFY' ? 'Unable to Verify' : 'Pending'}
                                        </span>
                                    </div>
                                    <div className="flex items-center justify-between bg-gray-50 rounded-2xl px-4 py-3">
                                        <span className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Your Confirmation</span>
                                        <span className={`text-[10px] font-black uppercase ${
                                            activeMatch.owner_confirmation_status === 'OWNER_CONFIRMED' ? 'text-green-600' :
                                            activeMatch.owner_confirmation_status === 'OWNER_REJECTED' ? 'text-red-500' :
                                            activeMatch.owner_confirmation_status === 'UNSURE' ? 'text-amber-500' : 'text-gray-400'
                                        }`}>
                                            {activeMatch.owner_confirmation_status === 'OWNER_CONFIRMED' ? '✓ Confirmed' :
                                             activeMatch.owner_confirmation_status === 'OWNER_REJECTED' ? '✕ Not My Pet' :
                                             activeMatch.owner_confirmation_status === 'UNSURE' ? '? Unsure' : 'Pending'}
                                        </span>
                                    </div>
                                </div>
                                {activeMatch.status === 'NOT_A_MATCH' && ownerStatus !== 'OWNER_REJECTED' ? (
                                    (activeMatch.owner_dispute_count || 0) >= 1 ? (
                                        <div className="p-3 bg-red-50 border border-red-200 rounded-2xl text-xs font-bold text-red-700 text-center">
                                            The official reviewed this sighting again after your request and it is final: it is not {petName(matchedPet) || 'your pet'}.
                                            If you still believe it is, file a formal dispute on the report so the Barangay can review it.
                                        </div>
                                    ) : (
                                        <div className="p-4 bg-amber-50 border border-amber-200 rounded-2xl space-y-3">
                                            <p className="text-xs font-bold text-amber-800">
                                                An official marked this sighting as not {petName(matchedPet) || 'your pet'}. If it is your pet, you can ask for one more review.
                                            </p>
                                            <textarea
                                                value={disputeReason}
                                                onChange={(e) => setDisputeReason(e.target.value)}
                                                rows={3}
                                                maxLength={1000}
                                                placeholder="Why is this your pet? (scar, collar, markings, vaccination record...)"
                                                className="w-full text-xs font-semibold text-gray-700 bg-white border border-amber-200 rounded-xl p-3 focus:outline-none focus:ring-2 focus:ring-amber-300"
                                            />
                                            <Button
                                                disabled={isSubmitting || disputeReason.trim().length < 5}
                                                className="w-full py-3 bg-amber-600 hover:bg-amber-700 text-white text-xs font-black uppercase tracking-widest rounded-2xl cursor-pointer disabled:opacity-50"
                                                onClick={handleRequestSecondReview}
                                            >
                                                {isSubmitting ? 'Sending...' : 'Request a Second Review'}
                                            </Button>
                                            <p className="text-[10px] font-semibold text-amber-700">You can do this once. The official's next decision is final.</p>
                                        </div>
                                    )
                                ) : activeMatch.status === 'PENDING_VERIFICATION' && (activeMatch.owner_dispute_count || 0) >= 1 ? (
                                    <div className="p-3 bg-orange-50 border border-orange-200 rounded-2xl text-xs font-bold text-orange-700 text-center">
                                        Second review requested. A reviewing official will check this sighting again.
                                    </div>
                                ) : activeMatch.status === 'CONFIRMED_MATCH' && activeMatch.owner_confirmation_status === 'OWNER_CONFIRMED' ? (
                                    <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-2xl text-xs font-bold text-emerald-700 text-center">
                                        ✅ Linked to {petName(matchedPet) || 'your pet'}'s pet record
                                    </div>
                                ) : activeMatch.status === 'CONFIRMED_MATCH' && activeMatch.owner_confirmation_status !== 'OWNER_REJECTED' ? (
                                    <div className="p-3 bg-orange-50 border border-orange-200 rounded-2xl text-xs font-bold text-orange-700 text-center">
                                        {ownerStatus === 'OWNER_CONFIRMED'
                                            ? 'Waiting for a reviewing official to confirm this sighting.'
                                            : 'An official confirmed this sighting. Please answer below whether this is your pet.'}
                                    </div>
                                ) : ownerStatus === 'OWNER_REJECTED' ? (
                                    <div className="p-3 bg-red-50 border border-red-200 rounded-2xl text-xs font-bold text-red-700 text-center">
                                        You said this is not {petName(matchedPet) || 'your pet'}. This sighting will not be added to your pet's record.
                                    </div>
                                ) : ownerStatus === 'UNSURE' ? (
                                    <div className="p-3 bg-amber-50 border border-amber-200 rounded-2xl text-xs font-bold text-amber-700 text-center">
                                        You indicated you are unsure if this is {petName(matchedPet) || 'your pet'}. Subdivision staff will review this sighting.
                                    </div>
                                ) : ownerStatus === 'OWNER_CONFIRMED' ? (
                                    <div className="p-3 bg-orange-50 border border-orange-200 rounded-2xl text-xs font-bold text-orange-700 text-center">
                                        Waiting for a reviewing official to confirm this sighting.
                                    </div>
                                ) : null}
                            </div>
                        )}
                        {isMergedReport ? (
                            <>
                                {/* Subsequent Sighting Confirmation Card */}
                                <div className="bg-white rounded-[2.5rem] border border-gray-100 shadow-xl p-6 sm:p-8 space-y-6">
                                    <div>
                                        <div className="flex items-center justify-between mb-1">
                                            <span className="text-[10px] font-black uppercase tracking-widest text-[#F97316] bg-orange-50 px-3 py-1 rounded-full">
                                                Merged Case Sighting
                                            </span>
                                            <span className="text-[10px] font-bold text-gray-400 uppercase">
                                                Report #{currentReport?.report_id}
                                            </span>
                                        </div>
                                        <h3 className="text-lg font-black text-[#1a1208] uppercase tracking-tight mt-2">
                                            New Sighting — Is This Still {petName(matchedPet) || 'Your Pet'}?
                                        </h3>
                                        <p className="text-xs text-gray-500 font-semibold leading-relaxed mt-1">
                                            This report was merged into your active pet case
                                            {caseData?.canonical_claim_report_id ? ` (Report #${caseData.canonical_claim_report_id})` : (currentReport?.duplicate_of_report_id ? ` (Report #${currentReport.duplicate_of_report_id})` : '')}.
                                            No repeated proof of ownership is required.
                                        </p>
                                    </div>

                                    {!isInitialClaimCompleted ? (
                                        <div className="space-y-5 animate-in fade-in duration-300">
                                            <div className="p-5 bg-gradient-to-br from-amber-50 to-orange-50 border-2 border-amber-300/80 rounded-3xl space-y-3 shadow-xs">
                                                <div className="flex items-center gap-2 text-amber-900 font-black text-sm uppercase tracking-wide">
                                                    <span className="text-xl">⚠️</span>
                                                    <span>Complete Your Initial Pet Claim First</span>
                                                </div>
                                                <p className="text-xs text-amber-950 font-medium leading-relaxed">
                                                    Before confirming additional sightings, please complete your initial pet ownership claim and submit the required proof of ownership in <strong>Report #{initialClaimReportId}</strong>.
                                                </p>
                                            </div>

                                            <div className="space-y-3 pt-1">
                                                <div className="flex items-center justify-between text-[10px] font-black uppercase tracking-wider text-gray-400">
                                                    <span>Sighting Confirmation Actions</span>
                                                    <span className="text-amber-700 bg-amber-100/80 border border-amber-200 px-2 py-0.5 rounded-full font-bold">Locked</span>
                                                </div>
                                                <button
                                                    disabled
                                                    type="button"
                                                    className="w-full py-3.5 bg-gray-100 text-gray-400 text-xs font-black uppercase tracking-wider rounded-2xl cursor-not-allowed border border-gray-200 opacity-60 flex items-center justify-center gap-2"
                                                >
                                                    <span>🔒</span>
                                                    <span>Yes, this is my pet</span>
                                                </button>
                                                <button
                                                    disabled
                                                    type="button"
                                                    className="w-full py-3.5 bg-gray-100 text-gray-400 text-xs font-black uppercase tracking-wider rounded-2xl cursor-not-allowed border border-gray-200 opacity-60 flex items-center justify-center gap-2"
                                                >
                                                    <span>🔒</span>
                                                    <span>Unsure / Can't tell</span>
                                                </button>
                                                <button
                                                    disabled
                                                    type="button"
                                                    className="w-full py-3 bg-gray-100 text-gray-400 text-xs font-black uppercase tracking-wider rounded-2xl cursor-not-allowed border border-gray-200 opacity-60 flex items-center justify-center gap-2"
                                                >
                                                    <span>🔒</span>
                                                    <span>No, not my pet</span>
                                                </button>
                                            </div>

                                            <Button
                                                className="w-full py-4 bg-gradient-to-r from-[#F97316] to-[#EA580C] hover:from-[#EA580C] hover:to-[#C2410C] text-white text-xs font-black uppercase tracking-wider rounded-2xl shadow-md cursor-pointer flex items-center justify-center gap-2 transition-all hover:scale-[1.01]"
                                                onClick={() => handleTabClick(initialClaimReportId)}
                                            >
                                                <span>📋</span>
                                                <span>Go to {initialClaimTabLabel} (Report #{initialClaimReportId})</span>
                                            </Button>
                                        </div>
                                    ) : (ownerStatus === 'OWNER_CONFIRMED' || ownerStatus === 'OWNER_REJECTED' || ownerStatus === 'UNSURE') && !isEditingSightingResponse ? (
                                        <div className="space-y-4">
                                            <div className={`p-4 rounded-2xl border ${
                                                ownerStatus === 'OWNER_CONFIRMED' ? 'bg-emerald-50 border-emerald-200 text-emerald-800' :
                                                ownerStatus === 'OWNER_REJECTED' ? 'bg-red-50 border-red-200 text-red-800' :
                                                'bg-amber-50 border-amber-200 text-amber-800'
                                            }`}>
                                                <div className="flex items-center gap-2 font-black text-xs uppercase tracking-wide">
                                                    <span>
                                                        {ownerStatus === 'OWNER_CONFIRMED' ? '✓' : ownerStatus === 'OWNER_REJECTED' ? '✕' : '❓'}
                                                    </span>
                                                    <span>
                                                        {ownerStatus === 'OWNER_CONFIRMED' ? 'You Confirmed This Sighting' :
                                                         ownerStatus === 'OWNER_REJECTED' ? 'You Reported Not Your Pet' :
                                                         'You Reported Unsure'}
                                                    </span>
                                                </div>
                                                <p className="text-xs font-semibold mt-1.5 leading-relaxed">
                                                    {ownerStatus === 'OWNER_CONFIRMED'
                                                        ? `You confirmed that this sighting is ${petName(matchedPet) || 'your pet'}. Location has been added to your pet's activity map.`
                                                        : ownerStatus === 'OWNER_REJECTED'
                                                        ? `You reported that this sighting is not ${petName(matchedPet) || 'your pet'}. Subdivision Leaders have been notified to review the merge.`
                                                        : `You are unsure whether this sighting is ${petName(matchedPet) || 'your pet'}. Subdivision staff will inspect further.`}
                                                </p>
                                                {activeMatch?.owner_notes && (
                                                    <div className="mt-3 pt-2 border-t border-black/5 text-[11px] font-medium">
                                                        <span className="font-bold">Your note: </span>"{activeMatch.owner_notes}"
                                                    </div>
                                                )}
                                            </div>

                                            <Button
                                                variant="ghost"
                                                className="w-full py-3 border border-gray-200 text-gray-700 text-xs font-black uppercase tracking-wider rounded-2xl hover:bg-gray-50 cursor-pointer"
                                                onClick={() => {
                                                    setSightingFeedbackNote(activeMatch?.owner_notes || '');
                                                    setIsEditingSightingResponse(true);
                                                }}
                                            >
                                                Change My Answer
                                            </Button>
                                        </div>
                                    ) : (
                                        <div className="space-y-5">
                                            <p className="text-xs font-bold text-[#1a1208]">
                                                Please answer Yes, No, or Unsure:
                                            </p>

                                            <div className="space-y-2">
                                                <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest block">
                                                    Optional Remarks / Observation Notes
                                                </label>
                                                <textarea
                                                    className="w-full bg-[#FAFAF9] border border-gray-200 rounded-2xl p-3 text-xs font-semibold text-[#1a1208] placeholder:text-gray-400 focus:outline-none focus:border-orange-500 min-h-[70px] resize-none"
                                                    placeholder="e.g., Looks like my pet's color, but collar is missing... or Last seen near the park"
                                                    value={sightingFeedbackNote}
                                                    onChange={(e) => setSightingFeedbackNote(e.target.value)}
                                                    maxLength={500}
                                                />
                                            </div>

                                            <div className="space-y-3 pt-1">
                                                <Button
                                                    disabled={isSubmitting}
                                                    className="w-full py-3.5 bg-gradient-to-r from-emerald-600 to-green-600 hover:from-emerald-700 hover:to-green-700 text-white text-xs font-black uppercase tracking-wider rounded-2xl shadow-sm cursor-pointer transition-all"
                                                    onClick={() => {
                                                        handleMergedSightingResponse('OWNER_CONFIRMED');
                                                        setIsEditingSightingResponse(false);
                                                    }}
                                                >
                                                    {isSubmitting ? 'Submitting...' : '✓ Yes, this is my pet'}
                                                </Button>

                                                <Button
                                                    disabled={isSubmitting}
                                                    className="w-full py-3.5 bg-amber-500 hover:bg-amber-600 text-white text-xs font-black uppercase tracking-wider rounded-2xl shadow-sm cursor-pointer transition-all"
                                                    onClick={() => {
                                                        handleMergedSightingResponse('UNSURE');
                                                        setIsEditingSightingResponse(false);
                                                    }}
                                                >
                                                    {isSubmitting ? 'Submitting...' : '❓ Unsure / Can\'t tell'}
                                                </Button>

                                                <Button
                                                    variant="ghost"
                                                    disabled={isSubmitting}
                                                    className="w-full py-3 border border-gray-300 text-red-600 hover:bg-red-50 text-xs font-black uppercase tracking-wider rounded-2xl cursor-pointer transition-all"
                                                    onClick={() => {
                                                        handleMergedSightingResponse('OWNER_REJECTED');
                                                        setIsEditingSightingResponse(false);
                                                    }}
                                                >
                                                    {isSubmitting ? 'Submitting...' : '✕ No, not my pet'}
                                                </Button>

                                                {isEditingSightingResponse && (
                                                    <Button
                                                        variant="ghost"
                                                        className="w-full py-2 text-gray-400 hover:text-gray-600 text-[11px] font-bold uppercase tracking-wider"
                                                        onClick={() => setIsEditingSightingResponse(false)}
                                                    >
                                                        Cancel
                                                    </Button>
                                                )}
                                            </div>
                                        </div>
                                    )}
                                </div>

                                {/* Informational Case Ownership Claim Card */}
                                <div className="bg-white rounded-[2.5rem] border border-gray-100 shadow-xl p-6 sm:p-8 space-y-4">
                                    <div className="flex items-center justify-between">
                                        <h3 className="text-base font-black text-[#1a1208] uppercase tracking-tight">Case Ownership Claim</h3>
                                        {existingClaim?.status && (
                                            <span className={`text-[10px] font-black uppercase px-3 py-1 rounded-full ${
                                                (existingClaim.status === 'Handover Complete' || existingClaim.status === 'Pet Received') ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' :
                                                existingClaim.status === 'Approved' ? 'bg-green-50 text-green-700 border border-green-200' :
                                                existingClaim.status === 'Rejected' ? 'bg-red-50 text-red-700 border border-red-200' :
                                                'bg-blue-50 text-blue-700 border border-blue-200'
                                            }`}>
                                                {existingClaim.status}
                                            </span>
                                        )}
                                    </div>

                                    <div className="p-4 bg-orange-50/40 border border-orange-100 rounded-2xl space-y-2">
                                        <p className="text-xs font-bold text-orange-950">
                                            🛡️ Ownership Verified On Case
                                        </p>
                                        <p className="text-xs text-orange-900/80 leading-relaxed font-medium">
                                            Your proof of ownership was submitted for this case
                                            {caseData?.canonical_claim_report_id ? ` (Report #${caseData.canonical_claim_report_id})` : (currentReport?.duplicate_of_report_id ? ` (Report #${currentReport.duplicate_of_report_id})` : '')}.
                                            You do not need to re-upload documents for subsequent sightings.
                                        </p>
                                    </div>

                                    {existingClaim?.status === 'Approved' && (
                                        <div className="space-y-2 pt-1">
                                            <Button
                                                fullWidth
                                                className="py-3 bg-gradient-to-r from-[#F97316] to-[#EA580C] hover:from-[#EA580C] hover:to-[#C2410C] text-white text-xs font-black uppercase tracking-wider rounded-xl shadow-xs cursor-pointer flex items-center justify-center gap-2"
                                                onClick={() => setIsChatOpen(true)}
                                            >
                                                <span>💬</span>
                                                <span>Coordinate Pickup via Chat</span>
                                            </Button>
                                            
                                            <div className="pt-2 border-t border-green-200/60 space-y-1 text-left">
                                                <p className="text-[10px] font-black text-emerald-950 uppercase tracking-wider flex items-center gap-1.5">
                                                    <span>🐾 Already in your possession?</span>
                                                </p>
                                                <p className="text-[10px] text-emerald-800 leading-snug">
                                                    If you have already retrieved or received your pet, upload your reunion photo to officially close this case.
                                                </p>
                                            </div>

                                            <Button
                                                fullWidth
                                                disabled={isSubmitting || isSubmittingReunion}
                                                className="py-3 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black uppercase tracking-wider rounded-xl shadow-md cursor-pointer flex items-center justify-center gap-2 transition-all transform active:scale-95 border-0"
                                                onClick={handleOpenPetReceivedModal}
                                            >
                                                <span>🐾</span>
                                                <span>Mark as Pet Received</span>
                                            </Button>
                                        </div>
                                    )}

                                    {caseReports.length > 1 && (
                                        <Button
                                            variant="ghost"
                                            className="w-full py-3 border border-gray-200 text-[#1a1208] text-xs font-black uppercase tracking-wider rounded-xl hover:bg-gray-50 cursor-pointer flex items-center justify-center gap-1.5"
                                            onClick={() => handleTabClick(initialClaimReportId)}
                                        >
                                            <span>📋</span>
                                            <span>View {initialClaimTabLabel} (Report #{initialClaimReportId})</span>
                                        </Button>
                                    )}
                                </div>
                            </>
                        ) : existingClaim && existingClaim.status !== "Potential Owner Match" ? (
                            // Claim Status Card
                            <div className="bg-white rounded-[2.5rem] border border-gray-100 shadow-xl p-6 sm:p-8 space-y-6">
                                <h3 className="text-lg font-black text-[#1a1208] uppercase tracking-tight">Claim Status</h3>
                                <div className={`p-4 rounded-2xl border text-center ${
                                    (existingClaim.status === 'Handover Complete' || existingClaim.status === 'Pet Received') ? 'bg-emerald-50 border-emerald-200 text-emerald-700 font-bold' :
                                    existingClaim.status === 'Approved' ? 'bg-green-50 border-green-100 text-green-600' :
                                    existingClaim.status === 'Rejected' ? 'bg-red-50 border-red-100 text-red-600' :
                                    existingClaim.status === 'Evidence Requested' ? 'bg-amber-50 border-amber-100 text-amber-600' :
                                    'bg-blue-50 border-blue-100 text-blue-600'
                                }`}>
                                    <p className="text-[9px] font-black uppercase tracking-widest mb-1">Status</p>
                                    <p className="text-lg font-black uppercase">{existingClaim.status}</p>
                                </div>

                                {existingClaim.status === 'Approved' && (
                                     <div className="p-4 bg-green-50/70 border border-green-200/80 rounded-2xl space-y-3">
                                         <div className="flex items-center gap-2 text-green-900 font-black text-xs uppercase tracking-wide">
                                             <span>🎉</span>
                                             <span>Claim Verified & Approved</span>
                                         </div>
                                         <p className="text-xs text-green-800 font-medium leading-relaxed">
                                             Your proof of ownership was verified by the subdivision officers. Please use the direct case chat to coordinate meeting time and physical pet handover.
                                         </p>
                                         <div className="space-y-2 pt-1">
                                             <Button
                                                 fullWidth
                                                 className="py-3 bg-gradient-to-r from-[#F97316] to-[#EA580C] hover:from-[#EA580C] hover:to-[#C2410C] text-white text-xs font-black uppercase tracking-wider rounded-xl shadow-xs cursor-pointer flex items-center justify-center gap-2"
                                                 onClick={() => setIsChatOpen(true)}
                                             >
                                                 <span>💬</span>
                                                 <span>Coordinate Pickup via Chat</span>
                                             </Button>
                                             
                                             <div className="pt-2 border-t border-green-200/60 space-y-1 text-left">
                                                 <p className="text-[10px] font-black text-emerald-950 uppercase tracking-wider flex items-center gap-1.5">
                                                     <span>🐾 Already in your possession?</span>
                                                 </p>
                                                 <p className="text-[10px] text-emerald-800 leading-snug">
                                                     If you have already retrieved or received your pet, upload your reunion photo to officially close this case.
                                                 </p>
                                             </div>

                                             <Button
                                                 fullWidth
                                                 disabled={isSubmitting || isSubmittingReunion}
                                                 className="py-3 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black uppercase tracking-wider rounded-xl shadow-md cursor-pointer flex items-center justify-center gap-2 transition-all transform active:scale-95 border-0"
                                                 onClick={handleOpenPetReceivedModal}
                                             >
                                                 <span>🐾</span>
                                                 <span>Mark as Pet Received</span>
                                             </Button>
                                         </div>
                                     </div>
                                )}

                                {(existingClaim.status === 'Handover Complete' || existingClaim.status === 'Pet Received') && (
                                    <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-2xl space-y-3 text-center">
                                        <div className="flex items-center justify-center gap-1.5 text-emerald-900 font-black text-xs uppercase tracking-wide">
                                            <span>✅</span>
                                            <span>Pet Reunited & Safely Received</span>
                                        </div>
                                        <p className="text-xs text-emerald-800 font-medium leading-relaxed">
                                            Your pet has been successfully received and safely returned home. This report is officially closed and archived.
                                        </p>

                                        {(existingClaim.handover_photo_url || reunionPreviewUrl) && (
                                            <div className="pt-3 border-t border-emerald-200/80 text-left">
                                                <p className="text-[10px] font-black uppercase text-emerald-950 tracking-wider mb-2 flex items-center gap-1.5">
                                                    <Camera className="w-3.5 h-3.5 text-emerald-600" />
                                                    <span>Reunion Proof (Safe in Your Possession)</span>
                                                </p>
                                                <div 
                                                    className="relative rounded-2xl overflow-hidden border-2 border-emerald-300 max-w-sm mx-auto shadow-md aspect-video bg-stone-900 cursor-pointer group flex items-center justify-center"
                                                    onClick={() => setViewingImage({
                                                        url: existingClaim.handover_photo_url || reunionPreviewUrl,
                                                        title: "Reunion Proof: Pet Safely Recovered",
                                                        type: 'pet'
                                                    })}
                                                >
                                                    <img 
                                                        src={existingClaim.handover_photo_url || reunionPreviewUrl} 
                                                        alt="Reunion Proof" 
                                                        className="w-full h-full object-contain group-hover:scale-105 transition-transform duration-200"
                                                    />
                                                    <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white text-xs font-bold gap-1">
                                                        <span>🔍 Click to enlarge</span>
                                                    </div>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                )}

                                {existingClaim.remarks && (
                                    <div className="bg-gray-50 rounded-2xl p-4">
                                        <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1">Remarks from Administration</p>
                                        <p className="text-xs font-bold text-[#1a1208]">{existingClaim.remarks}</p>
                                    </div>
                                )}

                                {/* ─── C: Ownership Proof Documents (Past Uploads) ─── */}
                                <div className="space-y-4 pt-4 border-t border-gray-100">
                                    <div className="flex items-center justify-between">
                                        <h4 className="text-xs font-black text-[#1a1208] uppercase tracking-widest flex items-center gap-1.5">
                                            <span>📑</span>
                                            <span>Ownership Proof Documents</span>
                                        </h4>
                                        <span className="text-[9px] font-black uppercase px-2.5 py-0.5 rounded-full bg-orange-50 text-orange-600 border border-orange-200">
                                            Past Uploads & Records
                                        </span>
                                    </div>

                                    {/* 4 Categorized Sections matching Subd Pet Claims */}
                                    <div className="space-y-3">
                                        {/* 1. Vaccination Records */}
                                        <div className="bg-gray-50 rounded-2xl p-3.5 border border-gray-100">
                                            <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-2 flex items-center justify-between">
                                                <span>Vaccination Records</span>
                                                {activeVaccineUrl && <span className="text-emerald-600 font-bold text-[8px] uppercase">✓ Attached</span>}
                                            </p>
                                            {activeVaccineUrl ? (
                                                <div className="flex items-center justify-between p-2.5 bg-white border border-gray-200 rounded-xl">
                                                    <div className="flex items-center gap-2 min-w-0">
                                                        <div className="w-7 h-7 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center shrink-0 text-sm">
                                                            💉
                                                        </div>
                                                        <div className="min-w-0">
                                                            <p className="text-[10px] font-black text-[#1a1208] truncate">
                                                                {activeVaccineUrl.split('/').pop()?.replace(/^[0-9]+_/, '') || 'Vaccination Record'}
                                                            </p>
                                                            <p className="text-[8px] text-gray-400 font-bold uppercase">Pet Vaccine Card</p>
                                                        </div>
                                                    </div>
                                                    <div className="flex items-center gap-1.5 shrink-0">
                                                        <button
                                                            type="button"
                                                            onClick={() => setViewingImage({ url: activeVaccineUrl, title: 'Vaccination Record', type: 'pet' })}
                                                            className="px-2.5 py-1 text-[9px] font-black text-white bg-[#F97316] hover:bg-orange-600 rounded-lg uppercase tracking-wider transition-all cursor-pointer"
                                                        >
                                                            View
                                                        </button>
                                                        <a
                                                            href={activeVaccineUrl}
                                                            target="_blank"
                                                            rel="noreferrer"
                                                            className="p-1 text-gray-400 hover:text-gray-600 cursor-pointer"
                                                            title="Open file in new tab"
                                                        >
                                                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                                                            </svg>
                                                        </a>
                                                    </div>
                                                </div>
                                            ) : (
                                                <div className="border border-dashed border-gray-200 rounded-xl p-3 text-center bg-white/50">
                                                    <p className="text-[9px] font-black text-gray-400 uppercase">Not Uploaded</p>
                                                </div>
                                            )}
                                        </div>

                                        {/* 2. Previous Pet Photos */}
                                        <div className="bg-gray-50 rounded-2xl p-3.5 border border-gray-100">
                                            <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-2 flex items-center justify-between">
                                                <span>Previous Pet Photos</span>
                                                {activePhotos.length > 0 && <span className="text-emerald-600 font-bold text-[8px] uppercase">{activePhotos.length} photo(s)</span>}
                                            </p>
                                            {activePhotos.length > 0 ? (
                                                <div className="grid grid-cols-3 gap-2">
                                                    {activePhotos.map((photo, i) => (
                                                        <div
                                                            key={i}
                                                            onClick={() => setViewingImage({ url: photo, title: `Pet Photo ${i + 1}`, type: 'pet' })}
                                                            className="relative aspect-square rounded-xl overflow-hidden border border-gray-200 bg-gray-100 cursor-pointer group hover:scale-[1.03] transition-all"
                                                        >
                                                            <img
                                                                src={photo}
                                                                alt={`Past pet photo ${i + 1}`}
                                                                className="w-full h-full object-cover group-hover:brightness-105 transition-all"
                                                            />
                                                            <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white text-xs font-bold">
                                                                🔍
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            ) : (
                                                <div className="border border-dashed border-gray-200 rounded-xl p-3 text-center bg-white/50">
                                                    <p className="text-[9px] font-black text-gray-400 uppercase">No Photos</p>
                                                </div>
                                            )}
                                        </div>

                                        {/* 3. Supporting Documents */}
                                        <div className="bg-gray-50 rounded-2xl p-3.5 border border-gray-100">
                                            <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-2">Supporting Documents</p>
                                            {(activeVetUrl || activeRegUrl) ? (
                                                <div className="space-y-2">
                                                    {activeVetUrl && (
                                                        <div className="flex items-center justify-between p-2.5 bg-white border border-gray-200 rounded-xl">
                                                            <div className="flex items-center gap-2 min-w-0">
                                                                <div className="w-7 h-7 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0 text-sm">
                                                                    📋
                                                                </div>
                                                                <div className="min-w-0">
                                                                    <p className="text-[10px] font-black text-[#1a1208] truncate">
                                                                        {activeVetUrl.split('/').pop()?.replace(/^[0-9]+_/, '') || 'Veterinary Medical Record'}
                                                                    </p>
                                                                    <p className="text-[8px] text-gray-400 font-bold uppercase">Vet Clinic Medical Records</p>
                                                                </div>
                                                            </div>
                                                            <div className="flex items-center gap-1.5 shrink-0">
                                                                <button
                                                                    type="button"
                                                                    onClick={() => setViewingImage({ url: activeVetUrl, title: 'Veterinary Record', type: 'pet' })}
                                                                    className="px-2.5 py-1 text-[9px] font-black text-white bg-[#F97316] hover:bg-orange-600 rounded-lg uppercase tracking-wider transition-all cursor-pointer"
                                                                >
                                                                    View
                                                                </button>
                                                                <a
                                                                    href={activeVetUrl}
                                                                    target="_blank"
                                                                    rel="noreferrer"
                                                                    className="p-1 text-gray-400 hover:text-gray-600 cursor-pointer"
                                                                    title="Open file"
                                                                >
                                                                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                                                                    </svg>
                                                                </a>
                                                            </div>
                                                        </div>
                                                    )}
                                                    {activeRegUrl && (
                                                        <div className="flex items-center justify-between p-2.5 bg-white border border-gray-200 rounded-xl">
                                                            <div className="flex items-center gap-2 min-w-0">
                                                                <div className="w-7 h-7 rounded-lg bg-purple-50 text-purple-600 flex items-center justify-center shrink-0 text-sm">
                                                                    📄
                                                                </div>
                                                                <div className="min-w-0">
                                                                    <p className="text-[10px] font-black text-[#1a1208] truncate">
                                                                        {activeRegUrl.split('/').pop()?.replace(/^[0-9]+_/, '') || 'Pet Registration Certificate'}
                                                                    </p>
                                                                    <p className="text-[8px] text-gray-400 font-bold uppercase">Pet Registration Document</p>
                                                                </div>
                                                            </div>
                                                            <div className="flex items-center gap-1.5 shrink-0">
                                                                <button
                                                                    type="button"
                                                                    onClick={() => setViewingImage({ url: activeRegUrl, title: 'Registration Record', type: 'pet' })}
                                                                    className="px-2.5 py-1 text-[9px] font-black text-white bg-[#F97316] hover:bg-orange-600 rounded-lg uppercase tracking-wider transition-all cursor-pointer"
                                                                >
                                                                    View
                                                                </button>
                                                                <a
                                                                    href={activeRegUrl}
                                                                    target="_blank"
                                                                    rel="noreferrer"
                                                                    className="p-1 text-gray-400 hover:text-gray-600 cursor-pointer"
                                                                    title="Open file"
                                                                >
                                                                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                                                                    </svg>
                                                                </a>
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>
                                            ) : (
                                                <div className="border border-dashed border-gray-200 rounded-xl p-3 text-center bg-white/50">
                                                    <p className="text-[9px] font-black text-gray-400 uppercase">No documents provided</p>
                                                </div>
                                            )}
                                        </div>

                                        {/* 4. Additional Notes from Owner */}
                                        <div className="bg-gray-50 rounded-2xl p-3.5 border border-gray-100 space-y-2">
                                            <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Additional Notes from Owner</p>
                                            {activeMarkings && (
                                                <div className="p-2.5 bg-white border border-gray-200 rounded-xl space-y-0.5">
                                                    <span className="text-[8px] font-black text-orange-600 uppercase tracking-wider">Distinctive Markings (Hidden features)</span>
                                                    <p className="text-[11px] font-bold text-[#1a1208]">{activeMarkings}</p>
                                                </div>
                                            )}
                                            {activeRemarks ? (
                                                <div className="p-2.5 bg-white border border-gray-200 rounded-xl space-y-0.5">
                                                    <span className="text-[8px] font-black text-gray-400 uppercase tracking-wider">Remarks / Notes</span>
                                                    <p className="text-[11px] font-medium text-gray-700 italic">{activeRemarks}</p>
                                                </div>
                                            ) : !activeMarkings ? (
                                                <p className="text-[10px] text-gray-400 font-semibold py-1 text-center">No additional notes provided.</p>
                                            ) : null}
                                        </div>
                                    </div>
                                </div>

                                {/* ─── Upload / Add Proof Form (Direct upload without waiting for request evidence) ─── */}
                                {(existingClaim.status !== 'Handover Complete' && existingClaim.status !== 'Pet Received') && (
                                    <div className="space-y-4 pt-3 border-t border-gray-100">
                                        {existingClaim.status === 'Evidence Requested' ? (
                                            <div className="p-3 bg-amber-50 border border-amber-200 rounded-2xl space-y-1">
                                                <p className="text-[10px] font-black text-amber-800 uppercase tracking-wide flex items-center gap-1.5">
                                                    <span>⚠️</span>
                                                    <span>Evidence Requested by Subdivision Leader</span>
                                                </p>
                                                <p className="text-[10px] text-amber-700 font-medium">
                                                    Please upload your vaccination records, medical papers, or pet photos below so the officers can verify your claim.
                                                </p>
                                            </div>
                                        ) : (
                                            <button
                                                type="button"
                                                onClick={() => setShowUploadForm(!showUploadForm)}
                                                className="w-full py-3 px-4 bg-orange-50/70 hover:bg-orange-100/70 border border-orange-200 rounded-2xl text-xs font-black text-orange-700 uppercase tracking-wider flex items-center justify-between transition-all cursor-pointer"
                                            >
                                                <span className="flex items-center gap-2">
                                                    <span>📤</span>
                                                    <span>{showUploadForm ? 'Hide Proof Upload Form' : 'Upload / Add Proof of Ownership'}</span>
                                                </span>
                                                <span className="text-xs">{showUploadForm ? '▲' : '▼'}</span>
                                            </button>
                                        )}

                                        {(showUploadForm || existingClaim.status === 'Evidence Requested' || (!activeVaccineUrl && !activeVetUrl && !activeRegUrl)) && (
                                            <div className="space-y-4 pt-2 bg-gray-50/60 p-4 rounded-2xl border border-gray-200 animate-in fade-in duration-200">
                                                <div className="flex justify-between items-center pb-2 border-b border-gray-200">
                                                    <span className="text-[10px] font-black text-[#1a1208] uppercase tracking-wider">Upload Proof Documents</span>
                                                    <span className="text-[9px] font-bold text-gray-400 uppercase">Immediate Subdivision Sync</span>
                                                </div>
                                                <p className="text-[10px] text-gray-500 font-semibold leading-normal">
                                                    Attach files below. Once uploaded, they will be instantly visible to Subdivision Leaders and Barangay Staff.
                                                </p>

                                                {/* Vaccination Card */}
                                                <div className="space-y-1.5">
                                                    <label className="text-[9px] font-black text-gray-500 uppercase tracking-widest block">Vaccination Card</label>
                                                    <input
                                                        type="file"
                                                        accept={UPLOAD_ACCEPT.imageVideoDocument}
                                                        onChange={(e) => pickValidatedFile(e.target.files?.[0] || null, setVaccineCardFile, setVaccineCardName)}
                                                        className="w-full text-xs font-bold text-gray-500 file:mr-3 file:py-1.5 file:px-3 file:rounded-xl file:border-0 file:text-[9px] file:font-black file:uppercase file:tracking-widest file:bg-orange-50 file:text-[#F97316] hover:file:bg-orange-100 cursor-pointer"
                                                    />
                                                    {vaccineCardName && <p className="text-[9px] font-bold text-green-600 uppercase">Selected: {vaccineCardName}</p>}
                                                </div>

                                                {/* Vet Records */}
                                                <div className="space-y-1.5">
                                                    <label className="text-[9px] font-black text-gray-500 uppercase tracking-widest block">Veterinary Medical Records</label>
                                                    <input
                                                        type="file"
                                                        accept={UPLOAD_ACCEPT.imageVideoDocument}
                                                        onChange={(e) => pickValidatedFile(e.target.files?.[0] || null, setVetRecordFile, setVetRecordName)}
                                                        className="w-full text-xs font-bold text-gray-500 file:mr-3 file:py-1.5 file:px-3 file:rounded-xl file:border-0 file:text-[9px] file:font-black file:uppercase file:tracking-widest file:bg-orange-50 file:text-[#F97316] hover:file:bg-orange-100 cursor-pointer"
                                                    />
                                                    {vetRecordName && <p className="text-[9px] font-bold text-green-600 uppercase">Selected: {vetRecordName}</p>}
                                                </div>

                                                {/* Pet Registration Certificate */}
                                                <div className="space-y-1.5">
                                                    <label className="text-[9px] font-black text-gray-500 uppercase tracking-widest block">Pet Registration Record (Optional)</label>
                                                    <input
                                                        type="file"
                                                        accept={UPLOAD_ACCEPT.imageVideoDocument}
                                                        onChange={(e) => pickValidatedFile(e.target.files?.[0] || null, setPetRegRecordFile, setPetRegRecordName)}
                                                        className="w-full text-xs font-bold text-gray-500 file:mr-3 file:py-1.5 file:px-3 file:rounded-xl file:border-0 file:text-[9px] file:font-black file:uppercase file:tracking-widest file:bg-orange-50 file:text-[#F97316] hover:file:bg-orange-100 cursor-pointer"
                                                    />
                                                    {petRegRecordName && <p className="text-[9px] font-bold text-green-600 uppercase">Selected: {petRegRecordName}</p>}
                                                </div>

                                                {/* Additional Photos */}
                                                <div className="space-y-1.5">
                                                    <label className="text-[9px] font-black text-gray-500 uppercase tracking-widest block">Additional Pet Photos or Video</label>
                                                    <input
                                                        type="file"
                                                        multiple
                                                        accept={UPLOAD_ACCEPT.imageVideo}
                                                        onChange={(e) => {
                                                            const files = e.target.files;
                                                            const file = files?.[0] || null;
                                                            if (!file) {
                                                                setAdditionalPhotosFile(null);
                                                                setPrevPhotoName('');
                                                                return;
                                                            }
                                                            const result = validateFile(file);
                                                            if (!result.valid) {
                                                                alert(result.error);
                                                                return;
                                                            }
                                                            setAdditionalPhotosFile(file);
                                                            setPrevPhotoName(`${file.name}${files && files.length > 1 ? ` (+${files.length - 1} files)` : ''}`);
                                                        }}
                                                        className="w-full text-xs font-bold text-gray-500 file:mr-3 file:py-1.5 file:px-3 file:rounded-xl file:border-0 file:text-[9px] file:font-black file:uppercase file:tracking-widest file:bg-orange-50 file:text-[#F97316] hover:file:bg-orange-100 cursor-pointer"
                                                    />
                                                    {prevPhotoName && <p className="text-[9px] font-bold text-green-600 uppercase">Attached: {prevPhotoName}</p>}
                                                </div>

                                                {/* Distinctive markings */}
                                                <div className="space-y-1.5">
                                                    <label className="text-[9px] font-black text-gray-500 uppercase tracking-widest block">Distinctive Markings (Not visible in photos)</label>
                                                    <textarea
                                                        className="w-full bg-white border border-gray-200 rounded-xl p-3 text-xs font-semibold text-[#1a1208] placeholder:text-gray-400 focus:outline-none focus:border-orange-500 min-h-[60px] resize-none"
                                                        placeholder="Describe hidden markings (e.g. 'Left ear notch', 'White spot on belly')"
                                                        value={distinctiveMarkings}
                                                        onChange={(e) => setDistinctiveMarkings(e.target.value)}
                                                    />
                                                </div>

                                                {/* Notes */}
                                                <div className="space-y-1.5">
                                                    <label className="text-[9px] font-black text-gray-500 uppercase tracking-widest block">Additional notes / Remarks</label>
                                                    <textarea
                                                        className="w-full bg-white border border-gray-200 rounded-xl p-3 text-xs font-semibold text-[#1a1208] placeholder:text-gray-400 focus:outline-none focus:border-orange-500 min-h-[60px] resize-none"
                                                        placeholder="Add comments for Subdivision Leaders..."
                                                        value={remarks}
                                                        onChange={(e) => setRemarks(e.target.value)}
                                                    />
                                                </div>

                                                <Button
                                                    disabled={isSubmitting || !(vaccineCardName || vetRecordName || petRegRecordName || prevPhotoName || distinctiveMarkings.trim() || remarks.trim())}
                                                    className="w-full py-3.5 bg-[#F97316] hover:scale-[1.02] transition-all text-white text-xs font-black uppercase tracking-widest rounded-xl shadow-lg shadow-orange-100 cursor-pointer disabled:bg-gray-200 disabled:shadow-none"
                                                    onClick={handleUploadEvidence}
                                                >
                                                    {isSubmitting ? 'Uploading Proofs...' : 'Upload & Submit Proof Documents'}
                                                </Button>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        ) : ownerStatus === 'OWNER_REJECTED' ? null : (
                            // Claim Filing Form Flow
                            <div className="bg-white rounded-[2.5rem] border border-gray-100 shadow-xl p-6 sm:p-8 space-y-6">
                                <h3 className="text-lg font-black text-[#1a1208] uppercase tracking-tight">
                                    {!isMyPetConfirmed && ownerStatus !== 'OWNER_CONFIRMED' ? 'Is This Your Pet?' : 'Submit Pet Claim'}
                                </h3>

                                {!isMyPetConfirmed && ownerStatus !== 'OWNER_CONFIRMED' ? (
                                    // Step 1: Single Yes / No decision (each opens a confirmation dialog)
                                    <div className="space-y-6">
                                        <p className="text-xs font-semibold text-gray-500 leading-relaxed">
                                            The STRAY-SAFE AI matching system has detected a potential match with {petName(matchedPet) ? <strong>{petName(matchedPet)}</strong> : 'one of your registered pets'}. Is this your pet?
                                        </p>

                                        <div className="pt-2 space-y-3">
                                            <Button
                                                disabled={!matchedPet || isSubmitting}
                                                className="w-full py-4 bg-[#F97316] text-white text-xs font-black uppercase tracking-widest rounded-2xl shadow-lg shadow-orange-100 hover:scale-[1.02] transition-all cursor-pointer"
                                                onClick={() => setConfirmDialog('confirm')}
                                            >
                                                Yes, this is my pet
                                            </Button>
                                            <Button
                                                variant="ghost"
                                                disabled={isSubmitting}
                                                className="w-full py-4 border border-gray-200 text-[#1a1208] text-xs font-black uppercase tracking-widest rounded-2xl hover:bg-gray-50 cursor-pointer"
                                                onClick={() => setConfirmDialog('reject')}
                                            >
                                                No, not my pet
                                            </Button>
                                        </div>
                                    </div>
                                ) : (
                                    // Step 2: Proof of Ownership Submission & Review
                                    <div className="space-y-5 animate-in fade-in duration-300">
                                        {proofOnFile && (
                                            <div className="space-y-3">
                                                <label className="flex items-start gap-3 p-4 bg-emerald-50 border border-emerald-200 rounded-2xl cursor-pointer hover:bg-emerald-100/50 transition-colors">
                                                    <input
                                                        type="checkbox"
                                                        checked={reuseProofOnFile}
                                                        onChange={(e) => setReuseProofOnFile(e.target.checked)}
                                                        className="w-4 h-4 mt-0.5 rounded text-[#F97316] focus:ring-orange-500 cursor-pointer"
                                                    />
                                                    <div className="text-xs space-y-1">
                                                        <span className="font-black text-emerald-900 uppercase tracking-wider block">
                                                            ✓ Reuse proof of ownership on file
                                                        </span>
                                                        <span className="font-semibold text-emerald-800 leading-relaxed block">
                                                            You already submitted proof for this pet with your claim on Report #{proofOnFile.report_id}
                                                            {proofOnFile.submitted_at ? ` (${new Date(proofOnFile.submitted_at).toLocaleDateString()})` : ''}:{' '}
                                                            {(proofOnFile.documents || []).join(', ')}.
                                                        </span>
                                                    </div>
                                                </label>

                                                {/* Preview of proof on file across 4 categories */}
                                                {(() => {
                                                    const vaccineMediaUrl = proofOnFile.vaccine_card_url || proofOnFile.evidence_url;
                                                    const reusedPhotos: string[] = proofOnFile.additional_photos_url
                                                        ? (proofOnFile.additional_photos_url.includes(',')
                                                            ? proofOnFile.additional_photos_url.split(',').map((u: string) => u.trim()).filter(Boolean)
                                                            : [proofOnFile.additional_photos_url])
                                                        : [];
                                                    const isPdfDoc = (u?: string | null) => Boolean(u && u.toLowerCase().includes('.pdf'));

                                                    return (
                                                        <div className="bg-gradient-to-b from-gray-50 to-white rounded-2xl p-4 border border-gray-200/80 space-y-3.5 shadow-2xs">
                                                            <div className="flex items-center justify-between">
                                                                <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest flex items-center gap-1.5">
                                                                    <span>📁</span>
                                                                    <span>Documents on Record from Previous Claim</span>
                                                                </p>
                                                                <span className={`text-[9px] font-bold px-2.5 py-0.5 rounded-full border ${
                                                                    reuseProofOnFile
                                                                        ? 'text-emerald-700 bg-emerald-50 border-emerald-200'
                                                                        : 'text-gray-400 bg-gray-100 border-gray-200'
                                                                }`}>
                                                                    {reuseProofOnFile ? '✓ Reusing Proof (Viewing Enabled)' : 'Proof Reuse Off'}
                                                                </span>
                                                            </div>

                                                            {reuseProofOnFile ? (
                                                                <div className="space-y-3">
                                                                    {/* 1. Vaccination Records */}
                                                                    <div className="p-3 bg-white border border-gray-200 rounded-xl space-y-2">
                                                                        <div className="flex items-center justify-between">
                                                                            <p className="text-[9px] font-black text-gray-400 uppercase tracking-wider flex items-center gap-1">
                                                                                <span>💉</span>
                                                                                <span>Vaccination Records</span>
                                                                            </p>
                                                                            {vaccineMediaUrl ? (
                                                                                <span className="text-[9px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                                                                                    ✓ Vaccine Record On File
                                                                                </span>
                                                                            ) : (
                                                                                <span className="text-[9px] font-bold text-gray-400">None on file</span>
                                                                            )}
                                                                        </div>
                                                                        {vaccineMediaUrl && (
                                                                            <div className="flex items-center justify-between gap-3 p-2 bg-gray-50/80 border border-gray-200/70 rounded-lg">
                                                                                <div className="flex items-center gap-2.5 min-w-0">
                                                                                    {!isPdfDoc(vaccineMediaUrl) ? (
                                                                                        <div
                                                                                            onClick={() => setViewingImage({ url: vaccineMediaUrl, title: 'Vaccination Record on File', type: 'pet' })}
                                                                                            className="w-10 h-10 rounded-lg overflow-hidden border border-gray-200 shrink-0 bg-gray-100 cursor-pointer group relative"
                                                                                        >
                                                                                            <img src={vaccineMediaUrl} alt="Vaccination Card" className="w-full h-full object-cover group-hover:scale-105 transition-all" />
                                                                                            <div className="absolute inset-0 bg-black/25 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white text-[10px]">
                                                                                                🔍
                                                                                            </div>
                                                                                        </div>
                                                                                    ) : (
                                                                                        <div className="w-10 h-10 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center text-lg shrink-0">
                                                                                            📄
                                                                                        </div>
                                                                                    )}
                                                                                    <div className="min-w-0">
                                                                                        <p className="text-[10px] font-bold text-[#1a1208] truncate">
                                                                                            {vaccineMediaUrl.split('/').pop()?.replace(/^[0-9]+_/, '') || 'Vaccination Record'}
                                                                                        </p>
                                                                                        <p className="text-[8px] text-gray-400 font-bold uppercase">
                                                                                            {isPdfDoc(vaccineMediaUrl) ? 'PDF Document' : 'Vaccine Card Image'}
                                                                                        </p>
                                                                                    </div>
                                                                                </div>
                                                                                <div className="flex items-center gap-1.5 shrink-0">
                                                                                    <button
                                                                                        type="button"
                                                                                        onClick={() => setViewingImage({ url: vaccineMediaUrl, title: 'Vaccination Record on File', type: 'pet' })}
                                                                                        className="px-2.5 py-1 text-[9px] font-black text-white bg-[#F97316] hover:bg-orange-600 rounded-lg uppercase tracking-wider transition-all cursor-pointer shadow-2xs"
                                                                                    >
                                                                                        View
                                                                                    </button>
                                                                                    <a
                                                                                        href={vaccineMediaUrl}
                                                                                        target="_blank"
                                                                                        rel="noreferrer"
                                                                                        className="p-1 text-gray-400 hover:text-gray-600 cursor-pointer"
                                                                                        title="Open file in new tab"
                                                                                    >
                                                                                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                                                                                        </svg>
                                                                                    </a>
                                                                                </div>
                                                                            </div>
                                                                        )}
                                                                    </div>

                                                                    {/* 2. Previous Pet Photos */}
                                                                    <div className="p-3 bg-white border border-gray-200 rounded-xl space-y-2">
                                                                        <div className="flex items-center justify-between">
                                                                            <p className="text-[9px] font-black text-gray-400 uppercase tracking-wider flex items-center gap-1">
                                                                                <span>📷</span>
                                                                                <span>Previous Pet Photos</span>
                                                                            </p>
                                                                            {reusedPhotos.length > 0 ? (
                                                                                <span className="text-[9px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                                                                                    ✓ {reusedPhotos.length} Photo{reusedPhotos.length > 1 ? 's' : ''} On File
                                                                                </span>
                                                                            ) : (
                                                                                <span className="text-[9px] font-bold text-gray-400">None on file</span>
                                                                            )}
                                                                        </div>
                                                                        {reusedPhotos.length > 0 && (
                                                                            <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 pt-1">
                                                                                {reusedPhotos.map((photoUrl: string, idx: number) => (
                                                                                    <div
                                                                                        key={idx}
                                                                                        onClick={() => setViewingImage({ url: photoUrl, title: `Pet Photo ${idx + 1} on File`, type: 'pet' })}
                                                                                        className="relative aspect-square rounded-xl overflow-hidden border border-gray-200 bg-gray-100 cursor-pointer group hover:scale-[1.03] transition-all shadow-2xs"
                                                                                    >
                                                                                        <img
                                                                                            src={photoUrl}
                                                                                            alt={`Pet photo on file ${idx + 1}`}
                                                                                            className="w-full h-full object-cover group-hover:brightness-105 transition-all"
                                                                                        />
                                                                                        <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white text-[10px] font-bold">
                                                                                            🔍 View
                                                                                        </div>
                                                                                    </div>
                                                                                ))}
                                                                            </div>
                                                                        )}
                                                                    </div>

                                                                    {/* 3. Supporting Documents */}
                                                                    <div className="p-3 bg-white border border-gray-200 rounded-xl space-y-2">
                                                                        <div className="flex items-center justify-between">
                                                                            <p className="text-[9px] font-black text-gray-400 uppercase tracking-wider flex items-center gap-1">
                                                                                <span>📑</span>
                                                                                <span>Supporting Documents</span>
                                                                            </p>
                                                                            {(proofOnFile.vet_record_url || proofOnFile.registration_record_url) ? (
                                                                                <span className="text-[9px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                                                                                    ✓ Records On File
                                                                                </span>
                                                                            ) : (
                                                                                <span className="text-[9px] font-bold text-gray-400">None on file</span>
                                                                            )}
                                                                        </div>
                                                                        {(proofOnFile.vet_record_url || proofOnFile.registration_record_url) && (
                                                                            <div className="space-y-1.5 pt-1">
                                                                                {proofOnFile.vet_record_url && (
                                                                                    <div className="flex items-center justify-between gap-3 p-2 bg-gray-50/80 border border-gray-200/70 rounded-lg">
                                                                                        <div className="flex items-center gap-2.5 min-w-0">
                                                                                            <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-700 flex items-center justify-center text-sm shrink-0">
                                                                                                📋
                                                                                            </div>
                                                                                            <div className="min-w-0">
                                                                                                <p className="text-[10px] font-bold text-[#1a1208] truncate">
                                                                                                    {proofOnFile.vet_record_url.split('/').pop()?.replace(/^[0-9]+_/, '') || 'Veterinary Record'}
                                                                                                </p>
                                                                                                <p className="text-[8px] text-gray-400 font-bold uppercase">Vet Clinic Medical Record</p>
                                                                                            </div>
                                                                                        </div>
                                                                                        <div className="flex items-center gap-1.5 shrink-0">
                                                                                            <button
                                                                                                type="button"
                                                                                                onClick={() => setViewingImage({ url: proofOnFile.vet_record_url, title: 'Veterinary Record on File', type: 'pet' })}
                                                                                                className="px-2.5 py-1 text-[9px] font-black text-white bg-[#F97316] hover:bg-orange-600 rounded-lg uppercase tracking-wider transition-all cursor-pointer shadow-2xs"
                                                                                            >
                                                                                                View
                                                                                            </button>
                                                                                            <a
                                                                                                href={proofOnFile.vet_record_url}
                                                                                                target="_blank"
                                                                                                rel="noreferrer"
                                                                                                className="p-1 text-gray-400 hover:text-gray-600 cursor-pointer"
                                                                                                title="Open file in new tab"
                                                                                            >
                                                                                                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                                                                                                </svg>
                                                                                            </a>
                                                                                        </div>
                                                                                    </div>
                                                                                )}
                                                                                {proofOnFile.registration_record_url && (
                                                                                    <div className="flex items-center justify-between gap-3 p-2 bg-gray-50/80 border border-gray-200/70 rounded-lg">
                                                                                        <div className="flex items-center gap-2.5 min-w-0">
                                                                                            <div className="w-8 h-8 rounded-lg bg-purple-50 text-purple-700 flex items-center justify-center text-sm shrink-0">
                                                                                                📜
                                                                                            </div>
                                                                                            <div className="min-w-0">
                                                                                                <p className="text-[10px] font-bold text-[#1a1208] truncate">
                                                                                                    {proofOnFile.registration_record_url.split('/').pop()?.replace(/^[0-9]+_/, '') || 'Registration Certificate'}
                                                                                                </p>
                                                                                                <p className="text-[8px] text-gray-400 font-bold uppercase">Pet Registration Certificate</p>
                                                                                            </div>
                                                                                        </div>
                                                                                        <div className="flex items-center gap-1.5 shrink-0">
                                                                                            <button
                                                                                                type="button"
                                                                                                onClick={() => setViewingImage({ url: proofOnFile.registration_record_url, title: 'Registration Certificate on File', type: 'pet' })}
                                                                                                className="px-2.5 py-1 text-[9px] font-black text-white bg-[#F97316] hover:bg-orange-600 rounded-lg uppercase tracking-wider transition-all cursor-pointer shadow-2xs"
                                                                                            >
                                                                                                View
                                                                                            </button>
                                                                                            <a
                                                                                                href={proofOnFile.registration_record_url}
                                                                                                target="_blank"
                                                                                                rel="noreferrer"
                                                                                                className="p-1 text-gray-400 hover:text-gray-600 cursor-pointer"
                                                                                                title="Open file in new tab"
                                                                                            >
                                                                                                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                                                                                                </svg>
                                                                                            </a>
                                                                                        </div>
                                                                                    </div>
                                                                                )}
                                                                            </div>
                                                                        )}
                                                                    </div>

                                                                    {/* 4. Additional Notes */}
                                                                    <div className="p-3 bg-white border border-gray-200 rounded-xl space-y-2">
                                                                        <div className="flex items-center justify-between">
                                                                            <p className="text-[9px] font-black text-gray-400 uppercase tracking-wider flex items-center gap-1">
                                                                                <span>📝</span>
                                                                                <span>Additional Notes</span>
                                                                            </p>
                                                                            {(proofOnFile.distinctive_markings || proofOnFile.remarks) ? (
                                                                                <span className="text-[9px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                                                                                    ✓ Notes On File
                                                                                </span>
                                                                            ) : (
                                                                                <span className="text-[9px] font-bold text-gray-400">None on file</span>
                                                                            )}
                                                                        </div>
                                                                        {(proofOnFile.distinctive_markings || proofOnFile.remarks) && (
                                                                            <div className="p-2.5 bg-gray-50/80 border border-gray-200/70 rounded-lg space-y-1.5 text-xs">
                                                                                {proofOnFile.distinctive_markings && (
                                                                                    <div>
                                                                                        <span className="text-[9px] font-bold text-gray-400 uppercase block">Distinctive Markings</span>
                                                                                        <p className="font-semibold text-gray-800 text-[11px]">{proofOnFile.distinctive_markings}</p>
                                                                                    </div>
                                                                                )}
                                                                                {proofOnFile.remarks && (
                                                                                    <div>
                                                                                        <span className="text-[9px] font-bold text-gray-400 uppercase block">Remarks</span>
                                                                                        <p className="font-semibold text-gray-800 text-[11px]">{proofOnFile.remarks}</p>
                                                                                    </div>
                                                                                )}
                                                                            </div>
                                                                        )}
                                                                    </div>
                                                                </div>
                                                            ) : (
                                                                /* Compact summary when reuse is unselected */
                                                                <div className="grid grid-cols-2 gap-2 text-xs opacity-60">
                                                                    <div className="p-2.5 bg-white border border-gray-200 rounded-xl">
                                                                        <p className="text-[8px] font-black text-gray-400 uppercase tracking-wider">Vaccination Records</p>
                                                                        <p className="font-bold text-[#1a1208] truncate text-[10px]">
                                                                            {proofOnFile.vaccine_card_url || proofOnFile.evidence_url ? 'Vaccine Record On File (Skipped)' : 'None on file'}
                                                                        </p>
                                                                    </div>
                                                                    <div className="p-2.5 bg-white border border-gray-200 rounded-xl">
                                                                        <p className="text-[8px] font-black text-gray-400 uppercase tracking-wider">Previous Pet Photos</p>
                                                                        <p className="font-bold text-[#1a1208] truncate text-[10px]">
                                                                            {proofOnFile.additional_photos_url ? 'Photos On File (Skipped)' : 'None on file'}
                                                                        </p>
                                                                    </div>
                                                                    <div className="p-2.5 bg-white border border-gray-200 rounded-xl">
                                                                        <p className="text-[8px] font-black text-gray-400 uppercase tracking-wider">Supporting Documents</p>
                                                                        <p className="font-bold text-[#1a1208] truncate text-[10px]">
                                                                            {proofOnFile.vet_record_url || proofOnFile.registration_record_url ? 'Records On File (Skipped)' : 'None on file'}
                                                                        </p>
                                                                    </div>
                                                                    <div className="p-2.5 bg-white border border-gray-200 rounded-xl">
                                                                        <p className="text-[8px] font-black text-gray-400 uppercase tracking-wider">Additional Notes</p>
                                                                        <p className="font-bold text-[#1a1208] truncate text-[10px]">
                                                                            {proofOnFile.distinctive_markings || proofOnFile.remarks ? 'Notes On File (Skipped)' : 'None on file'}
                                                                        </p>
                                                                    </div>
                                                                </div>
                                                            )}
                                                        </div>
                                                    );
                                                })()}
                                            </div>
                                        )}

                                        {/* Upload form appears when unchecking proof reuse or when no proof is on record */}
                                        {(!proofOnFile || !reuseProofOnFile) && (
                                            <div className="space-y-4 pt-2 border-t border-gray-100 animate-in fade-in duration-200">
                                                <div className="flex justify-between items-center pb-2 border-b border-gray-100">
                                                    <span className="text-[10px] font-black text-orange-600 uppercase tracking-wider">
                                                        {proofOnFile ? 'Attach Additional Documents (Optional)' : 'Proof of Ownership Required'}
                                                    </span>
                                                </div>
                                                <p className="text-[10px] text-gray-400 font-bold leading-normal uppercase">
                                                    {proofOnFile
                                                        ? 'You may attach new or updated documents below, or proceed with your proof on file.'
                                                        : 'Please upload at least one proof of ownership (e.g., vaccine card, medical records, registration record, or photos) to enable claim submission.'}
                                                </p>

                                                {/* Vaccination Card */}
                                                <div className="space-y-2">
                                                    <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest block">Vaccination Card</label>
                                                    <input
                                                        type="file"
                                                        accept={UPLOAD_ACCEPT.imageVideoDocument}
                                                        onChange={(e) => pickValidatedFile(e.target.files?.[0] || null, setVaccineCardFile, setVaccineCardName)}
                                                        className="w-full text-xs font-bold text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-[9px] file:font-black file:uppercase file:tracking-widest file:bg-orange-50 file:text-[#F97316] hover:file:bg-orange-100 cursor-pointer"
                                                    />
                                                    {vaccineCardName && <p className="text-[9px] font-bold text-green-600 uppercase">Selected: {vaccineCardName}</p>}
                                                </div>

                                                {/* Vet Records */}
                                                <div className="space-y-2">
                                                    <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest block">Veterinary Medical Records</label>
                                                    <input
                                                        type="file"
                                                        accept={UPLOAD_ACCEPT.imageVideoDocument}
                                                        onChange={(e) => pickValidatedFile(e.target.files?.[0] || null, setVetRecordFile, setVetRecordName)}
                                                        className="w-full text-xs font-bold text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-[9px] file:font-black file:uppercase file:tracking-widest file:bg-orange-50 file:text-[#F97316] hover:file:bg-orange-100 cursor-pointer"
                                                    />
                                                    {vetRecordName && <p className="text-[9px] font-bold text-green-600 uppercase">Selected: {vetRecordName}</p>}
                                                </div>

                                                {/* Pet Registration Certificate */}
                                                <div className="space-y-2">
                                                    <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest block">Pet Registration Record (Optional)</label>
                                                    <input
                                                        type="file"
                                                        accept={UPLOAD_ACCEPT.imageVideoDocument}
                                                        onChange={(e) => pickValidatedFile(e.target.files?.[0] || null, setPetRegRecordFile, setPetRegRecordName)}
                                                        className="w-full text-xs font-bold text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-[9px] file:font-black file:uppercase file:tracking-widest file:bg-orange-50 file:text-[#F97316] hover:file:bg-orange-100 cursor-pointer"
                                                    />
                                                    {petRegRecordName && <p className="text-[9px] font-bold text-green-600 uppercase">Selected: {petRegRecordName}</p>}
                                                </div>

                                                {/* Additional Photos */}
                                                <div className="space-y-2">
                                                    <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest block">Additional Pet Photos or Video (Before going missing)</label>
                                                    <input
                                                        type="file"
                                                        multiple
                                                        accept={UPLOAD_ACCEPT.imageVideo}
                                                        onChange={(e) => {
                                                            const files = e.target.files;
                                                            const file = files?.[0] || null;
                                                            if (!file) {
                                                                setAdditionalPhotosFile(null);
                                                                setPrevPhotoName('');
                                                                return;
                                                            }
                                                            const result = validateFile(file);
                                                            if (!result.valid) {
                                                                alert(result.error);
                                                                return;
                                                            }
                                                            setAdditionalPhotosFile(file);
                                                            setPrevPhotoName(`${file.name}${files && files.length > 1 ? ` (+${files.length - 1} files)` : ''}`);
                                                        }}
                                                        className="w-full text-xs font-bold text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-[9px] file:font-black file:uppercase file:tracking-widest file:bg-orange-50 file:text-[#F97316] hover:file:bg-orange-100 cursor-pointer"
                                                    />
                                                    {prevPhotoName && <p className="text-[9px] font-bold text-green-600 uppercase">Attached: {prevPhotoName}</p>}
                                                </div>

                                                {/* Distinctive markings */}
                                                <div className="space-y-2">
                                                    <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest block">Distinctive Markings (Not visible in photos)</label>
                                                    <textarea
                                                        className="w-full bg-[#FAFAF9] border border-gray-100 rounded-2xl p-4 text-xs font-semibold text-[#1a1208] placeholder:text-gray-400 focus:outline-none focus:border-orange-500 min-h-[70px] resize-none"
                                                        placeholder="Describe hidden markings (e.g. 'Left ear notch', 'White spot on belly')"
                                                        value={distinctiveMarkings}
                                                        onChange={(e) => setDistinctiveMarkings(e.target.value)}
                                                    />
                                                </div>

                                                {/* Notes */}
                                                <div className="space-y-2">
                                                    <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest block">Additional notes / Remarks</label>
                                                    <textarea
                                                        className="w-full bg-[#FAFAF9] border border-gray-100 rounded-2xl p-4 text-xs font-semibold text-[#1a1208] placeholder:text-gray-400 focus:outline-none focus:border-orange-500 min-h-[70px] resize-none"
                                                        placeholder="Add comments for Subdivision Leaders..."
                                                        value={remarks}
                                                        onChange={(e) => setRemarks(e.target.value)}
                                                    />
                                                </div>
                                            </div>
                                        )}

                                        <div className="pt-2">
                                            <Button
                                                disabled={isSubmitting || (!reuseProofOnFile && !(vaccineCardName || vetRecordName || petRegRecordName || prevPhotoName))}
                                                className="w-full py-4 bg-[#F97316] text-white text-xs font-black uppercase tracking-widest rounded-2xl shadow-lg shadow-orange-100 hover:scale-[1.02] transition-all cursor-pointer disabled:bg-gray-200 disabled:shadow-none"
                                                onClick={() => handleSubmitClaim(reuseProofOnFile && proofOnFile ? proofOnFile.claim_id : undefined)}
                                            >
                                                {isSubmitting ? 'Uploading Proofs...' : reuseProofOnFile && proofOnFile ? 'Submit Claim with Proof on File' : 'Submit Claim File'}
                                            </Button>
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            </main>

            {/* Yes / No Confirmation Dialog */}
            {confirmDialog && (
                <div
                    className="fixed inset-0 z-[10000] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
                    onClick={() => !isSubmitting && setConfirmDialog(null)}
                >
                    <div
                        className="bg-white rounded-3xl max-w-md w-full p-6 sm:p-7 shadow-2xl space-y-5"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="flex items-start gap-3">
                            <div className={`w-11 h-11 rounded-2xl flex items-center justify-center text-lg font-black shrink-0 ${
                                confirmDialog === 'confirm' ? 'bg-orange-100 text-[#F97316]' : 'bg-red-100 text-red-600'
                            }`}>
                                {confirmDialog === 'confirm' ? '✓' : '✕'}
                            </div>
                            <div>
                                <h3 className="text-base font-black text-[#1a1208] uppercase tracking-tight">
                                    {confirmDialog === 'confirm'
                                        ? `Is this ${petName(matchedPet) || 'your pet'}?`
                                        : `Not ${petName(matchedPet) || 'your pet'}?`}
                                </h3>
                                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mt-0.5">
                                    Report #{report.report_id}
                                </p>
                            </div>
                        </div>

                        <div className={`p-3.5 rounded-2xl border text-xs font-semibold leading-relaxed ${
                            confirmDialog === 'confirm'
                                ? 'bg-orange-50 border-orange-200 text-orange-900'
                                : 'bg-red-50 border-red-200 text-red-900'
                        }`}>
                            {confirmDialog === 'confirm' ? (
                                <>
                                    You are confirming that the animal in this sighting is <strong>{petName(matchedPet) || 'your pet'}</strong>.
                                    Once a reviewing official also confirms, the sighting will be added to your pet's record.
                                    You can then submit proof of ownership to claim your pet.
                                </>
                            ) : (
                                <>
                                    You are confirming that this animal is <strong>not {petName(matchedPet) || 'your pet'}</strong>.
                                    The sighting will not be added to your pet's record and the subdivision office will be notified.
                                    This cannot be undone from your account.
                                </>
                            )}
                        </div>

                        <div className="space-y-2">
                            <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest block">
                                Note for the reviewing official (optional)
                            </label>
                            <textarea
                                value={decisionRemarks}
                                onChange={(e) => setDecisionRemarks(e.target.value)}
                                placeholder={confirmDialog === 'confirm'
                                    ? "e.g. 'He has a clipped left ear and answers to Max'"
                                    : "e.g. 'My pet is at home with me right now'"}
                                className="w-full bg-[#FAFAF9] border border-gray-100 rounded-2xl p-3 text-xs font-semibold text-[#1a1208] placeholder:text-gray-400 focus:outline-none focus:border-orange-500 min-h-[64px] resize-none"
                            />
                        </div>

                        <div className="flex gap-3">
                            <Button
                                variant="ghost"
                                disabled={isSubmitting}
                                className="flex-1 py-3 border border-gray-200 text-[#1a1208] text-xs font-black uppercase tracking-wider rounded-xl hover:bg-gray-50 cursor-pointer"
                                onClick={() => setConfirmDialog(null)}
                            >
                                Cancel
                            </Button>
                            <Button
                                disabled={isSubmitting}
                                className={`flex-1 py-3 text-white text-xs font-black uppercase tracking-wider rounded-xl cursor-pointer ${
                                    confirmDialog === 'confirm' ? 'bg-[#F97316] hover:bg-[#EA580C]' : 'bg-red-600 hover:bg-red-700'
                                }`}
                                onClick={confirmDialog === 'confirm' ? handleConfirmMatch : handleRejectMatch}
                            >
                                {isSubmitting
                                    ? 'Saving...'
                                    : confirmDialog === 'confirm' ? 'Yes, Confirm' : 'Yes, Not My Pet'}
                            </Button>
                        </div>
                    </div>
                </div>
            )}

            {/* Case Chat Drawer for Look-Alike Inquiries */}
            {isChatOpen && report && (() => {
                const score = typeof getSimilarityScore === 'function' ? parseInt(getSimilarityScore()) : 95;

                return (
                    <ReportChatDrawer
                        isOpen={isChatOpen}
                        onClose={() => setIsChatOpen(false)}
                        report={report}
                        currentUser={currentUser}
                        matchId={activeMatch?.match_id || reportMatchRecord?.match_id}
                        threadMode="match"
                        matchedPet={{
                            pet_id: matchedPet?.pet_id,
                            pet_name: matchedPet?.pet_name,
                            photo_url: matchedPet?.photo_url,
                            species: matchedPet?.pet_type || matchedPet?.species || "Dog",
                            breed: matchedPet?.breed || "Registered Breed",
                            color: [matchedPet?.primary_color, matchedPet?.secondary_color].filter(Boolean).join(' ') || matchedPet?.color || "Registered Color",
                            size: matchedPet?.size_category || matchedPet?.size || "Medium",
                            owner_name: currentUser?.name || 'You',
                            registered_address: matchedPet?.registered_address || 'Registered Resident',
                            similarity_score: score,
                            sighting_photo_url: report.media?.[0]?.file_url || report.media?.[0]?.media_url || report.media_url || report.photo_url || DEFAULT_PET_AVATAR,
                            sighting_species: report.animal_type || "Dog",
                            sighting_breed: report.animal_breed || report.breed || "Reported Breed",
                            sighting_color: report.animal_color || report.color || "Reported Color",
                            sighting_size: report.estimated_size || report.animal_size || "Medium",
                            sighting_landmark: report.landmark || "Subdivision Area",
                            sighting_description: report.description
                        }}
                    />
                );
            })()}

            {/* ── MINIMAL LIGHTBOX MODAL (MATCHING USER SCREENSHOT) ── */}
            {(viewingImage || isSideBySideModalOpen) && (
                <div 
                    className="fixed inset-0 z-[99999] bg-[#191512]/92 backdrop-blur-sm flex flex-col items-center justify-center p-4 sm:p-8 animate-in fade-in duration-200"
                    onClick={() => { setViewingImage(null); setIsSideBySideModalOpen(false); }}
                >
                    {/* Top Right Close Button */}
                    <button
                        type="button"
                        onClick={() => { setViewingImage(null); setIsSideBySideModalOpen(false); }}
                        className="fixed top-6 right-6 z-10 w-8 h-8 rounded-full bg-white/20 hover:bg-white/35 text-white flex items-center justify-center transition-all cursor-pointer shadow-lg"
                        title="Close"
                    >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>

                    {/* Center Image Container */}
                    <div 
                        className="relative flex flex-col items-center justify-center max-w-5xl max-h-[85vh] w-full h-full my-auto"
                        onClick={(e) => e.stopPropagation()}
                    >
                        {isSideBySideModalOpen ? (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 w-full max-h-[80vh] items-center justify-center">
                                <div className="flex flex-col items-center space-y-2">
                                    <span className="text-[11px] font-black text-[#F97316] uppercase tracking-wider bg-black/50 px-3 py-1 rounded-full border border-white/10">Reported Stray</span>
                                    <img
                                        src={report?.media?.[0]?.file_url}
                                        alt="Reported Stray"
                                        className="rounded-xl max-h-[72vh] max-w-full object-contain shadow-2xl"
                                    />
                                </div>
                                <div className="flex flex-col items-center space-y-2">
                                    <span className="text-[11px] font-black text-emerald-400 uppercase tracking-wider bg-black/50 px-3 py-1 rounded-full border border-white/10">Your Pet: {petName(matchedPet)}</span>
                                    <img
                                        src={getPetPicture(matchedPet?.photo_url)}
                                        alt={matchedPet?.pet_name}
                                        className="rounded-xl max-h-[72vh] max-w-full object-contain shadow-2xl"
                                        onError={(e) => { e.currentTarget.src = DEFAULT_PET_AVATAR; }}
                                    />
                                </div>
                            </div>
                        ) : viewingImage ? (
                            <div className="flex flex-col items-center justify-center max-h-[82vh] max-w-[88vw] space-y-3">
                                {viewingImage.title && (
                                    <div className="px-4 py-1.5 rounded-full bg-black/60 border border-white/20 text-white text-xs font-bold tracking-wide shadow-md">
                                        {viewingImage.title}
                                    </div>
                                )}
                                {viewingImage.url && viewingImage.url.toLowerCase().includes('.pdf') ? (
                                    <div className="bg-white rounded-3xl p-8 text-center max-w-md shadow-2xl space-y-4">
                                        <div className="w-16 h-16 mx-auto rounded-2xl bg-orange-50 text-orange-600 flex items-center justify-center text-3xl">
                                            📄
                                        </div>
                                        <div>
                                            <h4 className="text-base font-extrabold text-[#1a1208]">{viewingImage.title}</h4>
                                            <p className="text-xs font-semibold text-gray-500 mt-1">This document is in PDF format.</p>
                                        </div>
                                        <a
                                            href={viewingImage.url}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#F97316] hover:bg-orange-600 text-white font-black text-xs uppercase tracking-wider rounded-xl transition-all shadow-md cursor-pointer"
                                        >
                                            <span>Open / Download PDF Document</span>
                                            <span>↗</span>
                                        </a>
                                    </div>
                                ) : (
                                    <img
                                        src={viewingImage.url}
                                        alt={viewingImage.title}
                                        className="rounded-xl shadow-2xl max-h-[75vh] max-w-[85vw] object-contain"
                                    />
                                )}
                            </div>
                        ) : null}

                        {/* Bottom Center Orange Indicator Bar */}
                        <div className="mt-8 flex items-center justify-center">
                            <span className="w-6 h-1 bg-[#F97316] rounded-full inline-block"></span>
                        </div>
                    </div>
                </div>
            )}

            {/* ── MODAL: CONFIRM PET RECEIVED & UPLOAD REUNION PHOTO ── */}
            {isPetReceivedModalOpen && (
                <div className="fixed inset-0 z-[9999] flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-md animate-in fade-in duration-300">
                    <div className="bg-white rounded-3xl sm:rounded-[2.5rem] shadow-2xl w-full max-w-lg overflow-hidden animate-in zoom-in-95 duration-300 border border-emerald-100 flex flex-col">
                        {/* Header */}
                        <div className="px-6 sm:px-8 py-5 border-b border-gray-100 flex justify-between items-center bg-gradient-to-r from-emerald-50/90 to-emerald-100/40">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-2xl bg-emerald-600 text-white flex items-center justify-center shadow-md shadow-emerald-600/20">
                                    <PawPrint className="w-5 h-5" />
                                </div>
                                <div>
                                    <h3 className="text-base sm:text-lg font-black text-emerald-950 uppercase tracking-tight">
                                        Pet Already in Your Possession?
                                    </h3>
                                    <p className="text-[11px] text-emerald-800 font-semibold">
                                        Upload reunion proof to mark your pet as received
                                    </p>
                                </div>
                            </div>
                            <button
                                type="button"
                                onClick={() => setIsPetReceivedModalOpen(false)}
                                className="w-8 h-8 flex items-center justify-center text-gray-400 hover:text-gray-900 rounded-full hover:bg-white/80 transition-all cursor-pointer"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        {/* Form */}
                        <form onSubmit={handleSubmitPetReceived} className="p-6 sm:p-8 space-y-4 max-h-[80vh] overflow-y-auto">
                            <div className="p-3.5 rounded-2xl bg-emerald-50/70 border border-emerald-200/80 text-[11px] text-emerald-950 space-y-1">
                                <p className="font-black flex items-center gap-1.5">
                                    <Sparkles className="w-3.5 h-3.5 text-emerald-600" />
                                    <span>Safe Recovery & Handover Confirmation</span>
                                </p>
                                <p className="text-[10px] text-emerald-800 leading-relaxed">
                                    Confirm that your pet is back in your custody and safely home. Submitting a reunion photo provides official proof to subdivision officers and completes the case records.
                                </p>
                            </div>

                            {/* Reunion Photo Upload */}
                            <div className="space-y-1.5">
                                <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest block">
                                    Reunion Photo (Pet Safe with You or at Home) <span className="text-rose-500">*</span>
                                </label>

                                <div className="space-y-2">
                                    <label className="flex flex-col items-center justify-center p-5 border-2 border-dashed border-emerald-300 rounded-2xl hover:border-emerald-500 hover:bg-emerald-50/40 transition-all cursor-pointer bg-stone-50/60">
                                        <Camera className="w-8 h-8 text-emerald-600 mb-2" />
                                        <span className="text-xs font-black text-gray-800">
                                            {reunionPhotoFile ? reunionPhotoFile.name : 'Take or upload photo with pet'}
                                        </span>
                                        <span className="text-[10px] text-gray-400 mt-0.5">
                                            Clear photo showing pet safe in your possession (JPEG, PNG, WebP)
                                        </span>
                                        <input
                                            type="file"
                                            accept="image/*"
                                            capture="environment"
                                            onChange={handleReunionPhotoChange}
                                            className="hidden"
                                        />
                                    </label>

                                    {reunionPreviewUrl && (
                                        <div className="relative rounded-2xl overflow-hidden border-2 border-emerald-400 aspect-video max-h-48 bg-stone-900 flex items-center justify-center group">
                                            <img
                                                src={reunionPreviewUrl}
                                                alt="Reunion preview"
                                                className="w-full h-full object-contain"
                                            />
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    setReunionPhotoFile(null);
                                                    setReunionPreviewUrl(null);
                                                }}
                                                className="absolute top-2 right-2 p-1.5 bg-black/60 hover:bg-rose-600 text-white rounded-full transition-all cursor-pointer"
                                            >
                                                <X className="w-4 h-4" />
                                            </button>
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Remarks / Notes (Optional) */}
                            <div className="space-y-1.5">
                                <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest block">
                                    Notes for Officers (Optional)
                                </label>
                                <textarea
                                    rows={2}
                                    placeholder="e.g. Pet was safely retrieved and is resting happily at home. Thank you!"
                                    value={reunionNotes}
                                    onChange={(e) => setReunionNotes(e.target.value)}
                                    className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-2xl text-xs font-medium text-gray-900 focus:outline-none focus:border-emerald-500 resize-none"
                                />
                            </div>

                            {/* Actions */}
                            <div className="pt-2 flex items-center gap-3">
                                <button
                                    type="button"
                                    onClick={() => setIsPetReceivedModalOpen(false)}
                                    className="flex-1 py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-black uppercase tracking-wider rounded-xl transition-all cursor-pointer"
                                >
                                    Cancel
                                </button>
                                <Button
                                    type="submit"
                                    disabled={isSubmittingReunion || !reunionPhotoFile}
                                    className="flex-2 py-3 bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-300 text-white text-xs font-black uppercase tracking-wider rounded-xl shadow-md cursor-pointer flex items-center justify-center gap-2 border-0"
                                >
                                    {isSubmittingReunion ? (
                                        <>
                                            <Loader2 className="w-4 h-4 animate-spin" />
                                            <span>Submitting...</span>
                                        </>
                                    ) : (
                                        <>
                                            <CheckCircle2 className="w-4 h-4" />
                                            <span>Confirm & Mark Received</span>
                                        </>
                                    )}
                                </Button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* ── CELEBRATORY SUCCESS TOAST ALERT ── */}
            {reunionSuccessAlert && (
                <div className="fixed top-24 right-6 z-[9999] max-w-md bg-emerald-600 text-white p-5 rounded-3xl shadow-2xl animate-in slide-in-from-top-4 flex items-center gap-3">
                    <CheckCircle2 className="w-7 h-7 text-emerald-100 shrink-0" />
                    <div>
                        <p className="text-xs font-black uppercase tracking-wider">🎉 Pet Confirmed Received!</p>
                        <p className="text-[11px] text-emerald-100 font-medium">Your reunion proof has been recorded and officers have been notified. Your pet is officially marked as safe!</p>
                    </div>
                </div>
            )}
        </div>
    );
};

export default PetMatchReview;
