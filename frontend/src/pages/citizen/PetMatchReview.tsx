import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { DEFAULT_PET_AVATAR, getPetPicture } from '../../utils/avatar';
import Button from '../../components/Button';
import ResiNavbar from '../../components/Navbars/ResiNavbar';


const PetMatchReview = () => {
    const { reportId } = useParams();
    const navigate = useNavigate();
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

    // Confirmation & Proof upload states
    const [isMyPetConfirmed, setIsMyPetConfirmed] = useState(false);
    const [prevPhotoName, setPrevPhotoName] = useState<string>('');
    const [vaccineCardName, setVaccineCardName] = useState<string>('');
    const [vetRecordName, setVetRecordName] = useState<string>('');
    const [petRegRecordName, setPetRegRecordName] = useState<string>('');
    const [distinctiveMarkings, setDistinctiveMarkings] = useState('');

    const userStr = localStorage.getItem('resident_user');
    const currentUser = userStr ? JSON.parse(userStr) : null;

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
            const petsRes = await axios.get(`http://localhost:8000/pets/owner/${currentUser.user_id}`);
            const activePets = petsRes.data.filter((p: any) => p.status && p.status.toLowerCase() !== 'deceased');
            setMyPets(activePets);
            if (activePets.length > 0) {
                setSelectedPetId(activePets[0].pet_id);
            }

            // 3. Check backend first for real claim data
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
                similarity_score: 91.5,
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
    
    // Proximity logic
    let distanceStr = "Unknown distance";
    const currentLat = petLat !== null ? petLat : (
        matchedPet?.registered_latitude ? parseFloat(matchedPet.registered_latitude) : (
            currentUser?.latitude ? parseFloat(currentUser.latitude) : null
        )
    );
    const currentLng = petLng !== null ? petLng : (
        matchedPet?.registered_longitude ? parseFloat(matchedPet.registered_longitude) : (
            currentUser?.longitude ? parseFloat(currentUser.longitude) : null
        )
    );

    if (matchedPet && report.latitude && report.longitude && currentLat !== null && currentLng !== null) {
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
        const meters = calculateHaversine(
            parseFloat(report.latitude), parseFloat(report.longitude),
            currentLat, currentLng
        );
        distanceStr = meters < 1000 ? `${meters.toFixed(0)} meters away` : `${(meters/1000).toFixed(1)} km away`;
    }

    const getSimilarityScore = () => {
        if (existingClaim && existingClaim.remarks) {
            const match = existingClaim.remarks.match(/AI detected a (\d+)% potential match/i);
            if (match) {
                return `${match[1]}%`;
            }
        }
        return "N/A";
    };

    const getSimilarityLabel = () => {
        if (existingClaim && existingClaim.remarks) {
            const match = existingClaim.remarks.match(/AI detected a (\d+)% potential match/i);
            if (match) {
                const score = parseInt(match[1]);
                if (score >= 75) return "High Probability Sighting";
                if (score >= 60) return "Medium Probability Sighting";
                return "Low Probability Sighting";
            }
        }
        return "Potential Sighting";
    };

    const getAiExplanation = () => {
        if (existingClaim && existingClaim.remarks) {
            const parts = existingClaim.remarks.split(/AI detected a \d+% potential match\.\s*/i);
            if (parts.length > 1 && parts[1]) {
                return parts[1];
            }
            return existingClaim.remarks;
        }
        return "";
    };

    const getBreedColorMatch = () => {
        if (!matchedPet || !report) return { text: "NO", desc: "No data to compare" };
        const pBreed = (matchedPet.breed || "").toLowerCase().trim();
        const rBreed = (report.ai_possible_breed || "").toLowerCase().trim();
        const rReportedBreed = (report.animal_breed || "").toLowerCase().trim();
        const breedMatches = pBreed && (
            (rBreed && (pBreed === rBreed || pBreed.includes(rBreed) || rBreed.includes(pBreed))) ||
            (rReportedBreed && (pBreed === rReportedBreed || pBreed.includes(rReportedBreed) || rReportedBreed.includes(pBreed)))
        );

        const reportColorRaw = report.animal_color || report.ai_dominant_color || "";
        const rColors = reportColorRaw.toLowerCase().split(/,| and |\/|\s+/).map((c: string) => c.trim()).filter(Boolean);
        const pMarkings = (matchedPet.color_markings || "").toLowerCase();
        const pPrimary = (matchedPet.primary_color || "").toLowerCase().trim();
        const pSecondary = (matchedPet.secondary_color || "").toLowerCase().trim();
        const primaryMatches = pPrimary && rColors.includes(pPrimary);
        const secondaryMatches = pSecondary && rColors.includes(pSecondary);
        const markingsMatches = rColors.some((c: string) => c && pMarkings.includes(c));
        const colorMatches = primaryMatches || secondaryMatches || markingsMatches;

        if (breedMatches && colorMatches) {
            return { text: "YES", desc: "Breed & color match" };
        } else if (breedMatches) {
            return { text: "PARTIAL", desc: "Breed matches" };
        } else if (colorMatches) {
            return { text: "PARTIAL", desc: "Color matches" };
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
                                        <p className="text-xs text-gray-500 font-bold">Location: <span className="text-[#1a1208]">{report.street_address || report.address || (report.landmark ? `${report.landmark}, Selera Homes` : "Selera Homes")}</span></p>
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
                                        <p className="text-xs text-gray-500 font-bold">Breed: <span className="text-[#1a1208]">{matchedPet?.breed || "Select a pet"}</span></p>
                                        <p className="text-xs text-gray-500 font-bold">Color: <span className="text-[#1a1208]">{matchedPet ? ([matchedPet.primary_color, matchedPet.secondary_color, matchedPet.third_color].filter(Boolean).join(" and ") || "Unknown") : "Select a pet"}</span></p>
                                        {matchedPet && (
                                            <p className="text-xs text-gray-500 font-bold">Address: <span className="text-[#1a1208]">{matchedPet.registered_address || matchedPet.owner?.address || currentUser?.address || "Not Specified"}</span></p>
                                        )}
                                    </div>

                                </div>
                            </div>
                        </div>

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
                                        <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1">Location Proximity</p>
                                        <p className="text-2xl font-black text-[#1a1208]">{distanceStr}</p>
                                        <p className="text-[9px] font-bold text-gray-400 uppercase mt-1">Within Geofenced Area</p>
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
        </div>
    );
};

export default PetMatchReview;
