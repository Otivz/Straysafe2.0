import { Routes, Route, useNavigate, useLocation } from 'react-router-dom';
import { useEffect } from 'react';
import AdminLogin from '../pages/Admin/AdminLogin';
import AdminDashboard from '../pages/Admin/AdminDashboard';
import AdminUserManagement from '../pages/Admin/AdminUserManagement';
import AdminAccountSettings from '../pages/Admin/AdminAccountSettings';
import AdminReport from '../pages/Admin/AdminReport';
import AdminHeatMap from '../pages/Admin/AdminHeatMap';
import AdminLogs from '../pages/Admin/AdminLogs';
import AdminPetManagement from '../pages/Admin/AdminPetManagement';
import PetRecords from '../pages/Admin/PetRecords';
import ProtectedRoute from '../components/ProtectedRoute';

import CommunityStaffLogin from '../pages/Subd_Leaders/CommunityStaffLogin';
import SubdDashboard from '../pages/Subd_Leaders/SubdDashboard';
import SubdReports from '../pages/Subd_Leaders/SubdReports';
import EscelatedMissions from '../pages/Subd_Leaders/EscelatedMissions';
import SubdHeatMap from '../pages/Subd_Leaders/SubdHeatMap';
import EndorsementArch from '../pages/Subd_Leaders/EndorsementArch';
import SubdPetRecords from '../pages/Subd_Leaders/SubdPetRecords';
import SubdHazardAlert from '../pages/Subd_Leaders/SubdHazardAlert';

import LandingPage from '../pages/citizen/LandingPage';
import ResidentsLogin from '../pages/citizen/ResidentsLogin';
import ResiHomePage from '../pages/citizen/ResiHomePage';
import ResidentPet from '../pages/citizen/ResidentPet';
import ResiProfile from '../pages/citizen/ResiProfile';
import BrgyDashboard from '../pages/Barangay_Staff/BrgyDashboard';
import BrgyRescueRequests from '../pages/Barangay_Staff/BrgyRescueRequests';
import BrgyMapDirection from '../pages/Barangay_Staff/BrgyMapDirection';
import BrgyHeatMap from '../pages/Barangay_Staff/BrgyHeatMap';
import BrgyRescueHistory from '../pages/Barangay_Staff/BrgyRescueHistory';
import BrgyMonitoring from '../pages/Barangay_Staff/BrgyMonitoring';
import BrgyStaff from '../pages/Barangay_Staff/BrgyStaff';
import BrgyOperation from '../pages/Barangay_Staff/BrgyOperation';


const AppRoutes = () => {
    const navigate = useNavigate();
    const location = useLocation();

    useEffect(() => {
        const checkSession = async () => {
            // Identify which user is logged in
            const adminUser = localStorage.getItem('admin_user') || sessionStorage.getItem('admin_user');
            const staffUser = localStorage.getItem('staff_user') || sessionStorage.getItem('staff_user');
            const residentUser = localStorage.getItem('resident_user') || sessionStorage.getItem('resident_user');

            let user = null;
            let type = '';

            if (adminUser) { user = JSON.parse(adminUser); type = 'admin'; }
            else if (staffUser) { user = JSON.parse(staffUser); type = 'staff'; }
            else if (residentUser) { user = JSON.parse(residentUser); type = 'resident'; }

            if (user && user.user_id) {
                try {
                    const res = await fetch(`http://localhost:8000/auth/verify-session/${user.user_id}`);
                    if (res.status === 404) {
                        // User not in DB, force logout
                        console.warn("Session invalid: User not found in database. Logging out...");
                        handleLogout(type);
                    }
                } catch (error) {
                    console.error("Session check failed:", error);
                }
            }
        };

        const handleLogout = (type: string) => {
            if (type === 'admin') {
                localStorage.removeItem('admin_user');
                sessionStorage.removeItem('admin_user');
                if (!location.pathname.includes('/admin/login')) navigate('/admin/login');
            } else if (type === 'staff') {
                localStorage.removeItem('staff_user');
                sessionStorage.removeItem('staff_user');
                if (!location.pathname.includes('/staff/login')) navigate('/staff/login');
            } else if (type === 'resident') {
                localStorage.removeItem('resident_user');
                sessionStorage.removeItem('resident_user');
                if (!location.pathname.includes('/login')) navigate('/login');
            }
        };

        checkSession();
    }, [location.pathname, navigate]);

    return (
        <Routes>
            {/* Public Routes */}
            <Route path="/admin/login" element={<AdminLogin />} />


            {/* Protected Admin Routes */}
            <Route element={<ProtectedRoute />}>
                <Route path="/admin/dashboard" element={<AdminDashboard />} />
                <Route path="/admin/pet-records" element={<PetRecords />} />
                <Route path="/admin/users" element={<AdminUserManagement />} />
                <Route path="/admin/account-settings" element={<AdminAccountSettings />} />
                <Route path="/admin/incidents" element={<AdminReport />} />
                <Route path="/admin/heatmap" element={<AdminHeatMap />} />
                <Route path="/admin/logs" element={<AdminLogs />} />
                <Route path="/admin/pets" element={<AdminPetManagement />} />
            </Route>

            {/* Protected Barangay/Subdivision Routes */}
            <Route path="/staff/login" element={<CommunityStaffLogin />} />
            <Route path="/subd/dashboard" element={<SubdDashboard />} />
            <Route path="/subd/reports" element={<SubdReports />} />
            <Route path="/subd/escalated" element={<EscelatedMissions />} />
            <Route path="/subd/heatmap" element={<SubdHeatMap />} />
            <Route path="/subd/endorsements" element={<EndorsementArch />} />
            <Route path="/subd/pet-records" element={<SubdPetRecords />} />
            <Route path="/subd/hazard-alert" element={<SubdHazardAlert />} />

            {/* Barangay Staff Routes */}
            <Route path="/brgy/dashboard" element={<BrgyDashboard />} />
            <Route path="/brgy/operations" element={<BrgyOperation />} />
            <Route path="/brgy/rescue-requests" element={<BrgyRescueRequests />} />
            <Route path="/brgy/map-direction" element={<BrgyMapDirection />} />
            <Route path="/brgy/heatmap" element={<BrgyHeatMap />} />
            <Route path="/brgy/monitoring" element={<BrgyMonitoring />} />
            <Route path="/brgy/history" element={<BrgyRescueHistory />} />
            <Route path="/brgy/teams" element={<BrgyStaff />} />


            {/* Landing Page Route */}
            <Route path="/" element={<LandingPage />} />
            <Route path="/login" element={<ResidentsLogin />} />
            <Route path="/resident-home" element={<ResiHomePage />} />
            <Route path="/resident/pets" element={<ResidentPet />} />
            <Route path="/resident/profile" element={<ResiProfile />} />


            {/* Catch-all Redirect to Login */}
            <Route path="*" element={<AdminLogin />} />
        </Routes>
    );
};

export default AppRoutes;