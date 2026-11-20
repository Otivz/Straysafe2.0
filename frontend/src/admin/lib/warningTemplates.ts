import type { ApiWarningTemplate } from '../live/api';

/**
 * Choosing a warning letter template (the server enforces the same rules, services/warning_letters.py):
 * A template with no level is universal and fits every level; a level template fits its own level.
 * In the Issue Warning form, all active templates from the Warning Templates page are available in the dropdown.
 */
export const fitsLevel = (t: ApiWarningTemplate, level: string): boolean => !t.warning_level || t.warning_level === level;

/** The active templates the Leader may choose for a specific level: suggested first, then by name. */
export const templatesForLevel = (templates: ApiWarningTemplate[], level: string): ApiWarningTemplate[] =>
  templates
    .filter((t) => t.status === 'active' && fitsLevel(t, level))
    .sort((a, b) => Number(b.is_default) - Number(a.is_default) || a.name.localeCompare(b.name));

/**
 * All active warning templates saved in the Warning Templates management page.
 * Excludes archived/inactive templates. Sorts templates matching the preferred warning level and default flag first, then alphabetically.
 */
export const allActiveTemplates = (
  templates: ApiWarningTemplate[],
  preferredLevel?: string,
): ApiWarningTemplate[] =>
  templates
    .filter((t) => t.status === 'active')
    .sort((a, b) => {
      const aMatch = preferredLevel && a.warning_level === preferredLevel ? 1 : 0;
      const bMatch = preferredLevel && b.warning_level === preferredLevel ? 1 : 0;
      if (bMatch !== aMatch) return bMatch - aMatch;
      if (Number(b.is_default) !== Number(a.is_default)) {
        return Number(b.is_default) - Number(a.is_default);
      }
      return a.name.localeCompare(b.name);
    });

export const templateOptionLabel = (t: ApiWarningTemplate): string =>
  `${t.name} (v${t.current_version_number}) · ${t.warning_level || 'All levels'}${t.is_default ? ' · Suggested' : ''}`;

export interface TemplatePopulationContext {
  residentName?: string;
  residentAddress?: string;
  petName?: string;
  petType?: string;
  caseReference?: string;
  warningReference?: string;
  warningLevel?: string;
  violationDescription?: string;
  requiredAction?: string;
  policyReference?: string;
  incidentDate?: string;
  issueDate?: string;
  observationDays?: string;
  subdivisionName?: string;
  subdivisionAddress?: string;
  subdivisionPhone?: string;
  subdivisionEmail?: string;
  issuerName?: string;
  issuerRole?: string;
  issuedBy?: string;
  summonsDate?: string;
  summonsPlace?: string;
}

export function substituteTemplatePlaceholders(
  rawText: string,
  ctx: TemplatePopulationContext,
): string {
  const map: Record<string, string | undefined> = {
    resident_name: ctx.residentName,
    resident_address: ctx.residentAddress,
    pet_name: ctx.petName,
    pet_type: ctx.petType,
    case_reference: ctx.caseReference,
    warning_reference: ctx.warningReference || 'WARN-PREVIEW',
    warning_level: ctx.warningLevel,
    violation_description: ctx.violationDescription,
    required_action: ctx.requiredAction,
    policy_reference: ctx.policyReference,
    incident_date: ctx.incidentDate,
    issue_date: ctx.issueDate,
    observation_days: ctx.observationDays,
    subdivision_name: ctx.subdivisionName,
    subdivision_address: ctx.subdivisionAddress,
    subdivision_phone: ctx.subdivisionPhone,
    subdivision_email: ctx.subdivisionEmail,
    issuer_name: ctx.issuerName,
    issuer_role: ctx.issuerRole,
    issued_by: ctx.issuedBy,
    summons_date: ctx.summonsDate,
    summons_place: ctx.summonsPlace,
  };

  return rawText.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (full, key: string) => {
    const val = map[key];
    return val && val.trim() ? val.trim() : full;
  });
}

export function inferWarningCategoryFromTemplate(
  t: ApiWarningTemplate,
  fallbackCategory = 'Pet Roaming Without Supervision',
): string {
  const hay = `${t.name} ${t.description ?? ''} ${t.current_version?.subject_template ?? ''}`.toLowerCase();
  if (/aggress|danger|bite|attack|safety/.test(hay)) {
    return 'Aggressive or Dangerous Animal Behavior';
  }
  if (/disturb|noise|bark|nuisance/.test(hay)) {
    return 'Pet Causing Disturbance';
  }
  if (/incident/.test(hay)) {
    return 'Pet Involved in an Incident';
  }
  if (/remind|responsible/.test(hay)) {
    return 'Responsible Pet Ownership Reminder';
  }
  if (/roam|unleash|stray|supervis/.test(hay)) {
    return 'Pet Roaming Without Supervision';
  }
  return fallbackCategory;
}

