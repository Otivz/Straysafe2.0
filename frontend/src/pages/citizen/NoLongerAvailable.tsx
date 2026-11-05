import { Link } from 'react-router-dom';
import { Info } from 'lucide-react';

/**
 * Shown for retired resident pages (Subdivision-only): adoption and pet claiming happen with the Barangay outside
 * StraySafe. Lost-pet alerts, reports and "Pet Recovered" stay.
 */
export default function NoLongerAvailable() {
    let home = '/';
    try {
        if (sessionStorage.getItem('resident_user') || localStorage.getItem('resident_user')) home = '/resident-home';
    } catch {
        home = '/';
    }

    return (
        <main className="min-h-screen flex items-center justify-center px-4 py-10 bg-[#FFFBF5] dark:bg-slate-950">
            <section className="w-full max-w-md bg-white dark:bg-slate-900 border border-orange-100 dark:border-slate-800 rounded-2xl shadow-sm p-6 text-center">
                <div className="w-12 h-12 mx-auto rounded-xl bg-orange-500 text-white flex items-center justify-center">
                    <Info className="w-6 h-6" aria-hidden="true" />
                </div>
                <h1 className="mt-4 text-lg font-black text-slate-900 dark:text-slate-100">This page is no longer available</h1>
                <p className="mt-2 text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                    Adopting an animal and claiming a pet from the Barangay holding place are handled by the Barangay, outside StraySafe.
                    For help, contact your Subdivision Leader.
                </p>
                <div className="mt-6 flex justify-center">
                    <Link to={home} className="px-4 py-2.5 rounded-xl bg-orange-500 hover:bg-orange-600 text-white text-sm font-bold">
                        {home === '/' ? 'Go to home page' : 'Back to my home'}
                    </Link>
                </div>
            </section>
        </main>
    );
}
