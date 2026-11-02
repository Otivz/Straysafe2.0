import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveNotificationDestination } from '../src/utils/notificationNavigation.ts';

test('Report status update redirects to exact report', async () => {
    const notif = {
        notification_id: 267,
        type: 'status_update',
        related_id: 11,
        title: 'Report Update: Under Observation',
        message: 'Your report #11 status has been updated to Under Observation'
    };
    const res = await resolveNotificationDestination(notif);
    assert.equal(res.action, 'navigate');
    assert.equal(res.path, '/resident/reports/11');
});

test('Lost pet alert resolves alert_id to exact lost pet report_id', async () => {
    const notif = {
        notification_id: 232,
        type: 'lost_pet_alert',
        related_id: 1,
        title: 'Missing pet: mochi - have you seen it?',
        message: 'mochi was last seen near Near Nemesia Street'
    };
    const mockApiClient = {
        get: async (url) => {
            if (url === '/lost-pet-alerts/1') {
                return { data: { alert_id: 1, report_id: 13 } };
            }
            throw new Error('Not found');
        }
    };
    const res = await resolveNotificationDestination(notif, mockApiClient);
    assert.equal(res.action, 'navigate');
    assert.equal(res.path, '/resident/reports/13');
});

test('Lost pet sighting resolves alert_id to exact report_id', async () => {
    const notif = {
        notification_id: 239,
        type: 'lost_pet_sighting',
        related_id: 1,
        title: 'New Lost Pet Sighting!',
        message: 'A resident reported seeing mochi in Selera Homes'
    };
    const mockApiClient = {
        get: async (url) => {
            if (url === '/lost-pet-alerts/1') {
                return { data: { alert_id: 1, report_id: 13 } };
            }
            throw new Error('Not found');
        }
    };
    const res = await resolveNotificationDestination(notif, mockApiClient);
    assert.equal(res.action, 'navigate');
    assert.equal(res.path, '/resident/reports/13');
});

test('Match inquiry notification opens match review with chat', async () => {
    const notif = {
        notification_id: 228,
        type: 'match_message',
        related_id: 11,
        title: 'Match Inquiry: Jordy',
        message: 'Hello Sie Jacinto! STRAY-SAFE AI detected a match'
    };
    const res = await resolveNotificationDestination(notif);
    assert.equal(res.action, 'navigate');
    assert.equal(res.path, '/resident/reports/11/match-review?openChat=true');
    assert.equal(res.state?.openChat, true);
});

test('Potential match notification opens match review page', async () => {
    const notif = {
        notification_id: 191,
        type: 'potential_match',
        related_id: 12,
        title: 'Look-Alike Pet Sighting Detected (Report #12)',
        message: 'AI identified a 100% look-alike match for your registered pet'
    };
    const res = await resolveNotificationDestination(notif);
    assert.equal(res.action, 'navigate');
    assert.equal(res.path, '/resident/reports/12/match-review');
});

test('Owner-first pet match confirmation redirects to My Pets confirmation', async () => {
    const notif = {
        notification_id: 99,
        type: 'pet_match_confirmation',
        related_id: 5,
        title: 'Is this the animal you registered as your pet?',
        message: 'Staff submitted a confirmation request'
    };
    const res = await resolveNotificationDestination(notif);
    assert.equal(res.action, 'navigate');
    assert.equal(res.path, '/resident/pets?confirm=5');
});

test('Claim notification redirects to exact report information', async () => {
    const notif = {
        notification_id: 272,
        type: 'claim',
        related_id: 11,
        title: 'Claiming Charges Assessed',
        message: 'The Barangay assessed your claim'
    };
    const res = await resolveNotificationDestination(notif);
    assert.equal(res.action, 'navigate');
    assert.equal(res.path, '/resident/reports/11');
});

test('General notification with no report opens modal details', async () => {
    const notif = {
        notification_id: 50,
        type: 'general_notice',
        related_id: null,
        title: 'Community Guidelines Updated',
        message: 'Please review the updated pet registration guidelines'
    };
    const res = await resolveNotificationDestination(notif);
    assert.equal(res.action, 'modal');
    assert.equal(res.notification.notification_id, 50);
});
