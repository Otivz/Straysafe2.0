import { useState, useEffect } from 'react';
import {
    PawPrint, ClipboardList, Bot, Dog, Cat, MapPin,
    User, Building2, Landmark, Settings, Search,
    ShieldCheck, Heart, CheckCircle2,
    QrCode, AlertTriangle, FileText, Check, Sparkles, LogIn
} from 'lucide-react';
import { Link } from 'react-router-dom';
import Button from '../../components/Button';
import LandingPageNavbar from '../../components/Navbars/LandingPageNavbar';
import InstallAppButton from '../../components/InstallAppButton';
import GuestQRScannerModal from '../../components/Modals/GuestQRScannerModal';
import { useSignedInUser, homePathFor } from '../../utils/useSignedInUser';
import { useTheme } from '../../context/ThemeContext';

const LandingPage = () => {
    // Signed in on this browser (confirmed by the server): the sign-in buttons take you back to your account instead
    const { user: signedIn } = useSignedInUser();
    const firstName = signedIn ? String(signedIn.name || 'your account').split(' ')[0] : '';
    const { setTheme } = useTheme();
    const [activeWorkflowStep, setActiveWorkflowStep] = useState(0);
    const [isGuestScannerOpen, setIsGuestScannerOpen] = useState(false);

    // Ensure light mode on public landing page
    useEffect(() => {
        setTheme('light');
    }, [setTheme]);

    // Intersection Observer for smooth reveal animation
    useEffect(() => {
        const els = document.querySelectorAll('.reveal-on-scroll');
        const obs = new IntersectionObserver(
            (entries) => {
                entries.forEach((e) => {
                    if (e.isIntersecting) {
                        e.target.classList.add('is-visible');
                    }
                });
            },
            { threshold: 0.1 }
        );
        els.forEach((el) => obs.observe(el));

        return () => obs.disconnect();
    }, []);

    // 4 Verified User Roles with actual codebase permissions
    const userRoles = [
        {
            title: 'Resident / Citizen',
            roleName: 'Resident',
            badge: 'Community Member',
            icon: User,
            color: '#F97316',
            bgColor: 'bg-orange-50',
            borderColor: 'border-orange-200',
            badgeBg: 'bg-orange-100 text-orange-800',
            summary: 'Report sightings quickly, track case progress, and manage personal pets with digital recovery tags.',
            capabilities: [
                'Submit stray sightings with photo/video and GPS location pin',
                'Track real-time progress and milestone updates on submitted reports',
                'Register family pets and print QR recovery tags',
                'Review potential look-alike matches for lost pets',
                'Claim a lost pet found in the barangay holding place with proof of ownership'
            ]
        },
        {
            title: 'Subdivision Leader',
            roleName: 'Subdivision Leader',
            badge: 'HOA / Village Official',
            icon: Building2,
            color: '#D97706',
            bgColor: 'bg-amber-50',
            borderColor: 'border-amber-200',
            badgeBg: 'bg-amber-100 text-amber-800',
            summary: 'Review neighborhood sightings, confirm location details, filter duplicates, and endorse to the barangay.',
            capabilities: [
                'Area-scoped dashboard restricted to assigned subdivision',
                'Review resident sightings and confirm exact on-ground location',
                'Filter false reports and duplicate sighting entries',
                'Split multi-animal sightings into individual trackable records',
                'Formally endorse verified cases to Barangay personnel for action'
            ]
        },
        {
            title: 'Barangay Personnel',
            roleName: 'Barangay Staff',
            badge: 'Local Government Staff',
            icon: Landmark,
            color: '#C2410C',
            bgColor: 'bg-orange-50/70',
            borderColor: 'border-orange-300',
            badgeBg: 'bg-orange-100 text-orange-900',
            summary: 'Manage endorsed rescue requests, coordinate field dispatch, oversee holding care, and return animals to their owners.',
            capabilities: [
                'Receive and approve endorsed rescue requests from subdivision leaders',
                'Coordinate field dispatch, responder arrival, and humane animal handling',
                'Oversee holding place intake, health observation, and feeding logs',
                'Verify pet ownership claims using vaccination cards and veterinary proof',
                'Impound unclaimed animals after the holding period, or extend the hold'
            ]
        },
        {
            title: 'Administrator',
            roleName: 'System Admin',
            badge: 'System Governance',
            icon: Settings,
            color: '#475569',
            bgColor: 'bg-slate-50',
            borderColor: 'border-slate-200',
            badgeBg: 'bg-slate-100 text-slate-800',
            summary: 'Govern user access, monitor municipal activity heat maps, inspect audit logs, and configure system settings.',
            capabilities: [
                'Manage user accounts, credentials, and geographic jurisdiction assignments',
                'Monitor system-wide activity logs tracking all status transitions and edits',
                'Analyze municipal heat maps to identify stray concentration patterns',
                'Configure operational settings and toggle AI matching and vision parameters',
                'Oversee community warnings and official citation logs'
            ]
        }
    ];

    // 4 Verified Workflow Steps
    const workflowSteps = [
        {
            step: '01',
            role: 'Resident',
            title: 'Submit Sighting with Photo & GPS Pin',
            desc: 'A community member spots a stray animal and submits a report with photo or video evidence, exact map coordinates, and landmark details. Integrated image checks assist by detecting canine or feline presence.',
            tags: ['Photo or Video', 'GPS Map Pin', 'Instant AI Assist']
        },
        {
            step: '02',
            role: 'Subdivision Leader',
            title: 'Verify Location & Filter Duplicates',
            desc: 'The designated subdivision leader reviews incoming sightings within their neighborhood, checks for duplicate reports or nearby sightings, and confirms the report details before formal action.',
            tags: ['Local Verification', 'Duplicate Check', 'Status Tracking']
        },
        {
            step: '03',
            role: 'Barangay Personnel',
            title: 'Coordinate Dispatch & Animal Care',
            desc: 'Verified cases requiring official response are endorsed to the Barangay. Staff approve rescue requests, coordinate field dispatch, safely secure the animal, and log intake into a holding place.',
            tags: ['Rescue Dispatch', 'Humane Transport', 'Holding Intake']
        },
        {
            step: '04',
            role: 'Community & Officials',
            title: 'Monitor Progress & Complete Resolution',
            desc: 'All authorized stakeholders follow transparent milestone updates. Animals are held during an observation period and returned to a verified owner; unclaimed animals are impounded.',
            tags: ['Holding Timeline', 'Owner Claims', 'Impoundment']
        }
    ];

    // Verified AI Capabilities (YOLOv8, Gemini, Pillow, OpenCV)
    const aiCapabilities = [
        {
            tech: 'YOLOv8 Object Detection',
            badge: 'Computer Vision',
            icon: Search,
            title: 'Canine & Feline Detection',
            description: 'Scans uploaded photos and video frames to detect dogs and cats, establishing a visual bounding box to crop the animal and reject irrelevant non-animal media.',
            details: ['Model: YOLOv8 Nano (yolov8n)', 'Trained on COCO Dog & Cat classes', 'Enforced confidence threshold (≥0.35)']
        },
        {
            tech: 'Pillow (PIL) & OpenCV',
            badge: 'Image Preprocessing',
            icon: Dog,
            title: 'Fur Color & Video Sampling',
            description: 'Decimates uploaded video files into representative frames and analyzes cropped animal regions in HSV color space to extract dominant coat colors while ignoring grass and foliage.',
            details: ['Decimates videos into 8 keyframes', 'HSV coat color clustering', 'Filters green background grass & sky']
        },
        {
            tech: 'Google Gemini Multimodal AI',
            badge: 'Multimodal Reasoning',
            icon: Bot,
            title: 'Contextual Animal Insights & Risk Triage',
            description: 'Assists staff by reviewing report descriptions and photos to suggest animal characteristics (breed, size), identify behavioral risk flags (aggression, injury, chasing), and suggest priority tiers.',
            details: ['Suggests Low, Medium, or High priority', 'Identifies potential injury or aggression', 'Flags potentially synthetic/AI images']
        },
        {
            tech: 'Heuristic & Visual Matching Engine',
            badge: 'Decision Support',
            icon: Sparkles,
            title: 'Duplicate & Lost Pet Matching',
            description: 'Compares visual features, breed, color, and geographic distance against existing reports and registered lost pet records to assist staff in spotting duplicate reports and reuniting lost pets.',
            details: ['Calculates look-alike similarity', 'Geographic distance correlation', 'Requires human staff & owner confirmation']
        }
    ];

    // Verified Core System Features
    const coreFeatures = [
        {
            icon: MapPin,
            title: 'Geotagged Sighting Reports',
            description: 'Interactive map pins and GPS coordinates allow exact localization of stray animals, with optional landmark snapping for rapid field response.'
        },
        {
            icon: QrCode,
            title: 'Pet Registration & QR Safety Tags',
            description: 'Residents register pets and print unique QR tags. When scanned, finders can contact the owner immediately while sensitive home addresses remain masked.'
        },
        {
            icon: Landmark,
            title: 'Holding Place Oversight',
            description: 'Real-time tracking of holding place capacity, mandatory observation windows, feeding logs, and health status for captured animals.'
        },
        {
            icon: Heart,
            title: 'Verified Owner Claims',
            description: 'Owners claim a found pet with vaccination cards, veterinary records or photos; Barangay staff verify the proof before the animal is handed back.'
        },
        {
            icon: AlertTriangle,
            title: 'Verified Community Alerts',
            description: 'Authorized community noticeboard for urgent rabies warnings, stray hazard alerts, and verified lost pet broadcasts.'
        },
        {
            icon: FileText,
            title: 'Traceable Audit Trail',
            description: 'Complete accountability with immutable system logs recording every status change, duplicate merge, and official officer endorsement.'
        }
    ];

    return (
        <div className="min-h-screen bg-[#FAFAF9] font-sans text-stone-900 selection:bg-orange-100 selection:text-orange-900 antialiased">
            <style>{`
                .reveal-on-scroll {
                    opacity: 0;
                    transform: translateY(20px);
                    transition: opacity 0.6s cubic-bezier(0.16, 1, 0.3, 1), transform 0.6s cubic-bezier(0.16, 1, 0.3, 1);
                }
                .reveal-on-scroll.is-visible {
                    opacity: 1;
                    transform: translateY(0);
                }
            `}</style>

            {/* HEADER NAVIGATION */}
            <LandingPageNavbar />

            {/* ========================================================================= */}
            {/* 1. HERO SECTION */}
            {/* ========================================================================= */}
            <section className="relative pt-28 sm:pt-32 md:pt-36 pb-12 sm:pb-16 md:pb-20 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto overflow-hidden">
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-center">
                    
                    {/* HERO LEFT COLUMN: COPY & CALLS TO ACTION */}
                    <div className="lg:col-span-7 text-center lg:text-left space-y-5 sm:space-y-6">
                        
                        {/* SYSTEM PILL BADGE */}
                        <div className="inline-flex items-center gap-2 bg-orange-50 border border-orange-200/70 px-3.5 py-1.5 rounded-full shadow-xs">
                            <span className="w-2 h-2 rounded-full bg-orange-500 animate-pulse" />
                            <span className="text-xs font-bold text-orange-800 tracking-wide font-plus-jakarta">
                                Civic Stray Animal Management Platform
                            </span>
                        </div>

                        {/* HEADLINE */}
                        <h1 className="font-plus-jakarta text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-extrabold text-[#1a1208] leading-[1.15] tracking-tight">
                            Protecting Strays,<br />
                            <span className="text-[#F97316] relative inline-block">
                                One Report
                                <span className="absolute -bottom-1 left-0 right-0 h-2 bg-amber-200/60 rounded-full -z-10" />
                            </span>{' '}
                            at a Time.
                        </h1>

                        {/* DESCRIPTION */}
                        <p className="text-sm sm:text-base md:text-lg text-stone-600 leading-relaxed max-w-2xl mx-auto lg:mx-0">
                            StraySafe is a community-based stray animal reporting and management platform that helps residents, subdivision leaders, and barangay personnel coordinate animal sightings, verify reports, and monitor response progress.
                        </p>

                        {/* ACTION BUTTONS */}
                        <div className="flex flex-col sm:flex-row items-center justify-center lg:justify-start gap-3 sm:gap-4 pt-2">
                            <Link to="/resident/report/new" className="w-full sm:w-auto">
                                <Button
                                    variant="primary"
                                    size="lg"
                                    className="w-full sm:w-auto px-6 py-3.5 rounded-xl font-bold text-sm sm:text-base bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 border-none shadow-lg shadow-orange-500/25 transition-transform hover:-translate-y-0.5 active:translate-y-0"
                                >
                                    <span className="inline-flex items-center justify-center gap-2">
                                        <ClipboardList className="w-4 h-4" /> Report a Stray Sighting
                                    </span>
                                </Button>
                            </Link>

                            {/* Temporary: guest QR scanner, opens the public pet scan page */}
                            <Button
                                variant="light"
                                size="lg"
                                onClick={() => setIsGuestScannerOpen(true)}
                                className="w-full sm:w-auto px-6 py-3.5 rounded-xl font-semibold text-sm sm:text-base border-orange-200 text-orange-700 hover:bg-orange-50"
                            >
                                <span className="inline-flex items-center justify-center gap-2">
                                    <QrCode className="w-4 h-4" /> Scan Pet QR
                                </span>
                            </Button>

                            <a href="#how-it-works" className="w-full sm:w-auto">
                                <Button
                                    variant="light"
                                    size="lg"
                                    className="w-full sm:w-auto px-6 py-3.5 rounded-xl font-semibold text-sm sm:text-base border-stone-200 text-stone-700 hover:bg-stone-50"
                                >
                                    How It Works
                                </Button>
                            </a>

                            <Link to={signedIn ? homePathFor(signedIn) : '/login'} className="w-full sm:w-auto">
                                <Button
                                    variant="ghost"
                                    size="lg"
                                    className="w-full sm:w-auto px-5 py-3.5 rounded-xl font-semibold text-sm sm:text-base text-stone-600 hover:text-orange-600"
                                >
                                    {signedIn ? `Continue as ${firstName}` : 'Sign In'}
                                </Button>
                            </Link>
                        </div>

                        {/* PWA INSTALL TRIGGER (Appears cleanly where supported) */}
                        <div className="pt-1 flex items-center justify-center lg:justify-start">
                            <InstallAppButton variant="ghost" className="text-xs text-stone-500 hover:text-stone-800" />
                        </div>

                        {/* QUICK VALUE BULLETS */}
                        <div className="pt-2 border-t border-stone-200/60 grid grid-cols-2 sm:grid-cols-3 gap-3 text-left">
                            <div className="flex items-center gap-2">
                                <CheckCircle2 className="w-4 h-4 text-orange-500 shrink-0" />
                                <span className="text-xs font-semibold text-stone-700">GPS Pinpoint Sighting</span>
                            </div>
                            <div className="flex items-center gap-2">
                                <CheckCircle2 className="w-4 h-4 text-orange-500 shrink-0" />
                                <span className="text-xs font-semibold text-stone-700">Subdivision Verification</span>
                            </div>
                            <div className="flex items-center gap-2">
                                <CheckCircle2 className="w-4 h-4 text-orange-500 shrink-0" />
                                <span className="text-xs font-semibold text-stone-700">Human-Verified AI</span>
                            </div>
                        </div>
                    </div>

                    {/* HERO RIGHT COLUMN: AUTHENTIC SYSTEM PREVIEW CONTAINER */}
                    <div className="lg:col-span-5 flex justify-center">
                        <div className="w-full max-w-[340px] sm:max-w-[380px] bg-white rounded-3xl p-3 sm:p-4 shadow-xl shadow-stone-200/80 border border-stone-200 relative">
                            
                            {/* PREVIEW HEADER */}
                            <div className="bg-stone-900 text-white rounded-2xl px-4 py-3 flex items-center justify-between mb-3">
                                <div className="flex items-center gap-2">
                                    <div className="w-7 h-7 rounded-lg bg-orange-500 flex items-center justify-center">
                                        <PawPrint className="w-4 h-4 text-white" />
                                    </div>
                                    <div>
                                        <div className="text-xs font-bold font-plus-jakarta leading-none">StraySafe 2.0</div>
                                        <div className="text-[10px] text-stone-400">Community Incident Feed</div>
                                    </div>
                                </div>
                                <span className="inline-flex items-center gap-1 text-[10px] font-semibold bg-emerald-950/80 text-emerald-300 px-2 py-0.5 rounded-full border border-emerald-800/40">
                                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" /> Live Tracking
                                </span>
                            </div>

                            {/* ACTIVE CASE ITEM 1 (Verified Workflow State) */}
                            <div className="bg-[#FAFAF9] rounded-2xl p-3 border border-stone-200/80 mb-2.5 space-y-2">
                                <div className="flex items-center justify-between">
                                    <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-md bg-amber-100 text-amber-800">
                                        Under Leader Review
                                    </span>
                                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-red-100 text-red-700">
                                        HIGH PRIORITY
                                    </span>
                                </div>

                                <div className="flex items-start gap-2.5">
                                    <div className="w-9 h-9 rounded-xl bg-orange-100 flex items-center justify-center shrink-0 text-orange-600">
                                        <Dog className="w-5 h-5" />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <h4 className="text-xs font-bold text-[#1a1208] truncate">
                                            Injured Canine · Purok 3
                                        </h4>
                                        <p className="text-[10px] text-stone-500 flex items-center gap-1 mt-0.5">
                                            <MapPin className="w-3 h-3 text-stone-400 shrink-0" />
                                            Near Mabini Elementary School
                                        </p>
                                    </div>
                                </div>

                                {/* AI SUGGESTION PREVIEW (ACCURATE DISCLAIMER) */}
                                <div className="bg-white rounded-xl p-2 border border-stone-200/60 flex items-center justify-between text-[10px]">
                                    <span className="text-stone-500 flex items-center gap-1 font-medium">
                                        <Bot className="w-3 h-3 text-orange-500" /> YOLOv8 + Gemini Assist
                                    </span>
                                    <span className="font-semibold text-orange-700">Dog · Injured · Needs Review</span>
                                </div>
                            </div>

                            {/* ACTIVE CASE ITEM 2 (Barangay Dispatch Stage) */}
                            <div className="bg-white rounded-2xl p-3 border border-stone-200/80 space-y-2">
                                <div className="flex items-center justify-between">
                                    <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-md bg-blue-100 text-blue-800">
                                        Dispatched for Rescue
                                    </span>
                                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-stone-100 text-stone-700">
                                        MED PRIORITY
                                    </span>
                                </div>

                                <div className="flex items-start gap-2.5">
                                    <div className="w-9 h-9 rounded-xl bg-amber-100 flex items-center justify-center shrink-0 text-amber-700">
                                        <Cat className="w-5 h-5" />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <h4 className="text-xs font-bold text-[#1a1208] truncate">
                                            Stray Cat · Rizal Avenue
                                        </h4>
                                        <p className="text-[10px] text-stone-500 flex items-center gap-1 mt-0.5">
                                            <MapPin className="w-3 h-3 text-stone-400 shrink-0" />
                                            Barangay Responder En Route
                                        </p>
                                    </div>
                                </div>

                                <div className="flex items-center justify-between text-[10px] text-stone-500 pt-1 border-t border-stone-100">
                                    <span>Holding place reserved</span>
                                    <span className="text-emerald-600 font-semibold">Leader Endorsed</span>
                                </div>
                            </div>

                            {/* HUMAN-IN-THE-LOOP COMMITMENT BADGE */}
                            <div className="mt-3 bg-orange-50/80 rounded-xl p-2 border border-orange-200/70 text-center">
                                <p className="text-[10px] font-bold text-orange-900 flex items-center justify-center gap-1.5">
                                    <ShieldCheck className="w-3.5 h-3.5 text-orange-600" />
                                    <span>Human-in-the-Loop: AI suggests, authorities confirm</span>
                                </p>
                            </div>
                        </div>
                    </div>

                </div>
            </section>

            {/* ========================================================================= */}
            {/* 2. PLATFORM PILLARS STRIP (ACCURATE REPLACEMENT FOR UNSUPPORTED STATS) */}
            {/* ========================================================================= */}
            <section className="bg-stone-900 text-white py-10 sm:py-12 border-y border-stone-800">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-6 sm:gap-8">
                        <div className="text-center sm:text-left space-y-1">
                            <div className="text-2xl sm:text-3xl font-extrabold font-plus-jakarta text-orange-400">
                                4 Dedicated Roles
                            </div>
                            <div className="text-xs text-stone-300 font-medium">
                                Citizen, Subdivision Leader, Barangay Staff, Admin
                            </div>
                        </div>

                        <div className="text-center sm:text-left space-y-1">
                            <div className="text-2xl sm:text-3xl font-extrabold font-plus-jakarta text-amber-400">
                                Geotagged Accuracy
                            </div>
                            <div className="text-xs text-stone-300 font-medium">
                                GPS map coordinates & nearby landmark snapping
                            </div>
                        </div>

                        <div className="text-center sm:text-left space-y-1">
                            <div className="text-2xl sm:text-3xl font-extrabold font-plus-jakarta text-orange-400">
                                Human-in-the-Loop
                            </div>
                            <div className="text-xs text-stone-300 font-medium">
                                AI assistance reviewed and verified by officials
                            </div>
                        </div>

                        <div className="text-center sm:text-left space-y-1">
                            <div className="text-2xl sm:text-3xl font-extrabold font-plus-jakarta text-amber-400">
                                Audited Lifecycle
                            </div>
                            <div className="text-xs text-stone-300 font-medium">
                                Traceable timestamps from submission to resolution
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            {/* ========================================================================= */}
            {/* 3. WHAT IS STRAYSAFE? (PLATFORM INTRODUCTION) */}
            {/* ========================================================================= */}
            <section className="py-14 sm:py-18 md:py-24 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8" id="about">
                <div className="max-w-3xl mx-auto text-center space-y-4 mb-12 sm:mb-16">
                    <div className="inline-flex items-center gap-2 text-xs font-bold text-orange-600 uppercase tracking-widest font-plus-jakarta">
                        <span className="w-6 h-[2px] bg-orange-500" />
                        About The Platform
                        <span className="w-6 h-[2px] bg-orange-500" />
                    </div>
                    <h2 className="text-2xl sm:text-3xl md:text-4xl font-extrabold font-plus-jakarta text-[#1a1208] tracking-tight">
                        Modernizing Neighborhood Animal Welfare & Public Safety
                    </h2>
                    <p className="text-sm sm:text-base text-stone-600 leading-relaxed">
                        In many communities, stray animal reporting is fragmented across informal group chats, social media posts, and unrecorded phone calls. StraySafe replaces uncertainty with a unified, role-based platform that coordinates citizens, subdivision leaders, and local barangay personnel.
                    </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 sm:gap-8">
                    <div className="bg-white rounded-3xl p-6 sm:p-7 border border-stone-200/80 shadow-xs hover:shadow-md transition-shadow">
                        <div className="w-12 h-12 rounded-2xl bg-orange-100 flex items-center justify-center text-orange-600 mb-5">
                            <ClipboardList className="w-6 h-6" />
                        </div>
                        <h3 className="font-plus-jakarta font-bold text-lg text-[#1a1208] mb-2">
                            Structured Community Reports
                        </h3>
                        <p className="text-xs sm:text-sm text-stone-600 leading-relaxed">
                            Citizens provide photographic or video evidence, accurate GPS location coordinates, and animal descriptions in seconds from any smartphone browser without downloading an app store binary.
                        </p>
                    </div>

                    <div className="bg-white rounded-3xl p-6 sm:p-7 border border-stone-200/80 shadow-xs hover:shadow-md transition-shadow">
                        <div className="w-12 h-12 rounded-2xl bg-amber-100 flex items-center justify-center text-amber-700 mb-5">
                            <ShieldCheck className="w-6 h-6" />
                        </div>
                        <h3 className="font-plus-jakarta font-bold text-lg text-[#1a1208] mb-2">
                            Neighborhood Verification
                        </h3>
                        <p className="text-xs sm:text-sm text-stone-600 leading-relaxed">
                            Subdivision leaders filter duplicate reports, confirm on-the-ground sightings, and separate multi-animal encounters before creating formal action requests for the local barangay.
                        </p>
                    </div>

                    <div className="bg-white rounded-3xl p-6 sm:p-7 border border-stone-200/80 shadow-xs hover:shadow-md transition-shadow">
                        <div className="w-12 h-12 rounded-2xl bg-orange-100/70 flex items-center justify-center text-orange-700 mb-5">
                            <Landmark className="w-6 h-6" />
                        </div>
                        <h3 className="font-plus-jakarta font-bold text-lg text-[#1a1208] mb-2">
                            Barangay Action & Care
                        </h3>
                        <p className="text-xs sm:text-sm text-stone-600 leading-relaxed">
                            Barangay personnel dispatch responders, manage humane holding places, coordinate veterinary observation, process owner claims, and keep every outcome on record.
                        </p>
                    </div>
                </div>
            </section>

            {/* ========================================================================= */}
            {/* 4. HOW STRAYSAFE WORKS (SIMPLIFIED REPORTING WORKFLOW) */}
            {/* ========================================================================= */}
            <section className="py-14 sm:py-18 md:py-24 bg-stone-100/70 border-y border-stone-200/80" id="how-it-works">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    
                    <div className="max-w-3xl mx-auto text-center space-y-4 mb-12 sm:mb-16">
                        <div className="inline-flex items-center gap-2 text-xs font-bold text-orange-600 uppercase tracking-widest font-plus-jakarta">
                            <span className="w-6 h-[2px] bg-orange-500" />
                            Reporting Workflow
                            <span className="w-6 h-[2px] bg-orange-500" />
                        </div>
                        <h2 className="text-2xl sm:text-3xl md:text-4xl font-extrabold font-plus-jakarta text-[#1a1208] tracking-tight">
                            From Sighting to Resolution — Step by Step
                        </h2>
                        <p className="text-sm sm:text-base text-stone-600 leading-relaxed">
                            A clear handoff between residents, subdivision officials, and barangay responders ensures no stray report gets lost or overlooked.
                        </p>
                    </div>

                    {/* RESPONSIVE WORKFLOW CARDS GRID (NO FLICKERING TIMERS OR LAYOUT SHIFTS) */}
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5 sm:gap-6">
                        {workflowSteps.map((step, idx) => (
                            <div
                                key={step.step}
                                onClick={() => setActiveWorkflowStep(idx)}
                                className={`bg-white rounded-3xl p-6 border transition-all duration-200 cursor-pointer flex flex-col justify-between ${
                                    activeWorkflowStep === idx
                                        ? 'border-orange-500 shadow-md ring-2 ring-orange-400/20'
                                        : 'border-stone-200/80 hover:border-stone-300'
                                }`}
                            >
                                <div>
                                    <div className="flex items-center justify-between mb-4">
                                        <span className="w-8 h-8 rounded-full bg-orange-100 text-orange-700 font-extrabold text-xs font-plus-jakarta flex items-center justify-center">
                                            {step.step}
                                        </span>
                                        <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-stone-100 text-stone-600">
                                            {step.role}
                                        </span>
                                    </div>
                                    <h3 className="font-plus-jakarta font-bold text-base text-[#1a1208] mb-2.5">
                                        {step.title}
                                    </h3>
                                    <p className="text-xs sm:text-sm text-stone-600 leading-relaxed mb-4">
                                        {step.desc}
                                    </p>
                                </div>

                                <div className="pt-3 border-t border-stone-100 flex flex-wrap gap-1.5">
                                    {step.tags.map((tag) => (
                                        <span key={tag} className="text-[10px] font-semibold text-stone-500 bg-stone-100 px-2 py-0.5 rounded-full">
                                            {tag}
                                        </span>
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* WORKFLOW CLARIFICATION CALLOUT */}
                    <div className="mt-8 bg-white rounded-2xl p-4 sm:p-5 border border-stone-200/80 max-w-3xl mx-auto flex items-start gap-3 text-xs sm:text-sm text-stone-600">
                        <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
                        <div>
                            <strong className="text-stone-900">Responsible Outcome Guarantee:</strong> StraySafe coordinates reports through formal verification. Not every report results in immediate impoundment; cases may be resolved through owner reunification, localized assistance, or medical care.
                        </div>
                    </div>

                </div>
            </section>

            {/* ========================================================================= */}
            {/* 5. FOUR USER ROLES SECTION */}
            {/* ========================================================================= */}
            <section className="py-14 sm:py-18 md:py-24 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8" id="roles">
                <div className="max-w-3xl mx-auto text-center space-y-4 mb-12 sm:mb-16">
                    <div className="inline-flex items-center gap-2 text-xs font-bold text-orange-600 uppercase tracking-widest font-plus-jakarta">
                        <span className="w-6 h-[2px] bg-orange-500" />
                        Access & Jurisdictions
                        <span className="w-6 h-[2px] bg-orange-500" />
                    </div>
                    <h2 className="text-2xl sm:text-3xl md:text-4xl font-extrabold font-plus-jakarta text-[#1a1208] tracking-tight">
                        One Platform, Four Distinct User Roles
                    </h2>
                    <p className="text-sm sm:text-base text-stone-600 leading-relaxed">
                        To protect privacy and ensure operational accountability, StraySafe implements strict role-based access control. Each stakeholder only accesses the tools and data pertinent to their jurisdiction.
                    </p>
                </div>

                {/* ROLES GRID */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                    {userRoles.map((role) => {
                        const Icon = role.icon;

                        return (
                            <div
                                key={role.title}
                                className="rounded-3xl p-6 border border-stone-200/80 bg-white hover:border-orange-200 hover:shadow-md transition-all duration-200 flex flex-col justify-between"
                            >
                                <div>
                                    <div className="flex items-center justify-between mb-4">
                                        <div className={`w-12 h-12 rounded-2xl ${role.bgColor} flex items-center justify-center`} style={{ color: role.color }}>
                                            <Icon className="w-6 h-6" />
                                        </div>
                                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md ${role.badgeBg}`}>
                                            {role.badge}
                                        </span>
                                    </div>

                                    <h3 className="font-plus-jakarta font-extrabold text-lg text-[#1a1208] mb-2">
                                        {role.title}
                                    </h3>

                                    <p className="text-xs text-stone-600 mb-5 leading-relaxed">
                                        {role.summary}
                                    </p>

                                    <div className="space-y-2 pt-3 border-t border-stone-100">
                                        <p className="text-[10px] font-bold text-stone-400 uppercase tracking-wider">
                                            Implemented Capabilities:
                                        </p>
                                        <ul className="space-y-2">
                                            {role.capabilities.map((cap, cIdx) => (
                                                <li key={cIdx} className="text-xs text-stone-700 flex items-start gap-2">
                                                    <span className="w-1.5 h-1.5 rounded-full mt-1.5 shrink-0" style={{ backgroundColor: role.color }} />
                                                    <span>{cap}</span>
                                                </li>
                                            ))}
                                        </ul>
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </section>

            {/* ========================================================================= */}
            {/* 6. CORE FEATURES (VERIFIED FUNCTIONALITY) */}
            {/* ========================================================================= */}
            <section className="py-14 sm:py-18 md:py-24 bg-stone-100/70 border-y border-stone-200/80" id="features">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    
                    <div className="max-w-3xl mx-auto text-center space-y-4 mb-12 sm:mb-16">
                        <div className="inline-flex items-center gap-2 text-xs font-bold text-orange-600 uppercase tracking-widest font-plus-jakarta">
                            <span className="w-6 h-[2px] bg-orange-500" />
                            Core Capabilities
                            <span className="w-6 h-[2px] bg-orange-500" />
                        </div>
                        <h2 className="text-2xl sm:text-3xl md:text-4xl font-extrabold font-plus-jakarta text-[#1a1208] tracking-tight">
                            Built for Real-World Community Animal Management
                        </h2>
                        <p className="text-sm sm:text-base text-stone-600 leading-relaxed">
                            Every module in StraySafe 2.0 addresses verified operational needs documented during barangay and community animal welfare audits.
                        </p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {coreFeatures.map((feat) => {
                            const Icon = feat.icon;
                            return (
                                <div key={feat.title} className="bg-white rounded-3xl p-6 sm:p-7 border border-stone-200/80 shadow-xs hover:shadow-md transition-shadow">
                                    <div className="w-12 h-12 rounded-2xl bg-orange-50 flex items-center justify-center text-orange-600 mb-5">
                                        <Icon className="w-6 h-6" />
                                    </div>
                                    <h3 className="font-plus-jakarta font-bold text-lg text-[#1a1208] mb-2">
                                        {feat.title}
                                    </h3>
                                    <p className="text-xs sm:text-sm text-stone-600 leading-relaxed">
                                        {feat.description}
                                    </p>
                                </div>
                            );
                        })}
                    </div>

                </div>
            </section>

            {/* ========================================================================= */}
            {/* 7. AI-ASSISTED DECISION SUPPORT (VERIFIED CAPABILITIES ONLY) */}
            {/* ========================================================================= */}
            <section className="py-14 sm:py-18 md:py-24 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8" id="ai">
                <div className="max-w-3xl mx-auto text-center space-y-4 mb-12 sm:mb-16">
                    <div className="inline-flex items-center gap-2 text-xs font-bold text-orange-600 uppercase tracking-widest font-plus-jakarta">
                        <span className="w-6 h-[2px] bg-orange-500" />
                        Assistance, Not Automation
                        <span className="w-6 h-[2px] bg-orange-500" />
                    </div>
                    <h2 className="text-2xl sm:text-3xl md:text-4xl font-extrabold font-plus-jakarta text-[#1a1208] tracking-tight">
                        AI-Assisted Decision Support
                    </h2>
                    <p className="text-sm sm:text-base text-stone-600 leading-relaxed">
                        Machine learning speeds up image categorization and extracts helpful insights from reports. StraySafe operates strictly on a <strong className="text-stone-900 font-semibold">human-in-the-loop</strong> principle: AI suggests recommendations, while authorized officials make the final decision.
                    </p>
                </div>

                {/* AI CAPABILITIES CARDS */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
                    {aiCapabilities.map((ai) => {
                        const Icon = ai.icon;
                        return (
                            <div key={ai.title} className="bg-white rounded-3xl p-6 sm:p-7 border border-stone-200/80 shadow-xs flex flex-col justify-between">
                                <div>
                                    <div className="flex items-center justify-between mb-4">
                                        <div className="w-12 h-12 rounded-2xl bg-orange-100 flex items-center justify-center text-orange-600">
                                            <Icon className="w-6 h-6" />
                                        </div>
                                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-stone-100 text-stone-600 font-mono">
                                            {ai.badge}
                                        </span>
                                    </div>

                                    <div className="text-xs font-bold text-orange-600 font-mono mb-1">
                                        {ai.tech}
                                    </div>
                                    <h3 className="font-plus-jakarta font-bold text-lg text-[#1a1208] mb-2.5">
                                        {ai.title}
                                    </h3>
                                    <p className="text-xs sm:text-sm text-stone-600 leading-relaxed mb-5">
                                        {ai.description}
                                    </p>
                                </div>

                                <div className="pt-4 border-t border-stone-100 space-y-1.5">
                                    {ai.details.map((detail, dIdx) => (
                                        <div key={dIdx} className="text-xs text-stone-700 flex items-center gap-2">
                                            <Check className="w-3.5 h-3.5 text-orange-500 shrink-0" />
                                            <span>{detail}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        );
                    })}
                </div>

                {/* AI TRANSPARENCY NOTICE (ACCURACY AUDIT COMPLIANCE) */}
                <div className="bg-orange-50/80 rounded-3xl p-6 border border-orange-200/80 flex flex-col sm:flex-row items-start gap-4">
                    <div className="w-10 h-10 rounded-xl bg-orange-500 text-white flex items-center justify-center shrink-0">
                        <ShieldCheck className="w-5 h-5" />
                    </div>
                    <div className="space-y-1 text-xs sm:text-sm text-stone-700">
                        <h4 className="font-bold text-stone-900 font-plus-jakarta">
                            Accuracy & Human Verification Protocol
                        </h4>
                        <p className="leading-relaxed">
                            StraySafe does not make claims of infallible identification or automated rescue guarantees. AI detection confidence scores reflect bounding-box precision and visual similarity heuristics, not absolute certainty. Offline fallback algorithms ensure the system continues to operate safely even if external AI APIs are unreachable.
                        </p>
                    </div>
                </div>

            </section>

            {/* ========================================================================= */}
            {/* 8. CALL TO ACTION SECTION */}
            {/* ========================================================================= */}
            <section className="py-14 sm:py-20 md:py-24 bg-stone-900 text-white text-center relative overflow-hidden" id="contact">
                <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10 space-y-6">
                    <div className="w-14 h-14 rounded-2xl bg-orange-500/20 text-orange-400 border border-orange-500/30 flex items-center justify-center mx-auto">
                        <PawPrint className="w-7 h-7" />
                    </div>

                    <h2 className="text-3xl sm:text-4xl md:text-5xl font-extrabold font-plus-jakarta tracking-tight">
                        Protecting Strays,<br />
                        <span className="text-orange-400">Building Safer Neighborhoods.</span>
                    </h2>

                    <p className="text-sm sm:text-base text-stone-300 max-w-xl mx-auto leading-relaxed">
                        Whether you are spotting an animal on your street, reviewing reports in your subdivision, or managing response across your barangay, StraySafe gives you the tools to coordinate effectively.
                    </p>

                    <div className="flex flex-col sm:flex-row items-center justify-center gap-3 sm:gap-4 pt-3">
                        <Link to="/resident/report/new" className="w-full sm:w-auto">
                            <Button
                                variant="primary"
                                size="lg"
                                className="w-full sm:w-auto px-8 py-3.5 rounded-xl font-bold text-sm sm:text-base bg-orange-500 hover:bg-orange-600 border-none shadow-lg shadow-orange-500/30"
                            >
                                <span className="inline-flex items-center gap-2">
                                    <ClipboardList className="w-4 h-4" /> Report a Stray Animal
                                </span>
                            </Button>
                        </Link>

                        <Link to={signedIn ? homePathFor(signedIn) : '/login'} className="w-full sm:w-auto">
                            <Button
                                variant="ghost"
                                size="lg"
                                className="w-full sm:w-auto px-7 py-3.5 rounded-xl font-semibold text-sm sm:text-base text-white border border-stone-700 hover:bg-stone-800"
                            >
                                <span className="inline-flex items-center gap-2">
                                    <LogIn className="w-4 h-4" /> {signedIn ? `Continue as ${firstName}` : 'Sign In to Portal'}
                                </span>
                            </Button>
                        </Link>
                    </div>

                    <div className="pt-2 flex justify-center">
                        <InstallAppButton variant="ghost" className="text-xs text-stone-400 hover:text-white" />
                    </div>
                </div>
            </section>

            {/* ========================================================================= */}
            {/* 9. FOOTER */}
            {/* ========================================================================= */}
            <footer className="bg-stone-950 text-stone-400 py-12 sm:py-16 border-t border-stone-800">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-8 mb-10">
                        
                        {/* BRAND COLUMN */}
                        <div className="space-y-3 md:col-span-1">
                            <div className="flex items-center gap-2.5">
                                <img src="/SSLOGO-128.png" alt="StraySafe Logo" className="w-8 h-8 object-contain" />
                                <span className="font-plus-jakarta font-extrabold text-lg text-white">
                                    StraySafe 2.0
                                </span>
                            </div>
                            <p className="text-xs text-stone-400 leading-relaxed">
                                Community-based stray animal reporting and coordination platform for residents, subdivision leaders, and barangay personnel.
                            </p>
                        </div>

                        {/* NAVIGATION LINKS */}
                        <div>
                            <h4 className="text-xs font-bold text-white uppercase tracking-wider font-plus-jakarta mb-3">
                                Platform
                            </h4>
                            <ul className="space-y-2 text-xs">
                                <li>
                                    <a href="#about" className="hover:text-orange-400 transition-colors">What is StraySafe</a>
                                </li>
                                <li>
                                    <a href="#how-it-works" className="hover:text-orange-400 transition-colors">How It Works</a>
                                </li>
                                <li>
                                    <a href="#roles" className="hover:text-orange-400 transition-colors">User Roles & Access</a>
                                </li>
                                <li>
                                    <a href="#features" className="hover:text-orange-400 transition-colors">Core Features</a>
                                </li>
                                <li>
                                    <a href="#ai" className="hover:text-orange-400 transition-colors">AI Decision Support</a>
                                </li>
                            </ul>
                        </div>

                        {/* PORTAL ACCESS */}
                        <div>
                            <h4 className="text-xs font-bold text-white uppercase tracking-wider font-plus-jakarta mb-3">
                                Portals
                            </h4>
                            <ul className="space-y-2 text-xs">
                                <li>
                                    <Link to="/login" className="hover:text-orange-400 transition-colors">Citizen Portal</Link>
                                </li>
                                <li>
                                    <Link to="/staff/login" className="hover:text-orange-400 transition-colors">Subdivision Leader Portal</Link>
                                </li>
                                <li>
                                    <Link to="/staff/login" className="hover:text-orange-400 transition-colors">Barangay Staff Portal</Link>
                                </li>
                                <li>
                                    <Link to="/admin/login" className="hover:text-orange-400 transition-colors">System Administrator</Link>
                                </li>
                            </ul>
                        </div>

                        {/* LEGAL & STATUTORY COMPLIANCE */}
                        <div>
                            <h4 className="text-xs font-bold text-white uppercase tracking-wider font-plus-jakarta mb-3">
                                Compliance & Standards
                            </h4>
                            <p className="text-xs text-stone-400 leading-relaxed mb-2">
                                Designed in alignment with the Philippine Animal Welfare Act (RA 8485 / RA 10631) and the Data Privacy Act of 2012 (RA 10173).
                            </p>
                            <p className="text-[11px] text-stone-500">
                                Contact masking applies to public QR scans to safeguard pet owner personal data.
                            </p>
                        </div>

                    </div>

                    <div className="pt-8 border-t border-stone-800/80 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-stone-500">
                        <div>
                            © 2026 StraySafe 2.0 System. All rights reserved.
                        </div>
                        <div className="flex items-center gap-6">
                            <span>Civic Animal Welfare</span>
                            <span>•</span>
                            <span>Barangay Coordination</span>
                            <span>•</span>
                            <span>Human-in-the-Loop</span>
                        </div>
                    </div>
                </div>
            </footer>

            <GuestQRScannerModal isOpen={isGuestScannerOpen} onClose={() => setIsGuestScannerOpen(false)} />
        </div>
    );
};

export default LandingPage;
