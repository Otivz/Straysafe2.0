import { useNavigate, useSearchParams } from 'react-router-dom';
import { residentPath } from '../config';
import { CATEGORIES } from '../data/constants';
import { useResidentData } from '../data/context';
import { carryOver, entryOf } from '../data/entries';
import { flowSteps, type FlowStep } from '../data/selectors';
import type { CategoryId, Draft } from '../data/types';
import { useBack } from './hooks';

export const stepPath = (step: FlowStep) => residentPath(`/report/${step}`);

/** Registering a pet from the lost-pet flow: when it is saved, a lost-pet report starts with the new pet chosen. */
export const registerForLostPath = () => `${residentPath('/pets/new')}?next=lost`;

/** Starts a fresh report draft for a category (replacing any unfinished one) and opens the first step. */
export function useStartReport() {
  const { local } = useResidentData();
  const navigate = useNavigate();
  return (category: CategoryId, patch?: Partial<Draft>, options?: { replace?: boolean }) => {
    local({ type: 'draft/start', kind: CATEGORIES[category].kind, category, patch });
    navigate(stepPath('details'), { replace: options?.replace });
  };
}

/**
 * Moving between the steps of the report flow. Steps differ by kind (lost and found reports collect the photo on the first
 * step). When a step was opened from the review screen to fix something, `next` returns to the review.
 */
export function useFlowNav(step: FlowStep, kind?: Draft['kind']) {
  const { state } = useResidentData();
  const navigate = useNavigate();
  const fromReview = useSearchParams()[0].get('from') === 'review';
  const steps = flowSteps(kind ?? state.draft?.kind ?? 'incident');
  const at = steps.indexOf(step);
  // Every step pushed the next one, so Back simply unwinds where the resident came from (a Back that pushed a screen of its own would
  // loop between two screens). Opened on its own (a reload or a link) there is nothing to unwind: it goes to the previous step, and from
  // the first step to where the kind of report is chosen: the question behind "Report an animal", or the Report screen.
  const chooser = state.draft && entryOf(state.draft.category) === 'animal' ? '/report/situation' : '/report';
  const back = useBack(fromReview ? stepPath('review') : at > 0 ? stepPath(steps[at - 1]) : residentPath(chooser));
  return {
    steps,
    index: at,
    fromReview,
    next: () => navigate(fromReview ? stepPath('review') : stepPath(steps[at + 1] ?? 'review')),
    back,
  };
}

/**
 * Starting a report from the Report screens. When the resident came back from the review because their kind of report was switched
 * off (`?keep=1`), what they already wrote is carried over to the kind they choose instead of being thrown away.
 */
export function useBeginReport() {
  const start = useStartReport();
  const draft = useResidentData().state.draft;
  const keep = useSearchParams()[0].get('keep') === '1' && draft !== null;
  return { keep, begin: (family: CategoryId) => start(family, keep && draft ? carryOver(draft, family) : undefined) };
}
