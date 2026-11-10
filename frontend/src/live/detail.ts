/**
 * The sentence a person should read for an error answer: the server's own `detail`, whatever shape FastAPI gave it
 * (a string, a list of validation messages, or an object with a `message`). Pure, so it runs under `node --test`.
 */
export function detailOf(data: unknown): string | null {
  if (!data || typeof data !== 'object') return null;
  const detail = (data as { detail?: unknown }).detail;
  if (typeof detail === 'string') return detail.trim() || null;
  if (Array.isArray(detail)) {
    const parts = detail.map((d) => (typeof d === 'string' ? d : (d as { msg?: unknown })?.msg)).filter((m): m is string => typeof m === 'string' && m.length > 0);
    return parts.length ? parts.join(' ') : null;
  }
  if (detail && typeof detail === 'object') {
    const message = (detail as { message?: unknown }).message;
    if (typeof message === 'string' && message.trim()) return message.trim();
  }
  return null;
}
