import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import Button from '../../components/Button';
import { EyeIcon, EyeOffIcon } from '../../components/icon';
import { useTheme } from '../../context/ThemeContext';
import { clearAuthStorage } from '../../utils/api';
import { API_BASE_URL } from '../../utils/api';
import ForgotPasswordModal from '../../components/Modals/ForgotPasswordModal';

const AdminLogin = () => {
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
    const [showForgotPassword, setShowForgotPassword] = useState(false);

    // Second step: the code emailed after a correct password (only when the server asks for it)
    const [codeStep, setCodeStep] = useState(false);
    const [digits, setDigits] = useState<string[]>(['', '', '', '', '', '']);
    const [codeNotice, setCodeNotice] = useState('');
    const [cooldown, setCooldown] = useState(0);
    const digitRefs = useRef<(HTMLInputElement | null)[]>([]);
    const code = digits.join('');

    useEffect(() => {
        if (cooldown <= 0) return;
        const timer = setTimeout(() => setCooldown((c) => c - 1), 1000);
        return () => clearTimeout(timer);
    }, [cooldown]);

    const completeSignIn = (data: any) => {
        // Clear ALL previous session storage to prevent cross-role contamination
        clearAuthStorage();

        // Store session info
        const storage = keepSignedIn ? localStorage : sessionStorage;
        if (data.access_token) {
            storage.setItem('access_token', data.access_token);
        }
        storage.setItem('admin_user', JSON.stringify(data));
        setPassword('');

        navigate('/admin/dashboard');
    };

    const requestSignIn = async (): Promise<boolean> => {
        const res = await fetch(`${API_BASE_URL}/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password }),
        });

        const data = await res.json();

        if (!res.ok) {
            setError(data.detail || 'Login failed. Please try again.');
            return false;
        }

        if (data.role_id !== 4) {
            setError('Access denied. This portal is for Administrators only.');
            return false;
        }

        if (data.requires_login_code) {
            setCodeNotice(data.message || 'We emailed you a 6-digit sign-in code.');
            setDigits(['', '', '', '', '', '']);
            setCooldown(30);
            setCodeStep(true);
            setTimeout(() => digitRefs.current[0]?.focus(), 50);
            return true;
        }

        completeSignIn(data);
        return true;
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setLoading(true);

        try {
            await requestSignIn();
        } catch {
            setError('Cannot connect to server. Make sure the backend is running.');
        } finally {
            setLoading(false);
        }
    };

    const handleVerifyCode = async (e?: React.FormEvent) => {
        e?.preventDefault();
        setError('');
        if (code.length !== 6) {
            setError('Enter all 6 digits of the code from your email.');
            return;
        }
        setLoading(true);
        try {
            const res = await fetch(`${API_BASE_URL}/auth/admin/verify-login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ email, otp: code }),
            });
            const data = await res.json();
            if (!res.ok) {
                setError(data.detail || 'That code is invalid or has expired.');
                return;
            }
            completeSignIn(data);
        } catch {
            setError('Cannot connect to server. Make sure the backend is running.');
        } finally {
            setLoading(false);
        }
    };

    const handleResendCode = async () => {
        if (cooldown > 0 || !password) return;
        setError('');
        setLoading(true);
        try {
            await requestSignIn();
        } catch {
            setError('Cannot connect to server. Make sure the backend is running.');
        } finally {
            setLoading(false);
        }
    };

    const backToPassword = () => {
        setCodeStep(false);
        setDigits(['', '', '', '', '', '']);
        setPassword('');
        setError('');
    };

    const onDigitChange = (index: number, value: string) => {
        const clean = value.replace(/\D/g, '').slice(-1);
        const next = [...digits];
        next[index] = clean;
        setDigits(next);
        setError('');
        if (clean && index < 5) digitRefs.current[index + 1]?.focus();
    };

    const onDigitKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Backspace' && !digits[index] && index > 0) digitRefs.current[index - 1]?.focus();
    };

    const onDigitPaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
        e.preventDefault();
        const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
        if (!pasted) return;
        const next = ['', '', '', '', '', ''];
        for (let i = 0; i < pasted.length; i++) next[i] = pasted[i];
        setDigits(next);
        setError('');
        digitRefs.current[Math.min(pasted.length, 5)]?.focus();
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
                        <p className="text-white/90 text-sm font-bold tracking-widest uppercase pt-3">
                            Administrator Portal
                        </p>
                    </div>
                </div>
            </div>

            {/* Right Side: Login Form half */}
            <div className="w-full lg:w-1/2 flex flex-col items-center justify-center p-8 lg:p-24 relative z-10">
                <div className="w-full max-w-md">
                    <div className="mb-8 text-center lg:text-left flex flex-col items-center lg:items-start">
                        <img 
                            src="/SSLOGO.png" 
                            alt="StraySafe Logo" 
                            className="w-16 sm:w-20 h-auto object-contain drop-shadow-sm mb-3"
                        />
                        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-orange-50 border border-orange-200 text-orange-600 text-[11px] font-black uppercase tracking-wider mb-2.5">
                            Administrator Portal
                        </div>
                        <h2 className="text-3xl sm:text-4xl font-extrabold text-gray-900 mb-1.5 uppercase tracking-tight">WELCOME BACK!</h2>
                        <div className="h-1 w-12 bg-[#F97316] rounded-full mb-2" />
                        <p className="text-gray-400 text-sm font-medium">Please login to view your administrator dashboard</p>
                    </div>

                    {codeStep ? (
                        <form onSubmit={handleVerifyCode} className="space-y-6">
                            <div className="text-center lg:text-left space-y-1">
                                <p className="text-sm font-bold text-gray-800">Check your email</p>
                                <p className="text-xs text-gray-500">{codeNotice}</p>
                                <p className="text-[11px] text-gray-400">Can't find it? Check your Spam or Promotions folder.</p>
                            </div>

                            <div className="flex items-center justify-center lg:justify-start gap-2 sm:gap-2.5" onPaste={onDigitPaste}>
                                {digits.map((digit, idx) => (
                                    <input
                                        key={idx}
                                        ref={(el) => {
                                            digitRefs.current[idx] = el;
                                        }}
                                        type="text"
                                        inputMode="numeric"
                                        autoComplete={idx === 0 ? 'one-time-code' : 'off'}
                                        maxLength={1}
                                        value={digit}
                                        onChange={(e) => onDigitChange(idx, e.target.value)}
                                        onKeyDown={(e) => onDigitKeyDown(idx, e)}
                                        aria-label={`Digit ${idx + 1}`}
                                        className="w-11 h-13 sm:w-12 sm:h-14 text-center text-xl sm:text-2xl font-black bg-white border-2 border-gray-200 focus:border-[#F97316] rounded-xl outline-none transition-all focus:scale-105 focus:shadow-md"
                                    />
                                ))}
                            </div>

                            <div className="flex items-center justify-between text-[13px]">
                                <button
                                    type="button"
                                    onClick={handleResendCode}
                                    disabled={loading || cooldown > 0}
                                    className="text-[#F97316] hover:underline font-bold disabled:opacity-40 disabled:no-underline cursor-pointer"
                                >
                                    {cooldown > 0 ? `Resend code in ${cooldown}s` : 'Resend code'}
                                </button>
                                <button type="button" onClick={backToPassword} className="text-gray-400 hover:text-gray-600 font-medium cursor-pointer">
                                    Back to sign in
                                </button>
                            </div>

                            {error && (
                                <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-600 text-sm font-medium rounded-lg px-4 py-3">
                                    {error}
                                </div>
                            )}

                            <div className="pt-2 flex justify-center lg:justify-end">
                                <Button
                                    type="submit"
                                    variant="primary"
                                    size="lg"
                                    className="px-12 py-3 bg-[#F97316] hover:bg-[#ea580c] rounded-md shadow-lg transition-all transform hover:-translate-y-0.5 text-white font-bold uppercase tracking-widest text-xs disabled:opacity-60 disabled:cursor-not-allowed"
                                    disabled={loading || code.length !== 6}
                                >
                                    {loading ? 'VERIFYING...' : 'VERIFY & LOGIN'}
                                </Button>
                            </div>
                        </form>
                    ) : (
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
                            <button
                                type="button"
                                onClick={() => setShowForgotPassword(true)}
                                className="text-[13px] font-medium text-gray-400 hover:text-[#F97316] cursor-pointer"
                            >
                                Forgot password? <span className="text-[#F97316] font-bold">Reset now</span>
                            </button>
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
                    )}

                    {/* Terms */}
                    <div className="mt-12 text-[10px] text-gray-400 leading-relaxed max-w-sm">
                        By signing in you accept all our <a href="#" className="underline">terms and conditions</a>, <a href="#" className="underline">privacy policy</a> and <a href="#" className="underline">cookie policy</a>. We however do not use any third party vendor to share your data and its safe with us.
                    </div>
                </div>
            </div>

            <ForgotPasswordModal
                isOpen={showForgotPassword}
                onClose={() => setShowForgotPassword(false)}
                initialEmail={email}
            />
        </div>
    );
};

export default AdminLogin;
