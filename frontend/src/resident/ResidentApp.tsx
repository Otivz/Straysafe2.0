import '../preview/styles/tokens.css';
import './styles/resident.css';
import { Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider, RequireAuth } from './auth/AuthProvider';
import { ToastProvider } from './components/ToastProvider';
import { Frame } from './layout/Frame';
import GuestLayout from './layout/GuestLayout';
import ResidentLayout from './layout/ResidentLayout';
import { ResidentModeContext, useResidentMode, type ResidentMode } from './mode';
import { PushRegistration } from './native/PushRegistration';
import HomePage from './pages/HomePage';
import NotFoundPage from './pages/NotFoundPage';
import EditProfilePage from './pages/account/EditProfilePage';
import HelpPage from './pages/account/HelpPage';
import ContactPage from './pages/account/ContactPage';
import NotificationsPage from './pages/account/NotificationsPage';
import PrivacyPage from './pages/account/PrivacyPage';
import ProfilePage from './pages/account/ProfilePage';
import SettingsPage from './pages/account/SettingsPage';
import ForgotPasswordPage from './pages/auth/ForgotPasswordPage';
import LoginPage from './pages/auth/LoginPage';
import RegisterPage from './pages/auth/RegisterPage';
import ResetPasswordPage from './pages/auth/ResetPasswordPage';
import VerifyPage from './pages/auth/VerifyPage';
import WelcomePage from './pages/auth/WelcomePage';
import ClaimPage from './pages/community/ClaimPage';
import ClaimStatusPage from './pages/community/ClaimStatusPage';
import CommunityPage from './pages/community/CommunityPage';
import NoticeDirectoryPage from './pages/community/NoticeDirectoryPage';
import NoticePage from './pages/community/NoticePage';
import SecuredPetPage from './pages/community/SecuredPetPage';
import SightingHistoryPage from './pages/community/SightingHistoryPage';
import SightingPage from './pages/community/SightingPage';
import { EditPetPage, RegisterPetPage } from './pages/pets/PetFormPage';
import PetDetailsPage from './pages/pets/PetDetailsPage';
import PetsPage from './pages/pets/PetsPage';
import CategoryPage from './pages/report/CategoryPage';
import DetailsPage from './pages/report/DetailsPage';
import EvidencePage from './pages/report/EvidencePage';
import LocationPage from './pages/report/LocationPage';
import ReviewPage from './pages/report/ReviewPage';
import SituationPage from './pages/report/SituationPage';
import SubmittedPage from './pages/report/SubmittedPage';
import AddUpdatePage from './pages/reports/AddUpdatePage';
import MyReportsPage from './pages/reports/MyReportsPage';
import RecoveryPage from './pages/reports/RecoveryPage';
import ReportDetailsPage from './pages/reports/ReportDetailsPage';
import ConversationPage from './pages/reports/ConversationPage';

/** Signed-in frame: data store + layout. Child routes render inside the layout's <Outlet />. */
function SignedIn() {
  const { DataProvider } = useResidentMode();
  return (
    <DataProvider>
      <PushRegistration />
      <ResidentLayout />
    </DataProvider>
  );
}

/**
 * The Resident screens and routes. The entry component (ResidentLiveRoot.tsx) supplies the sign-in gateway and the data store
 * through `mode`.
 */
export default function ResidentApp({ mode }: { mode: ResidentMode }) {
  return (
    <ResidentModeContext.Provider value={mode}>
      <AuthProvider>
        <ToastProvider>
          <Routes>
            {/* Android debug build only (mode.devConnection): reachable signed out or in, from the bar on every screen and from Settings. */}
            {mode.devConnection ? (
              <Route path="connection" element={<Frame><main id="main" tabIndex={-1} className="rs-main outline-none"><mode.devConnection.Page /></main></Frame>} />
            ) : null}
            <Route element={<GuestLayout />}>
              <Route path="welcome" element={<WelcomePage />} />
              <Route path="register" element={<RegisterPage />} />
              <Route path="verify" element={<VerifyPage />} />
              <Route path="login" element={<LoginPage />} />
              <Route path="forgot-password" element={<ForgotPasswordPage />} />
              <Route path="reset-password" element={<ResetPasswordPage />} />
            </Route>
            <Route element={<RequireAuth />}>
              <Route element={<SignedIn />}>
                <Route index element={<Navigate to="home" replace />} />
                <Route path="home" element={<HomePage />} />

                <Route path="report" element={<CategoryPage />} />
                <Route path="report/situation" element={<SituationPage />} />
                <Route path="report/details" element={<DetailsPage />} />
                <Route path="report/location" element={<LocationPage />} />
                <Route path="report/evidence" element={<EvidencePage />} />
                <Route path="report/review" element={<ReviewPage />} />
                <Route path="report/submitted/:reportId" element={<SubmittedPage />} />

                <Route path="reports" element={<MyReportsPage />} />
                <Route path="reports/:reportId" element={<ReportDetailsPage />} />
                <Route path="reports/:reportId/update" element={<AddUpdatePage />} />
                <Route path="reports/:reportId/recovered" element={<RecoveryPage />} />
                <Route path="conversations/:conversationId" element={<ConversationPage />} />

                <Route path="community" element={<CommunityPage />} />
                <Route path="community/lost" element={<NoticeDirectoryPage key="lost" kind="lost_pet" />} />
                <Route path="community/found" element={<NoticeDirectoryPage key="found" kind="found_animal" />} />
                <Route path="community/:noticeId" element={<NoticePage />} />
                <Route path="community/:noticeId/sighting" element={<SightingPage />} />
                <Route path="community/:noticeId/secured" element={<SecuredPetPage />} />
                <Route path="community/:noticeId/sightings" element={<SightingHistoryPage />} />
                <Route path="community/:noticeId/claim" element={<ClaimPage />} />
                <Route path="claims/:claimId" element={<ClaimStatusPage />} />

                <Route path="pets" element={<PetsPage />} />
                <Route path="pets/new" element={<RegisterPetPage />} />
                <Route path="pets/:petId" element={<PetDetailsPage />} />
                <Route path="pets/:petId/edit" element={<EditPetPage />} />

                <Route path="notifications" element={<NotificationsPage />} />
                <Route path="profile" element={<ProfilePage />} />
                <Route path="profile/edit" element={<EditProfilePage />} />
                <Route path="settings" element={<SettingsPage />} />
                <Route path="privacy" element={<PrivacyPage />} />
                <Route path="help" element={<HelpPage />} />
                <Route path="contact" element={<ContactPage />} />
                <Route path="*" element={<NotFoundPage />} />
              </Route>
            </Route>
          </Routes>
        </ToastProvider>
      </AuthProvider>
    </ResidentModeContext.Provider>
  );
}
