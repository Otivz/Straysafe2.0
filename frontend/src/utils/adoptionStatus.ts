import { getStageIndex, ADOPTION_STAGES } from '../components/AdoptionStageStepper';

export interface AdoptionAppSummary {
    adoption_id: number;
    status: 'Pending' | 'Approved' | 'Rejected' | 'Cancelled';
    current_stage?: string;
    application_stage_status?: string;
    staff_handed_over?: boolean;
    is_handed_over?: boolean;
    agreement_signed_at?: string | null;
    post_monitoring_status?: string;
    interview_scheduled_at?: string | null;
    home_visit_scheduled_date?: string | null;
}

export interface AdoptionStatusDisplay {
    label: string;
    subLabel?: string;
    badgeClasses: string;
    stageIndex: number; // 0 to 8
    stageLabel: string;
    isOfficiallyAdopted: boolean;
    isAwaitingHandover: boolean;
    isAwaitingAdopterConfirm: boolean;
    isAwaitingStaffConfirm: boolean;
    canSignAgreement: boolean;
    canCancel: boolean;
}

/**
 * Single source of truth helper for deriving consistent display status
 * across both Resident and Barangay interfaces from the database adoption record.
 */
export function getUnifiedAdoptionStatus(app: AdoptionAppSummary): AdoptionStatusDisplay {
    const status = app.status || 'Pending';
    const stage = app.current_stage || 'Application';
    const stageStatus = app.application_stage_status || 'Submitted';
    const stageIdx = getStageIndex(stage);
    const stageInfo = ADOPTION_STAGES[stageIdx] || ADOPTION_STAGES[0];

    const isCompletedMonitoring = app.post_monitoring_status === 'Completed';

    // 1. CANCELLED
    if (status === 'Cancelled') {
        return {
            label: 'Cancelled',
            subLabel: 'Adoption request cancelled',
            badgeClasses: 'bg-gray-100 text-gray-700 border-gray-300 dark:bg-gray-800 dark:text-gray-300 dark:border-gray-700',
            stageIndex: stageIdx,
            stageLabel: 'Cancelled',
            isOfficiallyAdopted: false,
            isAwaitingHandover: false,
            isAwaitingAdopterConfirm: false,
            isAwaitingStaffConfirm: false,
            canSignAgreement: false,
            canCancel: false,
        };
    }

    // 2. REJECTED
    if (status === 'Rejected') {
        return {
            label: 'Not Approved',
            subLabel: 'Application not approved',
            badgeClasses: 'bg-red-50 text-red-700 border-red-200 dark:bg-red-950/40 dark:text-red-300 dark:border-red-900/60',
            stageIndex: stageIdx,
            stageLabel: 'Rejected',
            isOfficiallyAdopted: false,
            isAwaitingHandover: false,
            isAwaitingAdopterConfirm: false,
            isAwaitingStaffConfirm: false,
            canSignAgreement: false,
            canCancel: false,
        };
    }

    // 3. PENDING (Stage 1 or Stage 2 prior to approval)
    if (status === 'Pending') {
        if (stage === 'Verification' || stageStatus === 'Pending_Documents') {
            return {
                label: 'Pending Verification',
                subLabel: 'Identity & documents review',
                badgeClasses: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800',
                stageIndex: 1,
                stageLabel: '2. Verification',
                isOfficiallyAdopted: false,
                isAwaitingHandover: false,
                isAwaitingAdopterConfirm: false,
                isAwaitingStaffConfirm: false,
                canSignAgreement: false,
                canCancel: true,
            };
        }

        return {
            label: 'Pending Review',
            subLabel: 'Under Barangay staff assessment',
            badgeClasses: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800',
            stageIndex: 0,
            stageLabel: '1. Application',
            isOfficiallyAdopted: false,
            isAwaitingHandover: false,
            isAwaitingAdopterConfirm: false,
            isAwaitingStaffConfirm: false,
            canSignAgreement: false,
            canCancel: true,
        };
    }

    // 4. APPROVED - Lifecycle stages 3 through 10
    // Stage 10: Successful Adoption (Final)
    if (stage === 'Successful_Adoption' || stage === 'Completed' || stage === 'Successful' || isCompletedMonitoring || stageStatus === 'Case_Closed') {
        return {
            label: 'Adoption Successful',
            subLabel: 'Adoption process completed & case closed',
            badgeClasses: 'bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-800 shadow-2xs',
            stageIndex: 9,
            stageLabel: '10. Successful Adoption',
            isOfficiallyAdopted: true,
            isAwaitingHandover: false,
            isAwaitingAdopterConfirm: false,
            isAwaitingStaffConfirm: false,
            canSignAgreement: false,
            canCancel: false,
        };
    }

    // Stage 9: Monitoring
    if (stage === 'Monitoring') {
        return {
            label: 'Post-Adoption Welfare Monitoring',
            subLabel: '30-Day welfare monitoring active',
            badgeClasses: 'bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-950/60 dark:text-indigo-300 dark:border-indigo-800 shadow-2xs',
            stageIndex: 8,
            stageLabel: '9. Monitoring',
            isOfficiallyAdopted: true,
            isAwaitingHandover: false,
            isAwaitingAdopterConfirm: false,
            isAwaitingStaffConfirm: false,
            canSignAgreement: false,
            canCancel: false,
        };
    }

    // Stage 8: Handover
    if (stage === 'Handover') {
        if (app.staff_handed_over && app.is_handed_over) {
            return {
                label: 'Handover Completed',
                subLabel: 'Ready to proceed to welfare monitoring',
                badgeClasses: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800',
                stageIndex: 7,
                stageLabel: '8. Handover',
                isOfficiallyAdopted: true,
                isAwaitingHandover: false,
                isAwaitingAdopterConfirm: false,
                isAwaitingStaffConfirm: false,
                canSignAgreement: false,
                canCancel: false,
            };
        }

        if (app.staff_handed_over && !app.is_handed_over) {
            return {
                label: 'Awaiting Adopter Confirmation',
                subLabel: 'Staff confirmed. Confirm receipt to complete.',
                badgeClasses: 'bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-950/40 dark:text-orange-300 dark:border-orange-800',
                stageIndex: 7,
                stageLabel: '8. Handover',
                isOfficiallyAdopted: false,
                isAwaitingHandover: true,
                isAwaitingAdopterConfirm: true,
                isAwaitingStaffConfirm: false,
                canSignAgreement: false,
                canCancel: true,
            };
        }

        if (!app.staff_handed_over && app.is_handed_over) {
            return {
                label: 'Awaiting Staff Handover',
                subLabel: 'Adopter confirmed receipt. Awaiting staff release.',
                badgeClasses: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800',
                stageIndex: 7,
                stageLabel: '8. Handover',
                isOfficiallyAdopted: false,
                isAwaitingHandover: true,
                isAwaitingAdopterConfirm: false,
                isAwaitingStaffConfirm: true,
                canSignAgreement: false,
                canCancel: true,
            };
        }

        return {
            label: 'Approved (Awaiting Handover)',
            subLabel: 'Ready for physical claiming at facility',
            badgeClasses: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800',
            stageIndex: 7,
            stageLabel: '8. Handover',
            isOfficiallyAdopted: false,
            isAwaitingHandover: true,
            isAwaitingAdopterConfirm: false,
            isAwaitingStaffConfirm: false,
            canSignAgreement: false,
            canCancel: true,
        };
    }

    // Stage 7: Certificate & Digital Agreement
    if (stage === 'Certificate') {
        const isSigned = Boolean(app.agreement_signed_at);
        return {
            label: isSigned ? 'Agreement Signed' : 'Approved (Sign Agreement)',
            subLabel: isSigned ? 'Certificate generated' : 'Deed of commitment ready for signature',
            badgeClasses: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800',
            stageIndex: 6,
            stageLabel: '7. Certificate',
            isOfficiallyAdopted: false,
            isAwaitingHandover: false,
            isAwaitingAdopterConfirm: false,
            isAwaitingStaffConfirm: false,
            canSignAgreement: !isSigned,
            canCancel: true,
        };
    }

    // Stage 6: Official Approval
    if (stage === 'Approval') {
        return {
            label: 'Under Final Approval',
            subLabel: 'Barangay Head Officer review',
            badgeClasses: 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-800',
            stageIndex: 5,
            stageLabel: '6. Approval',
            isOfficiallyAdopted: false,
            isAwaitingHandover: false,
            isAwaitingAdopterConfirm: false,
            isAwaitingStaffConfirm: false,
            canSignAgreement: false,
            canCancel: true,
        };
    }

    // Stage 5: Review
    if (stage === 'Review') {
        return {
            label: 'Dossier Under Review',
            subLabel: 'Consolidated evaluation review',
            badgeClasses: 'bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-950/40 dark:text-indigo-300 dark:border-indigo-800',
            stageIndex: 4,
            stageLabel: '5. Review',
            isOfficiallyAdopted: false,
            isAwaitingHandover: false,
            isAwaitingAdopterConfirm: false,
            isAwaitingStaffConfirm: false,
            canSignAgreement: false,
            canCancel: true,
        };
    }

    // Stage 4: Home Visit
    if (stage === 'Home_Visit') {
        const isScheduled = stageStatus === 'Home_Visit_Scheduled' || Boolean(app.home_visit_scheduled_date);
        return {
            label: isScheduled ? 'Home Visit Scheduled' : 'Home Visit Stage',
            subLabel: 'Living space & fence inspection',
            badgeClasses: 'bg-teal-50 text-teal-700 border-teal-200 dark:bg-teal-950/40 dark:text-teal-300 dark:border-teal-800',
            stageIndex: 3,
            stageLabel: '4. Home Visit',
            isOfficiallyAdopted: false,
            isAwaitingHandover: false,
            isAwaitingAdopterConfirm: false,
            isAwaitingStaffConfirm: false,
            canSignAgreement: false,
            canCancel: true,
        };
    }

    // Stage 3: Interview
    if (stage === 'Interview') {
        const isScheduled = stageStatus === 'Interview_Scheduled' || Boolean(app.interview_scheduled_at);
        return {
            label: isScheduled ? 'Interview Scheduled' : 'Interview Stage',
            subLabel: 'Pet care knowledge & readiness session',
            badgeClasses: 'bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-950/40 dark:text-purple-300 dark:border-purple-800',
            stageIndex: 2,
            stageLabel: '3. Interview',
            isOfficiallyAdopted: false,
            isAwaitingHandover: false,
            isAwaitingAdopterConfirm: false,
            isAwaitingStaffConfirm: false,
            canSignAgreement: false,
            canCancel: true,
        };
    }

    // Fallback Approved in initial stage
    return {
        label: 'Approved (In Progress)',
        subLabel: `${stageInfo.shortLabel} stage`,
        badgeClasses: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800',
        stageIndex: stageIdx,
        stageLabel: stageInfo.label,
        isOfficiallyAdopted: false,
        isAwaitingHandover: false,
        isAwaitingAdopterConfirm: false,
        isAwaitingStaffConfirm: false,
        canSignAgreement: false,
        canCancel: true,
    };
}
