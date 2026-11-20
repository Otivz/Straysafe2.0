import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Bell, Building2, Landmark, ListChecks, Lock, Mail, MapPin, Pencil, Phone, Plus, ScrollText, ShieldCheck, Trash2, UserRound } from 'lucide-react';
import { adminPath } from '../config';
import { useAuth } from '../auth/context';
import { Badge } from '../components/Badge';
import { Button, LinkButton } from '../components/Button';
import { ConfirmDialog, Dialog } from '../components/Dialog';
import { Field, FieldGroup, Input, OptionGroup, Select, Switch } from '../components/form';
import { Block, Callout, EmptyState, FormError, Kv, PageHeader, Panel } from '../components/layout';
import { SaveBar } from '../components/SaveBar';
import { useToast } from '../components/toast';
import { CATEGORIES, CATEGORY_IDS, LANDMARK_CATEGORIES } from '../data/constants';
import { useAdminData } from '../data/context';
import type { CategoryId, ExternalAgency, ExternalAgencyType, Policy, PublicationMode, Settings } from '../data/types';
import { LandmarkDialog, type LandmarkFormValues } from '../dialogs/LandmarkDialog';
import { PolicyDialog } from '../dialogs/PolicyDialog';
import { adminApi, type ApiLandmark } from '../live/api';
import { reportingCoverage, setLiveGeography } from '../../preview/geo';
import { LocationMapPreview } from '../../preview/map/LocationMapPreview';
import { MapLegend } from '../../preview/map/MapLegend';
import { fmtDateTime } from '../../preview/lib/format';
import { usePageTitle } from '../lib/hooks';
import { useGuardedNavigate, useUnsavedGuard } from '../lib/navGuard';
import { useSubmit } from '../lib/useSubmit';

type SectionKey = 'profile' | 'landmarks' | 'external' | 'account' | 'notifications' | 'categories' | 'policies' | 'privacy';
const SECTIONS: { key: SectionKey; label: string; icon: typeof Bell }[] = [
  { key: 'profile', label: 'Subdivision info & contact', icon: Building2 },
  { key: 'landmarks', label: 'Subdivision landmarks', icon: MapPin },
  { key: 'external', label: 'External coordination', icon: Landmark },
  { key: 'account', label: 'Administrator account', icon: UserRound },
  { key: 'notifications', label: 'Notifications', icon: Bell },
  { key: 'categories', label: 'Incident categories', icon: ListChecks },
  { key: 'policies', label: 'Policy references', icon: ScrollText },
  { key: 'privacy', label: 'Privacy & access', icon: ShieldCheck },
];

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** Shared by every section: the current settings and a save that reports success or failure the same way. */
function useSaveSettings() {
  const { state, dispatch } = useAdminData();
  const toast = useToast();
  const submit = useSubmit();
  const save = (next: Settings, message: string) =>
    submit.run(async () => {
      await dispatch({ type: 'settings/set', settings: next });
      toast.success(message);
    });
  return { settings: state.settings, save, pending: submit.pending, error: submit.error };
}

const Row = ({ title, description, children }: { title: string; description?: ReactNode; children: ReactNode }) => (
  <div className="sa-setting"><div className="min-w-0"><p className="font-medium">{title}</p>{description ? <p className="sa-small sa-text-3">{description}</p> : null}</div>{children}</div>
);

function isValidPhoneFormat(phone: string): boolean {
  const trimmed = phone.trim();
  if (!trimmed) return true;
  const digits = trimmed.replace(/\D/g, '');
  return /^[0-9+\-().\s/]{7,50}$/.test(trimmed) && digits.length >= 7 && digits.length <= 20;
}

function isValidEmailFormat(email: string): boolean {
  const trimmed = email.trim();
  if (!trimmed) return true;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed);
}

// ------------------------------------------------------------------------------------------------------ profile
function ProfileSection() {
  const { settings, save, pending, error } = useSaveSettings();
  const { capabilities } = useAdminData();
  const toast = useToast();
  const initial = settings.subdivision;
  const [f, setF] = useState(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const dirty = !same(f, initial);
  useUnsavedGuard(dirty);

  // Sync when saved settings load from the backend
  useEffect(() => {
    setF(initial);
  }, [
    initial.name,
    initial.city,
    initial.administrationName,
    initial.contactPerson,
    initial.address,
    initial.officePhone,
    initial.officeEmail,
    initial.officeHours,
  ]);

  const set = (patch: Partial<typeof f>) => setF((p) => ({ ...p, ...patch }));

  const handleCancel = () => {
    setF(initial);
    setErrors({});
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const next: Record<string, string> = {};
    if (capabilities.editSubdivisionIdentity && f.name.trim().length < 2) {
      next.name = 'Enter the subdivision’s name.';
    }
    if (f.administrationName.trim().length < 2) {
      next.administrationName = 'Enter the Subdivision Administration Name.';
    }
    if (f.officePhone.trim() && !isValidPhoneFormat(f.officePhone)) {
      next.officePhone = 'Enter a valid subdivision contact number (7 to 20 digits, e.g. 0917 000 0000 or (02) 8123-4567).';
    }
    if (f.officeEmail.trim() && !isValidEmailFormat(f.officeEmail)) {
      next.officeEmail = 'Enter a valid subdivision email address (e.g. hoa@selerahomes.org).';
    }
    setErrors(next);
    if (Object.keys(next).length > 0) {
      toast.error('Please check the highlighted subdivision contact fields before saving.');
      return;
    }
    await save(
      {
        ...settings,
        subdivision: {
          ...f,
          name: f.name.trim(),
          administrationName: f.administrationName.trim(),
          contactPerson: f.contactPerson.trim(),
          officePhone: f.officePhone.trim(),
          officeEmail: f.officeEmail.trim(),
          address: f.address.trim(),
          officeHours: f.officeHours.trim(),
        },
      },
      'Subdivision information & contact saved',
    );
  };

  return (
    <form onSubmit={submit} noValidate>
      <Panel>
        <Block
          title="Subdivision Information & Contact"
          description="Configure your subdivision's own office name, contact person, office contact details, and hours shown to residents."
        >
          <div className="flex flex-col gap-5">
            <div className="sa-grid2">
              <Field
                label="Subdivision Administration Name"
                required
                error={errors.administrationName}
                hint="Shown as your subdivision administration name on official notices, letters, and resident pages."
              >
                <Input
                  value={f.administrationName}
                  onChange={(e) => {
                    set({ administrationName: e.target.value });
                    if (errors.administrationName) setErrors((p) => ({ ...p, administrationName: '' }));
                  }}
                  placeholder="e.g. Selera Homes Subdivision Administration"
                />
              </Field>
              <Field
                label="Subdivision Contact Person"
                hint="Primary subdivision administrator or office representative."
              >
                <Input
                  value={f.contactPerson}
                  onChange={(e) => set({ contactPerson: e.target.value })}
                  placeholder="e.g. HOA Office / Admin Officer"
                />
              </Field>
            </div>

            <div className="sa-grid2">
              <Field
                label="Subdivision Office Phone"
                error={errors.officePhone}
                hint="Official subdivision office phone number."
              >
                <Input
                  type="tel"
                  value={f.officePhone}
                  onChange={(e) => {
                    set({ officePhone: e.target.value });
                    if (errors.officePhone) setErrors((p) => ({ ...p, officePhone: '' }));
                  }}
                  placeholder="e.g. 0917 123 4567"
                />
              </Field>
              <Field
                label="Subdivision Office Email"
                error={errors.officeEmail}
                hint="Official subdivision office email address."
              >
                <Input
                  type="email"
                  value={f.officeEmail}
                  onChange={(e) => {
                    set({ officeEmail: e.target.value });
                    if (errors.officeEmail) setErrors((p) => ({ ...p, officeEmail: '' }));
                  }}
                  placeholder="e.g. hoa@selerahomes.org"
                />
              </Field>
            </div>

            <div className="sa-grid2">
              <Field
                label="Subdivision Office Address"
                optional
                hint="Subdivision clubhouse or administration office location."
              >
                <Input
                  value={f.address}
                  onChange={(e) => set({ address: e.target.value })}
                  placeholder="e.g. Selera Homes Clubhouse / Admin Office"
                />
              </Field>
              <Field
                label="Office Hours"
                optional
                hint="Shown to residents on the community contact page."
              >
                <Input
                  value={f.officeHours}
                  onChange={(e) => set({ officeHours: e.target.value })}
                  placeholder="e.g. Mon–Sat, 8:00 AM – 5:00 PM"
                />
              </Field>
            </div>

            {error ? <FormError message={error} /> : null}

            <div className="flex flex-wrap items-center justify-end gap-2.5 pt-2 border-t border-[var(--sa-border)]">
              <Button
                type="button"
                variant="ghost"
                disabled={pending || !dirty}
                onClick={handleCancel}
              >
                Cancel
              </Button>
              <Button type="submit" variant="primary" loading={pending} disabled={!dirty}>
                Save Changes
              </Button>
            </div>
          </div>
        </Block>

        <Block
          title="Subdivision Identity"
          description="Assigned subdivision and municipality scope for this administration account."
        >
          <div className="sa-grid2">
            <Field
              label="Subdivision name"
              required
              error={errors.name}
              hint={capabilities.editSubdivisionIdentity ? undefined : 'Set by the system administrator.'}
            >
              <Input
                value={f.name}
                disabled={!capabilities.editSubdivisionIdentity}
                onChange={(e) => set({ name: e.target.value })}
              />
            </Field>
            <Field
              label="City or municipality"
              optional
              hint={capabilities.editSubdivisionIdentity ? undefined : 'Set by the system administrator.'}
            >
              <Input
                value={f.city}
                disabled={!capabilities.editSubdivisionIdentity}
                onChange={(e) => set({ city: e.target.value })}
              />
            </Field>
          </div>
        </Block>
      </Panel>
      <SaveBar dirty={dirty} pending={pending} label="Save Changes" onDiscard={handleCancel} />
    </form>
  );
}

// ----------------------------------------------------------------------------------------- subdivision landmarks
const landmarkCategoryLabel = (category: string): string =>
  LANDMARK_CATEGORIES.find((c) => c.value === category)?.label ?? (category || 'General Landmark');

function LandmarksSection() {
  const { session } = useAuth();
  const subdivisionId = session?.subdivisionId ?? null;
  const toast = useToast();
  const submit = useSubmit();

  const [landmarks, setLandmarks] = useState<ApiLandmark[]>([]);
  const [loading, setLoading] = useState(subdivisionId !== null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [editing, setEditing] = useState<'new' | ApiLandmark | null>(null);
  const [removing, setRemoving] = useState<ApiLandmark | null>(null);

  const syncGeo = (rows: ApiLandmark[]) => {
    setLiveGeography({
      coverage: reportingCoverage(),
      landmarks: rows
        .filter((l) => !l.is_holding_facility)
        .map((l) => ({ id: l.landmark_id, name: l.name, lat: l.latitude, lng: l.longitude })),
    });
  };

  useEffect(() => {
    if (subdivisionId === null) return;
    let active = true;
    void (async () => {
      try {
        const rows = await adminApi.landmarks(subdivisionId);
        if (!active) return;
        setLandmarks(rows);
        setLoadError(null);
        syncGeo(rows);
      } catch (err) {
        if (!active) return;
        setLoadError((err as Error)?.message || 'Could not load subdivision landmarks right now.');
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [subdivisionId]);

  const reloadLandmarks = async () => {
    if (subdivisionId === null) return;
    setLoading(true);
    setLoadError(null);
    try {
      const rows = await adminApi.landmarks(subdivisionId);
      setLandmarks(rows);
      syncGeo(rows);
    } catch (err) {
      setLoadError((err as Error)?.message || 'Could not load subdivision landmarks right now.');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async (values: LandmarkFormValues) => {
    if (subdivisionId === null) return;
    const isNew = editing === 'new';
    const current = isNew ? null : editing;
    await submit.run(async () => {
      if (isNew) {
        await adminApi.createLandmark({ ...values, subdivision_id: subdivisionId });
        toast.success(`${values.name} added to subdivision landmarks`);
      } else if (current) {
        await adminApi.updateLandmark(current.landmark_id, values);
        toast.success(`${values.name} position & details updated`);
      }
      const rows = await adminApi.landmarks(subdivisionId);
      setLandmarks(rows);
      syncGeo(rows);
      setEditing(null);
    });
  };

  const handleRemove = async () => {
    if (!removing || subdivisionId === null) return;
    await adminApi.deleteLandmark(removing.landmark_id);
    toast.success(`${removing.name} removed`);
    const rows = await adminApi.landmarks(subdivisionId);
    setLandmarks(rows);
    syncGeo(rows);
  };

  return (
    <>
      <Panel>
        <Block
          title="Subdivision Landmarks & Map Pins"
          description="Set exact map pins for gates, parks, streets, and common areas in your subdivision. Residents use these pins when filing reports and sightings."
          action={
            subdivisionId !== null ? (
              <Button size="sm" variant="primary" icon={Plus} onClick={() => { submit.clearError(); setEditing('new'); }}>
                Add landmark
              </Button>
            ) : null
          }
        >
          {subdivisionId === null ? (
            <Callout tone="amber">This administrator account has no assigned subdivision, so subdivision landmarks cannot be edited here.</Callout>
          ) : loading ? (
            <p className="sa-small sa-text-2">Loading subdivision landmarks…</p>
          ) : loadError ? (
            <div className="space-y-3">
              <FormError message={loadError} />
              <Button size="sm" onClick={() => { void reloadLandmarks(); }}>Retry</Button>
            </div>
          ) : landmarks.length === 0 ? (
            <EmptyState
              icon={MapPin}
              title="No subdivision landmarks configured yet"
              action={<Button size="sm" variant="primary" icon={Plus} onClick={() => { submit.clearError(); setEditing('new'); }}>Add landmark</Button>}
            >
              Add your main entrance gates, parks, clubhouses, or corners so residents can select accurate positions on the map.
            </EmptyState>
          ) : (
            <div className="space-y-4">
              <div>
                <LocationMapPreview
                  numbered={landmarks.map((l, idx) => ({ lat: l.latitude, lng: l.longitude, n: idx + 1 }))}
                  height={240}
                  interactive
                  label="Map of all registered subdivision landmarks"
                />
                <MapLegend
                  items={[
                    { kind: 'dot', label: 'Numbered pins match the landmarks listed below' },
                    { kind: 'outline', label: 'Approximate subdivision outline' },
                  ]}
                />
              </div>

              <div className="space-y-3">
                {landmarks.map((lm, idx) => (
                  <div
                    key={lm.landmark_id}
                    className="rounded-xl border border-[#e7e2da] bg-gradient-to-b from-white to-[#fcfaf6] p-4 shadow-xs transition-all duration-150 hover:border-[#d6cfc7]"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0 space-y-1.5">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="inline-flex h-6 min-w-6 items-center justify-center rounded-full bg-[#1c1917] px-1.5 text-xs font-bold text-white">
                            {idx + 1}
                          </span>
                          <span className="text-sm font-semibold text-[#1c1917]">{lm.name}</span>
                          <Badge tone="neutral">{landmarkCategoryLabel(lm.category)}</Badge>
                          {lm.is_holding_facility ? <Badge tone="amber">Holding facility</Badge> : null}
                        </div>
                        {lm.description ? (
                          <p className="sa-small sa-text-2">{lm.description}</p>
                        ) : null}
                        <p className="sa-meta">
                          Coordinates: {lm.latitude.toFixed(6)}, {lm.longitude.toFixed(6)}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <Button
                          size="sm"
                          icon={Pencil}
                          onClick={() => { submit.clearError(); setEditing(lm); }}
                        >
                          Move / Edit
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          icon={Trash2}
                          onClick={() => setRemoving(lm)}
                        >
                          Remove
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </Block>
      </Panel>

      {editing ? (
        <LandmarkDialog
          landmark={editing === 'new' ? undefined : editing}
          otherLandmarks={landmarks.filter((l) => editing === 'new' || l.landmark_id !== editing.landmark_id)}
          pending={submit.pending}
          submitError={submit.error ?? undefined}
          onSave={handleSave}
          onClose={() => { submit.clearError(); setEditing(null); }}
        />
      ) : null}

      {removing ? (
        <ConfirmDialog
          title={`Remove ${removing.name}?`}
          tone="danger"
          confirmLabel="Remove landmark"
          onClose={() => setRemoving(null)}
          message={<>Residents will no longer see “{removing.name}” as a quick-pick landmark when placing a report pin. Existing closed reports keep their stored location.</>}
          onConfirm={handleRemove}
        />
      ) : null}
    </>
  );
}

// ----------------------------------------------------------------------------------------- external coordination
const AGENCY_TYPES: { value: ExternalAgencyType; label: string }[] = [
  { value: 'barangay', label: 'Barangay' },
  { value: 'veterinary_office', label: 'Veterinary Clinic / Office' },
  { value: 'municipal_vet', label: 'Municipal / City Veterinary Office' },
  { value: 'animal_welfare', label: 'Animal Welfare Organization' },
  { value: 'animal_control', label: 'Animal Control Unit' },
  { value: 'other', label: 'Other External Agency' },
];

const agencyTypeLabel = (t: ExternalAgencyType): string =>
  AGENCY_TYPES.find((o) => o.value === t)?.label ?? 'External Agency';

const blankAgency = (): ExternalAgency => ({
  id: `agency-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
  name: '',
  type: 'barangay',
  contactPerson: '',
  phone: '',
  email: '',
  address: '',
});

function ExternalCoordinationSection() {
  const { settings, save, pending, error } = useSaveSettings();
  const toast = useToast();
  const agencies = settings.externalCoordination.agencies;
  const [editing, setEditing] = useState<ExternalAgency | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [removing, setRemoving] = useState<ExternalAgency | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const openAdd = () => {
    setIsNew(true);
    setErrors({});
    setEditing(blankAgency());
  };

  const openEdit = (a: ExternalAgency) => {
    setIsNew(false);
    setErrors({});
    setEditing({ ...a });
  };

  const persistAgencies = async (nextAgencies: ExternalAgency[], successMsg: string) => {
    const firstBarangay = nextAgencies.find((a) => a.type === 'barangay');
    return save(
      {
        ...settings,
        externalCoordination: {
          barangayName: firstBarangay?.name ?? '',
          contactPerson: firstBarangay?.contactPerson ?? '',
          phone: firstBarangay?.phone ?? '',
          email: firstBarangay?.email ?? '',
          address: firstBarangay?.address ?? '',
          agencies: nextAgencies,
        },
      },
      successMsg,
    );
  };

  const submitAgency = async (e: FormEvent) => {
    e.preventDefault();
    if (!editing) return;
    const nextErr: Record<string, string> = {};
    if (editing.name.trim().length < 2) {
      nextErr.name = 'Enter the organization or agency name.';
    }
    if (editing.phone.trim() && !isValidPhoneFormat(editing.phone)) {
      nextErr.phone = 'Enter a valid official contact number (7 to 20 digits).';
    }
    if (editing.email.trim() && !isValidEmailFormat(editing.email)) {
      nextErr.email = 'Enter a valid official email address.';
    }
    setErrors(nextErr);
    if (Object.keys(nextErr).length > 0) {
      toast.error('Please check the highlighted organization contact fields.');
      return;
    }

    const cleaned: ExternalAgency = {
      ...editing,
      name: editing.name.trim(),
      contactPerson: editing.contactPerson.trim(),
      phone: editing.phone.trim(),
      email: editing.email.trim(),
      address: editing.address.trim(),
    };
    const nextAgencies = isNew
      ? [...agencies, cleaned]
      : agencies.map((a) => (a.id === cleaned.id ? cleaned : a));

    const ok = await persistAgencies(
      nextAgencies,
      isNew ? `${cleaned.name} added to External Coordination` : `${cleaned.name} updated`,
    );
    if (ok) setEditing(null);
  };

  const confirmRemove = async () => {
    if (!removing) return;
    const nextAgencies = agencies.filter((a) => a.id !== removing.id);
    const ok = await persistAgencies(nextAgencies, `${removing.name} removed`);
    if (ok) setRemoving(null);
  };

  return (
    <>
      <Panel>
        <Block
          title="External Coordination Information & Contact Configuration"
          description="Add and manage external agencies and organizations (Barangay, Veterinary Clinics/Offices, Animal Welfare Organizations, etc.) for case referrals. Each organization maintains its own separate contact details."
          action={
            <Button size="sm" variant="primary" icon={Plus} onClick={openAdd}>
              Add Organization
            </Button>
          }
        >
          {error ? <div className="mb-3"><FormError message={error} /></div> : null}

          {agencies.length === 0 ? (
            <EmptyState
              icon={Landmark}
              title="No external organizations configured yet"
              action={<Button size="sm" variant="primary" icon={Plus} onClick={openAdd}>Add Organization</Button>}
            >
              Add your partner Barangay, veterinary clinics, municipal vet office, or animal welfare groups so referral forms can auto-fill their contact details.
            </EmptyState>
          ) : (
            <div className="space-y-3">
              {agencies.map((a) => (
                <div
                  key={a.id}
                  className="rounded-xl border border-[#e7e2da] bg-gradient-to-b from-white to-[#fcfaf6] p-4 shadow-xs transition-all duration-150 hover:border-[#d6cfc7]"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 space-y-1.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-semibold text-[#1c1917]">{a.name}</span>
                        <Badge tone={a.type === 'barangay' ? 'brand' : 'neutral'}>
                          {agencyTypeLabel(a.type)}
                        </Badge>
                      </div>
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-[#57534e]">
                        <span className="inline-flex items-center gap-1">
                          <UserRound size={12} aria-hidden="true" />
                          {a.contactPerson || 'No contact person'}
                        </span>
                        <span className="inline-flex items-center gap-1">
                          <Phone size={12} aria-hidden="true" />
                          {a.phone || 'No phone saved'}
                        </span>
                        <span className="inline-flex items-center gap-1">
                          <Mail size={12} aria-hidden="true" />
                          {a.email || 'No email saved'}
                        </span>
                        {a.address ? (
                          <span className="inline-flex items-center gap-1">
                            <MapPin size={12} aria-hidden="true" />
                            {a.address}
                          </span>
                        ) : null}
                      </div>
                    </div>

                    <div className="flex shrink-0 items-center gap-1.5">
                      <Button size="sm" variant="ghost" icon={Pencil} onClick={() => openEdit(a)}>
                        Edit
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        icon={Trash2}
                        aria-label={`Remove ${a.name}`}
                        onClick={() => setRemoving(a)}
                      >
                        Remove
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Block>
      </Panel>

      {editing ? (
        <Dialog
          size="md"
          title={isNew ? 'Add External Organization' : `Edit ${editing.name}`}
          description="Only this organization's saved details will populate when it is selected in referral and coordination forms."
          onClose={() => !pending && setEditing(null)}
          onSubmit={submitAgency}
          footer={(
            <div className="flex w-full justify-end gap-2">
              <Button type="button" variant="ghost" disabled={pending} onClick={() => setEditing(null)}>
                Cancel
              </Button>
              <Button type="submit" variant="primary" loading={pending}>
                {isNew ? 'Add Organization' : 'Save Organization'}
              </Button>
            </div>
          )}
        >
          <div className="space-y-3.5">
            <Field label="Organization Type" required>
              <Select
                value={editing.type}
                onChange={(e) => setEditing((prev) => prev ? { ...prev, type: e.target.value as ExternalAgencyType } : prev)}
              >
                {AGENCY_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </Select>
            </Field>

            <Field label="Organization / Agency Name" required error={errors.name}>
              <Input
                value={editing.name}
                onChange={(e) => {
                  setEditing((prev) => prev ? { ...prev, name: e.target.value } : prev);
                  if (errors.name) setErrors((p) => ({ ...p, name: '' }));
                }}
                placeholder="e.g. Barangay San Vicente, City Veterinary Office, PAWS Clinic"
              />
            </Field>

            <Field label="Contact Person / Representative" optional>
              <Input
                value={editing.contactPerson}
                onChange={(e) => setEditing((prev) => prev ? { ...prev, contactPerson: e.target.value } : prev)}
                placeholder="e.g. Dr. Santos / Desk Officer Reyes"
              />
            </Field>

            <div className="sa-grid2">
              <Field label="Official Contact Number" optional error={errors.phone} hint="Used when Contact Method is Phone Call.">
                <Input
                  type="tel"
                  value={editing.phone}
                  onChange={(e) => {
                    setEditing((prev) => prev ? { ...prev, phone: e.target.value } : prev);
                    if (errors.phone) setErrors((p) => ({ ...p, phone: '' }));
                  }}
                  placeholder="e.g. 0917 123 4567"
                />
              </Field>
              <Field label="Official Email Address" optional error={errors.email} hint="Used when Contact Method is Email.">
                <Input
                  type="email"
                  value={editing.email}
                  onChange={(e) => {
                    setEditing((prev) => prev ? { ...prev, email: e.target.value } : prev);
                    if (errors.email) setErrors((p) => ({ ...p, email: '' }));
                  }}
                  placeholder="e.g. clinic@example.com"
                />
              </Field>
            </div>

            <Field label="Office Address" optional hint="Used when Contact Method is In-Person.">
              <Input
                value={editing.address}
                onChange={(e) => setEditing((prev) => prev ? { ...prev, address: e.target.value } : prev)}
                placeholder="e.g. Barangay Hall, Main Road / 123 Rizal Ave."
              />
            </Field>
          </div>
        </Dialog>
      ) : null}

      {removing ? (
        <ConfirmDialog
          title={`Remove ${removing.name}?`}
          message="Existing referrals already created for this organization will not be affected, but it will no longer appear in the saved organization dropdown."
          confirmLabel="Remove"
          tone="danger"
          onConfirm={confirmRemove}
          onClose={() => setRemoving(null)}
        />
      ) : null}
    </>
  );
}

// ------------------------------------------------------------------------------------------------------ account
function AccountSection() {
  const { state } = useAdminData();
  const { session } = useAuth();
  return (
    <Panel>
      <Block title="Administrator account" description="One administrator role covers reviewing reports, coordinating, monitoring and closing cases.">
        <Kv wide rows={[['Name', state.admin.name], ['Email', state.admin.email], ['Role', state.admin.role], ['Signed in', session ? <span>{fmtDateTime(session.startedAt)}</span> : '—']]} />
        <div className="mt-5 flex flex-wrap gap-2"><LinkButton to={adminPath('/profile')} icon={Pencil}>Edit profile and password</LinkButton></div>
      </Block>
      <Block title="Roles"><p className="sa-small sa-text-2 sa-prose">StraySafe starts with a single administrator role. Additional internal roles should only be introduced when your subdivision’s operations genuinely need them. External authorities such as the barangay do not have their own accounts. Record what they tell you under External coordination in a case.</p></Block>
    </Panel>
  );
}

// ----------------------------------------------------------------------------------------------- notifications
function NotificationsSection() {
  const { settings, save, pending, error } = useSaveSettings();
  const initial = settings.notifications;
  const [f, setF] = useState(initial);
  const dirty = !same(f, initial);
  useUnsavedGuard(dirty);
  const flag = (key: 'newReports' | 'followUps' | 'claims' | 'caseActivity') => (v: boolean) => setF((p) => ({ ...p, [key]: v }));
  const channel = (key: 'email' | 'push') => (v: boolean) => setF((p) => ({ ...p, channels: { ...p.channels, [key]: v } }));

  return (
    <form onSubmit={(e) => { e.preventDefault(); void save({ ...settings, notifications: f }, 'Notification preferences saved'); }} noValidate>
      <Panel>
        <Block title="What to be notified about" description="Not every update needs a notification. These control what reaches you.">
          <Row title="New reports" description="A resident submits a report."><Switch label="New reports" checked={f.newReports} onChange={flag('newReports')} /></Row>
          <Row title="Urgent incidents" description="Always on. Urgent safety concerns must never wait."><Switch label="Urgent incidents (always on)" checked disabled onChange={() => undefined} /></Row>
          <Row title="Follow-up reminders" description="A follow-up or observation period is due."><Switch label="Follow-up reminders" checked={f.followUps} onChange={flag('followUps')} /></Row>
          <Row title="Ownership claim updates" description="Someone submits or updates a claim."><Switch label="Ownership claim updates" checked={f.claims} onChange={flag('claims')} /></Row>
          <Row title="Relevant case activity" description="Reporters add information or sightings."><Switch label="Relevant case activity" checked={f.caseActivity} onChange={flag('caseActivity')} /></Row>
        </Block>
        <Block title="Where to receive them">
          <Row title="In the app" description="The bell in the sidebar. Always on."><Switch label="In-app notifications (always on)" checked disabled onChange={() => undefined} /></Row>
          <Row title="Email" description="Sent to your administrator email."><Switch label="Email notifications" checked={f.channels.email} onChange={channel('email')} /></Row>
          <Row title="Push notifications" description="On devices where you installed the app."><Switch label="Push notifications" checked={f.channels.push} onChange={channel('push')} /></Row>
          {error ? <div className="mt-4"><FormError message={error} /></div> : null}
        </Block>
      </Panel>
      <SaveBar dirty={dirty} pending={pending} label="Save preferences" onDiscard={() => setF(initial)} />
    </form>
  );
}

// ------------------------------------------------------------------------------------------------- categories
function CategoriesSection() {
  const { settings, save, pending, error } = useSaveSettings();
  const initial = settings.categories;
  const [f, setF] = useState(initial);
  const dirty = !same(f, initial);
  useUnsavedGuard(dirty);
  const enabled = CATEGORY_IDS.filter((id) => f[id]).length;

  return (
    <form onSubmit={(e) => { e.preventDefault(); void save({ ...settings, categories: f }, 'Incident categories saved'); }} noValidate>
      <Panel>
        <Block title="Incident categories" description="The kinds of concern residents can report. Turning one off hides it from the report form. Existing cases keep their category.">
          {CATEGORY_IDS.map((id: CategoryId) => (
            <Row key={id} title={CATEGORIES[id].label} description={CATEGORIES[id].description}>
              <Switch label={`${CATEGORIES[id].label} enabled`} checked={f[id]} disabled={f[id] && enabled === 1} onChange={(v) => setF((p) => ({ ...p, [id]: v }))} />
            </Row>
          ))}
          <p className="sa-hint mt-3">At least one category stays on. Reports of any animal type are accepted: dogs, cats, birds, reptiles, livestock and others.</p>
          {error ? <div className="mt-4"><FormError message={error} /></div> : null}
        </Block>
      </Panel>
      <SaveBar dirty={dirty} pending={pending} label="Save categories" onDiscard={() => setF(initial)} />
    </form>
  );
}

// ---------------------------------------------------------------------------------------------------- policies
function PoliciesSection() {
  const { settings, save, error } = useSaveSettings();
  const [editing, setEditing] = useState<Policy | 'new' | null>(null);
  const [removing, setRemoving] = useState<Policy | null>(null);

  const upsert = async (p: Policy) => {
    const exists = settings.policies.some((x) => x.id === p.id);
    const policies = exists ? settings.policies.map((x) => (x.id === p.id ? p : x)) : [...settings.policies, p];
    if (await save({ ...settings, policies }, exists ? 'Policy updated' : 'Policy added')) setEditing(null);
  };

  return (
    <>
      <Panel>
        <Block title="Policy references" description="The rules your subdivision actually has. Warnings are issued under a confirmed policy, and the observation period comes from the policy itself." action={<div className="flex flex-wrap gap-2"><LinkButton size="sm" to={adminPath('/warning-templates')}>Warning letter templates</LinkButton><Button size="sm" icon={Plus} onClick={() => setEditing('new')}>Add policy</Button></div>}>
          {settings.policies.length === 0 ? <p className="sa-small sa-text-2">No policies yet. Without a confirmed policy, no warning can be issued.</p> : (
            <ul className="m-0 flex list-none flex-col gap-3 p-0">
              {settings.policies.map((p) => (
                <li key={p.id} className="sa-record">
                  <p className="flex flex-wrap items-center gap-x-3 gap-y-1.5"><span className="sa-semibold">{p.reference}</span><span className="sa-text-2">{p.title}</span><Badge tone={p.status === 'confirmed' ? 'sage' : 'amber'} dot>{p.status === 'confirmed' ? 'Confirmed' : 'Awaiting confirmation'}</Badge></p>
                  <p className="sa-small sa-text-2 mt-1.5">{p.summary || 'No summary.'}</p>
                  <p className="sa-meta mt-2">Applies to {p.appliesTo.map((c) => CATEGORIES[c].label).join(', ')} · {p.observationDays ? `${p.observationDays}-day observation period` : 'no observation period defined'}</p>
                  <div className="mt-3 flex gap-2"><Button size="sm" icon={Pencil} onClick={() => setEditing(p)}>Edit</Button><Button size="sm" variant="ghost" icon={Trash2} onClick={() => setRemoving(p)}>Remove</Button></div>
                </li>
              ))}
            </ul>
          )}
          {error ? <div className="mt-4"><FormError message={error} /></div> : null}
        </Block>
      </Panel>
      {editing ? <PolicyDialog policy={editing === 'new' ? undefined : editing} onSave={(p) => { void upsert(p); }} onClose={() => setEditing(null)} /> : null}
      {removing ? (
        <ConfirmDialog title="Remove this policy?" tone="danger" confirmLabel="Remove policy" onClose={() => setRemoving(null)}
          message={<>“{removing.reference} — {removing.title}” will no longer be available for new warnings. Warnings already issued keep their record of it.</>}
          onConfirm={async () => { await save({ ...settings, policies: settings.policies.filter((x) => x.id !== removing.id) }, 'Policy removed'); }} />
      ) : null}
    </>
  );
}

// ------------------------------------------------------------------------------------------------------ privacy
const RULES = [
  'Reporter identity and contact details are visible to subdivision administrators only.',
  'Private complaints about a neighbour are never published, even when a related notice exists.',
  'Public notices never include exact addresses, phone numbers or private owner information.',
  'Pet registration is declared by the owner and is never treated as proof of ownership.',
  'A case can be closed only with a documented outcome, and a closed case is not always a resolved one.',
];

function PrivacySection() {
  const { settings, save, pending, error } = useSaveSettings();
  const initial = settings.privacy;
  const [f, setF] = useState(initial);
  const dirty = !same(f, initial);
  useUnsavedGuard(dirty);
  const options: { value: PublicationMode; label: string; description: string }[] = [
    { value: 'immediate', label: 'Publish as soon as it is ready', description: 'Shown to residents as owner-reported information. You can still moderate or archive it.' },
    { value: 'review', label: 'Review before publishing', description: 'An administrator checks every notice first.' },
  ];

  return (
    <form onSubmit={(e) => { e.preventDefault(); void save({ ...settings, privacy: f }, 'Privacy and access rules saved'); }} noValidate>
      <Panel>
        <Block title="Always enforced" description="These protect residents and cannot be turned off.">
          <ul className="m-0 flex list-none flex-col gap-2.5 p-0">{RULES.map((r) => <li key={r} className="flex items-start gap-2.5 sa-small"><Lock size={14} className="sa-text-3 mt-1 shrink-0" aria-hidden="true" /><span>{r}</span></li>)}</ul>
        </Block>
        <Block title="Community publication" description="How notices reach residents, according to your community policy.">
          <div className="flex flex-col gap-5">
            <FieldGroup label="Lost-pet notices">
              <p className="sa-small"><Lock size={13} className="sa-text-3 mr-1.5 inline" aria-hidden="true" /><strong>Published at once, always.</strong> A missing pet’s notice appears as soon as the owner files the report. Nobody has to approve it, and a Leader is not asked to. You can still edit or close a notice from its case.</p>
            </FieldGroup>
            <FieldGroup label="Found-animal notices"><OptionGroup name="found" label="Found-animal publication" value={f.foundPublication} onChange={(v) => setF((p) => ({ ...p, foundPublication: v }))} options={options} /></FieldGroup>
            <Callout>Safety advisories are always published by an administrator after checking the facts.</Callout>
          </div>
          {error ? <div className="mt-4"><FormError message={error} /></div> : null}
        </Block>
      </Panel>
      <SaveBar dirty={dirty} pending={pending} label="Save rules" onDiscard={() => setF(initial)} />
    </form>
  );
}

/** A21 — Settings. Essential configuration only. */
export default function SettingsPage() {
  usePageTitle('Settings');
  const [params] = useSearchParams();
  const go = useGuardedNavigate();
  const requested = params.get('section') as SectionKey | null;
  const section: SectionKey = SECTIONS.some((s) => s.key === requested) ? (requested as SectionKey) : 'profile';

  return (
    <div>
      <PageHeader title="Settings" description="Configure your subdivision profile, how you are notified, what residents can report, and the rules warnings rely on." />
      <div className="sa-settings">
        <nav className="sa-subnav" aria-label="Settings sections">
          {SECTIONS.map(({ key, label, icon: Icon }) => (
            <button key={key} type="button" aria-current={section === key ? 'true' : undefined} onClick={() => go(`${adminPath('/settings')}?section=${key}`)}><Icon size={16} aria-hidden="true" />{label}</button>
          ))}
        </nav>
        <div className="min-w-0 max-w-[820px]">
          {section === 'profile' ? <ProfileSection /> : null}
          {section === 'landmarks' ? <LandmarksSection /> : null}
          {section === 'external' ? <ExternalCoordinationSection /> : null}
          {section === 'account' ? <AccountSection /> : null}
          {section === 'notifications' ? <NotificationsSection /> : null}
          {section === 'categories' ? <CategoriesSection /> : null}
          {section === 'policies' ? <PoliciesSection /> : null}
          {section === 'privacy' ? <PrivacySection /> : null}
        </div>
      </div>
    </div>
  );
}
