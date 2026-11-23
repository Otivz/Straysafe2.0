/**
 * Reading a StraySafe pet QR tag (Phase 4 of docs/06-future-proposals/PET_QR_TAGS_PLAN_2026-11-17.md).
 *
 * A printed tag holds `<some address>/t/<token>`. The address can change (a quick tunnel gets a new one every run) while the
 * token never does, so the in-app scanner keeps only the token and opens `/t/<token>` on the app's own address. Anything
 * else (another site's QR code, a payment code, plain text) is not a pet tag and is refused.
 */
const TOKEN = /^[A-Za-z0-9_-]{16,32}$/;

export function tokenFromQr(raw: string): string | null {
  const text = (raw ?? '').trim();
  if (!text) return null;
  if (TOKEN.test(text)) return text;
  let path = text;
  try {
    const url = new URL(text);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
    path = url.pathname;
  } catch {
    // Allow relative paths such as /t/<token>
  }
  const match = /(?:^|\/)t\/([^/?#]+)\/?$/.exec(path);
  if (!match) return null;
  const token = decodeURIComponent(match[1]);
  return TOKEN.test(token) ? token : null;
}

/** The QR tag message states as the owner sees them (QR_TAG_SCAN_TO_CASE_PLAN_2026-11-23.md). */
export const STATUS_PILL = {
  new: { tone: 'brand', label: 'New' },
  seen_by_owner: { tone: 'amber', label: 'Viewed' },
  resolved: { tone: 'sage', label: 'Done' },
  returned: { tone: 'sage', label: 'Pet returned' },
  dismissed: { tone: 'neutral', label: 'Not the pet' },
} as const;
export const isClosedScan = (status: string) => status === 'resolved' || status === 'returned' || status === 'dismissed';
