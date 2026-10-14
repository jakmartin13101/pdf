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

/** A sheet number: S1.02, A-101, M2.1, E001A… */
export const SHEET_NO = /^[A-Z]{1,3}[-.\s]?\d{1,3}(?:[.-]\d{1,3})?[A-Z]?$/;
// Title-block captions: "SHEET NUMBER", "DRAWING TITLE", "DWG NO." anywhere; a bare "SHEET" or "TITLE" only as a
// caption (alone, with a colon, or in front of the number) – "COVER SHEET" is a title.
const CAPTIONS = /\b(SHEET\s*(NO\.?|NUMBER|TITLE)|DRAWING\s*(NO\.?|NUMBER|TITLE)|DWG\.?\s*NO\.?)(?!\w)\s*:?/gi;
const BARE_CAPTION = /^\s*(SHEET|TITLE)\s*(:|$|(?=[A-Z]{1,3}[-.\s]?\d))\s*/i;
const stripCaptions = (line: string) => line.replace(CAPTIONS, ' ').replace(BARE_CAPTION, ' ');

export type LabelRole = 'number' | 'title' | 'both';

/**
 * Sheet number and title from the text in a title-block box (lines top to bottom). Captions such as
 * "SHEET NUMBER" or "DRAWING TITLE" are dropped.
 */
export function splitLabel(lines: string[]): { number: string; title: string } {
  const clean = lines.map((l) => stripCaptions(l).replace(/\s+/g, ' ').trim()).filter(Boolean);
  let number = '';
  const rest: string[] = [];
  for (const line of clean) {
    if (!number && SHEET_NO.test(line)) {
      number = line.replace(/\s+/g, '');
      continue;
    }
    const tokens = line.split(' ');
    const i = number ? -1 : tokens.findIndex((t) => SHEET_NO.test(t));
    if (i >= 0) {
      number = tokens[i];
      tokens.splice(i, 1);
    }
    if (tokens.length) rest.push(tokens.join(' '));
  }
  return { number, title: titleCase(rest.join(' ').trim()) };
}

/** What a box most likely holds: just a sheet number, just a title, or both. */
export function guessLabelRole(lines: string[]): LabelRole {
  const { number, title } = splitLabel(lines);
  if (number && /[A-Za-z]{3,}/.test(title)) return 'both';
  return number ? 'number' : 'title';
}

/** The label fields a box gives for a role. */
export function labelFromBox(lines: string[], role: LabelRole): { number?: string; title?: string } {
  const text = lines.join(' ').replace(/\s+/g, ' ').trim();
  if (!text) return {};
  if (role === 'number') return { number: splitLabel(lines).number || text.replace(/\s+/g, '') };
  if (role === 'title') return { title: titleCase(lines.map(stripCaptions).join(' ').replace(/\s+/g, ' ').trim()) };
  const both = splitLabel(lines);
  return { ...(both.number ? { number: both.number } : {}), ...(both.title ? { title: both.title } : {}) };
}
