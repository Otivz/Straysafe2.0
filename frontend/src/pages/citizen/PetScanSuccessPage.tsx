import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';



const PetScanSuccessPage = () => {
    const { token } = useParams<{ token: string }>();
    const navigate = useNavigate();
    const [petName, setPetName] = useState('the pet');

    useEffect(() => {
        const fetchPetName = async () => {
            try {
                const response = await axios.get(`http://localhost:8000/pet/scan/${token}`);
                if (response.data && response.data.pet_name) {
                    setPetName(response.data.pet_name);
                }
            } catch (err) {
                console.error("Failed to fetch pet details for success screen:", err);
            }
        };
        fetchPetName();
    }, [token]);

    return (
        <div className="min-h-screen bg-[#FAFAF9] font-sans pb-24 flex items-center justify-center p-4">
            <div className="w-full max-w-md bg-white rounded-[3rem] border border-gray-100 shadow-2xl p-8 text-center space-y-6">
                
                {/* Success Icon */}
                <div className="w-20 h-20 bg-green-50 text-green-500 rounded-full flex items-center justify-center mx-auto shadow-md border border-green-100/50 animate-bounce">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                    </svg>
                </div>

                <div className="space-y-2">
                    <span className="text-[10px] font-black text-green-600 bg-green-50 px-3 py-1 rounded-full uppercase tracking-widest">Notification Dispatched</span>
                    <h2 className="text-2xl font-black text-[#1a1208] uppercase tracking-tight">Report Logged Successfully</h2>
                    <p className="text-xs font-semibold text-gray-400 leading-relaxed">
                        We have successfully alerted {petName}'s owner and transmitted your contact and location details.
                    </p>
                </div>

                {/* Instructions Card */}
                <div className="bg-gray-50 border border-gray-100 rounded-2xl p-5 text-left space-y-3">
                    <h4 className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Next Steps for Safety</h4>
                    <ul className="space-y-2 text-xs font-semibold text-stone-600 list-disc list-inside">
                        <li>Stay near the pet if it is safe to do so.</li>
                        <li>Keep the pet secure (e.g. temporary shelter, leash, or backyard) if possible.</li>
                        <li>Keep your phone nearby. The owner will be calling you shortly.</li>
                    </ul>
                </div>

                <button
                    onClick={() => navigate('/')}
                    className="w-full py-4 bg-[#1a1208] hover:bg-stone-800 text-white rounded-2xl text-xs font-black uppercase tracking-widest shadow-md transition-all hover:scale-[1.02] cursor-pointer"
                >
                    Back to Homepage
                </button>
            </div>
        </div>
    );
};

export default PetScanSuccessPage;
