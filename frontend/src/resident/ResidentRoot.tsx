import '../preview/styles/tokens.css';
import './styles/resident.css';
import { useEffect } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider, RequireAuth } from './auth/AuthProvider';
import { ToastProvider } from './components/ToastProvider';
import { ResidentDataProvider } from './data/DataProvider';
import GuestLayout from './layout/GuestLayout';
import ResidentLayout from './layout/ResidentLayout';
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
import NoticePage from './pages/community/NoticePage';
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
import SubmittedPage from './pages/report/SubmittedPage';
import AddUpdatePage from './pages/reports/AddUpdatePage';
import MyReportsPage from './pages/reports/MyReportsPage';
import RecoveryPage from './pages/reports/RecoveryPage';
import ReportDetailsPage from './pages/reports/ReportDetailsPage';

/** Signed-in frame: data store + layout. Child routes render inside the layout's <Outlet />. */
function SignedIn() {
  return (
    <ResidentDataProvider>
      <ResidentLayout />
    </ResidentDataProvider>
  );
}

/**
 * Entry for the Resident mobile UI (mounted by main.tsx at RESIDENT_BASE, development builds only).
 * It sits outside the legacy providers on purpose: no legacy session guard, theme sync or API calls run here.
 */
export default function ResidentRoot() {
  // The legacy global stylesheet restyles headings, inputs and <main> when <html class="dark"> or data-role is set.
  // This UI is light-only, so neutralise both while it is mounted and restore them on the way out.
  useEffect(() => {
    const root = document.documentElement;
    const wasDark = root.classList.contains('dark');
    const role = root.getAttribute('data-role');
    root.classList.remove('dark');
    root.removeAttribute('data-role');
    return () => {
      if (wasDark) root.classList.add('dark');
      if (role) root.setAttribute('data-role', role);
    };
  }, []);

  return (
    <AuthProvider>
      <ToastProvider>
        <Routes>
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
              <Route path="report/details" element={<DetailsPage />} />
              <Route path="report/location" element={<LocationPage />} />
              <Route path="report/evidence" element={<EvidencePage />} />
              <Route path="report/review" element={<ReviewPage />} />
              <Route path="report/submitted/:reportId" element={<SubmittedPage />} />

              <Route path="reports" element={<MyReportsPage />} />
              <Route path="reports/:reportId" element={<ReportDetailsPage />} />
              <Route path="reports/:reportId/update" element={<AddUpdatePage />} />
              <Route path="reports/:reportId/recovered" element={<RecoveryPage />} />

              <Route path="community" element={<CommunityPage />} />
              <Route path="community/:noticeId" element={<NoticePage />} />
              <Route path="community/:noticeId/sighting" element={<SightingPage />} />
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
  );
}
