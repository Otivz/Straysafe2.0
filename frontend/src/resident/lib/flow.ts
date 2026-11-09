import { useNavigate, useSearchParams } from 'react-router-dom';
import { residentPath } from '../config';
import { CATEGORIES } from '../data/constants';
import { useResidentData } from '../data/context';
import { flowSteps, type FlowStep } from '../data/selectors';
import type { CategoryId, Draft } from '../data/types';

export const stepPath = (step: FlowStep) => residentPath(`/report/${step}`);

/** Starts a fresh report draft for a category (replacing any unfinished one) and opens the first step. */
export function useStartReport() {
  const { local } = useResidentData();
  const navigate = useNavigate();
  return (category: CategoryId, patch?: Partial<Draft>) => {
    local({ type: 'draft/start', kind: CATEGORIES[category].kind, category, patch });
    navigate(stepPath('details'));
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
  return {
    steps,
    index: at,
    fromReview,
    next: () => navigate(fromReview ? stepPath('review') : stepPath(steps[at + 1] ?? 'review')),
    back: () => navigate(fromReview ? stepPath('review') : at > 0 ? stepPath(steps[at - 1]) : residentPath('/report')),
  };
}
