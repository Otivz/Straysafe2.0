import { EyeOff, Megaphone, PawPrint, ShieldCheck, UserRound, type LucideIcon } from 'lucide-react';
import { Screen } from '../../components/Screen';
import { LinkButton, Row } from '../../components/ui';
import { residentPath } from '../../config';

const SECTIONS: { icon: LucideIcon; title: string; text: string }[] = [
  { icon: EyeOff, title: 'Your reports', text: 'Reports are private by default. Only authorized subdivision administrators can see a report, its photos and its location. They also see who sent it, so they can follow up. StraySafe does not offer anonymous reporting.' },
  { icon: PawPrint, title: 'Lost-pet notices', text: 'When you report a lost pet, a notice is shared with neighbours: the photo, the description, the general area and when your pet was last seen. Your name, phone number, address and the exact spot are never shown.' },
  { icon: ShieldCheck, title: 'Found animals', text: 'An administrator reviews a found-animal report before anything is shared. Nothing about it is visible to neighbours until a notice is published.' },
  { icon: Megaphone, title: 'Sightings and advisories', text: 'Sightings are shown without a name. Safety advisories are written and published by administrators only, and never say who raised a concern.' },
  { icon: UserRound, title: 'Your profile and pets', text: 'Your profile is visible to you and to administrators. A pet’s profile is shared with administrators only if you report the pet lost or make an ownership claim.' },
];

/** R37 — Privacy and your data: what is shared, with whom, in plain language. */
export default function PrivacyPage() {
  return (
    <Screen title="Privacy and your data" back="/profile">
      <p className="rs-sub">StraySafe shares as little as it can. Here is exactly who can see what.</p>
      <div className="rs-stack">
        {SECTIONS.map(({ icon: Icon, title, text }) => (
          <section key={title} className="rs-info">
            <span className="rs-info__icon"><Icon size={19} aria-hidden="true" /></span>
            <div>
              <h2 className="rs-h2">{title}</h2>
              <p>{text}</p>
            </div>
          </section>
        ))}
      </div>
      <div className="rs-list">
        <Row to={residentPath('/settings')} title="Choose what you are notified about" />
        <Row to={residentPath('/contact')} title="Ask about your data" meta="To request a copy of your information or its removal, contact the subdivision office." />
      </div>
      <LinkButton variant="link" to={residentPath('/help')}>Read the help section</LinkButton>
    </Screen>
  );
}
