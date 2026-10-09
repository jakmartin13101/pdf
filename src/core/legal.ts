// Shared by the Help → Terms of Service dialog and (via scripts/make-legal.mjs)
// the installer license page. The source of truth is legal/terms-of-service.md.

export type LegalBlock =
  | { kind: 'h1'; text: string }
  | { kind: 'h2'; text: string }
  | { kind: 'p'; text: string }
  | { kind: 'ul'; items: string[] }
  | { kind: 'ol'; items: string[] };

/** Parses the small Markdown subset used by the legal documents (headings, paragraphs, lists, **bold**). */
export function parseLegalMarkdown(md: string): LegalBlock[] {
  const out: LegalBlock[] = [];
  let para: string[] = [];
  let list: { kind: 'ul' | 'ol'; items: string[] } | null = null;
  const flush = () => {
    if (para.length) out.push({ kind: 'p', text: para.join('\n') });
    if (list) out.push(list);
    para = [];
    list = null;
  };
  for (const raw of md.replace(/\r\n?/g, '\n').split('\n')) {
    const line = raw.trimEnd();
    const h = /^(#{1,2})\s+(.*)$/.exec(line);
    const ul = /^\s*[-*]\s+(.*)$/.exec(line);
    const ol = /^\s*\d+[.)]\s+(.*)$/.exec(line);
    if (!line.trim()) {
      flush();
    } else if (h) {
      flush();
      out.push({ kind: h[1].length === 1 ? 'h1' : 'h2', text: h[2] });
    } else if (ul || ol) {
      const kind = ul ? 'ul' : 'ol';
      if (para.length || (list && list.kind !== kind)) flush();
      list ??= { kind, items: [] };
      list.items.push((ul ?? ol)![1]);
    } else if (list) {
      list.items[list.items.length - 1] += ' ' + line.trim();
    } else {
      para.push(line);
    }
  }
  flush();
  return out;
}

/** Splits text on **bold** markers: odd indexes are bold. */
export function splitBold(text: string): string[] {
  return text.split(/\*\*(.+?)\*\*/g);
}

/** Plain-text rendering for installer license pages. */
export function legalToPlainText(md: string): string {
  const lines: string[] = [];
  for (const b of parseLegalMarkdown(md)) {
    if (b.kind === 'ul' || b.kind === 'ol') {
      b.items.forEach((it, i) => lines.push(`${b.kind === 'ol' ? `${i + 1}.` : '-'} ${splitBold(it).join('')}`));
      lines.push('');
    } else {
      lines.push(b.kind === 'p' ? splitBold(b.text).join('') : b.text.toUpperCase(), '');
    }
  }
  return lines.join('\n').trim() + '\n';
}
