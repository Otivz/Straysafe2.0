import { useCallback, useEffect, useState } from 'react';
import { Download, ShieldAlert } from 'lucide-react';
import { fmtDateTime } from '../../../preview/lib/format';
import { errorMessage } from '../../../preview/lib/errors';
import { Screen } from '../../components/Screen';
import { useToast } from '../../components/toast';
import { Button, Callout, EmptyState, ErrorState, ListSkeleton, Row, Section } from '../../components/ui';
import { useResidentData } from '../../data/context';
import { residentApi, type ApiGeneratedWarningLetter } from '../../live/api';

/** Resident Warning History: lists every official warning letter issued to this resident. */
export default function WarningsPage() {
  const { state } = useResidentData();
  const toast = useToast();
  const [items, setItems] = useState<ApiGeneratedWarningLetter[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!state.profile.id) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const res = await residentApi.myWarningLetters();
      setItems(res.items);
      setErr(null);
    } catch (e) {
      setErr(errorMessage(e));
    } finally {
      setLoading(false);
    }
  }, [state.profile.id]);

  useEffect(() => { void load(); }, [load]);

  const dl = async (w: ApiGeneratedWarningLetter) => {
    try {
      await residentApi.downloadWarningLetter(w.letter_id, w.warning_reference, 'pdf');
      await load();
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  return (
    <Screen title="Warnings & notices" back="/home">
      {loading ? <ListSkeleton rows={3} /> : null}
      {!loading && err ? <ErrorState onRetry={() => void load()}>{err}</ErrorState> : null}
      {!loading && !err && items.length === 0 ? (
        <EmptyState icon={ShieldAlert} title="No official warnings">
          You have no warnings or official notices on your account.
        </EmptyState>
      ) : null}

      {!loading && !err && items.length > 0 ? (
        <>
          {items.some((x) => !x.viewed_at || x.warning_status === 'Pending') ? (
            <Callout tone="amber" title="Official notices require your attention">
              Tap any warning below to view the full letter, download a PDF copy, and acknowledge receipt.
            </Callout>
          ) : null}
          <Section title={`Warning history (${items.length})`}>
            <div className="rs-stack-sm">
              {items.map((w) => {
                const summary = w.warning_subject || w.rendered_subject || w.placeholders?.violation_description;
                return (
                  <div key={w.letter_id} className="rs-card rs-stack-sm">
                    <Row
                      to={`/warnings/${w.letter_id}`}
                      icon={ShieldAlert}
                      title={`${w.warning_level} · ${w.warning_reference}`}
                      meta={`${w.warning_category ? `${w.warning_category} · ` : ''}${w.case_reference}${w.pet_name ? ` · ${w.pet_name}` : ''} · Issued ${w.issued_at ? fmtDateTime(w.issued_at) : ''}`}
                      trailing={!w.viewed_at ? <span className="rs-pill rs-pill--brand">New</span> : w.warning_status === 'Acknowledged' ? <span className="rs-meta">Acknowledged</span> : undefined}
                    />
                    <p className="rs-sub" style={{ paddingLeft: 4 }}>{summary}</p>
                    <div className="rs-row-actions">
                      <Button size="sm" icon={Download} onClick={() => void dl(w)}>Download PDF</Button>
                    </div>
                  </div>
                );
              })}
            </div>
          </Section>
        </>
      ) : null}
    </Screen>
  );
}
