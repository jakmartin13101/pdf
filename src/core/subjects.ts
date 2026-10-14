// Subjects: a markup's subject is the shape it takes off (W, HSS, L, BP, C, BO…), picked from a list
// each user keeps (Settings → Subjects). The size itself (W24x55) is the Member Size and the label.

/** The subjects the program starts with. */
export const DEFAULT_SUBJECTS = ['W', 'HSS', 'L', 'C', 'MC', 'WT', 'S', 'HP', 'PL', 'BP', 'BO', 'PIPE'];

const norm = (s: string) => s.trim().toUpperCase();

/** A subject in the list, matched without regard to case (as the list spells it). */
export function findSubject(value: string, subjects: string[]): string | undefined {
  const v = norm(value);
  return v ? subjects.find((s) => norm(s) === v) : undefined;
}

/**
 * The subject a size belongs to: the longest subject in the list the size starts with, where the
 * subject is not followed by another letter (W24x55 → W, WT12x34 → WT only, HSS6x6x3/8 → HSS,
 * Pipe 4 Std → PIPE).
 */
export function subjectForSize(size: string, subjects: string[]): string | undefined {
  const v = norm(size);
  if (!v) return undefined;
  let best: string | undefined;
  for (const s of subjects) {
    const code = norm(s);
    if (!code || !v.startsWith(code)) continue;
    const next = v.charAt(code.length);
    if (next && /[A-Z]/.test(next)) continue;
    if (!best || code.length > norm(best).length) best = s;
  }
  return best;
}

/** A value as a subject: itself when it is in the list, else the shape of the size it names, else none. */
export function subjectFor(value: string | undefined, subjects: string[]): string {
  if (!value) return '';
  return findSubject(value, subjects) ?? subjectForSize(value, subjects) ?? '';
}

/** The list cleaned up: trimmed, no blanks, no repeats (first spelling kept). */
export function cleanSubjects(list: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const s of list) {
    const t = s.trim();
    if (!t || seen.has(norm(t))) continue;
    seen.add(norm(t));
    out.push(t);
  }
  return out;
}

/**
 * A subject from before subjects were shapes (W24x55, HSS6x6x3/8 Column) as a shape and a size:
 * { subject: 'W', size: 'W24x55' }. Undefined when it names no shape in the list.
 */
export function splitOldSubject(value: string, subjects: string[]): { subject: string; size?: string } | undefined {
  const exact = findSubject(value, subjects);
  if (exact) return { subject: exact };
  const subject = subjectForSize(value, subjects);
  if (!subject) return undefined;
  const first = value.trim().split(/\s+/)[0];
  return { subject, size: /\d/.test(first) ? first : undefined };
}
