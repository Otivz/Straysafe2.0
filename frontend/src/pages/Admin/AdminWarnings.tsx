import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { 
    AlertTriangle, 
    ShieldAlert, 
    CheckCircle2, 
    Clock, 
    Search, 
    FileText, 
    PawPrint, 
    Eye,
    AlertOctagon,
    RefreshCw,
    UserX
} from 'lucide-react';
import { api } from '../../utils/api';
import { getCachedData, setCachedData } from '../../utils/cache';
import AdminSidebar from '../../components/AdminSidebar';
import AdminNavbar from '../../components/Navbars/AdminNavbar';
import Button from '../../components/Button';
import Select from '../../components/Dropdown';
import DataTable from '../../components/DataTable';
import WarningDetailsModal, { type WarningRecordData } from '../../components/Modals/WarningDetailsModal';

export const maskPhoneNumber = (phone: string | null | undefined): string => {
    if (!phone) return 'N/A';
    const cleaned = phone.trim();
    if (cleaned.length <= 6) return '****' + cleaned.slice(-2);
    // Mask middle digits: keep first 4 and last 3 visible
    const firstPart = cleaned.slice(0, 4);
    const lastPart = cleaned.slice(-3);
    return `${firstPart}****${lastPart}`;
};

const AdminWarnings: React.FC = () => {
    const [warnings, setWarnings] = useState<WarningRecordData[]>(() => getCachedData<WarningRecordData[]>('admin_warnings_list') || []);
    const [loading, setLoading] = useState<boolean>(() => !getCachedData<WarningRecordData[]>('admin_warnings_list'));
    const [searchTerm, setSearchTerm] = useState<string>('');
    const [statusFilter, setStatusFilter] = useState<string>('all');
    const [levelFilter, setLevelFilter] = useState<string>('all');
    const [offenderFilter, setOffenderFilter] = useState<string>('all');
    const [selectedWarning, setSelectedWarning] = useState<WarningRecordData | null>(null);
    const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
    const [searchParams, setSearchParams] = useSearchParams();
    const warningIdParam = searchParams.get('warning_id');
    const warningHandledRef = useRef<string | null>(null);

    useEffect(() => {
        if (warningIdParam && warnings.length > 0 && warningHandledRef.current !== warningIdParam) {
            const found = warnings.find(w => String(w.warning_id) === warningIdParam);
            if (found) {
                setSelectedWarning(found);
                setIsModalOpen(true);
                warningHandledRef.current = warningIdParam;
            }
        }
    }, [warningIdParam, warnings]);

    const handleCloseWarningModal = () => {
        setIsModalOpen(false);
        setSelectedWarning(null);
        if (searchParams.has('warning_id')) {
            const nextParams = new URLSearchParams(searchParams);
            nextParams.delete('warning_id');
            setSearchParams(nextParams, { replace: true });
        }
    };

    const fetchWarnings = async (forceLoading = false) => {
        if (forceLoading || !getCachedData('admin_warnings_list')) {
            setLoading(true);
        }
        try {
            const res = await api.get('/warnings/');
            if (Array.isArray(res.data)) {
                setWarnings(res.data);
                setCachedData('admin_warnings_list', res.data, 5 * 60 * 1000);
            }
        } catch (err) {
            console.error('Failed to fetch community citations:', err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchWarnings();
    }, []);

    // Repeat Offenders Calculation: Group by user_id or owner_name
    const offenderWarningCounts = useMemo(() => {
        const counts: Record<string, number> = {};
        warnings.forEach(w => {
            const key = w.user_id ? String(w.user_id) : (w.owner_name || 'unknown');
            counts[key] = (counts[key] || 0) + 1;
        });
        return counts;
    }, [warnings]);

    const isRepeatOffender = (w: WarningRecordData): boolean => {
        const key = w.user_id ? String(w.user_id) : (w.owner_name || 'unknown');
        return (offenderWarningCounts[key] || 0) >= 3;
    };

    const getOffenderCount = (w: WarningRecordData): number => {
        const key = w.user_id ? String(w.user_id) : (w.owner_name || 'unknown');
        return offenderWarningCounts[key] || 1;
    };

    // Summary Statistics
    const totalCitations = warnings.length;
    const pendingCitations = warnings.filter(w => w.status === 'Pending').length;
    const acknowledgedCitations = warnings.filter(w => w.status === 'Acknowledged').length;
    
    // Unique repeat offenders (>= 3 citations)
    const repeatOffenderKeys = useMemo(() => {
        return Object.entries(offenderWarningCounts)
            .filter(([_, count]) => count >= 3)
            .map(([key]) => key);
    }, [offenderWarningCounts]);

    const escalatedCitations = warnings.filter(w => 
        w.warning_level?.toLowerCase().includes('final') || 
        w.warning_level?.toLowerCase().includes('escalat')
    ).length;

    // Filtered Citations
    const filteredWarnings = useMemo(() => {
        return warnings.filter(w => {
            const term = searchTerm.toLowerCase().trim();
            const offenderName = (w.owner_name || '').toLowerCase();
            const petName = (w.pet_name || '').toLowerCase();
            const violation = (w.violation_type || '').toLowerCase();
            const landmark = (w.report_landmark || '').toLowerCase();
            const warningId = `#warn-${String(w.warning_id).padStart(4, '0')}`.toLowerCase();
            const petId = (w.pet_id_display || '').toLowerCase();

            const matchesSearch = !term || 
                offenderName.includes(term) || 
                petName.includes(term) || 
                violation.includes(term) || 
                landmark.includes(term) ||
                warningId.includes(term) ||
                petId.includes(term);

            const matchesStatus = statusFilter === 'all' || w.status === statusFilter;

            const matchesLevel = levelFilter === 'all' || 
                (w.warning_level && w.warning_level.toLowerCase().includes(levelFilter.toLowerCase()));

            let matchesOffender = true;
            if (offenderFilter === 'repeat') {
                matchesOffender = isRepeatOffender(w);
            } else if (offenderFilter === 'escalated') {
                matchesOffender = w.warning_level?.toLowerCase().includes('final') || 
                                  w.warning_level?.toLowerCase().includes('escalat');
            }

            return matchesSearch && matchesStatus && matchesLevel && matchesOffender;
        });
    }, [warnings, searchTerm, statusFilter, levelFilter, offenderFilter, offenderWarningCounts]);

    const handleOpenDetails = (warning: WarningRecordData) => {
        setSelectedWarning(warning);
        setIsModalOpen(true);
    };

    const tableColumns = [
        {
            header: 'Citation Ref & Date',
            key: 'citation_ref',
            className: 'w-[160px]',
            render: (w: WarningRecordData) => {
                const dateStr = w.created_at || w.issued_at
                    ? new Date(w.created_at || w.issued_at!).toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric'
                    })
                    : 'N/A';
                return (
                    <div className="flex flex-col">
                        <span className="font-mono text-xs font-black text-gray-900">
                            #WARN-{String(w.warning_id).padStart(4, '0')}
                        </span>
                        <span className="text-[10px] font-bold text-gray-400 mt-0.5 flex items-center gap-1">
                            <Clock className="w-2.5 h-2.5" />
                            {dateStr}
                        </span>
                    </div>
                );
            }
        },
        {
            header: 'Citizen / Offender',
            key: 'offender',
            className: 'w-[230px]',
            render: (w: WarningRecordData) => {
                const count = getOffenderCount(w);
                const isRepeat = count >= 3;
                return (
                    <div className="flex flex-col">
                        <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="font-black text-sm text-gray-900 leading-tight">
                                {w.owner_name || 'Unidentified Resident'}
                            </span>
                            {isRepeat && (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider bg-red-100 text-red-700 border border-red-200">
                                    <ShieldAlert className="w-2.5 h-2.5" />
                                    Repeat ({count}x)
                                </span>
                            )}
                        </div>
                        <span className="text-[11px] font-medium text-gray-500 mt-0.5 flex items-center gap-1">
                            Phone: <strong className="text-gray-700 font-mono">{maskPhoneNumber(w.owner_phone)}</strong>
                        </span>
                        {w.report_landmark && (
                            <span className="text-[10px] text-gray-400 truncate max-w-[210px] mt-0.5" title={w.report_landmark}>
                                Loc: {w.report_landmark}
                            </span>
                        )}
                    </div>
                );
            }
        },
        {
            header: 'Subject Pet',
            key: 'pet',
            className: 'w-[160px]',
            render: (w: WarningRecordData) => {
                const petName = w.pet_name || (w.pet_id ? `Pet #${w.pet_id}` : 'Unregistered Animal');
                const petId = w.pet_id_display || (w.pet_id ? `PET-${String(w.pet_id).padStart(5, '0')}` : null);
                return (
                    <div className="flex flex-col">
                        <span className="font-bold text-xs text-gray-800 flex items-center gap-1">
                            <PawPrint className="w-3 h-3 text-[#B35D25]" />
                            {petName}
                        </span>
                        {petId ? (
                            <span className="font-mono text-[10px] font-bold text-orange-600 bg-orange-50 px-1.5 py-0.5 rounded mt-1 w-fit">
                                {petId}
                            </span>
                        ) : (
                            <span className="text-[10px] text-gray-400 italic mt-0.5">
                                Stray / Unlinked
                            </span>
                        )}
                    </div>
                );
            }
        },
        {
            header: 'Violation Type',
            key: 'violation',
            className: 'w-[190px]',
            render: (w: WarningRecordData) => (
                <div className="flex flex-col">
                    <span className="text-xs font-black text-slate-800 leading-snug">
                        {w.violation_type || 'Municipal Code Infraction'}
                    </span>
                    {w.description && (
                        <p className="text-[10px] text-gray-500 truncate max-w-[180px] mt-0.5" title={w.description}>
                            {w.description}
                        </p>
                    )}
                </div>
            )
        },
        {
            header: 'Citation Level',
            key: 'warning_level',
            className: 'w-[180px]',
            render: (w: WarningRecordData) => {
                const level = w.warning_level || 'Notice';
                const isFinal = level.toLowerCase().includes('final') || level.toLowerCase().includes('escalat');
                const isSecond = level.toLowerCase().includes('2nd');
                const isFirst = level.toLowerCase().includes('1st');

                if (isFinal) {
                    return (
                        <div className="flex flex-col gap-1 items-start">
                            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider bg-rose-50 text-rose-700 border border-rose-200/90 shadow-2xs">
                                <AlertOctagon className="w-3 h-3 text-rose-600 shrink-0" />
                                Final Notice / Escalation
                            </span>
                            <span className="text-[9px] font-bold text-rose-600 ml-1">Legal Escalation Eligible</span>
                        </div>
                    );
                }

                if (isSecond) {
                    return (
                        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider bg-amber-50 text-amber-800 border border-amber-200/90 shadow-2xs">
                            <AlertTriangle className="w-3 h-3 text-amber-600" />
                            2nd Warning
                        </span>
                    );
                }

                if (isFirst) {
                    return (
                        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider bg-slate-100 text-slate-700 border border-slate-200/90 shadow-2xs">
                            <span className="w-1.5 h-1.5 rounded-full bg-slate-500 opacity-80" />
                            1st Warning
                        </span>
                    );
                }

                return (
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider bg-slate-100 text-slate-700 border border-slate-200/90 shadow-2xs">
                        <span className="w-1.5 h-1.5 rounded-full bg-slate-500 opacity-80" />
                        Formal Notice
                    </span>
                );
            }
        },
        {
            header: 'Status & Acknowledgment',
            key: 'status',
            className: 'w-[190px]',
            render: (w: WarningRecordData) => {
                const isAck = w.status === 'Acknowledged';
                const ackDate = w.acknowledged_at
                    ? new Date(w.acknowledged_at).toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric'
                    })
                    : null;

                if (isAck) {
                    return (
                        <div className="flex flex-col items-start">
                            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider bg-emerald-50 text-emerald-700 border border-emerald-200/90 shadow-2xs">
                                <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                                Acknowledged
                            </span>
                            {ackDate && (
                                <span className="text-[9px] font-bold text-emerald-700 mt-1 ml-1">
                                    Signed on {ackDate}
                                </span>
                            )}
                        </div>
                    );
                }

                return (
                    <div className="flex flex-col items-start">
                        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider bg-amber-50 text-amber-800 border border-amber-200/90 shadow-2xs">
                            <Clock className="w-3 h-3 text-amber-600 animate-spin" />
                            Pending Response
                        </span>
                        <span className="text-[9px] font-medium text-gray-400 mt-1 ml-1">
                            Awaiting Citizen
                        </span>
                    </div>
                );
            }
        },
        {
            header: 'Actions',
            key: 'actions',
            className: 'w-[110px] text-right',
            render: (w: WarningRecordData) => (
                <div className="flex justify-end">
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            handleOpenDetails(w);
                        }}
                        className="px-3 py-1.5 bg-[#1A4543] hover:bg-[#153836] text-white rounded-xl text-xs font-bold transition-all shadow-sm flex items-center gap-1 cursor-pointer"
                        title="View Notice Details"
                    >
                        <Eye className="w-3.5 h-3.5" />
                        <span>Inspect</span>
                    </button>
                </div>
            )
        }
    ];

    return (
        <div className="flex h-screen bg-[#F8FAFC]">
            <AdminSidebar />

            <div className="flex-1 flex flex-col overflow-hidden">
                <AdminNavbar
                    leftContent={
                        <div className="flex flex-col">
                            <h1 className="text-xl font-black text-gray-900 tracking-tight leading-none uppercase">
                                Community Citations & Warnings
                            </h1>
                            <p className="text-[9px] text-gray-400 font-extrabold uppercase tracking-wider mt-1.5 leading-none">
                                Centralized Municipal Violations, Notice Letters, & Repeat Offender Escalations
                            </p>
                        </div>
                    }
                />

                <main className="flex-1 overflow-y-auto p-8">
                    <div className="max-w-7xl mx-auto space-y-6">

                        {/* Top Action Bar */}
                        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                            <div>
                                <span className="text-[11px] font-black text-gray-400 uppercase tracking-widest">
                                    Enforcement & Governance
                                </span>
                                <h2 className="text-2xl font-black text-[#1A4543] tracking-tight">
                                    Notice Letters & Citation Registry
                                </h2>
                            </div>
                            <Button 
                                variant="light" 
                                onClick={() => fetchWarnings(true)}
                                className="flex items-center gap-2 text-xs font-bold px-4 py-2 border-gray-200 hover:border-gray-300"
                            >
                                <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
                                <span>Sync Citations</span>
                            </Button>
                        </div>

                        {/* 1. Stat Summary Cards */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
                            {/* Card 1: Total */}
                            <div className="bg-white rounded-2xl p-4 shadow-[0_2px_14px_rgba(0,0,0,0.02)] border border-gray-100 flex flex-col justify-between">
                                <div className="flex justify-between items-start">
                                    <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Total Citations</span>
                                    <div className="w-7 h-7 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
                                        <FileText className="w-3.5 h-3.5" />
                                    </div>
                                </div>
                                <div className="mt-3">
                                    <p className="text-2xl font-black text-gray-900 leading-none">{totalCitations}</p>
                                    <p className="text-[10px] font-bold text-gray-400 mt-1">Issued across municipality</p>
                                </div>
                            </div>

                            {/* Card 2: Pending Acknowledgment */}
                            <div className="bg-white rounded-2xl p-4 shadow-[0_2px_14px_rgba(0,0,0,0.02)] border border-gray-100 flex flex-col justify-between">
                                <div className="flex justify-between items-start">
                                    <span className="text-[10px] font-black text-amber-600 uppercase tracking-widest">Pending Sign-off</span>
                                    <div className="w-7 h-7 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center">
                                        <Clock className="w-3.5 h-3.5" />
                                    </div>
                                </div>
                                <div className="mt-3">
                                    <p className="text-2xl font-black text-amber-600 leading-none">{pendingCitations}</p>
                                    <p className="text-[10px] font-bold text-gray-400 mt-1">Unacknowledged notice letters</p>
                                </div>
                            </div>

                            {/* Card 3: Acknowledged Compliance */}
                            <div className="bg-white rounded-2xl p-4 shadow-[0_2px_14px_rgba(0,0,0,0.02)] border border-gray-100 flex flex-col justify-between">
                                <div className="flex justify-between items-start">
                                    <span className="text-[10px] font-black text-emerald-700 uppercase tracking-widest">Acknowledged</span>
                                    <div className="w-7 h-7 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
                                        <CheckCircle2 className="w-3.5 h-3.5" />
                                    </div>
                                </div>
                                <div className="mt-3">
                                    <p className="text-2xl font-black text-emerald-600 leading-none">{acknowledgedCitations}</p>
                                    <p className="text-[10px] font-bold text-gray-400 mt-1">Confirmed compliance pledges</p>
                                </div>
                            </div>

                            {/* Card 4: Repeat Offenders */}
                            <div className={`bg-white rounded-2xl p-4 shadow-[0_2px_14px_rgba(0,0,0,0.02)] border ${repeatOffenderKeys.length > 0 ? 'border-red-300 ring-2 ring-red-100' : 'border-gray-100'} flex flex-col justify-between`}>
                                <div className="flex justify-between items-start">
                                    <span className="text-[10px] font-black text-red-600 uppercase tracking-widest">Repeat Violators</span>
                                    <div className="w-7 h-7 rounded-xl bg-red-50 text-red-600 flex items-center justify-center">
                                        <UserX className="w-3.5 h-3.5" />
                                    </div>
                                </div>
                                <div className="mt-3">
                                    <p className="text-2xl font-black text-red-600 leading-none">{repeatOffenderKeys.length}</p>
                                    <p className="text-[10px] font-bold text-gray-400 mt-1">&ge; 3 Community Violations</p>
                                </div>
                            </div>

                            {/* Card 5: Final Escalations */}
                            <div className="bg-white rounded-2xl p-4 shadow-[0_2px_14px_rgba(0,0,0,0.02)] border border-gray-100 flex flex-col justify-between">
                                <div className="flex justify-between items-start">
                                    <span className="text-[10px] font-black text-purple-700 uppercase tracking-widest">Final Notices</span>
                                    <div className="w-7 h-7 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center">
                                        <AlertOctagon className="w-3.5 h-3.5" />
                                    </div>
                                </div>
                                <div className="mt-3">
                                    <p className="text-2xl font-black text-purple-700 leading-none">{escalatedCitations}</p>
                                    <p className="text-[10px] font-bold text-gray-400 mt-1">Barangay legal / sanction level</p>
                                </div>
                            </div>
                        </div>

                        {/* 2. REPEAT VIOLATORS RED URGENCY BANNER (CRITICAL ACCEPTANCE CRITERIA) */}
                        {repeatOffenderKeys.length > 0 && (
                            <div className="bg-gradient-to-r from-red-600 via-rose-600 to-red-700 rounded-2xl p-5 text-white shadow-lg shadow-red-600/20 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 border border-red-400/40">
                                <div className="flex items-start space-x-3.5">
                                    <div className="p-2.5 bg-white/20 rounded-xl backdrop-blur-sm shrink-0">
                                        <ShieldAlert className="w-6 h-6 text-white animate-bounce" />
                                    </div>
                                    <div>
                                        <div className="flex items-center gap-2">
                                            <span className="bg-white text-red-700 text-[10px] font-black uppercase px-2 py-0.5 rounded-full">
                                                Urgent Compliance Alert
                                            </span>
                                            <span className="text-xs font-bold text-red-100">
                                                {repeatOffenderKeys.length} Repeat Offender{repeatOffenderKeys.length > 1 ? 's' : ''} Identified
                                            </span>
                                        </div>
                                        <h3 className="text-base font-black text-white mt-1 leading-snug">
                                            Multiple residents have accumulated 3 or more citations across subdivisions.
                                        </h3>
                                        <p className="text-xs text-red-100 mt-0.5">
                                            Under municipal animal care bylaws, owners with &ge; 3 recorded infractions require immediate escalation to Barangay Legal & the HOA Disciplinary Committee.
                                        </p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-2 shrink-0">
                                    <button
                                        onClick={() => setOffenderFilter(offenderFilter === 'repeat' ? 'all' : 'repeat')}
                                        className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all shadow-md cursor-pointer ${
                                            offenderFilter === 'repeat'
                                                ? 'bg-white text-red-700 hover:bg-red-50 ring-2 ring-white'
                                                : 'bg-black/30 hover:bg-black/40 text-white border border-white/30'
                                        }`}
                                    >
                                        {offenderFilter === 'repeat' ? 'Show All Citations' : 'Filter Repeat Violators'}
                                    </button>
                                </div>
                            </div>
                        )}

                        {/* 3. Search & Comprehensive Filter Controls */}
                        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                            <div className="relative flex-1 max-w-lg">
                                <Search className="absolute inset-y-0 left-3 my-auto w-4 h-4 text-gray-400" />
                                <input
                                    type="text"
                                    placeholder="Search by offender name, pet, violation, landmark, or #WARN..."
                                    className="w-full pl-9 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs font-medium focus:ring-2 focus:ring-[#F97316] outline-none transition-all placeholder:text-gray-400"
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                />
                            </div>

                            <div className="flex flex-wrap items-center gap-2.5">
                                {/* Offender Filter */}
                                <Select
                                    value={offenderFilter}
                                    onChange={(e) => setOffenderFilter(e.target.value)}
                                    options={[
                                        { value: 'all', label: 'All Offenders' },
                                        { value: 'repeat', label: 'Repeat Violators (≥3x)' },
                                        { value: 'escalated', label: 'Final Notices / Escalated' }
                                    ]}
                                    className="w-[190px]"
                                />

                                {/* Status Filter */}
                                <Select
                                    value={statusFilter}
                                    onChange={(e) => setStatusFilter(e.target.value)}
                                    options={[
                                        { value: 'all', label: 'All Statuses' },
                                        { value: 'Pending', label: 'Pending Acknowledgment' },
                                        { value: 'Acknowledged', label: 'Acknowledged' }
                                    ]}
                                    className="w-[180px]"
                                />

                                {/* Level Filter */}
                                <Select
                                    value={levelFilter}
                                    onChange={(e) => setLevelFilter(e.target.value)}
                                    options={[
                                        { value: 'all', label: 'All Levels' },
                                        { value: 'Notice', label: 'Formal Notice' },
                                        { value: '1st Warning', label: '1st Warning' },
                                        { value: '2nd Warning', label: '2nd Warning' },
                                        { value: 'Final Notice', label: 'Final Notice / Escalation' }
                                    ]}
                                    className="w-[170px]"
                                />

                                {(searchTerm || statusFilter !== 'all' || levelFilter !== 'all' || offenderFilter !== 'all') && (
                                    <button
                                        onClick={() => {
                                            setSearchTerm('');
                                            setStatusFilter('all');
                                            setLevelFilter('all');
                                            setOffenderFilter('all');
                                        }}
                                        className="text-xs font-bold text-gray-500 hover:text-red-600 transition-colors px-2 py-1"
                                    >
                                        Clear
                                    </button>
                                )}
                            </div>
                        </div>

                        {/* 4. Data Table */}
                        <div>
                            <div className="flex justify-between items-center mb-2 px-1">
                                <span className="text-xs font-bold text-gray-500">
                                    Showing <strong className="text-gray-900">{filteredWarnings.length}</strong> citations
                                    {offenderFilter === 'repeat' && ' for repeat violators'}
                                </span>
                                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">
                                    PII Protected (Masked Phone Numbers)
                                </span>
                            </div>

                            <DataTable
                                loading={loading}
                                data={filteredWarnings}
                                columns={tableColumns}
                                onRowClick={handleOpenDetails}
                                emptyTitle="No Community Citations Found"
                                emptyMessage={
                                    searchTerm || statusFilter !== 'all' || levelFilter !== 'all' || offenderFilter !== 'all'
                                        ? "No community citations match your selected search or filter criteria."
                                        : "No municipal citations or warning letters have been issued."
                                }
                                onResetFilters={
                                    (searchTerm || statusFilter !== 'all' || levelFilter !== 'all' || offenderFilter !== 'all')
                                        ? () => { setSearchTerm(''); setStatusFilter('all'); setLevelFilter('all'); setOffenderFilter('all'); }
                                        : undefined
                                }
                                loadingMessage="Hydrating municipal citation records..."
                            />
                        </div>

                    </div>
                </main>
            </div>

            {/* Warning Inspection Modal */}
            <WarningDetailsModal
                isOpen={isModalOpen}
                onClose={handleCloseWarningModal}
                warning={selectedWarning}
            />
        </div>
    );
};

export default AdminWarnings;
