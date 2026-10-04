import { downloadCsv, escapeHtml, printHtml, todayStamp } from './exportUtils';

/**
 * Exports for the Pet Claims pages (Subdivision + Barangay).
 * Uses the raw API claim (`claim.raw`) so placeholder display values never end up in an export.
 */

const fmtDate = (v?: string | null) =>
    v ? new Date(v).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';

const fileName = (url?: string | null) => (url ? decodeURIComponent(url.split('/').pop() || '').split('?')[0] : '');

/** Evidence files actually stored on a claim, with a readable label. */
export const claimDocuments = (raw: any): { label: string; url: string; name: string }[] =>
    [
        ['Vaccination card', raw?.vaccine_card_url],
        ['Evidence', raw?.evidence_url && raw?.evidence_url !== raw?.vaccine_card_url ? raw.evidence_url : null],
        ['Vet record', raw?.vet_record_url],
        ['Registration record', raw?.registration_record_url],
        ['Additional photo', raw?.additional_photos_url],
    ]
        .filter(([, url]) => !!url)
        .map(([label, url]) => ({ label: label as string, url: url as string, name: fileName(url as string) }));

/** Opens a stored evidence file (Cloudinary URLs) in a new tab, where it can be saved. */
export const openDocument = (url: string) => {
    window.open(url, '_blank', 'noopener,noreferrer');
};

export const exportClaimsCsv = (claims: any[], scopeLabel: string) => {
    const headers = [
        'Claim ID', 'Status', 'Date Filed', 'Last Updated', 'Report #', 'Report Location',
        'Pet ID', 'Pet Name', 'Species', 'Breed', 'Claimant / Owner', 'Owner Email', 'Owner Phone',
        'AI Match Score (%)', 'Evidence Files', 'Distinctive Markings', 'Remarks',
    ];
    const rows = claims.map((c) => {
        const r = c.raw || c; // cached rows from before this change have no raw copy
        const pet = r.pet || {};
        const owner = pet.owner || {};
        return [
            r.claim_id ?? c.claim_id,
            r.status ?? c.status,
            fmtDate(r.created_at),
            fmtDate(r.updated_at),
            r.report_id ?? '',
            r.report?.landmark || '',
            r.pet_id ?? '',
            pet.pet_name || '',
            pet.pet_type || '',
            pet.breed || '',
            owner.name || '',
            owner.email || '',
            owner.phone || '',
            r.match_score ?? '',
            claimDocuments(r).map((d) => d.label).join('; '),
            r.distinctive_markings || '',
            (r.remarks || '').replace(/\s+/g, ' ').trim(),
        ];
    });
    downloadCsv(`pet_claims_${scopeLabel}_${todayStamp()}.csv`, headers, rows);
};

/** One-page printable summary of a single claim (save as PDF from the print dialog). */
export const printClaimSummary = (claim: any, issuedBy?: string) => {
    const r = claim.raw || claim;
    const pet = r.pet || {};
    const owner = pet.owner || {};
    const rep = r.report || {};
    const docs = claimDocuments(r);
    const row = (k: string, v: any) =>
        `<tr><th>${escapeHtml(k)}</th><td>${v === '' || v === null || v === undefined ? '<span class="muted">Not recorded</span>' : escapeHtml(v)}</td></tr>`;
    const photo = pet.photo_url ? `<img src="${escapeHtml(pet.photo_url)}" alt="" class="pet">` : '';
    const html = `
<div class="sheet">
  <header>
    <div>
      <h1>Pet Claim Summary</h1>
      <p class="muted">Claim #${escapeHtml(r.claim_id ?? claim.claim_id)} · StraySafe</p>
    </div>
    <span class="status">${escapeHtml(r.status ?? claim.status)}</span>
  </header>

  <section class="top">
    ${photo}
    <table>
      ${row('Pet', [pet.pet_name, pet.pet_type, pet.breed].filter(Boolean).join(' · '))}
      ${row('Pet record', r.pet_id ? `P-${String(r.pet_id).padStart(5, '0')}` : '')}
      ${row('Markings', pet.distinctive_markings || pet.color_markings || '')}
    </table>
  </section>

  <h2>Claimant (registered owner)</h2>
  <table>
    ${row('Name', owner.name || '')}
    ${row('Email', owner.email || '')}
    ${row('Phone', owner.phone || '')}
    ${row('Address', pet.registered_address || owner.address || '')}
  </table>

  <h2>Linked report</h2>
  <table>
    ${row('Report #', r.report_id ?? '')}
    ${row('Location', rep.landmark || '')}
    ${row('Reported on', fmtDate(rep.created_at))}
    ${row('AI match score', r.match_score !== null && r.match_score !== undefined ? `${r.match_score}%` : '')}
  </table>

  <h2>Claim details</h2>
  <table>
    ${row('Filed on', fmtDate(r.created_at))}
    ${row('Last updated', fmtDate(r.updated_at))}
    ${row('Distinctive markings (claimant)', r.distinctive_markings || '')}
    ${row('Remarks', r.remarks || '')}
  </table>

  <h2>Evidence on file (${docs.length})</h2>
  ${docs.length
        ? `<ul>${docs.map((d) => `<li><strong>${escapeHtml(d.label)}:</strong> ${escapeHtml(d.name)}</li>`).join('')}</ul>`
        : '<p class="muted">No evidence files uploaded.</p>'}

  <footer>Generated ${escapeHtml(fmtDate(new Date().toISOString()))}${issuedBy ? ` by ${escapeHtml(issuedBy)}` : ''} · For official use of the Barangay / Subdivision office.</footer>
</div>`;
    const css = `
  .sheet { max-width: 720px; margin: 0 auto; font-size: 12px; }
  header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #F97316; padding-bottom: 8px; margin-bottom: 12px; }
  h1 { font-size: 20px; margin: 0; color: #0F2C59; }
  h2 { font-size: 12px; text-transform: uppercase; letter-spacing: .06em; color: #0F2C59; margin: 16px 0 6px; border-bottom: 1px solid #e5e7eb; padding-bottom: 3px; }
  .status { border: 1px solid #F97316; color: #c2410c; border-radius: 999px; padding: 3px 10px; font-weight: 700; font-size: 11px; }
  .top { display: flex; gap: 14px; align-items: flex-start; }
  .pet { width: 110px; height: 110px; object-fit: cover; border-radius: 10px; border: 1px solid #e5e7eb; }
  table { width: 100%; border-collapse: collapse; }
  th { text-align: left; width: 34%; color: #6b7280; font-weight: 600; padding: 4px 6px 4px 0; vertical-align: top; }
  td { padding: 4px 0; vertical-align: top; }
  ul { margin: 0; padding-left: 18px; }
  .muted { color: #9ca3af; }
  footer { margin-top: 22px; padding-top: 8px; border-top: 1px solid #e5e7eb; color: #9ca3af; font-size: 10px; }`;
    printHtml(`Pet Claim #${r.claim_id ?? claim.claim_id}`, html, false, css);
};
