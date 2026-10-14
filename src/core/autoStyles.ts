// How automatic takeoff measurements look: line style rules by subject (Settings → Auto Takeoff),
// then the Tool Chest tool for the size, then a colour per size.

import type { AutoStyleRule, ChestTool, Markup, MarkupStyle, ToolSet } from '../types';
import { normName } from './formula';
import { defaultStyle } from './markupTypes';
import { sizeColor } from './autoTakeoff';
import { DEFAULT_SUBJECTS, subjectForSize } from './subjects';

export const AUTO_MATCH: { id: AutoStyleRule['match']; label: string }[] = [
  { id: 'starts', label: 'starts with' },
  { id: 'contains', label: 'contains' },
  { id: 'is', label: 'is' },
];

let n = 0;
export const ruleId = () => `as${Date.now().toString(36)}${(n++).toString(36)}`;

export function newAutoStyle(patch: Partial<AutoStyleRule> = {}): AutoStyleRule {
  return { id: ruleId(), enabled: true, match: 'starts', text: '', color: '#1aa34a', lineWidth: 3, lineStyle: 'solid', opacity: 1, ...patch };
}

/** Starting rules: wide flange beams green, tubing blue, pipe teal, channels purple, angles orange. */
export function defaultAutoStyles(): AutoStyleRule[] {
  return [
    newAutoStyle({ text: 'W', color: '#1aa34a', lineWidth: 3 }),
    newAutoStyle({ text: 'HSS', color: '#1f6feb', lineWidth: 3, lineStyle: 'dashed' }),
    newAutoStyle({ text: 'Pipe', color: '#0b8f8a', lineWidth: 3, lineStyle: 'dashed' }),
    newAutoStyle({ text: 'MC', color: '#6a4c93', lineWidth: 2.5 }),
    newAutoStyle({ text: 'C', color: '#6a4c93', lineWidth: 2.5 }),
    newAutoStyle({ text: 'L', color: '#e76f51', lineWidth: 2.5, lineStyle: 'dotted' }),
  ];
}

const norm = (s: string) => s.trim().toUpperCase().replace(/\s+/g, ' ');

/** The first enabled rule matching a subject (case does not matter). */
export function autoStyleFor(rules: AutoStyleRule[], subject: string): AutoStyleRule | undefined {
  const s = norm(subject);
  return rules.find((r) => {
    const t = norm(r.text);
    if (!r.enabled || !t) return false;
    return r.match === 'is' ? s === t : r.match === 'contains' ? s.includes(t) : s.startsWith(t);
  });
}

export const withRule = (style: MarkupStyle, r: AutoStyleRule): MarkupStyle => ({
  ...style,
  color: r.color,
  fontColor: r.fontColor || undefined,
  lineWidth: r.lineWidth,
  lineStyle: r.lineStyle,
  opacity: r.opacity,
});

const same = (a: string, b: string) => normName(a) === normName(b);

/** The Tool Chest tool that takes off this size as a length, if there is one. */
export function chestToolForSize(chest: ToolSet[], size: string): ChestTool | undefined {
  const tools = chest.flatMap((s) => s.tools).filter((t) => t.type === 'length' || t.type === 'polylength');
  const memberSize = (t: ChestTool) => Object.entries(t.custom).find(([k]) => normName(k) === 'membersize')?.[1];
  const hits = tools.filter((t) => same(String(memberSize(t) ?? ''), size) || (t.sizeTool && same(t.sizeTool.value, size)) || same(t.subject, size));
  return hits.find((t) => t.type === 'length') ?? hits[0];
}

/** Subject an auto takeoff member gets: the shape of its size from the user's subjects (W24x55 → W). */
export const autoSubject = (size: string, subjects: string[] = DEFAULT_SUBJECTS) => subjectForSize(size, subjects) ?? '';

export interface AutoLookPrefs {
  autoStyles: AutoStyleRule[];
  /** Without a matching rule: the Tool Chest tool's look for the size (true) or a colour per size. */
  autoUseToolStyle: boolean;
  subjects?: string[];
}

/** The line a member of this size will be drawn with. */
export function autoLook(chest: ToolSet[], prefs: AutoLookPrefs, size: string): { style: MarkupStyle; tool?: ChestTool; rule?: AutoStyleRule } {
  const tool = chestToolForSize(chest, size);
  const base: MarkupStyle = tool && prefs.autoUseToolStyle ? { ...tool.style } : { ...defaultStyle('length'), color: sizeColor(size), lineWidth: 3 };
  const rule = autoStyleFor(prefs.autoStyles, autoSubject(size, prefs.subjects)) ?? autoStyleFor(prefs.autoStyles, size);
  return { style: rule ? withRule(base, rule) : base, tool, rule };
}

/** Markups made by the automatic takeoff (older projects: by their comment). */
export const isAutoMarkup = (m: Markup) => !!m.auto || (m.type === 'length' && m.comments.startsWith('Automatic takeoff'));
