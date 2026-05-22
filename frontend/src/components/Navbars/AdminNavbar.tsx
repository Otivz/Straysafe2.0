import { useNavigate } from 'react-router-dom';

const AdminNavbar = () => {
    const navigate = useNavigate();

    const handleLogout = () => {
        localStorage.removeItem('admin_user');
        sessionStorage.removeItem('admin_user');
        navigate('/admin/login');
    };

    // Get user email from storage
    const userStr = localStorage.getItem('admin_user') || sessionStorage.getItem('admin_user');
    const user = userStr ? JSON.parse(userStr) : { email: 'admin@straysafe.com' };

    return (
        <header className="h-20 bg-white border-b border-gray-100 flex items-center justify-end px-8 sticky top-0 z-10 w-full">
            {/* Right Side Actions */}
            <div className="flex items-center space-x-6">
                {/* Notifications */}
                <button className="relative p-2 text-gray-400 hover:text-[#F97316] hover:bg-orange-50 rounded-lg transition-all group">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                    </svg>
                    <span className="absolute top-2 right-2.5 w-2 h-2 bg-red-500 rounded-full border-2 border-white"></span>
                </button>

                {/* Settings */}
                <button className="p-2 text-gray-400 hover:text-[#F97316] hover:bg-orange-50 rounded-lg transition-all group">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                </button>

                {/* Vertical Divider */}
                <div className="h-8 w-px bg-gray-100 mx-1"></div>

                {/* Profile Section with Hover Dropdown */}
                <div className="relative group">
                    <button className="flex items-center space-x-3 pl-3 pr-1 py-1 hover:bg-gray-50 rounded-2xl transition-all cursor-pointer">
                        <div className="flex flex-col text-right hidden lg:block">
                            <p className="text-sm font-bold text-gray-900 leading-none">{user.name || 'Admin User'}</p>
                            <p className="text-[10px] font-medium text-gray-400 mt-1 uppercase tracking-wider">Super Administrator</p>
                        </div>
                        <div className="w-10 h-10 rounded-full border-2 border-white shadow-sm overflow-hidden bg-gray-200">
                            {/* Avatar Image Placeholder */}
                            <div className="w-full h-full flex items-center justify-center bg-[#F97316] text-white font-extrabold text-sm uppercase">
                                {user.name ? user.name.charAt(0) : 'A'}
                            </div>
                        </div>
                    </button>

                    {/* Dropdown Menu */}
                    <div className="absolute right-0 mt-0 w-56 pt-2 opacity-0 invisible translate-y-2 group-hover:opacity-100 group-hover:visible group-hover:translate-y-0 transition-all duration-300 z-50">
                        <div className="bg-white rounded-2xl shadow-xl border border-gray-100 overflow-hidden py-2">
                            <div className="px-4 py-3 border-b border-gray-50 bg-gray-50/50">
                                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Signed in as</p>
                                <p className="text-xs font-bold text-gray-900 truncate">{user.email}</p>
                            </div>

                            <div className="p-1">
                                <button 
                                    onClick={() => navigate('/admin/account-settings')}
                                    className="w-full flex items-center space-x-3 px-3 py-2.5 text-sm text-gray-600 hover:text-[#F97316] hover:bg-orange-50 rounded-xl transition-all group/item"
                                >
                                    <div className="p-1.5 bg-gray-100 rounded-lg text-gray-400 group-hover/item:bg-orange-100 group-hover/item:text-[#F97316] transition-colors">
                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                                        </svg>
                                    </div>
                                    <span className="font-semibold">Account Settings</span>
                                </button>

                                <button className="w-full flex items-center space-x-3 px-3 py-2.5 text-sm text-gray-600 hover:text-[#F97316] hover:bg-orange-50 rounded-xl transition-all group/item">
                                    <div className="p-1.5 bg-gray-100 rounded-lg text-gray-400 group-hover/item:bg-orange-100 group-hover/item:text-[#F97316] transition-colors">
                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                        </svg>
                                    </div>
                                    <span className="font-semibold">Settings</span>
                                </button>
                            </div>

                            <div className="p-1 border-t border-gray-50 mt-1">
                                <button
                                    onClick={handleLogout}
                                    className="w-full flex items-center space-x-3 px-3 py-2.5 text-sm text-red-600 hover:bg-red-50 rounded-xl transition-all group/item"
                                >
                                    <div className="p-1.5 bg-red-100/50 rounded-lg text-red-500 group-hover/item:bg-red-100 transition-colors">
                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                                        </svg>
                                    </div>
                                    <span className="font-bold uppercase tracking-wider text-xs">Logout</span>
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </header>
    );
};

export default AdminNavbar;
