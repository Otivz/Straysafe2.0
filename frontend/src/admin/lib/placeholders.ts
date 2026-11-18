import type { DragEvent } from 'react';

/**
 * Placeholders in warning letter templates. The template text stays `{{key}}` (what the backend fills in, what DOCX imports use);
 * the Leader sees and moves labeled boxes ("Resident Name") instead (components/PlaceholderEditor.tsx).
 */
export interface PlaceholderDef { key: string; label: string; description?: string }

export const PLACEHOLDER_MIME = 'application/x-straysafe-placeholder';
export const TOKEN = /\{\{\s*([A-Za-z0-9_]+)\s*\}\}/g;
export const LOOSE_TOKEN = /\{\{\s*[A-Za-z0-9_]+\s*\}\}/;

export const humanizeKey = (key: string): string =>
  key.split('_').filter(Boolean).map((w) => w[0].toUpperCase() + w.slice(1)).join(' ');

export const labelMap = (defs: PlaceholderDef[]) => new Map(defs.map((d) => [d.key, d.label]));

/** The box being dragged out of an editor, so the editor it is dropped into moves it instead of copying it. */
export const drag: { chip: HTMLElement | null } = { chip: null };

/** Start dragging a placeholder from the list (a copy: the list keeps it). */
export function startPlaceholderDrag(e: DragEvent, key: string) {
  drag.chip = null;
  e.dataTransfer.setData(PLACEHOLDER_MIME, key);
  e.dataTransfer.setData('text/plain', `{{${key}}}`);
  e.dataTransfer.effectAllowed = 'copy';
}
