import AppRoutes from './routes/AppRoutes';
import './index.css';
import { ThemeProvider } from './context/ThemeContext';

function App() {
  return (
    <ThemeProvider>
      <div className="min-h-screen w-full bg-[#F7F7F7] dark:bg-[#121212] text-[#1a1208] dark:text-gray-100 transition-colors duration-300">
        <AppRoutes />
      </div>
    </ThemeProvider>
  );
}

export default App;