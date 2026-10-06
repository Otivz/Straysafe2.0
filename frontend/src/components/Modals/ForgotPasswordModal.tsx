import { useEffect, useRef, useState } from 'react';
import { api } from '../../utils/api';
import { passwordError } from '../../utils/passwordPolicy';
import PasswordRequirements from '../PasswordRequirements';

interface ForgotPasswordModalProps {
    isOpen: boolean;
    onClose: () => void;
    initialEmail?: string;
}

type Step = 'email' | 'code' | 'password' | 'done';

const RESEND_SECONDS = 30;
const EMPTY_DIGITS = ['', '', '', '', '', ''];

const ForgotPasswordModal = ({ isOpen, onClose, initialEmail = '' }: ForgotPasswordModalProps) => {
    const [step, setStep] = useState<Step>('email');
    const [email, setEmail] = useState('');
    const [digits, setDigits] = useState<string[]>(EMPTY_DIGITS);
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [notice, setNotice] = useState('');
    const [cooldown, setCooldown] = useState(0);
    const digitRefs = useRef<(HTMLInputElement | null)[]>([]);

    const code = digits.join('');

    useEffect(() => {
        if (isOpen) {
            setStep('email');
            setEmail(initialEmail);
            setDigits(EMPTY_DIGITS);
            setNewPassword('');
            setConfirmPassword('');
            setShowPassword(false);
            setError('');
            setNotice('');
            setCooldown(0);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isOpen]);

    useEffect(() => {
        if (cooldown <= 0) return;
        const timer = setTimeout(() => setCooldown((c) => c - 1), 1000);
        return () => clearTimeout(timer);
    }, [cooldown]);

    if (!isOpen) return null;

    const describeError = (err: any, fallback: string) => {
        if (err.response?.status === 429) return 'Too many attempts. Please wait a minute and try again.';
        if (err.response?.status === 422) return 'Please check what you entered and try again.';
        return err.response?.data?.detail || fallback;
    };

    const goToCodeStep = () => {
        setDigits(EMPTY_DIGITS);
        setStep('code');
        setTimeout(() => digitRefs.current[0]?.focus(), 50);
    };

    const requestCode = async (e?: React.FormEvent) => {
        e?.preventDefault();
        if (!email.trim()) return;
        setError('');
        setNotice('');
        setLoading(true);
        try {
            await api.post('/auth/forgot-password', { email: email.trim() });
            setNotice("If that email is registered, we've sent a 6-digit code.");
            setCooldown(RESEND_SECONDS);
            goToCodeStep();
        } catch (err: any) {
            setError(describeError(err, 'Could not reach the server. Please try again.'));
        } finally {
            setLoading(false);
        }
    };

    const verifyCode = async (e?: React.FormEvent) => {
        e?.preventDefault();
        setError('');
        if (code.length !== 6) {
            setError('Enter all 6 digits of the code from your email.');
            return;
        }
        setLoading(true);
        try {
            await api.post('/auth/verify-reset-code', { email: email.trim(), otp: code });
            setNotice('');
            setStep('password');
        } catch (err: any) {
            setError(describeError(err, 'That code is invalid or has expired. Request a new one.'));
        } finally {
            setLoading(false);
        }
    };

    const submitPassword = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        const policyError = passwordError(newPassword);
        if (policyError) {
            setError(policyError);
            return;
        }
        if (newPassword !== confirmPassword) {
            setError('The two passwords do not match.');
            return;
        }
        setLoading(true);
        try {
            await api.post('/auth/reset-password', { email: email.trim(), otp: code, new_password: newPassword });
            setStep('done');
        } catch (err: any) {
            const message = describeError(err, 'Could not reset your password. Please try again.');
            // The code can expire while the person is typing; send them back to get a new one.
            if (err.response?.status === 400 && /code/i.test(String(err.response?.data?.detail || ''))) {
                setNewPassword('');
                setConfirmPassword('');
                goToCodeStep();
            }
            setError(message);
        } finally {
            setLoading(false);
        }
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
        const next = [...EMPTY_DIGITS];
        for (let i = 0; i < pasted.length; i++) next[i] = pasted[i];
        setDigits(next);
        setError('');
        digitRefs.current[Math.min(pasted.length, 5)]?.focus();
    };

    const inputClass =
        'w-full bg-[#FAFAF9] border-2 border-[#ede8e0] focus:border-[#F97316] rounded-2xl px-4 py-3 text-sm font-semibold text-[#1a1208] outline-none transition-colors';
    const labelClass = 'text-[10px] font-black uppercase tracking-widest text-[#9c8670]';
    const secondaryBtn =
        'w-1/3 py-3.5 bg-gray-100 hover:bg-gray-200 text-gray-700 font-black rounded-2xl text-xs uppercase tracking-wider transition-all cursor-pointer';
    const primaryBtn =
        'w-2/3 py-3.5 bg-[#F97316] hover:bg-[#ea580c] text-white font-black rounded-2xl text-xs uppercase tracking-wider shadow-lg transition-all cursor-pointer disabled:opacity-50';

    const stepLabel: Record<Step, string> = {
        email: 'Step 1 of 3: Your email',
        code: 'Step 2 of 3: Enter your code',
        password: 'Step 3 of 3: Choose a new password',
        done: 'All set',
    };

    return (
        <div
            className="fixed inset-0 z-[999] bg-black/60 backdrop-blur-xs flex items-center justify-center p-4"
            onClick={onClose}
            role="dialog"
            aria-modal="true"
            aria-label="Reset your password"
        >
            <div
                className="bg-white text-[#1a1208] rounded-3xl shadow-2xl border border-gray-100 w-full max-w-md p-6 sm:p-8 relative max-h-[92vh] overflow-y-auto"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="flex items-center justify-between pb-4 border-b border-gray-100 mb-5">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-2xl bg-orange-50 border border-orange-200 flex items-center justify-center text-xl">
                            {step === 'code' ? '🛡️' : '🔑'}
                        </div>
                        <div>
                            <h3 className="text-base font-black text-gray-900 uppercase tracking-tight">Reset Password</h3>
                            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">{stepLabel[step]}</p>
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        aria-label="Close"
                        className="w-8 h-8 rounded-full bg-gray-100 hover:bg-gray-200 text-gray-500 flex items-center justify-center text-sm font-bold transition-all cursor-pointer"
                    >
                        ✕
                    </button>
                </div>

                {error && (
                    <div className="mb-4 bg-red-50 text-red-600 p-3 rounded-2xl border border-red-100 text-xs font-bold">
                        ⚠️ {error}
                    </div>
                )}

                {step === 'email' && (
                    <form onSubmit={requestCode} className="space-y-4">
                        <p className="text-xs font-semibold text-gray-600">
                            Enter the email you signed up with and we'll send you a 6-digit code.
                        </p>
                        <div className="space-y-1.5">
                            <label className={labelClass}>Email address</label>
                            <input
                                type="email"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                placeholder="name@example.com"
                                className={inputClass}
                                required
                                autoFocus
                            />
                        </div>
                        <button
                            type="button"
                            onClick={() => {
                                if (!email.trim()) {
                                    setError('Enter your email first, then choose "I already have a code".');
                                    return;
                                }
                                setError('');
                                setNotice('');
                                goToCodeStep();
                            }}
                            className="text-xs font-bold text-[#F97316] hover:underline cursor-pointer"
                        >
                            I already have a code
                        </button>
                        <div className="pt-1 flex gap-3">
                            <button type="button" onClick={onClose} className={secondaryBtn}>
                                Cancel
                            </button>
                            <button type="submit" disabled={loading || !email.trim()} className={primaryBtn}>
                                {loading ? 'Sending...' : 'Send code'}
                            </button>
                        </div>
                    </form>
                )}

                {step === 'code' && (
                    <form onSubmit={verifyCode} className="space-y-4">
                        <div className="text-center space-y-1">
                            <p className="text-xs font-semibold text-gray-600">Enter the 6-digit code we emailed to:</p>
                            <span className="inline-block px-2.5 py-1 bg-orange-50 border border-orange-200 rounded-lg text-xs font-black text-orange-800 break-all">
                                ✉️ {email}
                            </span>
                            <p className="text-[11px] text-gray-400">
                                {notice ? `${notice} ` : ''}Can't find it? Check your Spam or Promotions folder.
                            </p>
                        </div>

                        <div className="flex items-center justify-center gap-2 sm:gap-2.5 py-2" onPaste={onDigitPaste}>
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
                                    className="w-11 h-13 sm:w-12 sm:h-14 text-center text-xl sm:text-2xl font-black bg-gray-50 border-2 border-gray-200 focus:border-[#F97316] rounded-2xl outline-none transition-all focus:scale-105 focus:shadow-md"
                                    autoFocus={idx === 0}
                                />
                            ))}
                        </div>

                        <div className="flex items-center justify-between text-xs px-1">
                            <button
                                type="button"
                                onClick={() => void requestCode()}
                                disabled={loading || cooldown > 0}
                                className="text-[#F97316] hover:underline font-black disabled:opacity-40 disabled:no-underline cursor-pointer"
                            >
                                {cooldown > 0 ? `Resend code in ${cooldown}s` : 'Resend code'}
                            </button>
                            <button
                                type="button"
                                onClick={() => {
                                    setStep('email');
                                    setError('');
                                }}
                                className="text-gray-400 hover:text-gray-600 font-bold cursor-pointer"
                            >
                                Change email
                            </button>
                        </div>

                        <div className="pt-1 flex gap-3">
                            <button type="button" onClick={onClose} className={secondaryBtn}>
                                Cancel
                            </button>
                            <button type="submit" disabled={loading || code.length !== 6} className={primaryBtn}>
                                {loading ? 'Checking...' : 'Verify code'}
                            </button>
                        </div>
                    </form>
                )}

                {step === 'password' && (
                    <form onSubmit={submitPassword} className="space-y-4">
                        <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-2xl text-xs font-bold text-emerald-800">
                            ✓ Code accepted. Now choose a new password.
                        </div>
                        <div className="space-y-1.5">
                            <label className={labelClass}>New password</label>
                            <input
                                type={showPassword ? 'text' : 'password'}
                                value={newPassword}
                                onChange={(e) => setNewPassword(e.target.value)}
                                placeholder="Choose a strong password"
                                className={inputClass}
                                autoComplete="new-password"
                                maxLength={128}
                                required
                                autoFocus
                            />
                            <PasswordRequirements password={newPassword} className="pt-1.5 px-1" />
                        </div>
                        <div className="space-y-1.5">
                            <label className={labelClass}>Confirm new password</label>
                            <input
                                type={showPassword ? 'text' : 'password'}
                                value={confirmPassword}
                                onChange={(e) => setConfirmPassword(e.target.value)}
                                placeholder="Type it again"
                                className={inputClass}
                                autoComplete="new-password"
                                required
                            />
                        </div>
                        <label className="flex items-center gap-2 text-xs font-semibold text-gray-500 cursor-pointer select-none">
                            <input
                                type="checkbox"
                                checked={showPassword}
                                onChange={(e) => setShowPassword(e.target.checked)}
                                className="accent-[#F97316]"
                            />
                            Show passwords
                        </label>
                        <div className="pt-1 flex gap-3">
                            <button type="button" onClick={onClose} className={secondaryBtn}>
                                Cancel
                            </button>
                            <button type="submit" disabled={loading} className={primaryBtn}>
                                {loading ? 'Saving...' : 'Save new password'}
                            </button>
                        </div>
                    </form>
                )}

                {step === 'done' && (
                    <div className="space-y-5 text-center py-2">
                        <div className="text-5xl">✅</div>
                        <p className="text-sm font-bold text-gray-800">Your password has been updated.</p>
                        <p className="text-xs text-gray-500">You can now sign in with your new password.</p>
                        <button
                            type="button"
                            onClick={onClose}
                            className="w-full py-3.5 bg-[#F97316] hover:bg-[#ea580c] text-white font-black rounded-2xl text-xs uppercase tracking-wider shadow-lg transition-all cursor-pointer"
                        >
                            Back to sign in
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
};

export default ForgotPasswordModal;
