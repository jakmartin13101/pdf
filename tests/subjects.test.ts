import { describe, expect, it } from 'vitest';
import { DEFAULT_SUBJECTS, cleanSubjects, findSubject, splitOldSubject, subjectFor, subjectForSize } from '../src/core/subjects';
import { summaryKey } from '../src/core/summary';
import { newAutoStyle, withRule } from '../src/core/autoStyles';
import { defaultStyle, textColor } from '../src/core/markupTypes';
import { defaultToolChest } from '../src/core/defaults';

describe('subjects are shapes', () => {
  it('finds the shape a size belongs to', () => {
    expect(subjectForSize('W24x55', DEFAULT_SUBJECTS)).toBe('W');
    expect(subjectForSize('HSS6x6x3/8', DEFAULT_SUBJECTS)).toBe('HSS');
    expect(subjectForSize('MC12x10.6', DEFAULT_SUBJECTS)).toBe('MC'); // not C
    expect(subjectForSize('WT12x34', DEFAULT_SUBJECTS)).toBe('WT'); // not W
    expect(subjectForSize('WT12x34', ['W'])).toBeUndefined(); // W is not followed by a letter
    expect(subjectForSize('Pipe 4 Std', DEFAULT_SUBJECTS)).toBe('PIPE');
    expect(subjectForSize('PL1/2x8', DEFAULT_SUBJECTS)).toBe('PL');
    expect(subjectForSize('24K6', DEFAULT_SUBJECTS)).toBeUndefined();
    expect(subjectForSize('Length Measurement', DEFAULT_SUBJECTS)).toBeUndefined();
  });

  it('takes values from the user list only', () => {
    expect(findSubject('hss', DEFAULT_SUBJECTS)).toBe('HSS');
    expect(subjectFor('HSS6x6x3/8 Column', DEFAULT_SUBJECTS)).toBe('HSS');
    expect(subjectFor('Metal Deck', DEFAULT_SUBJECTS)).toBe('');
    expect(subjectFor('BO', [...DEFAULT_SUBJECTS])).toBe('BO');
    expect(subjectFor('W24x55', ['HSS'])).toBe(''); // W removed from the list
    expect(cleanSubjects([' W', 'w', '', 'HSS ', 'BP'])).toEqual(['W', 'HSS', 'BP']);
  });

  it('turns subjects from before into a shape and a size', () => {
    expect(splitOldSubject('W24x55', DEFAULT_SUBJECTS)).toEqual({ subject: 'W', size: 'W24x55' });
    expect(splitOldSubject('HSS6x6x3/8 Column', DEFAULT_SUBJECTS)).toEqual({ subject: 'HSS', size: 'HSS6x6x3/8' });
    expect(splitOldSubject('hss', DEFAULT_SUBJECTS)).toEqual({ subject: 'HSS' });
    expect(splitOldSubject('Metal Deck', DEFAULT_SUBJECTS)).toBeUndefined();
  });

  it('gives each size its own summary line', () => {
    expect(summaryKey('W', 'W24x55')).toBe('W24x55');
    expect(summaryKey('BP', 'PL1/2x8')).toBe('BP PL1/2x8');
    expect(summaryKey('W', '')).toBe('W');
    expect(summaryKey('', '')).toBe('(no subject)');
  });

  it('starts the Tool Chest with shape subjects', () => {
    const tools = defaultToolChest().flatMap((s) => s.tools);
    const by = (name: string) => tools.find((t) => t.name === name)!.subject;
    expect(by('W24x55')).toBe('W');
    expect(by('HSS6x6x3/8 Column')).toBe('HSS');
    expect(by('W10x33 Column')).toBe('W');
    expect(by('Base Plate')).toBe('BP');
    expect(by('Metal Deck')).toBe('');
    for (const t of tools) expect(t.subject === '' || DEFAULT_SUBJECTS.includes(t.subject)).toBe(true);
  });
});

describe('text colour', () => {
  it('is the line colour unless set, and line style rules can set it', () => {
    const s = defaultStyle('length');
    expect(textColor(s)).toBe(s.color);
    expect(textColor({ ...s, fontColor: '#000000' })).toBe('#000000');
    const rule = newAutoStyle({ text: 'W', color: '#1aa34a', fontColor: '#111111' });
    expect(withRule(s, rule)).toMatchObject({ color: '#1aa34a', fontColor: '#111111' });
    expect(withRule({ ...s, fontColor: '#ff0000' }, newAutoStyle({ text: 'W' })).fontColor).toBeUndefined();
  });
});
