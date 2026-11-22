/**
 * Suggested text for the Leader's case forms, built only from what the case already holds. Each form uses these as its starting
 * value (or while a field is still untouched): the Leader reviews and edits everything before saving, and nothing typed is replaced.
 */
import { ANIMAL_TYPES, CATEGORIES, FOLLOWUP_KINDS } from '../data/constants';
import type { Case, DispositionId, FollowUpKind } from '../data/types';
import { dispositionAvailability } from '../data/selectors';
import { fmtDate, fmtDateTime } from '../../preview/lib/format';

const clip = (text: string, max: number) => {
  const t = (text ?? '').replace(/\s+/g, ' ').trim();
  return t.length > max ? `${t.slice(0, max - 1).trimEnd()}…` : t;
};

const placeOf = (c: Case) => (c.location.area && c.location.area !== 'Location not named' ? c.location.area : 'the reported location');

const animalOf = (c: Case) => {
  const pet = c.registeredPet?.current?.name;
  const kind = c.animal.customType || ANIMAL_TYPES[c.animal.type] || 'animal';
  return pet ? `${pet} (${kind.toLowerCase()})` : `a ${kind.toLowerCase()}`;
};

/** Warning: what happened, when and where, from the report. */
export function incidentSummary(c: Case): string {
  const what = clip(c.description || c.animal.description || c.title, 300);
  return `On ${fmtDateTime(c.observedAt)}, near ${placeOf(c)}, ${animalOf(c)} was reported (case ${c.id}, ${CATEGORIES[c.category].label}): ${what}`;
}

/** Referral: why the subdivision is asking for help. */
export function referralReason(c: Case): string {
  const urgent = c.priority === 'urgent' ? ' The situation is urgent.' : '';
  const condition = c.animal.condition ? ` Condition: ${clip(c.animal.condition, 160)}.` : '';
  return `Requesting assistance with case ${c.id} (${CATEGORIES[c.category].label}) reported on ${fmtDate(c.reportedAt)} near ${placeOf(c)}: ${clip(c.title, 140)}.${condition}${urgent}`;
}

/** Record follow-up: a starting line for the chosen kind of follow-up. */
export function followUpTitle(kind: FollowUpKind, c: Case): string {
  return `${FOLLOWUP_KINDS[kind] ?? 'Follow-up'} near ${placeOf(c)}`;
}

/**
 * Close case: the outcome the record points to, with a draft reason. Only an outcome the case can actually be closed with is
 * suggested; null when nothing on the record points to one (the Leader then chooses).
 */
export function suggestedClosure(c: Case): { disposition: DispositionId; reason: string } | null {
  const can = (id: DispositionId) => dispositionAvailability(c, id).ok;
  if (c.assessment.incident === 'invalid' && can('invalid_report')) {
    return { disposition: 'invalid_report', reason: c.assessment.incidentBasis?.trim() ? `Assessed as invalid: ${clip(c.assessment.incidentBasis, 240)}` : 'Assessed as invalid after review.' };
  }
  const compliant = c.warnings.find((w) => w.observations.some((o) => o.result === 'compliant'));
  if (compliant && can('owner_compliance')) {
    return { disposition: 'owner_compliance', reason: `The owner complied with the warning issued under ${compliant.policyTitle || 'the subdivision policy'}; compliance was observed and recorded.` };
  }
  const referral = [...c.referrals].sort((a, b) => b.referredAt.localeCompare(a.referredAt))[0];
  if (referral && ['resolved', 'acknowledged', 'in_progress'].includes(String(referral.status)) && can('handed_off')) {
    return { disposition: 'handed_off', reason: `Referred to ${referral.orgName} on ${fmtDate(referral.referredAt)}, which took over the case. Nothing remains for the subdivision to do.` };
  }
  return null;
}
