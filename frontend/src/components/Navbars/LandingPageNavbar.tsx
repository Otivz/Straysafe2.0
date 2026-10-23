import { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Menu, X, ArrowRight, ShieldCheck, Heart, User, LogIn } from 'lucide-react';
import Button from '../Button';
import { useSignedInUser, homePathFor } from '../../utils/useSignedInUser';

const LandingPageNavbar = () => {
    const [isScrolled, setIsScrolled] = useState(false);
    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
    const location = useLocation();
    const { user: signedIn } = useSignedInUser();
    const accountPath = signedIn ? homePathFor(signedIn) : '/login';
    const accountLabel = signedIn ? `Continue as ${String(signedIn.name || 'your account').split(' ')[0]}` : 'Sign In';

    useEffect(() => {
        const handleScroll = () => {
            setIsScrolled(window.scrollY > 15);
        };
        window.addEventListener('scroll', handleScroll, { passive: true });
        return () => window.removeEventListener('scroll', handleScroll);
    }, []);

    // Prevent background scroll when mobile menu is open
    useEffect(() => {
        if (isMobileMenuOpen) {
            document.body.style.overflow = 'hidden';
        } else {
            document.body.style.overflow = '';
        }
        return () => {
            document.body.style.overflow = '';
        };
    }, [isMobileMenuOpen]);

    // Close mobile menu on route change
    useEffect(() => {
        setIsMobileMenuOpen(false);
    }, [location]);

    const navLinks = [
        { name: 'What is StraySafe', href: '#about', isInternal: false },
        { name: 'How It Works', href: '#how-it-works', isInternal: false },
        { name: 'User Roles', href: '#roles', isInternal: false },
        { name: 'Features', href: '#features', isInternal: false },
        { name: 'AI Assistance', href: '#ai', isInternal: false },
        { name: 'Adopt a Pet', href: '/adopt', isInternal: true, highlight: true },
    ];

    const scrollToSection = (e: React.MouseEvent<HTMLAnchorElement>, href: string) => {
        if (href.startsWith('#')) {
            e.preventDefault();
            setIsMobileMenuOpen(false);
            const target = document.querySelector(href);
            if (target) {
                const navHeight = 80;
                const elementPosition = target.getBoundingClientRect().top;
                const offsetPosition = elementPosition + window.pageYOffset - navHeight;
                window.scrollTo({
                    top: offsetPosition,
                    behavior: 'smooth',
                });
            }
        }
    };

    return (
        <header
            className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
                isScrolled
                    ? 'bg-white/95 backdrop-blur-md shadow-sm border-b border-orange-100/60 py-3'
                    : 'bg-white/70 backdrop-blur-sm py-4 sm:py-5'
            }`}
        >
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                <div className="flex items-center justify-between gap-4">
                    {/* BRAND LOGO */}
                    <Link to="/" className="flex items-center gap-2.5 sm:gap-3 group shrink-0 focus:outline-none">
                        <div className="relative flex items-center justify-center">
                            <div className="absolute inset-0 bg-orange-500/20 blur-md rounded-full group-hover:bg-orange-500/35 transition-colors duration-300" />
                            <img
                                src="/SSLOGO-128.png"
                                alt="StraySafe Logo"
                                className="relative w-9 h-9 sm:w-10 sm:h-10 object-contain transition-transform duration-300 group-hover:scale-105"
                                width="40"
                                height="40"
                            />
                        </div>
                        <div className="flex flex-col">
                            <div className="flex items-center gap-1.5">
                                <span className="font-plus-jakarta font-extrabold text-base sm:text-lg tracking-tight text-[#1a1208] group-hover:text-[#F97316] transition-colors">
                                    StraySafe
                                </span>
                                <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-orange-100/80 text-orange-800 font-mono">
                                    2.0
                                </span>
                            </div>
                            <span className="text-[10px] font-medium text-stone-500 tracking-wide hidden xs:block">
                                Community Animal Welfare
                            </span>
                        </div>
                    </Link>

                    {/* DESKTOP NAVIGATION LINKS */}
                    <nav className="hidden lg:flex items-center gap-6 xl:gap-8" aria-label="Main Navigation">
                        {navLinks.map((link) =>
                            link.isInternal ? (
                                <Link
                                    key={link.name}
                                    to={link.href}
                                    className={`text-sm font-semibold transition-colors duration-200 flex items-center gap-1.5 ${
                                        link.highlight
                                            ? 'text-orange-600 hover:text-orange-700 font-bold bg-orange-50/80 px-2.5 py-1 rounded-full border border-orange-200/60'
                                            : 'text-stone-700 hover:text-orange-600'
                                    }`}
                                >
                                    {link.highlight && <Heart className="w-3.5 h-3.5 text-orange-500 fill-orange-500/30" />}
                                    {link.name}
                                </Link>
                            ) : (
                                <a
                                    key={link.name}
                                    href={link.href}
                                    onClick={(e) => scrollToSection(e, link.href)}
                                    className="text-sm font-semibold text-stone-700 hover:text-orange-600 transition-colors duration-200"
                                >
                                    {link.name}
                                </a>
                            )
                        )}
                    </nav>

                    {/* DESKTOP ACTION BUTTONS */}
                    <div className="hidden sm:flex items-center gap-3">
                        <Link to={accountPath}>
                            <Button
                                variant="ghost"
                                size="md"
                                className="text-stone-700 hover:text-orange-600 text-xs sm:text-sm font-semibold px-3 py-2"
                            >
                                <span className="inline-flex items-center gap-1.5">
                                    <LogIn className="w-4 h-4" /> {accountLabel}
                                </span>
                            </Button>
                        </Link>
                        <Link to="/resident/report/new">
                            <Button
                                variant="primary"
                                size="md"
                                className="px-4 sm:px-5 py-2 sm:py-2.5 rounded-xl shadow-md shadow-orange-500/20 text-xs sm:text-sm font-bold bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 border-none transition-all duration-200 hover:shadow-lg hover:shadow-orange-500/25 active:scale-[0.98]"
                            >
                                Report a Stray
                            </Button>
                        </Link>
                    </div>

                    {/* MOBILE ACTIONS & TOGGLE */}
                    <div className="flex sm:hidden items-center gap-2">
                        <Link to="/resident/report/new">
                            <Button
                                variant="primary"
                                size="sm"
                                className="px-3 py-1.5 text-xs font-bold rounded-lg bg-orange-500 hover:bg-orange-600 border-none"
                            >
                                Report
                            </Button>
                        </Link>
                        <button
                            type="button"
                            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
                            className="p-2 rounded-xl text-stone-700 hover:text-orange-600 hover:bg-orange-50/80 focus:outline-none focus:ring-2 focus:ring-orange-500 transition-colors"
                            aria-expanded={isMobileMenuOpen}
                            aria-label="Toggle Navigation Menu"
                        >
                            {isMobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
                        </button>
                    </div>

                    {/* TABLET TOGGLE BUTTON */}
                    <div className="hidden sm:flex lg:hidden items-center">
                        <button
                            type="button"
                            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
                            className="p-2.5 rounded-xl text-stone-700 hover:text-orange-600 hover:bg-orange-50/80 focus:outline-none focus:ring-2 focus:ring-orange-500 transition-colors"
                            aria-expanded={isMobileMenuOpen}
                            aria-label="Toggle Navigation Menu"
                        >
                            {isMobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
                        </button>
                    </div>
                </div>
            </div>

            {/* MOBILE / TABLET SLIDE-DOWN DRAWER */}
            {isMobileMenuOpen && (
                <div
                    className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm lg:hidden transition-opacity"
                    onClick={() => setIsMobileMenuOpen(false)}
                >
                    <div
                        className="fixed top-0 right-0 bottom-0 w-full max-w-xs sm:max-w-sm bg-white shadow-2xl flex flex-col z-50 border-l border-stone-200 overflow-y-auto animate-in slide-in-from-right duration-250"
                        onClick={(e) => e.stopPropagation()}
                    >
                        {/* DRAWER HEADER */}
                        <div className="p-4 sm:p-5 border-b border-stone-100 flex items-center justify-between">
                            <div className="flex items-center gap-2.5">
                                <img src="/SSLOGO-128.png" alt="StraySafe Logo" className="w-8 h-8 object-contain" />
                                <div>
                                    <span className="font-plus-jakarta font-extrabold text-base text-[#1a1208]">
                                        StraySafe 2.0
                                    </span>
                                    <span className="block text-[10px] text-stone-500 font-medium">
                                        Community Animal Welfare
                                    </span>
                                </div>
                            </div>
                            <button
                                type="button"
                                onClick={() => setIsMobileMenuOpen(false)}
                                className="p-2 rounded-lg text-stone-500 hover:text-stone-800 hover:bg-stone-100"
                                aria-label="Close menu"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        {/* DRAWER NAV LINKS */}
                        <div className="p-4 sm:p-6 space-y-1.5 flex-1">
                            <p className="text-[10px] font-bold text-stone-400 uppercase tracking-widest px-3 mb-2">
                                Navigation
                            </p>
                            {navLinks.map((link) =>
                                link.isInternal ? (
                                    <Link
                                        key={link.name}
                                        to={link.href}
                                        onClick={() => setIsMobileMenuOpen(false)}
                                        className={`flex items-center justify-between px-3 py-2.5 rounded-xl text-sm font-semibold transition-colors ${
                                            link.highlight
                                                ? 'bg-orange-50 text-orange-700 font-bold border border-orange-200/60'
                                                : 'text-stone-700 hover:bg-stone-50 hover:text-orange-600'
                                        }`}
                                    >
                                        <span className="flex items-center gap-2">
                                            {link.highlight && <Heart className="w-4 h-4 text-orange-500" />}
                                            {link.name}
                                        </span>
                                        <ArrowRight className="w-4 h-4 text-stone-400" />
                                    </Link>
                                ) : (
                                    <a
                                        key={link.name}
                                        href={link.href}
                                        onClick={(e) => scrollToSection(e, link.href)}
                                        className="flex items-center justify-between px-3 py-2.5 rounded-xl text-sm font-semibold text-stone-700 hover:bg-stone-50 hover:text-orange-600 transition-colors"
                                    >
                                        <span>{link.name}</span>
                                        <ArrowRight className="w-4 h-4 text-stone-400" />
                                    </a>
                                )
                            )}

                            {/* PORTAL ACCESS SECTION */}
                            <div className="pt-5 mt-4 border-t border-stone-100">
                                <p className="text-[10px] font-bold text-stone-400 uppercase tracking-widest px-3 mb-2">
                                    Portal Sign In
                                </p>
                                <div className="space-y-1">
                                    <Link
                                        to="/login"
                                        onClick={() => setIsMobileMenuOpen(false)}
                                        className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-semibold text-stone-700 hover:bg-orange-50 hover:text-orange-600 transition-colors"
                                    >
                                        <User className="w-4 h-4 text-orange-500" />
                                        <span>Resident / Citizen Portal</span>
                                    </Link>
                                    <Link
                                        to="/staff/login"
                                        onClick={() => setIsMobileMenuOpen(false)}
                                        className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-semibold text-stone-700 hover:bg-amber-50 hover:text-amber-700 transition-colors"
                                    >
                                        <ShieldCheck className="w-4 h-4 text-amber-500" />
                                        <span>Subdivision & Barangay Staff</span>
                                    </Link>
                                    <Link
                                        to="/admin/login"
                                        onClick={() => setIsMobileMenuOpen(false)}
                                        className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-semibold text-stone-700 hover:bg-stone-100 transition-colors"
                                    >
                                        <ShieldCheck className="w-4 h-4 text-stone-500" />
                                        <span>System Administrator</span>
                                    </Link>
                                </div>
                            </div>
                        </div>

                        {/* DRAWER FOOTER CTAS */}
                        <div className="p-4 sm:p-5 border-t border-stone-100 bg-stone-50/60 space-y-2.5">
                            <Link to="/resident/report/new" onClick={() => setIsMobileMenuOpen(false)} className="block w-full">
                                <Button variant="primary" size="lg" className="w-full rounded-xl py-3 font-bold text-sm bg-orange-500 hover:bg-orange-600 border-none shadow-md shadow-orange-500/20">
                                    Report a Stray Sighting
                                </Button>
                            </Link>
                            <Link to={accountPath} onClick={() => setIsMobileMenuOpen(false)} className="block w-full">
                                <Button variant="light" size="md" className="w-full rounded-xl py-2.5 font-semibold text-xs border-stone-200 text-stone-700">
                                    {signedIn ? accountLabel : 'Sign In to Account'}
                                </Button>
                            </Link>
                        </div>
                    </div>
                </div>
            )}
        </header>
    );
};

export default LandingPageNavbar;
