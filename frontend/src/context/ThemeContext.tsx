import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { useLocation } from 'react-router-dom';

type Theme = 'light' | 'dark';

interface ThemeContextType {
    theme: Theme;
    toggleTheme: () => void;
    setTheme: (theme: Theme) => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

/**
 * Determine the isolated storage key based on the current active user and route portal.
 * This guarantees that a Resident account changing themes never affects a Subdivision Leader
 * or Admin account, even within the same browser session or device.
 */
function getThemeStorageKey(pathname: string): string {
    if (pathname.startsWith('/subd') || pathname.startsWith('/staff')) {
        try {
            const staff = localStorage.getItem('staff_user') || sessionStorage.getItem('staff_user');
            if (staff) {
                const parsed = JSON.parse(staff);
                if (parsed?.user_id) return `straysafe_theme_user_${parsed.user_id}`;
            }
        } catch {
            // fallback
        }
        return 'straysafe_theme_subd';
    }

    if (pathname.startsWith('/brgy')) {
        try {
            const staff = localStorage.getItem('staff_user') || sessionStorage.getItem('staff_user');
            if (staff) {
                const parsed = JSON.parse(staff);
                if (parsed?.user_id) return `straysafe_theme_user_${parsed.user_id}`;
            }
        } catch {
            // fallback
        }
        return 'straysafe_theme_brgy';
    }

    if (pathname.startsWith('/admin')) {
        try {
            const admin = localStorage.getItem('admin_user') || sessionStorage.getItem('admin_user');
            if (admin) {
                const parsed = JSON.parse(admin);
                if (parsed?.user_id) return `straysafe_theme_user_${parsed.user_id}`;
            }
        } catch {
            // fallback
        }
        return 'straysafe_theme_admin';
    }

    // Resident / Citizen Portal
    try {
        const resident = localStorage.getItem('resident_user') || sessionStorage.getItem('resident_user');
        if (resident) {
            const parsed = JSON.parse(resident);
            if (parsed?.user_id) return `straysafe_theme_user_${parsed.user_id}`;
        }
    } catch {
        // fallback
    }
    return 'straysafe_theme_resident';
}

function getStoredTheme(key: string): Theme {
    const saved = localStorage.getItem(key);
    return (saved === 'dark' || saved === 'light') ? saved : 'light';
}

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const location = useLocation();
    const currentKey = getThemeStorageKey(location.pathname);

    const [theme, setThemeState] = useState<Theme>(() => getStoredTheme(currentKey));

    // When navigating between portals or different user accounts, automatically sync the theme
    useEffect(() => {
        const activeKey = getThemeStorageKey(location.pathname);
        const activeTheme = getStoredTheme(activeKey);
        setThemeState(activeTheme);

        const root = document.documentElement;
        if (activeTheme === 'dark') {
            root.classList.add('dark');
        } else {
            root.classList.remove('dark');
        }
    }, [location.pathname]);

    // Apply and persist theme specifically to the active account / portal
    const setTheme = useCallback((newTheme: Theme) => {
        const activeKey = getThemeStorageKey(location.pathname);
        localStorage.setItem(activeKey, newTheme);
        setThemeState(newTheme);

        const root = document.documentElement;
        if (newTheme === 'dark') {
            root.classList.add('dark');
        } else {
            root.classList.remove('dark');
        }
    }, [location.pathname]);

    const toggleTheme = useCallback(() => {
        setTheme(theme === 'light' ? 'dark' : 'light');
    }, [theme, setTheme]);

    return (
        <ThemeContext.Provider value={{ theme, toggleTheme, setTheme }}>
            {children}
        </ThemeContext.Provider>
    );
};

export const useTheme = () => {
    const context = useContext(ThemeContext);
    if (!context) {
        throw new Error('useTheme must be used within a ThemeProvider');
    }
    return context;
};
