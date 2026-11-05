import { Link } from 'react-router-dom';
import { Building2 } from 'lucide-react';
import { clearAuthStorage } from '../utils/api';

/**
 * Shown for every old Barangay address (/brgy/...). StraySafe serves the subdivision only: the Barangay has no
 * account here and is contacted outside the system; the Subdivision Leader records its updates
 * (docs/01-system/BARANGAY_REFERRAL_LOG.md).
 */
export default function BarangayExternal() {
    let signedInAsBarangay = false;
    try {
        const raw = sessionStorage.getItem('staff_user') || localStorage.getItem('staff_user');
        signedInAsBarangay = raw ? JSON.parse(raw)?.role_id === 3 : false;
    } catch {
        signedInAsBarangay = false;
    }

    return (
        <main className="min-h-screen flex items-center justify-center px-4 py-10 bg-slate-50 dark:bg-slate-950">
            <section className="w-full max-w-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm p-6 text-center">
                <div className="w-12 h-12 mx-auto rounded-xl bg-indigo-600 text-white flex items-center justify-center">
                    <Building2 className="w-6 h-6" aria-hidden="true" />
                </div>
                <h1 className="mt-4 text-lg font-black text-slate-900 dark:text-slate-100">The Barangay is handled outside StraySafe</h1>
                <p className="mt-2 text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                    StraySafe now serves the subdivision only. Barangay accounts are no longer used.
                    When a case needs the Barangay, the Subdivision Leader contacts the Barangay directly and records its updates here.
                </p>
                <div className="mt-6 flex flex-col sm:flex-row gap-2 justify-center">
                    {signedInAsBarangay ? (
                        <button
                            type="button"
                            onClick={() => { clearAuthStorage(); window.location.assign('/'); }}
                            className="px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold cursor-pointer"
                        >
                            Sign out
                        </button>
                    ) : (
                        <Link to="/staff/login" className="px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold">
                            Subdivision Leader sign-in
                        </Link>
                    )}
                    <Link to="/" className="px-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 text-sm font-bold hover:bg-slate-100 dark:hover:bg-slate-800">
                        Go to home page
                    </Link>
                </div>
            </section>
        </main>
    );
}
