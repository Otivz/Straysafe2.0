/**
 * StraySafe session activity.
 * Idle sign-out depends on who is signed in:
 *   - Residents: no idle sign-out. They stay signed in until 30 days pass without using the app (server rule).
 *   - Subdivision Leaders: signed out after 8 hours idle (about one work shift); the Leader interface applies it
 *     (src/admin/auth/AuthProvider.tsx).
 * Activity is kept in localStorage so it counts across all tabs.
 */

export const STAFF_INACTIVITY_TIMEOUT_MS = 8 * 60 * 60 * 1000; // Subdivision Leaders: 8 hours
export const ACTIVITY_STORAGE_KEY = 'straysafe_last_activity';

let lastLocalRecorded = 0;

/**
 * Record user activity timestamp.
 * Throttled to avoid writing to localStorage more than once every 5 seconds.
 */
export const recordUserActivity = () => {
    const now = Date.now();
    if (now - lastLocalRecorded < 5000) {
        return;
    }
    lastLocalRecorded = now;
    try {
        localStorage.setItem(ACTIVITY_STORAGE_KEY, String(now));
    } catch {
        // Fallback if localStorage quota or access fails
    }
};

/**
 * Get the last recorded activity timestamp across tabs.
 */
export const getLastActivityTime = (): number => {
    try {
        const stored = localStorage.getItem(ACTIVITY_STORAGE_KEY);
        if (stored) {
            const parsed = parseInt(stored, 10);
            if (!isNaN(parsed) && parsed > 0) {
                return parsed;
            }
        }
    } catch {
        // Fallback
    }
    return lastLocalRecorded || Date.now();
};
