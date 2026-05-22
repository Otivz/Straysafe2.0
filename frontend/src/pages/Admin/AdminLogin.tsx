import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Button from '../../components/Button';
import { EyeIcon, EyeOffIcon } from '../../components/icon';

const AdminLogin = () => {
    const navigate = useNavigate();
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [keepSignedIn, setKeepSignedIn] = useState(false);
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const [showPassword, setShowPassword] = useState(false);
    
    // Auto-redirect if already logged in as admin
    useEffect(() => {
        const rawUser = 
            localStorage.getItem('admin_user') || 
            sessionStorage.getItem('admin_user');
        
        if (rawUser) {
            try {
                const user = JSON.parse(rawUser);
                if (user && user.role_id === 4) {
                    navigate('/admin/dashboard');
                } else {
                    // Clear non-admin session data
                    localStorage.removeItem('admin_user');
                    sessionStorage.removeItem('admin_user');
                }
            } catch {
                localStorage.removeItem('admin_user');
                sessionStorage.removeItem('admin_user');
            }
        }
    }, [navigate]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setLoading(true);

        try {
            const res = await fetch('http://127.0.0.1:8000/auth/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password }),
            });

            const data = await res.json();

            if (!res.ok) {
                setError(data.detail || 'Login failed. Please try again.');
                return;
            }

            // Store session info
            const storage = keepSignedIn ? localStorage : sessionStorage;
            storage.setItem('admin_user', JSON.stringify(data));

            navigate('/admin/dashboard');
        } catch {
            setError('Cannot connect to server. Make sure the backend is running.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen w-full flex bg-[#F0F2F5] font-sans text-gray-900 relative overflow-hidden">
            {/* Left Side: Branding half */}
            <div className="hidden lg:flex flex-col justify-center items-center relative w-1/2 bg-[#F97316] text-white p-12 overflow-hidden">
                {/* Background Pattern/Overlay */}
                <div className="absolute inset-0 opacity-10 pointer-events-none">
                    <img src="/SSLOGO.png" alt="" className="w-full h-full object-cover scale-150 rotate-12" />
                </div>
                
                <div className="z-10 flex flex-col items-center justify-center h-full">
                    <div className="flex flex-col items-center -space-y-4">
                        <img src="/SSLOGO.png" alt="Stray-Safe Logo" className="w-full max-w-[320px] h-auto object-contain drop-shadow-2xl brightness-0 invert opacity-90" />
                        <h1 className="text-6xl font-black tracking-tighter uppercase text-white">
                            STRAY-SAFE
                        </h1>
                    </div>
                </div>
            </div>

            {/* Right Side: Login Form half */}
            <div className="w-full lg:w-1/2 flex flex-col items-center justify-center p-8 lg:p-24 relative z-10">
                <div className="w-full max-w-md">
                    <div className="mb-12 text-center lg:text-left flex flex-col items-center lg:items-start">
                        <h2 className="text-4xl font-extrabold text-gray-900 mb-2">WELCOME BACK!</h2>
                        <p className="text-gray-400 text-sm font-medium">Please login to view your dashboard</p>
                    </div>

                    <form onSubmit={handleSubmit} className="space-y-6">
                        {/* Email Address */}
                        <div className="space-y-1">
                            <div className="relative">
                                <input
                                    type="email"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    className="w-full bg-white border border-gray-200 text-gray-900 text-sm rounded-lg px-4 py-4 focus:ring-2 focus:ring-[#F97316] focus:border-transparent outline-none font-medium placeholder-gray-400 transition-all"
                                    placeholder="Email"
                                />
                            </div>
                        </div>

                        {/* Security Key */}
                        <div className="space-y-1">
                            <div className="relative group">
                                <input
                                    type={showPassword ? "text" : "password"}
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    className="w-full bg-white border border-gray-200 text-gray-900 text-sm rounded-lg pl-4 pr-12 py-4 focus:ring-2 focus:ring-[#F97316] focus:border-transparent outline-none font-medium placeholder-gray-400 transition-all"
                                    placeholder="Password"
                                    required
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowPassword(!showPassword)}
                                    className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-[#F97316] transition-colors"
                                >
                                    {showPassword ? <EyeOffIcon size={18} /> : <EyeIcon size={18} />}
                                </button>
                            </div>
                        </div>

                        {/* Keep me signed in & Forgot Password */}
                        <div className="flex items-center justify-between py-2">
                            <div className="flex items-center">
                                <button
                                    type="button"
                                    onClick={() => setKeepSignedIn(!keepSignedIn)}
                                    className={`w-[18px] h-[18px] rounded flex items-center justify-center border mr-2 transition-colors ${keepSignedIn ? 'bg-[#F97316] border-[#F97316]' : 'bg-white border-gray-300 hover:border-[#F97316]'}`}
                                >
                                    {keepSignedIn && (
                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3 text-white stroke-2" viewBox="0 0 20 20" fill="currentColor">
                                            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                                        </svg>
                                    )}
                                </button>
                                <span className="text-[13px] font-medium text-gray-500">Keep me logged in</span>
                            </div>
                            <a href="#" className="text-[13px] font-medium text-gray-400 hover:text-[#F97316]">Forgot password? <span className="text-[#F97316] font-bold">Reset now</span></a>
                        </div>

                        {/* Error Message */}
                        {error && (
                            <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-600 text-sm font-medium rounded-lg px-4 py-3">
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 shrink-0" viewBox="0 0 20 20" fill="currentColor">
                                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                                </svg>
                                {error}
                            </div>
                        )}

                        {/* Submit Button */}
                        <div className="pt-4 flex justify-center lg:justify-end">
                            <Button
                                type="submit"
                                variant="primary"
                                size="lg"
                                className="px-12 py-3 bg-[#F97316] hover:bg-[#ea580c] rounded-md shadow-lg transition-all transform hover:-translate-y-0.5 text-white font-bold uppercase tracking-widest text-xs disabled:opacity-60 disabled:cursor-not-allowed"
                                disabled={loading}
                            >
                                {loading ? 'LOGGING IN...' : 'LOGIN'}
                            </Button>
                        </div>
                    </form>

                    {/* Terms */}
                    <div className="mt-12 text-[10px] text-gray-400 leading-relaxed max-w-sm">
                        By signing in you accept all our <a href="#" className="underline">terms and conditions</a>, <a href="#" className="underline">privacy policy</a> and <a href="#" className="underline">cookie policy</a>. We however do not use any third party vendor to share your data and its safe with us.
                    </div>
                </div>
            </div>
        </div>
    );
};

export default AdminLogin;
