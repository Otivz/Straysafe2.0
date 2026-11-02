import { useState } from 'react';
import SubdSidebar from '../../components/SubdSidebar';
import SubdNavbar from '../../components/Navbars/SubdNavbar';
import SubdBottomNav from '../../components/Navbars/SubdBottomNav';
import ManualMatchingWorkspace from '../../components/ManualMatching/ManualMatchingWorkspace';

const SubdManualMatching = () => {
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
    return (
        <div className="min-h-screen w-full flex bg-[#F8F9FA] font-sans text-gray-800">
            <SubdSidebar mobileOpen={mobileMenuOpen} onMobileClose={() => setMobileMenuOpen(false)} />
            <main className="flex-1 flex flex-col h-screen overflow-hidden">
                <SubdNavbar onMenuToggle={() => setMobileMenuOpen(true)} leftContent={
                    <div className="flex flex-col">
                        <h1 className="text-xl font-black text-gray-900 tracking-tight leading-none uppercase">Manual Matching</h1>
                        <p className="text-[9px] text-gray-400 font-extrabold uppercase tracking-wider mt-1.5 leading-none">
                            Search, compare and verify possible report matches.
                        </p>
                    </div>
                } />
                <div className="flex-1 overflow-y-auto px-3 py-4 sm:p-6 pb-36 md:pb-6 flex flex-col gap-3 sm:gap-5 custom-scrollbar bg-[#FAFAF9]">
                    <ManualMatchingWorkspace reportPath={(id) => `/subd/reports/${id}`} />
                </div>
                <SubdBottomNav />
            </main>
        </div>
    );
};

export default SubdManualMatching;
