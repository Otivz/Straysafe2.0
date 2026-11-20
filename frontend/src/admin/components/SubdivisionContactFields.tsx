import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Building2, RotateCcw } from 'lucide-react';
import { adminPath } from '../config';
import { STANDARD_CONTACT_METHODS } from '../data/constants';
import { useAdminData } from '../data/context';
import type { ContactMethod, ExternalAgency } from '../data/types';
import { Badge } from './Badge';
import { Field, Input, Select } from './form';

export type ContactSource = 'subdivision' | 'external';

export function getSavedContactForMethod(
  sub: { officePhone?: string; officeEmail?: string; phone?: string; email?: string; address?: string },
  method: ContactMethod,
): string {
  switch (method) {
    case 'phone':
      return (sub.phone ?? sub.officePhone ?? '').trim();
    case 'email':
      return (sub.email ?? sub.officeEmail ?? '').trim();
    case 'in_person':
      return (sub.address ?? '').trim();
    default:
      return '';
  }
}

export function getContactDetailLabel(method: ContactMethod, source: ContactSource = 'subdivision'): string {
  const prefix = source === 'external' ? 'Organization' : 'Subdivision';
  switch (method) {
    case 'phone':
      return `Contact Details (${prefix} Contact Number)`;
    case 'email':
      return `Contact Details (${prefix} Email Address)`;
    case 'in_person':
      return `Contact Details (${prefix} Office Address)`;
    default:
      return 'Contact Details';
  }
}

export function getContactDetailPlaceholder(
  method: ContactMethod,
  hasSaved: boolean,
  source: ContactSource = 'subdivision',
): string {
  const entity = source === 'external' ? 'selected organization' : 'Subdivision';
  if (method === 'phone') {
    return hasSaved
      ? '09XXXXXXXXX'
      : `No saved phone number for ${entity} — enter manually`;
  }
  if (method === 'email') {
    return hasSaved
      ? (source === 'external' ? 'agency@example.com' : 'hoa@example.com')
      : `No saved email address for ${entity} — enter manually`;
  }
  if (method === 'in_person') {
    return hasSaved
      ? (source === 'external' ? 'Agency Office Address' : 'Subdivision Admin Office Address')
      : `No saved office address for ${entity} — enter manually`;
  }
  return 'Enter contact number, email address, or channel details';
}

const EMPTY_EXTERNAL = { phone: '', email: '', address: '', contactPerson: '' };

export function useSubdivisionContactAutofill(
  initialMethod: ContactMethod = 'phone',
  source: ContactSource = 'subdivision',
  selectedAgency?: ExternalAgency | null,
) {
  const { state } = useAdminData();
  const sub = state.settings.subdivision;
  const ext = state.settings.externalCoordination;
  // For external coordination, strictly read ONLY from the explicitly selected organization (never fall back to Barangay).
  const activeSource = source === 'external' ? (selectedAgency ?? EMPTY_EXTERNAL) : sub;

  const [contactMethod, setContactMethod] = useState<ContactMethod>(initialMethod);
  const [customMethodLabel, setCustomMethodLabel] = useState<string>('');
  const [contactDetail, setContactDetail] = useState<string>(() =>
    getSavedContactForMethod(activeSource, initialMethod),
  );
  const [contactPerson, setContactPerson] = useState<string>(
    () => (activeSource.contactPerson || '').trim(),
  );
  const [detailManuallyEdited, setDetailManuallyEdited] = useState(false);
  const [personManuallyEdited, setPersonManuallyEdited] = useState(false);
  const prevAgencyKeyRef = useRef<string>(selectedAgency?.id ?? '');

  const savedValue = getSavedContactForMethod(activeSource, contactMethod);
  const savedPerson = (activeSource.contactPerson || '').trim();
  const administrationName =
    source === 'external'
      ? (selectedAgency?.name || '').trim() || 'External Organization'
      : (sub.administrationName || '').trim() || 'Subdivision Administration';

  // When the selected external organization changes, strictly replace fields with that organization's values (or blank if none).
  useEffect(() => {
    if (source !== 'external') return;
    const nextKey = selectedAgency?.id ?? '';
    if (prevAgencyKeyRef.current !== nextKey) {
      prevAgencyKeyRef.current = nextKey;
      setContactDetail(contactMethod === 'other' ? '' : getSavedContactForMethod(activeSource, contactMethod));
      setContactPerson((activeSource.contactPerson || '').trim());
      setDetailManuallyEdited(false);
      setPersonManuallyEdited(false);
    }
  }, [source, selectedAgency?.id, activeSource, contactMethod]);

  // If settings finish loading after initial render and the admin has not manually edited the field, populate it
  useEffect(() => {
    if (!detailManuallyEdited && contactMethod !== 'other') {
      const nextSaved = getSavedContactForMethod(activeSource, contactMethod);
      if (nextSaved && contactDetail !== nextSaved) {
        setContactDetail(nextSaved);
      }
    }
  }, [
    source,
    sub.officePhone,
    sub.officeEmail,
    sub.address,
    selectedAgency?.id,
    selectedAgency?.phone,
    selectedAgency?.email,
    selectedAgency?.address,
    contactMethod,
    detailManuallyEdited,
    contactDetail,
  ]);

  useEffect(() => {
    if (!personManuallyEdited && savedPerson && contactPerson !== savedPerson) {
      setContactPerson(savedPerson);
    }
  }, [savedPerson, personManuallyEdited, contactPerson]);

  const handleMethodChange = (nextMethod: ContactMethod) => {
    setContactMethod(nextMethod);
    const nextSaved = getSavedContactForMethod(activeSource, nextMethod);
    setContactDetail(nextSaved);
    setDetailManuallyEdited(false);
    if (nextMethod !== 'other') {
      setCustomMethodLabel('');
    }
  };

  const handleDetailChange = (nextValue: string) => {
    setContactDetail(nextValue);
    const currentSaved = getSavedContactForMethod(activeSource, contactMethod);
    setDetailManuallyEdited(nextValue.trim() !== currentSaved);
  };

  const handlePersonChange = (nextPerson: string) => {
    setContactPerson(nextPerson);
    setPersonManuallyEdited(nextPerson.trim() !== savedPerson);
  };

  const resetDetailToSaved = () => {
    setContactDetail(savedValue);
    setDetailManuallyEdited(false);
  };

  const isPrefilled =
    contactMethod !== 'other' && Boolean(savedValue) && contactDetail.trim() === savedValue;
  const isModified =
    contactMethod !== 'other' &&
    Boolean(savedValue) &&
    contactDetail.trim() !== '' &&
    contactDetail.trim() !== savedValue;
  const isMissingSaved = contactMethod !== 'other' && !savedValue;

  const methodDisplayLabel =
    contactMethod === 'other' && customMethodLabel.trim()
      ? `Other (${customMethodLabel.trim()})`
      : STANDARD_CONTACT_METHODS.find((m) => m.id === contactMethod)?.label ?? 'Phone Call';

  return {
    source,
    subdivision: sub,
    externalCoordination: ext,
    administrationName,
    contactMethod,
    customMethodLabel,
    setCustomMethodLabel,
    contactDetail,
    contactPerson,
    savedValue,
    savedPerson,
    isPrefilled,
    isModified,
    isMissingSaved,
    methodDisplayLabel,
    handleMethodChange,
    handleDetailChange,
    handlePersonChange,
    resetDetailToSaved,
  };
}

export function SubdivisionContactFields({
  autofill,
  methodLabel = 'Contact Method',
  detailLabel,
  showContactPerson = true,
  personLabel,
  title,
  subtitle,
  compact = false,
}: {
  autofill: ReturnType<typeof useSubdivisionContactAutofill>;
  methodLabel?: string;
  detailLabel?: string;
  showContactPerson?: boolean;
  personLabel?: string;
  title?: string;
  subtitle?: string;
  compact?: boolean;
}) {
  const {
    source,
    administrationName,
    contactMethod,
    customMethodLabel,
    setCustomMethodLabel,
    contactDetail,
    contactPerson,
    savedValue,
    isPrefilled,
    isModified,
    isMissingSaved,
    handleMethodChange,
    handleDetailChange,
    handlePersonChange,
    resetDetailToSaved,
  } = autofill;

  const effectiveTitle =
    title ?? (source === 'external' ? 'External Coordination Contact Information' : 'Subdivision Office Contact Information');
  const effectiveSubtitle =
    subtitle ??
    (source === 'external'
      ? 'Automatically populated from External Coordination settings when you choose a contact method. You may edit the value before submitting.'
      : 'Automatically populated from Subdivision Information & Contact in Settings when you choose a contact method. You may edit the value before submitting.');
  const effectivePersonLabel =
    personLabel ?? (source === 'external' ? 'Organization Contact Person / Representative' : 'Subdivision Contact Person / Representative');
  const settingsSection = source === 'external' ? 'external' : 'profile';

  return (
    <div
      className={`rounded-xl border border-[var(--sa-border)] bg-[var(--sa-surface-2)] ${
        compact ? 'p-3 space-y-2.5' : 'p-3.5 space-y-3'
      }`}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-[var(--sa-brand-ink)]">
              <Building2 size={13} />
              {effectiveTitle}
            </span>
            <span className="sa-meta text-xs">· {administrationName}</span>
          </div>
          {effectiveSubtitle ? <p className="sa-meta text-xs mt-0.5">{effectiveSubtitle}</p> : null}
        </div>

        <div className="flex flex-wrap items-center gap-1.5 shrink-0">
          {isPrefilled ? (
            <Badge tone="sage">Auto-filled from Settings</Badge>
          ) : isModified ? (
            <>
              <Badge tone="amber">Manually edited</Badge>
              <button
                type="button"
                onClick={resetDetailToSaved}
                className="inline-flex items-center gap-1 text-xs font-medium text-[var(--sa-brand-ink)] hover:underline cursor-pointer"
                title={`Restore saved value (${savedValue})`}
              >
                <RotateCcw size={11} />
                Reset to saved
              </button>
            </>
          ) : isMissingSaved ? (
            <Badge tone="neutral">No saved default in Settings</Badge>
          ) : null}
        </div>
      </div>

      <div
        className={`grid grid-cols-1 ${
          showContactPerson ? 'sm:grid-cols-3' : 'sm:grid-cols-2'
        } gap-3`}
      >
        <Field label={methodLabel} required>
          <Select
            value={contactMethod}
            onChange={(e) => handleMethodChange(e.target.value as ContactMethod)}
          >
            {STANDARD_CONTACT_METHODS.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
          </Select>
        </Field>

        <Field
          label={detailLabel || getContactDetailLabel(contactMethod, source)}
          hint={
            isMissingSaved ? (
              <>
                No saved value for this method yet.{' '}
                <Link
                  to={`${adminPath('/settings')}?section=${settingsSection}`}
                  className="font-semibold text-[var(--sa-brand-ink)] hover:underline"
                >
                  Configure in Settings
                </Link>{' '}
                or enter manually.
              </>
            ) : undefined
          }
        >
          <Input
            value={contactDetail}
            onChange={(e) => handleDetailChange(e.target.value)}
            placeholder={getContactDetailPlaceholder(contactMethod, Boolean(savedValue), source)}
          />
        </Field>

        {showContactPerson ? (
          <Field label={effectivePersonLabel} optional>
            <Input
              value={contactPerson}
              onChange={(e) => handlePersonChange(e.target.value)}
              placeholder={source === 'external' ? 'e.g. Dr. Santos / Desk Officer' : 'e.g. HOA Administrator / Office Staff'}
            />
          </Field>
        ) : null}
      </div>

      {contactMethod === 'other' ? (
        <Field
          label="Specify Contact Method"
          required
          hint="Enter the custom communication channel used (e.g. SMS, Viber, Messenger, Written Notice)."
        >
          <Input
            value={customMethodLabel}
            onChange={(e) => setCustomMethodLabel(e.target.value)}
            placeholder="e.g. SMS / Viber / Written Notice"
          />
        </Field>
      ) : null}
    </div>
  );
}
