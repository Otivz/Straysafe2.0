import { lazy, Suspense, useState } from 'react';
import { LocateFixed, MapPin } from 'lucide-react';
import { checkReportingArea, landmarkLabel, nearestLandmark, registeredLandmarks, reportingCoverage, type Landmark } from '../../preview/geo';
import { MapLegend } from '../../preview/map/MapLegend';
import { locationErrorMessage } from '../../utils/geolocationDefaults';
import type { GeoPoint } from '../data/types';
import { useFormFocus } from '../lib/hooks';
import { PINNED_LABEL, pointOf } from '../lib/location';
import { publicTextProblem } from '../lib/publicText';
import { Field, Input } from './form';
import { Button, Callout, Skeleton } from './ui';

const LocationMap = lazy(() => import('./LocationMap'));

type Geo =
  | { state: 'idle' }
  | { state: 'locating' }
  | { state: 'found'; accuracy: number }
  | { state: 'outside'; distanceM: number }
  | { state: 'problem'; message: string };

const nearest10 = (m: number) => Math.round(m / 10) * 10;
const autoLabel = (lat: number, lng: number) => { const l = nearestLandmark(lat, lng); return l ? landmarkLabel(l) : ''; };

/**
 * Where the animal was seen. It is the animal's location, not necessarily the resident's own. Works three ways so it is
 * always usable: tap the map, describe the place, or use the current position (when permitted).
 *
 * A spot can be reported when it is inside the reporting area: a radius around the subdivision centre, the same rule the
 * server applies. The orange outline on the map is approximate and only for orientation; it decides nothing.
 *
 * `publicText` is for places that neighbours will read (lost and found notices, sightings): the place name is then required
 * and checked for phone numbers, emails and exact addresses before it can be confirmed.
 */
export function LocationPicker({ initial, onConfirm, confirmLabel = 'Confirm location', publicText = false }: {
  initial: GeoPoint | null;
  onConfirm: (g: GeoPoint) => void;
  confirmLabel?: string;
  publicText?: boolean;
}) {
  const [pin, setPin] = useState<{ lat: number; lng: number } | null>(pointOf(initial));
  const [text, setText] = useState(initial?.label ?? '');
  const [touched, setTouched] = useState(initial?.manual ?? false);
  const [geo, setGeo] = useState<Geo>({ state: 'idle' });
  const [tilesFailed, setTilesFailed] = useState(false);
  const [error, setError] = useState<string>();
  const [labelError, setLabelError] = useState<string>();
  const { ref, invalid } = useFormFocus();
  const landmarks = registeredLandmarks();
  const radius = reportingCoverage().radius_meters;
  const check = pin ? checkReportingArea(pin.lat, pin.lng) : null;

  const place = (lat: number, lng: number, fromGps = false) => {
    setPin({ lat, lng });
    setError(undefined);
    setLabelError(undefined);
    if (!fromGps) setGeo((g) => (g.state === 'found' ? { state: 'idle' } : g)); // moved by hand: no longer "the GPS fix"
    if (!touched) setText(autoLabel(lat, lng));
  };

  const pickLandmark = (l: Landmark) => {
    setTouched(false);
    setText(landmarkLabel(l));
    place(l.lat, l.lng);
  };

  const locate = () => {
    if (typeof window !== 'undefined' && window.isSecureContext === false) {
      setGeo({ state: 'problem', message: 'Your location can only be read on a secure (https) page. Tap the map to place the pin instead.' });
      return;
    }
    if (!('geolocation' in navigator)) { setGeo({ state: 'problem', message: locationErrorMessage(null) }); return; }
    setGeo({ state: 'locating' });
    // No options on purpose: utils/geolocationDefaults gives every request a 15 s limit, a 30 s cached fix and high accuracy.
    navigator.geolocation.getCurrentPosition(
      (p) => {
        const { latitude, longitude, accuracy } = p.coords;
        const where = checkReportingArea(latitude, longitude);
        if (!where.inside) { setGeo({ state: 'outside', distanceM: where.distanceM }); return; }
        place(latitude, longitude, true);
        setGeo({ state: 'found', accuracy: Math.round(accuracy || 0) });
      },
      (err) => setGeo({ state: 'problem', message: locationErrorMessage(err) }),
    );
  };

  const confirm = () => {
    if (pin && check && !check.inside) { setError('Move the pin inside the reporting area to continue.'); return; }
    const typed = text.trim();
    // The server files every report at a position, so the pin is required.
    if (!pin) { setError('Tap the map to place the pin, or use your location. The subdivision needs a position to follow up.'); invalid(); return; }
    if (publicText && typed.length < 3) { setLabelError('Add a few words about the place, for example “next to the main entrance gate”. Neighbours see these words and a general area, not your pin.'); invalid(); return; }
    const label = typed || PINNED_LABEL;
    const problem = publicText ? publicTextProblem(label) : null;
    if (problem) { setLabelError(problem); invalid(); return; }
    onConfirm({ label, lat: pin?.lat ?? null, lng: pin?.lng ?? null, manual: touched || !pin });
  };

  return (
    <div className="rs-stack">
      <p className="rs-sub">Choose where the animal was <strong>seen</strong>. This may not be where you are now.</p>

      <div ref={ref}>
        <Field label="Describe the place" hint={publicText ? 'Neighbours see these words and a general area, not your exact pin.' : 'In your own words, such as what the spot is next to.'} error={labelError ?? (error && !pin ? error : undefined)}>
          <Input value={text} onChange={(e) => { setText(e.target.value); setTouched(true); setError(undefined); setLabelError(undefined); }} placeholder="Next to the main entrance gate" autoComplete="off" />
        </Field>
      </div>
      {landmarks.length > 0 ? (
        <div className="rs-chips rs-chips--scroll" role="group" aria-label="Registered landmarks">
          {landmarks.map((l) => <button key={l.id} type="button" className="rs-chip rs-chip--btn" onClick={() => pickLandmark(l)}>{l.name}</button>)}
        </div>
      ) : null}

      <Button icon={LocateFixed} block loading={geo.state === 'locating'} onClick={locate}>Use my current location</Button>
      {geo.state === 'found' ? (
        <Callout tone={geo.accuracy > 100 ? 'amber' : 'sage'}>
          {geo.accuracy <= 0 ? 'Location found. Drag the pin if it is not exactly right.'
            : geo.accuracy > 100 ? `Location found, but only accurate to about ${geo.accuracy} m. Drag the pin to the exact spot.`
              : `Location found (accurate to about ${geo.accuracy} m). Drag the pin if it is not exactly right.`}
        </Callout>
      ) : null}
      {geo.state === 'outside' ? <Callout tone="amber">You seem to be about {nearest10(geo.distanceM)} m from the subdivision centre, outside the reporting area. The pin is for where the animal was seen, so tap the map to place it.</Callout> : null}
      {geo.state === 'problem' ? <Callout tone="amber">{geo.message}</Callout> : null}

      <div>
        <Suspense fallback={<Skeleton h={290} />}>
          <LocationMap pin={pin} onPick={place} onTilesFailed={() => setTilesFailed(true)} />
        </Suspense>
        <MapLegend items={[{ kind: 'outline', label: 'Approximate subdivision outline' }, { kind: 'radius', label: `Reporting area (${radius} m from the centre)` }]} />
        {tilesFailed ? <p className="rs-hint">The map pictures couldn’t load, but the pin and the outlines still work. You can also just describe the place.</p> : <p className="rs-hint">Tap the map to place the pin, then drag it to adjust.</p>}
      </div>

      {pin && check ? (check.inside
        ? <p className="rs-selected"><MapPin size={16} aria-hidden="true" />Pin placed, inside the reporting area.</p>
        : <Callout tone="amber">That spot is about {nearest10(check.distanceM)} m from the subdivision centre. Reports must be within {check.limitM} m, so move the pin closer.</Callout>) : null}
      {error && pin ? <p className="rs-error" role="alert">{error}</p> : null}
      <Button variant="primary" block onClick={confirm}>{confirmLabel}</Button>
    </div>
  );
}
