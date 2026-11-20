import { lazy, Suspense, useState, type FormEvent } from 'react';
import { Crosshair, MapPin } from 'lucide-react';
import { areaCenter, checkReportingArea, isValidLatLng, reportingCoverage } from '../../preview/geo';
import { MapLegend } from '../../preview/map/MapLegend';
import type { ReferenceLandmark } from '../components/LandmarkMapPicker';
import { Button } from '../components/Button';
import { Dialog } from '../components/Dialog';
import { Field, Input, Select, Textarea } from '../components/form';
import { Callout, FormError } from '../components/layout';
import { LANDMARK_CATEGORIES } from '../data/constants';
import type { ApiLandmark } from '../live/api';

const LandmarkMapPicker = lazy(() => import('../components/LandmarkMapPicker'));

export interface LandmarkFormValues {
  name: string;
  category: string;
  description: string | null;
  latitude: number;
  longitude: number;
}

const fmtCoord = (n: number) => n.toFixed(6);

/** Add or edit a subdivision landmark with an interactive map pin picker and synced coordinates. */
export function LandmarkDialog({
  landmark,
  otherLandmarks,
  pending,
  submitError,
  onSave,
  onClose,
}: {
  landmark?: ApiLandmark;
  otherLandmarks: ReferenceLandmark[];
  pending: boolean;
  submitError?: string;
  onSave: (values: LandmarkFormValues) => Promise<void>;
  onClose: () => void;
}) {
  const center = areaCenter();
  const initialLat = landmark ? landmark.latitude : center[0];
  const initialLng = landmark ? landmark.longitude : center[1];

  const [name, setName] = useState(landmark?.name ?? '');
  const [category, setCategory] = useState(landmark?.category || 'general');
  const [description, setDescription] = useState(landmark?.description ?? '');
  const [latText, setLatText] = useState(fmtCoord(initialLat));
  const [lngText, setLngText] = useState(fmtCoord(initialLng));
  const [errors, setErrors] = useState<Record<string, string>>({});

  const parsedLat = Number(latText);
  const parsedLng = Number(lngText);
  const validPin = isValidLatLng(latText.trim(), lngText.trim())
    ? { lat: parsedLat, lng: parsedLng }
    : null;
  const radius = reportingCoverage().radius_meters;
  const areaCheck = validPin ? checkReportingArea(validPin.lat, validPin.lng) : null;

  const dirty = landmark
    ? (
        name.trim() !== landmark.name
        || category !== (landmark.category || 'general')
        || description.trim() !== (landmark.description ?? '')
        || fmtCoord(landmark.latitude) !== latText.trim()
        || fmtCoord(landmark.longitude) !== lngText.trim()
      )
    : (name.trim().length > 0 || description.trim().length > 0);

  const pickFromMap = (lat: number, lng: number) => {
    setLatText(fmtCoord(lat));
    setLngText(fmtCoord(lng));
    setErrors((p) => {
      if (!p.coords) return p;
      const next = { ...p };
      delete next.coords;
      return next;
    });
  };

  const categoryKnown = LANDMARK_CATEGORIES.some((c) => c.value === category);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const next: Record<string, string> = {};
    if (name.trim().length < 2) next.name = 'Enter a landmark name (at least 2 characters).';
    if (!validPin) next.coords = 'Place the pin on the map or enter valid latitude and longitude.';
    setErrors(next);
    if (Object.keys(next).length > 0 || !validPin) return;

    void onSave({
      name: name.trim(),
      category: category || 'general',
      description: description.trim() || null,
      latitude: validPin.lat,
      longitude: validPin.lng,
    });
  };

  return (
    <Dialog
      size="lg"
      title={landmark ? `Edit landmark · ${landmark.name}` : 'Add subdivision landmark'}
      description="Click the map or drag the orange pin to place this landmark in its exact spot. Residents see these landmarks when pinpointing reports."
      onClose={onClose}
      dirty={dirty}
      dismissible={!pending}
      onSubmit={submit}
      footer={({ requestClose }) => (
        <>
          <Button type="button" onClick={requestClose} disabled={pending}>Cancel</Button>
          <Button type="submit" variant="primary" loading={pending}>
            {landmark ? 'Save landmark' : 'Add landmark'}
          </Button>
        </>
      )}
    >
      <div className="sa-grid2">
        <Field label="Landmark name" required error={errors.name}>
          <Input
            autoFocus
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              if (errors.name) setErrors((p) => ({ ...p, name: '' }));
            }}
            placeholder="e.g. Selera Homes Main Entrance Gate"
          />
        </Field>
        <Field label="Category" hint="Helps organize gates, parks, and street corners.">
          <Select value={category} onChange={(e) => setCategory(e.target.value)}>
            {!categoryKnown ? <option value={category}>{category}</option> : null}
            {LANDMARK_CATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>{c.label}</option>
            ))}
          </Select>
        </Field>
      </div>

      <Field label="Notes or directions" optional hint="Short helper text such as nearest block, phase, or street.">
        <Textarea
          rows={2}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="e.g. Main guardhouse beside Phase 1 entrance"
        />
      </Field>

      <div className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="sa-label flex items-center gap-1.5">
            <MapPin size={14} aria-hidden="true" />
            Position on map
          </span>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            icon={Crosshair}
            onClick={() => pickFromMap(center[0], center[1])}
          >
            Center pin on subdivision
          </Button>
        </div>

        <Suspense fallback={<div className="pv-map pv-map--loading" style={{ height: 260 }} role="status" aria-label="Loading map" />}>
          <LandmarkMapPicker pin={validPin} onPick={pickFromMap} otherLandmarks={otherLandmarks} height={260} />
        </Suspense>
        <MapLegend
          items={[
            { kind: 'pin', label: 'Selected landmark (click map or drag)' },
            ...(otherLandmarks.length > 0 ? [{ kind: 'dot' as const, label: 'Other subdivision landmarks' }] : []),
            { kind: 'outline', label: 'Approximate subdivision outline' },
            { kind: 'radius', label: `Reporting area (${radius} m)` },
          ]}
        />
      </div>

      <div className="sa-grid2">
        <Field label="Latitude" required error={errors.coords}>
          <Input
            type="number"
            step="0.000001"
            value={latText}
            onChange={(e) => {
              setLatText(e.target.value);
              if (errors.coords) setErrors((p) => ({ ...p, coords: '' }));
            }}
            placeholder="14.801496"
          />
        </Field>
        <Field label="Longitude" required>
          <Input
            type="number"
            step="0.000001"
            value={lngText}
            onChange={(e) => {
              setLngText(e.target.value);
              if (errors.coords) setErrors((p) => ({ ...p, coords: '' }));
            }}
            placeholder="121.005174"
          />
        </Field>
      </div>

      {areaCheck ? (
        areaCheck.inside ? (
          <Callout tone="sage">
            Inside the reporting area ({Math.round(areaCheck.distanceM)} m from the subdivision centre).
          </Callout>
        ) : (
          <Callout tone="amber">
            About {Math.round(areaCheck.distanceM)} m from the subdivision centre (outside the {areaCheck.limitM} m reporting radius). Verify the pin is in the right spot before saving.
          </Callout>
        )
      ) : null}

      {submitError ? <FormError message={submitError} /> : null}
    </Dialog>
  );
}
