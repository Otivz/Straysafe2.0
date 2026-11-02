import React from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import CaseSummaryPanel from '../../src/components/History/CaseSummaryPanel';
import type { CaseSummaryReport } from '../../src/utils/caseSummary';
import '../../src/index.css';

// Report 1 as recorded in Phase 0 (times as the API sends them: history and warnings in database local time,
// the observation in UTC): resolved, verified through a status change (verification fields empty, F17),
// an observation the owner complied with, one warning, and its pet Baron
const report1: CaseSummaryReport = {
    report_id: 1, current_status_id: 11, created_at: '2026-11-02T19:11:24',
    animal_type: 'Dog', animal_breed: 'Aspin', ai_possible_breed: 'Aspin', animal_color: 'Tan and White',
    ai_coat_pattern: 'Bicolor', estimated_size: 'Medium', condition: 'Healthy', animal_count: 1,
    priority_level: 'Medium', ai_suggested_priority: 'Medium Priority',
    ai_suggested_priority_reason: 'The stray dog is causing a nuisance by scattering trash.',
    verified_by_name: null, verified_at: null, verification_notes: null,
    verified_actual_bite: false, verified_chasing: false, verified_attempted_bite: false, verified_injury: false, verified_aggressive: false,
    observation: { open: false, status: 'complied', due_at: '2026-11-05T11:16:56+00:00', extended: false, ended_at: '2026-11-02T11:22:00+00:00', outcome: 'the owner complied',
        started_at: '2026-11-02T11:16:56+00:00', extension_days: null, extension_reason: null, closed_by_name: 'Leader Santos' },
    issued_warnings: [{ warning_level: 'Notice', violation_type: 'Free-Roaming Unleashed', status: 'Issued', issued_at: '2026-11-02T19:16:30', issuer_name: 'Leader Santos' }],
    latest_warning: { warning_level: 'Notice', violation_type: 'Free-Roaming Unleashed', status: 'Issued', issued_at: '2026-11-02T19:16:30', issuer_name: 'Leader Santos' },
    pet_name: 'Baron', case_pet_name: 'Baron', matched_pet_record: { pet_name: 'Baron', breed: 'Aspin', owner_name: 'Emmanuel Vito Cruz' },
    owner_return: null, disputes: [], merged_reports: [],
    visibility: 'Private', visible_to_residents: false, ai_photo_status: 'Likely Authentic', ai_photo_likelihood: 0.08,
    ai_photo_recommendation: 'Photo appears authentic.', comments: [], comments_open: false,
    history: [
        { report_status_id: 1, created_at: '2026-11-02T19:11:24', updater_name: 'Resident One' },
        { report_status_id: 2, created_at: '2026-11-02T19:11:51', updater_name: 'Leader Santos', remarks: 'Checked on site.' },
        { report_status_id: null, created_at: '2026-11-02T19:16:15', updater_name: 'Leader Santos', remarks: 'Note' },
        { report_status_id: 2, created_at: '2026-11-02T19:16:56', updater_name: 'Leader Santos' },
        { report_status_id: 7, created_at: '2026-11-02T19:16:56', updater_name: 'Leader Santos' },
        { report_status_id: 7, created_at: '2026-11-02T19:21:59', updater_name: 'Leader Santos' },
        { report_status_id: 11, created_at: '2026-11-02T19:21:59', updater_name: 'Leader Santos', remarks: 'The owner complied.' },
    ],
};

// Verified with the verification fields filled; AI disagrees on breed and colour; two animals
const verified: CaseSummaryReport = {
    report_id: 2, current_status_id: 4, created_at: '2026-11-01T08:00:00',
    animal_type: 'Dog', animal_breed: 'Aspin', ai_possible_breed: 'Labrador Mix', animal_color: 'Black',
    ai_dominant_color: 'Dark Brown', estimated_size: 'Large', condition: 'Injured', animal_count: 2, priority_level: 'High',
    verified_by_name: 'Leader Reyes', verified_at: '2026-11-01T08:45:00', verification_notes: 'Two dogs near the gate, one limping.',
    history: [
        { report_status_id: 1, created_at: '2026-11-01T08:00:00' },
        { report_status_id: 2, created_at: '2026-11-01T08:45:00', updater_name: 'Leader Reyes' },
        { report_status_id: 4, created_at: '2026-11-01T09:00:00', updater_name: 'Leader Reyes' },
    ],
};

// False alarm: the reason comes from the report
const falseAlarm: CaseSummaryReport = {
    report_id: 3, current_status_id: 14, created_at: '2026-10-30T14:00:00', animal_type: 'Cat', ai_animal_type: 'Cat',
    false_alarm_reason: 'The animal is a neighbour’s pet inside its yard.',
    visibility: 'Public', visible_to_residents: false, public_block_reason: 'Closed as a false alarm.',
    history: [
        { report_status_id: 1, created_at: '2026-10-30T14:00:00' },
        { report_status_id: 14, created_at: '2026-10-30T15:00:00', updater_name: 'Leader Cruz', remarks: 'Dismissed' },
    ],
};

// Open, nothing recorded yet: empty sections stay hidden, verification says none was recorded
const open: CaseSummaryReport = { report_id: 4, current_status_id: 1, created_at: '2026-11-02T12:00:00', animal_type: 'Unknown', history: [] };

// Phase 3 events: bite and chasing found, an open extended observation, two warnings, a confirmed pet returned to its
// owner, two disputes, merged reports, split into animal records. Contact details are present to prove they stay hidden.
const events: CaseSummaryReport = {
    report_id: 5, current_status_id: 9, created_at: '2026-10-20T07:00:00', animal_type: 'Dog', split_children_count: 2,
    verified_actual_bite: true, verified_chasing: true, verified_attempted_bite: false,
    behavior_finding: 'Bit a jogger on the leg; chases bicycles.',
    observation: { open: true, status: 'observing', started_at: '2026-10-19T23:00:00+00:00', due_at: '2026-10-24T23:00:00+00:00', extended: true, ended_at: null, outcome: null,
        extension_days: 2, extension_reason: 'Owner is building a fence.', closed_by_name: 'Should not show while open' },
    issued_warnings: [
        { warning_level: 'Final Warning', violation_type: 'Biting Incident', status: 'Acknowledged', issued_at: '2026-10-22T09:00:00', issuer_name: 'Leader Reyes' },
        { warning_level: 'Notice', violation_type: 'Free-Roaming Unleashed', status: 'Issued', issued_at: '2026-10-21T09:00:00', issuer_name: 'Leader Reyes' },
    ],
    latest_warning: { warning_level: 'Final Warning', violation_type: 'Biting Incident', status: 'Acknowledged', issued_at: '2026-10-22T09:00:00', issuer_name: 'Leader Reyes' },
    pet_name: 'Choco', matched_pet_record: { pet_name: 'Choco', breed: 'Shih Tzu Mix', owner_name: 'Maria Lopez', photo_url: 'https://res.cloudinary.com/demo/image/upload/v1/pets/choco.jpg' },
    review_status: 'Confirmed Match', reviewed_by_name: 'Staff Dela Cruz', reviewed_by_role: 'Barangay Staff', reviewed_at: '2026-10-23T10:00:00',
    owner_return: { owner_name: 'Maria Lopez', returned_at: '2026-10-24T15:30:00', return_method: 'in_person', owner_phone: '09171234567', owner_address: '12 Mabini St' } as CaseSummaryReport['owner_return'],
    reunion_confirmed_by: 'owner',
    disputes: [
        { dispute_id: 31, resident_name: 'Pedro Santos', dispute_reason: 'This is my dog, not Choco.', status: 'Rejected', created_at: '2026-10-23T12:00:00', resolved_at: '2026-10-24T09:00:00', reviewer_name: 'Staff Dela Cruz', reviewer_notes: 'Vaccination card does not match.', pet_name: 'Brownie' },
        { dispute_id: 32, resident_name: 'Ana Reyes', dispute_reason: 'Wrong location recorded.', status: 'Pending', created_at: '2026-10-24T08:00:00' },
    ],
    merged_reports: [{ report_id: 6, landmark: 'Phase 2 Park' }, { report_id: 7, landmark: null }],
    visibility: 'Public', visible_to_residents: true, visibility_decided_by_name: 'Leader Reyes',
    visibility_decided_at: '2026-10-20T08:30:00', visibility_reason: 'Neighbours should watch for this dog.',
    ai_photo_status: 'Uncertain', ai_photo_likelihood: 0.42, ai_photo_recommendation: 'Please verify the authenticity of the uploaded photo.',
    ai_photo_details: '{"raw": "json is skipped"}', comments_open: true,
    comments: [
        { comment_id: 12, comment: 'Thanks, the fence is fixed now.', user_name: 'Maria Lopez', created_at: '2026-10-21T09:00:00', parent_comment_id: 11 },
        { comment_id: 11, comment: 'Please keep Choco inside.', user_name: 'Leader Reyes', created_at: '2026-10-20T09:00:00' },
        { comment_id: 14, comment: 'Saw it again near the park.', user_name: 'Resident Two', created_at: '2026-10-22T07:00:00' },
        { comment_id: 13, comment: 'Noted, thank you.', user_name: 'Leader Reyes', created_at: '2026-10-21T10:00:00', parent_comment_id: 12 },
        { comment_id: 15, comment: '   ', user_name: 'Blank', created_at: '2026-10-22T08:00:00' },
    ],
    history: [{ report_status_id: 9, created_at: '2026-10-24T15:30:00', updater_name: 'Staff Dela Cruz' }],
};

// A duplicate merged into report 5, and an animal record split from it
const mergedChild: CaseSummaryReport = {
    report_id: 6, current_status_id: 18, created_at: '2026-10-20T08:00:00', animal_type: 'Dog',
    duplicate_of_report_id: 5, merged_by_name: 'Leader Reyes', merged_at: '2026-10-20T10:00:00', merge_notes: 'Same dog, same street.',
    split_from_report_id: 4,
};

const cases = { report1, verified, falseAlarm, open, events, mergedChild };

createRoot(document.getElementById('fixture')!).render(
    <MemoryRouter>
        <div className="p-4 space-y-6 max-w-4xl mx-auto">
            {Object.entries(cases).map(([name, report]) => (
                <div key={name} data-case={name}><CaseSummaryPanel report={report} reportHref={(id) => `/subd/history/${id}`} /></div>
            ))}
        </div>
    </MemoryRouter>
);
