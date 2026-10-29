import { lazy, Suspense } from 'react';
import PushBridge from '../components/PushBridge';
import SessionGuard from '../components/Auth/SessionGuard';
import '../utils/cache'; // registers "clear the cache on sign-out" for the whole app
import { Routes, Route, Navigate } from 'react-router-dom';

// Each page is loaded only when it's opened (code splitting): the first screen no longer downloads every page of
// every portal (the single bundle was 5.4 MB).
function PageLoading() {
    return (
        <div className="min-h-[60vh] flex items-center justify-center" role="status" aria-label="Loading">
            <div className="w-8 h-8 border-4 border-orange-500 border-t-transparent rounded-full animate-spin" />
        </div>
    );
}
const AdminLogin = lazy(() => import('../pages/Admin/AdminLogin'));
const AdminDashboard = lazy(() => import('../pages/Admin/AdminDashboard'));
const AdminUserManagement = lazy(() => import('../pages/Admin/AdminUserManagement'));
const AdminAccountSettings = lazy(() => import('../pages/Admin/AdminAccountSettings'));
const AdminReport = lazy(() => import('../pages/Admin/AdminReport'));
const AdminReportView = lazy(() => import('../pages/Admin/AdminReportView'));
const AdminHeatMap = lazy(() => import('../pages/Admin/AdminHeatMap'));
const AdminLogs = lazy(() => import('../pages/Admin/AdminLogs'));
const AdminWarnings = lazy(() => import('../pages/Admin/AdminWarnings'));
const PetRecords = lazy(() => import('../pages/Admin/PetRecords'));
const AdminAnalytics = lazy(() => import('../pages/Admin/AdminAnalytics'));
import ProtectedRoute from '../components/ProtectedRoute';
import RoleThemeSync from '../components/RoleThemeSync';

const CommunityStaffLogin = lazy(() => import('../pages/Subd_Leaders/CommunityStaffLogin'));
const SubdDashboard = lazy(() => import('../pages/Subd_Leaders/SubdDashboard'));
const SubdReports = lazy(() => import('../pages/Subd_Leaders/SubdReports'));
const SubdViewReport = lazy(() => import('../pages/Subd_Leaders/SubdViewReport'));

const SubdHistoryReport = lazy(() => import('../pages/Subd_Leaders/SubdHistoryReport'));
const SubdViewHistory = lazy(() => import('../pages/Subd_Leaders/SubdViewHistory'));
const SubdPetClaims = lazy(() => import('../pages/Subd_Leaders/SubdPetClaims'));
const EndorsementArch = lazy(() => import('../pages/Subd_Leaders/EndorsementArch'));
const SubdPetRecords = lazy(() => import('../pages/Subd_Leaders/SubdPetRecords'));
const SubdRemovedPetRecords = lazy(() => import('../pages/Subd_Leaders/SubdRemovedPetRecords'));
const SubdProfile = lazy(() => import('../pages/Subd_Leaders/SubdProfile'));
const SubdHazardAlert = lazy(() => import('../pages/Subd_Leaders/SubdHazardAlert'));
const SubdMessages = lazy(() => import('../pages/Subd_Leaders/SubdMessages'));
const SubdSettings = lazy(() => import('../pages/Subd_Leaders/SubdSettings'));
const SubdHoldingFacility = lazy(() => import('../pages/Subd_Leaders/SubdHoldingFacility'));
const SubdAnalytics = lazy(() => import('../pages/Subd_Leaders/SubdAnalytics'));

const LandingPage = lazy(() => import('../pages/citizen/LandingPage'));
const ResidentsLogin = lazy(() => import('../pages/citizen/ResidentsLogin'));
const ResiHomePage = lazy(() => import('../pages/citizen/ResiHomePage'));
const ResiViewReport = lazy(() => import('../pages/citizen/ResiViewReport'));
const ResidentPet = lazy(() => import('../pages/citizen/ResidentPet'));
const ResiProfile = lazy(() => import('../pages/citizen/ResiProfile'));
const PetScanPage = lazy(() => import('../pages/citizen/PetScanPage'));
const PetScanSuccessPage = lazy(() => import('../pages/citizen/PetScanSuccessPage'));
const PetQrCardPage = lazy(() => import('../pages/citizen/PetQrCardPage'));
const PetScanHistoryPage = lazy(() => import('../pages/citizen/PetScanHistoryPage'));
const BrgyDashboard = lazy(() => import('../pages/Barangay_Staff/BrgyDashboard'));
const BrgyRescueRequests = lazy(() => import('../pages/Barangay_Staff/BrgyRescueRequests'));
const BrgyReportView = lazy(() => import('../pages/Barangay_Staff/BrgyReportView'));
const BrgyCommunityAlerts = lazy(() => import('../pages/Barangay_Staff/BrgyCommunityAlerts'));
const BrgyProfile = lazy(() => import('../pages/Barangay_Staff/BrgyProfile'));
const BrgyHoldingFacility = lazy(() => import('../pages/Barangay_Staff/BrgyHoldingFacility'));
const BrgyHistoryReports = lazy(() => import('../pages/Barangay_Staff/BrgyHistoryReports'));
const BrgyViewHistory = lazy(() => import('../pages/Barangay_Staff/BrgyViewHistory'));
const BrgyPersonnelManagement = lazy(() => import('../pages/Barangay_Staff/BrgyPersonnelManagement'));
const BrgyMessages = lazy(() => import('../pages/Barangay_Staff/BrgyMessages'));
const BrgySettings = lazy(() => import('../pages/Barangay_Staff/BrgySettings'));
const BrgyPetRecords = lazy(() => import('../pages/Barangay_Staff/BrgyPetRecords'));
const BrgyPetClaims = lazy(() => import('../pages/Barangay_Staff/BrgyPetClaims'));
const PetMatchReview = lazy(() => import('../pages/citizen/PetMatchReview'));
const PetClaimsDashboard = lazy(() => import('../pages/citizen/PetClaimsDashboard'));
const ReportStrayPage = lazy(() => import('../pages/citizen/ReportStrayPage'));
const ResidentSettings = lazy(() => import('../pages/citizen/ResidentSettings'));

const AppRoutes = () => {
    return (
        <>
        <RoleThemeSync />
        <PushBridge />
        <SessionGuard />
        <Suspense fallback={<PageLoading />}>
        <Routes>
            {/* Public Routes */}
            <Route path="/" element={<LandingPage />} />
            <Route path="/login" element={<ResidentsLogin />} />
            <Route path="/admin/login" element={<AdminLogin />} />
            <Route path="/staff/login" element={<CommunityStaffLogin />} />
            <Route path="/pet/scan/:token" element={<PetScanPage />} />
            <Route path="/pet/scan/:token/success" element={<PetScanSuccessPage />} />

            {/* Shared Authenticated QR Tag & Scan History Routes (Roles: Resident, Subd, Brgy, Admin) */}
            <Route element={<ProtectedRoute allowedRoles={[1, 2, 3, 4]} />}>
                <Route path="/resident/pet/:petId/qr" element={<PetQrCardPage />} />
                <Route path="/resident/pet/:petId/scan-history" element={<PetScanHistoryPage />} />
                <Route path="/subd/pet/:petId/qr" element={<PetQrCardPage />} />
                <Route path="/subd/pet/:petId/scan-history" element={<PetScanHistoryPage />} />
                <Route path="/brgy/pet/:petId/qr" element={<PetQrCardPage />} />
                <Route path="/brgy/pet/:petId/scan-history" element={<PetScanHistoryPage />} />
                <Route path="/admin/pet/:petId/qr" element={<PetQrCardPage />} />
                <Route path="/admin/pet/:petId/scan-history" element={<PetScanHistoryPage />} />
            </Route>

            {/* Protected Resident Routes (Role ID = 1) */}
            <Route element={<ProtectedRoute allowedRoles={[1]} />}>
                <Route path="/resident-home" element={<ResiHomePage />} />
                <Route path="/resident/report/new" element={<ReportStrayPage />} />
                <Route path="/resident/reports/:id" element={<ResiViewReport />} />
                <Route path="/resident/report/:id" element={<ResiViewReport />} />
                <Route path="/resident/pets" element={<ResidentPet />} />
                <Route path="/resident/profile" element={<ResiProfile />} />
                <Route path="/resident/settings" element={<ResidentSettings />} />
                <Route path="/resident/reports/:reportId/match-review" element={<PetMatchReview />} />
                <Route path="/resident/pet/:petId/claims-dashboard" element={<PetClaimsDashboard />} />
            </Route>


            {/* Protected Subdivision Leader Routes (Role ID = 2) */}
            <Route element={<ProtectedRoute allowedRoles={[2]} />}>
                <Route path="/subd/dashboard" element={<SubdDashboard />} />
                <Route path="/subd/analytics" element={<SubdAnalytics />} />
                <Route path="/subd/messages" element={<SubdMessages />} />
                <Route path="/subd-messages" element={<SubdMessages />} />
                <Route path="/subd/reports" element={<SubdReports />} />
                <Route path="/subd/reports/:id" element={<SubdViewReport />} />
                <Route path="/subd/history" element={<SubdHistoryReport />} />
                <Route path="/subd/history/:id" element={<SubdViewHistory />} />
                <Route path="/subd/escalated" element={<Navigate to="/subd/reports?status=Escalated%20to%20Barangay" replace />} />
                <Route path="/subd/pet-claims" element={<SubdPetClaims />} />
                <Route path="/subd/endorsements" element={<EndorsementArch />} />
                <Route path="/subd/pet-records" element={<SubdPetRecords />} />
                <Route path="/subd/removed-pets" element={<SubdRemovedPetRecords />} />
                <Route path="/subd/hazard-alert" element={<SubdHazardAlert />} />
                <Route path="/subd/holding-facility" element={<SubdHoldingFacility />} />
                <Route path="/subd/profile" element={<SubdProfile />} />
                <Route path="/subd/settings" element={<SubdSettings />} />
            </Route>

            {/* Protected Barangay Staff Routes (Role ID = 3) */}
            <Route element={<ProtectedRoute allowedRoles={[3]} />}>
                <Route path="/brgy/dashboard" element={<BrgyDashboard />} />
                <Route path="/brgy/messages" element={<BrgyMessages />} />
                <Route path="/brgy/rescue-requests" element={<BrgyRescueRequests />} />
                <Route path="/brgy/reports/:id" element={<BrgyReportView />} />
                <Route path="/brgy/rescue-requests/:id" element={<BrgyReportView />} />
                <Route path="/brgy/history-reports" element={<BrgyHistoryReports />} />
                <Route path="/brgy/community-alerts" element={<BrgyCommunityAlerts />} />
                <Route path="/brgy/profile" element={<BrgyProfile />} />
                <Route path="/brgy/settings" element={<BrgySettings />} />
                <Route path="/brgy/personnel" element={<BrgyPersonnelManagement />} />
                <Route path="/brgy/holding-facility" element={<BrgyHoldingFacility />} />
                <Route path="/brgy/pet-records" element={<BrgyPetRecords />} />
                <Route path="/brgy/pet-claims" element={<BrgyPetClaims />} />
                <Route path="/brgy/history" element={<BrgyHistoryReports />} />
                <Route path="/brgy/history/:id" element={<BrgyViewHistory />} />
            </Route>

            {/* Protected Admin Routes (Role ID = 4) */}
            <Route element={<ProtectedRoute allowedRoles={[4]} />}>
                <Route path="/admin/dashboard" element={<AdminDashboard />} />
                <Route path="/admin/analytics" element={<AdminAnalytics />} />
                <Route path="/admin/pet-records" element={<PetRecords />} />
                <Route path="/admin/users" element={<AdminUserManagement />} />
                <Route path="/admin/account-settings" element={<AdminAccountSettings />} />
                <Route path="/admin/settings" element={<AdminAccountSettings />} />
                <Route path="/admin/incidents" element={<AdminReport />} />
                <Route path="/admin/incidents/:id" element={<AdminReportView />} />
                <Route path="/admin/reports/:id" element={<AdminReportView />} />
                <Route path="/admin/heatmap" element={<AdminHeatMap />} />
                <Route path="/admin/warnings" element={<AdminWarnings />} />
                <Route path="/admin/citations" element={<Navigate to="/admin/warnings" replace />} />
                <Route path="/admin/logs" element={<AdminLogs />} />
                <Route path="/admin/pets" element={<Navigate to="/admin/pet-records" replace />} />
                <Route path="/admin/holding-facility" element={<BrgyHoldingFacility />} />
            </Route>


            {/* Catch-all Redirect to Login */}
            <Route path="*" element={<ResidentsLogin />} />
        </Routes>
        </Suspense>
        </>
    );
};

export default AppRoutes;