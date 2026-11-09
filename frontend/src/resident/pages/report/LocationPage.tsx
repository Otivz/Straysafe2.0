import { Callout } from '../../components/ui';
import { LocationPicker } from '../../components/LocationPicker';
import { useResidentData } from '../../data/context';
import { useFlowNav } from '../../lib/flow';
import { FlowScreen } from './FlowScreen';

/** R10 — Where the animal was seen. */
export default function LocationPage() {
  const { state, local } = useResidentData();
  const { next, fromReview } = useFlowNav('location');
  const kind = state.draft?.kind ?? 'incident';
  return (
    <FlowScreen step="location" title="Where was the animal?">
      <LocationPicker
        initial={state.draft?.location ?? null}
        confirmLabel={fromReview ? 'Save location' : 'Confirm location'}
        publicText={kind !== 'incident'}
        onConfirm={(location) => { local({ type: 'draft/patch', patch: { location } }); next(); }}
      />
      <Callout tone="info">
        {kind === 'incident'
          ? 'Only authorized administrators see the exact spot of a private report.'
          : 'Neighbours only see a general area (a circle around the place), never your exact pin or your address.'}
      </Callout>
    </FlowScreen>
  );
}
