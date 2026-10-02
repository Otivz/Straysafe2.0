import AppRoutes from './routes/AppRoutes';
import './index.css';
import { ThemeProvider } from './context/ThemeContext';
import { ToastProvider } from './context/ToastContext';
import ToastContainer from './components/Notifications/ToastContainer';
import InactivityManager from './components/Auth/InactivityManager';

function App() {
  return (
    <ThemeProvider>
      <ToastProvider>
        <div className="min-h-screen w-full bg-app text-main transition-colors duration-300">
          <AppRoutes />
          <ToastContainer />
          <InactivityManager />
        </div>
      </ToastProvider>
    </ThemeProvider>
  );
}

export default App;