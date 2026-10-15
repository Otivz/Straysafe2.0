// Reports store their description as one pipe-separated line:
//   "Custody: … | Pattern: … | Markings: … | Observed Conditions: … | Notes: …"
// This turns it into separate, labelled parts for display. Free text without labels is treated as the notes.
export interface ParsedReportDescription {
    custody: string;
    pattern: string;
    markings: string;
    conditions: string;
    notes: string;
}

const LABELS: Array<[keyof ParsedReportDescription, RegExp]> = [
    ['custody', /^custody:\s*/i],
    ['pattern', /^pattern:\s*/i],
    ['markings', /^markings:\s*/i],
    ['conditions', /^observed conditions:\s*/i],
    ['notes', /^notes:\s*/i],
];

export function parseReportDescription(description?: string | null): ParsedReportDescription {
    const out: ParsedReportDescription = { custody: '', pattern: '', markings: '', conditions: '', notes: '' };
    const raw = (description || '').trim();
    if (!raw) return out;
    const looksStructured = /(^|\|)\s*(custody|pattern|markings|observed conditions|notes):/i.test(raw);
    if (!looksStructured) {
        out.notes = raw;
        return out;
    }
    // "Notes:" is last and free text, so it may legitimately contain a "|": keep everything after it.
    const notesAt = raw.search(/(^|\|)\s*notes:/i);
    let head = raw;
    if (notesAt !== -1) {
        const tail = raw.slice(notesAt).replace(/^\|\s*/, '');
        out.notes = tail.replace(/^notes:\s*/i, '').trim();
        head = raw.slice(0, notesAt);
    }
    head.split('|').map((p) => p.trim()).filter(Boolean).forEach((part) => {
        const hit = LABELS.find(([, re]) => re.test(part));
        if (hit) out[hit[0]] = part.replace(hit[1], '').trim();
        else if (!out.notes) out.notes = part;
    });
    return out;
}

// One short line for cards and lists: the reporter's own notes, else the structured details.
export function reportDescriptionSummary(description?: string | null): string {
    const raw = (description || '').trim();
    if (!raw) return '';

    // For lost pet reports, extract the concise headline (e.g. "Missing registered pet: Rocky")
    // rather than dumping contact details or bullet-point paragraphs into card previews.
    if (raw.includes('[LOST PET REPORT]')) {
        const withoutPrefix = raw.replace(/^\[LOST PET REPORT\]\s*/i, '');
        const firstSegment = withoutPrefix.split(/[•\n]/)[0].trim();
        const cleanHeader = firstSegment.replace(/\[QR Tag:[^\]]*\]/i, '').replace(/[.\s]+$/, '').trim();
        if (cleanHeader) return cleanHeader;
        return 'Missing registered pet alert';
    }

    const d = parseReportDescription(raw);
    if (d.notes) {
        return d.notes.replace(/\s+/g, ' ').trim();
    }
    return [d.pattern, d.markings, d.conditions].filter(Boolean).join(' · ');
}
