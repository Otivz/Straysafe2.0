import { useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ChevronDown, SearchX } from 'lucide-react';
import { SearchInput } from '../../components/form';
import { Screen } from '../../components/Screen';
import { Button, EmptyState, LinkButton, StatusPill } from '../../components/ui';
import { residentPath } from '../../config';
import { STATUS } from '../../data/constants';
import type { CaseStatus } from '../../data/types';

const STATUS_ORDER: CaseStatus[] = ['reported', 'under_review', 'in_progress', 'closed'];

const FAQ: { q: string; text: string; a: ReactNode }[] = [
  {
    q: 'What can I report?',
    text: 'A lost pet, an animal complaint, or an animal you saw that may need attention in your subdivision.',
    a: <p>You can report a lost pet, make an animal complaint (for example noise or a roaming animal), or report an animal you saw that may need attention: one that looks lost or has no owner nearby, is hurt or needs help, may be dangerous, or something else. Start from <Link to={residentPath('/report')}>Report</Link>.</p>,
  },
  {
    q: 'Who sees my report?',
    text: 'Reports are private. Only authorized subdivision administrators. Lost pet notices are shared with neighbours without your name.',
    a: <p>Reports are private by default. Only authorized subdivision administrators can see them, including who sent them. A lost-pet report also creates a notice that neighbours can see, without your name, phone or address. Found animals are shared only after an administrator reviews them.</p>,
  },
  {
    q: 'What appears in Community?',
    text: 'Lost-pet notices, found animals the subdivision has published, and safety advisories written by administrators. Private reports never appear there.',
    a: <p>Lost-pet notices from neighbours, found animals that the subdivision has published, and safety advisories written by the administrators. Private reports never appear in Community, and no notice shows who sent it. You can filter by Lost, Found or Advisories on the <Link to={residentPath('/community')}>Community</Link> screen.</p>,
  },
  {
    q: 'How do I track my report?',
    text: 'Open My reports and choose a report to see its status, every update from the subdivision and the final outcome. Reported, under review, in progress, closed.',
    a: (
      <>
        <p>Open <Link to={residentPath('/reports')}>My reports</Link> and choose a report. It shows its status, every update from the subdivision, and the outcome once it closes. You also get a notification when something changes. Every report uses the same four statuses:</p>
        <ul className="rs-statuslist">
          {STATUS_ORDER.map((s) => <li key={s}><StatusPill status={s} /><span>{STATUS[s].hint}</span></li>)}
        </ul>
      </>
    ),
  },
  {
    q: 'My pet is missing. What do I do?',
    text: 'Report it as a lost pet with a photo and where you last saw it. A notice goes to neighbours. Tell us when your pet is home.',
    a: <p>Choose <strong>My pet is lost</strong> on Home, add a clear photo and where you last saw your pet, and submit. A notice goes to your neighbours, and you get a notification for every sighting. When your pet is home, open the report and choose <strong>My pet is home</strong>.</p>,
  },
  {
    q: 'I found an animal. What do I do?',
    text: 'Keep a safe distance if it looks unwell or aggressive. Report it as a found animal. An administrator reviews it before a notice is published.',
    a: <p>Keep a safe distance if the animal looks hurt or aggressive. Report it as a found animal with a photo and the place. An administrator reviews the report before a notice is published. Please do not hand the animal to someone who only says it is theirs.</p>,
  },
  {
    q: 'How do ownership claims work?',
    text: 'If a found animal looks like yours, send a claim describing details only the owner knows. An administrator reviews it and may ask for more.',
    a: <p>If a found animal looks like yours, open its notice and choose <strong>This may be my animal</strong>. Describe details that are not visible in the notice and say what you can show. An administrator reviews the claim, may ask for more information, and decides. Registering a pet helps but does not prove ownership on its own.</p>,
  },
  {
    q: 'Is this for emergencies?',
    text: 'No. If someone is in danger or hurt right now, call local emergency services or tell the guardhouse first.',
    a: <p>No. Reports are reviewed by the subdivision during office hours. If someone is in danger or hurt right now, call local emergency services or tell the guardhouse first.</p>,
  },
  {
    q: 'Can I report anonymously?',
    text: 'No. Administrators can see who sent a report so they can follow up. Neighbours never see it.',
    a: <p>No. Administrators can see who sent a report so they can follow up and ask questions. Neighbours never see your name, and private reports are never shown in Community. We cannot promise more than that.</p>,
  },
  {
    q: 'How do I contact the subdivision?',
    text: 'Use Contact the subdivision for office hours, the phone number and a message form. Not for emergencies.',
    a: <p>Open <Link to={residentPath('/contact')}>Contact the subdivision</Link> for the office hours, phone number, email and a message form. For an emergency, call local emergency services or tell the guardhouse first.</p>,
  },
  {
    q: 'How do I add something to a report?',
    text: 'Open the report from My reports and choose Add information. You can add text, photos or video while it is open.',
    a: <p>Open the report from <Link to={residentPath('/reports')}>My reports</Link> and choose <strong>Add information</strong>. You can add text, photos or video while the report is open. A closed report cannot be changed; send a new one if the problem returns.</p>,
  },
];

/** R38 — Help: short answers, searchable. */
export default function HelpPage() {
  const [query, setQuery] = useState('');
  const q = query.trim().toLowerCase();
  const shown = FAQ.filter((f) => !q || `${f.q} ${f.text}`.toLowerCase().includes(q));
  return (
    <Screen title="Help" back="/profile">
      <SearchInput value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search help" aria-label="Search help" />
      {shown.length === 0 ? (
        <EmptyState icon={SearchX} title="No answers match" action={<Button onClick={() => setQuery('')}>Clear search</Button>}>
          Try another word, or ask the subdivision office.
        </EmptyState>
      ) : (
        <div className="rs-faq">
          {shown.map((f) => (
            <details key={f.q} className="rs-faq__item">
              <summary><span>{f.q}</span><ChevronDown size={18} aria-hidden="true" /></summary>
              <div className="rs-faq__answer">{f.a}</div>
            </details>
          ))}
        </div>
      )}
      <LinkButton block to={residentPath('/contact')}>Still need help? Contact the subdivision</LinkButton>
    </Screen>
  );
}
