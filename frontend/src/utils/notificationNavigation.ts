/**
 * Dynamic Notification Routing for StraySafe Residents.
 *
 * Rules:
 * 1. Report-related notifications (stray report updates, claims, visibility decisions, report messages)
 *    redirect to the exact Report Information page (/resident/reports/:id).
 * 2. Lost pet alerts & sightings resolve their alert ID to the corresponding Lost Pet Report (/resident/reports/:id).
 * 3. Pet matching and match inquiries redirect to the match review details (/resident/reports/:id/match-review).
 * 4. General / non-report notifications open their respective Information or Details modal/page.
 */

export interface NotificationRouteResult {
    action: 'navigate' | 'chat' | 'warning' | 'modal';
    path?: string;
    state?: any;
    report?: any;
    notification?: any;
}

export async function resolveNotificationDestination(
    notif: any,
    apiClient?: any,
    cachedReports: any[] = []
): Promise<NotificationRouteResult> {
    if (!notif) {
        return { action: 'modal', notification: null };
    }

    const typeStr = (notif.type || '').toLowerCase();
    const titleStr = (notif.title || '').toLowerCase();
    const msgStr = (notif.message || '').toLowerCase();

    // Extract explicit "Report #(\d+)" from title or message
    const idMatch =
        (notif.title || '').match(/Report\s*#(\d+)/i) ||
        (notif.message || '').match(/Report\s*#(\d+)/i);
    const extractedReportId = idMatch ? Number(idMatch[1]) : null;

    // 1. Status update on a report -> ALWAYS navigate to report details
    if (typeStr === 'status_update' && (extractedReportId || notif.related_id)) {
        return { action: 'navigate', path: `/resident/reports/${extractedReportId || notif.related_id}` };
    }

    // 2. Observation notices (follow-up reminders, updates received, extended, resolved) -> Observation Updates
    if (
        typeStr.startsWith('followup') ||
        titleStr.includes('observation notice') ||
        titleStr.includes('observation case') ||
        titleStr.includes('observation period')
    ) {
        return { action: 'navigate', path: `/resident/observations` };
    }

    // 2. Adoption notifications (holding animal available again, application updates, adoption chat)
    if (typeStr === 'adoption_available_again' && notif.related_id) {
        return { action: 'navigate', path: `/adopt/apply/${notif.related_id}` };
    }
    if (typeStr.startsWith('adoption') && notif.related_id) {
        return {
            action: 'navigate',
            path: `/adopt/applications?adoption=${notif.related_id}${typeStr === 'adoption_chat' ? '&chat=1' : ''}`,
        };
    }

    // 3. Lost pet notifications (neighborhood alerts, resident sightings, missing pet notices)
    const isLostPet =
        typeStr === 'lost_pet_alert' ||
        typeStr === 'lost_pet_sighting' ||
        titleStr.includes('lost pet') ||
        titleStr.includes('missing pet') ||
        msgStr.includes('open the alert and tap report a sighting');

    if (isLostPet) {
        let reportId = extractedReportId;
        if (!reportId && notif.related_id) {
            if (apiClient) {
                try {
                    const res = await apiClient.get(`/lost-pet-alerts/${notif.related_id}`);
                    if (res?.data?.report_id) {
                        reportId = Number(res.data.report_id);
                    }
                } catch {
                    reportId = Number(notif.related_id);
                }
            } else {
                reportId = Number(notif.related_id);
            }
        }
        if (reportId) {
            return { action: 'navigate', path: `/resident/reports/${reportId}` };
        }
    }

    // 4. Pet matching notifications (potential look-alike match, match inquiry message, match review)
    const isMatchInquiry =
        typeStr === 'match_message' ||
        titleStr.includes('match inquiry') ||
        (titleStr.includes('💬') && (titleStr.includes('look-alike') || msgStr.includes('look-alike')));

    const isMatch =
        typeStr === 'potential_match' ||
        typeStr === 'match_review' ||
        titleStr.includes('look-alike pet sighting') ||
        titleStr.includes('look-alike match') ||
        titleStr.includes('please confirm: is this') ||
        titleStr.includes('sighting linked to') ||
        msgStr.includes('look-alike match for your registered pet') ||
        msgStr.includes('sighting linked to');

    let matchReportId = extractedReportId || (notif.related_id ? Number(notif.related_id) : null);
    if ((isMatchInquiry || isMatch) && matchReportId) {
        return {
            action: 'navigate',
            path: isMatchInquiry
                ? `/resident/reports/${matchReportId}/match-review?openChat=true`
                : `/resident/reports/${matchReportId}/match-review`,
            state: { openChat: isMatchInquiry, highlightMatch: true },
        };
    }

    // 5. Staff ask "Is this your pet?" (owner-first match confirmation request)
    if (
        typeStr === 'pet_match_confirmation' ||
        typeStr === 'pet_match_confirmation_result' ||
        titleStr.includes('is this the animal you registered')
    ) {
        return {
            action: 'navigate',
            path: notif.related_id ? `/resident/pets?confirm=${notif.related_id}` : '/resident/pets',
        };
    }

    // 6. Registered pet ownership confirmation
    if (typeStr === 'pet_owner_confirmation') {
        return { action: 'navigate', path: '/resident/pets' };
    }

    // 7. Report-related notifications (status update, report visibility, claim, messages)
    let generalReportId = extractedReportId || (notif.related_id ? Number(notif.related_id) : null);

    const isMessageOrComment =
        typeStr === 'message' ||
        typeStr.includes('message') ||
        titleStr.includes('message') ||
        typeStr.includes('comment') ||
        titleStr.includes('comment') ||
        typeStr.includes('chat') ||
        titleStr.includes('chat') ||
        titleStr.includes('💬');

    if (isMessageOrComment && generalReportId) {
        const cached = cachedReports.find((r: any) => r.report_id === Number(generalReportId));
        if (cached) {
            return { action: 'chat', report: cached };
        }
        return {
            action: 'navigate',
            path: `/resident/reports/${generalReportId}?openChat=true`,
            state: { openChat: true },
        };
    }

    if ((typeStr === 'reunion_photo_requested' || titleStr.includes('reunion photo')) && generalReportId) {
        return {
            action: 'navigate',
            path: `/resident/reports/${generalReportId}?openReunited=true`,
            state: { openReunited: true },
        };
    }

    const isReportEvent =
        typeStr === 'status_update' ||
        typeStr === 'report_status' ||
        typeStr === 'report_visibility' ||
        typeStr === 'claim' ||
        typeStr.includes('report') ||
        titleStr.includes('report') ||
        titleStr.includes('claim') ||
        titleStr.includes('visibility');

    if (isReportEvent && generalReportId) {
        return { action: 'navigate', path: `/resident/reports/${generalReportId}` };
    }

    // 8. Warning citation notices
    if (typeStr === 'warning' || titleStr.includes('citation')) {
        return { action: 'warning' };
    }

    // 9. QR Tag scan history & pet found notices
    if (
        typeStr === 'alert' ||
        typeStr === 'qr_recovery_request' ||
        titleStr.includes('scan') ||
        titleStr.includes('pet found')
    ) {
        return {
            action: 'navigate',
            path: notif.related_id ? `/resident/pet/${notif.related_id}/scan-history` : '/resident/pets',
        };
    }

    // 10. Fallback: if any report ID was extracted from the title/message/related_id
    if (generalReportId) {
        return { action: 'navigate', path: `/resident/reports/${generalReportId}` };
    }

    // 11. General notifications not related to reports -> Open Notification Details Modal
    return { action: 'modal', notification: notif };
}
