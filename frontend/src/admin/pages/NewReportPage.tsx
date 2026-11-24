import { lazy, Suspense, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { Check, ChevronDown, FileText, Loader2, LocateFixed, MapPin, Upload, UserCheck } from 'lucide-react';
import { AiSuggestedTag, AutoTag } from '../components/AutoTag';
import { ResidentCombobox } from '../components/ResidentCombobox';
import { adminPath } from '../config';
import { Button } from '../components/Button';
import { Field, Input, OptionGroup, Textarea } from '../components/form';
import { Block, Callout, FormError, PageHeader, Panel } from '../components/layout';
import { useToast } from '../components/toast';
import type { ReferenceLandmark } from '../components/LandmarkMapPicker';
import { ANIMAL_TYPES, CATEGORIES } from '../data/constants';
import { useAdminData } from '../data/context';
import type { AnimalType, CategoryId } from '../data/types';
import { adminApi, type ReportChannel } from '../live/api';
import { checkReportingArea } from '../../preview/geo';
import { getBreedsForAnimalType } from '../../resident/data/breeds';
import { usePageTitle } from '../lib/hooks';
import { useSubmit } from '../lib/useSubmit';
import { caseRef } from '../../live/refs';
import {
  analyzeReportMedia, animalIdOf, appearanceNoteOf, colorTextOf, isUsableAnalysis, looksAiGenerated, matchBreed, pickAnalyzableFile, sizeOf,
  type MediaAnalysis,
} from '../../live/mediaAnalysis';
import { AdminApiError } from '../../preview/lib/errors';

type AiField = 'animal' | 'animalColor' | 'animalBreed' | 'animalSize' | 'animalCondition';
type Analysis = { status: 'idle' } | { status: 'busy' } | { status: 'done'; result: MediaAnalysis } | { status: 'failed'; message: string };

const LandmarkMapPicker = lazy(() => import('../components/LandmarkMapPicker'));

type Who = 'self' | 'other';
type OtherChannel = Exclude<ReportChannel, 'self'>;
const CHANNELS: { value: OtherChannel; label: string }[] = [
  { value: 'call', label: 'Phone call' }, { value: 'walk_in', label: 'Walk-in' }, { value: 'message', label: 'Text / message' }, { value: 'other', label: 'Other' },
];
// A Lost Pet report is about a registered pet and is filed by its owner in the app, so it is not offered here.
const FILEABLE: CategoryId[] = ['found_animal', 'nuisance', 'safety', 'injured', 'other'].filter((c) => c in CATEGORIES) as CategoryId[];

/** "YYYY-MM-DDTHH:mm" in local time, for <input type="datetime-local">. */
const localNow = () => { const d = new Date(); d.setSeconds(0, 0); return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16); };

/** Distance in metres between two points (small distances; good enough to find the nearest landmark). */
function metres(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const k = 111_320;
  const dx = (a.lng - b.lng) * k * Math.cos(((a.lat + b.lat) / 2) * (Math.PI / 180));
  const dy = (a.lat - b.lat) * k;
  return Math.hypot(dx, dy);
}

function DropdownSelect({
  label,
  value,
  placeholder = 'Choose…',
  options,
  onChange,
}: {
  label: string;
  value: string;
  placeholder?: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const selected = options.find((o) => o.value === value) ?? null;

  useEffect(() => {
    const onPointerDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, []);

  const pick = (v: string) => {
    onChange(v);
    setOpen(false);
  };

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={label}
        onClick={() => {
          const idx = Math.max(0, options.findIndex((o) => o.value === value));
          setActiveIndex(idx);
          setOpen((o) => !o);
        }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            setOpen(true);
            setActiveIndex((i) => Math.min(options.length - 1, i + 1));
          } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setOpen(true);
            setActiveIndex((i) => Math.max(0, i - 1));
          } else if (e.key === 'Enter' && open) {
            e.preventDefault();
            const opt = options[activeIndex];
            if (opt) pick(opt.value);
          } else if (e.key === 'Escape') {
            setOpen(false);
          }
        }}
        className="sa-input flex w-full items-center justify-between gap-2 text-left"
      >
        <span className={selected ? 'truncate text-[var(--sa-ink)]' : 'truncate text-[var(--sa-ink-3)]'}>
          {selected ? selected.label : placeholder}
        </span>
        <ChevronDown
          size={15}
          className={`shrink-0 text-[var(--sa-ink-3)] transition-transform duration-150 ${open ? 'rotate-180' : ''}`}
          aria-hidden="true"
        />
      </button>

      {open ? (
        <ul
          role="listbox"
          className="absolute left-0 right-0 top-full z-40 mt-1.5 max-h-60 overflow-y-auto rounded-[var(--sa-radius)] border border-[#e7e2da] bg-white p-1 shadow-lg"
        >
          {options.map((opt, idx) => {
            const isSelected = opt.value === value;
            const isActive = idx === activeIndex;
            return (
              <li key={opt.value} role="option" aria-selected={isSelected}>
                <button
                  type="button"
                  onMouseEnter={() => setActiveIndex(idx)}
                  onClick={() => pick(opt.value)}
                  className={`flex w-full items-center justify-between gap-2 rounded-md px-3 py-2 text-left text-[13.5px] transition-colors ${
                    isActive ? 'bg-[#fbf6ee] text-[var(--sa-ink)]' : 'text-[var(--sa-ink-2)] hover:bg-[#fbf6ee]'
                  }`}
                >
                  <span className={isSelected ? 'font-semibold text-[var(--sa-ink)]' : 'font-medium'}>{opt.label}</span>
                  {isSelected ? <Check size={14} className="shrink-0 text-[var(--sa-brand)]" /> : null}
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}

/**
 * A06 — File a report. The Subdivision Leader records a concern they saw themselves, or one a person told them about (a call, a visit,
 * a message). The case then reads "Reported by Subdivision Leader" or "Reported by Kyla · via call". Fields are filled from what the
 * system already knows (the chosen resident's name and number, the time, the Leader's location for their own sighting, the nearest
 * landmark) only while they are empty and untouched; every one can be changed before filing.
 */
export default function NewReportPage() {
  usePageTitle('File a report');
  const { state, reload } = useAdminData();
  const navigate = useNavigate();
  const toast = useToast();
  const { pending, error, run } = useSubmit();

  const [who, setWho] = useState<Who>('self');
  const [channel, setChannel] = useState<OtherChannel>('call');
  const [residentId, setResidentId] = useState('');
  const [name, setName] = useState('');
  const [contact, setContact] = useState('');
  const [category, setCategory] = useState<CategoryId | ''>('');
  const [animal, setAnimal] = useState<AnimalType | ''>('');
  const [animalColor, setAnimalColor] = useState('');
  const [animalBreed, setAnimalBreed] = useState('');
  const [animalSize, setAnimalSize] = useState('');
  const [animalCondition, setAnimalCondition] = useState('');
  const [description, setDescription] = useState('');
  const [seenAt, setSeenAt] = useState(localNow);
  const [pin, setPin] = useState<{ lat: number; lng: number } | null>(null);
  const [place, setPlace] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  // Which fields hold a value the system filled in (shown with a tag) and which the Leader has typed (never overwritten).
  const [auto, setAuto] = useState<Record<string, boolean>>({ seenAt: true });
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [categoryIds, setCategoryIds] = useState<Partial<Record<CategoryId, number>>>({});
  const [enabled, setEnabled] = useState<CategoryId[] | null>(null);
  const [landmarks, setLandmarks] = useState<ReferenceLandmark[]>([]);
  // The Leader's own sighting starts at where they are now: the first reading is asked for as the page opens.
  const [geo, setGeo] = useState<'idle' | 'busy' | 'failed' | 'outside'>(() => ('geolocation' in navigator ? 'busy' : 'idle'));

  // The photo check (POST /reports/analyze-media): runs in the background, fills only untouched animal fields, never blocks filing.
  const [analysis, setAnalysis] = useState<Analysis>({ status: 'idle' });
  const [ai, setAi] = useState<Partial<Record<AiField, boolean>>>({});
  const analysisRun = useRef(0);

  // Latest values for callbacks that finish later (a location reading, the landmark list, the photo check): they must see what the Leader typed since.
  const latest = useRef({ touched, auto, name, contact, place, pin, landmarks, ai, animal, animalColor, animalBreed, animalSize, animalCondition });
  latest.current = { touched, auto, name, contact, place, pin, landmarks, ai, animal, animalColor, animalBreed, animalSize, animalCondition };

  const touch = (key: string) => {
    setTouched((t) => ({ ...t, [key]: true })); setAuto((a) => ({ ...a, [key]: false })); setAi((a) => ({ ...a, [key]: false })); setErrors((e) => ({ ...e, [key]: '' }));
  };

  /** Use the photo check's answer: a field is filled only while it is empty (or still holds an earlier AI suggestion) and untouched. */
  const applyAnalysis = (result: MediaAnalysis) => {
    if (!isUsableAnalysis(result)) return;
    const now = latest.current;
    const free = (key: AiField) => !now.touched[key] && (!String(now[key]).trim() || Boolean(now.ai[key]));
    const filled: Partial<Record<AiField, boolean>> = {};
    const aiAnimal = animalIdOf(result);
    let animalFor = now.animal;
    if (aiAnimal && free('animal')) { setAnimal(aiAnimal); animalFor = aiAnimal; filled.animal = true; }
    const color = colorTextOf(result);
    if (color && free('animalColor')) { setAnimalColor(color.slice(0, 120)); filled.animalColor = true; }
    const breed = matchBreed(result.possible_breed, getBreedsForAnimalType(animalFor || aiAnimal));
    if (breed && free('animalBreed')) { setAnimalBreed(breed); filled.animalBreed = true; }
    const size = sizeOf(result);
    if (size && free('animalSize')) { setAnimalSize(size); filled.animalSize = true; }
    const note = appearanceNoteOf(result);
    if (note && free('animalCondition')) { setAnimalCondition(note.slice(0, 255)); filled.animalCondition = true; }
    if (Object.keys(filled).length) { setAi((a) => ({ ...a, ...filled })); setErrors((e) => ({ ...e, ...(filled.animal ? { animal: '' } : {}) })); }
  };

  const analyze = (file: File | null) => {
    const run = ++analysisRun.current;
    if (!file) { setAnalysis({ status: 'idle' }); return; }
    setAnalysis({ status: 'busy' });
    analyzeReportMedia(file).then(
      (result) => {
        if (run !== analysisRun.current) return;           // a newer photo was chosen meanwhile
        setAnalysis({ status: 'done', result });
        applyAnalysis(result);
      },
      (err: unknown) => {
        if (run !== analysisRun.current) return;
        const busy = err instanceof AdminApiError && err.status === 429;
        setAnalysis({ status: 'failed', message: busy ? 'The photo check is busy right now.' : 'The photo could not be checked.' });
      },
    );
  };
  const chooseFiles = (next: File[]) => { setFiles(next); analyze(pickAnalyzableFile(next)); };
  /** Fill a field from the system only while the Leader has not typed in it (an earlier auto-filled value may be replaced). */
  const fill = (key: 'name' | 'contact' | 'place', set: (v: string) => void, value: string | null | undefined) => {
    const now = latest.current;
    if (!value || now.touched[key] || (now[key].trim() && !now.auto[key])) return;
    set(value);
    setAuto((a) => ({ ...a, [key]: true }));
  };
  /** The nearest landmark (within 200 m) names the place. */
  const nameThePlace = (at: { lat: number; lng: number } | null, list: ReferenceLandmark[]) => {
    if (!at || list.length === 0) return;
    const near = list.map((l) => ({ l, d: metres(at, { lat: l.latitude, lng: l.longitude }) })).sort((a, b) => a.d - b.d)[0];
    if (near && near.d <= 200) fill('place', setPlace, `Near ${near.l.name}`);
  };

  useEffect(() => {
    let live = true;
    adminApi.categories().then((c) => {
      if (!live) return;
      const ids: Partial<Record<CategoryId, number>> = {};
      for (const k of c.categories) if (k.category_id) ids[k.id] = k.category_id;
      setCategoryIds(ids);
      setEnabled(c.categories.filter((k) => k.enabled && k.category_id).map((k) => k.id));
      if (c.subdivision_id) adminApi.landmarks(c.subdivision_id).then((ls) => {
        if (!live) return;
        const list = ls.map((l) => ({ landmark_id: l.landmark_id, name: l.name, latitude: Number(l.latitude), longitude: Number(l.longitude) }));
        setLandmarks(list);
        nameThePlace(latest.current.pin, list);
      }, () => undefined);
    }, () => { if (live) setEnabled(null); });
    // The first location reading, for the Leader's own sighting (only auto-pin if inside the subdivision area)
    if ('geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        (p) => {
          if (!live) return;
          if (checkReportingArea(p.coords.latitude, p.coords.longitude).inside) {
            placePin({ lat: p.coords.latitude, lng: p.coords.longitude }, 'auto');
          }
          setGeo('idle');
        },
        () => { if (live) setGeo('failed'); },
        { enableHighAccuracy: true, timeout: 15_000, maximumAge: 30_000 },
      );
    }
    return () => { live = false; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const residents = useMemo(() => [...state.residents].filter((r) => r.status === 'active').sort((a, b) => a.name.localeCompare(b.name)), [state.residents]);
  const options = (enabled ?? FILEABLE).filter((c) => FILEABLE.includes(c));

  // Choosing a registered resident fills the name and number from their account
  const chooseResident = (id: string) => {
    setResidentId(id);
    const r = residents.find((x) => x.id === id);
    if (!r) return;
    fill('name', setName, r.name);
    fill('contact', setContact, r.phone && r.phone !== '—' ? r.phone : null);
  };

  /** Put the pin somewhere: 'auto' never moves a pin the Leader placed; 'map' and 'gps' are the Leader's own choice. */
  function placePin(at: { lat: number; lng: number }, how: 'auto' | 'map' | 'gps') {
    if (how === 'auto' && (latest.current.touched.pin || latest.current.pin)) return;
    setPin(at);
    if (how === 'auto') setAuto((a) => ({ ...a, pin: true }));
    else touch('pin');
    nameThePlace(at, latest.current.landmarks);
  }
  // "Use my location": the Leader asks for it, so it may move the pin if inside the subdivision area
  const locate = () => {
    if (!('geolocation' in navigator)) { setGeo('failed'); return; }
    setGeo('busy');
    navigator.geolocation.getCurrentPosition(
      (p) => {
        if (checkReportingArea(p.coords.latitude, p.coords.longitude).inside) {
          setGeo('idle');
          placePin({ lat: p.coords.latitude, lng: p.coords.longitude }, 'gps');
        } else {
          setGeo('outside');
        }
      },
      () => setGeo('failed'),
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 30_000 },
    );
  };
  // Someone else's report happened where THEY were, not where the Leader is: an auto-placed pin is taken back
  const chooseWho = (v: Who) => {
    setWho(v);
    if (v === 'other' && latest.current.auto.pin && !latest.current.touched.pin) {
      setPin(null);
      setAuto((a) => ({ ...a, pin: false, place: false }));
      if (latest.current.auto.place) setPlace('');
    }
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const found: Record<string, string> = {};
    if (who === 'other' && name.trim().length < 2) found.name = 'Enter the name of the person who reported it.';
    if (!category) found.category = 'Choose the kind of concern.';
    if (!animal) found.animal = 'Choose the kind of animal.';
    if (description.trim().length < 10) found.description = 'Describe what was reported (at least 10 characters).';
    if (!seenAt || new Date(seenAt).getTime() > Date.now() + 60_000) found.seenAt = 'Choose when it happened (not in the future).';
    if (!pin) found.pin = 'Pin the place on the map.';
    const categoryId = category ? categoryIds[category] : undefined;
    if (category && !categoryId) found.category = 'This kind of concern is not available in your subdivision.';
    setErrors(found);
    if (Object.keys(found).length > 0 || !pin || !categoryId) return;
    void run(async () => {
      const created = await adminApi.createReport({
        category_id: categoryId, animal_type: ANIMAL_TYPES[animal as AnimalType], description: description.trim(), seen_at: seenAt,
        latitude: pin.lat, longitude: pin.lng, landmark: place.trim() || null, animal_count: 1,
        ...(animalColor.trim() ? { animal_color: animalColor.trim() } : {}),
        ...(animalBreed.trim() ? { animal_breed: animalBreed.trim() } : {}),
        ...(animalSize ? { estimated_size: animalSize } : {}),
        ...(animalCondition.trim() ? { condition: animalCondition.trim() } : {}),
        report_channel: who === 'self' ? 'self' : channel,
        ...(who === 'other' ? { reported_by_name: name.trim(), reported_by_contact: contact.trim() || null, reported_on_behalf_of: residentId ? Number(residentId) : null } : {}),
      });
      let failed = 0;
      for (const f of files) { try { await adminApi.uploadReportMedia(created.report_id, f); } catch { failed += 1; } }
      reload();
      const ref = caseRef(created.report_id, created.created_at);
      if (failed) toast.error(`The report was filed, but ${failed} photo${failed === 1 ? '' : 's'} could not be uploaded. Add ${failed === 1 ? 'it' : 'them'} from the case.`);
      else toast.success(`Report ${ref} filed`);
      navigate(adminPath(`/cases/${ref}`));
    });
  };

  return (
    <div>
      <style>{`
        @keyframes saFadeUp {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .sa-fade-up {
          animation: saFadeUp 280ms cubic-bezier(0.16, 1, 0.3, 1) both;
        }
      `}</style>
      <PageHeader title="File a report" back={{ to: adminPath('/cases'), label: 'Cases' }}
        description="Record a concern you saw yourself, or one a resident told you about by phone, in person or by message. It becomes a case like any other." />

      <div className="sa-fade-up mb-5 flex flex-wrap items-center gap-2 rounded-[var(--sa-radius-lg)] border border-[#e7e2da] bg-gradient-to-r from-[#fbf8f3] to-white px-4 py-2.5 text-[12.5px] font-medium text-[var(--sa-ink-2)] shadow-2xs" style={{ maxWidth: 880 }}>
        <span className="inline-flex items-center gap-1.5 text-[var(--sa-ink)]">
          <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-[var(--sa-brand-soft)] text-[11px] font-bold text-[var(--sa-brand-ink)]">1</span>
          <UserCheck size={14} className="text-[var(--sa-brand-ink)]" aria-hidden="true" />
          Reporter
        </span>
        <span className="text-[#d6cfc4]" aria-hidden="true">→</span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-[var(--sa-sand)] text-[11px] font-bold text-[var(--sa-ink-2)]">2</span>
          <FileText size={14} className="text-[var(--sa-ink-3)]" aria-hidden="true" />
          Incident details
        </span>
        <span className="text-[#d6cfc4]" aria-hidden="true">→</span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-[var(--sa-sand)] text-[11px] font-bold text-[var(--sa-ink-2)]">3</span>
          <MapPin size={14} className="text-[var(--sa-ink-3)]" aria-hidden="true" />
          Location
        </span>
      </div>

      <form onSubmit={submit} noValidate className="grid gap-5" style={{ maxWidth: 880 }}>
        {error ? <FormError message={error} /> : null}

        <Panel className="sa-fade-up relative border-[#e7e2da] shadow-xs [animation-delay:40ms] focus-within:z-20">
          <Block title="Who reported it?">
            <div className="grid gap-4">
              <OptionGroup name="who" label="Who reported it" value={who} onChange={chooseWho} cols={2} options={[
                { value: 'self', label: 'I did (Subdivision Leader)', description: 'The case reads “Reported by Subdivision Leader”.' },
                { value: 'other', label: 'Someone else', description: 'A person who called, came to you or sent a message.' },
              ]} />
              {who === 'other' ? (
                <div className="sa-fade-up grid gap-4 rounded-[var(--sa-radius)] border border-[#ede8df] bg-[#fcfaf6] p-4 sm:grid-cols-2">
                  <Field label="How did they report it?" required>
                    <DropdownSelect
                      label="How did they report it?"
                      value={channel}
                      options={CHANNELS}
                      onChange={(v) => setChannel(v as OtherChannel)}
                    />
                  </Field>
                  <Field label="Registered resident" optional hint="Search or choose one to fill in the name and number.">
                    <ResidentCombobox residents={residents} value={residentId} onChange={chooseResident} placeholder="Search resident or choose…" noneLabel="Not a registered resident" />
                  </Field>
                  <Field label="Name" required error={errors.name} hint={auto.name ? <AutoTag /> : undefined}>
                    <Input value={name} maxLength={150} onChange={(e) => { setName(e.target.value); touch('name'); }} placeholder="e.g. Kyla Santos" />
                  </Field>
                  <Field label="Contact number" optional hint={auto.contact ? <AutoTag /> : undefined}>
                    <Input value={contact} maxLength={30} inputMode="tel" onChange={(e) => { setContact(e.target.value); touch('contact'); }} placeholder="0917 123 4567" />
                  </Field>
                </div>
              ) : null}
            </div>
          </Block>
        </Panel>

        <Panel className="sa-fade-up relative border-[#e7e2da] shadow-xs [animation-delay:90ms] focus-within:z-20">
          <Block title="What was reported?">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Kind of concern" required error={errors.category}>
                <DropdownSelect
                  label="Kind of concern"
                  value={category}
                  options={options.map((c) => ({ value: c, label: CATEGORIES[c].label }))}
                  onChange={(v) => { setCategory(v as CategoryId); touch('category'); }}
                />
              </Field>
              <Field label="Animal" required error={errors.animal} hint={ai.animal ? <AiSuggestedTag /> : undefined}>
                <DropdownSelect
                  label="Animal"
                  value={animal}
                  options={(Object.keys(ANIMAL_TYPES) as AnimalType[]).map((a) => ({ value: a, label: ANIMAL_TYPES[a] }))}
                  onChange={(v) => {
                    const nextAnimal = v as AnimalType;
                    setAnimal(nextAnimal);
                    touch('animal');
                    if (animalBreed && animalBreed !== 'Unknown / Not sure' && !getBreedsForAnimalType(nextAnimal).includes(animalBreed)) {
                      setAnimalBreed('');
                      setAi((a) => ({ ...a, animalBreed: false }));
                    }
                  }}
                />
              </Field>
              <div className="sm:col-span-2">
                <div className="grid gap-4 rounded-[var(--sa-radius)] border border-[#ede8df] bg-[#fcfaf6] p-4 sm:grid-cols-2">
                  <p className="sa-meta m-0 font-semibold text-[var(--sa-ink)] sm:col-span-2">
                    {category === 'found_animal' ? 'Animal found — description (optional)' : 'Animal description (optional)'}
                  </p>
                  <Field label="Colour / markings" optional hint={ai.animalColor ? <AiSuggestedTag /> : undefined}>
                    <Input value={animalColor} maxLength={120} onChange={(e) => { setAnimalColor(e.target.value); touch('animalColor'); }} placeholder="e.g. Brown with white paws" />
                  </Field>
                  <Field label="Breed" optional hint={ai.animalBreed ? <AiSuggestedTag /> : undefined}>
                    <DropdownSelect
                      label="Breed"
                      value={animalBreed}
                      placeholder="Choose breed…"
                      options={[
                        ...getBreedsForAnimalType(animal).map((b) => ({ value: b, label: b })),
                        { value: 'Unknown / Not sure', label: 'Unknown / Not sure' },
                      ]}
                      onChange={(v) => { setAnimalBreed(v); touch('animalBreed'); }}
                    />
                  </Field>
                  <Field label="Estimated size" optional hint={ai.animalSize ? <AiSuggestedTag /> : undefined}>
                    <DropdownSelect
                      label="Estimated size"
                      value={animalSize}
                      placeholder="Choose size…"
                      options={[
                        { value: 'Small', label: 'Small' },
                        { value: 'Medium', label: 'Medium' },
                        { value: 'Large', label: 'Large' },
                      ]}
                      onChange={(v) => { setAnimalSize(v); touch('animalSize'); }}
                    />
                  </Field>
                  <Field label="Collar, condition or appearance" optional hint={ai.animalCondition ? <AiSuggestedTag /> : undefined}>
                    <Input value={animalCondition} maxLength={255} onChange={(e) => { setAnimalCondition(e.target.value); touch('animalCondition'); }} placeholder="e.g. Red collar, friendly, limping" />
                  </Field>
                </div>
              </div>
              <div className="sm:col-span-2">
                <Field label="What happened" required error={errors.description} hint="In the reporter’s words: what they saw, the animal, anything urgent.">
                  <Textarea rows={4} value={description} maxLength={2000} onChange={(e) => { setDescription(e.target.value); touch('description'); }} placeholder="Describe the animal, behaviour, or situation…" />
                </Field>
              </div>
              <Field label="When it happened" required error={errors.seenAt} hint={auto.seenAt ? <><AutoTag /> Set to now. Change it if it happened earlier.</> : undefined}>
                <Input type="datetime-local" value={seenAt} max={localNow()} onChange={(e) => { setSeenAt(e.target.value); touch('seenAt'); }} />
              </Field>
              <Field label="Photos or video" optional hint="Up to 5 files (JPG, PNG, WEBP, MP4). You can also add them later.">
                <label className="flex min-h-[42px] cursor-pointer items-center justify-between gap-2 rounded-[var(--sa-radius)] border border-dashed border-[#d8d0c4] bg-[#fcfaf6] px-3.5 py-2 text-[13.5px] text-[var(--sa-ink-2)] transition-colors hover:border-[var(--sa-brand)] hover:bg-[#fbf5ec]">
                  <span className="flex items-center gap-2 truncate">
                    <Upload size={15} className="shrink-0 text-[var(--sa-brand-ink)]" aria-hidden="true" />
                    <span className="truncate font-medium">
                      {files.length === 0
                        ? 'Choose photos or video…'
                        : `${files.length} file${files.length === 1 ? '' : 's'} selected (${files.map((f) => f.name).join(', ')})`}
                    </span>
                  </span>
                  {files.length > 0 ? (
                    <button
                      type="button"
                      onClick={(e) => { e.preventDefault(); chooseFiles([]); }}
                      className="shrink-0 rounded px-1.5 py-0.5 text-[12px] font-medium text-[var(--sa-ink-3)] hover:bg-[#ede8df] hover:text-[var(--sa-ink)]"
                    >
                      Clear
                    </button>
                  ) : null}
                  <input
                    type="file"
                    className="sr-only"
                    accept="image/jpeg,image/png,image/webp,video/mp4"
                    multiple
                    onChange={(e) => { chooseFiles(Array.from(e.target.files ?? []).slice(0, 5)); e.target.value = ''; }}
                  />
                </label>
              </Field>
              {analysis.status !== 'idle' ? (
                <div className="grid gap-2 sm:col-span-2" aria-live="polite">
                  {analysis.status === 'busy' ? (
                    <p className="sa-meta m-0 inline-flex items-center gap-1.5">
                      <Loader2 size={13} className="animate-spin" aria-hidden="true" />
                      Analyzing photo… You can keep filling in the form.
                    </p>
                  ) : null}
                  {analysis.status === 'failed' ? (
                    <p className="sa-meta m-0">{analysis.message} Fill in the animal details yourself; the report can still be filed.</p>
                  ) : null}
                  {analysis.status === 'done' && looksAiGenerated(analysis.result) ? (
                    <Callout tone="amber" title="Photo may be AI-generated.">
                      {analysis.result.verification_message || 'This image may be AI-generated. Please make sure the uploaded photo is an actual photo of the reported animal.'}
                    </Callout>
                  ) : null}
                  {analysis.status === 'done' && analysis.result.animal_detected === false ? (
                    <Callout tone="info" title="No dog or cat found in the photo.">
                      Please upload a clear photo of the animal. You can still file the report and fill in the details yourself.
                    </Callout>
                  ) : null}
                  {analysis.status === 'done' && isUsableAnalysis(analysis.result) && analysis.result.multiple_animals_message ? (
                    <Callout tone="info">{analysis.result.multiple_animals_message}</Callout>
                  ) : null}
                  {analysis.status === 'done' && isUsableAnalysis(analysis.result) && Object.values(ai).some(Boolean) ? (
                    <p className="sa-meta m-0"><AiSuggestedTag /> Some animal details were suggested from the photo. Review them before filing.</p>
                  ) : null}
                </div>
              ) : null}
            </div>
          </Block>
        </Panel>

        <Panel className="sa-fade-up border-[#e7e2da] shadow-xs [animation-delay:140ms]">
          <Block title="Where?" action={<Button size="sm" variant="secondary" icon={LocateFixed} loading={geo === 'busy'} onClick={locate}>Use my location</Button>}>
            <div className="grid gap-4">
              {geo === 'failed' ? <Callout tone="amber">Your location could not be read. Pin the place on the map instead.</Callout> : null}
              {geo === 'outside' ? <Callout tone="amber">Your current location is outside the subdivision reporting area. Click the map or choose a landmark inside the subdivision.</Callout> : null}
              {auto.pin ? <p className="sa-meta m-0"><AutoTag /> The pin is where you are now. Move it if the animal was elsewhere.</p> : null}
              <div className="overflow-hidden rounded-[var(--sa-radius)] border border-[#e7e2da]">
                <Suspense fallback={<div className="pv-map pv-map--loading" style={{ height: 300 }} role="status" aria-label="Loading map" />}>
                  <LandmarkMapPicker pin={pin} onPick={(lat, lng) => placePin({ lat, lng }, 'map')} otherLandmarks={landmarks} height={300} />
                </Suspense>
              </div>
              {landmarks.length > 0 ? (
                <div className="flex flex-wrap items-center gap-2">
                  <span className="sa-meta">Quick landmarks:</span>
                  {landmarks.map((lm) => (
                    <button
                      key={lm.landmark_id}
                      type="button"
                      onClick={() => {
                        placePin({ lat: lm.latitude, lng: lm.longitude }, 'map');
                        fill('place', setPlace, `Near ${lm.name}`);
                      }}
                      className="inline-flex items-center gap-1 rounded-full border border-[#e7e2da] bg-[#fcfaf6] px-2.5 py-1 text-[12px] font-medium text-[var(--sa-ink-2)] transition-colors hover:border-[var(--sa-brand)] hover:bg-[#fbf5ec] hover:text-[var(--sa-brand-ink)]"
                    >
                      <MapPin size={12} aria-hidden="true" />
                      {lm.name}
                    </button>
                  ))}
                </div>
              ) : null}
              {errors.pin ? <p className="sa-error m-0" role="alert">{errors.pin}</p> : null}
              <Field label="Place or landmark" optional hint={auto.place ? <><AutoTag /> The nearest landmark to the pin.</> : undefined}>
                <Input value={place} maxLength={255} onChange={(e) => { setPlace(e.target.value); touch('place'); }} placeholder="e.g. Near the main gate" />
              </Field>
            </div>
          </Block>
        </Panel>

        <div className="sa-fade-up flex flex-wrap items-center justify-between gap-3 border-t border-[#e7e2da] pt-4 [animation-delay:180ms]">
          <p className="sa-meta m-0">Filed reports are added immediately to Cases for tracking and follow-up.</p>
          <div className="flex flex-wrap justify-end gap-3">
            <Button onClick={() => navigate(adminPath('/cases'))} disabled={pending}>Cancel</Button>
            <Button type="submit" variant="primary" loading={pending}>File report</Button>
          </div>
        </div>
      </form>
    </div>
  );
}
