import { Navigate } from 'react-router-dom';
import { CATEGORY_ICON } from '../../components/icons';
import { Screen } from '../../components/Screen';
import { Row } from '../../components/ui';
import { residentPath } from '../../config';
import { useResidentData } from '../../data/context';
import { SITUATION_QUESTION, offeredSituations } from '../../data/entries';
import { useBeginReport } from '../../lib/flow';

/** R08b — The one question behind "Report an animal". Each answer opens the existing form for that kind of report. */
export default function SituationPage() {
  const { state } = useResidentData();
  const { begin } = useBeginReport();
  const options = offeredSituations(state.accepting);
  // Nothing to choose from (every option is switched off, or the subdivision's settings could not be read): the Report screen says why.
  if (options.length === 0) return <Navigate to={residentPath('/report')} replace />;

  return (
    <Screen title="Report an animal" subtitle={SITUATION_QUESTION} back="/report">
      <div className="rs-list">
        {options.map((o) => <Row key={o.family} icon={CATEGORY_ICON[o.family]} title={o.title} onClick={() => begin(o.family)} />)}
      </div>
    </Screen>
  );
}
