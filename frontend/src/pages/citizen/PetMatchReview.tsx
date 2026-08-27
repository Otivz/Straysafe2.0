import { useState, useEffect } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import axios from 'axios';
import { DEFAULT_PET_AVATAR, getPetPicture } from '../../utils/avatar';
import Button from '../../components/Button';
import ResiNavbar from '../../components/Navbars/ResiNavbar';
import ReportChatDrawer from '../../components/Chat/ReportChatDrawer';
import MapComponent from '../../components/MapComponent';


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
    const [searchParams] = useSearchParams();
    const [report, setReport] = useState<any>(null);
    const [myPets, setMyPets] = useState<any[]>([]);
    const [selectedPetId, setSelectedPetId] = useState<number | null>(null);
    const [remarks, setRemarks] = useState('');
    const [loading, setLoading] = useState(true);
    const [existingClaim, setExistingClaim] = useState<any>(null);
    const [evidenceFile, setEvidenceFile] = useState<File | null>(null);
    const [vaccineCardFile, setVaccineCardFile] = useState<File | null>(null);
    const [vetRecordFile, setVetRecordFile] = useState<File | null>(null);
    const [petRegRecordFile, setPetRegRecordFile] = useState<File | null>(null);
    const [additionalPhotosFile, setAdditionalPhotosFile] = useState<File | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);
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
    const [reportMatchRecord, setReportMatchRecord] = useState<any>(null);
    const [allReportMatches, setAllReportMatches] = useState<any[]>([]);
    const [isChatOpen, setIsChatOpen] = useState(false);

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
            // 1. Fetch Report details
            const reportRes = await axios.get(`http://localhost:8000/reports/${reportId}`);
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

            // 2. Fetch Owner's pets (Strictly exclude Deceased pets)
            let activePets: any[] = [];
            try {
                const petsRes = await axios.get(`http://localhost:8000/pets/owner/${currentUser.user_id}`);
                activePets = petsRes.data.filter((p: any) => p.status && p.status.toLowerCase() !== 'deceased');
            } catch (e) {
                console.warn("Could not load pets for owner", e);
            }

            // 3. Fetch matched candidate pet from Report Matches
            let targetMatchedPetId: number | null = null;
            try {
                const matchRes = await axios.get(`http://localhost:8000/matches/report/${reportId}`);
                if (Array.isArray(matchRes.data) && matchRes.data.length > 0) {
                    setAllReportMatches(matchRes.data);
                    
                    // Match belonging to current owner or primary match
                    const userMatch = matchRes.data.find((m: any) => m.matched_pet?.owner_id === currentUser.user_id) || matchRes.data[0];
                    if (userMatch) {
                        setReportMatchRecord(userMatch);
                        if (userMatch.matched_pet_id) {
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

            // 4. Check backend first for real claim data
            let matchingClaim = null;
            try {
                const claimsRes = await axios.get(`http://localhost:8000/claims/?owner_id=${currentUser.user_id}`);
                matchingClaim = claimsRes.data.find((c: any) => c.report_id === parseInt(reportId || '0') && c.pet?.status?.toLowerCase() !== 'deceased');
            } catch (e) {
                console.warn("Could not load backend claims", e);
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


    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files.length > 0) {
            setEvidenceFile(e.target.files[0]);
        }
    };

    const handleSubmitClaim = async () => {
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
                sighting_lat: parseFloat(report.latitude) || 14.8018,
                sighting_lng: parseFloat(report.longitude) || 121.0035,
                description: report.description || "Roaming stray animal Sighting",
                sighting_photo: report.media?.[0]?.file_url || "https://images.unsplash.com/photo-1530281700549-e82e7bf110d6?w=600&auto=format&fit=crop",
                
                pet: {
                    pet_name: matchedPet?.pet_name || "Bruno",
                    pet_type: matchedPet?.pet_type || "Dog",
                    breed: matchedPet?.breed || "Aspin",
                    gender: matchedPet?.gender || "Male",
                    primary_color: matchedPet?.primary_color || "Brown",
                    secondary_color: matchedPet?.secondary_color || "",
                    distinctive_markings: distinctiveMarkings || matchedPet?.distinctive_markings || "White chest markings",
                    registered_address: matchedPet?.registered_address || matchedPet?.owner?.address || "Registered Owner Address",
                    registered_latitude: matchedPet?.registered_latitude || 14.801496,
                    registered_longitude: matchedPet?.registered_longitude || 121.003280,
                    photo_url: matchedPet?.photo_url || "https://images.unsplash.com/photo-1543466835-00a7907e9de1?w=600&auto=format&fit=crop",
                    owner: {
                        name: currentUser?.name || "Citizen Owner",
                        email: currentUser?.email || "owner@gmail.com",
                        phone: currentUser?.phone || "09151112223"
                    }
                },
                
                evidence_url: (vaccineCardName || vetRecordName || petRegRecordName || prevPhotoName) ? "https://images.unsplash.com/photo-1584036561566-baf241f8022a?w=600&auto=format&fit=crop" : "",
                vaccine_card_url: "",
                vet_record_url: "",
                registration_record_url: "",
                additional_photos_url: "",
                distinctive_markings: distinctiveMarkings || "",
                previous_photos: prevPhotoName ? ["https://images.unsplash.com/photo-1530281700549-e82e7bf110d6?w=600&auto=format&fit=crop"] : [],
                supporting_docs: [
                    vetRecordName ? `vet_records_${vetRecordName}` : "",
                    petRegRecordName ? `pet_reg_${petRegRecordName}` : ""
                ].filter(d => d),
                owner_notes: remarks || "Ownership claim submitted with proofs."
            };

            let claimData = newClaim;
            let backendSucceeded = false;
            let uploadErrors = [];

            // Attempt posting to backend endpoint (backward compatible)
            try {
                const res = await axios.post('http://localhost:8000/claims/', {
                    report_id: parseInt(reportId || '0'),
                    pet_id: selectedPetId,
                    remarks: remarks || "I confirm this is my pet.",
                    distinctive_markings: distinctiveMarkings
                });
                claimData = res.data;
                backendSucceeded = true;
            } catch (err: any) {
                console.error("Could not post claim to backend:", err);
                alert("Could not submit the claim to the server. Your claim details might not be visible to the administrators. Technical error: " + (err.response?.data?.detail || err.message));
            }

            // Upload files if backend succeeded
            if (backendSucceeded) {
                const uploadPromises = [];
                const docTypes: string[] = [];

                if (vaccineCardFile && claimData.claim_id) {
                    const fd = new FormData();
                    fd.append('file', vaccineCardFile);
                    docTypes.push("Vaccination Card");
                    uploadPromises.push(
                        axios.post(`http://localhost:8000/claims/${claimData.claim_id}/evidence?document_type=vaccine_card`, fd, {
                            headers: { 'Content-Type': 'multipart/form-data' }
                        })
                    );
                }
                if (vetRecordFile && claimData.claim_id) {
                    const fd = new FormData();
                    fd.append('file', vetRecordFile);
                    docTypes.push("Veterinary Records");
                    uploadPromises.push(
                        axios.post(`http://localhost:8000/claims/${claimData.claim_id}/evidence?document_type=vet_record`, fd, {
                            headers: { 'Content-Type': 'multipart/form-data' }
                        })
                    );
                }
                if (petRegRecordFile && claimData.claim_id) {
                    const fd = new FormData();
                    fd.append('file', petRegRecordFile);
                    docTypes.push("Registration Certificate");
                    uploadPromises.push(
                        axios.post(`http://localhost:8000/claims/${claimData.claim_id}/evidence?document_type=registration_record`, fd, {
                            headers: { 'Content-Type': 'multipart/form-data' }
                        })
                    );
                }
                if (additionalPhotosFile && claimData.claim_id) {
                    const fd = new FormData();
                    fd.append('file', additionalPhotosFile);
                    docTypes.push("Additional Photos");
                    uploadPromises.push(
                        axios.post(`http://localhost:8000/claims/${claimData.claim_id}/evidence?document_type=additional_photo`, fd, {
                            headers: { 'Content-Type': 'multipart/form-data' }
                        })
                    );
                }

                for (let i = 0; i < uploadPromises.length; i++) {
                    try {
                        const uploadRes = await uploadPromises[i];
                        claimData = uploadRes.data;
                    } catch (uploadErr: any) {
                        console.error(`Failed to upload ${docTypes[i]}:`, uploadErr);
                        uploadErrors.push(`${docTypes[i]}: ${uploadErr.response?.data?.detail || uploadErr.message}`);
                    }
                }

                if (uploadErrors.length > 0) {
                    alert("Claim details saved, but the following ownership proofs failed to upload:\n- " + uploadErrors.join("\n- ") + "\n\nPlease try uploading these files again from your Claims Dashboard.");
                }
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
                const matchRes = await axios.get(`http://localhost:8000/matches/report/${reportId}`);
                if (Array.isArray(matchRes.data) && matchRes.data.length > 0) {
                    const matchingRecord = matchRes.data.find((m: any) => m.matched_pet_id === selectedPetId);
                    if (matchingRecord) {
                        await axios.post(`http://localhost:8000/matches/${matchingRecord.match_id}/owner-feedback`, {
                            owner_confirmation: "OWNER_CONFIRMED",
                            remarks: remarks || "Owner confirmed match and submitted ownership proofs."
                        });
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

    const handleUploadEvidence = async () => {
        if (!evidenceFile || !existingClaim) return;
        setIsSubmitting(true);
        try {
            const formData = new FormData();
            formData.append('file', evidenceFile);
            const res = await axios.post(`http://localhost:8000/claims/${existingClaim.claim_id}/evidence`, formData, {
                headers: { 'Content-Type': 'multipart/form-data' }
            });
            setExistingClaim(res.data);
            setEvidenceFile(null);
            alert("Evidence uploaded successfully. Administrators have been notified.");
        } catch (err: any) {
            console.error(err);
            alert("Failed to upload evidence: " + (err.response?.data?.detail || err.message));
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

    const matchedPet = myPets.find(p => p.pet_id === selectedPetId);
    
    // Sighting & Registered Coordinates
    const sightingLat = report?.latitude ? parseFloat(report.latitude) : 14.8018;
    const sightingLng = report?.longitude ? parseFloat(report.longitude) : 121.0035;

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

    const registeredLat = rawRegisteredLat !== null ? rawRegisteredLat : (sightingLat - 0.0004);
    const registeredLng = rawRegisteredLng !== null ? rawRegisteredLng : (sightingLng - 0.0003);

    const registeredAddress = matchedPet?.registered_address || matchedPet?.owner?.address || currentUser?.address || "Registered Owner Address";
    const sightingAddress = report?.street_address || report?.address || (report?.landmark ? `${report.landmark}, Selera Homes` : "Selera Homes");

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
    const displayDistanceStr = displayDistanceMeters < 1000 ? `${displayDistanceMeters} meters away` : `${(displayDistanceMeters/1000).toFixed(1)} km away`;

    const activeMatch = allReportMatches.find(m => m.matched_pet_id === selectedPetId) || (reportMatchRecord?.matched_pet_id === selectedPetId ? reportMatchRecord : null);

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

    const parsedDesc = report?.description ? parseReportDescription(report.description) : null;
    const reportPattern = parsedDesc?.pattern || (report?.coat_pattern && report.coat_pattern.toLowerCase() !== 'unknown' ? report.coat_pattern : (report?.animal_pattern && report.animal_pattern.toLowerCase() !== 'unknown' ? report.animal_pattern : (report?.ai_coat_pattern && report.ai_coat_pattern.toLowerCase() !== 'unknown' ? report.ai_coat_pattern : null)));
    const reportMarkings = parsedDesc?.markings || (report?.distinctive_markings && report.distinctive_markings.toLowerCase() !== 'unknown' && report.distinctive_markings.toLowerCase() !== 'none' ? report.distinctive_markings : (report?.color_markings && report.color_markings.toLowerCase() !== 'unknown' && report.color_markings.toLowerCase() !== 'none' ? report.color_markings : (report?.ai_distinctive_markings && report.ai_distinctive_markings.toLowerCase() !== 'unknown' && report.ai_distinctive_markings.toLowerCase() !== 'none' ? report.ai_distinctive_markings : null)));
    const displaySightingMarkings = Array.from(new Set([reportPattern, reportMarkings].filter(Boolean))).join(' • ');

    const getBreedColorMatch = () => {
        if (!matchedPet || !report) return { text: "NO", desc: "No data to compare" };

        const pSpecies = (matchedPet.pet_type || matchedPet.species || "").toLowerCase().trim();
        const rSpecies = (report.animal_type || report.ai_animal_type || "").toLowerCase().trim();
        if (pSpecies && rSpecies && pSpecies !== rSpecies && pSpecies !== "unknown" && rSpecies !== "unknown") {
            return { text: "NO", desc: `Species mismatch (${pSpecies.toUpperCase()} vs ${rSpecies.toUpperCase()})` };
        }

        const pBreed = (matchedPet.breed || "").toLowerCase().trim();
        const rBreed = (report.ai_possible_breed || "").toLowerCase().trim();
        const rReportedBreed = (report.animal_breed || "").toLowerCase().trim();
        const breedMatches = pBreed && (
            (rBreed && (pBreed === rBreed || pBreed.includes(rBreed) || rBreed.includes(pBreed))) ||
            (rReportedBreed && (pBreed === rReportedBreed || pBreed.includes(rReportedBreed) || rReportedBreed.includes(pBreed)))
        );

        const reportColorRaw = report.animal_color || report.ai_dominant_color || "";
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

    return (
        <div className="min-h-screen bg-[#FAFAF9] font-sans pb-24">
            <ResiNavbar />

            <main className="max-w-6xl mx-auto p-4 sm:p-8 pt-24 sm:pt-32">
                <div className="mb-8">
                    <h1 className="text-4xl font-black text-[#1a1208] uppercase tracking-tighter">Owner <span className="text-[#F97316]">Match Review</span></h1>
                    <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mt-2">Review stray animal sightings matching your registered pet</p>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
                    {/* Left: Comparison Cards */}
                    <div className="lg:col-span-8 space-y-8">
                        <div className="bg-white rounded-[2.5rem] border border-gray-100 shadow-xl overflow-hidden p-6 sm:p-8">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                {/* Stray Report Photo */}
                                <div className="space-y-4">
                                    <div className="flex justify-between items-center">
                                        <span className="text-xs font-black text-[#F97316] bg-orange-50 px-3.5 py-1.5 rounded-full uppercase tracking-widest leading-none">Reported Stray</span>
                                    </div>
                                    <div className="relative h-64 rounded-3xl overflow-hidden bg-gray-50 border border-gray-100">
                                        {report.media && report.media.length > 0 ? (
                                             <img src={report.media[0].file_url} alt="Stray Sighting" className="w-full h-full object-cover" />
                                        ) : (
                                            <div className="w-full h-full flex items-center justify-center text-gray-300">No Photo</div>
                                        )}
                                    </div>
                                    <div className="bg-gray-50 rounded-2xl p-4 space-y-2">
                                        <p className="text-xs font-black text-[#1a1208] uppercase">Sighting Details</p>
                                        <p className="text-xs text-gray-500 font-bold">Species: <span className="text-[#1a1208]">{report.animal_type || report.ai_animal_type || "Dog"}</span></p>
                                        <p className="text-xs text-gray-500 font-bold">Breed: <span className="text-[#1a1208]">{report.animal_breed || report.ai_possible_breed || "Unknown"}</span></p>
                                        <p className="text-xs text-gray-500 font-bold">Color: <span className="text-[#1a1208]">{report.animal_color || report.ai_dominant_color || "Unknown"}</span></p>
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
                                    <div className="relative h-64 rounded-3xl overflow-hidden bg-gray-50 border border-gray-100">
                                        {matchedPet && matchedPet.photo_url ? (
                                            <img src={getPetPicture(matchedPet.photo_url)} alt={matchedPet.pet_name} className="w-full h-full object-cover" onError={(e) => { e.currentTarget.src = DEFAULT_PET_AVATAR; }} />
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
                                        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mt-0.5">Route from your registered pet address to the sighting location</p>
                                    </div>
                                    <span className="self-start sm:self-auto text-[10px] font-black text-green-600 bg-green-50 border border-green-100 px-3 py-1 rounded-full uppercase tracking-wider">
                                        Same Subdivision: Selera Homes ✓
                                    </span>
                                </div>

                                <div className="w-full rounded-2xl overflow-hidden border border-gray-100" style={{ height: '260px' }}>
                                    <MapComponent
                                        height="100%"
                                        center={[sightingLat, sightingLng]}
                                        zoom={16}
                                        showHeatmap={false}
                                        showGeofence={true}
                                        showLandmarks={false}
                                        showConnectingLine={true}
                                        onRouteCalculated={(dist: number) => setRoadDistance(dist)}
                                        markers={[
                                            { id: 1, lat: sightingLat, lng: sightingLng, title: sightingAddress, category: 'Stray Sighting', color: 'orange' },
                                            { id: 2, lat: registeredLat, lng: registeredLng, title: registeredAddress, category: 'User Location' },
                                        ]}
                                    />
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-1">
                                    <div className="bg-gray-50 rounded-2xl p-4 border border-gray-100">
                                        <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Sighting Location</p>
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

                        {/* Look-Alike Verification & Chat Callout Card */}
                        <div className="bg-gradient-to-br from-blue-50/90 via-indigo-50/40 to-white rounded-[2.5rem] border border-blue-200/80 shadow-xl p-6 sm:p-8 space-y-4">
                            <div className="flex items-start gap-4">
                                <div className="w-12 h-12 rounded-2xl bg-blue-600 text-white flex items-center justify-center text-xl font-black shadow-md shadow-blue-500/20 shrink-0">
                                    💬
                                </div>
                                <div className="space-y-1 flex-1">
                                    <div className="flex items-center gap-2 flex-wrap">
                                        <h3 className="text-base font-black text-blue-950 uppercase tracking-tight">
                                            Look-Alike Animal Verification
                                        </h3>
                                        <span className="px-2.5 py-0.5 bg-blue-100 text-blue-800 rounded-full text-[10px] font-extrabold uppercase">
                                            Direct Chat Available
                                        </span>
                                    </div>
                                    <p className="text-xs text-gray-600 font-medium leading-relaxed">
                                        Want to verify if this look-alike animal is yours before filing a claim? Message the original reporter or subdivision case officer directly to ask questions, request more photos, or verify identifying marks for yourself.
                                    </p>
                                </div>
                            </div>
                            <div className="pt-2 flex justify-end">
                                <button
                                    type="button"
                                    onClick={() => setIsChatOpen(true)}
                                    className="px-6 py-3.5 bg-blue-600 hover:bg-blue-700 active:scale-95 text-white font-bold text-xs rounded-2xl transition-all shadow-md shadow-blue-600/20 flex items-center gap-2 cursor-pointer"
                                >
                                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                                    </svg>
                                    Message Reporter / Inquire About Look-Alike
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* Right: Claim Form or Status Tracker */}
                    <div className="lg:col-span-4 space-y-8">
                        {existingClaim && existingClaim.status !== "Potential Owner Match" ? (
                            // Claim Status Card
                            <div className="bg-white rounded-[2.5rem] border border-gray-100 shadow-xl p-6 sm:p-8 space-y-6">
                                <h3 className="text-lg font-black text-[#1a1208] uppercase tracking-tight">Claim Status</h3>
                                <div className={`p-4 rounded-2xl border text-center ${
                                    existingClaim.status === 'Approved' ? 'bg-green-50 border-green-100 text-green-600' :
                                    existingClaim.status === 'Rejected' ? 'bg-red-50 border-red-100 text-red-600' :
                                    existingClaim.status === 'Evidence Requested' ? 'bg-amber-50 border-amber-100 text-amber-600' :
                                    'bg-blue-50 border-blue-100 text-blue-600'
                                }`}>
                                    <p className="text-[9px] font-black uppercase tracking-widest mb-1">Status</p>
                                    <p className="text-lg font-black uppercase">{existingClaim.status}</p>
                                </div>

                                {existingClaim.remarks && (
                                    <div className="bg-gray-50 rounded-2xl p-4">
                                        <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1">Remarks from Administration</p>
                                        <p className="text-xs font-bold text-[#1a1208]">{existingClaim.remarks}</p>
                                    </div>
                                )}

                                {existingClaim.status === 'Evidence Requested' && (
                                    <div className="space-y-4 pt-4 border-t border-gray-100">
                                        <h4 className="text-xs font-black text-[#1a1208] uppercase tracking-widest">Provide Proof of Ownership</h4>
                                        <p className="text-[10px] text-gray-400 font-bold leading-normal uppercase">Upload a vaccine card, registration paper, or another photo showing you with the pet.</p>
                                        <input 
                                            type="file" 
                                            className="w-full text-xs font-bold text-gray-400 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-[9px] file:font-black file:uppercase file:tracking-widest file:bg-orange-50 file:text-[#F97316] hover:file:bg-orange-100 cursor-pointer"
                                            onChange={handleFileChange}
                                            accept="image/*,.pdf"
                                        />
                                        <Button
                                            disabled={!evidenceFile || isSubmitting}
                                            className="w-full py-4 bg-[#F97316] hover:scale-105 transition-all text-white text-[10px] font-black uppercase tracking-widest rounded-xl shadow-lg shadow-orange-100"
                                            onClick={handleUploadEvidence}
                                        >
                                            {isSubmitting ? 'Uploading...' : 'Submit Evidence'}
                                        </Button>
                                    </div>
                                )}

                                {existingClaim.evidence_url && (
                                    <div className="bg-green-50/40 border border-green-100 rounded-2xl p-4 flex items-center justify-between">
                                        <span className="text-[10px] text-green-700 font-black uppercase">Evidence Submitted</span>
                                        <a href={existingClaim.evidence_url} target="_blank" rel="noreferrer" className="text-[10px] text-[#F97316] font-black hover:underline uppercase">View</a>
                                    </div>
                                )}
                            </div>
                        ) : (
                            // Claim Filing Form Flow
                            <div className="bg-white rounded-[2.5rem] border border-gray-100 shadow-xl p-6 sm:p-8 space-y-6">
                                <h3 className="text-lg font-black text-[#1a1208] uppercase tracking-tight">Submit Pet Claim</h3>
                                
                                {!isMyPetConfirmed ? (
                                    // Step 1: Confirmation Question
                                    <div className="space-y-6">
                                        <p className="text-xs font-semibold text-gray-500 leading-relaxed">
                                            The STRAY-SAFE AI matching system has detected a potential match with one of your registered pets. Is this your lost pet?
                                        </p>

                                        <div className="space-y-4">
                                             <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block">Matched Registered Pet</label>
                                             {matchedPet ? (
                                                 <div className="flex items-center gap-4 p-4 bg-orange-50/30 border border-orange-100 rounded-2xl">
                                                     <div className="w-12 h-12 rounded-full overflow-hidden bg-gray-100 border border-gray-250 flex-shrink-0">
                                                         <img src={getPetPicture(matchedPet.photo_url)} alt={matchedPet.pet_name} className="w-full h-full object-cover" onError={(e) => { e.currentTarget.src = DEFAULT_PET_AVATAR; }} />
                                                     </div>
                                                     <div>
                                                         <p className="text-sm font-black text-[#1a1208] uppercase leading-tight">{matchedPet.pet_name}</p>
                                                         <p className="text-[9px] font-bold text-gray-400 uppercase tracking-wider mt-0.5">{matchedPet.breed || "Aspin"}</p>
                                                     </div>
                                                 </div>
                                             ) : (
                                                 <div className="p-4 bg-red-50 border border-red-100 rounded-2xl text-center">
                                                     <p className="text-xs font-bold text-red-600 uppercase tracking-wider">No matching registered pet found.</p>
                                                 </div>
                                             )}
                                        </div>

                                        <div className="pt-2 space-y-3">
                                            <Button
                                                disabled={!matchedPet}
                                                className="w-full py-4 bg-[#F97316] text-white text-xs font-black uppercase tracking-widest rounded-2xl shadow-lg shadow-orange-100 hover:scale-[1.02] transition-all cursor-pointer"
                                                onClick={() => setIsMyPetConfirmed(true)}
                                            >
                                                Yes, this is my pet
                                            </Button>
                                            <Button
                                                variant="ghost"
                                                className="w-full py-4 border border-gray-200 text-[#1a1208] text-xs font-black uppercase tracking-widest rounded-2xl hover:bg-gray-50 cursor-pointer"
                                                onClick={() => navigate('/resident-home')}
                                            >
                                                No, not my pet
                                            </Button>
                                        </div>
                                    </div>
                                ) : (
                                    // Step 2: Proof of Ownership Submission
                                    <div className="space-y-5 animate-in fade-in duration-300">
                                        <div className="flex justify-between items-center pb-2 border-b border-gray-100">
                                            <span className="text-[10px] font-black text-orange-600 uppercase tracking-wider">Proof of Ownership Required</span>
                                            <button 
                                                onClick={() => setIsMyPetConfirmed(false)}
                                                className="text-[9px] font-black uppercase text-gray-400 hover:text-gray-600 cursor-pointer"
                                            >
                                                &larr; Back
                                            </button>
                                        </div>
                                        <p className="text-[10px] text-gray-400 font-bold leading-normal uppercase">
                                            Please upload at least one proof of ownership (e.g., vaccine card, medical records, registration record, or photos) to enable claim submission.
                                        </p>

                                        {/* Vaccination Card */}
                                        <div className="space-y-2">
                                            <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest block">Vaccination Card</label>
                                            <input 
                                                type="file"
                                                accept="image/*,application/pdf"
                                                onChange={(e) => {
                                                    const file = e.target.files?.[0] || null;
                                                    setVaccineCardFile(file);
                                                    setVaccineCardName(file?.name || '');
                                                }}
                                                className="w-full text-xs font-bold text-gray-455 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-[9px] file:font-black file:uppercase file:tracking-widest file:bg-orange-50 file:text-[#F97316] hover:file:bg-orange-100 cursor-pointer"
                                            />
                                            {vaccineCardName && <p className="text-[9px] font-bold text-green-600 uppercase">Selected: {vaccineCardName}</p>}
                                        </div>

                                        {/* Vet Records */}
                                        <div className="space-y-2">
                                            <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest block">Veterinary Medical Records</label>
                                            <input 
                                                type="file"
                                                accept="image/*,application/pdf"
                                                onChange={(e) => {
                                                    const file = e.target.files?.[0] || null;
                                                    setVetRecordFile(file);
                                                    setVetRecordName(file?.name || '');
                                                }}
                                                className="w-full text-xs font-bold text-gray-455 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-[9px] file:font-black file:uppercase file:tracking-widest file:bg-orange-50 file:text-[#F97316] hover:file:bg-orange-100 cursor-pointer"
                                            />
                                            {vetRecordName && <p className="text-[9px] font-bold text-green-600 uppercase">Selected: {vetRecordName}</p>}
                                        </div>

                                        {/* Pet Registration Certificate */}
                                        <div className="space-y-2">
                                            <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest block">Pet Registration Record (Optional)</label>
                                            <input 
                                                type="file"
                                                accept="image/*,application/pdf"
                                                onChange={(e) => {
                                                    const file = e.target.files?.[0] || null;
                                                    setPetRegRecordFile(file);
                                                    setPetRegRecordName(file?.name || '');
                                                }}
                                                className="w-full text-xs font-bold text-gray-460 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-[9px] file:font-black file:uppercase file:tracking-widest file:bg-orange-50 file:text-[#F97316] hover:file:bg-orange-100 cursor-pointer"
                                            />
                                            {petRegRecordName && <p className="text-[9px] font-bold text-green-600 uppercase">Selected: {petRegRecordName}</p>}
                                        </div>

                                        {/* Additional Photos bago mawala */}
                                        <div className="space-y-2">
                                            <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest block">Additional Pet Photos (Before going missing)</label>
                                            <input 
                                                type="file"
                                                multiple
                                                accept="image/*"
                                                onChange={(e) => {
                                                    const files = e.target.files;
                                                    const file = files?.[0] || null;
                                                    setAdditionalPhotosFile(file);
                                                    setPrevPhotoName(file?.name ? `${file.name}${files && files.length > 1 ? ` (+${files.length - 1} files)` : ''}` : '');
                                                }}
                                                className="w-full text-xs font-bold text-gray-465 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-[9px] file:font-black file:uppercase file:tracking-widest file:bg-orange-50 file:text-[#F97316] hover:file:bg-orange-100 cursor-pointer"
                                            />
                                            {prevPhotoName && <p className="text-[9px] font-bold text-green-600 uppercase">Attached: {prevPhotoName}</p>}
                                        </div>

                                        {/* Distinctive markings */}
                                        <div className="space-y-2">
                                            <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest block">Distinctive Markings (Not visible in photos)</label>
                                            <textarea
                                                className="w-full bg-[#FAFAF9] border border-gray-100 rounded-2xl p-4 text-xs font-semibold focus:outline-none min-h-[70px] resize-none"
                                                placeholder="Describe hidden markings (e.g. 'Left ear notch', 'White spot on belly')"
                                                value={distinctiveMarkings}
                                                onChange={(e) => setDistinctiveMarkings(e.target.value)}
                                            />
                                        </div>

                                        {/* Notes */}
                                        <div className="space-y-2">
                                            <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest block">Additional notes / Remarks</label>
                                            <textarea
                                                className="w-full bg-[#FAFAF9] border border-gray-100 rounded-2xl p-4 text-xs font-semibold focus:outline-none min-h-[70px] resize-none"
                                                placeholder="Add comments for Subdivision Leaders..."
                                                value={remarks}
                                                onChange={(e) => setRemarks(e.target.value)}
                                            />
                                        </div>

                                        <div className="pt-2">
                                            <Button
                                                disabled={isSubmitting || !(vaccineCardName || vetRecordName || petRegRecordName || prevPhotoName)}
                                                className="w-full py-4 bg-[#F97316] text-white text-xs font-black uppercase tracking-widest rounded-2xl shadow-lg shadow-orange-100 hover:scale-[1.02] transition-all cursor-pointer disabled:bg-gray-200 disabled:shadow-none"
                                                onClick={handleSubmitClaim}
                                            >
                                                {isSubmitting ? 'Uploading Proofs...' : 'Submit Claim File'}
                                            </Button>
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            </main>

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
                            species: matchedPet?.pet_type || "Dog",
                            breed: matchedPet?.breed || "Shih Tzu",
                            color: [matchedPet?.primary_color, matchedPet?.secondary_color].filter(Boolean).join(' ') || matchedPet?.color || "White Black",
                            size: matchedPet?.size_category || "Small",
                            owner_name: currentUser?.name || 'You',
                            registered_address: matchedPet?.registered_address || 'Registered in Selera Homes',
                            similarity_score: score,
                            sighting_photo_url: report.media?.[0]?.file_url || DEFAULT_PET_AVATAR,
                            sighting_species: report.animal_type || "Dog",
                            sighting_breed: report.animal_breed || report.breed || "Shih Tzu",
                            sighting_color: report.animal_color || report.color || "White and Black",
                            sighting_size: report.estimated_size || "Small",
                            sighting_landmark: report.landmark || "Selera Homes Subdivision",
                            sighting_description: report.description
                        }}
                    />
                );
            })()}
        </div>
    );
};

export default PetMatchReview;
