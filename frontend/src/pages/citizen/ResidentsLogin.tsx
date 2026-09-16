import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import Button from '../../components/Button';
import { EyeIcon, EyeOffIcon } from '../../components/icon';
import SuccessModal from '../../components/Modals/SuccessModal';
import { useTheme } from '../../context/ThemeContext';
import { clearAuthStorage } from '../../utils/api';

const GoogleIcon = () => (
    <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24">
        <path
            fill="#4285F4"
            d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
        />
        <path
            fill="#34A853"
            d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
        />
        <path
            fill="#FBBC05"
            d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
        />
        <path
            fill="#EA4335"
            d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
        />
    </svg>
);

const ResidentsLogin = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const destinationPath = (location.state as any)?.from || '/resident-home';
    const { setTheme } = useTheme();

    useEffect(() => {
        setTheme('light');
    }, [setTheme]);

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

    // Google Auth Modal State
    const [showGoogleModal, setShowGoogleModal] = useState(false);
    const [googleAuthMode, setGoogleAuthMode] = useState<'login' | 'register'>('login');
    const [googleEmailInput, setGoogleEmailInput] = useState('');
    const [googleNameInput, setGoogleNameInput] = useState('');

    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const [showSuccess, setShowSuccess] = useState(false);
    const [successMessage, setSuccessMessage] = useState('');
    const [registeredUserData, setRegisteredUserData] = useState<any>(null);

    useEffect(() => {
        if (showSuccess && registeredUserData) {
            const timer = setTimeout(() => {
                clearAuthStorage();
                localStorage.setItem('resident_user', JSON.stringify(registeredUserData));
                navigate(destinationPath);
            }, 3000); // 3 seconds delay
            return () => clearTimeout(timer);
        }
    }, [showSuccess, registeredUserData, navigate, destinationPath]);

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

            // Clear ALL previous session storage to prevent cross-role contamination
            clearAuthStorage();

            // Store session info
            if (data.access_token) {
                localStorage.setItem('access_token', data.access_token);
            }
            localStorage.setItem('resident_user', JSON.stringify(data));
            navigate(destinationPath);
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
        } catch (err) {
            setError('Connection error. Please try again later.');
        } finally {
            setLoading(false);
        }
    };

    const openGoogleAuthModal = (mode: 'login' | 'register') => {
        setError('');
        setGoogleAuthMode(mode);
        if (mode === 'register' && regEmail) {
            setGoogleEmailInput(regEmail);
            setGoogleNameInput(regName);
        } else if (mode === 'login' && email) {
            setGoogleEmailInput(email);
            setGoogleNameInput('');
        } else {
            setGoogleEmailInput('');
            setGoogleNameInput('');
        }
        setShowGoogleModal(true);
    };

    const handleGoogleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!googleEmailInput.trim()) return;

        setError('');
        setLoading(true);

        try {
            const cleanEmail = googleEmailInput.trim().toLowerCase();
            const cleanName = googleNameInput.trim() || cleanEmail.split('@')[0].replace(/[._]/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
            const avatarUrl = `https://ui-avatars.com/api/?name=${encodeURIComponent(cleanName)}&background=F97316&color=fff&bold=true`;

            const res = await fetch('http://127.0.0.1:8000/auth/google', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    email: cleanEmail,
                    name: cleanName,
                    profile_picture: avatarUrl
                }),
            });

            const data = await res.json();

            if (!res.ok) {
                setError(data.detail || 'Google authentication failed.');
                setLoading(false);
                return;
            }

            if (data.role_id !== 1) {
                setError('Access denied. This portal is for residents only.');
                setLoading(false);
                return;
            }

            setShowGoogleModal(false);
            clearAuthStorage();
            if (data.access_token) {
                localStorage.setItem('access_token', data.access_token);
            }
            localStorage.setItem('resident_user', JSON.stringify(data));

            if (googleAuthMode === 'register') {
                setRegisteredUserData(data);
                setSuccessMessage(`Welcome, ${data.name || 'Resident'}! Your Google account has been connected.`);
                setShowSuccess(true);
            } else {
                navigate(destinationPath);
            }
        } catch (err) {
            setError('Cannot connect to server. Make sure the backend is running.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 w-screen h-screen bg-white dark:bg-gray-900 text-[#1a1208] dark:text-gray-100 transition-colors duration-200 overflow-y-auto lg:overflow-hidden flex font-sans">

            {/* 1. LEFT SIDE CONTENT AREA */}
            <div className="w-1/2 h-full relative hidden lg:block">
                {/* Registration Form shows here when isRegistering is TRUE */}
                <div className={`absolute inset-0 flex flex-col items-center justify-center p-20 transition-all duration-1000 ${isRegistering ? 'opacity-100 translate-x-0' : 'opacity-0 -translate-x-20 pointer-events-none'}`}>
                    {/* Internal Back Button for Registration */}
                    <button
                        onClick={() => navigate('/')}
                        className="absolute top-12 left-12 flex items-center space-x-2 text-[#9c8670] hover:text-[#F97316] transition-all group cursor-pointer"
                    >
                        <div className="w-10 h-10 rounded-full border-2 border-[#ede8e0] group-hover:border-[#F97316] flex items-center justify-center transition-all">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                            </svg>
                        </div>
                        <span className="text-xs font-black uppercase tracking-widest opacity-0 -translate-x-2 group-hover:opacity-100 group-hover:translate-x-0 transition-all">Home</span>
                    </button>

                    <div className="w-full max-w-xl h-full flex flex-col justify-center">
                        <div className="mb-4">
                            <h2 className="text-4xl font-black text-[#1a1208] mb-1.5 uppercase tracking-tighter leading-none">JOIN THE PACK</h2>
                            <div className="h-1.5 w-20 bg-[#F97316] rounded-full mb-3" />
                            <p className="text-gray-400 font-bold text-xs tracking-widest uppercase">Fill up the form to get started</p>
                        </div>

                        <form onSubmit={handleRegister} className="grid grid-cols-2 gap-x-6 gap-y-3 pb-2">
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
                                        className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-[#F97316] cursor-pointer"
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

                            <div className="col-span-2 pt-2">
                                <p className="text-center text-xs font-black text-gray-400 uppercase tracking-widest mb-4">
                                    Already have an account? <button type="button" onClick={() => setIsRegistering(false)} className="text-[#F97316] hover:underline ml-1 cursor-pointer">Sign In</button>
                                </p>
                                <Button type="submit" variant="primary" size="lg" className="w-full py-5 bg-[#F97316] rounded-2xl shadow-xl text-white font-black uppercase tracking-widest text-sm" disabled={loading}>
                                    {loading ? 'CREATING...' : 'COMPLETE REGISTRATION'}
                                </Button>

                                {/* Sign Up with Google Button */}
                                <div className="relative flex items-center justify-center my-4">
                                    <div className="border-t border-gray-200 w-full" />
                                    <span className="bg-white px-3 text-[9px] font-black text-gray-400 uppercase tracking-widest absolute">
                                        Or register with Google
                                    </span>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => openGoogleAuthModal('register')}
                                    disabled={loading}
                                    className="w-full py-3.5 px-4 bg-white hover:bg-orange-50/40 border-2 border-[#ede8e0] hover:border-[#F97316] text-[#1a1208] rounded-2xl font-black text-xs uppercase tracking-wider flex items-center justify-center gap-3 transition-all shadow-xs hover:shadow-md cursor-pointer active:scale-98 disabled:opacity-60"
                                >
                                    <GoogleIcon />
                                    <span>Sign up with Google</span>
                                </button>
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
                    className="lg:hidden absolute top-6 left-6 flex items-center space-x-2 text-[#9c8670] hover:text-[#F97316] transition-all group z-[60] cursor-pointer"
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
                        className="hidden lg:flex absolute top-12 left-12 items-center space-x-2 text-[#9c8670] hover:text-[#F97316] transition-all group cursor-pointer"
                    >
                        <div className="w-10 h-10 rounded-full border-2 border-[#ede8e0] group-hover:border-[#F97316] flex items-center justify-center transition-all">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                            </svg>
                        </div>
                        <span className="text-xs font-black uppercase tracking-widest opacity-0 -translate-x-2 group-hover:opacity-100 group-hover:translate-x-0 transition-all">Back</span>
                    </button>

                    <div className="w-full max-w-md">
                        <div className="mb-4 md:mb-6">
                            <h2 className="text-4xl md:text-5xl font-black text-[#1a1208] mb-1.5 md:mb-3 uppercase tracking-tighter leading-none">SIGN IN</h2>
                            <div className="h-1.5 md:h-2 w-16 md:w-20 bg-[#F97316] rounded-full mb-3 md:mb-4" />
                            <p className="text-gray-400 font-bold text-xs md:text-sm tracking-widest uppercase">Welcome back, resident!</p>
                        </div>

                        <form onSubmit={handleLogin} className="space-y-4 md:space-y-5">
                            <div className="space-y-1.5">
                                <label className="text-xs font-black uppercase tracking-widest text-[#9c8670]">Email Address</label>
                                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="form-input-premium text-base md:text-lg py-3.5 md:py-4" placeholder="name@example.com" required />
                            </div>
                            <div className="space-y-1.5">
                                <label className="text-xs font-black uppercase tracking-widest text-[#9c8670]">Password</label>
                                <div className="relative group">
                                    <input
                                        type={showPassword ? "text" : "password"}
                                        value={password}
                                        onChange={(e) => setPassword(e.target.value)}
                                        className="form-input-premium text-base md:text-lg py-3.5 md:py-4 pr-14 md:pr-16"
                                        placeholder="••••••••"
                                        required
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setShowPassword(!showPassword)}
                                        className="absolute right-4 md:right-6 top-1/2 -translate-y-1/2 text-gray-400 hover:text-[#F97316] transition-colors cursor-pointer"
                                    >
                                        {showPassword ? <EyeOffIcon size={20} /> : <EyeIcon size={20} />}
                                    </button>
                                </div>
                            </div>

                            {error && !isRegistering && (
                                <div className="bg-red-50 text-red-600 p-3.5 rounded-2xl border border-red-100 text-xs font-bold animate-in fade-in slide-in-from-top-1">
                                    ⚠️ {error}
                                </div>
                            )}

                            <p className="text-center text-xs md:text-sm font-black text-gray-400 uppercase tracking-widest mb-6">
                                Don't have an account? <button type="button" onClick={() => setIsRegistering(true)} className="text-[#F97316] hover:underline ml-2 cursor-pointer">Create Account</button>
                            </p>

                            <Button type="submit" variant="primary" size="lg" className="w-full py-4 md:py-5 bg-[#F97316] rounded-2xl md:rounded-[22px] shadow-2xl text-white font-black uppercase tracking-[0.2em] md:tracking-[0.25em] text-sm md:text-base active:scale-95" disabled={loading}>
                                {loading ? 'AUTHENTICATING...' : 'SIGN IN'}
                            </Button>

                            {/* Sign In with Google Button */}
                            <div className="relative flex items-center justify-center my-5">
                                <div className="border-t border-gray-200 w-full" />
                                <span className="bg-white px-3 text-[10px] font-black text-gray-400 uppercase tracking-widest absolute">
                                    Or continue with Google
                                </span>
                            </div>

                            <button
                                type="button"
                                onClick={() => openGoogleAuthModal('login')}
                                disabled={loading}
                                className="w-full py-3.5 md:py-4 px-4 bg-white hover:bg-orange-50/40 border-2 border-[#ede8e0] hover:border-[#F97316] text-[#1a1208] rounded-2xl md:rounded-[22px] font-black text-xs md:text-sm uppercase tracking-wider flex items-center justify-center gap-3 transition-all shadow-xs hover:shadow-md cursor-pointer active:scale-98 disabled:opacity-60"
                            >
                                <GoogleIcon />
                                <span>Sign in with Google</span>
                            </button>
                        </form>
                    </div>
                </div>

                {/* Mobile version of Registration (shows when isRegistering is TRUE) */}
                <div className={`lg:hidden absolute inset-0 flex flex-col items-center p-6 pt-20 overflow-y-auto bg-white transition-all duration-700 ${isRegistering ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
                    <div className="w-full max-w-sm pb-10">
                        <div className="mb-6">
                            <h2 className="text-3xl font-black text-[#1a1208] mb-1.5 uppercase tracking-tighter">CREATE ACCOUNT</h2>
                            <div className="h-1.5 w-16 bg-[#F97316] rounded-full mb-2.5" />
                            <p className="text-gray-400 font-bold text-[10px] tracking-widest uppercase">Join the StraySafe community</p>
                        </div>

                        <form onSubmit={handleRegister} className="space-y-3.5">
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
                                        className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 cursor-pointer"
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

                            <div className="pt-3">
                                <p className="text-center text-[10px] font-black text-gray-400 uppercase tracking-widest mb-4">
                                    Already have an account? <button type="button" onClick={() => setIsRegistering(false)} className="text-[#F97316] hover:underline ml-1 cursor-pointer">Sign In</button>
                                </p>
                                <Button type="submit" variant="primary" className="w-full py-4 bg-[#F97316] text-white font-black rounded-2xl uppercase tracking-widest text-xs shadow-lg" disabled={loading}>
                                    {loading ? 'CREATING...' : 'REGISTER NOW'}
                                </Button>

                                {/* Mobile Sign Up with Google Button */}
                                <div className="relative flex items-center justify-center my-4">
                                    <div className="border-t border-gray-200 w-full" />
                                    <span className="bg-white px-2.5 text-[9px] font-black text-gray-400 uppercase tracking-widest absolute">
                                        Or register with Google
                                    </span>
                                </div>

                                <button
                                    type="button"
                                    onClick={() => openGoogleAuthModal('register')}
                                    disabled={loading}
                                    className="w-full py-3.5 px-4 bg-white hover:bg-orange-50/40 border-2 border-[#ede8e0] hover:border-[#F97316] text-[#1a1208] rounded-2xl font-black text-xs uppercase tracking-wider flex items-center justify-center gap-3 transition-all shadow-xs cursor-pointer active:scale-98 disabled:opacity-60"
                                >
                                    <GoogleIcon />
                                    <span>Sign up with Google</span>
                                </button>
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

            {/* 4. GOOGLE AUTH DIALOG MODAL */}
            {showGoogleModal && (
                <div className="fixed inset-0 z-[999] bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-200">
                    <div className="bg-white rounded-3xl shadow-2xl border border-gray-100 w-full max-w-md p-6 sm:p-8 animate-in zoom-in-95 duration-200 relative overflow-hidden">
                        {/* Top Google Header Banner */}
                        <div className="flex items-center justify-between pb-4 border-b border-gray-100 mb-6">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-2xl bg-gray-50 border border-gray-200 flex items-center justify-center shadow-xs">
                                    <GoogleIcon />
                                </div>
                                <div>
                                    <h3 className="text-base font-black text-gray-900 uppercase tracking-tight">
                                        {googleAuthMode === 'login' ? 'Sign in with Google' : 'Sign up with Google'}
                                    </h3>
                                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">
                                        StraySafe Resident Access
                                    </p>
                                </div>
                            </div>
                            <button
                                type="button"
                                onClick={() => setShowGoogleModal(false)}
                                className="w-8 h-8 rounded-full bg-gray-100 hover:bg-gray-200 text-gray-500 flex items-center justify-center text-sm font-bold transition-all cursor-pointer"
                            >
                                ✕
                            </button>
                        </div>

                        {/* Google Auth Form */}
                        <form onSubmit={handleGoogleSubmit} className="space-y-4">
                            <div className="space-y-1.5">
                                <label className="text-[10px] font-black uppercase tracking-widest text-[#9c8670]">
                                    Google Account Email
                                </label>
                                <input
                                    type="email"
                                    value={googleEmailInput}
                                    onChange={(e) => setGoogleEmailInput(e.target.value)}
                                    placeholder="yourname@gmail.com"
                                    className="form-input-premium text-sm py-3.5"
                                    required
                                    autoFocus
                                />
                            </div>

                            <div className="space-y-1.5">
                                <label className="text-[10px] font-black uppercase tracking-widest text-[#9c8670]">
                                    Display Name <span className="text-gray-400 font-normal">(Optional)</span>
                                </label>
                                <input
                                    type="text"
                                    value={googleNameInput}
                                    onChange={(e) => setGoogleNameInput(e.target.value)}
                                    placeholder="Your Name"
                                    className="form-input-premium text-sm py-3.5"
                                />
                            </div>

                            <div className="p-3 bg-orange-50/70 rounded-2xl border border-orange-200/60 text-[11px] font-semibold text-orange-900 flex items-center gap-2.5">
                                <span className="text-base shrink-0">🛡️</span>
                                <span>Fast and secure resident authentication powered by Google OAuth.</span>
                            </div>

                            <div className="pt-2 flex gap-3">
                                <button
                                    type="button"
                                    onClick={() => setShowGoogleModal(false)}
                                    className="w-1/3 py-3.5 bg-gray-100 hover:bg-gray-200 text-gray-700 font-black rounded-2xl text-xs uppercase tracking-wider transition-all cursor-pointer"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    disabled={loading || !googleEmailInput.trim()}
                                    className="w-2/3 py-3.5 bg-[#F97316] hover:bg-[#ea580c] text-white font-black rounded-2xl text-xs uppercase tracking-wider shadow-lg flex items-center justify-center gap-2 transition-all cursor-pointer disabled:opacity-50"
                                >
                                    <GoogleIcon />
                                    <span>{loading ? 'Connecting...' : `Continue with Google`}</span>
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

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
                    padding-top: 0.875rem;
                    padding-bottom: 0.875rem;
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
