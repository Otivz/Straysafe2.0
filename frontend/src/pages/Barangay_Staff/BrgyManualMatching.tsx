import { useState } from 'react';
import BrgySidebar from '../../components/BrgySidebar';
import BrgyNavbar from '../../components/Navbars/BrgyNavbar';
import BrgyBottomNav from '../../components/Navbars/BrgyBottomNav';
import ManualMatchingWorkspace from '../../components/ManualMatching/ManualMatchingWorkspace';
import { BARANGAY_SCOPE_TEXT } from '../../utils/matchingScope';

const BrgyManualMatching = () => {
    const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);
    return (
        <div className="min-h-screen w-full flex bg-[#F8F9FA] font-sans text-gray-800">
            <BrgySidebar isMobileOpen={mobileDrawerOpen} onCloseMobile={() => setMobileDrawerOpen(false)} />
            <main className="flex-1 flex flex-col h-screen overflow-hidden">
                <BrgyNavbar
                    onMenuToggle={() => setMobileDrawerOpen(true)}
                    leftContent={
                        <div className="flex flex-col">
                            <h1 className="text-xl font-black text-gray-900 tracking-tight leading-none uppercase">Manual Matching</h1>
                            <p className="text-[9px] text-gray-400 font-extrabold uppercase tracking-wider mt-1.5 leading-none">
                                Search, compare and verify possible report matches.
                            </p>
                        </div>
                    }
                />
                <div className="flex-1 overflow-y-auto px-3 py-4 sm:p-6 pb-36 lg:pb-6 flex flex-col gap-3 sm:gap-5 custom-scrollbar bg-[#FAFAF9]">
                    {/* Data scope (enforced by the server, app/utils/matching_scope.py) */}
                    <div className="flex items-start gap-2 rounded-2xl border border-orange-200 bg-orange-50 px-4 py-3" data-testid="brgy-matching-scope">
                        <span aria-hidden="true">🔒</span>
                        <div>
                            <p className="text-xs font-black text-orange-900">{BARANGAY_SCOPE_TEXT}</p>
                            <p className="text-[11px] font-medium text-orange-800">
                                Published Lost Pet reports are included. Private subdivision pet registries and internal subdivision records stay with the Subdivision until they are endorsed to the Barangay.
                            </p>
                        </div>
                    </div>
                    <ManualMatchingWorkspace reportPath={(id) => `/brgy/reports/${id}`} scope="barangay" />
                </div>
                <BrgyBottomNav />
            </main>
        </div>
    );
};

export default BrgyManualMatching;
