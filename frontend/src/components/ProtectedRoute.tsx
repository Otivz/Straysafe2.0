import { useState, useEffect } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { api, getStoredToken, clearAuthStorage } from '../utils/api';

interface ProtectedRouteProps {
    allowedRoles?: number[];
}

const ProtectedRoute = ({ allowedRoles = [4] }: ProtectedRouteProps) => {
    const location = useLocation();
    const [status, setStatus] = useState<'loading' | 'authorized' | 'unauthorized' | 'forbidden'>('loading');
    const [userRole, setUserRole] = useState<number | null>(null);

    useEffect(() => {
        let isMounted = true;

        const verify = async () => {
            const token = getStoredToken();
            const rawUser = 
                localStorage.getItem('resident_user') || sessionStorage.getItem('resident_user') ||
                localStorage.getItem('admin_user') || sessionStorage.getItem('admin_user') ||
                localStorage.getItem('staff_user') || sessionStorage.getItem('staff_user');

            if (!token || !rawUser) {
                clearAuthStorage();
                if (isMounted) setStatus('unauthorized');
                return;
            }

            try {
                const parsedUser = JSON.parse(rawUser);
                const roleId = parsedUser.role_id;

                // Validate token with backend endpoint
                const res = await api.get('/auth/verify-session');
                if (res.status === 200 && res.data && res.data.status === 'valid') {
                    const activeRole = res.data.role_id || roleId;
                    if (isMounted) {
                        setUserRole(activeRole);
                        if (allowedRoles.includes(activeRole)) {
                            setStatus('authorized');
                        } else {
                            setStatus('forbidden');
                        }
                    }
                } else {
                    clearAuthStorage();
                    if (isMounted) setStatus('unauthorized');
                }
            } catch (err) {
                console.error('ProtectedRoute session verification failed:', err);
                clearAuthStorage();
                if (isMounted) setStatus('unauthorized');
            }
        };

        verify();

        return () => {
            isMounted = false;
        };
    }, [location.pathname, allowedRoles]);

    if (status === 'loading') {
        return (
            <div className="min-h-screen w-full flex flex-col items-center justify-center bg-gray-50 text-gray-700 font-sans">
                <div className="flex flex-col items-center gap-4">
                    <div className="w-12 h-12 border-4 border-orange-500 border-t-transparent rounded-full animate-spin"></div>
                    <p className="text-sm font-medium text-gray-500 animate-pulse">Verifying secure session...</p>
                </div>
            </div>
        );
    }

    if (status === 'unauthorized') {
        if (allowedRoles.includes(4)) {
            return <Navigate to="/admin/login" replace state={{ from: location }} />;
        }
        if (allowedRoles.includes(2) || allowedRoles.includes(3)) {
            return <Navigate to="/staff/login" replace state={{ from: location }} />;
        }
        return <Navigate to="/login" replace state={{ from: location }} />;
    }

    if (status === 'forbidden') {
        if (userRole === 1) return <Navigate to="/resident-home" replace />;
        if (userRole === 2) return <Navigate to="/subd/dashboard" replace />;
        if (userRole === 3) return <Navigate to="/brgy/dashboard" replace />;
        if (userRole === 4) return <Navigate to="/admin/dashboard" replace />;
        return <Navigate to="/login" replace />;
    }

    return <Outlet />;
};

export default ProtectedRoute;
