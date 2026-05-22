import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import Button from '../Button';

const LandingPageNavbar = () => {
    const [isScrolled, setIsScrolled] = useState(false);
    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

    useEffect(() => {
        const handleScroll = () => {
            setIsScrolled(window.scrollY > 20);
        };
        window.addEventListener('scroll', handleScroll);
        return () => window.removeEventListener('scroll', handleScroll);
    }, []);

    const navLinks = [
        { name: 'How It Works', href: '#how-it-works' },
        { name: 'User Roles', href: '#roles' },
        { name: 'AI Features', href: '#ai' },
        { name: 'Contact', href: '#contact' },
    ];

    return (
        <nav
            id="navbar"
            className={`fixed top-0 left-0 right-0 z-[100] transition-all duration-500 ease-out px-6 md:px-24 lg:px-32 ${isScrolled
                    ? 'h-20 bg-white/80 backdrop-blur-xl border-b border-[#ede8e0] shadow-sm'
                    : 'h-24 bg-transparent border-b border-transparent'
                }`}
        >
            <div className="max-w-7xl mx-auto h-full flex items-center justify-between">
                {/* LOGO */}
                <Link to="/" className="flex items-center gap-2 md:gap-3 group shrink-0">
                    <div className="relative">
                        <div className="absolute inset-0 bg-orange-500/20 blur-xl rounded-full group-hover:bg-orange-500/30 transition-colors duration-500" />
                        <img
                            src="/SSLOGO.png"
                            alt="StraySafe Logo"
                            className="relative w-10 h-10 md:w-12 md:h-12 object-contain transition-transform duration-500 group-hover:scale-110"
                        />
                    </div>
                    <div className="flex flex-col">
                        <span className="font-plus-jakarta font-black text-lg md:text-xl tracking-tighter text-[#1a1208] leading-none group-hover:text-[#F97316] transition-colors duration-300">
                            STRAY SAFE
                        </span>
                        <span className="hidden min-[450px]:block text-[8px] md:text-[9px] font-bold text-[#9c8670] uppercase tracking-[0.15em] md:tracking-[0.2em] leading-none mt-1 group-hover:text-orange-400 transition-colors duration-300">
                            Animal Welfare
                        </span>
                    </div>
                </Link>

                {/* DESKTOP NAV LINKS */}
                <ul className="hidden lg:flex items-center gap-10">
                    {navLinks.map((link) => (
                        <li key={link.name}>
                            <a
                                href={link.href}
                                className="relative text-sm font-bold text-[#4a3b28] hover:text-[#F97316] transition-all duration-300 group py-2"
                            >
                                {link.name}
                                <span className="absolute bottom-0 left-0 w-0 h-0.5 bg-[#F97316] transition-all duration-300 group-hover:w-full rounded-full" />
                            </a>
                        </li>
                    ))}
                </ul>

                {/* ACTIONS */}
                <div className="flex items-center gap-4">
                    <div className="hidden sm:flex items-center">
                        <Link to="/login">
                            <Button variant="ghost" size="sm" className="font-bold text-[#4a3b28] hover:text-[#F97316]">
                                Sign In
                            </Button>
                        </Link>
                    </div>
                    <Button variant="primary" size="sm" className="px-4 min-[450px]:px-7 rounded-full shadow-lg shadow-orange-500/20 font-plus-jakarta font-bold transform transition-all active:scale-95 text-[10px] min-[450px]:text-sm">
                        Report Now
                    </Button>

                    {/* MOBILE TOGGLE */}
                    <button
                        onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
                        className="lg:hidden w-10 h-10 flex flex-col items-center justify-center gap-1.5 rounded-xl hover:bg-orange-50 transition-colors"
                    >
                        <div className={`w-6 h-0.5 bg-[#1a1208] rounded-full transition-all ${isMobileMenuOpen ? 'rotate-45 translate-y-2' : ''}`} />
                        <div className={`w-6 h-0.5 bg-[#1a1208] rounded-full transition-all ${isMobileMenuOpen ? 'opacity-0' : ''}`} />
                        <div className={`w-6 h-0.5 bg-[#1a1208] rounded-full transition-all ${isMobileMenuOpen ? '-rotate-45 -translate-y-2' : ''}`} />
                    </button>
                </div>
            </div>

            {/* MOBILE MENU */}
            <div className={`lg:hidden fixed inset-0 z-[99] bg-white/95 backdrop-blur-xl transition-all duration-500 ${isMobileMenuOpen ? 'opacity-100 pointer-events-auto translate-y-0' : 'opacity-0 pointer-events-none -translate-y-10'}`}>
                <div className="flex flex-col items-center justify-center h-full gap-8">
                    {navLinks.map((link, i) => (
                        <a
                            key={link.name}
                            href={link.href}
                            onClick={() => setIsMobileMenuOpen(false)}
                            className="text-2xl font-plus-jakarta font-black text-[#1a1208] hover:text-[#F97316] transition-colors"
                            style={{ transitionDelay: `${i * 100}ms` }}
                        >
                            {link.name}
                        </a>
                    ))}
                    <div className="flex flex-col items-center gap-4 mt-8 w-full px-12">
                        <Button variant="primary" size="lg" className="w-full rounded-2xl">Report a Stray</Button>
                        <Link to="/login" className="w-full">
                            <Button variant="ghost" size="lg" className="w-full">Sign In</Button>
                        </Link>
                    </div>
                </div>
            </div>
        </nav>
    );
};

export default LandingPageNavbar;
