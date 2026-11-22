import { useState, type FormEvent } from 'react';
import { useLocation } from 'react-router-dom';
import { CheckCircle2, Clock, Hourglass, LogIn, MailCheck, ShieldAlert } from 'lucide-react';
import { residentApplications } from '../../auth/applications';
import { Field, Input, PasswordInput } from '../../components/form';
import { Button, Callout, EmptyState, FormError, LinkButton } from '../../components/ui';
import { residentPath } from '../../config';
import { useSubmit } from '../../lib/hooks';
import { AuthShell } from './AuthShell';

interface Detail {
  code?: string; message?: string; reason?: string | null; can_resubmit?: boolean;
  details?: { full_name?: string; contact_number?: string | null; block_number?: string; lot_number?: string };
}

/**
 * Where a self-registered account stands: waiting for the residency review, or not approved (with the reason, and a way to correct the
 * details and ask again on the same account). It opens from sign-in or right after the e-mail code; no session exists here.
 */
export default function RegistrationStatusPage() {
  const state = (useLocation().state ?? null) as { detail?: Detail; email?: string } | null;
  const detail = state?.detail ?? null;
  const email = state?.email ?? '';
  const [sent, setSent] = useState<string | null>(null);
  const d = detail?.details ?? {};
  const [v, setV] = useState({ name: d.full_name ?? '', contact: d.contact_number ?? '', block: d.block_number ?? '', lot: d.lot_number ?? '', password: '' });
  const { pending, error, run } = useSubmit();

  if (!detail) {
    return (
      <AuthShell title="Registration status" back="/welcome">
        <div className="rounded-2xl border border-[#e7e2da] bg-gradient-to-b from-white to-[#fcfaf6] p-5 text-center shadow-xs">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl border border-[#fed7aa]/70 bg-[#fff7ed] text-[#b45309]">
            <MailCheck size={22} aria-hidden="true" />
          </div>
          <h2 className="m-0 text-base font-semibold text-[#1c1917]">Sign in to see your status</h2>
          <p className="mt-1.5 mb-4 text-xs leading-relaxed text-[#57534e]">
            Your registration status is shown after you sign in with your email and password.
          </p>
          <LinkButton variant="primary" block icon={LogIn} to={residentPath('/login')}>
            Sign in
          </LinkButton>
        </div>
      </AuthShell>
    );
  }

  if (detail.code !== 'RESIDENCY_REJECTED' || sent) {
    return (
      <AuthShell title="Awaiting verification" back="/login">
        <style>{`
          @keyframes rsFadeUp {
            from { opacity: 0; transform: translateY(8px); }
            to { opacity: 1; transform: translateY(0); }
          }
          .rs-fade-up {
            animation: rsFadeUp 300ms cubic-bezier(0.16, 1, 0.3, 1) both;
          }
        `}</style>
        <div className="rs-fade-up space-y-4">
          <div className="rounded-2xl border border-[#e7e2da] bg-gradient-to-b from-white to-[#fcfaf6] p-5 text-center shadow-xs">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl border border-[#fed7aa] bg-[#fff7ed] text-[#b45309] shadow-xs">
              <Hourglass size={22} aria-hidden="true" />
            </div>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-[#fde68a] bg-[#fffbeb] px-2.5 py-0.5 text-[11px] font-semibold text-[#92400e]">
              <Clock size={11} aria-hidden="true" />
              Pending Admin Review
            </span>
            <h2 className="mt-2.5 mb-1.5 text-base font-semibold text-[#1c1917]">
              Your account is awaiting residency verification
            </h2>
            <p className="m-0 text-xs leading-relaxed text-[#57534e]">
              {sent ?? detail.message ?? 'Your email has been verified. An authorized Subdivision Administrator will review your registration and notify you once approved.'}
            </p>
          </div>

          <div className="rounded-2xl border border-[#e7e2da] bg-white p-4 shadow-xs">
            <p className="m-0 mb-3 text-[11px] font-semibold uppercase tracking-wide text-[#78716c]">
              Verification progress
            </p>
            <ol className="m-0 flex list-none flex-col gap-3 p-0">
              <li className="flex items-start gap-2.5">
                <CheckCircle2 size={17} className="mt-0.5 shrink-0 text-emerald-600" aria-hidden="true" />
                <div>
                  <p className="m-0 text-xs font-semibold text-[#1c1917]">Account details submitted</p>
                  <p className="m-0 text-[11px] text-[#57534e]">Your profile and block/lot details are saved.</p>
                </div>
              </li>
              <li className="flex items-start gap-2.5">
                <CheckCircle2 size={17} className="mt-0.5 shrink-0 text-emerald-600" aria-hidden="true" />
                <div>
                  <p className="m-0 text-xs font-semibold text-[#1c1917]">Email verified</p>
                  <p className="m-0 text-[11px] text-[#57534e]">Your email address has been confirmed.</p>
                </div>
              </li>
              <li className="flex items-start gap-2.5">
                <Hourglass size={17} className="mt-0.5 shrink-0 text-[#b45309]" aria-hidden="true" />
                <div>
                  <p className="m-0 text-xs font-semibold text-[#92400e]">Subdivision residency review</p>
                  <p className="m-0 text-[11px] text-[#57534e]">Waiting for Subdivision Administrator approval.</p>
                </div>
              </li>
            </ol>
          </div>

          <div className="space-y-2">
            <LinkButton variant="primary" block icon={LogIn} to={residentPath('/login')}>
              Back to sign in
            </LinkButton>
            <p className="m-0 text-center text-xs text-[#78716c]">
              You can sign in again any time to check your approval status.
            </p>
          </div>
        </div>
      </AuthShell>
    );
  }

  const submit = (ev: FormEvent) => {
    ev.preventDefault();
    void run(async () => {
      const r = await residentApplications.resubmit(email, v.password, { fullName: v.name, contact: v.contact, block: v.block, lot: v.lot });
      setV((p) => ({ ...p, password: '' }));
      setSent(r.message);
    });
  };

  return (
    <AuthShell title="Registration not approved" back="/login">
      <EmptyState tone="amber" icon={ShieldAlert} title="Your registration was not approved">{detail.message}</EmptyState>
      {detail.reason ? <Callout tone="amber" title="Reason given">{detail.reason}</Callout> : null}
      {detail.can_resubmit ? (
        <form className="rs-stack" onSubmit={submit} noValidate>
          <p className="rs-sub">If some details were wrong, correct them and ask for another review. Your email stays the same.</p>
          {error ? <FormError message={error} /> : null}
          <Field label="Full name"><Input value={v.name} onChange={(e) => setV((p) => ({ ...p, name: e.target.value }))} maxLength={100} /></Field>
          <Field label="Contact number" optional><Input inputMode="tel" value={v.contact} onChange={(e) => setV((p) => ({ ...p, contact: e.target.value }))} maxLength={20} /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Block number"><Input value={v.block} onChange={(e) => setV((p) => ({ ...p, block: e.target.value }))} maxLength={30} /></Field>
            <Field label="Lot number"><Input value={v.lot} onChange={(e) => setV((p) => ({ ...p, lot: e.target.value }))} maxLength={30} /></Field>
          </div>
          <Field label="Your password" hint="To confirm it is you."><PasswordInput value={v.password} onChange={(e) => setV((p) => ({ ...p, password: e.target.value }))} autoComplete="current-password" /></Field>
          <Button type="submit" variant="primary" block loading={pending} disabled={!v.password || !v.name.trim() || !v.block.trim() || !v.lot.trim()}>Ask for another review</Button>
        </form>
      ) : <p className="rs-sub rs-center">Please contact your Subdivision Leader for help.</p>}
    </AuthShell>
  );
}
