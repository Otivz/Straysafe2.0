/**
 * What each change the Admin screens make (an AdminAction, data/actions.ts) does on the real backend: one or two requests,
 * in the order the server's rules need. The server is the authority: it checks who may act on the case, what the case may
 * become, and refuses what it must; this file only translates, and a refusal reaches the screen as the server's own sentence.
 *
 * Nothing is applied optimistically. The provider re-reads what an action touched, so the screen shows what the server holds.
 */
import { AdminApiError, errorMessage } from '../../preview/lib/errors';
import { toServer } from '../../live/dates';
import { reportIdOf } from '../../live/refs';
import type { AdminAction } from '../data/actions';
import type { Assessment, Case, CategoryId, ContactMethod, IdentityReview, Notice, OwnershipReview, Resident, Settings } from '../data/types';
import { adminApi, type ApiCaseSettings } from './api';
import { caseSettingsTo, notificationFlagsFrom, noticeRef, orgTypeOf } from './adapters';

/** What an action needs to know about the screen's current data. Read at the moment the action runs. */
export interface ActionContext {
  userId: number;
  subdivisionId: number;
  caseOf(id: string): Case | undefined;
  noticeOf(id: string): Notice | undefined;
  settings(): Settings;
  /** The case settings as the server last sent them (the follow-up bounds the screen does not edit). */
  storedSettings(): ApiCaseSettings | null;
  residents(): Resident[];
}

/** What to read again afterwards. The provider does it; a failure there never turns a saved change into an error. */
export interface ActionResult {
  cases: string[];
  notices?: boolean;
  settings?: boolean;
  notifications?: boolean;
  profile?: boolean;
  /** Things that did not go as hoped although the change itself was saved (for example a photo that would not upload). */
  warnings?: string[];
}

const done = (r: Partial<ActionResult> = {}): ActionResult => ({ cases: [], ...r });
const fail = (message: string, status = 409): never => { throw new AdminApiError('server', message, status); };

function reportId(ref: string): number {
  const id = reportIdOf(ref);
  return id ?? fail('That case could not be found.', 404);
}
const numeric = (value: string, what: string): number => {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : fail(`That ${what} could not be found.`, 404);
};

/** How the referral screen says it reached the organisation -> the contact method the server stores. */
const CHANNEL_METHOD: Record<string, ContactMethod> = { 'phone call': 'phone', message: 'message', 'in person': 'in_person', email: 'message', 'written letter': 'letter' };
export const methodOfChannel = (channel: string): ContactMethod => CHANNEL_METHOD[channel.trim().toLowerCase()] ?? 'phone';

/** The violation an owner warning names. The server offers a fixed list; nuisance and safety concerns are the only ones eligible. */
export const violationFor = (category: CategoryId): string => (category === 'nuisance' || category === 'safety' ? 'Nuisance / Aggressive Behavior' : 'Other');

const sameJson = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

function assessmentBody(c: Case | undefined, a: Omit<Assessment, 'savedAt' | 'savedBy'>, identity: IdentityReview, ownership: OwnershipReview): Record<string, unknown> {
  const body: Record<string, unknown> = {};
  const cur = c?.assessment;
  // Only the parts that changed are sent, so saving one section never re-validates or re-stamps another.
  if (!cur || !sameJson({ ...a }, { incident: cur.incident, incidentBasis: cur.incidentBasis, evidenceSufficiency: cur.evidenceSufficiency, evidenceReviewed: cur.evidenceReviewed, urgency: cur.urgency, urgencyNote: cur.urgencyNote, notes: cur.notes })) {
    Object.assign(body, {
      incident: a.incident, incident_basis: a.incidentBasis, evidence_sufficiency: a.evidenceSufficiency, evidence_reviewed: a.evidenceReviewed,
      urgency: a.urgency, urgency_note: a.urgencyNote, notes: a.notes,
    });
  }
  if (!c || c.identity.status !== identity.status || c.identity.note !== identity.note) body.identity = { status: identity.status, note: identity.note || null };
  if (!c || !sameJson(c.ownership, ownership)) {
    body.ownership = {
      status: ownership.status, owner_user_id: ownership.ownerResidentId ? numeric(ownership.ownerResidentId, 'resident') : null,
      evidence: ownership.evidence, note: ownership.note || null,
    };
  }
  return body;
}

export async function runAction(a: AdminAction, ctx: ActionContext): Promise<ActionResult> {
  switch (a.type) {
    // ----------------------------------------------------------------------------------------------- the case
    case 'case/changeStatus': await adminApi.move(reportId(a.id), a.to, a.note); return done({ cases: [a.id] });
    case 'case/changePriority': await adminApi.priority(reportId(a.id), a.to, a.reason); return done({ cases: [a.id] });
    case 'case/addNote': await adminApi.addNote(reportId(a.id), a.text); return done({ cases: [a.id] });

    case 'case/saveAssessment': {
      const rid = reportId(a.id);
      const body = assessmentBody(ctx.caseOf(a.id), a.assessment, a.identity, a.ownership);
      // Marking the urgency "immediate" makes the case Urgent on the server by itself (alsoSetUrgent needs no second request).
      if (Object.keys(body).length > 0) await adminApi.assessment(rid, body);
      return done({ cases: [a.id] });
    }

    case 'case/recordFollowUp':
      await adminApi.createFollowUp(reportId(a.id), { kind: a.kind, title: a.title, notes: a.notes ?? null, due_at: a.doneNow ? null : toServer(a.dueAt), done_now: a.doneNow });
      return done({ cases: [a.id] });
    case 'case/completeFollowUp': await adminApi.completeFollowUp(reportId(a.id), numeric(a.followUpId, 'follow-up'), a.note); return done({ cases: [a.id] });
    case 'case/cancelFollowUp': await adminApi.cancelFollowUp(reportId(a.id), numeric(a.followUpId, 'follow-up'), 'Cancelled by the case officer.'); return done({ cases: [a.id] });

    case 'case/recordOwnerContact':
      await adminApi.addContact(reportId(a.id), { method: a.method, with_whom: a.withWhom, summary: a.summary, outcome: a.outcome, contact_at: toServer(a.at), next_step_at: toServer(a.nextStepAt) });
      return done({ cases: [a.id] });

    case 'case/issueWarning': {
      const rid = reportId(a.id);
      const c = ctx.caseOf(a.id);
      const owner = c?.ownership.ownerResidentId ? numeric(c.ownership.ownerResidentId, 'owner') : fail('A warning needs a confirmed owner. Complete the ownership review first.');
      const violation = violationFor(c?.category ?? 'other');
      // The tier (Notice, 1st / 2nd Warning, Final Notice) follows this pet's and incident's history, which only the server holds.
      const tier = await adminApi.warningSuggestion({ violation_type: violation, report_id: rid, owner_id: owner, policy_id: a.policyId });
      await adminApi.issueWarning({ user_id: owner, report_id: rid, warning_level: tier.suggested_tier, violation_type: violation, description: a.details, fine_amount: 0, policy_id: a.policyId });
      return done({ cases: [a.id] });
    }
    case 'case/recordCompliance':
      await adminApi.recordCompliance(reportId(a.id), numeric(a.warningId, 'warning'), { result: a.result, notes: a.notes, observed_at: toServer(a.observedAt), conclude: a.conclude });
      return done({ cases: [a.id] });

    case 'case/createReferral':
      await adminApi.createReferral(reportId(a.id), {
        org_type: orgTypeOf(a.orgId), org_name: a.orgName, reason: a.reason, contact_method: methodOfChannel(a.contactChannel),
        contact_person: a.contactPerson === 'Not recorded' ? null : a.contactPerson, contact_detail: a.contactChannel, referred_at: toServer(a.referredAt), notes: a.notes || null,
      });
      return done({ cases: [a.id] });
    case 'case/updateReferral':
      await adminApi.updateReferral(reportId(a.id), numeric(a.referralId, 'referral'), {
        status: a.status, note: a.note, external_outcome: a.externalOutcome || null, remaining_follow_up: a.remainingFollowUp || null, follow_up_at: toServer(a.followUpAt),
      });
      return done({ cases: [a.id] });

    case 'case/reviewClaim': await adminApi.reviewClaim(reportId(a.id), numeric(a.claimId, 'claim'), a.decision, a.note); return done({ cases: [a.id] });

    case 'case/linkCases':
      await adminApi.link(reportId(a.id), { report_ids: a.otherIds.map(reportId), link_type: 'related' });
      return done({ cases: [a.id, ...a.otherIds] });
    case 'case/unlinkCase': {
      const rid = reportId(a.id);
      const other = reportId(a.otherId);
      const detail = await adminApi.caseDetail(rid);                  // the link's id is the server's; read it fresh
      const link = detail.links.find((l) => l.report_id === other) ?? fail('That link no longer exists.', 404);
      await adminApi.unlink(rid, link.link_id, 'Unlinked by the case officer.');
      return done({ cases: [a.id, a.otherId] });
    }

    case 'case/close':
      await adminApi.close(reportId(a.id), { disposition: a.disposition, reason: a.reason, end_open_items: a.endOpenItems, post_closure_check_at: toServer(a.followUpCheckAt) });
      return done({ cases: [a.id], notices: true });
    case 'case/reopen': await adminApi.reopen(reportId(a.id), a.reason); return done({ cases: [a.id] });

    // --------------------------------------------------------------------------------------------------- notices
    case 'notice/save': return saveNotice(a.notice, a.publish, ctx);
    case 'notice/archive': {
      const ref = noticeRef(a.id) ?? fail('That notice could not be found.', 404);
      if (ref.kind === 'alert') await adminApi.closeAlert(ref.id, 'other', a.reason);
      else await adminApi.setAnnouncementStatus(ref.id, 'Archived');
      const caseId = ctx.noticeOf(a.id)?.caseId;
      return done({ notices: true, cases: caseId ? [caseId] : [] });
    }
    case 'notice/delete': {
      const ref = noticeRef(a.id);
      if (!ref) return done();                                        // never saved: nothing on the server to remove
      // A neighbourhood notice is part of its case's record and is never deleted: discarding a draft closes it.
      if (ref.kind === 'announcement') await adminApi.deleteAnnouncement(ref.id);
      else await adminApi.closeAlert(ref.id, 'declined', 'Draft discarded by the case officer.');
      return done({ notices: true });
    }

    // ---------------------------------------------------------------------------------------- notifications etc.
    case 'notification/read': await adminApi.markRead(numeric(a.id, 'notification')); return done({ notifications: true });
    case 'notification/readAll': await adminApi.markAllRead(ctx.userId); return done({ notifications: true });

    case 'resident/setStatus':
      return fail('Only the system administrator can suspend or reactivate an account. Ask them to make this change.', 403);

    case 'settings/set': {
      const stored = ctx.storedSettings() ?? fail('The settings have not loaded yet. Reload the page and try again.');
      const current = ctx.settings();
      if (!sameJson(caseSettingsTo(a.settings, stored), caseSettingsTo(current, stored))) await adminApi.saveSettings(ctx.subdivisionId, caseSettingsTo(a.settings, stored));
      if (!sameJson(a.settings.notifications, current.notifications)) await adminApi.savePreferences(notificationFlagsFrom(a.settings.notifications));
      return done({ settings: true });
    }
    case 'admin/updateProfile': {
      const patch: Record<string, unknown> = {};
      if (a.patch.name !== undefined) patch.name = a.patch.name;
      if (a.patch.email !== undefined) patch.email = a.patch.email;
      if (a.patch.phone !== undefined) patch.phone = a.patch.phone;       // the position title is given by the administrator, not edited here
      await adminApi.updateUser(ctx.userId, patch);
      return done({ profile: true });
    }
    default: return done();
  }
}

async function saveNotice(n: Notice, publish: boolean, ctx: ActionContext): Promise<ActionResult> {
  const ref = noticeRef(n.id);

  if (n.type === 'safety_advisory') {
    const body = {
      created_by: ctx.userId, title: n.title.trim(), content: n.description.trim(), category: 'Animal Advisory', visibility: 'Subdivision Only', pinned: false,
      subdivision_id: ctx.subdivisionId, status: publish || n.status === 'published' ? 'Published' : 'Draft',
    };
    const saved = ref?.kind === 'announcement' ? await adminApi.updateAnnouncement(ref.id, body) : await adminApi.createAnnouncement(body);
    // The advisory is saved. A photo that will not upload must not make the save look failed (a second save would post it twice),
    // so it is reported beside the result instead.
    const warnings: string[] = [];
    for (const m of n.media) {
      if (!m.file) continue;
      try { await adminApi.uploadAnnouncementMedia(saved.announcement_id, m.file); } catch (err) { warnings.push(`The photo “${m.name}” could not be added: ${errorMessage(err)}`); }
    }
    return done({ notices: true, warnings });
  }

  // A lost-pet alert or a found-animal notice is about a case: the server keeps one per report.
  const rid = n.caseId ? reportId(n.caseId) : fail('Choose the case this notice is about. A lost-pet or found-animal notice is always attached to a case.', 422);
  const details = { leader_message: n.description.trim() || null, last_seen_location: n.location.trim() || null };
  let alertId = ref?.kind === 'alert' ? ref.id : null;
  if (alertId === null) {
    const created = await adminApi.requestAlert(rid, { alert_type: n.type, last_seen_location: n.location.trim() || null, contact_preference: 'app_message' });
    alertId = created.alert_id;
  }
  if (publish) await adminApi.activateAlert(alertId, details);
  else await adminApi.updateAlert(alertId, details);
  return done({ notices: true, cases: n.caseId ? [n.caseId] : [] });
}
