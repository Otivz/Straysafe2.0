import { useParams } from 'react-router-dom';
import { CircleCheck } from 'lucide-react';
import { usePageTitle } from '../../lib/hooks';
import { Callout, LinkButton, NotFoundState } from '../../components/ui';
import { residentPath } from '../../config';
import { CATEGORIES, VISIBILITY_COPY } from '../../data/constants';
import { useResidentData } from '../../data/context';
import { reportById } from '../../data/selectors';

const NEXT: Record<'incident' | 'lost' | 'found', string[]> = {
  incident: [
    'An administrator reviews your report. This usually happens during office hours.',
    'You will see each change of status here, and get a notification.',
    'If more information is needed, the question appears in your report and you can answer there.',
  ],
  lost: [
    'Your notice is visible to neighbours in Community.',
    'If someone sees your pet, you get a notification and the sighting appears in your report.',
    'Tell us as soon as your pet is home, so the notice can be closed.',
  ],
  found: [
    'An administrator checks your report. Nothing is shared with neighbours until then.',
    'If it is published and an owner comes forward, the subdivision reviews their claim before anyone hands the animal over.',
    'Keep the animal safe, and do not hand it to someone who only says it is theirs.',
  ],
};

/** R13 — Confirmation after sending. */
export default function SubmittedPage() {
  usePageTitle('Report submitted');
  const { state } = useResidentData();
  const report = reportById(state, useParams().reportId);
  if (!report) return <div className="rs-content"><NotFoundState what="report" to="/reports" label="Go to My reports" /></div>;

  const cat = CATEGORIES[report.category];
  return (
    <div className="rs-content rs-done">
      <div className="rs-done__hero">
        <span className="rs-done__icon"><CircleCheck size={34} aria-hidden="true" /></span>
        <h1 className="rs-title">{report.kind === 'lost' ? 'Your notice is live' : 'Report submitted'}</h1>
        <p className="rs-sub">Reference <span className="sa-ref rs-ref">{report.id}</span></p>
        <p className="rs-sub">{cat.label} · {VISIBILITY_COPY[report.visibility].short}</p>
      </div>

      <section className="rs-stack-sm" aria-labelledby="next-title">
        <h2 id="next-title" className="rs-h2">What happens next</h2>
        <ol className="rs-numbered">{NEXT[report.kind].map((text) => <li key={text}>{text}</li>)}</ol>
      </section>

      {report.category === 'safety' || report.category === 'injured' ? (
        <Callout tone="amber" title="Meanwhile:">Keep a safe distance and do not try to handle the animal.</Callout>
      ) : null}

      <div className="rs-stack-sm">
        <LinkButton variant="primary" block to={residentPath(`/reports/${report.id}`)}>{report.kind === 'found' ? 'View found animal details' : 'View my report'}</LinkButton>
        {report.noticeId ? <LinkButton block to={residentPath(`/community/${report.noticeId}`)}>See the notice neighbours see</LinkButton> : null}
        <LinkButton variant="ghost" block to={residentPath('/home')}>Back to Home</LinkButton>
      </div>
    </div>
  );
}
