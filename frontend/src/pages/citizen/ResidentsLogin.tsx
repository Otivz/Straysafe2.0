import { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import Button from '../../components/Button';
import { EyeIcon, EyeOffIcon } from '../../components/icon';
import SuccessModal from '../../components/Modals/SuccessModal';
import { useTheme } from '../../context/ThemeContext';
import { api, clearAuthStorage } from '../../utils/api';

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

interface SubdivisionOption {
    subdivision_id: number;
    subdivision_name: string;
    barangay_name?: string;
}

const ResidentsLogin = () => {
    const navigate = useNavigate();
    const location = useLocation();
    
    // Resolve previous attempted path, strictly ensuring staff or admin paths never bleed into resident login
    const locationState = location.state as any;
    const rawFrom = typeof locationState?.from === 'string'
        ? locationState.from
        : locationState?.from?.pathname;

    const isResidentAllowedPath = (path?: string): boolean => {
        if (!path || typeof path !== 'string') return false;
        const normalized = path.toLowerCase().trim();
        if (
            normalized.startsWith('/subd') ||
            normalized.startsWith('/brgy') ||
            normalized.startsWith('/admin') ||
            normalized.startsWith('/staff') ||
            normalized.includes('/login') ||
            normalized === '/adopt'
        ) {
            return false;
        }
        return true;
    };

    const destinationPath = (rawFrom && isResidentAllowedPath(rawFrom)) ? rawFrom : '/resident-home';

    const { setTheme } = useTheme();

    useEffect(() => {
        setTheme('light');
    }, [setTheme]);

    const [isRegistering, setIsRegistering] = useState(false);

    // Standard Login State
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);

    // Standard Register State
    const [regName, setRegName] = useState('');
    const [regEmail, setRegEmail] = useState('');
    const [regPhone, setRegPhone] = useState('');
    const [regAddress, setRegAddress] = useState('');
    const [regPassword, setRegPassword] = useState('');
    const [regConfirmPassword, setRegConfirmPassword] = useState('');
    const [showRegPassword, setShowRegPassword] = useState(false);

    // Google Auth Modal & Multi-Step Verification State
    // Steps: 'google_prompt' | 'complete_details' | 'otp_verification' | null
    const [googleModalStep, setGoogleModalStep] = useState<'google_prompt' | 'complete_details' | 'otp_verification' | null>(null);
    const [googleAuthMode, setGoogleAuthMode] = useState<'login' | 'register'>('login');
    const [googleEmailInput, setGoogleEmailInput] = useState('');
    const [googleNameInput, setGoogleNameInput] = useState('');

    // Profile Completion State for Google/Unverified Users
    const [compUserId, setCompUserId] = useState<number | null>(null);
    const [compEmail, setCompEmail] = useState('');
    const [compName, setCompName] = useState('');
    const [compPhone, setCompPhone] = useState('');
    const [compSubdivisionId, setCompSubdivisionId] = useState<number>(1);
    const [compAddress, setCompAddress] = useState('');
    const [compPicture, setCompPicture] = useState('');

    // Subdivision options
    const [subdivisions, setSubdivisions] = useState<SubdivisionOption[]>([
        { subdivision_id: 1, subdivision_name: 'Selera Homes', barangay_name: 'San Vicente' }
    ]);

    // OTP State
    const [otpDigits, setOtpDigits] = useState<string[]>(['', '', '', '', '', '']);
    const [otpError, setOtpError] = useState('');
    const [otpTimer, setOtpTimer] = useState(300);
    const [resendCooldown, setResendCooldown] = useState(0);
    const [devOtp, setDevOtp] = useState<string | null>(null);

    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const [showSuccess, setShowSuccess] = useState(false);
    const [successMessage, setSuccessMessage] = useState('');
    const [registeredUserData, setRegisteredUserData] = useState<any>(null);

    const otpInputRefs = useRef<(HTMLInputElement | null)[]>([]);

    useEffect(() => {
        const fetchSubdivisions = async () => {
            try {
                const res = await api.get('/auth/subdivisions');
                if (res.data && Array.isArray(res.data) && res.data.length > 0) {
                    setSubdivisions(res.data);
                }
            } catch (err) {
                // Fallback default exists
            }
        };
        fetchSubdivisions();
    }, []);

    // OTP Countdown Timer
    useEffect(() => {
        let interval: any = null;
        if (googleModalStep === 'otp_verification') {
            interval = setInterval(() => {
                setOtpTimer((prev) => (prev > 0 ? prev - 1 : 0));
                setResendCooldown((prev) => (prev > 0 ? prev - 1 : 0));
            }, 1000);
        }
        return () => {
            if (interval) clearInterval(interval);
        };
    }, [googleModalStep]);

    useEffect(() => {
        if (showSuccess && registeredUserData) {
            const timer = setTimeout(() => {
                clearAuthStorage();
                if (registeredUserData.access_token) {
                    localStorage.setItem('access_token', registeredUserData.access_token);
                }
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
            const res = await api.post('/auth/login', { email, password });
            const data = res.data;

            // Restrict login to only Role ID 1 (Residents)
            if (data.role_id !== 1) {
                setError('Access denied. This portal is for residents only.');
                setLoading(false);
                return;
            }

            // Check if resident requires profile completion or OTP
            if (data.requires_profile_completion) {
                setCompUserId(data.user_id);
                setCompEmail(data.email);
                setCompName(data.name || '');
                setCompPhone(data.phone || '');
                setCompSubdivisionId(data.subdivision_id || 1);
                setCompAddress(data.address || '');
                setGoogleModalStep('complete_details');
                setLoading(false);
                return;
            }

            if (data.requires_otp) {
                setCompUserId(data.user_id);
                setCompEmail(data.email);
                setCompPhone(data.phone || '');
                setDevOtp(data.dev_otp || null);
                setOtpDigits(['', '', '', '', '', '']);
                setOtpTimer(300);
                setResendCooldown(30);
                setGoogleModalStep('otp_verification');
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
        } catch (err: any) {
            setError(err.response?.data?.detail || 'Login failed. Please check your credentials or network connection.');
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
        setOtpError('');
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
        setGoogleModalStep('google_prompt');
    };

    const handleGoogleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!googleEmailInput.trim()) return;

        setError('');
        setOtpError('');
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

            setCompUserId(data.user_id);
            setCompEmail(data.email);
            setCompName(data.name || cleanName);
            setCompPhone(data.phone || '');
            setCompSubdivisionId(data.subdivision_id || 1);
            setCompAddress(data.address || '');
            setCompPicture(data.profile_picture || avatarUrl);

            // Check if user is already verified with complete profile
            if (data.is_verified && !data.requires_profile_completion && !data.requires_otp) {
                setGoogleModalStep(null);
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
                return;
            }

            // If user requires profile completion form -> Step 2
            if (data.requires_profile_completion) {
                setGoogleModalStep('complete_details');
                setLoading(false);
                return;
            }

            // If user has complete profile but requires OTP -> Step 3
            if (data.requires_otp) {
                setDevOtp(data.dev_otp || null);
                setOtpDigits(['', '', '', '', '', '']);
                setOtpTimer(300);
                setResendCooldown(30);
                setGoogleModalStep('otp_verification');
                setLoading(false);
                return;
            }
        } catch (err) {
            setError('Cannot connect to server. Make sure the backend is running.');
        } finally {
            setLoading(false);
        }
    };

    const handleCompleteProfileSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setOtpError('');

        if (!compName.trim()) {
            setError('Please enter your full name.');
            return;
        }
        if (!compPhone.trim()) {
            setError('Please enter your contact number.');
            return;
        }
        if (!compAddress.trim()) {
            setError('Please enter your complete address.');
            return;
        }

        setLoading(true);

        try {
            const res = await fetch('http://127.0.0.1:8000/auth/complete-profile', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    user_id: compUserId,
                    email: compEmail,
                    name: compName.trim(),
                    phone: compPhone.trim(),
                    subdivision_id: compSubdivisionId,
                    address: compAddress.trim()
                }),
            });

            const data = await res.json();

            if (!res.ok) {
                setError(data.detail || 'Failed to save resident details.');
                setLoading(false);
                return;
            }

            setDevOtp(data.dev_otp || null);
            setOtpDigits(['', '', '', '', '', '']);
            setOtpTimer(data.expires_in || 300);
            setResendCooldown(30);
            setGoogleModalStep('otp_verification');
        } catch (err) {
            setError('Connection error. Please check your network.');
        } finally {
            setLoading(false);
        }
    };

    const handleOtpChange = (index: number, val: string) => {
        const cleanVal = val.replace(/[^0-9]/g, '').slice(-1);
        const newDigits = [...otpDigits];
        newDigits[index] = cleanVal;
        setOtpDigits(newDigits);
        setOtpError('');

        if (cleanVal && index < 5) {
            otpInputRefs.current[index + 1]?.focus();
        }
    };

    const handleOtpKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Backspace' && !otpDigits[index] && index > 0) {
            otpInputRefs.current[index - 1]?.focus();
        }
    };

    const handleOtpPaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
        e.preventDefault();
        const pasted = e.clipboardData.getData('text').replace(/[^0-9]/g, '').slice(0, 6);
        if (!pasted) return;
        const newDigits = [...otpDigits];
        for (let i = 0; i < pasted.length; i++) {
            newDigits[i] = pasted[i];
        }
        setOtpDigits(newDigits);
        if (pasted.length === 6) {
            otpInputRefs.current[5]?.focus();
        } else {
            otpInputRefs.current[pasted.length]?.focus();
        }
    };

    const handleVerifyOtpSubmit = async (e?: React.FormEvent) => {
        if (e) e.preventDefault();
        setOtpError('');
        setError('');

        const otpCode = otpDigits.join('');
        if (otpCode.length < 6) {
            setOtpError('Please enter all 6 digits of the verification code.');
            return;
        }

        setLoading(true);

        try {
            const res = await fetch('http://127.0.0.1:8000/auth/verify-otp', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    user_id: compUserId,
                    email: compEmail,
                    otp: otpCode
                }),
            });

            const data = await res.json();

            if (!res.ok) {
                setOtpError(data.detail || 'Verification failed. Please try again.');
                setLoading(false);
                return;
            }

            setGoogleModalStep(null);
            setRegisteredUserData(data);
            setSuccessMessage(`Welcome to the Pack, ${data.name || 'Resident'}! Your account is verified.`);
            setShowSuccess(true);
        } catch (err) {
            setOtpError('Connection error during OTP verification.');
        } finally {
            setLoading(false);
        }
    };

    const handleResendOtp = async () => {
        if (resendCooldown > 0) return;
        setOtpError('');
        setLoading(true);

        try {
            const res = await fetch('http://127.0.0.1:8000/auth/resend-otp', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    user_id: compUserId,
                    email: compEmail
                }),
            });

            const data = await res.json();

            if (!res.ok) {
                setOtpError(data.detail || 'Failed to resend code.');
                setLoading(false);
                return;
            }

            setDevOtp(data.dev_otp || null);
            setOtpDigits(['', '', '', '', '', '']);
            setOtpTimer(data.expires_in || 300);
            setResendCooldown(30);
            otpInputRefs.current[0]?.focus();
        } catch (err) {
            setOtpError('Network error while resending code.');
        } finally {
            setLoading(false);
        }
    };

    const formatTimer = (seconds: number) => {
        const m = Math.floor(seconds / 60);
        const s = seconds % 60;
        return `${m}:${s < 10 ? '0' : ''}${s}`;
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

            {/* 4. GOOGLE AUTH & OTP MULTI-STEP MODAL */}
            {googleModalStep && (
                <div className="fixed inset-0 z-[999] bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-200">
                    <div className="bg-white rounded-3xl shadow-2xl border border-gray-100 w-full max-w-md p-6 sm:p-8 animate-in zoom-in-95 duration-200 relative overflow-hidden">
                        {/* Top Header Banner */}
                        <div className="flex items-center justify-between pb-4 border-b border-gray-100 mb-6">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-2xl bg-gray-50 border border-gray-200 flex items-center justify-center shadow-xs">
                                    {googleModalStep === 'otp_verification' ? (
                                        <span className="text-xl">🛡️</span>
                                    ) : (
                                        <GoogleIcon />
                                    )}
                                </div>
                                <div>
                                    <h3 className="text-base font-black text-gray-900 uppercase tracking-tight">
                                        {googleModalStep === 'google_prompt' && (googleAuthMode === 'login' ? 'Sign in with Google' : 'Sign up with Google')}
                                        {googleModalStep === 'complete_details' && 'Complete Resident Profile'}
                                        {googleModalStep === 'otp_verification' && 'OTP Verification'}
                                    </h3>
                                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">
                                        {googleModalStep === 'google_prompt' && 'StraySafe Resident Access'}
                                        {googleModalStep === 'complete_details' && 'Step 2: Enter Resident Details'}
                                        {googleModalStep === 'otp_verification' && 'Step 3: Verify 6-Digit Code'}
                                    </p>
                                </div>
                            </div>
                            <button
                                type="button"
                                onClick={() => {
                                    setGoogleModalStep(null);
                                    setError('');
                                    setOtpError('');
                                }}
                                className="w-8 h-8 rounded-full bg-gray-100 hover:bg-gray-200 text-gray-500 flex items-center justify-center text-sm font-bold transition-all cursor-pointer"
                            >
                                ✕
                            </button>
                        </div>

                        {/* Error Notification inside modal */}
                        {(error || otpError) && (
                            <div className="mb-4 bg-red-50 text-red-600 p-3 rounded-2xl border border-red-100 text-xs font-bold animate-in fade-in">
                                ⚠️ {otpError || error}
                            </div>
                        )}

                        {/* STEP 1: Google Account Input Form */}
                        {googleModalStep === 'google_prompt' && (
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
                                        onClick={() => setGoogleModalStep(null)}
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
                        )}

                        {/* STEP 2: Profile Details Completion Form */}
                        {googleModalStep === 'complete_details' && (
                            <form onSubmit={handleCompleteProfileSubmit} className="space-y-3 max-h-[75vh] overflow-y-auto pr-1">
                                <div className="p-3 bg-gray-50 border border-gray-200 rounded-2xl flex items-center justify-between">
                                    <div className="flex items-center gap-2.5">
                                        <img
                                            src={compPicture || `https://ui-avatars.com/api/?name=${encodeURIComponent(compName || 'Resident')}&background=F97316&color=fff&bold=true`}
                                            alt="Avatar"
                                            className="w-8 h-8 rounded-full border border-orange-200"
                                        />
                                        <div>
                                            <span className="block text-xs font-black text-gray-900 leading-tight">
                                                {compEmail}
                                            </span>
                                            <span className="text-[10px] font-bold text-emerald-600">
                                                ✓ Google Authenticated
                                            </span>
                                        </div>
                                    </div>
                                    <span className="text-[10px] font-black uppercase tracking-wider text-gray-400 bg-gray-200/60 px-2 py-1 rounded-lg">
                                        Locked
                                    </span>
                                </div>

                                <div className="space-y-1">
                                    <label className="text-[10px] font-black uppercase tracking-widest text-[#9c8670]">
                                        Full Name <span className="text-red-500">*</span>
                                    </label>
                                    <input
                                        type="text"
                                        value={compName}
                                        onChange={(e) => setCompName(e.target.value)}
                                        placeholder="Juan Dela Cruz"
                                        className="form-input-premium text-xs py-3"
                                        required
                                    />
                                </div>

                                <div className="space-y-1">
                                    <label className="text-[10px] font-black uppercase tracking-widest text-[#9c8670]">
                                        Contact Number (Phone) <span className="text-red-500">*</span>
                                    </label>
                                    <input
                                        type="tel"
                                        value={compPhone}
                                        onChange={(e) => setCompPhone(e.target.value)}
                                        placeholder="09123456789"
                                        className="form-input-premium text-xs py-3"
                                        required
                                        autoFocus
                                    />
                                </div>

                                <div className="space-y-1">
                                    <label className="text-[10px] font-black uppercase tracking-widest text-[#9c8670]">
                                        Subdivision <span className="text-red-500">*</span>
                                    </label>
                                    <select
                                        value={compSubdivisionId}
                                        onChange={(e) => setCompSubdivisionId(Number(e.target.value))}
                                        className="form-input-premium text-xs py-3 cursor-pointer"
                                        required
                                    >
                                        {subdivisions.map((s) => (
                                            <option key={s.subdivision_id} value={s.subdivision_id}>
                                                {s.subdivision_name} ({s.barangay_name || 'San Vicente'})
                                            </option>
                                        ))}
                                    </select>
                                </div>

                                <div className="space-y-1">
                                    <label className="text-[10px] font-black uppercase tracking-widest text-[#9c8670]">
                                        Complete Street Address <span className="text-red-500">*</span>
                                    </label>
                                    <input
                                        type="text"
                                        value={compAddress}
                                        onChange={(e) => setCompAddress(e.target.value)}
                                        placeholder="Block 8 Lot 14, Phase 2"
                                        className="form-input-premium text-xs py-3"
                                        required
                                    />
                                </div>

                                <div className="pt-2 flex gap-3">
                                    <button
                                        type="button"
                                        onClick={() => setGoogleModalStep(null)}
                                        className="w-1/3 py-3.5 bg-gray-100 hover:bg-gray-200 text-gray-700 font-black rounded-2xl text-xs uppercase tracking-wider transition-all cursor-pointer"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        type="submit"
                                        disabled={loading || !compName.trim() || !compPhone.trim() || !compAddress.trim()}
                                        className="w-2/3 py-3.5 bg-[#F97316] hover:bg-[#ea580c] text-white font-black rounded-2xl text-xs uppercase tracking-wider shadow-lg transition-all cursor-pointer disabled:opacity-50"
                                    >
                                        {loading ? 'Saving...' : 'Save & Send OTP'}
                                    </button>
                                </div>
                            </form>
                        )}

                        {/* STEP 3: OTP 6-Digit Verification Screen */}
                        {googleModalStep === 'otp_verification' && (
                            <form onSubmit={handleVerifyOtpSubmit} className="space-y-4">
                                <div className="text-center space-y-1">
                                    <p className="text-xs font-semibold text-gray-600">
                                        Enter the 6-digit verification code sent to:
                                    </p>
                                    <div className="flex flex-wrap items-center justify-center gap-2">
                                        <span className="inline-block px-2.5 py-1 bg-orange-50 border border-orange-200 rounded-lg text-xs font-black text-orange-800">
                                            📱 {compPhone || 'Registered Mobile'}
                                        </span>
                                        <span className="inline-block px-2.5 py-1 bg-gray-100 border border-gray-200 rounded-lg text-xs font-bold text-gray-700">
                                            ✉️ {compEmail}
                                        </span>
                                    </div>
                                </div>

                                {/* Dev / Sandbox OTP Display Banner */}
                                {devOtp && (
                                    <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-2xl text-center">
                                        <span className="text-[10px] font-black uppercase tracking-widest text-emerald-700 block mb-0.5">
                                            Demo / Verification Code:
                                        </span>
                                        <span className="text-xl font-black tracking-widest text-emerald-900 font-mono">
                                            {devOtp}
                                        </span>
                                    </div>
                                )}

                                {/* 6-Box OTP Input */}
                                <div className="flex items-center justify-center gap-2 sm:gap-2.5 py-2" onPaste={handleOtpPaste}>
                                    {otpDigits.map((digit, idx) => (
                                        <input
                                            key={idx}
                                            ref={(el) => { otpInputRefs.current[idx] = el; }}
                                            type="text"
                                            inputMode="numeric"
                                            maxLength={1}
                                            value={digit}
                                            onChange={(e) => handleOtpChange(idx, e.target.value)}
                                            onKeyDown={(e) => handleOtpKeyDown(idx, e)}
                                            className="w-11 h-13 sm:w-12 sm:h-14 text-center text-xl sm:text-2xl font-black bg-gray-50 border-2 border-gray-200 focus:border-[#F97316] rounded-2xl outline-none transition-all focus:scale-105 focus:shadow-md"
                                            autoFocus={idx === 0}
                                        />
                                    ))}
                                </div>

                                {/* Timer & Resend Controls */}
                                <div className="flex items-center justify-between text-xs pt-1 px-1">
                                    <span className="text-gray-500 font-medium">
                                        ⏱️ Expires in:{' '}
                                        <strong className={otpTimer < 60 ? 'text-red-500 font-black' : 'text-gray-900 font-black'}>
                                            {formatTimer(otpTimer)}
                                        </strong>
                                    </span>

                                    <button
                                        type="button"
                                        onClick={handleResendOtp}
                                        disabled={loading || resendCooldown > 0}
                                        className="text-[#F97316] hover:underline font-black disabled:opacity-40 disabled:no-underline cursor-pointer"
                                    >
                                        {resendCooldown > 0 ? `Resend in ${resendCooldown}s` : 'Resend Code'}
                                    </button>
                                </div>

                                <div className="pt-2 flex gap-3">
                                    <button
                                        type="button"
                                        onClick={() => setGoogleModalStep(null)}
                                        className="w-1/3 py-3.5 bg-gray-100 hover:bg-gray-200 text-gray-700 font-black rounded-2xl text-xs uppercase tracking-wider transition-all cursor-pointer"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        type="submit"
                                        disabled={loading || otpDigits.join('').length < 6 || otpTimer <= 0}
                                        className="w-2/3 py-3.5 bg-[#F97316] hover:bg-[#ea580c] text-white font-black rounded-2xl text-xs uppercase tracking-wider shadow-lg flex items-center justify-center gap-2 transition-all cursor-pointer disabled:opacity-50"
                                    >
                                        <span>{loading ? 'Verifying...' : 'Verify & Sign In'}</span>
                                    </button>
                                </div>
                            </form>
                        )}
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
