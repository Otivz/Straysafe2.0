/**
 * The report form's photo/video check: POST /reports/analyze-media (backend/app/routes/reports.py, analyze_report_media).
 *
 * Both report forms (Admin "File a report" and the Resident report details) send the first chosen photo or video here in the
 * background and use the answer only as suggestions: a field the person has typed in or chosen is never replaced, and a failed,
 * slow or rate-limited check never stops the report from being filed.
 *
 * The pure helpers below (breed matching, colour text, size) turn the answer into form values.
 */
import { httpUpload } from './http';

/** What the endpoint answers with. Every branch (Gemini, local fallback, error) sends the animal fields; the rest may be absent. */
export interface MediaAnalysis {
  /** false: no dog or cat found. null only for purpose="pet" when the detector failed (not used by the report forms). */
  animal_detected: boolean | null;
  animal_type: 'Dog' | 'Cat' | 'Unknown' | string;
  primary_color: string;
  secondary_color: string;
  tertiary_color?: string;
  coat_pattern: string;
  estimated_size: string;
  possible_breed: string;
  collar_detected?: boolean;
  qr_tag_detected?: boolean;
  detected_subject_description?: string;
  detected_animal_count?: number;
  multiple_animals_detected?: boolean;
  multiple_animals_message?: string | null;
  is_ai_generated?: boolean;
  ai_generation_confidence?: number | null;
  ai_photo_likelihood?: number | null;
  ai_photo_status?: string;
  ai_photo_recommendation?: string;
  /** "authentic" | "ai_generated" | "uncertain" | "not_checked" | "ineligible_subject" | "unable_to_analyze" */
  verification_status?: string;
  verification_message?: string;
  authenticity_details?: string;
  message?: string;
  /** "ai": the AI looked at the photo. "basic": the AI was unavailable, so only the local detector and a basic colour
   *  reading answered (no breed, size or pattern). Absent on older servers and on the pet check. */
  analysis_source?: 'ai' | 'basic';
}

/** The check runs YOLO and, when enabled, Gemini; a minute is plenty. The form never waits for it. */
const ANALYZE_TIMEOUT_MS = 60_000;

/**
 * purpose "pet" (pet registration): the server runs only the local detector (dog or cat, how many, coat colours); there is no breed,
 * size or authenticity answer. Left out, it is the report check.
 */
export function analyzeReportMedia(file: File, purpose?: 'pet'): Promise<MediaAnalysis> {
  const form = new FormData();
  form.append('file', file);
  if (purpose) form.append('purpose', purpose);
  return httpUpload<MediaAnalysis>('/reports/analyze-media', form, { timeoutMs: ANALYZE_TIMEOUT_MS });
}

/** The file the forms analyse: the first photo, else the first video. */
export function pickAnalyzableFile(files: readonly File[]): File | null {
  return files.find((f) => f.type.startsWith('image/')) ?? files.find((f) => f.type.startsWith('video/')) ?? null;
}

const EMPTY = new Set(['', 'unknown', 'none', 'n/a', 'null', 'not sure']);
/** A value the model actually gave (not "Unknown", "None" or blank). */
export const known = (v: string | null | undefined): string | null => {
  const s = (v ?? '').trim();
  return EMPTY.has(s.toLowerCase()) ? null : s;
};

/** True when the answer describes a dog or cat the forms may fill from. */
export function isUsableAnalysis(a: MediaAnalysis): boolean {
  return a.animal_detected === true && (a.animal_type === 'Dog' || a.animal_type === 'Cat');
}

/** True when the AI was unavailable and only the animal type and a basic colour reading came back. */
export function isBasicAnalysis(a: MediaAnalysis): boolean {
  return a.analysis_source === 'basic';
}

/** True when the photo looks AI-generated. */
export function looksAiGenerated(a: MediaAnalysis): boolean {
  return a.is_ai_generated === true || a.verification_status === 'ai_generated';
}

/** "dog" | "cat" from the answer, or null. */
export function animalIdOf(a: MediaAnalysis): 'dog' | 'cat' | null {
  if (!isUsableAnalysis(a)) return null;
  return a.animal_type === 'Dog' ? 'dog' : 'cat';
}

/** The coat colours the model named, in order, without blanks or repeats. */
export function colorsOf(a: MediaAnalysis): string[] {
  const out: string[] = [];
  for (const c of [a.primary_color, a.secondary_color, a.tertiary_color]) {
    const k = known(c);
    if (k && !out.some((o) => o.toLowerCase() === k.toLowerCase())) out.push(k);
  }
  return out;
}

/** One line for a colour/markings text field: "White and Brown, Patched". */
export function colorTextOf(a: MediaAnalysis): string | null {
  const colors = colorsOf(a);
  const pattern = known(a.coat_pattern);
  const head = colors.length <= 1 ? colors.join('') : `${colors.slice(0, -1).join(', ')} and ${colors[colors.length - 1]}`;
  // "Solid" says nothing a single colour does not already say
  const tail = pattern && !(pattern.toLowerCase() === 'solid' && colors.length === 1) ? pattern : null;
  const text = [head, tail].filter(Boolean).join(', ');
  return text || null;
}

/** "Small" | "Medium" | "Large" (the only values the report table accepts), or null. */
export function sizeOf(a: MediaAnalysis): 'Small' | 'Medium' | 'Large' | null {
  const s = (a.estimated_size ?? '').trim().toLowerCase();
  if (s.startsWith('small')) return 'Small';
  if (s.startsWith('medium')) return 'Medium';
  if (s.startsWith('large')) return 'Large';
  return null;
}

/** Names an option answers to: "Aspin (Asong Pinoy)" -> aspin, asong pinoy; "American Bully / Pitbull" -> american bully, pitbull. */
function aliasesOf(option: string): string[] {
  const lower = option.toLowerCase();
  const base = lower.split('(')[0];
  const inParens = /\(([^)]*)\)/.exec(lower)?.[1] ?? '';
  const parts = base.split('/').map((p) => p.trim()).filter(Boolean);
  // A parenthesised alias only counts when it is a name of its own ("asong pinoy"), not a variant list ("toy / standard")
  if (inParens && !inParens.includes('/')) parts.push(inParens.trim());
  return [lower.trim(), ...parts];
}

const wordIn = (haystack: string, needle: string) => new RegExp(`(^|[^a-z])${needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}($|[^a-z])`).test(haystack);

/**
 * The option in `options` closest to the model's breed name, or null. "Aspin" -> "Aspin (Asong Pinoy)", "Puspin" ->
 * "Puspin (Pusang Pinoy)", "Golden Retriever mix" -> "Golden Retriever", "Labrador" -> "Labrador Retriever", "mixed breed" -> the Mixed option.
 */
export function matchBreed(raw: string | null | undefined, options: readonly string[]): string | null {
  const breed = known(raw)?.toLowerCase();
  if (!breed) return null;
  let best: { option: string; score: number } | null = null;
  for (const option of options) {
    for (const alias of aliasesOf(option)) {
      let score = 0;
      if (breed === alias) score = 1000;
      else if (wordIn(breed, alias)) score = 500 + alias.length;          // "golden retriever mix" contains "golden retriever"
      else if (breed.length >= 4 && alias.startsWith(breed)) score = 300 + breed.length; // "labrador" -> "labrador retriever"
      if (score > (best?.score ?? 0)) best = { option, score };
    }
  }
  if (best) return best.option;
  if (/\b(mix|mixed|mutt|cross|crossbreed|domestic)\b/.test(breed)) return options.find((o) => /^mixed/i.test(o)) ?? null;
  return null;
}

/** A short appearance note: what the model saw, plus collar / tag. */
export function appearanceNoteOf(a: MediaAnalysis): string | null {
  const parts: string[] = [];
  const desc = known(a.detected_subject_description);
  if (desc) parts.push(desc);
  if (a.qr_tag_detected) parts.push('QR / ID tag visible');
  else if (a.collar_detected) parts.push('Collar visible');
  const note = parts.join('; ');
  return note || null;
}
