import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Pencil, QrCode, Search, ShieldAlert } from 'lucide-react';
import { fromServer } from '../../../live/dates';
import { fmtDate, fmtDateTime } from '../../../preview/lib/format';
import { ANIMAL_ICON } from '../../components/icons';
import { Screen } from '../../components/Screen';
import { Sheet } from '../../components/Sheet';
import { Button, Callout, IconButton, LinkButton, MediaThumbs, NotFoundState, Pill, Row, Section, Skeleton, StatusPill } from '../../components/ui';
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
    setDoneScans(scans.found_reports.filter((r) => r.status === 'resolved' || r.status === 'returned' || r.status === 'dismissed'));
  }, []);
  const handleScansUnavailable = useCallback(() => {
    setDoneScans([]);
  }, []);
  if (!pet) return <Screen title="Pet" back="/pets"><NotFoundState what="pet" to="/pets" label="Go to My pets" /></Screen>;

  const Icon = ANIMAL_ICON[pet.type];
  const missing = activeLostReport(state, pet.id);
  const isLost = Boolean(missing) || pet.status === 'Lost';
  const statusLabel = isLost ? 'Lost' : pet.status?.trim() || 'Active';
  const statusTone = isLost ? 'amber' : statusLabel === 'Deceased' ? 'neutral' : 'sage';
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
          <div style={{ marginTop: 6 }}>
            <Pill tone={statusTone} dot>{statusLabel}</Pill>
          </div>
        </div>
      </div>

      {missing ? (
        <Callout tone="amber" title={`${pet.name} is reported missing.`}>
          <Link to={residentPath(`/reports/${missing.id}`)}>Open the report</Link>, or tell us when {pet.name} is home.
        </Callout>
      ) : null}

      <Section title="About">
        <dl className="rs-kv">
          <div><dt>Status</dt><dd><Pill tone={statusTone} dot>{statusLabel}</Pill></dd></div>
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
  const [selectedIncident, setSelectedIncident] = useState<ApiPetConfirmedIncident | null>(null);
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
                  <div>
                    <Button size="sm" variant="secondary" onClick={() => setSelectedIncident(inc)}>
                      View report
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {selectedIncident ? (
        <Sheet
          tall
          title={`${selectedIncident.reference_code} · ${selectedIncident.category}`}
          description={`Verified incident summary involving ${petName}`}
          onClose={() => setSelectedIncident(null)}
          footer={<Button variant="primary" onClick={() => setSelectedIncident(null)}>Close</Button>}
        >
          <div className="rs-stack">
            {selectedIncident.status === 'closed' ? (
              <Callout
                tone={selectedIncident.outcome_group === 'resolved' ? 'sage' : 'info'}
                title={selectedIncident.outcome_label ?? 'Case closed'}
              >
                {selectedIncident.closed_at ? `Closed on ${fmtDateTime(selectedIncident.closed_at)}.` : 'This case has concluded.'}
              </Callout>
            ) : (
              <div className="rs-row-actions">
                <StatusPill status={selectedIncident.status} />
                <span className="rs-meta">{selectedIncident.status_label}</span>
              </div>
            )}

            <Section title="Report summary">
              <dl className="rs-kv">
                <div><dt>Reference</dt><dd>{selectedIncident.reference_code}</dd></div>
                <div><dt>Category</dt><dd>{selectedIncident.category}</dd></div>
                {selectedIncident.reported_at ? <div><dt>Reported</dt><dd>{fmtDateTime(selectedIncident.reported_at)}</dd></div> : null}
                {selectedIncident.incident_date ? <div><dt>Observed</dt><dd>{fmtDateTime(selectedIncident.incident_date)}</dd></div> : null}
                <div><dt>Area</dt><dd>{selectedIncident.location_area || 'Within subdivision'}</dd></div>
                {selectedIncident.animal_summary ? <div><dt>Animal</dt><dd>{selectedIncident.animal_summary}</dd></div> : null}
                {selectedIncident.condition ? <div><dt>Observed condition</dt><dd>{selectedIncident.condition}</dd></div> : null}
                <div>
                  <dt>Verified findings</dt>
                  <dd>
                    {selectedIncident.verified_findings && selectedIncident.verified_findings.length > 0 ? (
                      <ul className="rs-tags">
                        {selectedIncident.verified_findings.map((f) => <li key={f}>{f}</li>)}
                      </ul>
                    ) : selectedIncident.summary}
                  </dd>
                </div>
                {selectedIncident.outcome_label ? <div><dt>Outcome</dt><dd>{selectedIncident.outcome_label}</dd></div> : null}
              </dl>

              {selectedIncident.photos && selectedIncident.photos.length > 0 ? (
                <div className="rs-stack-sm" style={{ marginTop: 12 }}>
                  <h4 className="rs-label">Submitted photos</h4>
                  <MediaThumbs
                    media={selectedIncident.photos.map((url, idx) => ({
                      id: `${selectedIncident.report_id}-photo-${idx}`,
                      kind: 'photo',
                      name: `${selectedIncident.reference_code} photo ${idx + 1}`,
                      size: 0,
                      url,
                    }))}
                  />
                </div>
              ) : null}
            </Section>

            {selectedIncident.milestones && selectedIncident.milestones.length > 0 ? (
              <Section title="Progress timeline">
                <dl className="rs-kv">
                  {selectedIncident.milestones.map((m, idx) => (
                    <div key={`${m.label}-${idx}`}>
                      <dt>{m.label}</dt>
                      <dd>{fmtDateTime(m.at)}{m.detail ? ` · ${m.detail}` : ''}</dd>
                    </div>
                  ))}
                </dl>
              </Section>
            ) : null}

            {selectedIncident.warning_letters && selectedIncident.warning_letters.length > 0 ? (
              <Section title="Warning letters">
                <div className="rs-stack-sm">
                  {selectedIncident.warning_letters.map((w) => (
                    <Row
                      key={w.letter_id}
                      to={residentPath(`/warnings/${w.letter_id}`)}
                      icon={ShieldAlert}
                      title={`${w.warning_level} · ${w.warning_reference}`}
                      meta={w.issued_at ? `Issued ${fmtDate(w.issued_at)} · Tap to view letter` : 'Tap to view letter'}
                    />
                  ))}
                </div>
              </Section>
            ) : null}

            <Callout tone="info">
              Only verified facts and status milestones are shown here. Reporter details and internal subdivision notes remain private.
            </Callout>
          </div>
        </Sheet>
      ) : null}
    </Section>
  );
}
