import { getStageIndex, ADOPTION_STAGES, getConsolidatedStageIndex } from '../components/AdoptionStageStepper';

export { getConsolidatedStageIndex };

export type ConsolidatedStageId = 'Apply' | 'Assess' | 'Review' | 'Approve' | 'Handover' | 'Monitor';

export const CONSOLIDATED_STAGE_FILTERS: Array<{ id: string; label: string; name: ConsolidatedStageId | 'All' }> = [
    { id: 'All', label: 'All Stages', name: 'All' },
    { id: 'Apply', label: '1. Apply', name: 'Apply' },
    { id: 'Assess', label: '2. Assess', name: 'Assess' },
    { id: 'Review', label: '3. Review', name: 'Review' },
    { id: 'Approve', label: '4. Approve', name: 'Approve' },
    { id: 'Handover', label: '5. Handover', name: 'Handover' },
    { id: 'Monitor', label: '6. Monitor', name: 'Monitor' },
];

export interface SubtaskStatusInfo {
    id: string;
    title: string;
    stageId: ConsolidatedStageId;
    status: 'completed' | 'in_progress' | 'scheduled' | 'pending' | 'failed';
    statusLabel: string;
    detail?: string;
    actionableStageModal?: string;
}

export function getConsolidatedStage(stageName?: string | null): ConsolidatedStageId {
    if (!stageName) return 'Apply';
    const clean = stageName.trim().toLowerCase().replace(/[\s_-]/g, '');
    if (clean === 'apply' || clean === 'application' || clean === 'applied') {
        return 'Apply';
    }
    if (clean === 'assess' || clean === 'verification' || clean === 'verify' || clean === 'interview' || clean === 'homevisit') {
        return 'Assess';
    }
    if (clean === 'review' || clean === 'consolidatedreview') {
        return 'Review';
    }
    if (clean === 'approve' || clean === 'approval' || clean === 'certificate' || clean === 'cert' || clean === 'payment') {
        return 'Approve';
    }
    if (clean === 'handover') {
        return 'Handover';
    }
    if (clean === 'monitor' || clean === 'monitoring' || clean === 'successful' || clean === 'successfuladoption' || clean === 'completed' || clean === 'caseclosed') {
        return 'Monitor';
    }
    return 'Apply';
}

export function getConsolidatedStageLabel(stageName?: string | null): string {
    const cs = getConsolidatedStage(stageName);
    switch (cs) {
        case 'Apply': return '1. Apply';
        case 'Assess': return '2. Assess';
        case 'Review': return '3. Review';
        case 'Approve': return '4. Approve';
        case 'Handover': return '5. Handover';
        case 'Monitor': return '6. Monitor';
        default: return '1. Apply';
    }
}

export function getActiveSubtaskName(stageName?: string | null): string {
    if (!stageName) return 'Application Submission';
    const clean = stageName.trim().toLowerCase().replace(/[\s_-]/g, '');
    if (clean === 'verification' || clean === 'verify') return 'Applicant & ID Verification';
    if (clean === 'interview') return 'Interview Assessment Session';
    if (clean === 'homevisit') return 'Home Visit Living Space Inspection';
    if (clean === 'review' || clean === 'consolidatedreview') return 'Consolidated Dossier Review';
    if (clean === 'approval' || clean === 'approve') return 'Head Officer Approval Decision';
    if (clean === 'certificate' || clean === 'cert' || clean === 'payment') return 'Adoption Certificate & Digital Agreement';
    if (clean === 'handover') return 'Animal Handover & Transfer Record';
    if (clean === 'monitoring' || clean === 'monitor') return '30-Day Welfare Check-ins';
    if (clean === 'successful' || clean === 'successfuladoption' || clean === 'completed' || clean === 'caseclosed') return 'Case Closed & Completed';
    return 'Application Submission';
}

/**
 * Returns the full list of procedures / subtasks and their real-time completion status
 * for an individual adoption application.
 */
export function getApplicationSubtaskStatuses(app: any): SubtaskStatusInfo[] {
    const stage = app.current_stage || 'Application';
    const isCompleted = app.post_monitoring_status === 'Completed' || stage === 'Successful_Adoption' || stage === 'Completed' || stage === 'Successful' || app.application_stage_status === 'Case_Closed';

    const stageOrder = ['Application', 'Verification', 'Interview', 'Home_Visit', 'Review', 'Approval', 'Certificate', 'Handover', 'Monitoring', 'Successful_Adoption'];
    const currentOrderIdx = stageOrder.indexOf(stage);

    // 1. Apply: Submission
    const applyStatus: SubtaskStatusInfo = {
        id: 'application_submission',
        title: 'Application Submission',
        stageId: 'Apply',
        status: 'completed',
        statusLabel: 'Submitted',
        detail: app.created_at ? new Date(app.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : undefined,
    };

    // 2. Assess: Verification
    const isVerified = Boolean(app.id_verified || app.verification_status === 'Verified' || currentOrderIdx >= 2 || (app.status === 'Approved' && currentOrderIdx >= 1));
    const isVerificationFailed = app.verification_status === 'Failed';
    const verificationStatus: SubtaskStatusInfo = {
        id: 'verification',
        title: 'Applicant & ID Verification',
        stageId: 'Assess',
        status: isVerified ? 'completed' : isVerificationFailed ? 'failed' : (stage === 'Verification' || (stage === 'Application' && app.status === 'Pending')) ? 'in_progress' : 'pending',
        statusLabel: isVerified ? 'Verified' : isVerificationFailed ? 'Failed' : (stage === 'Verification') ? 'In Progress' : 'Pending',
        detail: isVerified ? (app.id_type || 'ID Verified') : undefined,
        actionableStageModal: 'verify',
    };

    // 2. Assess: Interview
    const isInterviewDone = Boolean(app.interview_result === 'Successful' || currentOrderIdx >= 3);
    const isInterviewFailed = app.interview_result === 'Unsuccessful';
    const isInterviewScheduled = Boolean(app.interview_scheduled_at && !isInterviewDone && !isInterviewFailed);
    const interviewStatus: SubtaskStatusInfo = {
        id: 'interview',
        title: 'Interview Assessment',
        stageId: 'Assess',
        status: isInterviewDone ? 'completed' : isInterviewFailed ? 'failed' : isInterviewScheduled ? 'scheduled' : stage === 'Interview' ? 'in_progress' : 'pending',
        statusLabel: isInterviewDone ? 'Passed' : isInterviewFailed ? 'Unsuccessful' : isInterviewScheduled ? 'Scheduled' : stage === 'Interview' ? 'Ready to Schedule' : 'Pending',
        detail: app.interview_scheduled_at ? new Date(app.interview_scheduled_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : undefined,
        actionableStageModal: isInterviewScheduled ? 'interview_eval' : 'interview_schedule',
    };

    // 2. Assess: Home Visit
    const isHomeVisitDone = Boolean(
        app.home_visit_result === 'Suitable' ||
        app.home_visit_result === 'Suitable with Conditions' ||
        app.home_visit_result === 'Passed' ||
        currentOrderIdx >= 4
    );
    const isHomeVisitFailed = app.home_visit_result === 'Not Suitable';
    const isHomeVisitScheduled = Boolean(app.home_visit_scheduled_date && !isHomeVisitDone && !isHomeVisitFailed);
    const homeVisitStatus: SubtaskStatusInfo = {
        id: 'home_visit',
        title: 'Home Visit Inspection',
        stageId: 'Assess',
        status: isHomeVisitDone ? 'completed' : isHomeVisitFailed ? 'failed' : isHomeVisitScheduled ? 'scheduled' : stage === 'Home_Visit' ? 'in_progress' : 'pending',
        statusLabel: isHomeVisitDone ? (app.home_visit_result || 'Passed') : isHomeVisitFailed ? 'Not Suitable' : isHomeVisitScheduled ? 'Scheduled' : stage === 'Home_Visit' ? 'Ready to Schedule' : 'Pending',
        detail: app.home_visit_scheduled_date ? new Date(app.home_visit_scheduled_date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : undefined,
        actionableStageModal: isHomeVisitScheduled ? 'home_visit_eval' : 'home_visit_schedule',
    };

    // 3. Review: Dossier Review
    const isReviewDone = Boolean(currentOrderIdx >= 5 || (app.status === 'Approved' && currentOrderIdx >= 5));
    const isReviewActive = stage === 'Review' || stage === 'Consolidated_Review';
    const reviewStatus: SubtaskStatusInfo = {
        id: 'dossier_review',
        title: 'Consolidated Dossier Review',
        stageId: 'Review',
        status: isReviewDone ? 'completed' : isReviewActive ? 'in_progress' : 'pending',
        statusLabel: isReviewDone ? 'Review Completed' : isReviewActive ? 'Under Review' : 'Pending',
        actionableStageModal: 'review',
    };

    // 4. Approve: Approval Decision
    const isApproved = Boolean(app.approval_date || currentOrderIdx >= 6 || (app.status === 'Approved' && currentOrderIdx >= 5));
    const isApprovalActive = stage === 'Approval';
    const approvalDecisionStatus: SubtaskStatusInfo = {
        id: 'approval_decision',
        title: 'Head Officer Approval Decision',
        stageId: 'Approve',
        status: isApproved ? 'completed' : isApprovalActive ? 'in_progress' : 'pending',
        statusLabel: isApproved ? 'Approved' : isApprovalActive ? 'Awaiting Approval' : 'Pending',
        detail: app.approval_date ? new Date(app.approval_date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : undefined,
    };

    // 4. Approve: Certificate
    const isCertReady = Boolean(app.certificate_number || currentOrderIdx >= 7);
    const isAgreementSigned = Boolean(app.agreement_signed_at || currentOrderIdx >= 7);
    const isCertStage = stage === 'Certificate' || stage === 'Payment';
    const certificateStatus: SubtaskStatusInfo = {
        id: 'certificate_issuance',
        title: 'Adoption Certificate & Digital Agreement',
        stageId: 'Approve',
        status: (isCertReady && isAgreementSigned) ? 'completed' : isCertStage ? 'in_progress' : 'pending',
        statusLabel: (isCertReady && isAgreementSigned) ? 'Issued & Signed' : isCertStage ? (app.certificate_number ? 'Agreement Pending' : 'Certificate Ready') : 'Pending',
        detail: app.certificate_number ? `Cert #${app.certificate_number}` : undefined,
    };

    // 5. Handover: Handover Record
    const isHandoverDone = Boolean((app.staff_handed_over && app.is_handed_over) || currentOrderIdx >= 8 || isCompleted);
    const isHandoverScheduled = Boolean(app.handover_scheduled_date || app.handover_status === 'Scheduled');
    const isHandoverStage = stage === 'Handover';
    const handoverStatus: SubtaskStatusInfo = {
        id: 'handover_records',
        title: 'Animal Handover & Transfer Record',
        stageId: 'Handover',
        status: isHandoverDone ? 'completed' : isHandoverScheduled ? 'scheduled' : isHandoverStage ? 'in_progress' : 'pending',
        statusLabel: isHandoverDone ? 'Released & Confirmed' : isHandoverScheduled ? 'Scheduled' : isHandoverStage ? 'Ready for Handover' : 'Pending',
        detail: app.handover_scheduled_date ? new Date(app.handover_scheduled_date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : undefined,
        actionableStageModal: isHandoverScheduled ? undefined : 'handover_schedule',
    };

    // 6. Monitor: Welfare Monitoring
    const isMonitoringDone = Boolean(isCompleted || app.post_monitoring_status === 'Completed');
    const isMonitoringActive = stage === 'Monitoring';
    const welfareMonitoringStatus: SubtaskStatusInfo = {
        id: 'welfare_monitoring',
        title: 'Post-Adoption Welfare Monitoring (30 Days)',
        stageId: 'Monitor',
        status: isMonitoringDone ? 'completed' : isMonitoringActive ? 'in_progress' : 'pending',
        statusLabel: isMonitoringDone ? 'Completed' : isMonitoringActive ? 'Active (Day 7, 14, 30)' : 'Pending',
    };

    // 6. Monitor: Case Closure
    const caseClosureStatus: SubtaskStatusInfo = {
        id: 'case_closure',
        title: 'Successful Case Closure',
        stageId: 'Monitor',
        status: isCompleted ? 'completed' : 'pending',
        statusLabel: isCompleted ? 'Case Closed (Successful)' : 'Pending Monitoring',
    };

    return [
        applyStatus,
        verificationStatus,
        interviewStatus,
        homeVisitStatus,
        reviewStatus,
        approvalDecisionStatus,
        certificateStatus,
        handoverStatus,
        welfareMonitoringStatus,
        caseClosureStatus,
    ];
}

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
    stageIndex: number; // 0 to 9 (legacy)
    stageLabel: string;
    consolidatedStageIndex: number; // 0 to 5
    consolidatedStageName: ConsolidatedStageId;
    consolidatedStageLabel: string; // '1. Apply', '2. Assess', etc.
    activeSubtask: string;
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

    const consolidatedStageIndex = getConsolidatedStageIndex(stage);
    const consolidatedStageName = getConsolidatedStage(stage);
    const consolidatedStageLabel = getConsolidatedStageLabel(stage);
    const activeSubtask = getActiveSubtaskName(stage);

    const isCompletedMonitoring = app.post_monitoring_status === 'Completed';

    // 1. CANCELLED
    if (status === 'Cancelled') {
        return {
            label: 'Cancelled',
            subLabel: 'Adoption request cancelled',
            badgeClasses: 'bg-gray-100 text-gray-700 border-gray-300 dark:bg-gray-800 dark:text-gray-300 dark:border-gray-700',
            stageIndex: stageIdx,
            stageLabel: 'Cancelled',
            consolidatedStageIndex,
            consolidatedStageName,
            consolidatedStageLabel,
            activeSubtask: 'Cancelled',
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
            consolidatedStageIndex,
            consolidatedStageName,
            consolidatedStageLabel,
            activeSubtask: 'Rejected',
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
                consolidatedStageIndex: 1,
                consolidatedStageName: 'Assess',
                consolidatedStageLabel: '2. Assess',
                activeSubtask: 'Applicant & ID Verification',
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
            consolidatedStageIndex: 0,
            consolidatedStageName: 'Apply',
            consolidatedStageLabel: '1. Apply',
            activeSubtask: 'Application Submission',
            isOfficiallyAdopted: false,
            isAwaitingHandover: false,
            isAwaitingAdopterConfirm: false,
            isAwaitingStaffConfirm: false,
            canSignAgreement: false,
            canCancel: true,
        };
    }

    // 4. APPROVED - Lifecycle stages
    // Stage 10: Successful Adoption (Final)
    if (stage === 'Successful_Adoption' || stage === 'Completed' || stage === 'Successful' || isCompletedMonitoring || stageStatus === 'Case_Closed') {
        return {
            label: 'Adoption Successful',
            subLabel: 'Adoption process completed & case closed',
            badgeClasses: 'bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-800 shadow-2xs',
            stageIndex: 9,
            stageLabel: '10. Successful Adoption',
            consolidatedStageIndex: 5,
            consolidatedStageName: 'Monitor',
            consolidatedStageLabel: '6. Monitor',
            activeSubtask: 'Case Closed & Completed',
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
            consolidatedStageIndex: 5,
            consolidatedStageName: 'Monitor',
            consolidatedStageLabel: '6. Monitor',
            activeSubtask: '30-Day Welfare Check-ins',
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
                consolidatedStageIndex: 4,
                consolidatedStageName: 'Handover',
                consolidatedStageLabel: '5. Handover',
                activeSubtask: 'Animal Handover & Transfer Record',
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
                consolidatedStageIndex: 4,
                consolidatedStageName: 'Handover',
                consolidatedStageLabel: '5. Handover',
                activeSubtask: 'Animal Handover & Transfer Record',
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
                consolidatedStageIndex: 4,
                consolidatedStageName: 'Handover',
                consolidatedStageLabel: '5. Handover',
                activeSubtask: 'Animal Handover & Transfer Record',
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
            consolidatedStageIndex: 4,
            consolidatedStageName: 'Handover',
            consolidatedStageLabel: '5. Handover',
            activeSubtask: 'Animal Handover & Transfer Record',
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
            consolidatedStageIndex: 3,
            consolidatedStageName: 'Approve',
            consolidatedStageLabel: '4. Approve',
            activeSubtask: 'Adoption Certificate & Digital Agreement',
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
            consolidatedStageIndex: 3,
            consolidatedStageName: 'Approve',
            consolidatedStageLabel: '4. Approve',
            activeSubtask: 'Head Officer Approval Decision',
            isOfficiallyAdopted: false,
            isAwaitingHandover: false,
            isAwaitingAdopterConfirm: false,
            isAwaitingStaffConfirm: false,
            canSignAgreement: false,
            canCancel: true,
        };
    }

    // Stage 5: Review
    if (stage === 'Review' || stage === 'Consolidated_Review') {
        return {
            label: 'Dossier Under Review',
            subLabel: 'Consolidated evaluation review',
            badgeClasses: 'bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-950/40 dark:text-indigo-300 dark:border-indigo-800',
            stageIndex: 4,
            stageLabel: '5. Review',
            consolidatedStageIndex: 2,
            consolidatedStageName: 'Review',
            consolidatedStageLabel: '3. Review',
            activeSubtask: 'Consolidated Dossier Review',
            isOfficiallyAdopted: false,
            isAwaitingHandover: false,
            isAwaitingAdopterConfirm: false,
            isAwaitingStaffConfirm: false,
            canSignAgreement: false,
            canCancel: true,
        };
    }

    // Stage 4: Home Visit
    if (stage === 'Home_Visit' || stage === 'Home Visit') {
        const isScheduled = stageStatus === 'Home_Visit_Scheduled' || Boolean(app.home_visit_scheduled_date);
        return {
            label: isScheduled ? 'Home Visit Scheduled' : 'Home Visit Stage',
            subLabel: 'Living space & fence inspection',
            badgeClasses: 'bg-teal-50 text-teal-700 border-teal-200 dark:bg-teal-950/40 dark:text-teal-300 dark:border-teal-800',
            stageIndex: 3,
            stageLabel: '4. Home Visit',
            consolidatedStageIndex: 1,
            consolidatedStageName: 'Assess',
            consolidatedStageLabel: '2. Assess',
            activeSubtask: 'Home Visit Living Space Inspection',
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
            consolidatedStageIndex: 1,
            consolidatedStageName: 'Assess',
            consolidatedStageLabel: '2. Assess',
            activeSubtask: 'Interview Assessment Session',
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
        consolidatedStageIndex,
        consolidatedStageName,
        consolidatedStageLabel,
        activeSubtask,
        isOfficiallyAdopted: false,
        isAwaitingHandover: false,
        isAwaitingAdopterConfirm: false,
        isAwaitingStaffConfirm: false,
        canSignAgreement: false,
        canCancel: true,
    };
}
