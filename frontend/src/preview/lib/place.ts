/** The words a place may already start with (the same list as the server's place_phrase, services/lost_pet_lifecycle.py). */
const PREPOSITION = /^(near|behind|beside|by|at|on|in|inside|outside|under|along|across|opposite|next to|in front of)\s/i;

/** A place a resident typed, inside a sentence: "near Gate 2", and "behind the chapel" as written (never "near Near the court"). */
export function placePhrase(where: string | null | undefined, fallback = ''): string {
  const t = (where ?? '').trim();
  if (!t) return fallback;
  return PREPOSITION.test(t) ? t[0].toLowerCase() + t.slice(1) : `near ${t}`;
}
