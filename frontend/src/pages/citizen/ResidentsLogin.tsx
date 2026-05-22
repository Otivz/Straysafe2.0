import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Button from '../../components/Button';
import { EyeIcon, EyeOffIcon } from '../../components/icon';
import SuccessModal from '../../components/Modals/SuccessModal';

const ResidentsLogin = () => {
    const navigate = useNavigate();
    const [isRegistering, setIsRegistering] = useState(false);

    // Login State
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);

    // Register State
    const [regName, setRegName] = useState('');
    const [regEmail, setRegEmail] = useState('');
    const [regPhone, setRegPhone] = useState('');
    const [regAddress, setRegAddress] = useState('');
    const [regPassword, setRegPassword] = useState('');
    const [regConfirmPassword, setRegConfirmPassword] = useState('');
    const [showRegPassword, setShowRegPassword] = useState(false);

    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const [showSuccess, setShowSuccess] = useState(false);
    const [successMessage, setSuccessMessage] = useState('');
    const [registeredUserData, setRegisteredUserData] = useState<any>(null);

    useEffect(() => {
        if (showSuccess && registeredUserData) {
            const timer = setTimeout(() => {
                localStorage.setItem('resident_user', JSON.stringify(registeredUserData));
                navigate('/resident-home');
            }, 3000); // 3 seconds delay
            return () => clearTimeout(timer);
        }
    }, [showSuccess, registeredUserData, navigate]);

    const handleLogin = async (e: React.FormEvent) => {
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
                setLoading(false);
                return;
            }

            // Restrict login to only Role ID 1 (Residents)
            if (data.role_id !== 1) {
                setError('Access denied. This portal is for residents only.');
                setLoading(false);
                return;
            }

            // Store session info
            localStorage.setItem('resident_user', JSON.stringify(data));
            navigate('/resident-home');
        } catch (err) {
            setError('Cannot connect to server. Make sure the backend is running.');
        } finally {
            setLoading(false);
        }
    };

    const handleRegister = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');

        if (regPassword !== regConfirmPassword) {
            setError('Passwords do not match');
            return;
        }

        setLoading(true);

        try {
            const res = await fetch('http://127.0.0.1:8000/users/', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: regName,
                    email: regEmail,
                    password: regPassword,
                    phone: regPhone,
                    role_id: 1, // Resident
                    subdivision_id: 1, // Automatically set to 1 (Selera Homes)
                    barangay: 'San Vicente',
                    city: 'Santa Maria, Bulacan',
                    address: regAddress,
                    status: 'Active'
                }),
            });

            const data = await res.json();

            if (!res.ok) {
                setError(data.detail || 'Registration failed.');
                setLoading(false);
                return;
            }

            // Successfully registered, now show success modal
            setRegisteredUserData(data);
            setSuccessMessage('Your account has been created successfully. Welcome to the pack!');
            setShowSuccess(true);
            setLoading(false);
            // navigate('/resident-home'); // Removed immediate navigation
        } catch (err) {
            setError('Connection error. Please try again later.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 w-screen h-screen bg-white overflow-y-auto lg:overflow-hidden flex font-sans">

            {/* 1. LEFT SIDE CONTENT AREA */}
            <div className="w-1/2 h-full relative hidden lg:block">
                {/* Registration Form shows here when isRegistering is TRUE */}
                <div className={`absolute inset-0 flex flex-col items-center justify-center p-20 transition-all duration-1000 ${isRegistering ? 'opacity-100 translate-x-0' : 'opacity-0 -translate-x-20 pointer-events-none'}`}>
                    {/* Internal Back Button for Registration */}
                    <button
                        onClick={() => navigate('/')}
                        className="absolute top-12 left-12 flex items-center space-x-2 text-[#9c8670] hover:text-[#F97316] transition-all group"
                    >
                        <div className="w-10 h-10 rounded-full border-2 border-[#ede8e0] group-hover:border-[#F97316] flex items-center justify-center transition-all">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                            </svg>
                        </div>
                        <span className="text-xs font-black uppercase tracking-widest opacity-0 -translate-x-2 group-hover:opacity-100 group-hover:translate-x-0 transition-all">Home</span>
                    </button>

                    <div className="w-full max-w-xl h-full flex flex-col justify-center">
                        <div className="mb-6">
                            <h2 className="text-5xl font-black text-[#1a1208] mb-2 uppercase tracking-tighter leading-none">JOIN THE PACK</h2>
                            <div className="h-1.5 w-20 bg-[#F97316] rounded-full mb-4" />
                            <p className="text-gray-400 font-bold text-xs tracking-widest uppercase">Fill up the form to get started</p>
                        </div>
                        <form onSubmit={handleRegister} className="grid grid-cols-2 gap-x-6 gap-y-3.5 pb-2">
                            <div className="col-span-2 space-y-1">
                                <label className="text-[10px] font-black uppercase tracking-widest text-[#9c8670]">Full Legal Name</label>
                                <input type="text" value={regName} onChange={(e) => setRegName(e.target.value)} className="form-input-premium" placeholder="John Doe" required />
                            </div>
                            <div className="space-y-1">
                                <label className="text-[10px] font-black uppercase tracking-widest text-[#9c8670]">Email</label>
                                <input type="email" value={regEmail} onChange={(e) => setRegEmail(e.target.value)} className="form-input-premium" placeholder="name@email.com" required />
                            </div>
                            <div className="space-y-1">
                                <label className="text-[10px] font-black uppercase tracking-widest text-[#9c8670]">Phone</label>
                                <input type="tel" value={regPhone} onChange={(e) => setRegPhone(e.target.value)} className="form-input-premium" placeholder="09XX..." required />
                            </div>
                            <div className="col-span-2 space-y-1">
                                <label className="text-[10px] font-black uppercase tracking-widest text-[#9c8670]">Complete Address</label>
                                <input type="text" value={regAddress} onChange={(e) => setRegAddress(e.target.value)} className="form-input-premium" placeholder="Street, House No., etc." required />
                            </div>
                            <div className="space-y-1 relative">
                                <label className="text-[10px] font-black uppercase tracking-widest text-[#9c8670]">Password</label>
                                <div className="relative">
                                    <input
                                        type={showRegPassword ? "text" : "password"}
                                        value={regPassword}
                                        onChange={(e) => setRegPassword(e.target.value)}
                                        className="form-input-premium pr-12"
                                        placeholder="••••••••"
                                        required
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setShowRegPassword(!showRegPassword)}
                                        className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-[#F97316]"
                                    >
                                        {showRegPassword ? <EyeOffIcon size={18} /> : <EyeIcon size={18} />}
                                    </button>
                                </div>
                            </div>
                            <div className="space-y-1">
                                <label className="text-[10px] font-black uppercase tracking-widest text-[#9c8670]">Confirm</label>
                                <input
                                    type={showRegPassword ? "text" : "password"}
                                    value={regConfirmPassword}
                                    onChange={(e) => setRegConfirmPassword(e.target.value)}
                                    className="form-input-premium"
                                    placeholder="••••••••"
                                    required
                                />
                            </div>
                            {error && isRegistering && (
                                <div className="col-span-2 bg-red-50 text-red-600 p-3 rounded-xl border border-red-100 text-xs font-bold animate-in fade-in slide-in-from-top-1">
                                    ⚠️ {error}
                                </div>
                            )}

                            <div className="col-span-2 pt-4">
                                <p className="text-center text-xs font-black text-gray-400 uppercase tracking-widest mb-6">
                                    Already have an account? <button type="button" onClick={() => setIsRegistering(false)} className="text-[#F97316] hover:underline ml-1">Sign In</button>
                                </p>
                                <Button type="submit" variant="primary" size="lg" className="w-full py-6 bg-[#F97316] rounded-2xl shadow-xl text-white font-black uppercase tracking-widest text-sm" disabled={loading}>
                                    {loading ? 'CREATING...' : 'COMPLETE REGISTRATION'}
                                </Button>
                            </div>
                        </form>
                    </div>
                </div>
            </div>

            {/* 2. RIGHT SIDE CONTENT AREA */}
            <div className="w-full lg:w-1/2 h-full relative">
                {/* Global Back Button for Right Side (Mobile) */}
                <button
                    onClick={() => navigate('/')}
                    className="lg:hidden absolute top-6 left-6 flex items-center space-x-2 text-[#9c8670] hover:text-[#F97316] transition-all group z-[60]"
                >
                    <div className="w-8 h-8 rounded-full border-2 border-[#ede8e0] group-hover:border-[#F97316] flex items-center justify-center transition-all">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                        </svg>
                    </div>
                </button>

                {/* Login Form shows here when isRegistering is FALSE */}
                <div className={`absolute inset-0 flex flex-col items-center justify-center p-8 md:p-24 transition-all duration-1000 ${!isRegistering ? 'opacity-100 translate-x-0' : 'opacity-0 translate-x-20 pointer-events-none'}`}>
                    {/* Desktop Back Button for Login */}
                    <button
                        onClick={() => navigate('/')}
                        className="hidden lg:flex absolute top-12 left-12 items-center space-x-2 text-[#9c8670] hover:text-[#F97316] transition-all group"
                    >
                        <div className="w-10 h-10 rounded-full border-2 border-[#ede8e0] group-hover:border-[#F97316] flex items-center justify-center transition-all">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                            </svg>
                        </div>
                        <span className="text-xs font-black uppercase tracking-widest opacity-0 -translate-x-2 group-hover:opacity-100 group-hover:translate-x-0 transition-all">Back</span>
                    </button>
                    {/* Internal Back Button for Login */}


                    <div className="w-full max-w-md">
                        <div className="mb-6 md:mb-10">
                            <h2 className="text-4xl md:text-6xl font-black text-[#1a1208] mb-2 md:mb-4 uppercase tracking-tighter leading-none">SIGN IN</h2>
                            <div className="h-1.5 md:h-2 w-16 md:w-24 bg-[#F97316] rounded-full mb-4 md:mb-6" />
                            <p className="text-gray-400 font-bold text-xs md:text-base tracking-widest uppercase">Welcome back, resident!</p>
                        </div>
                        <form onSubmit={handleLogin} className="space-y-6">
                            <div className="space-y-2">
                                <label className="text-xs font-black uppercase tracking-widest text-[#9c8670]">Email Address</label>
                                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="form-input-premium text-lg py-6" placeholder="name@example.com" required />
                            </div>
                            <div className="space-y-2">
                                <label className="text-xs font-black uppercase tracking-widest text-[#9c8670]">Password</label>
                                <div className="relative group">
                                    <input
                                        type={showPassword ? "text" : "password"}
                                        value={password}
                                        onChange={(e) => setPassword(e.target.value)}
                                        className="form-input-premium text-base md:text-lg py-4 md:py-6 pr-14 md:pr-16"
                                        placeholder="••••••••"
                                        required
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setShowPassword(!showPassword)}
                                        className="absolute right-4 md:right-6 top-1/2 -translate-y-1/2 text-gray-400 hover:text-[#F97316] transition-colors"
                                    >
                                        {showPassword ? <EyeOffIcon size={20} /> : <EyeIcon size={20} />}
                                    </button>
                                </div>
                            </div>

                            {error && !isRegistering && (
                                <div className="bg-red-50 text-red-600 p-4 rounded-2xl border border-red-100 text-xs font-bold animate-in fade-in slide-in-from-top-1">
                                    ⚠️ {error}
                                </div>
                            )}

                            <p className="text-center text-sm font-black text-gray-400 uppercase tracking-widest mb-10">
                                Don't have an account? <button type="button" onClick={() => setIsRegistering(true)} className="text-[#F97316] hover:underline ml-2">Create Account</button>
                            </p>

                            <Button type="submit" variant="primary" size="lg" className="w-full py-4 md:py-6 bg-[#F97316] rounded-2xl md:rounded-[24px] shadow-2xl text-white font-black uppercase tracking-[0.2em] md:tracking-[0.3em] text-sm md:text-lg active:scale-95" disabled={loading}>
                                {loading ? 'AUTHENTICATING...' : 'SIGN IN'}
                            </Button>
                        </form>
                    </div>
                </div>

                {/* Mobile version of Registration (shows when isRegistering is TRUE) */}
                <div className={`lg:hidden absolute inset-0 flex flex-col items-center p-6 pt-24 overflow-y-auto bg-white transition-all duration-700 ${isRegistering ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
                    <div className="w-full max-w-sm pb-10">
                        <div className="mb-8">
                            <h2 className="text-4xl font-black text-[#1a1208] mb-2 uppercase tracking-tighter">CREATE ACCOUNT</h2>
                            <div className="h-1.5 w-16 bg-[#F97316] rounded-full mb-3" />
                            <p className="text-gray-400 font-bold text-[10px] tracking-widest uppercase">Join the StraySafe community</p>
                        </div>

                        <form onSubmit={handleRegister} className="space-y-4">
                            <div className="space-y-1">
                                <label className="text-[10px] font-black uppercase tracking-widest text-[#9c8670]">Full Name</label>
                                <input type="text" value={regName} onChange={(e) => setRegName(e.target.value)} className="form-input-premium" placeholder="John Doe" required />
                            </div>
                            <div className="space-y-1">
                                <label className="text-[10px] font-black uppercase tracking-widest text-[#9c8670]">Email</label>
                                <input type="email" value={regEmail} onChange={(e) => setRegEmail(e.target.value)} className="form-input-premium" placeholder="name@email.com" required />
                            </div>
                            <div className="space-y-1">
                                <label className="text-[10px] font-black uppercase tracking-widest text-[#9c8670]">Phone</label>
                                <input type="tel" value={regPhone} onChange={(e) => setRegPhone(e.target.value)} className="form-input-premium" placeholder="09XX..." required />
                            </div>
                            <div className="space-y-1">
                                <label className="text-[10px] font-black uppercase tracking-widest text-[#9c8670]">Address</label>
                                <input type="text" value={regAddress} onChange={(e) => setRegAddress(e.target.value)} className="form-input-premium" placeholder="Street, House No." required />
                            </div>
                            <div className="space-y-1 relative">
                                <label className="text-[10px] font-black uppercase tracking-widest text-[#9c8670]">Password</label>
                                <div className="relative">
                                    <input
                                        type={showRegPassword ? "text" : "password"}
                                        value={regPassword}
                                        onChange={(e) => setRegPassword(e.target.value)}
                                        className="form-input-premium pr-12"
                                        placeholder="••••••••"
                                        required
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setShowRegPassword(!showRegPassword)}
                                        className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400"
                                    >
                                        {showRegPassword ? <EyeOffIcon size={18} /> : <EyeIcon size={18} />}
                                    </button>
                                </div>
                            </div>
                            <div className="space-y-1">
                                <label className="text-[10px] font-black uppercase tracking-widest text-[#9c8670]">Confirm Password</label>
                                <input
                                    type={showRegPassword ? "text" : "password"}
                                    value={regConfirmPassword}
                                    onChange={(e) => setRegConfirmPassword(e.target.value)}
                                    className="form-input-premium"
                                    placeholder="••••••••"
                                    required
                                />
                            </div>

                            {error && isRegistering && (
                                <div className="bg-red-50 text-red-600 p-3 rounded-xl border border-red-100 text-[10px] font-bold">
                                    ⚠️ {error}
                                </div>
                            )}

                            <div className="pt-4">
                                <p className="text-center text-[10px] font-black text-gray-400 uppercase tracking-widest mb-6">
                                    Already have an account? <button type="button" onClick={() => setIsRegistering(false)} className="text-[#F97316] hover:underline ml-1">Sign In</button>
                                </p>
                                <Button type="submit" variant="primary" className="w-full py-4 bg-[#F97316] text-white font-black rounded-2xl uppercase tracking-widest text-xs shadow-lg" disabled={loading}>
                                    {loading ? 'CREATING...' : 'REGISTER NOW'}
                                </Button>
                            </div>
                        </form>
                    </div>
                </div>
            </div>

            {/* 3. SLIDING BRANDING PANEL */}
            <div
                className={`absolute top-0 bottom-0 w-1/2 bg-[#F97316] z-50 transition-all duration-1000 cubic-bezier(0.4, 0, 0.2, 1) hidden lg:flex flex-col items-center justify-center text-white p-20 overflow-hidden ${isRegistering ? 'translate-x-full' : 'translate-x-0'
                    }`}
            >
                <div className="absolute inset-0 opacity-15 pointer-events-none">
                    <img src="/SSLOGO.png" alt="" className="w-full h-full object-cover scale-110 rotate-12" />
                </div>
                <div className="relative z-10 flex flex-col items-center text-center max-w-lg">
                    <img src="/SSLOGO.png" alt="Logo" className="w-64 h-auto mb-2 brightness-0 invert" />
                    {isRegistering ? (
                        <div className="animate-in fade-in duration-1000">
                            <h2 className="text-5xl font-black mb-2 uppercase tracking-tight leading-tight">ALREADY<br />A MEMBER?</h2>
                            <p className="text-lg text-orange-50 font-medium leading-relaxed italic opacity-90">"The greatness of a nation can be judged by the way its animals are treated."</p>
                        </div>
                    ) : (
                        <div className="animate-in fade-in duration-1000">
                            <h2 className="text-5xl font-black mb-2 uppercase tracking-tight leading-tight">NEW TO<br />THE PACK?</h2>
                            <p className="text-lg text-orange-50 font-medium leading-relaxed italic opacity-90">Every report you make brings a stray animal one step closer to a warm bed and a full bowl.</p>
                        </div>
                    )}
                </div>
            </div>

            <SuccessModal
                isOpen={showSuccess}
                message={successMessage}
            />

            <style>{`
                .form-input-premium {
                    width: 100%;
                    background: #FAFAF9;
                    border: 2px solid #ede8e0;
                    color: #1a1208;
                    border-radius: 1.5rem;
                    padding-left: 1.5rem;
                    padding-right: 1.5rem;
                    padding-top: 1rem;
                    padding-bottom: 1rem;
                    font-weight: 700;
                    transition: all 0.3s;
                    outline: none;
                    font-size: 0.825rem;
                }
                .form-input-premium:focus {
                    border-color: #F97316;
                    box-shadow: 0 0 0 4px rgba(249, 115, 22, 0.1);
                    background: white;
                }
                .custom-scrollbar::-webkit-scrollbar { width: 4px; }
                .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
                .custom-scrollbar::-webkit-scrollbar-thumb { background: #ede8e0; border-radius: 10px; }
                .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #F97316; }
            `}</style>
        </div>
    );
};

export default ResidentsLogin;
