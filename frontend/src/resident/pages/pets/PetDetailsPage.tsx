import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Pencil, QrCode, Search, ShieldAlert } from 'lucide-react';
import { fromServer } from '../../../live/dates';
import { fmtDate, fmtDateTime } from '../../../preview/lib/format';
import { ANIMAL_ICON } from '../../components/icons';
import { Screen } from '../../components/Screen';
import { Button, Callout, IconButton, LinkButton, NotFoundState, Pill, Row, Section, Skeleton, StatusPill } from '../../components/ui';
import { residentPath } from '../../config';
import { parseColorTags } from '../../data/colors';
import { ANIMAL_TYPES, SEX_LABEL } from '../../data/constants';
import { useResidentData } from '../../data/context';
import { accepts } from '../../data/entries';
import { activeLostReport, petById, petLostReports } from '../../data/selectors';
import { useStartReport } from '../../lib/flow';
import { PetTagSection } from './PetTagSection';
import { residentApi, type ApiGeneratedWarningLetter, type ApiPetConfirmedIncident, type ApiPetTagFoundReport, type ApiPetTagScans } from '../../live/api';

/** R31 — One registered pet, with the shortcut to report them lost. */
export default function PetDetailsPage() {
  const { state } = useResidentData();
  const navigate = useNavigate();
  const start = useStartReport();
  const pet = petById(state, useParams().petId);
  const [doneScans, setDoneScans] = useState<ApiPetTagFoundReport[] | null>(null);
  useEffect(() => {
    setDoneScans(null);
  }, [pet?.id]);
  const handleScansLoaded = useCallback((scans: ApiPetTagScans) => {
    setDoneScans(scans.found_reports.filter((r) => r.status === 'resolved'));
  }, []);
  const handleScansUnavailable = useCallback(() => {
    setDoneScans([]);
  }, []);
  if (!pet) return <Screen title="Pet" back="/pets"><NotFoundState what="pet" to="/pets" label="Go to My pets" /></Screen>;

  const Icon = ANIMAL_ICON[pet.type];
  const missing = activeLostReport(state, pet.id);
  const colorTags = parseColorTags(pet.colors, pet.color);

  return (
    <Screen
      title={pet.name}
      back="/pets"
      actions={<IconButton label="Edit pet" icon={Pencil} onClick={() => navigate(residentPath(`/pets/${pet.id}/edit`))} />}
      footer={missing ? (
        <LinkButton variant="primary" block to={residentPath(`/reports/${missing.id}`)}>View the lost-pet report</LinkButton>
      ) : accepts(state.accepting, 'lost_pet') && pet.status !== 'Deceased' ? (
        <Button variant="primary" block icon={Search} onClick={() => start('lost_pet', { petId: pet.id, petName: pet.name, animalType: pet.type })}>
          {pet.name} is lost
        </Button>
      ) : undefined}
    >
      <div className="rs-pethero">
        <span className="rs-pethero__photo">{pet.photoUrl ? <img src={pet.photoUrl} alt={`${pet.name}`} /> : <Icon size={40} aria-hidden="true" />}</span>
        <div>
          <h2 className="rs-title rs-title--sm">{pet.name}</h2>
          <p className="rs-meta">{ANIMAL_TYPES[pet.type]}{pet.breed ? ` · ${pet.breed}` : ''}</p>
        </div>
      </div>

      {missing ? (
        <Callout tone="amber" title={`${pet.name} is reported missing.`}>
          <Link to={residentPath(`/reports/${missing.id}`)}>Open the report</Link>, or tell us when {pet.name} is home.
        </Callout>
      ) : null}

      <Section title="About">
        <dl className="rs-kv">
          <div><dt>Colour or coat</dt><dd>{colorTags.length > 0 ? <ul className="rs-tags">{colorTags.map((c) => <li key={c}>{c}</li>)}</ul> : pet.color}</dd></div>
          {pet.sex !== 'unknown' ? <div><dt>Sex</dt><dd>{SEX_LABEL[pet.sex]}</dd></div> : null}
          {pet.ageText ? <div><dt>Age</dt><dd>{pet.ageText}</dd></div> : null}
          <div><dt>Registered</dt><dd>{fmtDate(pet.registeredAt)}</dd></div>
          {pet.description ? <div><dt>Notes</dt><dd>{pet.description}</dd></div> : null}
        </dl>
        {pet.markings.length > 0 ? (
          <div className="rs-stack-sm">
            <h3 className="rs-label">Marks, collar or tag</h3>
            <ul className="rs-tags">{pet.markings.map((m) => <li key={m}>{m}</li>)}</ul>
          </div>
        ) : null}
      </Section>

      <PetTagSection
        petId={pet.id}
        petName={pet.name}
        inactive={['Archived', 'Deceased', 'Inactive'].includes(pet.status ?? '')}
        onScansLoaded={handleScansLoaded}
        onScansUnavailable={handleScansUnavailable}
      />

      <PetHistorySection petId={pet.id} petName={pet.name} doneScans={doneScans} />

      <Callout tone="info">This profile is private. It is shared only if you report {pet.name} lost, or make an ownership claim. A registration is what you declare, not proof of ownership.</Callout>
    </Screen>
  );
}

function PetHistorySection({ petId, petName, doneScans }: { petId: string; petName: string; doneScans: ApiPetTagFoundReport[] | null }) {
  const { state } = useResidentData();
  const lostReports = petLostReports(state, petId);
  const numericPetId = Number(petId);
  const canQueryLive = Boolean(state.profile?.id) && Number.isInteger(numericPetId) && numericPetId > 0;

  const [warnings, setWarnings] = useState<ApiGeneratedWarningLetter[]>([]);
  const [incidents, setIncidents] = useState<ApiPetConfirmedIncident[]>([]);
  const [loading, setLoading] = useState(canQueryLive);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    if (!canQueryLive) {
      setWarnings([]);
      setIncidents([]);
      setLoading(false);
      setLoadError(false);
      return;
    }
    let live = true;
    setLoading(true);
    setLoadError(false);
    Promise.all([
      residentApi.myWarningLetters(),
      residentApi.petConfirmedIncidents(numericPetId),
    ]).then(
      ([warnRes, incRes]) => {
        if (!live) return;
        setWarnings(warnRes.items.filter((w) => w.pet_id === numericPetId));
        setIncidents(incRes.items);
        setLoading(false);
      },
      () => {
        if (!live) return;
        setLoadError(true);
        setLoading(false);
      },
    );
    return () => {
      live = false;
    };
  }, [canQueryLive, numericPetId]);

  return (
    <Section title="History">
      <div className="rs-stack">
        <div className="rs-stack-sm">
          <h3 className="rs-label">QR tag scans ({doneScans === null ? '…' : doneScans.length})</h3>
          {doneScans === null ? (
            <Skeleton h={44} />
          ) : doneScans.length === 0 ? (
            <p className="rs-meta">No completed QR tag scans for {petName}.</p>
          ) : (
            <div className="rs-stack-sm">
              {doneScans.map((s) => (
                <Row
                  key={s.scan_id}
                  to={residentPath(`/pets/${petId}/scans/${s.scan_id}`)}
                  icon={QrCode}
                  title={s.location_label ? `Tag scanned · ${s.location_label}` : 'Tag scanned'}
                  meta={`${fmtDateTime(fromServer(s.created_at))}${s.note ? ` · “${s.note}”` : ''}`}
                  trailing={<Pill tone="sage">Done</Pill>}
                />
              ))}
            </div>
          )}
        </div>

        <div className="rs-stack-sm">
          <h3 className="rs-label">Lost-pet reports ({lostReports.length})</h3>
          {lostReports.length === 0 ? (
            <p className="rs-meta">No lost-pet reports filed for {petName}.</p>
          ) : (
            <div className="rs-stack-sm">
              {lostReports.map((r) => (
                <Row
                  key={r.id}
                  to={residentPath(`/reports/${r.id}`)}
                  icon={Search}
                  title={`${r.id} · ${r.title || 'Lost pet report'}`}
                  meta={`Filed ${fmtDate(r.submittedAt)}`}
                  trailing={<StatusPill status={r.status} />}
                />
              ))}
            </div>
          )}
        </div>

        <div className="rs-stack-sm">
          <h3 className="rs-label">Warnings & notices ({loading ? '…' : warnings.length})</h3>
          {loading ? (
            <Skeleton h={44} />
          ) : loadError ? (
            <Callout tone="amber">Couldn’t load warnings and confirmed incident records right now.</Callout>
          ) : warnings.length === 0 ? (
            <p className="rs-meta">No official warnings or notices linked to {petName}.</p>
          ) : (
            <div className="rs-stack-sm">
              {warnings.map((w) => (
                <Row
                  key={w.letter_id}
                  to={residentPath(`/warnings/${w.letter_id}`)}
                  icon={ShieldAlert}
                  title={`${w.warning_level} · ${w.warning_reference}`}
                  meta={`${w.case_reference}${w.issued_at ? ` · Issued ${fmtDate(w.issued_at)}` : ''}`}
                  trailing={
                    !w.viewed_at ? (
                      <Pill tone="brand">New</Pill>
                    ) : w.warning_status === 'Acknowledged' ? (
                      <Pill tone="sage">Acknowledged</Pill>
                    ) : undefined
                  }
                />
              ))}
            </div>
          )}
        </div>

        <div className="rs-stack-sm">
          <h3 className="rs-label">Confirmed incidents ({loading ? '…' : incidents.length})</h3>
          {loading ? (
            <Skeleton h={44} />
          ) : loadError ? null : incidents.length === 0 ? (
            <p className="rs-meta">No verified incident reports confirmed for {petName}.</p>
          ) : (
            <div className="rs-stack-sm">
              {incidents.map((inc) => (
                <div key={inc.report_id} className="rs-card rs-stack-sm">
                  <div className="rs-row__text">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                      <span className="rs-row__title">{inc.reference_code} · {inc.category}</span>
                      <StatusPill status={inc.status} />
                    </div>
                    <span className="rs-row__meta">
                      {inc.incident_date ? `Verified incident · ${fmtDate(inc.incident_date)}` : 'Verified incident'}
                      {inc.has_warning_letter ? ' · Warning issued' : ''}
                    </span>
                  </div>
                  <p className="rs-sub">{inc.summary}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </Section>
  );
}
