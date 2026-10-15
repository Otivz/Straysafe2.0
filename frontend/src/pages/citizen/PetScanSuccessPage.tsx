import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../../utils/api';



const PetScanSuccessPage = () => {
    const { token } = useParams<{ token: string }>();
    const navigate = useNavigate();
    const [petName, setPetName] = useState('the pet');
    const [ownerName, setOwnerName] = useState<string | null>(null);

    useEffect(() => {
        const fetchPetName = async () => {
            try {
                const response = await api.get(`/pet/scan/${token}`);
                if (response.data) {
                    if (response.data.pet_name) setPetName(response.data.pet_name);
                    if (response.data.owner_name || response.data.emergency_contact_name) {
                        setOwnerName(response.data.owner_name || response.data.emergency_contact_name);
                    }
                }
            } catch (err) {
                console.error("Failed to fetch pet details for success screen:", err);
            }
        };
        fetchPetName();
    }, [token]);

    return (
        <div className="min-h-screen bg-[#FAFAF9] font-sans pb-24 flex items-center justify-center p-4">
            <div className="w-full max-w-md bg-white rounded-3xl border border-stone-200/80 shadow-2xl p-6 sm:p-8 text-center space-y-5 sm:space-y-6">
                
                {/* Success Icon */}
                <div className="w-16 h-16 sm:w-20 sm:h-20 bg-green-50 text-green-500 rounded-full flex items-center justify-center mx-auto shadow-md border border-green-100/50 animate-bounce">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 sm:h-10 sm:w-10" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                    </svg>
                </div>

                <div className="space-y-2">
                    <span className="text-[10px] font-black text-green-600 bg-green-50 px-3 py-1 rounded-full uppercase tracking-widest">Notification Dispatched</span>
                    <h2 className="text-xl sm:text-2xl font-black text-[#1a1208] uppercase tracking-tight">Report Logged Successfully</h2>
                    <p className="text-xs font-semibold text-gray-500 leading-relaxed">
                        We have successfully alerted {ownerName ? <strong className="text-gray-800">{ownerName} ({petName}'s owner)</strong> : `${petName}'s owner`} and transmitted your contact and location details.
                    </p>
                </div>

                {/* Instructions Card */}
                <div className="bg-stone-50 border border-stone-200/80 rounded-2xl p-4 sm:p-5 text-left space-y-2.5 sm:space-y-3">
                    <h4 className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Next Steps for Safety</h4>
                    <ul className="space-y-1.5 sm:space-y-2 text-xs font-semibold text-stone-600 list-disc list-inside">
                        <li>Stay near the pet if it is safe to do so.</li>
                        <li>Keep the pet secure (e.g. temporary shelter, leash, or backyard) if possible.</li>
                        <li>Keep your phone nearby. The owner will be calling you shortly.</li>
                    </ul>
                </div>

                <button
                    onClick={() => navigate('/')}
                    className="w-full py-3 sm:py-3.5 bg-[#F97316] hover:bg-orange-600 active:scale-[0.99] text-white rounded-xl text-xs sm:text-sm font-black uppercase tracking-wider shadow-md shadow-orange-500/20 transition-all cursor-pointer"
                >
                    Back to Homepage
                </button>
            </div>
        </div>
    );
};

export default PetScanSuccessPage;
