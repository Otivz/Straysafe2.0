import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '../../utils/api';
import { getPetPicture } from '../../utils/avatar';
import { ArrowLeft, Heart, Shield, Phone, MapPin, AlertCircle, CheckCircle2, Upload, CreditCard } from 'lucide-react';
import ResiNavbar from '../../components/Navbars/ResiNavbar';
import ResiMobileNav from '../../components/Navbars/ResiMobileNav';

interface AnimalDetail {
    holding_id: number;
    animal_name: string | null;
    animal_type: string | null;
    breed: string | null;
    color: string | null;
    estimated_size: string | null;
    photos: string[];
    facility_name: string | null;
    managing_unit: string | null;
}

const AdoptionApplyForm = () => {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();

    const [isNavbarMenuOpen, setIsNavbarMenuOpen] = useState(false);
    const [isMobileSearchOpen, setIsMobileSearchOpen] = useState(false);

    const handleBack = () => {
        if (window.history.length > 2) {
            navigate(-1);
        } else {
            navigate('/adopt');
        }
    };

    const [animal, setAnimal] = useState<AnimalDetail | null>(null);
    const [loadingAnimal, setLoadingAnimal] = useState(true);

    // Form fields
    const rawUser = localStorage.getItem('resident_user') || sessionStorage.getItem('resident_user');
    const user = rawUser ? JSON.parse(rawUser) : null;

    const [fullName, setFullName] = useState(user?.name || '');
    const [address, setAddress] = useState(user?.address || '');
    const [contactNo, setContactNo] = useState(user?.phone || '');
    const [hasOtherPets, setHasOtherPets] = useState(false);
    const [livingSpace, setLivingSpace] = useState('House with yard');
    const [reason, setReason] = useState('');

    // Government ID fields
    const [idType, setIdType] = useState('PhilSys National ID');
    const [idNumber, setIdNumber] = useState('');
    const [idPhotoUrl, setIdPhotoUrl] = useState<string | null>(null);
    const [uploadingId, setUploadingId] = useState(false);

    // Auto-detected registered pets
    const [registeredPets, setRegisteredPets] = useState<any[]>([]);

    const [submitting, setSubmitting] = useState(false);
    const [formError, setFormError] = useState<string | null>(null);
    const [successMessage, setSuccessMessage] = useState<string | null>(null);

    useEffect(() => {
        const checkRegisteredPets = async () => {
            const uid = user?.user_id || user?.id;
            if (!uid) return;
            try {
                const res = await api.get(`/pets/owner/${uid}`);
                const list = Array.isArray(res.data) ? res.data : [];
                const activePets = list.filter(
                    (p: any) => !['archived', 'inactive'].includes((p.status || '').toLowerCase())
                );
                setRegisteredPets(activePets);
                if (activePets.length > 0) {
                    setHasOtherPets(true);
                }
            } catch (err) {
                console.error("Failed to check registered pets for user:", err);
            }
        };

        checkRegisteredPets();
    }, [user?.user_id, user?.id]);

    useEffect(() => {
        const fetchAnimal = async () => {
            if (!id) return;
            setLoadingAnimal(true);
            try {
                const res = await api.get(`/adoptions/catalog/${id}`);
                setAnimal(res.data);
            } catch (err: any) {
                console.error("Failed to load animal for application", err);
                setFormError("Could not retrieve pet details. It may no longer be available for adoption.");
            } finally {
                setLoadingAnimal(false);
            }
        };

        fetchAnimal();
    }, [id]);

    const handleIdFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        if (file.size > 5 * 1024 * 1024) {
            setFormError("ID photo file size must be less than 5MB.");
            return;
        }

        const formData = new FormData();
        formData.append('file', file);
        setUploadingId(true);
        setFormError(null);

        try {
            const res = await api.post('/adoptions/upload-id', formData, {
                headers: { 'Content-Type': 'multipart/form-data' }
            });
            setIdPhotoUrl(res.data.url);
        } catch (err: any) {
            console.error("ID upload error", err);
            setFormError(err.response?.data?.detail || "Failed to upload ID photo. Please try again.");
        } finally {
            setUploadingId(false);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setFormError(null);

        if (!fullName.trim() || !address.trim() || !contactNo.trim()) {
            setFormError("Please fill in your complete contact details.");
            return;
        }

        if (!idNumber.trim()) {
            setFormError("Please provide your valid ID number.");
            return;
        }

        if (!idPhotoUrl) {
            setFormError("Please upload a clear photo or scan of your valid Government ID.");
            return;
        }

        if (reason.trim().length < 20) {
            setFormError("Please provide a more thorough reason for adoption (at least 20 characters).");
            return;
        }

        setSubmitting(true);
        try {
            await api.post('/adoptions/apply', {
                holding_id: Number(id),
                full_name: fullName.trim(),
                address: address.trim(),
                contact_no: contactNo.trim(),
                has_other_pets: hasOtherPets,
                living_space: livingSpace,
                reason: reason.trim(),
                id_type: idType,
                id_number: idNumber.trim(),
                id_photo_url: idPhotoUrl,
            });

            setSuccessMessage("Application submitted successfully! Redirecting to your applications...");
            setTimeout(() => {
                navigate('/adopt/applications');
            }, 2000);
        } catch (err: any) {
            console.error("Adoption apply error", err);
            setFormError(err.response?.data?.detail || "Failed to submit application. Please try again.");
            setSubmitting(false);
        }
    };

    return (
        <div className="min-h-screen bg-[#FBFBF9] dark:bg-[#0B0F19] text-[#1E293B] dark:text-[#F8FAFC] font-sans pb-16">
            {/* Main Website Navbar */}
            <ResiNavbar
                onMenuToggle={(isOpen) => setIsNavbarMenuOpen(isOpen)}
                isMobileSearchOpen={isMobileSearchOpen}
                onCloseSearch={() => setIsMobileSearchOpen(false)}
            />

            <main className="max-w-3xl mx-auto px-4 sm:px-6 pt-24 sm:pt-32 pb-20">
                {/* Back Button */}
                <div className="mb-6">
                    <button
                        onClick={handleBack}
                        className="flex items-center gap-2 group text-gray-500 dark:text-gray-400 hover:text-[#F97316] dark:hover:text-[#F97316] transition-colors cursor-pointer"
                        title="Back to Adopt a Pet"
                    >
                        <div className="w-10 h-10 rounded-xl bg-white dark:bg-[#151C2C] border border-gray-200 dark:border-gray-800 flex items-center justify-center text-gray-400 group-hover:text-[#F97316] group-hover:border-orange-200 dark:group-hover:border-orange-500/30 transition-all shadow-sm">
                            <ArrowLeft className="w-5 h-5 transition-transform group-hover:-translate-x-1" />
                        </div>
                        <span className="text-[11px] font-black uppercase tracking-widest text-[#1a1208] dark:text-white group-hover:text-[#F97316] dark:group-hover:text-[#F97316] transition-colors">Back to Adopt a Pet</span>
                    </button>
                </div>
                {/* Animal Preview Card */}
                {loadingAnimal ? (
                    <div className="bg-white dark:bg-[#151C2C] rounded-3xl p-6 border border-gray-200 dark:border-gray-800 animate-pulse mb-6 h-28" />
                ) : animal ? (
                    <div className="bg-white dark:bg-[#151C2C] rounded-3xl border border-orange-200/80 dark:border-orange-900/40 p-5 mb-8 shadow-xs flex items-center gap-5">
                        <img
                            src={getPetPicture(animal.photos?.[0])}
                            alt={animal.animal_name || 'Pet'}
                            className="w-20 h-20 rounded-2xl object-cover border border-gray-100 dark:border-gray-800 shrink-0"
                        />
                        <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-0.5">
                                <h2 className="text-xl font-black text-gray-900 dark:text-white truncate">
                                    Adopting: {animal.animal_name || `Rescue #${animal.holding_id}`}
                                </h2>
                                <span className="px-2.5 py-0.5 rounded-full bg-orange-100 dark:bg-orange-950/60 text-orange-800 dark:text-orange-300 text-[11px] font-bold border border-transparent dark:border-orange-900/50">
                                    {animal.animal_type || 'Rescue'}
                                </span>
                            </div>
                            <p className="text-xs font-semibold text-gray-500 dark:text-gray-400">
                                {animal.breed || 'Mixed Breed'} • {animal.color || 'Natural'} • {animal.estimated_size || 'Medium'} Size
                            </p>
                            <p className="text-xs text-gray-400 dark:text-gray-400 mt-1 flex items-center gap-1">
                                <MapPin className="w-3 h-3 text-orange-500" />
                                {animal.facility_name || 'Barangay Animal Facility'}
                            </p>
                        </div>
                    </div>
                ) : null}

                {/* Form Card */}
                <div className="bg-white dark:bg-[#151C2C] rounded-3xl border border-gray-200/90 dark:border-gray-800 p-6 sm:p-8 shadow-xs">
                    <div className="mb-6">
                        <h1 className="text-2xl font-black text-gray-900 dark:text-white flex items-center gap-2">
                            <Heart className="w-6 h-6 text-orange-500 fill-orange-500" />
                            Official Adoption Application Form
                        </h1>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                            Your application will be verified and approved by Barangay Animal Care Services.
                        </p>
                    </div>

                    {successMessage && (
                        <div className="bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900/50 rounded-2xl p-4 mb-6 flex items-center gap-3 text-emerald-800 dark:text-emerald-300 text-sm font-bold">
                            <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                            <span>{successMessage}</span>
                        </div>
                    )}

                    {formError && (
                        <div className="bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/50 rounded-2xl p-4 mb-6 flex items-center gap-3 text-red-800 dark:text-red-300 text-sm">
                            <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400 shrink-0" />
                            <span>{formError}</span>
                        </div>
                    )}

                    <form onSubmit={handleSubmit} className="space-y-6">
                        {/* Applicant Information */}
                        <div className="space-y-4">
                            <h3 className="font-bold text-sm text-gray-900 dark:text-white border-b border-gray-100 dark:border-gray-800 pb-2">
                                1. Applicant Personal Details
                            </h3>

                            <div>
                                <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1.5">
                                    Full Name <span className="text-red-500">*</span>
                                </label>
                                <input
                                    type="text"
                                    required
                                    value={fullName}
                                    onChange={(e) => setFullName(e.target.value)}
                                    placeholder="Juan Dela Cruz"
                                    className="w-full px-4 py-2.5 text-sm rounded-xl border border-gray-200 dark:border-gray-700 focus:border-orange-500 dark:focus:border-orange-500 focus:outline-hidden transition-all bg-gray-50/50 dark:bg-[#0E131F] focus:bg-white dark:focus:bg-[#151C2C] text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500"
                                />
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1.5">
                                        Active Contact Number <span className="text-red-500">*</span>
                                    </label>
                                    <div className="relative">
                                        <Phone className="w-4 h-4 text-gray-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                                        <input
                                            type="tel"
                                            required
                                            value={contactNo}
                                            onChange={(e) => setContactNo(e.target.value)}
                                            placeholder="09123456789"
                                            className="w-full pl-10 pr-4 py-2.5 text-sm rounded-xl border border-gray-200 dark:border-gray-700 focus:border-orange-500 dark:focus:border-orange-500 focus:outline-hidden transition-all bg-gray-50/50 dark:bg-[#0E131F] focus:bg-white dark:focus:bg-[#151C2C] text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500"
                                        />
                                    </div>
                                </div>

                                <div>
                                    <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1.5">
                                        Living Space Type <span className="text-red-500">*</span>
                                    </label>
                                    <select
                                        value={livingSpace}
                                        onChange={(e) => setLivingSpace(e.target.value)}
                                        className="w-full px-4 py-2.5 text-sm rounded-xl border border-gray-200 dark:border-gray-700 focus:border-orange-500 dark:focus:border-orange-500 focus:outline-hidden transition-all bg-gray-50/50 dark:bg-[#0E131F] focus:bg-white dark:focus:bg-[#151C2C] text-gray-900 dark:text-white"
                                    >
                                        <option value="House with yard">House with fenced yard</option>
                                        <option value="Apartment">Apartment</option>
                                        <option value="Condo">Condominium</option>
                                        <option value="Other">Other Residential</option>
                                    </select>
                                </div>
                            </div>

                            <div>
                                <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1.5">
                                    Current Home Address <span className="text-red-500">*</span>
                                </label>
                                <input
                                    type="text"
                                    required
                                    value={address}
                                    onChange={(e) => setAddress(e.target.value)}
                                    placeholder="House #, Street, Barangay, City"
                                    className="w-full px-4 py-2.5 text-sm rounded-xl border border-gray-200 dark:border-gray-700 focus:border-orange-500 dark:focus:border-orange-500 focus:outline-hidden transition-all bg-gray-50/50 dark:bg-[#0E131F] focus:bg-white dark:focus:bg-[#151C2C] text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500"
                                />
                            </div>
                        </div>

                        {/* Government ID Verification */}
                        <div className="space-y-4 pt-2">
                            <div className="border-b border-gray-100 dark:border-gray-800 pb-2 flex items-center justify-between">
                                <h3 className="font-bold text-sm text-gray-900 dark:text-white flex items-center gap-2">
                                    <CreditCard className="w-4 h-4 text-orange-500" />
                                    2. Government-Issued Identification (Required)
                                </h3>
                                <span className="text-[11px] font-semibold text-orange-600 dark:text-orange-400 bg-orange-50 dark:bg-orange-950/50 px-2 py-0.5 rounded-full border border-orange-200 dark:border-orange-900/50">
                                    Identity Verification
                                </span>
                            </div>

                            <p className="text-xs text-gray-500 dark:text-gray-400">
                                As required by Barangay Animal Welfare Regulations, official pet adoption and ownership registration requires one valid government-issued ID.
                            </p>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1.5">
                                        ID Document Type <span className="text-red-500">*</span>
                                    </label>
                                    <select
                                        value={idType}
                                        onChange={(e) => setIdType(e.target.value)}
                                        className="w-full px-4 py-2.5 text-sm rounded-xl border border-gray-200 dark:border-gray-700 focus:border-orange-500 dark:focus:border-orange-500 focus:outline-hidden transition-all bg-gray-50/50 dark:bg-[#0E131F] focus:bg-white dark:focus:bg-[#151C2C] text-gray-900 dark:text-white font-medium"
                                    >
                                        <option value="PhilSys National ID">Philippine National ID (PhilSys)</option>
                                        <option value="Driver's License">Driver's License (LTO)</option>
                                        <option value="Philippine Passport">Philippine Passport (DFA)</option>
                                        <option value="UMID">Unified Multi-Purpose ID (UMID)</option>
                                        <option value="SSS / GSIS ID">SSS / GSIS ID Card</option>
                                        <option value="PRC ID">PRC ID (Professional Regulation Commission)</option>
                                        <option value="Voter's ID / Certificate">Voter's ID / Certificate (COMELEC)</option>
                                        <option value="Postal ID">Postal ID (PhlPost)</option>
                                        <option value="Barangay ID">Barangay Clearance / Resident ID</option>
                                        <option value="Senior Citizen / PWD ID">Senior Citizen / PWD ID</option>
                                        <option value="Student / School ID">Student ID (Valid / Enrolled)</option>
                                    </select>
                                </div>

                                <div>
                                    <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1.5">
                                        ID Number <span className="text-red-500">*</span>
                                    </label>
                                    <input
                                        type="text"
                                        required
                                        value={idNumber}
                                        onChange={(e) => setIdNumber(e.target.value)}
                                        placeholder="e.g. 1234-5678-9012 or N01-23-456789"
                                        className="w-full px-4 py-2.5 text-sm rounded-xl border border-gray-200 dark:border-gray-700 focus:border-orange-500 dark:focus:border-orange-500 focus:outline-hidden transition-all bg-gray-50/50 dark:bg-[#0E131F] focus:bg-white dark:focus:bg-[#151C2C] text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500"
                                    />
                                </div>
                            </div>

                            <div>
                                <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1.5">
                                    Upload Photo / Scan of ID <span className="text-red-500">*</span>
                                </label>

                                {idPhotoUrl ? (
                                    <div className="relative border-2 border-emerald-300 dark:border-emerald-700 bg-emerald-50/40 dark:bg-emerald-950/20 rounded-2xl p-4 flex flex-col sm:flex-row items-center gap-4">
                                        <img
                                            src={idPhotoUrl}
                                            alt="Uploaded ID Preview"
                                            className="w-32 h-20 object-cover rounded-xl border border-emerald-200 dark:border-emerald-800 shadow-xs"
                                        />
                                        <div className="flex-1 text-center sm:text-left">
                                            <div className="flex items-center justify-center sm:justify-start gap-1.5 text-emerald-800 dark:text-emerald-300 font-bold text-xs">
                                                <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                                                Valid ID Photo Uploaded
                                            </div>
                                            <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">
                                                {idType} (#{idNumber || 'No number specified'})
                                            </p>
                                        </div>
                                        <div>
                                            <label className="cursor-pointer px-3 py-1.5 bg-white dark:bg-[#151C2C] hover:bg-gray-50 dark:hover:bg-[#1E2738] border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 text-xs font-bold rounded-xl shadow-xs transition-colors inline-block">
                                                Change ID
                                                <input
                                                    type="file"
                                                    accept="image/*"
                                                    className="hidden"
                                                    onChange={handleIdFileChange}
                                                    disabled={uploadingId}
                                                />
                                            </label>
                                        </div>
                                    </div>
                                ) : (
                                    <label className={`flex flex-col items-center justify-center border-2 border-dashed rounded-2xl p-6 cursor-pointer transition-all ${
                                        uploadingId 
                                            ? 'border-orange-400 bg-orange-50/30 dark:bg-orange-950/20' 
                                            : 'border-gray-300 dark:border-gray-700 hover:border-orange-400 hover:bg-orange-50/10 dark:hover:bg-orange-950/10 bg-gray-50/30 dark:bg-[#0E131F]'
                                    }`}>
                                        <div className="p-3 bg-white dark:bg-[#151C2C] rounded-full shadow-xs border border-gray-100 dark:border-gray-700 mb-2">
                                            <Upload className="w-5 h-5 text-orange-500" />
                                        </div>
                                        <span className="text-xs font-bold text-gray-800 dark:text-gray-200">
                                            {uploadingId ? "Uploading ID Document..." : "Click or drag to upload valid ID photo"}
                                        </span>
                                        <span className="text-[11px] text-gray-400 dark:text-gray-400 mt-1">
                                            PNG, JPG, JPEG or WEBP (Max 5MB) • Front of ID clearly visible
                                        </span>
                                        <input
                                            type="file"
                                            accept="image/*"
                                            className="hidden"
                                            onChange={handleIdFileChange}
                                            disabled={uploadingId}
                                        />
                                    </label>
                                )}
                            </div>
                        </div>

                        {/* Household Suitability */}
                        <div className="space-y-4 pt-2">
                            <h3 className="font-bold text-sm text-gray-900 dark:text-white border-b border-gray-100 dark:border-gray-800 pb-2">
                                3. Pet Compatibility & Household Suitability
                            </h3>

                            <div>
                                <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
                                    <label className="block text-xs font-bold text-gray-700 dark:text-gray-300">
                                        Do you currently have other pets at home?
                                    </label>
                                    {registeredPets.length > 0 && (
                                        <span className="text-[11px] font-bold text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/40 px-2.5 py-0.5 rounded-full border border-emerald-200 dark:border-emerald-800 flex items-center gap-1.5 shadow-2xs">
                                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                                            Auto-detected: {registeredPets.length} registered pet{registeredPets.length > 1 ? 's' : ''} in your account (Automatically set to Yes)
                                        </span>
                                    )}
                                </div>
                                <div className="flex items-center gap-6">
                                    <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300 cursor-pointer">
                                        <input
                                            type="radio"
                                            name="otherPets"
                                            checked={hasOtherPets}
                                            onChange={() => setHasOtherPets(true)}
                                            className="text-orange-500 focus:ring-orange-400"
                                        />
                                        <span>Yes, I have other pets</span>
                                    </label>
                                    <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300 cursor-pointer">
                                        <input
                                            type="radio"
                                            name="otherPets"
                                            checked={!hasOtherPets}
                                            onChange={() => setHasOtherPets(false)}
                                            className="text-orange-500 focus:ring-orange-400"
                                        />
                                        <span>No, this will be my only pet</span>
                                    </label>
                                </div>
                                {registeredPets.length > 0 && hasOtherPets && (
                                    <p className="text-[11px] text-gray-600 dark:text-gray-300 mt-2 bg-emerald-50/50 dark:bg-emerald-950/20 p-2.5 rounded-xl border border-emerald-100 dark:border-emerald-900/40 flex items-center gap-1.5">
                                        <span className="font-bold text-emerald-800 dark:text-emerald-300">Your Registered Pets:</span>
                                        <span>{registeredPets.map(p => p.pet_name || 'Pet').join(', ')}</span>
                                    </p>
                                )}
                            </div>

                            <div>
                                <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1.5">
                                    Reason for Adoption & Care Plan <span className="text-red-500">*</span>
                                </label>
                                <textarea
                                    required
                                    rows={4}
                                    value={reason}
                                    onChange={(e) => setReason(e.target.value)}
                                    placeholder="Explain why you would like to adopt this animal, who will care for it, and how your home environment is suitable (min 20 characters)..."
                                    className="w-full px-4 py-3 text-sm rounded-xl border border-gray-200 dark:border-gray-700 focus:border-orange-500 dark:focus:border-orange-500 focus:outline-hidden transition-all bg-gray-50/50 dark:bg-[#0E131F] focus:bg-white dark:focus:bg-[#151C2C] text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 resize-none"
                                />
                                <span className="text-[11px] text-gray-400 dark:text-gray-400 block text-right mt-1">
                                    {reason.trim().length} / 20 characters minimum
                                </span>
                            </div>
                        </div>

                        {/* Terms Notice */}
                        <div className="bg-gray-50 dark:bg-[#0E131F] rounded-2xl p-4 border border-gray-100 dark:border-gray-800 text-xs text-gray-600 dark:text-gray-300 space-y-1.5">
                            <div className="flex items-center gap-1.5 font-bold text-gray-900 dark:text-white">
                                <Shield className="w-4 h-4 text-orange-600 dark:text-orange-400" />
                                Barangay Adoption Commitment & Legal Terms
                            </div>
                            <p className="text-gray-500 dark:text-gray-400">
                                By submitting this application, you agree to provide proper shelter, food, and veterinary care. Once approved, adoption is legally recognized and registered in the Barangay animal records.
                            </p>
                        </div>

                        {/* Submit Button */}
                        <button
                            type="submit"
                            disabled={submitting}
                            className="w-full py-3.5 px-6 bg-orange-500 hover:bg-orange-600 active:bg-orange-700 disabled:opacity-50 text-white rounded-2xl font-bold text-sm shadow-xs hover:shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer"
                        >
                            {submitting ? (
                                <span>Submitting Application...</span>
                            ) : (
                                <>
                                    <Heart className="w-4 h-4 fill-white/30" />
                                    Submit Official Adoption Application
                                </>
                            )}
                        </button>
                    </form>
                </div>
            </main>
            <ResiMobileNav isNavbarMenuOpen={isNavbarMenuOpen} />
        </div>
    );
};

export default AdoptionApplyForm;
