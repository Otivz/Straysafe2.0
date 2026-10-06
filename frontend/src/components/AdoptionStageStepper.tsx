import React from 'react';
import { 
    FileText, 
    ShieldCheck, 
    Video, 
    Home, 
    ClipboardCheck, 
    CheckCircle2, 
    Award, 
    HeartHandshake, 
    Activity,
    XCircle,
    Clock
} from 'lucide-react';

export interface StageInfo {
    id: string;
    label: string;
    shortLabel: string;
    description: string;
    icon: React.ComponentType<{ className?: string }>;
}

export const ADOPTION_STAGES: StageInfo[] = [
    {
        id: 'Application',
        label: '1. Application',
        shortLabel: 'Applied',
        description: 'Submission of application & proof of ID',
        icon: FileText,
    },
    {
        id: 'Verification',
        label: '2. Verification',
        shortLabel: 'Verification',
        description: 'ID authentication & blacklist check',
        icon: ShieldCheck,
    },
    {
        id: 'Interview',
        label: '3. Interview',
        shortLabel: 'Interview',
        description: 'Care knowledge & readiness assessment',
        icon: Video,
    },
    {
        id: 'Home_Visit',
        label: '4. Home Visit',
        shortLabel: 'Home Visit',
        description: 'Fence security & living space inspection',
        icon: Home,
    },
    {
        id: 'Review',
        label: '5. Review',
        shortLabel: 'Review',
        description: 'Consolidated dossier review',
        icon: ClipboardCheck,
    },
    {
        id: 'Approval',
        label: '6. Approval',
        shortLabel: 'Approval',
        description: 'Barangay Head Officer official decision',
        icon: CheckCircle2,
    },
    {
        id: 'Certificate',
        label: '7. Certificate',
        shortLabel: 'Certificate',
        description: 'Digital agreement & SHA-256 certificate',
        icon: Award,
    },
    {
        id: 'Handover',
        label: '8. Handover',
        shortLabel: 'Handover',
        description: 'Physical pet transfer & photo evidence',
        icon: HeartHandshake,
    },
    {
        id: 'Monitoring',
        label: '9. Monitoring',
        shortLabel: 'Monitoring',
        description: '1-Month Welfare Checks (Day 7, 14, 30)',
        icon: Activity,
    },
    {
        id: 'Successful_Adoption',
        label: '10. Successful Adoption',
        shortLabel: 'Successful',
        description: 'Adoption officially completed & case closed',
        icon: CheckCircle2,
    },
];

interface AdoptionStageStepperProps {
    currentStage?: string;
    stageStatus?: string;
    status?: 'Pending' | 'Approved' | 'Rejected' | 'Cancelled';
    postMonitoringStatus?: string;
    compact?: boolean;
}

export const getStageIndex = (stageName?: string): number => {
    if (!stageName) return 0;
    const clean = stageName.toLowerCase().replace(/[\s_-]/g, '');
    if (clean === 'completed' || clean === 'caseclosed' || clean === 'successful' || clean === 'successfuladoption') {
        return 9;
    }
    const idx = ADOPTION_STAGES.findIndex(
        s => s.id.toLowerCase().replace(/[\s_-]/g, '') === clean
    );
    return idx >= 0 ? idx : 0;
};

export const AdoptionStageStepper: React.FC<AdoptionStageStepperProps> = ({
    currentStage = 'Application',
    stageStatus = 'Submitted',
    status = 'Pending',
    postMonitoringStatus,
    compact = false,
}) => {
    const isRejected = status === 'Rejected';
    const isCancelled = status === 'Cancelled';
    const isCompleted = postMonitoringStatus === 'Completed' || currentStage === 'Successful_Adoption' || currentStage === 'Completed' || currentStage === 'Successful' || stageStatus === 'Case_Closed';

    const currentIndex = isCancelled
        ? -1
        : isRejected
        ? getStageIndex(currentStage)
        : isCompleted
        ? 9
        : getStageIndex(currentStage);

    const activeStage = ADOPTION_STAGES[Math.min(Math.max(currentIndex, 0), 9)];

    return (
        <div className="w-full bg-slate-50/70 dark:bg-[#0B0F19]/60 rounded-2xl p-3 sm:p-4 border border-slate-200/80 dark:border-slate-800">
            {/* Stage Header Info */}
            <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
                <div className="flex items-center gap-2">
                    <span className="text-[10px] sm:text-xs font-black uppercase tracking-wider text-slate-400 dark:text-slate-500">
                        Adoption Lifecycle:
                    </span>
                    {isCancelled ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                            <XCircle className="w-3 h-3 text-slate-500" /> Cancelled
                        </span>
                    ) : isRejected ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-red-100 dark:bg-red-950/60 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-900/60">
                            <XCircle className="w-3 h-3 text-red-600" /> Disapproved at Stage {currentIndex + 1}
                        </span>
                    ) : isCompleted ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                            <CheckCircle2 className="w-3 h-3 text-emerald-600" /> ✓ Adoption Successful (Case Closed)
                        </span>
                    ) : (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-role-muted dark:bg-role-strong/60 text-role-strong dark:text-role-border border border-role-border dark:border-role-strong">
                            <span className="relative flex h-2 w-2">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-role opacity-75"></span>
                                <span className="relative inline-flex rounded-full h-2 w-2 bg-role"></span>
                            </span>
                            Active: {activeStage?.label}
                        </span>
                    )}
                </div>

                {stageStatus && (
                    <span className="text-[11px] font-bold text-slate-600 dark:text-slate-400">
                        Status: <strong className="text-slate-900 dark:text-white">{stageStatus.replace(/_/g, ' ')}</strong>
                    </span>
                )}
            </div>

            {/* Visual Stepper Track */}
            <div className="relative overflow-x-auto pb-1 scrollbar-none">
                <div className="min-w-[560px] sm:min-w-[680px] flex items-center justify-between relative py-2">
                    {/* Connecting Bar */}
                    <div className="absolute top-1/2 left-4 right-4 -translate-y-1/2 h-1 bg-slate-200 dark:bg-slate-800 rounded-full z-0" />
                    
                    {/* Active Progress Line */}
                    <div 
                        className={`absolute top-1/2 left-4 -translate-y-1/2 h-1 rounded-full z-0 transition-all duration-500 ${
                            isRejected ? 'bg-red-500' : isCompleted ? 'bg-emerald-500' : 'bg-gradient-to-r from-role to-amber-500'
                        }`}
                        style={{
                            width: isCancelled
                                ? '0%'
                                : `${Math.min(Math.max((currentIndex / 9) * 100, 0), 100)}%`
                        }}
                    />

                    {ADOPTION_STAGES.map((stage, idx) => {
                        const Icon = stage.icon;
                        const isDone = !isCancelled && idx < currentIndex;
                        const isCurrent = !isCancelled && idx === currentIndex;
                        const isFailedHere = isRejected && isCurrent;

                        let circleClass = 'bg-white dark:bg-[#151C2C] border-2 border-slate-300 dark:border-slate-700 text-slate-400 dark:text-slate-600';

                        if (isFailedHere) {
                            circleClass = 'bg-red-500 border-2 border-red-600 text-white shadow-md shadow-red-500/30 ring-4 ring-red-100 dark:ring-red-950/60';
                        } else if (isDone || (isCurrent && isCompleted)) {
                            circleClass = 'bg-emerald-600 border-2 border-emerald-600 text-white shadow-xs';
                        } else if (isCurrent) {
                            circleClass = 'bg-role border-2 border-role text-white shadow-md shadow-role/30 ring-4 ring-role-muted dark:ring-role-strong/60 animate-pulse';
                        }

                        return (
                            <div 
                                key={stage.id} 
                                className="relative z-10 flex flex-col items-center group cursor-default"
                                title={`${stage.label}: ${stage.description}`}
                            >
                                <div className={`w-7 h-7 sm:w-8 sm:h-8 rounded-full flex items-center justify-center transition-all ${circleClass}`}>
                                    {isFailedHere ? (
                                        <XCircle className="w-4 h-4" />
                                    ) : isDone || (isCurrent && isCompleted) ? (
                                        <CheckCircle2 className="w-4 h-4" />
                                    ) : (
                                        <Icon className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                                    )}
                                </div>
                                <span className={`text-[10px] sm:text-[11px] font-bold mt-1.5 whitespace-nowrap transition-colors ${
                                    isFailedHere
                                        ? 'text-red-600 dark:text-red-400'
                                        : isCurrent && !isCompleted
                                        ? 'text-role-hover dark:text-role font-black'
                                        : isDone || (isCurrent && isCompleted)
                                        ? 'text-emerald-700 dark:text-emerald-400 font-bold'
                                        : 'text-slate-400 dark:text-slate-600'
                                }`}>
                                    {stage.shortLabel} {idx === 9 ? '✓' : ''}
                                </span>
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* Quick Context Tip */}
            {!compact && !isCancelled && !isRejected && (
                <div className="mt-2 pt-2 border-t border-slate-200/60 dark:border-slate-800/80 flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400">
                    <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3 text-role" />
                        <span>Current Phase: <strong>{activeStage?.description}</strong></span>
                    </span>
                    <span className="text-[10px] font-semibold text-slate-400">
                        {isCompleted ? 'Stage 10 of 10 (Completed)' : `Stage ${currentIndex + 1} of 10`}
                    </span>
                </div>
            )}
        </div>
    );
};

export default AdoptionStageStepper;
