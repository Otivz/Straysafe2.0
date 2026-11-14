import '../preview/styles/tokens.css';
import './styles/ui.css';
import './styles/pages.css';
import { Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider, RequireAuth } from './auth/AuthProvider';
import { ToastProvider } from './components/ToastProvider';
import AdminLayout from './layout/AdminLayout';
import { AdminModeContext, useAdminMode, type AdminMode } from './mode';
import DashboardPage from './pages/DashboardPage';
import CasesPage from './pages/CasesPage';
import NotFoundPage from './pages/NotFoundPage';
import CaseDetailPage from './pages/case/CaseDetailPage';
import ComplaintsPage from './pages/complaints/ComplaintsPage';
import PersonPage from './pages/complaints/PersonPage';
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
  const { DataProvider } = useAdminMode();
  return (
    <DataProvider>
      <AdminLayout />
    </DataProvider>
  );
}

/**
 * The Subdivision Leader screens and routes. The entry component (AdminLiveRoot.tsx) supplies the sign-in gateway and the data
 * store through `mode`.
 */
export default function AdminApp({ mode }: { mode: AdminMode }) {
  return (
    <AdminModeContext.Provider value={mode}>
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
                <Route path="complaints" element={<ComplaintsPage />} />
                <Route path="complaints/people/:respondentId" element={<PersonPage />} />
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
    </AdminModeContext.Provider>
  );
}
