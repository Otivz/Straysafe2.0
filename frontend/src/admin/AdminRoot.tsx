import '../preview/styles/tokens.css';
import './styles/ui.css';
import './styles/pages.css';
import { useEffect } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider, RequireAuth } from './auth/AuthProvider';
import { ToastProvider } from './components/ToastProvider';
import { AdminDataProvider } from './data/DataProvider';
import AdminLayout from './layout/AdminLayout';
import DashboardPage from './pages/DashboardPage';
import CasesPage from './pages/CasesPage';
import NotFoundPage from './pages/NotFoundPage';
import CaseDetailPage from './pages/case/CaseDetailPage';
import CommunityPage from './pages/CommunityPage';
import NoticeEditorPage from './pages/NoticeEditorPage';
import PetDetailsPage from './pages/PetDetailsPage';
import PetsPage from './pages/PetsPage';
import ProfilePage from './pages/ProfilePage';
import ReportsPage from './pages/ReportsPage';
import ResidentDetailsPage from './pages/ResidentDetailsPage';
import ResidentsPage from './pages/ResidentsPage';
import SettingsPage from './pages/SettingsPage';
import ForgotPasswordPage from './pages/auth/ForgotPasswordPage';
import LoginPage from './pages/auth/LoginPage';
import ResetPasswordPage from './pages/auth/ResetPasswordPage';

/** Signed-in frame: data store + layout. Child routes render inside the layout's <Outlet />. */
function SignedIn() {
  return (
    <AdminDataProvider>
      <AdminLayout />
    </AdminDataProvider>
  );
}

/**
 * Entry for the Subdivision Admin UI (mounted by main.tsx at ADMIN_BASE, development builds only).
 * It sits outside the legacy providers on purpose: no legacy session guard, theme sync or API calls run here.
 */
export default function AdminRoot() {
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
          <Route path="login" element={<LoginPage />} />
          <Route path="forgot-password" element={<ForgotPasswordPage />} />
          <Route path="reset-password" element={<ResetPasswordPage />} />
          <Route element={<RequireAuth />}>
            <Route element={<SignedIn />}>
              <Route index element={<Navigate to="dashboard" replace />} />
              <Route path="dashboard" element={<DashboardPage />} />
              <Route path="cases" element={<CasesPage />} />
              <Route path="cases/:caseId" element={<CaseDetailPage />} />
              <Route path="community" element={<CommunityPage />} />
              <Route path="community/new" element={<NoticeEditorPage />} />
              <Route path="community/:noticeId/edit" element={<NoticeEditorPage />} />
              <Route path="pets" element={<PetsPage />} />
              <Route path="pets/:petId" element={<PetDetailsPage />} />
              <Route path="residents" element={<ResidentsPage />} />
              <Route path="residents/:residentId" element={<ResidentDetailsPage />} />
              <Route path="reports" element={<ReportsPage />} />
              <Route path="settings" element={<SettingsPage />} />
              <Route path="profile" element={<ProfilePage />} />
              <Route path="*" element={<NotFoundPage />} />
            </Route>
          </Route>
        </Routes>
      </ToastProvider>
    </AuthProvider>
  );
}
