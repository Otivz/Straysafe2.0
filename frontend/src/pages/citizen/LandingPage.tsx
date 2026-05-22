import { useState, useEffect } from 'react';
import Button from '../../components/Button';
import LandingPageNavbar from '../../components/Navbars/LandingPageNavbar';

const LandingPage = () => {
    // Reveal Hook Logic
    useEffect(() => {
        const els = document.querySelectorAll('.reveal');
        const obs = new IntersectionObserver((entries) => {
            entries.forEach(e => { if (e.isIntersecting) e.target.classList.add('visible'); });
        }, { threshold: 0.12 });
        els.forEach(el => obs.observe(el));

        return () => obs.disconnect();
    }, []);

    const [activeStep, setActiveStep] = useState(0);

    // Auto-advance the flow steps
    useEffect(() => {
        const t = setInterval(() => setActiveStep(s => (s + 1) % 4), 3500);
        return () => clearInterval(t);
    }, []);

    return (
        <div className="min-h-screen bg-[#FAFAF9] font-sans text-[#1a1208] selection:bg-orange-100 selection:text-orange-900">
            <style>{`
                @keyframes fadeUp {
                    from { opacity: 0; transform: translateY(32px); }
                    to { opacity: 1; transform: translateY(0); }
                }
                @keyframes fadeIn {
                    from { opacity: 0; }
                    to { opacity: 1; }
                }
                @keyframes floatPaw {
                    0%, 100% { transform: translateY(0) rotate(-8deg); }
                    50% { transform: translateY(-16px) rotate(-8deg); }
                }
                @keyframes floatPaw2 {
                    0%, 100% { transform: translateY(0) rotate(12deg); }
                    50% { transform: translateY(-12px) rotate(12deg); }
                }
                @keyframes pulse-dot {
                    0%, 100% { transform: scale(1); opacity: 1; }
                    50% { transform: scale(1.4); opacity: 0.6; }
                }
                .reveal {
                    opacity: 0;
                    transform: translateY(28px);
                    transition: opacity 0.7s ease, transform 0.7s ease;
                }
                .reveal.visible {
                    opacity: 1;
                    transform: translateY(0);
                }
                .nav-scrolled {
                    box-shadow: 0 2px 24px rgba(249,115,22,0.08);
                    background: rgba(250,250,249,0.95) !important;
                }
            `}</style>

            {/* NAVIGATION */}
            <LandingPageNavbar />

            {/* HERO SECTION */}
            <section className="relative min-h-screen pt-[120px] pb-20 px-6 md:px-24 lg:px-32 flex flex-col md:flex-row items-center gap-16 overflow-hidden">
                <div className="absolute top-20 right-[-40px] opacity-[0.04] text-[320px] select-none pointer-events-none" style={{ animation: 'floatPaw 6s ease-in-out infinite' }}>🐾</div>
                <div className="absolute bottom-20 left-[30%] opacity-[0.03] text-[180px] select-none pointer-events-none" style={{ animation: 'floatPaw2 8s ease-in-out infinite' }}>🐾</div>

                <div className="flex-1 z-10 text-center md:text-left">
                    <div className="inline-flex items-center gap-2 bg-orange-50 border border-orange-100 px-3.5 py-1.5 rounded-full mb-6" style={{ animation: 'fadeIn 0.6s ease both' }}>
                        <div className="w-2 h-2 bg-[#F97316] rounded-full" style={{ animation: 'pulse-dot 2s ease-in-out infinite' }} />
                        <span className="text-[10px] font-bold text-[#F97316] uppercase tracking-wider font-plus-jakarta">AI-Powered System</span>
                    </div>
                    <h1 className="font-plus-jakarta text-4xl sm:text-5xl md:text-7xl font-extrabold leading-[1.1] md:leading-[1.05] tracking-tight text-[#1a1208] mb-6 reveal" style={{ animationDelay: '0.1s' }}>
                        Protecting <span className="relative text-[#F97316]">Strays<span className="absolute bottom-1 md:bottom-2 left-0 right-0 h-1 md:h-1.5 bg-[#FACC15]/60 rounded-full" /></span>,<br />
                        One Report<br />at a Time.
                    </h1>
                    <p className="text-base md:text-lg leading-relaxed text-[#4a3b28] max-w-lg mx-auto md:mx-0 mb-10 reveal" style={{ animationDelay: '0.2s' }}>
                        STRAY SAFE connects citizens, subdivision leaders, and barangay staff into a single coordinated platform — powered by AI — to rescue and manage stray animals faster.
                    </p>
                    <div className="flex flex-col sm:flex-row justify-center md:justify-start gap-4 reveal" style={{ animationDelay: '0.3s' }}>
                        <Button variant="primary" size="lg" className="px-8 shadow-xl shadow-orange-500/30 w-full sm:w-auto">
                            📋 Report a Stray
                        </Button>
                        <Button variant="light" size="lg" className="px-8 border-gray-200 w-full sm:w-auto">
                            Learn How It Works →
                        </Button>
                    </div>
                </div>

                <div className="flex-1 relative z-10 reveal mt-12 md:mt-0" style={{ animationDelay: '0.15s' }}>
                    <div className="relative w-[260px] sm:w-[280px] md:w-[320px] mx-auto bg-[#1a1208] rounded-[42px] p-2 sm:p-2.5 shadow-2xl shadow-[#1a1208]/25 border border-white/10">
                        {/* Floating Tooltips */}
                        <div className="absolute top-8 -right-10 sm:-right-16 md:-right-20 bg-white border border-[#ede8e0] rounded-2xl p-2.5 sm:p-3 shadow-lg z-20 whitespace-nowrap" style={{ animation: 'floatPaw2 5s ease-in-out infinite' }}>
                            <div className="text-[9px] sm:text-[10px] font-bold text-[#F97316] mb-0.5">🤖 AI Analysis</div>
                            <div className="text-[10px] sm:text-xs font-bold text-[#1a1208]">Dog · Injured · High</div>
                        </div>
                        <div className="absolute bottom-16 -left-8 sm:-left-12 md:-left-16 bg-[#F97316] rounded-2xl p-2.5 sm:p-3.5 shadow-lg shadow-orange-500/30 z-20 whitespace-nowrap text-white" style={{ animation: 'floatPaw 7s ease-in-out infinite' }}>
                            <div className="text-xl sm:text-2xl font-black">94%</div>
                            <div className="text-[8px] sm:text-[9px] font-bold uppercase tracking-wider opacity-80">AI Accuracy</div>
                        </div>

                        <div className="bg-[#FAFAF9] rounded-[34px] overflow-hidden h-[520px] flex flex-col">
                            <div className="bg-[#F97316] px-5 pt-3.5 pb-2.5 text-white flex justify-between items-center text-[10px] font-bold font-plus-jakarta">
                                <span>STRAY SAFE</span>
                                <span>🐾 4 Active</span>
                            </div>
                            <div className="bg-white p-5 border-b border-[#ede8e0]">
                                <h3 className="font-plus-jakarta font-extrabold text-sm text-[#1a1208]">My Reports</h3>
                                <p className="text-[10px] text-[#9c8670] mt-0.5">Barangay Sta. Cruz · April 2026</p>
                            </div>
                            <div className="flex-1 p-4 flex flex-col gap-3 overflow-hidden">
                                <div className="bg-white rounded-xl p-3 border border-[#ede8e0] flex gap-2.5 items-start shadow-sm transition-shadow hover:shadow-md cursor-pointer group">
                                    <div className="w-10 h-10 bg-[#FAFAF9] rounded-lg flex items-center justify-center text-xl shrink-0">🐕</div>
                                    <div className="flex-1">
                                        <div className="text-[11px] font-bold text-[#1a1208]">Injured Dog — Purok 3</div>
                                        <div className="text-[9px] text-[#9c8670] mt-0.5">📍 Mabini St., near market</div>
                                        <span className="inline-block px-2 py-0.5 rounded-full bg-red-50 text-red-600 text-[8px] font-bold mt-1.5 uppercase tracking-wider">Picked Up</span>
                                    </div>
                                    <span className="text-[8px] font-black px-1.5 py-0.5 rounded-full bg-red-500 text-white">HIGH</span>
                                </div>
                                <div className="bg-white rounded-xl p-3 border border-[#ede8e0] flex gap-2.5 items-start shadow-sm opacity-80">
                                    <div className="w-10 h-10 bg-[#FAFAF9] rounded-lg flex items-center justify-center text-xl shrink-0">🐈</div>
                                    <div className="flex-1">
                                        <div className="text-[11px] font-bold text-[#1a1208]">Stray Cat — Purok 1</div>
                                        <div className="text-[9px] text-[#9c8670] mt-0.5">📍 Rizal Ave.</div>
                                        <span className="inline-block px-2 py-0.5 rounded-full bg-orange-50 text-orange-600 text-[8px] font-bold mt-1.5 uppercase tracking-wider">In Progress</span>
                                    </div>
                                    <span className="text-[8px] font-black px-1.5 py-0.5 rounded-full bg-orange-200 text-orange-800">REG</span>
                                </div>
                                <div className="bg-white rounded-xl p-3 border border-[#ede8e0] flex gap-2.5 items-start shadow-sm opacity-60">
                                    <div className="w-10 h-10 bg-[#FAFAF9] rounded-lg flex items-center justify-center text-xl shrink-0">🐕</div>
                                    <div className="flex-1">
                                        <div className="text-[11px] font-bold text-[#1a1208]">Stray Dog — Purok 5</div>
                                        <div className="text-[9px] text-[#9c8670] mt-0.5">📍 Bonifacio St.</div>
                                        <span className="inline-block px-2 py-0.5 rounded-full bg-green-50 text-green-600 text-[8px] font-bold mt-1.5 uppercase tracking-wider">Resolved</span>
                                    </div>
                                    <span className="text-[8px] font-black px-1.5 py-0.5 rounded-full bg-gray-200 text-gray-600">REG</span>
                                </div>
                            </div>
                        </div>
                        <div className="absolute -bottom-4 right-5 w-12 h-12 bg-[#F97316] rounded-full flex items-center justify-center text-xl text-white shadow-xl shadow-orange-500/40 cursor-pointer transition-transform hover:scale-110">➕</div>
                    </div>
                </div>
            </section>

            {/* STATS BAR */}
            <div className="bg-[#1a1208] py-10 md:py-16 px-6 md:px-24 lg:px-32 grid grid-cols-2 md:grid-cols-4 gap-8">
                {[
                    { num: '4', label: 'User Roles' },
                    { num: '5', label: 'AI Capabilities' },
                    { num: '3-Day', label: 'Observation Window' },
                    { num: '100%', label: 'Status Transparency' },
                ].map((s, i) => (
                    <div key={i} className="text-center reveal" style={{ transitionDelay: `${i * 0.1}s` }}>
                        <div className="text-4xl md:text-5xl font-black text-[#FACC15] font-plus-jakarta leading-none">{s.num}</div>
                        <div className="text-[11px] md:text-xs text-white/40 mt-2 uppercase tracking-widest font-bold">{s.label}</div>
                    </div>
                ))}
            </div>

            {/* ROLES SECTION */}
            <section className="py-24 px-6 md:px-24 lg:px-32 bg-white" id="roles">
                <div className="mb-16 reveal">
                    <div className="flex items-center gap-2.5 text-[11px] font-bold tracking-[0.1em] text-[#F97316] uppercase font-plus-jakarta mb-4">
                        <div className="w-5 h-[2px] bg-[#F97316]" />
                        User Roles
                    </div>
                    <h2 className="text-4xl md:text-5xl font-extrabold font-plus-jakarta tracking-tight text-[#1a1208] mb-4">One Platform,<br />Four Key Players</h2>
                    <p className="text-base leading-relaxed text-[#9c8670] max-w-lg">Every user has a defined role in the rescue chain — from the citizen who spots a stray, to the admin overseeing the whole system.</p>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                    {[
                        { icon: '👤', title: 'Citizen', desc: 'Anyone in the community can report strays directly from their phone — no paperwork, no hassle.', items: ['Report stray animals', 'Upload photo & location', 'Track status in real-time'], color: '#F97316', bg: 'bg-orange-50' },
                        { icon: '🏘️', title: 'Subdivision Leader', desc: 'Leaders review incoming reports, filter duplicates, and create formal requests to the barangay.', items: ['Verify & filter reports', 'Remove fake entries', 'Formal requests'], color: '#FACC15', bg: 'bg-yellow-50' },
                        { icon: '🏛️', title: 'Barangay Staff', desc: 'Staff receive formal requests, approve them, and update case status at every step of rescue.', items: ['Approve requests', 'Coordinate pickup', 'Update status live'], color: '#86EFAC', bg: 'bg-green-50' },
                        { icon: '⚙️', title: 'Admin', desc: 'Admins oversee the entire system — managing accounts, viewing analytics, and configuring settings.', items: ['Manage accounts', 'System analytics', 'Configure settings'], color: '#EF4444', bg: 'bg-red-50' },
                    ].map((role, i) => (
                        <div key={i} className="group relative border-[1.5px] border-[#ede8e0] rounded-3xl p-7 bg-[#FAFAF9] transition-all duration-300 hover:-translate-y-2 hover:bg-white hover:shadow-2xl hover:shadow-black/5 hover:border-transparent reveal" style={{ transitionDelay: `${i * 0.1}s` }}>
                            <div className={`absolute top-0 left-0 right-0 h-1 rounded-full`} style={{ background: role.color }} />
                            <div className={`w-14 h-14 rounded-2xl ${role.bg} flex items-center justify-center text-2xl mb-6 group-hover:scale-110 transition-transform duration-300`}>{role.icon}</div>
                            <h3 className="font-plus-jakarta font-extrabold text-lg text-[#1a1208] mb-3">{role.title}</h3>
                            <p className="text-[13px] leading-relaxed text-[#9c8670] mb-6">{role.desc}</p>
                            <ul className="flex flex-col gap-2.5">
                                {role.items.map((item, j) => (
                                    <li key={j} className="flex items-start gap-2.5 text-xs font-semibold text-[#4a3b28]">
                                        <div className="w-1.5 h-1.5 rounded-full mt-1.5 shrink-0" style={{ background: role.color }} />
                                        <span>{item}</span>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    ))}
                </div>
            </section>

            {/* HOW IT WORKS SECTION */}
            <section className="py-24 px-6 md:px-24 lg:px-32 bg-[#FAFAF9]" id="how-it-works">
                <div className="max-w-4xl mx-auto">
                    <div className="mb-16 reveal">
                        <div className="flex items-center gap-2.5 text-[11px] font-bold tracking-[0.1em] text-[#F97316] uppercase font-plus-jakarta mb-4">
                            <div className="w-5 h-[2px] bg-[#F97316]" />
                            How It Works
                        </div>
                        <h2 className="text-4xl md:text-5xl font-extrabold font-plus-jakarta tracking-tight text-[#1a1208] mb-4">From Spotted to Safe —<br />Every Step Tracked</h2>
                        <p className="text-base leading-relaxed text-[#9c8670] max-w-lg">A clear chain of action ensures no stray falls through the cracks. Each role hands off to the next seamlessly.</p>
                    </div>

                    <div className="relative pl-10 md:pl-12 reveal">
                        <div className="absolute left-[15px] top-6 bottom-6 w-0.5 bg-[#ede8e0]" />
                        {[
                            { who: 'Citizen', title: 'Spots and Reports a Stray', detail: 'The citizen uploads a photo and location pin. The AI immediately analyzes the image to identify the animal type and condition.', tags: [{ l: 'Photo Upload' }, { l: 'Location Pin' }, { l: 'AI Analysis', c: 'bg-yellow-50 text-yellow-700' }] },
                            { who: 'Subdivision Leader', title: 'Reviews & Verifies the Report', detail: 'The leader reviews AI-enriched reports in their area, filters out fakes or duplicates, and creates a formal request to the barangay.', tags: [{ l: 'Verification' }, { l: 'Filter Duplicates', c: 'bg-red-50 text-red-600' }, { l: 'Formal Request' }] },
                            { who: 'Barangay Staff', title: 'Approves & Dispatches Team', detail: 'Staff receive the formal request, approve it, and dispatch a pickup team. Status updates keep everyone in the loop.', tags: [{ l: 'Approved', c: 'bg-green-50 text-green-600' }, { l: 'Team Dispatched' }, { l: 'Status Update' }] },
                            { who: 'Barangay Staff', title: 'Updates Case Through Resolution', detail: 'The animal moves through defined stages: Picked Up → Under Observation (3 days) → Impounded. Citizens can track every status change.', tags: [{ l: 'Picked Up' }, { l: '3-Day Observation', c: 'bg-yellow-50 text-yellow-700' }, { l: 'Impounded', c: 'bg-green-50 text-green-600' }] },
                        ].map((step, i) => (
                            <div key={i} className={`relative mb-0 pb-12 last:pb-0 transition-all duration-500 cursor-pointer group`} onClick={() => setActiveStep(i)}>
                                <div className={`absolute -left-[35px] md:-left-[43px] top-1 w-7 h-7 rounded-full border-2 border-[#ede8e0] bg-white flex items-center justify-center text-[11px] font-extrabold font-plus-jakarta text-[#9c8670] z-10 transition-all duration-300 ${activeStep === i ? '!bg-[#F97316] !border-[#F97316] !text-white shadow-lg shadow-orange-500/25 scale-110' : ''}`}>{i + 1}</div>
                                <div className={`bg-white border-[1.5px] border-[#ede8e0] rounded-2xl p-6 transition-all duration-500 ${activeStep === i ? 'border-orange-200 shadow-xl shadow-orange-500/5' : 'group-hover:border-gray-300'}`}>
                                    <div className="text-[10px] font-extrabold text-[#F97316] uppercase tracking-widest font-plus-jakarta mb-1.5">{step.who}</div>
                                    <h3 className="text-base font-extrabold text-[#1a1208] font-plus-jakarta mb-2">{step.title}</h3>
                                    {activeStep === i && (
                                        <div className="animate-in fade-in slide-in-from-top-2 duration-500">
                                            <p className="text-[13px] leading-relaxed text-[#9c8670] mb-4">{step.detail}</p>
                                            <div className="flex flex-wrap gap-2">
                                                {step.tags.map((tag, j) => (
                                                    <span key={j} className={`px-2.5 py-0.5 rounded-full bg-orange-50 text-[#F97316] text-[9px] font-bold font-plus-jakarta ${tag.c || ''}`}>{tag.l}</span>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* AI FEATURES SECTION */}
            <section className="py-24 px-6 md:px-24 lg:px-32 bg-[#1a1208] relative overflow-hidden" id="ai">
                <div className="absolute inset-0 opacity-10">
                    <div className="absolute top-0 left-0 w-full h-full bg-[radial-gradient(circle_at_20%_50%,rgba(249,115,22,0.15)_0%,transparent_50%)]" />
                </div>
                <div className="relative z-10 mb-16 reveal">
                    <div className="flex items-center gap-2.5 text-[11px] font-bold tracking-[0.1em] text-[#FACC15] uppercase font-plus-jakarta mb-4">
                        <div className="w-5 h-[2px] bg-[#FACC15]" />
                        AI Capabilities
                    </div>
                    <h2 className="text-4xl md:text-5xl font-extrabold font-plus-jakarta tracking-tight text-white mb-4">Smarter Rescue,<br />Powered by AI</h2>
                    <p className="text-base leading-relaxed text-white/50 max-w-lg">Machine learning does the heavy lifting — so every second saved could save an animal's life.</p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 relative z-10">
                    {[
                        { num: '01', icon: '🔍', title: 'Animal Type Identification', desc: 'The AI analyzes uploaded photos and instantly classifies whether the animal is a dog or cat — no manual tagging needed.', output: [{ l: 'Detected', v: 'Dog', c: 'text-[#FACC15]' }, { l: 'Confidence', v: '97.3%', c: 'text-green-400' }] },
                        { num: '02', icon: '🩺', title: 'Condition Detection', desc: 'Visual features are evaluated to determine if the animal appears Injured, Weak/Sick, or Normal — enabling triage at first report.', output: [{ l: 'Condition', v: 'Injured', c: 'text-red-500' }, { l: 'Severity', v: 'High', c: 'text-red-500' }], meter: 88 },
                        { num: '03', icon: '⚡', title: 'Automatic Case Prioritization', desc: 'Reports are auto-ranked by the AI: Injured cases get High Priority, Normal cases get Regular Priority — so responders always know what\'s urgent.', output: [{ l: 'Priority', v: 'HIGH', c: 'text-red-500' }, { l: 'Queue Pos', v: '#1', c: 'text-[#FACC15]' }] },
                        { num: '04', icon: '🧭', title: 'Decision Support for Authorities', desc: 'Subdivision leaders and barangay staff receive AI-backed insights — which report to handle first, which area needs the most attention.', output: [{ l: 'Top Area', v: 'Purok 3', c: 'text-[#FACC15]' }, { l: 'Pending', v: '7 urgent', c: 'text-red-500' }] },
                    ].map((card, i) => (
                        <div key={i} className="group border border-white/10 rounded-3xl p-8 bg-white/[0.03] transition-all hover:border-[#F97316]/30 hover:-translate-y-1 reveal" style={{ transitionDelay: `${(i % 2) * 0.1}s` }}>
                            <div className="text-[10px] font-extrabold font-plus-jakarta text-white/20 uppercase tracking-[0.2em] mb-6">— {card.num}</div>
                            <div className="w-14 h-14 rounded-2xl bg-[#F97316]/10 border border-[#F97316]/20 flex items-center justify-center text-3xl mb-6 group-hover:scale-110 transition-transform duration-300">{card.icon}</div>
                            <h3 className="text-xl font-extrabold font-plus-jakarta text-white mb-3">{card.title}</h3>
                            <p className="text-sm leading-relaxed text-white/50 mb-8">{card.desc}</p>
                            <div className="bg-white/5 border border-white/5 rounded-2xl p-5 font-mono text-[11px]">
                                {card.output.map((row, j) => (
                                    <div key={j} className="flex justify-between items-center py-1">
                                        <span className="text-white/30 uppercase tracking-wider">{row.l}</span>
                                        <span className={`font-bold ${row.c}`}>{row.v}</span>
                                    </div>
                                ))}
                                {card.meter && (
                                    <div className="mt-4">
                                        <div className="flex justify-between items-center mb-1.5">
                                            <span className="text-white/30 uppercase tracking-wider">Urgency Level</span>
                                            <span className="text-red-500 font-bold">{card.meter}%</span>
                                        </div>
                                        <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
                                            <div className="h-full bg-red-500 rounded-full" style={{ width: `${card.meter}%` }} />
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            </section>

            {/* CTA SECTION */}
            <section className="bg-[#F97316] py-24 px-6 md:px-24 lg:px-32 text-center relative overflow-hidden" id="contact">
                <div className="absolute inset-0 bg-gradient-to-br from-white/10 to-transparent" />
                <div className="absolute -bottom-16 -right-16 text-[280px] opacity-[0.08] select-none pointer-events-none" style={{ animation: 'floatPaw 7s ease-in-out infinite' }}>🐾</div>

                <div className="relative z-10 max-w-2xl mx-auto">
                    <h2 className="text-4xl md:text-6xl font-extrabold font-plus-jakarta tracking-tight text-white mb-6 reveal">Every Stray<br />Deserves a Chance.</h2>
                    <p className="text-lg md:text-xl text-white/80 leading-relaxed mb-10 reveal" style={{ transitionDelay: '0.1s' }}>Join your barangay on STRAY SAFE. Report strays, track rescues, and help build a more humane community — one report at a time.</p>
                    <div className="flex flex-wrap justify-center gap-4 reveal" style={{ transitionDelay: '0.2s' }}>
                        <Button variant="light" size="lg" className="px-10 shadow-2xl shadow-black/10 text-[#F97316]">
                            📋 Report a Stray Now
                        </Button>
                        <Button variant="ghost" size="lg" className="px-10 border-2 border-white/30 text-white hover:bg-white/10 hover:border-white">
                            Login to Your Account
                        </Button>
                    </div>
                </div>
            </section>

            {/* FOOTER */}
            <footer className="bg-[#1a1208] py-16 px-6 md:px-24 lg:px-32 flex flex-col md:flex-row justify-between items-center gap-10 border-t border-white/5">
                <div>
                    <div className="flex items-center gap-2.5 font-plus-jakarta font-extrabold text-2xl text-white">
                        <div className="w-10 h-10 bg-[#F97316] rounded-xl flex items-center justify-center text-xl">🐾</div>
                        <span>STRAY SAFE</span>
                    </div>
                    <p className="text-[13px] text-white/30 mt-3 font-medium uppercase tracking-widest">Stray Animal Management System · Barangay Level</p>
                </div>
                <div className="flex flex-col items-center md:items-end gap-6">
                    <div className="flex gap-8">
                        <a href="#" className="text-sm text-white/40 hover:text-[#F97316] transition-colors">Privacy Policy</a>
                        <a href="#" className="text-sm text-white/40 hover:text-[#F97316] transition-colors">Terms of Use</a>
                        <a href="#" className="text-sm text-white/40 hover:text-[#F97316] transition-colors">Support</a>
                    </div>
                    <p className="text-xs text-white/20">© 2026 STRAY SAFE System. All rights reserved.</p>
                </div>
            </footer>
        </div>
    );
};

export default LandingPage;
