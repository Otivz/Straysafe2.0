/**
 * Case references. The screens show and route by a reference such as `SS-2026-0158`; the backend knows the numeric
 * report_id. The reference is derived from the id and the year the report was made, so it is stable, never stored, and
 * needs no new field: `SS-<year>-<report_id padded to 4>` and back.
 *
 * Pure, no imports (runs under `node --test`).
 */
export function caseRef(reportId: number, createdAt: string | null | undefined): string {
  const year = createdAt && /^\d{4}/.test(createdAt) ? createdAt.slice(0, 4) : String(new Date().getFullYear());
  return `SS-${year}-${String(reportId).padStart(4, '0')}`;
}

/** The numeric report id inside a reference (or a bare number); null when it is neither. */
export function reportIdOf(ref: string | null | undefined): number | null {
  if (!ref) return null;
  const match = /(?:^|-)(\d+)$/.exec(String(ref).trim());
  if (!match) return null;
  const id = Number(match[1]);
  return Number.isInteger(id) && id > 0 ? id : null;
}
