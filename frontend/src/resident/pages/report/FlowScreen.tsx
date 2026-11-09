import type { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { Screen } from '../../components/Screen';
import { residentPath } from '../../config';
import { CATEGORIES } from '../../data/constants';
import { useResidentData } from '../../data/context';
import type { FlowStep } from '../../data/selectors';
import type { Draft } from '../../data/types';
import { useFlowNav } from '../../lib/flow';

/**
 * One step of the report flow: Back goes to the previous step, a progress indicator shows where you are, and a missing
 * draft (a deep link, or a finished report) sends you back to the start.
 */
export function FlowScreen({ step, title, footer, draft: given, children }: { step: FlowStep; title: string; footer?: ReactNode; draft?: Draft; children: ReactNode }) {
  const { state } = useResidentData();
  const draft = given ?? state.draft;
  const { steps, index, back } = useFlowNav(step, draft?.kind);
  if (!draft) return <Navigate to={residentPath('/report')} replace />;
  return (
    <Screen title={title} subtitle={`Step ${index + 1} of ${steps.length} · ${CATEGORIES[draft.category].label}`} onBack={back} footer={footer}>
      <ol className="rs-steps" aria-label={`Step ${index + 1} of ${steps.length}`}>
        {steps.map((s, i) => <li key={s} className={i < index ? 'is-done' : i === index ? 'is-current' : undefined} aria-current={i === index ? 'step' : undefined} />)}
      </ol>
      {children}
    </Screen>
  );
}
