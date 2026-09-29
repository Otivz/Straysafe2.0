import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Button from '../../components/Button';
import { EyeIcon, EyeOffIcon } from '../../components/icon';
import { useTheme } from '../../context/ThemeContext';
import { api, clearAuthStorage } from '../../utils/api';

const CommunityStaffLogin = () => {
    const navigate = useNavigate();
    const { setTheme } = useTheme();

    useEffect(() => {
        setTheme('light');
    }, [setTheme]);
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [keepSignedIn, setKeepSignedIn] = useState(false);
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const [showPassword, setShowPassword] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setLoading(true);

        try {
            const res = await api.post('/auth/login', { email, password });
            const data = res.data;

            // Enforce Role Access Control (2 = Subdivision Leader, 3 = Barangay Staff)
            if (data.role_id !== 2 && data.role_id !== 3) {
                setError("Access denied. This login portal is strictly for Community Staff and Subdivision Leaders.");
                return;
            }

            // Clear ALL previous session storage to prevent cross-role contamination
            clearAuthStorage();

            // Store session info
            const storage = keepSignedIn ? localStorage : sessionStorage;
            if (data.access_token) {
                storage.setItem('access_token', data.access_token);
            }
            storage.setItem('staff_user', JSON.stringify(data));

            if (data.role_id === 2) {
                navigate('/subd/dashboard');
            } else if (data.role_id === 3) {
                navigate('/brgy/dashboard');
            }
        } catch (err: any) {
            const detail = err?.response?.data?.detail;
            if (detail) {
                setError(detail);
            } else {
                setError('Cannot connect to server. Make sure the backend is running.');
            }
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen w-full flex bg-[#F8F9FB] font-sans text-gray-900 relative overflow-hidden">
            {/* Left Side: Branding half */}
            <div className="hidden lg:flex flex-col justify-center items-center relative w-1/2 bg-[#F97316] text-white p-12 overflow-hidden shadow-2xl z-20">
                {/* Background Pattern/Overlay */}
                <div className="absolute inset-0 opacity-10 pointer-events-none">
                    <img src="/SSLOGO.png" alt="" className="w-full h-full object-cover scale-150 rotate-12" />
                </div>
                
                <div className="z-10 flex flex-col items-center justify-center h-full max-w-lg text-center">
                    <div className="flex flex-col items-center">
                        <img src="/SSLOGO.png" alt="Stray-Safe Logo" className="w-full max-w-[280px] h-auto object-contain drop-shadow-2xl brightness-0 invert opacity-95" />
                        <h1 className="text-4xl xl:text-5xl font-black tracking-tight uppercase text-white mt-8 leading-tight">
                            OPERATIONS<br/>PORTAL
                        </h1>
                        <div className="h-1.5 w-16 bg-white/40 rounded-full my-4" />
                        <p className="text-white/80 text-xs xl:text-sm font-bold tracking-widest uppercase">
                            Barangay Staff & Subdivision Leaders
                        </p>
                    </div>
                </div>
            </div>

            {/* Right Side: Login Form half */}
            <div className="w-full lg:w-1/2 flex flex-col items-center justify-center p-4 sm:p-8 lg:p-16 xl:p-24 relative z-10 min-h-screen">
                <div className="w-full max-w-sm sm:max-w-md my-auto">
                    {/* Header with Logo at Middle Top */}
                    <div className="mb-4 sm:mb-6 text-center flex flex-col items-center">
                        <img 
                            src="/SSLOGO.png" 
                            alt="StraySafe Logo" 
                            className="w-16 sm:w-20 h-auto object-contain drop-shadow-sm mb-2"
                        />
                        <h2 className="text-2xl sm:text-3xl font-black text-gray-900 tracking-tight mb-1 uppercase">
                            OPERATIONS PORTAL
                        </h2>
                        <div className="h-1 w-12 bg-[#F97316] rounded-full mb-1.5" />
                        <p className="text-gray-400 text-xs sm:text-sm font-medium">Please login to access the operations tools</p>
                    </div>

                    <form onSubmit={handleSubmit} className="space-y-3.5 sm:space-y-5">
                        {/* Email Address */}
                        <div className="space-y-1">
                            <input
                                type="email"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                className="w-full bg-white border border-gray-200 text-gray-900 text-xs sm:text-sm rounded-xl px-4 py-3 sm:py-3.5 focus:ring-2 focus:ring-[#F97316] focus:border-transparent outline-none font-medium placeholder-gray-400 transition-all shadow-sm"
                                placeholder="Staff Email"
                                required
                            />
                        </div>

                        {/* Password */}
                        <div className="space-y-1">
                            <div className="relative group">
                                <input
                                    type={showPassword ? "text" : "password"}
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    className="w-full bg-white border border-gray-200 text-gray-900 text-xs sm:text-sm rounded-xl pl-4 pr-11 py-3 sm:py-3.5 focus:ring-2 focus:ring-[#F97316] focus:border-transparent outline-none font-medium placeholder-gray-400 transition-all shadow-sm"
                                    placeholder="Password"
                                    required
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowPassword(!showPassword)}
                                    className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-[#F97316] transition-colors p-1 cursor-pointer"
                                >
                                    {showPassword ? <EyeOffIcon size={16} /> : <EyeIcon size={16} />}
                                </button>
                            </div>
                        </div>

                        {/* Keep me signed in & Forgot Password in EXACT ONE LINE */}
                        <div className="flex items-center justify-between text-[11px] sm:text-xs pt-0.5 pb-0.5 whitespace-nowrap">
                            <label className="flex items-center cursor-pointer select-none shrink-0">
                                <button
                                    type="button"
                                    onClick={() => setKeepSignedIn(!keepSignedIn)}
                                    className={`w-3.5 h-3.5 sm:w-4 sm:h-4 rounded flex items-center justify-center border mr-1.5 transition-all shrink-0 cursor-pointer ${keepSignedIn ? 'bg-[#F97316] border-[#F97316]' : 'bg-white border-gray-300 hover:border-[#F97316]'}`}
                                >
                                    {keepSignedIn && (
                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-2.5 w-2.5 sm:h-3 sm:w-3 text-white stroke-2" viewBox="0 0 20 20" fill="currentColor">
                                            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                                        </svg>
                                    )}
                                </button>
                                <span className="text-gray-500 font-medium">Keep me logged in</span>
                            </label>
                            <a href="#" className="text-gray-400 hover:text-[#F97316] transition-colors ml-2 truncate">
                                Forgot password? <span className="text-[#F97316] font-bold">Reset now</span>
                            </a>
                        </div>

                        {/* Error Message */}
                        {error && (
                            <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-600 text-xs font-medium rounded-xl p-2.5 animate-in fade-in">
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 shrink-0" viewBox="0 0 20 20" fill="currentColor">
                                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                                </svg>
                                <span>{error}</span>
                            </div>
                        )}

                        {/* Submit Button */}
                        <div className="pt-1 sm:pt-2">
                            <Button
                                type="submit"
                                variant="primary"
                                size="lg"
                                className="w-full py-3 sm:py-3.5 bg-[#F97316] hover:bg-[#EA580C] rounded-xl shadow-md hover:shadow-lg transition-all transform hover:-translate-y-0.5 text-white font-extrabold uppercase tracking-wider text-xs disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer"
                                disabled={loading}
                            >
                                {loading ? 'LOGGING IN...' : 'LOGIN TO PORTAL'}
                            </Button>
                        </div>
                    </form>

                    {/* Footer note */}
                    <div className="mt-6 sm:mt-8 text-[10px] sm:text-[11px] text-gray-400 text-center lg:text-left leading-relaxed">
                        This login portal is restricted to authorized Barangay Staff and Subdivision Leaders. Unauthorized access is strictly prohibited.
                    </div>
                </div>
            </div>
        </div>
    );
};

export default CommunityStaffLogin;
