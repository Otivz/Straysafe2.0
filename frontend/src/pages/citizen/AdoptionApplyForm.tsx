import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { api } from '../../utils/api';
import { getPetPicture } from '../../utils/avatar';
import { ArrowLeft, Heart, Shield, Phone, MapPin, AlertCircle, CheckCircle2 } from 'lucide-react';

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

    const [submitting, setSubmitting] = useState(false);
    const [formError, setFormError] = useState<string | null>(null);
    const [successMessage, setSuccessMessage] = useState<string | null>(null);

    useEffect(() => {
        const fetchAnimal = async () => {
            if (!id) return;
            setLoadingAnimal(true);
            try {
                const res = await axios.get(`http://localhost:8000/adoptions/catalog/${id}`);
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

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setFormError(null);

        if (!fullName.trim() || !address.trim() || !contactNo.trim()) {
            setFormError("Please fill in your complete contact details.");
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
        <div className="min-h-screen bg-[#FBFBF9] text-[#1E293B] font-sans pb-16">
            {/* Header */}
            <header className="sticky top-0 z-40 bg-white/90 backdrop-blur-md border-b border-[#E2E8F0] px-4 sm:px-8 py-3.5 flex items-center justify-between shadow-xs">
                <button
                    onClick={() => navigate(-1)}
                    className="p-2 rounded-xl hover:bg-gray-100 text-gray-600 transition-colors flex items-center gap-1.5 text-xs font-bold"
                >
                    <ArrowLeft className="w-4 h-4" />
                    <span>Back to Catalog</span>
                </button>
                <div className="flex items-center gap-2">
                    <img src="/SSLOGO.png" alt="StraySafe" className="w-7 h-7 object-contain" />
                    <span className="font-extrabold text-sm text-gray-900 hidden sm:inline">
                        Adoption Application
                    </span>
                </div>
            </header>

            <main className="max-w-3xl mx-auto px-4 sm:px-6 pt-8">
                {/* Animal Preview Card */}
                {loadingAnimal ? (
                    <div className="bg-white rounded-3xl p-6 border border-gray-200 animate-pulse mb-6 h-28" />
                ) : animal ? (
                    <div className="bg-white rounded-3xl border border-orange-200/80 p-5 mb-8 shadow-xs flex items-center gap-5">
                        <img
                            src={getPetPicture(animal.photos?.[0])}
                            alt={animal.animal_name || 'Pet'}
                            className="w-20 h-20 rounded-2xl object-cover border border-gray-100 shrink-0"
                        />
                        <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-0.5">
                                <h2 className="text-xl font-black text-gray-900 truncate">
                                    Adopting: {animal.animal_name || `Rescue #${animal.holding_id}`}
                                </h2>
                                <span className="px-2.5 py-0.5 rounded-full bg-orange-100 text-orange-800 text-[11px] font-bold">
                                    {animal.animal_type || 'Rescue'}
                                </span>
                            </div>
                            <p className="text-xs font-semibold text-gray-500">
                                {animal.breed || 'Mixed Breed'} • {animal.color || 'Natural'} • {animal.estimated_size || 'Medium'} Size
                            </p>
                            <p className="text-xs text-gray-400 mt-1 flex items-center gap-1">
                                <MapPin className="w-3 h-3 text-orange-500" />
                                {animal.facility_name || 'Barangay Animal Facility'}
                            </p>
                        </div>
                    </div>
                ) : null}

                {/* Form Card */}
                <div className="bg-white rounded-3xl border border-gray-200/90 p-6 sm:p-8 shadow-xs">
                    <div className="mb-6">
                        <h1 className="text-2xl font-black text-gray-900 flex items-center gap-2">
                            <Heart className="w-6 h-6 text-orange-500 fill-orange-500" />
                            Official Adoption Application Form
                        </h1>
                        <p className="text-xs text-gray-500 mt-1">
                            Your application will be verified and approved by Barangay Animal Care Services.
                        </p>
                    </div>

                    {successMessage && (
                        <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4 mb-6 flex items-center gap-3 text-emerald-800 text-sm font-bold">
                            <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                            <span>{successMessage}</span>
                        </div>
                    )}

                    {formError && (
                        <div className="bg-red-50 border border-red-200 rounded-2xl p-4 mb-6 flex items-center gap-3 text-red-800 text-sm">
                            <AlertCircle className="w-5 h-5 text-red-600 shrink-0" />
                            <span>{formError}</span>
                        </div>
                    )}

                    <form onSubmit={handleSubmit} className="space-y-6">
                        {/* Applicant Information */}
                        <div className="space-y-4">
                            <h3 className="font-bold text-sm text-gray-900 border-b border-gray-100 pb-2">
                                1. Applicant Personal Details
                            </h3>

                            <div>
                                <label className="block text-xs font-bold text-gray-700 mb-1.5">
                                    Full Name <span className="text-red-500">*</span>
                                </label>
                                <input
                                    type="text"
                                    required
                                    value={fullName}
                                    onChange={(e) => setFullName(e.target.value)}
                                    placeholder="Juan Dela Cruz"
                                    className="w-full px-4 py-2.5 text-sm rounded-xl border border-gray-200 focus:border-orange-500 focus:outline-hidden transition-all bg-gray-50/50 focus:bg-white"
                                />
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-bold text-gray-700 mb-1.5">
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
                                            className="w-full pl-10 pr-4 py-2.5 text-sm rounded-xl border border-gray-200 focus:border-orange-500 focus:outline-hidden transition-all bg-gray-50/50 focus:bg-white"
                                        />
                                    </div>
                                </div>

                                <div>
                                    <label className="block text-xs font-bold text-gray-700 mb-1.5">
                                        Living Space Type <span className="text-red-500">*</span>
                                    </label>
                                    <select
                                        value={livingSpace}
                                        onChange={(e) => setLivingSpace(e.target.value)}
                                        className="w-full px-4 py-2.5 text-sm rounded-xl border border-gray-200 focus:border-orange-500 focus:outline-hidden transition-all bg-gray-50/50 focus:bg-white"
                                    >
                                        <option value="House with yard">House with fenced yard</option>
                                        <option value="Apartment">Apartment</option>
                                        <option value="Condo">Condominium</option>
                                        <option value="Other">Other Residential</option>
                                    </select>
                                </div>
                            </div>

                            <div>
                                <label className="block text-xs font-bold text-gray-700 mb-1.5">
                                    Current Home Address <span className="text-red-500">*</span>
                                </label>
                                <input
                                    type="text"
                                    required
                                    value={address}
                                    onChange={(e) => setAddress(e.target.value)}
                                    placeholder="House #, Street, Barangay, City"
                                    className="w-full px-4 py-2.5 text-sm rounded-xl border border-gray-200 focus:border-orange-500 focus:outline-hidden transition-all bg-gray-50/50 focus:bg-white"
                                />
                            </div>
                        </div>

                        {/* Household Suitability */}
                        <div className="space-y-4 pt-2">
                            <h3 className="font-bold text-sm text-gray-900 border-b border-gray-100 pb-2">
                                2. Pet Compatibility & Household Suitability
                            </h3>

                            <div>
                                <label className="block text-xs font-bold text-gray-700 mb-2">
                                    Do you currently have other pets at home?
                                </label>
                                <div className="flex items-center gap-6">
                                    <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                                        <input
                                            type="radio"
                                            name="otherPets"
                                            checked={hasOtherPets}
                                            onChange={() => setHasOtherPets(true)}
                                            className="text-orange-500 focus:ring-orange-400"
                                        />
                                        <span>Yes, I have other pets</span>
                                    </label>
                                    <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
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
                            </div>

                            <div>
                                <label className="block text-xs font-bold text-gray-700 mb-1.5">
                                    Reason for Adoption & Care Plan <span className="text-red-500">*</span>
                                </label>
                                <textarea
                                    required
                                    rows={4}
                                    value={reason}
                                    onChange={(e) => setReason(e.target.value)}
                                    placeholder="Explain why you would like to adopt this animal, who will care for it, and how your home environment is suitable (min 20 characters)..."
                                    className="w-full px-4 py-3 text-sm rounded-xl border border-gray-200 focus:border-orange-500 focus:outline-hidden transition-all bg-gray-50/50 focus:bg-white resize-none"
                                />
                                <span className="text-[11px] text-gray-400 block text-right mt-1">
                                    {reason.trim().length} / 20 characters minimum
                                </span>
                            </div>
                        </div>

                        {/* Terms Notice */}
                        <div className="bg-gray-50 rounded-2xl p-4 border border-gray-100 text-xs text-gray-600 space-y-1.5">
                            <div className="flex items-center gap-1.5 font-bold text-gray-900">
                                <Shield className="w-4 h-4 text-orange-600" />
                                Barangay Adoption Commitment & Legal Terms
                            </div>
                            <p className="text-gray-500">
                                By submitting this application, you agree to provide proper shelter, food, and veterinary care. Once approved, adoption is legally recognized and registered in the Barangay animal records.
                            </p>
                        </div>

                        {/* Submit Button */}
                        <button
                            type="submit"
                            disabled={submitting}
                            className="w-full py-3.5 px-6 bg-orange-500 hover:bg-orange-600 active:bg-orange-700 disabled:opacity-50 text-white rounded-2xl font-bold text-sm shadow-xs hover:shadow-md transition-all flex items-center justify-center gap-2"
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
        </div>
    );
};

export default AdoptionApplyForm;
