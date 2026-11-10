/**
 * Connection Settings: DEBUG APK ONLY (`vite build --mode android-debug`; see src/utils/buildMode.ts and
 * docs/05-operations/ANDROID_RESIDENT_APP.md). Lets the developer point the installed app at another backend (a computer on the same
 * Wi-Fi, or an https tunnel) without rebuilding the APK. This file is reached only through lazy imports that Vite drops from every
 * other build, so a release or web bundle does not contain it.
 *
 * Changing the backend signs the person out and removes what the app stored for the old one (utils/devBackend.ts), then reloads:
 * utils/api.ts reads the address once, when the page loads, and every request uses it.
 */
import { useEffect, useState } from 'react';
import { Server } from 'lucide-react';
import { RESIDENT_LIVE_BASE } from '../../live/config';
import { API_BASE_URL, clearAuthStorage } from '../../utils/api';
import {
  parseBackendUrl, pageBlocksAddress, shortBackend, switchBackend, testBackend, readDevBackend,
  type BackendCheck,
} from '../../utils/devBackend';
import { Field, Input } from '../components/form';
import { PrimaryScreen, Screen } from '../components/Screen';
import { Sheet } from '../components/Sheet';
import { Button, Callout, Pill } from '../components/ui';

type Result = BackendCheck | 'running' | null;

/** The one-line verdict of a connection check, for the status row. */
function StatusPill({ result }: { result: Result }) {
  if (result === 'running' || result === null) return <Pill>Checking…</Pill>;
  if (result.status === 'compatible') return <Pill tone="sage" dot>Reachable</Pill>;
  return <Pill tone="red" dot>{result.status === 'incompatible' ? 'Not StraySafe' : 'Not reachable'}</Pill>;
}

function Body() {
  // What the app is calling right now (empty on the very first launch of a build that carries no default address).
  const current = API_BASE_URL;
  const savedHere = readDevBackend(localStorage) !== null;
  const [value, setValue] = useState(current);
  const [fieldError, setFieldError] = useState('');
  const [currentCheck, setCurrentCheck] = useState<Result>(current ? 'running' : null);
  const [check, setCheck] = useState<Result>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [pending, setPending] = useState<string | null>(null);   // the new address awaiting "Switch backend"

  // Status of the connection in use: a read-only check, on open.
  useEffect(() => {
    if (!current) return undefined;
    let live = true;
    void testBackend(current).then((r) => { if (live) setCurrentCheck(r); });
    return () => { live = false; };
  }, [current]);

  const parse = () => {
    setNotice('');
    const parsed = parseBackendUrl(value);
    if (!parsed.ok) { setFieldError(parsed.message); return null; }
    const blocked = pageBlocksAddress(parsed.url, window.location.protocol);
    if (blocked) { setFieldError(blocked); return null; }
    setFieldError('');
    return parsed.url;
  };

  const test = async () => {
    const url = parse();
    if (!url) return;
    setBusy(true);
    setCheck('running');
    setCheck(await testBackend(url));
    setBusy(false);
  };

  /** Save & connect: check the address first; `anyway` saves one that failed the check (a server that is not running yet). */
  const save = async (anyway = false) => {
    const url = parse();
    if (!url) return;
    if (url === current) { setNotice('The app is already using this backend.'); return; }
    if (!anyway) {
      setBusy(true);
      setCheck('running');
      const result = await testBackend(url);
      setCheck(result);
      setBusy(false);
      if (result.status !== 'compatible') return;
    }
    if (current) setPending(url);   // an existing connection is being replaced: ask first
    else apply(url);
  };

  const apply = (url: string) => {
    // Sign out locally (this also lets push notifications stop with the old server), forget everything stored for the old backend,
    // keep only the new address, and reload so every request uses it. The person signs in again.
    switchBackend(url, { local: localStorage, session: sessionStorage }, clearAuthStorage);
    window.location.assign(`${RESIDENT_LIVE_BASE}/welcome`);
  };

  const failed = check !== null && check !== 'running' && check.status !== 'compatible';

  return (
    <div className="rs-stack">
      <Callout tone="amber" title="Debug build.">
        Choose the backend this app talks to. Switching signs you out and removes what the app stored for the old backend.
      </Callout>

      <div className="rs-list">
        <div className="rs-row">
          <span className="rs-row__icon"><Server size={19} aria-hidden="true" /></span>
          <span className="rs-row__text">
            <span className="rs-row__title">{current ? shortBackend(current) : 'No backend set'}</span>
            <span className="rs-row__meta">
              {!current ? 'Enter an address below to start' : savedHere ? 'Saved on this phone' : 'Built into this app'}
              {currentCheck && currentCheck !== 'running' && currentCheck.status !== 'compatible' ? ` · ${currentCheck.message}` : ''}
            </span>
          </span>
          {current ? <StatusPill result={currentCheck} /> : null}
        </div>
      </div>

      <Field
        label="Backend API address"
        hint="Your computer on the same Wi-Fi (http://192.168.1.10:8000) or an https tunnel (https://example-tunnel.example.com)."
        error={fieldError}
      >
        <Input
          value={value}
          onChange={(e) => { setValue(e.target.value); setFieldError(''); setCheck(null); setNotice(''); }}
          inputMode="url"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          autoComplete="off"
          placeholder="http://192.168.1.10:8000"
        />
      </Field>

      {check === 'running' ? <Callout>Checking the address…</Callout> : null}
      {check && check !== 'running' ? (
        check.status === 'compatible'
          ? <Callout tone="sage" title="Reachable.">This is a StraySafe backend. Tap Save &amp; connect to use it.</Callout>
          : <Callout tone="red" title={check.status === 'unreachable' ? 'Not reachable.' : check.status === 'network' ? 'Connection failed.' : 'Not the StraySafe API.'}>{check.message}</Callout>
      ) : null}
      {notice ? <Callout tone="sage">{notice}</Callout> : null}

      <div className="rs-stack-sm">
        <Button block disabled={busy} onClick={() => void test()}>Test connection</Button>
        <Button variant="primary" block disabled={busy} onClick={() => void save()}>Save &amp; connect</Button>
        {failed ? <Button variant="ghost" block disabled={busy} onClick={() => void save(true)}>Save anyway (the server is not running yet)</Button> : null}
      </div>

      <Callout title="Not localhost.">
        On a physical phone, <code>localhost</code> and <code>127.0.0.1</code> mean the phone itself, not your computer. For a computer on your Wi-Fi the
        backend must accept other devices (<code>uvicorn --host 0.0.0.0</code>) and the firewall must allow its port.
      </Callout>

      {pending ? (
        <Sheet
          title="Switch backend?"
          description="Switching signs you out and removes the sign-in and other data this app stored for the current backend. You will sign in again on the new one. Nothing is deleted on either server."
          onClose={() => setPending(null)}
          footer={({ requestClose }) => (
            <>
              <Button variant="primary" block onClick={() => apply(pending)}>Switch backend</Button>
              <Button variant="ghost" block onClick={requestClose}>Cancel</Button>
            </>
          )}
        >
          <p className="rs-meta">From <strong>{shortBackend(current)}</strong></p>
          <p className="rs-meta">To <strong>{shortBackend(pending)}</strong></p>
        </Sheet>
      ) : null}
    </div>
  );
}

/** `firstRun`: the build carries no default address and none is saved, so the app cannot start until one is entered. */
export default function ConnectionPage({ firstRun = false }: { firstRun?: boolean }) {
  return firstRun
    ? <PrimaryScreen title="Connect to a backend" lead="This debug build has no backend address yet."><Body /></PrimaryScreen>
    : <Screen title="Connection settings" back="/settings"><Body /></Screen>;
}
