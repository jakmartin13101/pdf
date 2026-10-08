const SMALL_WORDS = new Set(['and', 'or', 'of', 'the', 'a', 'an', 'to', 'for', 'in', 'on', 'at', 'with']);

/** Convert ALL-CAPS title block text to Title Case; mixed-case text is left alone. */
export function titleCase(s: string): string {
  if (s !== s.toUpperCase()) return s;
  return s
    .toLowerCase()
    .split(' ')
    .map((w, i) => (i > 0 && SMALL_WORDS.has(w) ? w : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(' ');
}
