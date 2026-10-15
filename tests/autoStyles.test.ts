import { describe, expect, it } from 'vitest';
import { autoLook, autoStyleFor, chestToolForSize, defaultAutoStyles, isAutoMarkup, newAutoStyle } from '../src/core/autoStyles';
import { extendSegment, projectOnLine } from '../src/core/geometry';
import { defaultToolChest } from '../src/core/defaults';
import type { Markup } from '../src/types';

describe('auto takeoff line styles', () => {
  const rules = [
    newAutoStyle({ text: 'W30', color: '#b5179e', lineWidth: 5 }),
    newAutoStyle({ text: 'W', color: '#1aa34a', lineStyle: 'solid' }),
    newAutoStyle({ text: 'x1/4', match: 'contains', color: '#1f6feb', lineStyle: 'dashed' }),
    newAutoStyle({ text: 'Pipe 4 Std', match: 'is', color: '#0b8f8a' }),
    newAutoStyle({ text: 'C', enabled: false, color: '#000000' }),
  ];
  it('takes the first enabled rule the subject matches', () => {
    expect(autoStyleFor(rules, 'W30X90')?.color).toBe('#b5179e');
    expect(autoStyleFor(rules, 'w24x55')?.color).toBe('#1aa34a'); // case does not matter
    expect(autoStyleFor(rules, 'HSS8X4X1/4')?.lineStyle).toBe('dashed');
    expect(autoStyleFor(rules, 'pipe  4 std')?.color).toBe('#0b8f8a');
    expect(autoStyleFor(rules, 'Pipe 4 Std XS')).toBeUndefined(); // "is" means the whole subject
    expect(autoStyleFor(rules, 'C10X15.3')).toBeUndefined(); // rule switched off
  });

  it('a rule beats the Tool Chest tool, which beats a colour per size', () => {
    const chest = defaultToolChest();
    expect(chestToolForSize(chest, 'W24X55')?.name).toBe('W24X55');
    const ruled = autoLook(chest, { autoStyles: defaultAutoStyles(), autoUseToolStyle: true }, 'W24X55');
    expect([ruled.style.color, ruled.style.lineStyle, ruled.rule?.text]).toEqual(['#1aa34a', 'solid', 'W']);
    const tool = autoLook(chest, { autoStyles: [], autoUseToolStyle: true }, 'W24X55');
    expect([tool.style.color, tool.style.lineWidth]).toEqual(['#f46036', 3.5]); // the W24X55 tool's look
    const plain = autoLook(chest, { autoStyles: [], autoUseToolStyle: false }, 'W24X55');
    expect(plain.style.color).not.toBe('#f46036');
    expect(autoLook(chest, { autoStyles: defaultAutoStyles(), autoUseToolStyle: true }, 'HSS6X6X1/4').style.lineStyle).toBe('dashed');
  });

  it('recognises measurements made by the automatic takeoff', () => {
    const m = (p: Partial<Markup>) => ({ type: 'length', comments: '', ...p }) as Markup;
    expect(isAutoMarkup(m({ auto: true }))).toBe(true);
    expect(isAutoMarkup(m({ comments: 'Automatic takeoff from the label “W24X55”' }))).toBe(true);
    expect(isAutoMarkup(m({}))).toBe(false);
  });
});

describe('end adjustment', () => {
  it('lengthens and shortens along the line', () => {
    expect(extendSegment({ x: 0, y: 0 }, { x: 100, y: 0 }, 9, -4.5)).toEqual([
      { x: -9, y: 0 },
      { x: 95.5, y: 0 },
    ]);
    const [a, b] = extendSegment({ x: 0, y: 0 }, { x: 30, y: 40 }, 0, 5);
    expect(a).toEqual({ x: 0, y: 0 });
    expect(b.x).toBeCloseTo(33);
    expect(b.y).toBeCloseTo(44);
  });
  it('never shortens past a minimum length', () => {
    const [a, b] = extendSegment({ x: 0, y: 0 }, { x: 10, y: 0 }, -20, -20);
    expect(b.x - a.x).toBeCloseTo(1);
    expect((a.x + b.x) / 2).toBeCloseTo(5);
  });
  it('projects a dragged point onto the member line', () => {
    expect(projectOnLine({ x: 50, y: 7 }, { x: 0, y: 0 }, { x: 100, y: 0 })).toEqual({ x: 50, y: 0 });
  });
});
