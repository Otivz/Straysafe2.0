import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

/**
 * Sets <html data-role="subd|brgy"> for the Subdivision Leader and Barangay Staff areas so the
 * role identity accent tokens in index.css apply. Every other area keeps the default brand orange.
 */
export const getRoleThemeForPath = (pathname: string): 'subd' | 'brgy' | null => {
    if (pathname.startsWith('/subd')) return 'subd';
    if (pathname.startsWith('/brgy')) return 'brgy';
    return null;
};

const RoleThemeSync = () => {
    const { pathname } = useLocation();

    useEffect(() => {
        const role = getRoleThemeForPath(pathname);
        if (role) {
            document.documentElement.setAttribute('data-role', role);
        } else {
            document.documentElement.removeAttribute('data-role');
        }
    }, [pathname]);

    return null;
};

export default RoleThemeSync;
