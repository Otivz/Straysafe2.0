// Default user silhouette profile picture (modern vector SVG)
export const DEFAULT_AVATAR = `data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><rect width='100%' height='100%' fill='%23E2E8F0'/><circle cx='50' cy='36' r='18' fill='%2364748B'/><path d='M50 58C32 58 16 70 16 90V100H84V90C84 70 68 58 50 58Z' fill='%2364748B'/></svg>`;

export const getProfilePicture = (url?: string | null): string => {
    if (!url || typeof url !== 'string' || url.trim() === '' || url === 'undefined' || url === 'null') {
        return DEFAULT_AVATAR;
    }
    
    // Support relative upload paths from backend
    if (url.startsWith('uploads/') || url.startsWith('/uploads/')) {
        const baseUrl = (import.meta as any).env?.VITE_API_URL || 'http://127.0.0.1:8000';
        const cleanPath = url.startsWith('/') ? url : `/${url}`;
        return `${baseUrl.replace(/\/$/, '')}${cleanPath}`;
    }

    return url;
};

// Default pet avatar (modern vector SVG)
export const DEFAULT_PET_AVATAR = `data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><rect width='100%' height='100%' fill='%23E2E8F0'/><path d='M50 24c-7 0-13 5.5-13 12.5 0 3.2 1.2 6.1 3.2 8.4C32.7 49.6 25 59.5 25 72v18h50V72c0-12.5-7.7-22.4-15.2-27.1 2-2.3 3.2-5.2 3.2-8.4C63 29.5 57 24 50 24z' fill='%2364748B'/><path d='M35 27c-3-6-10-6-13-1 2 6 6 8 13 1zM65 27c3-6 10-6 13-1-2 6-6 8-13 1z' fill='%2364748B'/></svg>`;

export const getPetPicture = (url?: string | null): string => {
    if (!url || typeof url !== 'string' || url.trim() === '' || url === 'undefined' || url === 'null' || url.includes('unsplash.com')) {
        return DEFAULT_PET_AVATAR;
    }

    if (url.startsWith('uploads/') || url.startsWith('/uploads/')) {
        const baseUrl = (import.meta as any).env?.VITE_API_URL || 'http://127.0.0.1:8000';
        const cleanPath = url.startsWith('/') ? url : `/${url}`;
        return `${baseUrl.replace(/\/$/, '')}${cleanPath}`;
    }

    return url;
};
