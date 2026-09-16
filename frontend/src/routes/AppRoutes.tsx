import { Routes, Route } from 'react-router-dom';
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
import SubdViewReport from '../pages/Subd_Leaders/SubdViewReport';
import EscelatedMissions from '../pages/Subd_Leaders/EscelatedMissions';
import SubdHistoryReport from '../pages/Subd_Leaders/SubdHistoryReport';
import SubdViewHistory from '../pages/Subd_Leaders/SubdViewHistory';
import SubdPetClaims from '../pages/Subd_Leaders/SubdPetClaims';
import EndorsementArch from '../pages/Subd_Leaders/EndorsementArch';
import SubdPetRecords from '../pages/Subd_Leaders/SubdPetRecords';
import SubdRemovedPetRecords from '../pages/Subd_Leaders/SubdRemovedPetRecords';
import SubdProfile from '../pages/Subd_Leaders/SubdProfile';
import SubdHazardAlert from '../pages/Subd_Leaders/SubdHazardAlert';
import SubdMessages from '../pages/Subd_Leaders/SubdMessages';
import SubdSettings from '../pages/Subd_Leaders/SubdSettings';
import SubdHoldingFacility from '../pages/Subd_Leaders/SubdHoldingFacility';

import LandingPage from '../pages/citizen/LandingPage';
import ResidentsLogin from '../pages/citizen/ResidentsLogin';
import ResiHomePage from '../pages/citizen/ResiHomePage';
import ResiViewReport from '../pages/citizen/ResiViewReport';
import ResidentPet from '../pages/citizen/ResidentPet';
import ResiProfile from '../pages/citizen/ResiProfile';
import PetScanPage from '../pages/citizen/PetScanPage';
import PetScanSuccessPage from '../pages/citizen/PetScanSuccessPage';
import PetQrCardPage from '../pages/citizen/PetQrCardPage';
import PetScanHistoryPage from '../pages/citizen/PetScanHistoryPage';
import BrgyDashboard from '../pages/Barangay_Staff/BrgyDashboard';
import BrgyRescueRequests from '../pages/Barangay_Staff/BrgyRescueRequests';
import BrgyReportView from '../pages/Barangay_Staff/BrgyReportView';
import BrgyCommunityAlerts from '../pages/Barangay_Staff/BrgyCommunityAlerts';
import BrgyProfile from '../pages/Barangay_Staff/BrgyProfile';
import BrgyHoldingFacility from '../pages/Barangay_Staff/BrgyHoldingFacility';
import BrgyHistoryReports from '../pages/Barangay_Staff/BrgyHistoryReports';
import BrgyViewHistory from '../pages/Barangay_Staff/BrgyViewHistory';
import BrgyPersonnelManagement from '../pages/Barangay_Staff/BrgyPersonnelManagement';
import BrgyMessages from '../pages/Barangay_Staff/BrgyMessages';
import BrgySettings from '../pages/Barangay_Staff/BrgySettings';
import BrgyPetRecords from '../pages/Barangay_Staff/BrgyPetRecords';
import BrgyPetClaims from '../pages/Barangay_Staff/BrgyPetClaims';
import PetMatchReview from '../pages/citizen/PetMatchReview';
import PetClaimsDashboard from '../pages/citizen/PetClaimsDashboard';
import ReportStrayPage from '../pages/citizen/ReportStrayPage';
import ResidentSettings from '../pages/citizen/ResidentSettings';
import AdoptionCatalog from '../pages/citizen/AdoptionCatalog';
import AnimalJourneyMap from '../pages/citizen/AnimalJourneyMap';
import AdoptionApplyForm from '../pages/citizen/AdoptionApplyForm';
import MyAdoptionApplications from '../pages/citizen/MyAdoptionApplications';
import BrgyAdoptions from '../pages/Barangay_Staff/BrgyAdoptions';

const AppRoutes = () => {
    return (
        <Routes>
            {/* Public Routes */}
            <Route path="/" element={<LandingPage />} />
            <Route path="/login" element={<ResidentsLogin />} />
            <Route path="/admin/login" element={<AdminLogin />} />
            <Route path="/staff/login" element={<CommunityStaffLogin />} />
            <Route path="/pet/scan/:token" element={<PetScanPage />} />
            <Route path="/pet/scan/:token/success" element={<PetScanSuccessPage />} />
            <Route path="/adopt" element={<AdoptionCatalog />} />
            <Route path="/adopt/journey/:id" element={<AnimalJourneyMap />} />

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
                <Route path="/adopt/apply/:id" element={<AdoptionApplyForm />} />
                <Route path="/adopt/applications" element={<MyAdoptionApplications />} />
            </Route>

            {/* Protected Subdivision Leader Routes (Role ID = 2) */}
            <Route element={<ProtectedRoute allowedRoles={[2]} />}>
                <Route path="/subd/dashboard" element={<SubdDashboard />} />
                <Route path="/subd/messages" element={<SubdMessages />} />
                <Route path="/subd/reports" element={<SubdReports />} />
                <Route path="/subd/reports/:id" element={<SubdViewReport />} />
                <Route path="/subd/history" element={<SubdHistoryReport />} />
                <Route path="/subd/history/:id" element={<SubdViewHistory />} />
                <Route path="/subd/escalated" element={<EscelatedMissions />} />
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
                <Route path="/admin/pet-records" element={<PetRecords />} />
                <Route path="/admin/users" element={<AdminUserManagement />} />
                <Route path="/admin/account-settings" element={<AdminAccountSettings />} />
                <Route path="/admin/settings" element={<AdminAccountSettings />} />
                <Route path="/admin/incidents" element={<AdminReport />} />
                <Route path="/admin/heatmap" element={<AdminHeatMap />} />
                <Route path="/admin/logs" element={<AdminLogs />} />
                <Route path="/admin/pets" element={<AdminPetManagement />} />
                <Route path="/admin/holding-facility" element={<BrgyHoldingFacility />} />
            </Route>

            {/* Barangay Exclusive Adoptions Portal (Role 3: Barangay Staff, Role 4: System Admin) */}
            <Route element={<ProtectedRoute allowedRoles={[3, 4]} />}>
                <Route path="/brgy/adoptions" element={<BrgyAdoptions />} />
                <Route path="/admin/adoptions" element={<BrgyAdoptions />} />
            </Route>

            {/* Catch-all Redirect to Login */}
            <Route path="*" element={<ResidentsLogin />} />
        </Routes>
    );
};

export default AppRoutes;