/**
 * All preview mutations as one pure reducer. Components never edit records directly; they dispatch an action.
 * When the UI is connected to the API, each action maps to one request and this reducer becomes the optimistic /
 * cache update. IDs come from a counter in state and timestamps arrive on the action, so the reducer stays pure.
 */
import { COMPLIANCE_RESULTS, DISPOSITIONS, FOLLOWUP_KINDS, OWNERSHIP, PRIORITIES, REFERRAL_STATUS, STATUSES } from './constants';
import type {
  AdminProfile, AdminState, Assessment, Case, CaseStatus, ClaimStatus, ComplianceResult, ContactMethod, DispositionId, EventKind,
  FollowUp, FollowUpKind, IdentityReview, Notice, OwnerContact, OwnershipReview, Priority, ReferralStatus, Resident, Settings, WarningDelivery,
} from './types';

export type AdminAction =
  | { type: 'case/changeStatus'; id: string; to: CaseStatus; note?: string }
  | { type: 'case/changePriority'; id: string; to: Priority; reason: string }
  | { type: 'case/addNote'; id: string; text: string }
  | { type: 'case/saveAssessment'; id: string; assessment: Omit<Assessment, 'savedAt' | 'savedBy'>; identity: IdentityReview; ownership: OwnershipReview; alsoSetUrgent: boolean }
  | { type: 'case/recordFollowUp'; id: string; kind: FollowUpKind; title: string; notes?: string; dueAt: string | null; doneNow: boolean }
  | { type: 'case/completeFollowUp'; id: string; followUpId: string; note?: string }
  | { type: 'case/cancelFollowUp'; id: string; followUpId: string }
  | { type: 'case/recordOwnerContact'; id: string; at: string; method: ContactMethod; withWhom: string; summary: string; outcome: OwnerContact['outcome']; nextStepAt: string | null }
  | { type: 'case/issueWarning'; id: string; policyId: string; details: string; delivery: WarningDelivery; observationDays: number | null; observationStart: string | null; followUpAt: string | null }
  | { type: 'case/recordCompliance'; id: string; warningId: string; observedAt: string; result: ComplianceResult; notes: string; conclude: 'compliant' | 'non_compliant' | null }
  | { type: 'case/createReferral'; id: string; orgId: string; orgName: string; reason: string; referredAt: string; contactPerson: string; contactChannel: string; notes: string }
  | { type: 'case/updateReferral'; id: string; referralId: string; status: ReferralStatus; note: string; externalOutcome?: string; remainingFollowUp?: string; followUpAt?: string | null }
  | { type: 'case/reviewClaim'; id: string; claimId: string; decision: ClaimStatus; note: string }
  | { type: 'case/linkCases'; id: string; otherIds: string[] }
  | { type: 'case/unlinkCase'; id: string; otherId: string }
  | { type: 'case/close'; id: string; disposition: DispositionId; reason: string; followUpCheckAt: string | null; endOpenItems: boolean }
  | { type: 'case/reopen'; id: string; reason: string }
  | { type: 'notice/save'; notice: Notice; publish: boolean }
  | { type: 'notice/archive'; id: string; reason: string }
  | { type: 'notice/delete'; id: string }
  | { type: 'notification/read'; id: string }
  | { type: 'notification/readAll' }
  | { type: 'resident/setStatus'; id: string; status: Resident['status'] }
  | { type: 'settings/set'; settings: Settings }
  | { type: 'admin/updateProfile'; patch: Partial<Pick<AdminProfile, 'name' | 'title' | 'email' | 'phone'>> }
  | { type: 'preview/replace'; state: AdminState };

export type Stamped = AdminAction & { now: string; actor: string };

type Gen = (prefix: string) => string;
type Meta = { now: string; actor: string };

const rank = (s: CaseStatus) => STATUSES[s].rank;
const clip = (s: string, n = 140) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

function addEvent(c: Case, gen: Gen, m: Meta, kind: EventKind, title: string, detail?: string, actor = m.actor): Case {
  return { ...c, updatedAt: m.now, timeline: [{ id: gen('ev'), at: m.now, actor, kind, title, detail: detail || undefined }, ...c.timeline] };
}

/** Recording work on a case moves it forward (never backward, never out of Closed). */
function advance(c: Case, gen: Gen, m: Meta, min: CaseStatus, why: string): Case {
  if (c.status === 'closed' || rank(c.status) >= rank(min)) return c;
  return addEvent({ ...c, status: min }, gen, m, 'status', `Status changed to ${STATUSES[min].label}`, why);
}

export function reducer(state: AdminState, a: Stamped): AdminState {
  const m: Meta = { now: a.now, actor: a.actor };

  /** Applies `fn` to one case and keeps the id counter that `fn` advanced. */
  const edit = (id: string, fn: (c: Case, gen: Gen) => Case): AdminState => {
    let seq = state.seq;
    const gen: Gen = (p) => `${p}-${++seq}`;
    const cases = state.cases.map((c) => (c.id === id ? fn(c, gen) : c));
    return { ...state, cases, seq };
  };

  switch (a.type) {
    case 'preview/replace':
      return a.state;

    case 'case/changeStatus':
      return edit(a.id, (c, g) => addEvent({ ...c, status: a.to }, g, m, 'status', `Status changed to ${STATUSES[a.to].label}`, a.note));

    case 'case/changePriority':
      return edit(a.id, (c, g) => addEvent({ ...c, priority: a.to }, g, m, 'priority', `Priority changed from ${PRIORITIES[c.priority].label} to ${PRIORITIES[a.to].label}`, a.reason));

    case 'case/addNote':
      return edit(a.id, (c, g) => addEvent({ ...c, notes: [{ id: g('n'), at: m.now, by: m.actor, text: a.text }, ...c.notes] }, g, m, 'note', 'Internal note added', clip(a.text)));

    case 'case/saveAssessment':
      return edit(a.id, (c, g) => {
        let next: Case = { ...c, assessment: { ...a.assessment, savedAt: m.now, savedBy: m.actor }, identity: a.identity, ownership: a.ownership };
        next = addEvent(next, g, m, 'assessment', 'Assessment recorded');
        if (a.identity.status !== c.identity.status) next = addEvent(next, g, m, 'identity', `Animal identity: ${a.identity.status === 'identified' ? 'confirmed' : a.identity.status === 'possible_match' ? 'possible match' : 'not identified'}`, clip(a.identity.note));
        if (a.ownership.status !== c.ownership.status) next = addEvent(next, g, m, 'ownership', `Ownership marked ${OWNERSHIP[a.ownership.status].label}`, clip(a.ownership.note));
        if (a.alsoSetUrgent && c.priority !== 'urgent') next = addEvent({ ...next, priority: 'urgent' }, g, m, 'priority', `Priority changed from ${PRIORITIES[c.priority].label} to Urgent`, 'Urgency assessment: immediate risk.');
        return advance(next, g, m, 'under_review', 'Assessment started');
      });

    case 'case/recordFollowUp':
      return edit(a.id, (c, g) => {
        const f: FollowUp = { id: g('fu'), kind: a.kind, title: a.title, notes: a.notes, dueAt: a.doneNow ? null : a.dueAt, status: a.doneNow ? 'done' : 'pending', createdAt: m.now, createdBy: m.actor, ...(a.doneNow ? { completedAt: m.now, completionNote: a.notes } : {}) };
        const next = addEvent({ ...c, followUps: [f, ...c.followUps] }, g, m, 'follow_up', a.doneNow ? `${FOLLOWUP_KINDS[a.kind]} recorded: ${a.title}` : `${FOLLOWUP_KINDS[a.kind]} scheduled: ${a.title}`, a.notes);
        return advance(next, g, m, 'under_review', 'Follow-up recorded');
      });

    case 'case/completeFollowUp':
      return edit(a.id, (c, g) => {
        const f = c.followUps.find((x) => x.id === a.followUpId);
        if (!f) return c;
        const next = { ...c, followUps: c.followUps.map((x) => (x.id === a.followUpId ? { ...x, status: 'done' as const, completedAt: m.now, completionNote: a.note } : x)) };
        return addEvent(next, g, m, 'follow_up', `Follow-up completed: ${f.title}`, a.note);
      });

    case 'case/cancelFollowUp':
      return edit(a.id, (c, g) => {
        const f = c.followUps.find((x) => x.id === a.followUpId);
        if (!f) return c;
        return addEvent({ ...c, followUps: c.followUps.map((x) => (x.id === a.followUpId ? { ...x, status: 'cancelled' as const } : x)) }, g, m, 'follow_up', `Follow-up cancelled: ${f.title}`);
      });

    case 'case/recordOwnerContact':
      return edit(a.id, (c, g) => {
        const contact: OwnerContact = { id: g('oc'), at: a.at, by: m.actor, method: a.method, withWhom: a.withWhom, summary: a.summary, outcome: a.outcome };
        let next: Case = { ...c, ownerContacts: [contact, ...c.ownerContacts] };
        next = addEvent(next, g, m, 'owner_contact', 'Owner coordination recorded', `${a.withWhom} · ${a.outcome === 'denied_ownership' ? 'Denies ownership' : a.outcome === 'cooperative' ? 'Cooperative' : a.outcome === 'no_response' ? 'No response' : 'Other'}`);
        // A denial is recorded as a dispute of ownership. It does not close the case and is not read as dishonesty.
        if (a.outcome === 'denied_ownership' && c.ownership.status !== 'confirmed' && c.ownership.status !== 'disputed') {
          next = addEvent({ ...next, ownership: { ...next.ownership, status: 'disputed', note: next.ownership.note || 'The person approached denies ownership. Statement recorded.' } }, g, m, 'ownership', 'Ownership marked Disputed', 'Denial recorded. The case stays open.');
        }
        if (a.nextStepAt) next = { ...next, followUps: [{ id: g('fu'), kind: 'follow_up', title: `Follow up with ${a.withWhom.replace(/ \(.*/, '')}`, dueAt: a.nextStepAt, status: 'pending', createdAt: m.now, createdBy: m.actor }, ...next.followUps] };
        return advance(next, g, m, 'under_review', 'Owner coordination recorded');
      });

    case 'case/issueWarning':
      return edit(a.id, (c, g) => {
        const policy = state.settings.policies.find((p) => p.id === a.policyId);
        const owner = state.residents.find((r) => r.id === c.ownership.ownerResidentId);
        if (!policy || policy.status !== 'confirmed') return c;
        const end = a.observationDays && a.observationStart ? new Date(new Date(a.observationStart).getTime() + a.observationDays * 86_400_000).toISOString() : null;
        const w = {
          id: g('war'), ownerResidentId: owner?.id ?? null, ownerName: owner?.name ?? 'Owner', policyId: policy.id, policyTitle: policy.title, policyRef: policy.reference,
          details: a.details, delivery: a.delivery, issuedAt: m.now, issuedBy: m.actor, observationDays: a.observationDays, observationStart: a.observationStart, observationEnd: end,
          followUpAt: a.followUpAt, status: 'active' as const, observations: [],
        };
        let next: Case = { ...c, warnings: [w, ...c.warnings] };
        if (a.followUpAt) next = { ...next, followUps: [{ id: g('fu'), kind: 'warning_end', title: end ? 'End of observation: record the outcome' : 'Follow up on the warning', notes: `Under ${policy.reference}.`, dueAt: a.followUpAt, status: 'pending', createdAt: m.now, createdBy: m.actor }, ...next.followUps] };
        next = addEvent(next, g, m, 'warning', `Warning issued under ${policy.reference}`, a.observationDays ? `Observation period: ${a.observationDays} ${a.observationDays === 1 ? 'day' : 'days'}.` : 'No observation period defined by the policy.');
        return advance(next, g, m, 'in_progress', 'Warning issued');
      });

    case 'case/recordCompliance':
      return edit(a.id, (c, g) => {
        const w = c.warnings.find((x) => x.id === a.warningId);
        if (!w) return c;
        const obs = { id: g('obs'), at: a.observedAt, by: m.actor, result: a.result, notes: a.notes };
        const warnings = c.warnings.map((x) => (x.id !== a.warningId ? x : {
          ...x, observations: [obs, ...x.observations].sort((p, q) => q.at.localeCompare(p.at)),
          ...(a.conclude ? { status: 'concluded' as const, outcome: a.conclude, outcomeNote: a.notes, concludedAt: m.now } : {}),
        }));
        let next: Case = { ...c, warnings };
        if (a.conclude) next = { ...next, followUps: next.followUps.map((f) => (f.kind === 'warning_end' && f.status === 'pending' ? { ...f, status: 'done' as const, completedAt: m.now, completionNote: 'Observation concluded.' } : f)) };
        next = addEvent(next, g, m, 'compliance', `Compliance observation: ${COMPLIANCE_RESULTS[a.result].label.toLowerCase()}`, clip(a.notes));
        if (a.conclude) next = addEvent(next, g, m, 'compliance', `Observation concluded: ${a.conclude === 'compliant' ? 'compliant' : 'not compliant'}`, a.conclude === 'non_compliant' ? 'Follow the confirmed escalation procedure. No fine is assessed by the subdivision.' : undefined);
        return next;
      });

    case 'case/createReferral':
      return edit(a.id, (c, g) => {
        const r = {
          id: g('ref'), orgId: a.orgId, orgName: a.orgName, reason: a.reason, referredAt: a.referredAt, contactPerson: a.contactPerson, contactChannel: a.contactChannel,
          status: 'sent' as const, notes: a.notes ? [{ id: g('rn'), at: a.referredAt, by: m.actor, text: a.notes }] : [], createdBy: m.actor, updatedAt: m.now,
        };
        const next = addEvent({ ...c, referrals: [r, ...c.referrals] }, g, m, 'referral', `Referred to ${a.orgName}`, clip(a.reason));
        return advance(next, g, m, 'in_progress', 'Referral sent');
      });

    case 'case/updateReferral':
      return edit(a.id, (c, g) => {
        const r = c.referrals.find((x) => x.id === a.referralId);
        if (!r) return c;
        const referrals = c.referrals.map((x) => (x.id !== a.referralId ? x : {
          ...x, status: a.status, updatedAt: m.now, notes: [{ id: g('rn'), at: m.now, by: m.actor, text: a.note, status: a.status }, ...x.notes],
          ...(a.externalOutcome !== undefined ? { externalOutcome: a.externalOutcome } : {}),
          ...(a.remainingFollowUp !== undefined ? { remainingFollowUp: a.remainingFollowUp } : {}),
          ...(a.followUpAt !== undefined ? { followUpAt: a.followUpAt } : {}),
        }));
        let next: Case = { ...c, referrals };
        // The subdivision keeps ownership of the case: a referral outcome never closes it, it only schedules what is left.
        if (a.followUpAt) next = { ...next, followUps: [{ id: g('fu'), kind: 'referral_check', title: a.remainingFollowUp ? clip(a.remainingFollowUp, 90) : `Check with ${r.orgName}`, dueAt: a.followUpAt, status: 'pending', createdAt: m.now, createdBy: m.actor }, ...next.followUps] };
        return addEvent(next, g, m, 'referral_update', `${r.orgName}: ${REFERRAL_STATUS[a.status].label.toLowerCase()}`, clip(a.note));
      });

    case 'case/reviewClaim':
      return edit(a.id, (c, g) => {
        const claim = c.claims.find((x) => x.id === a.claimId);
        if (!claim) return c;
        const claims = c.claims.map((x) => (x.id === a.claimId ? { ...x, status: a.decision, reviewNote: a.note, reviewedAt: m.now, reviewedBy: m.actor } : x));
        let ownership = c.ownership;
        let identity = c.identity;
        if (a.decision === 'accepted') {
          ownership = { status: 'confirmed', ownerResidentId: claim.claimantResidentId, evidence: Array.from(new Set([...ownership.evidence, 'statement'])), note: a.note };
          if (claim.claimedPetId) identity = { ...identity, status: 'identified', matches: { ...identity.matches, [claim.claimedPetId]: 'confirmed' } };
        } else if ((a.decision === 'under_review' || a.decision === 'needs_info') && (ownership.status === 'unknown' || ownership.status === 'claimed')) {
          ownership = { ...ownership, status: 'under_review' };
        } else if (a.decision === 'rejected' && claims.every((x) => x.status === 'rejected')) {
          ownership = { ...ownership, status: 'unconfirmed', note: ownership.note || 'No claim was substantiated.' };
        }
        const label = a.decision === 'accepted' ? 'accepted' : a.decision === 'rejected' ? 'not accepted' : a.decision === 'needs_info' ? 'needs more information' : 'under review';
        let next: Case = addEvent({ ...c, claims, ownership, identity }, g, m, 'claim', `Ownership claim ${label}`, `${claim.claimantName}${a.note ? ` · ${clip(a.note, 100)}` : ''}`);
        if (ownership.status !== c.ownership.status) next = addEvent(next, g, m, 'ownership', `Ownership marked ${OWNERSHIP[ownership.status].label}`);
        return next;
      });

    case 'case/linkCases': {
      let seq = state.seq;
      const gen: Gen = (p) => `${p}-${++seq}`;
      const cases = state.cases.map((c) => {
        if (c.id === a.id) {
          const add = a.otherIds.filter((o) => !c.relatedCaseIds.includes(o));
          return add.length ? addEvent({ ...c, relatedCaseIds: [...c.relatedCaseIds, ...add] }, gen, m, 'link', `Linked to ${add.join(', ')}`, 'Both reports stay intact. Only the association was added.') : c;
        }
        if (a.otherIds.includes(c.id) && !c.relatedCaseIds.includes(a.id)) return addEvent({ ...c, relatedCaseIds: [...c.relatedCaseIds, a.id] }, gen, m, 'link', `Linked to ${a.id}`);
        return c;
      });
      return { ...state, cases, seq };
    }

    case 'case/unlinkCase': {
      let seq = state.seq;
      const gen: Gen = (p) => `${p}-${++seq}`;
      const cases = state.cases.map((c) => {
        if (c.id === a.id) return addEvent({ ...c, relatedCaseIds: c.relatedCaseIds.filter((o) => o !== a.otherId) }, gen, m, 'unlink', `Unlinked from ${a.otherId}`, 'Both reports stay intact.');
        if (c.id === a.otherId) return addEvent({ ...c, relatedCaseIds: c.relatedCaseIds.filter((o) => o !== a.id) }, gen, m, 'unlink', `Unlinked from ${a.id}`);
        return c;
      });
      return { ...state, cases, seq };
    }

    case 'case/close':
      return edit(a.id, (c, g) => {
        const d = DISPOSITIONS[a.disposition];
        const closure = { disposition: a.disposition, outcome: d.group, reason: a.reason, followUpCheck: a.followUpCheckAt, closedAt: m.now, closedBy: m.actor };
        let next: Case = { ...c, status: 'closed', closure };
        if (a.endOpenItems) {
          next = {
            ...next,
            followUps: next.followUps.map((f) => (f.status === 'pending' ? { ...f, status: 'cancelled' as const } : f)),
            warnings: next.warnings.map((w) => (w.status === 'active' ? { ...w, status: 'concluded' as const, outcome: 'other' as const, outcomeNote: 'Case closed.', concludedAt: m.now } : w)),
          };
        }
        if (a.followUpCheckAt) next = { ...next, followUps: [{ id: g('fu'), kind: 'post_closure', title: 'Post-closure check: confirm the concern has not returned', dueAt: a.followUpCheckAt, status: 'pending', createdAt: m.now, createdBy: m.actor }, ...next.followUps] };
        return addEvent(next, g, m, 'closure', `Case closed — ${d.label}`, a.reason);
      });

    case 'case/reopen':
      return edit(a.id, (c, g) => {
        const was = c.closure ? DISPOSITIONS[c.closure.disposition].label : 'Closed';
        return addEvent({ ...c, status: 'under_review', closure: null }, g, m, 'reopen', 'Case reopened', `${a.reason} (previously closed: ${was})`);
      });

    case 'notice/save': {
      const exists = state.notices.some((n) => n.id === a.notice.id);
      const saved: Notice = { ...a.notice, updatedAt: m.now, createdAt: exists ? a.notice.createdAt : m.now, ...(a.publish ? { status: 'published' as const, publishedAt: a.notice.publishedAt ?? m.now } : {}) };
      const notices = exists ? state.notices.map((n) => (n.id === saved.id ? saved : n)) : [saved, ...state.notices];
      let next: AdminState = { ...state, notices };
      if (a.publish && saved.caseId && !(exists && a.notice.status === 'published')) {
        let seq = next.seq;
        const gen: Gen = (p) => `${p}-${++seq}`;
        next = { ...next, seq, cases: next.cases.map((c) => (c.id === saved.caseId ? addEvent(c, gen, m, 'notice', `Community notice published: ${saved.title}`, 'The case record itself stays private.') : c)) };
      }
      return next;
    }

    case 'notice/archive': {
      const target = state.notices.find((n) => n.id === a.id);
      if (!target) return state;
      let seq = state.seq;
      const gen: Gen = (p) => `${p}-${++seq}`;
      return {
        ...state, seq,
        notices: state.notices.map((n) => (n.id === a.id ? { ...n, status: 'archived' as const, archivedReason: a.reason, updatedAt: m.now } : n)),
        cases: state.cases.map((c) => (c.id === target.caseId ? addEvent(c, gen, m, 'notice', 'Community notice archived', a.reason) : c)),
      };
    }

    case 'notice/delete':
      return { ...state, notices: state.notices.filter((n) => !(n.id === a.id && n.status === 'draft')) };

    case 'notification/read':
      return { ...state, notifications: state.notifications.map((n) => (n.id === a.id ? { ...n, read: true } : n)) };

    case 'notification/readAll':
      return { ...state, notifications: state.notifications.map((n) => ({ ...n, read: true })) };

    case 'resident/setStatus':
      return { ...state, residents: state.residents.map((r) => (r.id === a.id ? { ...r, status: a.status } : r)) };

    case 'settings/set':
      return { ...state, settings: a.settings };

    case 'admin/updateProfile':
      return { ...state, admin: { ...state.admin, ...a.patch } };

    default:
      return state;
  }
}
