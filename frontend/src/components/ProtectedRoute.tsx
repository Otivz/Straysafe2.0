import { Navigate, Outlet } from 'react-router-dom';

const ProtectedRoute = () => {
    // Check if user is authenticated by looking for admin_user in storage
    const rawUser = 
        localStorage.getItem('admin_user') || 
        sessionStorage.getItem('admin_user');

    let isAuthorized = false;

    if (rawUser) {
        try {
            const user = JSON.parse(rawUser);
            // Verify the user has an Admin role (role_id = 4)
            isAuthorized = user && user.role_id === 4;
        } catch {
            isAuthorized = false;
        }
    }

    if (!isAuthorized) {
        // Clear any invalid session data
        localStorage.removeItem('admin_user');
        sessionStorage.removeItem('admin_user');
        // Redirect to login if not authenticated or not an admin
        return <Navigate to="/admin/login" replace />;
    }

    // If authenticated and is an admin, render the child components (the protected pages)
    return <Outlet />;
};

export default ProtectedRoute;
