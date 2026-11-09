import { Navigate } from 'react-router-dom';
import { Camera, ShieldAlert } from 'lucide-react';
import { MediaPicker } from '../../components/MediaPicker';
import { Button, Callout } from '../../components/ui';
import { useResidentData } from '../../data/context';
import { stepPath, useFlowNav } from '../../lib/flow';
import { FlowScreen } from './FlowScreen';

/** R11 — Optional photos and videos. Lost and found reports collect their photo on the details step, so they skip this one. */
export default function EvidencePage() {
  const { state, local } = useResidentData();
  const { next, fromReview } = useFlowNav('evidence');
  const draft = state.draft;
  if (draft && draft.kind !== 'incident') return <Navigate to={stepPath('review')} replace />;
  const count = draft?.media.length ?? 0;

  return (
    <FlowScreen
      step="evidence"
      title="Add photos or video"
      footer={<Button variant="primary" block onClick={next}>{fromReview ? 'Done' : count === 0 ? 'Continue without photos' : 'Continue'}</Button>}
    >
      <p className="rs-sub">Pictures help an administrator understand the situation. They are optional, and only authorized administrators can see them.</p>
      <MediaPicker value={draft?.media ?? []} onChange={(media) => local({ type: 'draft/patch', patch: { media } })} accept="both" max={5} />
      <Callout tone="amber" icon={ShieldAlert} title="Keep a safe distance.">
        Never approach, touch or corner an animal to get a better picture. Avoid showing people’s faces, children or house numbers.
      </Callout>
      <Callout tone="info" icon={Camera}>Photos up to 10 MB and videos up to 50 MB. You can add up to 5 files.</Callout>
    </FlowScreen>
  );
}
