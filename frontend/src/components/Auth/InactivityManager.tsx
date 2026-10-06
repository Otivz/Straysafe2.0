import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import axios from 'axios';
import { Clock, AlertTriangle, LogOut, CheckCircle2 } from 'lucide-react';
import {
    INACTIVITY_TIMEOUT_MS,
    INACTIVITY_WARNING_MS,
    ACTIVITY_STORAGE_KEY,
    recordUserActivity,
    getLastActivityTime,
    resetActivityTimer,
    hasActiveSession,
    getAppropriateLoginPath,
} from '../../utils/inactivity';
import { logoutUser, API_BASE_URL } from '../../utils/api';
import { useToast } from '../../context/ToastContext';

export const InactivityManager: React.FC = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const toast = useToast();

    const [showWarning, setShowWarning] = useState(false);
    const [secondsRemaining, setSecondsRemaining] = useState<number>(120);
    const lastProactiveRefreshRef = useRef<number>(Date.now());
    const isLoggingOutRef = useRef<boolean>(false);

    // Silent background token refresh while user is actively using the system
    const performProactiveRefresh = useCallback(async () => {
        try {
            const res = await axios.post(`${API_BASE_URL}/auth/refresh`, {}, { withCredentials: true });
            const newToken = res.data?.access_token;
            if (newToken) {
                if (sessionStorage.getItem('access_token')) sessionStorage.setItem('access_token', newToken);
                if (localStorage.getItem('access_token')) localStorage.setItem('access_token', newToken);

                for (const key of ['admin_user', 'staff_user', 'resident_user']) {
                    const raw = sessionStorage.getItem(key) || localStorage.getItem(key);
                    if (raw) {
                        try {
                            const parsed = JSON.parse(raw);
                            if (parsed && (parsed.access_token || parsed.token)) {
                                if (parsed.access_token) parsed.access_token = newToken;
                                if (parsed.token) parsed.token = newToken;
                                if (sessionStorage.getItem(key)) sessionStorage.setItem(key, JSON.stringify(parsed));
                                if (localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(parsed));
                            }
                        } catch {}
                    }
                }
            }
        } catch {
            // Silently fail, standard 401 interceptor will handle if needed
        }
    }, []);

    // Perform forced logout due to inactivity
    const handleInactivityLogout = useCallback(async () => {
        if (isLoggingOutRef.current) return;
        isLoggingOutRef.current = true;
        setShowWarning(false);

        const targetLoginPath = getAppropriateLoginPath();

        try {
            await logoutUser();
        } catch {
            // Ignore error
        }

        toast.warning(
            'Session Expired',
            'You were automatically logged out due to 30 minutes of inactivity to protect your account.',
            8000
        );

        navigate(targetLoginPath, { replace: true });
        isLoggingOutRef.current = false;
    }, [navigate, toast]);

    // Handle user clicking "Stay Logged In"
    const handleStayLoggedIn = () => {
        resetActivityTimer();
        setShowWarning(false);
        performProactiveRefresh();
    };

    // User activity listener setup
    useEffect(() => {
        // Record initial activity if session exists
        if (hasActiveSession()) {
            if (!localStorage.getItem(ACTIVITY_STORAGE_KEY)) {
                resetActivityTimer();
            }
        }

        const handleUserAction = () => {
            if (!hasActiveSession()) return;
            recordUserActivity();
            if (showWarning) {
                setShowWarning(false);
            }

            // If active and > 20 minutes since last silent refresh, refresh token proactively
            const now = Date.now();
            if (now - lastProactiveRefreshRef.current > 20 * 60 * 1000) {
                lastProactiveRefreshRef.current = now;
                performProactiveRefresh();
            }
        };

        const events = ['mousedown', 'keydown', 'scroll', 'touchstart', 'click'];
        events.forEach((ev) => {
            window.addEventListener(ev, handleUserAction, { passive: true });
        });

        // Throttled mouse movement
        let mouseMoveTimer: any = null;
        const handleMouseMove = () => {
            if (!mouseMoveTimer) {
                mouseMoveTimer = setTimeout(() => {
                    handleUserAction();
                    mouseMoveTimer = null;
                }, 3000);
            }
        };
        window.addEventListener('mousemove', handleMouseMove, { passive: true });

        // Listen for activity changes from other tabs
        const handleStorage = (e: StorageEvent) => {
            if (e.key === ACTIVITY_STORAGE_KEY && e.newValue) {
                if (showWarning) {
                    setShowWarning(false);
                }
            }
        };
        window.addEventListener('storage', handleStorage);

        return () => {
            events.forEach((ev) => {
                window.removeEventListener(ev, handleUserAction);
            });
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('storage', handleStorage);
            if (mouseMoveTimer) clearTimeout(mouseMoveTimer);
        };
    }, [showWarning, performProactiveRefresh]);

    // Timer check loop (runs every 1 second when near expiry, or every 3 seconds normally)
    useEffect(() => {
        const interval = setInterval(() => {
            if (!hasActiveSession()) {
                if (showWarning) setShowWarning(false);
                return;
            }

            const lastActivity = getLastActivityTime();
            const elapsed = Date.now() - lastActivity;
            const remaining = INACTIVITY_TIMEOUT_MS - elapsed;

            if (remaining <= 0) {
                handleInactivityLogout();
            } else if (elapsed >= INACTIVITY_WARNING_MS) {
                setShowWarning(true);
                setSecondsRemaining(Math.max(1, Math.ceil(remaining / 1000)));
            } else {
                if (showWarning) {
                    setShowWarning(false);
                }
            }
        }, 1000);

        return () => clearInterval(interval);
    }, [showWarning, handleInactivityLogout, location.pathname]);

    // Don't render modal if no warning needed or user isn't logged in
    if (!showWarning || !hasActiveSession()) {
        return null;
    }

    const minutes = Math.floor(secondsRemaining / 60);
    const seconds = secondsRemaining % 60;
    const formattedTime = `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;

    return (
        <div className="fixed inset-0 z-[999999] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
            <div className="relative w-full max-w-md bg-white dark:bg-gray-800 rounded-2xl shadow-2xl border border-role-border dark:border-gray-700 p-6 sm:p-8 text-center transform transition-all animate-scale-up">
                {/* Warning Icon Badge */}
                <div className="mx-auto w-16 h-16 rounded-full bg-role-muted dark:bg-role-strong/60 text-role-hover dark:text-role flex items-center justify-center mb-4 ring-8 ring-role-soft dark:ring-role-strong/20">
                    <Clock className="w-8 h-8 animate-pulse" />
                </div>

                <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/40 text-amber-700 dark:text-amber-300 text-xs font-bold uppercase tracking-wider mb-2">
                    <AlertTriangle className="w-3.5 h-3.5" />
                    Inactivity Notice
                </div>

                <h3 className="text-xl font-black text-gray-900 dark:text-white uppercase tracking-tight mb-2">
                    Are You Still There?
                </h3>

                <p className="text-sm text-gray-600 dark:text-gray-300 mb-6 leading-relaxed">
                    You have been inactive for nearly 30 minutes. To protect your session and data security, you will be automatically logged out in:
                </p>

                {/* Countdown display */}
                <div className="my-4 py-3 px-6 bg-role-soft dark:bg-gray-700/60 rounded-xl border border-role-border dark:border-gray-600 inline-block">
                    <span className="font-mono text-3xl font-extrabold text-role-hover dark:text-role tracking-wider">
                        {formattedTime}
                    </span>
                </div>

                {/* Action Buttons */}
                <div className="flex flex-col sm:flex-row gap-3 mt-6">
                    <button
                        type="button"
                        onClick={handleInactivityLogout}
                        className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-xl text-sm font-bold text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                    >
                        <LogOut className="w-4 h-4 text-gray-500" />
                        Log Out Now
                    </button>
                    <button
                        type="button"
                        onClick={handleStayLoggedIn}
                        className="flex-1 inline-flex items-center justify-center gap-2 px-5 py-3 bg-gradient-to-r from-role to-amber-500 hover:from-role-hover hover:to-amber-600 text-white rounded-xl text-sm font-bold shadow-lg shadow-role/25 transition-all transform active:scale-95"
                    >
                        <CheckCircle2 className="w-4 h-4" />
                        Stay Logged In
                    </button>
                </div>
            </div>
        </div>
    );
};

export default InactivityManager;
