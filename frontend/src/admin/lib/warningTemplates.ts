import type { ApiWarningTemplate } from '../live/api';

/**
 * Choosing a warning letter template (the server enforces the same rules, services/warning_letters.py): the Leader always
 * chooses; nothing is picked for them. A template with no level is universal and fits every level; a level template fits only
 * its own level. `is_default` is only a "Suggested" mark on the option.
 */
export const fitsLevel = (t: ApiWarningTemplate, level: string): boolean => !t.warning_level || t.warning_level === level;

/** The active templates the Leader may choose for this level: suggested first, then by name. */
export const templatesForLevel = (templates: ApiWarningTemplate[], level: string): ApiWarningTemplate[] =>
  templates
    .filter((t) => t.status === 'active' && fitsLevel(t, level))
    .sort((a, b) => Number(b.is_default) - Number(a.is_default) || a.name.localeCompare(b.name));

export const templateOptionLabel = (t: ApiWarningTemplate): string =>
  `${t.name} (v${t.current_version_number}) · ${t.warning_level || 'All levels'}${t.is_default ? ' · Suggested' : ''}`;
