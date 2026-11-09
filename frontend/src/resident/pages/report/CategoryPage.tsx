import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Pencil, Trash2 } from 'lucide-react';
import { ConfirmSheet } from '../../components/Sheet';
import { CATEGORY_ICON } from '../../components/icons';
import { PrimaryScreen } from '../../components/Screen';
import { Button, Callout, Row } from '../../components/ui';
import { residentPath } from '../../config';
import { CATEGORIES, CATEGORY_IDS } from '../../data/constants';
import { useResidentData } from '../../data/context';
import type { CategoryId } from '../../data/types';
import { useStartReport } from '../../lib/flow';

/** What each choice does with the report. Stated before anything is written, so submitting is never a surprise. */
const SHARING: Record<CategoryId, string> = {
  lost_pet: 'Shared with neighbours as a lost-pet notice',
  found_animal: 'Private until an administrator reviews it',
  nuisance: 'Private to subdivision administrators',
  safety: 'Private to subdivision administrators',
  injured: 'Private to subdivision administrators',
  other: 'Private to subdivision administrators',
};

/** R08 — Choose what to report. */
export default function CategoryPage() {
  const { state, local } = useResidentData();
  const start = useStartReport();
  const navigate = useNavigate();
  const [discarding, setDiscarding] = useState(false);
  const draft = state.draft;

  return (
    <PrimaryScreen title="Report" lead="What would you like to report?">
      {draft ? (
        <Callout tone="amber" title="You have an unfinished report.">
          <span>{CATEGORIES[draft.category].label}. Choosing a category below starts a new one.</span>
          <span className="rs-row-actions rs-mt">
            <Button size="sm" variant="primary" icon={Pencil} onClick={() => navigate(residentPath('/report/details'))}>Continue</Button>
            <Button size="sm" icon={Trash2} onClick={() => setDiscarding(true)}>Discard</Button>
          </span>
        </Callout>
      ) : null}

      <div className="rs-list">
        {CATEGORY_IDS.map((id) => {
          const Icon = CATEGORY_ICON[id];
          return (
            <Row
              key={id}
              icon={Icon}
              title={CATEGORIES[id].label}
              meta={<><span>{CATEGORIES[id].blurb}</span><span className="rs-row__share">{SHARING[id]}</span></>}
              onClick={() => start(id)}
            />
          );
        })}
      </div>

      <Callout tone="info" title="Not for emergencies.">
        If someone is in danger or hurt right now, call local emergency services or tell the guardhouse first. Reports are reviewed by the subdivision during office hours.
      </Callout>

      {discarding ? (
        <ConfirmSheet
          title="Discard this report?"
          message="The details, location and photos you added will be removed from this device."
          confirmLabel="Discard report"
          tone="danger"
          onConfirm={() => local({ type: 'draft/clear' })}
          onClose={() => setDiscarding(false)}
        />
      ) : null}
    </PrimaryScreen>
  );
}
