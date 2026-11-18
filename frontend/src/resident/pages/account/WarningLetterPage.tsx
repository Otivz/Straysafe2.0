import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { CheckCircle2, Download, ShieldAlert } from 'lucide-react';
import { WarningLetterDocument } from '../../../components/WarningLetterDocument';
import { fmtDateTime } from '../../../preview/lib/format';
import { errorMessage } from '../../../preview/lib/errors';
import { Screen } from '../../components/Screen';
import { Checkbox } from '../../components/form';
import { useToast } from '../../components/toast';
import { Button, Callout, ErrorState, ListSkeleton, NotFoundState, Section } from '../../components/ui';
import { useResidentData } from '../../data/context';
import { residentApi, type ApiGeneratedWarningLetter } from '../../live/api';

/** Full Warning Letter Viewer & Downloader (records viewed_at when actually opened by the resident). */
export default function WarningLetterPage() {
  const { letterId } = useParams();
  const { local } = useResidentData();
  const toast = useToast();
  const id = Number(letterId);

  const [letter, setLetter] = useState<ApiGeneratedWarningLetter | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [acking, setAcking] = useState(false);

  const load = useCallback(async () => {
    if (!Number.isInteger(id) || id <= 0) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const data = await residentApi.warningLetter(id);
      setLetter(data);
      setErr(null);
      if (data.notification_id) {
        local({ type: 'notification/read', id: String(data.notification_id) });
      }
    } catch (e) {
      setErr(errorMessage(e));
    } finally {
      setLoading(false);
    }
  }, [id, local]);

  useEffect(() => { void load(); }, [load]);

  const download = async () => {
    if (!letter) return;
    try {
      await residentApi.downloadWarningLetter(letter.letter_id, letter.warning_reference, 'pdf');
      toast.success(`Downloaded ${letter.warning_reference}.pdf`);
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  const acknowledge = async () => {
    if (!letter?.warning_id || !confirmed) return;
    setAcking(true);
    try {
      await residentApi.acknowledgeWarning(letter.warning_id);
      toast.success('Warning acknowledged');
      await load();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setAcking(false);
    }
  };

  if (loading) return <Screen title="Warning letter" back="/warnings"><ListSkeleton rows={4} /></Screen>;
  if (err) return <Screen title="Warning letter" back="/warnings"><ErrorState onRetry={() => void load()}>{err}</ErrorState></Screen>;
  if (!letter) return <Screen title="Warning letter" back="/warnings"><NotFoundState what="warning letter" to="/warnings" label="Back to Warnings" /></Screen>;

  return (
    <Screen title={letter.warning_reference} subtitle={`${letter.warning_level} · ${letter.case_reference}`} back="/warnings">
      <div className="rs-card rs-stack-sm">
        <div className="rs-row-actions" style={{ justifyContent: 'space-between' }}>
          <span className="rs-pill rs-pill--brand"><ShieldAlert size={14} aria-hidden="true" />{letter.warning_level}</span>
          {letter.viewed_at ? <span className="rs-meta">Viewed {fmtDateTime(letter.viewed_at)}</span> : null}
        </div>
        <dl className="rs-kv">
          <div><dt>Warning reference</dt><dd>{letter.warning_reference}</dd></div>
          <div><dt>Case reference</dt><dd>{letter.case_reference}</dd></div>
          <div><dt>Date issued</dt><dd>{letter.issued_at ? fmtDateTime(letter.issued_at) : '—'}</dd></div>
          <div><dt>Issued by</dt><dd>{letter.issued_by_name}</dd></div>
          {letter.policy_reference ? <div><dt>Policy reference</dt><dd>{letter.policy_reference}</dd></div> : null}
          {letter.pet_name ? <div><dt>Animal</dt><dd>{letter.pet_name}{letter.pet_type ? ` (${letter.pet_type})` : ''}</dd></div> : null}
        </dl>
        <div className="rs-row-actions">
          <Button variant="primary" size="sm" icon={Download} onClick={() => void download()}>Download PDF</Button>
          {letter.attachment_url ? (
            <a
              href={letter.attachment_url}
              target="_blank"
              rel="noopener noreferrer"
              className="rs-btn rs-btn--secondary rs-btn--sm"
            >
              <Download size={15} aria-hidden="true" />
              {letter.attachment_name || 'Attached document'}
            </a>
          ) : null}
        </div>
      </div>

      <Section title="Official warning letter">
        <WarningLetterDocument
          legacyLayout={letter.legacy_layout}
          subdivisionName={letter.subdivision_name || letter.placeholders?.subdivision_name}
          subdivisionAddress={letter.subdivision_address || letter.placeholders?.subdivision_address}
          subdivisionPhone={letter.subdivision_phone || letter.placeholders?.subdivision_phone}
          subdivisionEmail={letter.subdivision_email || letter.placeholders?.subdivision_email}
          warningLevel={letter.warning_level}
          warningReference={letter.warning_reference}
          caseReference={letter.case_reference}
          issueDate={letter.placeholders?.issue_date || (letter.issued_at ? fmtDateTime(letter.issued_at) : '—')}
          recipientName={letter.recipient_name}
          recipientAddress={letter.recipient_address}
          subject={letter.rendered_subject}
          body={letter.rendered_body}
          issuerName={letter.issuer_name || letter.placeholders?.issuer_name || letter.issued_by_name}
          issuerRole={letter.issuer_role || letter.placeholders?.issuer_role}
        />
      </Section>

      {letter.warning_id ? (
        letter.warning_status === 'Acknowledged' ? (
          <Callout tone="sage" title="Notice acknowledged">
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <CheckCircle2 size={15} aria-hidden="true" />
              Acknowledged{letter.acknowledged_at ? ` on ${fmtDateTime(letter.acknowledged_at)}` : ''}.
            </span>
          </Callout>
        ) : (
          <Section title="Acknowledge receipt">
            <div className="rs-card rs-stack-sm">
              <Checkbox
                label="I have read and understood this official warning notice."
                checked={confirmed}
                onChange={(e) => setConfirmed(e.target.checked)}
              />
              <Button variant="primary" disabled={!confirmed} loading={acking} onClick={() => void acknowledge()}>
                Acknowledge warning
              </Button>
            </div>
          </Section>
        )
      ) : null}
    </Screen>
  );
}
