import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ClipboardList, Pencil, Trash2 } from 'lucide-react';
import { ConfirmSheet } from '../../components/Sheet';
import { ENTRY_ICON } from '../../components/icons';
import { Screen } from '../../components/Screen';
import { Button, Callout, DisabledRow, EmptyState, LinkButton, Row } from '../../components/ui';
import { residentPath } from '../../config';
import { CATEGORIES } from '../../data/constants';
import { useResidentData } from '../../data/context';
import { ENTRIES, REGISTER_FIRST, offeredEntries, type EntryId } from '../../data/entries';
import { reportablePets } from '../../data/selectors';
import { registerForLostPath, useBeginReport } from '../../lib/flow';

/** R08 — Choose what to report: three entries, and only the ones the subdivision accepts right now. */
export default function CategoryPage() {
  const { state, local, reload } = useResidentData();
  const { begin, keep } = useBeginReport();
  const navigate = useNavigate();
  const [discarding, setDiscarding] = useState(false);
  const draft = state.draft;
  const entries = offeredEntries(state.accepting);
  // Lost Pet is for a registered pet of this resident: with none, the card stays visible but cannot be used, and says what to do
  const noPets = reportablePets(state).length === 0;

  const choose = (id: EntryId) => {
    if (id === 'animal') navigate({ pathname: residentPath('/report/situation'), search: keep ? '?keep=1' : '' });
    else begin(ENTRIES[id].families[0]);
  };

  return (
    <Screen title="Report" subtitle="What would you like to report?" back="/home">
      {draft && keep ? (
        <Callout tone="amber" title="Your subdivision isn’t accepting that kind of report right now.">
          Choose another type below. What you wrote is kept.
        </Callout>
      ) : draft ? (
        <Callout tone="amber" title="You have an unfinished report.">
          <span>{CATEGORIES[draft.category].label}. Choosing a type below starts a new one.</span>
          <span className="rs-row-actions rs-mt">
            <Button size="sm" variant="primary" icon={Pencil} onClick={() => navigate(residentPath('/report/details'))}>Continue</Button>
            <Button size="sm" icon={Trash2} onClick={() => setDiscarding(true)}>Discard</Button>
          </span>
        </Callout>
      ) : null}

      {state.accepting === undefined ? (
        <EmptyState icon={ClipboardList} title="We can’t check what you can report right now" action={<Button variant="primary" onClick={reload}>Try again</Button>}>
          The kinds of report could not be loaded. Check your connection and try again.
        </EmptyState>
      ) : entries.length === 0 ? (
        <EmptyState icon={ClipboardList} title="Reports aren’t being taken in the app right now" action={<LinkButton to={residentPath('/contact')}>Contact the office</LinkButton>}>
          Your subdivision has paused new reports here. Contact the office for anything urgent.
        </EmptyState>
      ) : (
        <div className="rs-list">
          {entries.map((id) => (id === 'lost_pet' && noPets
            ? <DisabledRow key={id} icon={ENTRY_ICON[id]} title={ENTRIES[id].title} meta={REGISTER_FIRST} action={<LinkButton size="sm" variant="primary" to={registerForLostPath()}>Register a pet</LinkButton>} />
            : <Row key={id} icon={ENTRY_ICON[id]} title={ENTRIES[id].title} meta={ENTRIES[id].blurb} onClick={() => choose(id)} />
          ))}
        </div>
      )}

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
    </Screen>
  );
}
