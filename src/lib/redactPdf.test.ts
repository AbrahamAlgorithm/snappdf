import { describe, expect, it } from 'vitest';
import { covered, matchBoxes, PATTERNS, textMatcher, type Mark, type TextRun } from '@/lib/redactPdf';

// a line of text 12 units tall starting at x 100, 700 units down a 600 x 800 page, running right
const line = (str: string, ax = 100, ay = 700, width = str.length * 6): TextRun => ({ str, ax, ay, bx: ax + width, by: ay, ux: 0, uy: -12 });

describe('textMatcher', () => {
  it('finds a phrase in any case, however it is spaced', () => {
    const find = textMatcher('ada  obi')!;
    expect('Name: ADA OBI, Lagos'.match(find)?.[0]).toBe('ADA OBI');
    expect('Ada\nObi'.match(find)?.[0]).toBe('Ada\nObi');
  });

  it('treats what is typed as plain text', () => {
    expect('cost (£5.00) now'.match(textMatcher('(£5.00)')!)?.[0]).toBe('(£5.00)');
    expect('a.c abc'.match(textMatcher('a.c')!)).toHaveLength(1);
    expect(textMatcher('   ')).toBeNull();
  });
});

describe('patterns', () => {
  const find = (id: (typeof PATTERNS)[number]['id'], text: string) => text.match(new RegExp(PATTERNS.find((p) => p.id === id)!.test))?.map((m) => m.trim());
  it('finds emails, phone numbers and long numbers', () => {
    expect(find('email', 'Write to ada.obi+work@example.co.uk or sales@kobo.ng today')).toEqual(['ada.obi+work@example.co.uk', 'sales@kobo.ng']);
    expect(find('phone', 'Call +234 801 234 5678 or (0801) 234-5678.')).toEqual(['+234 801 234 5678', '(0801) 234-5678']);
    expect(find('number', 'Account 0123456789, page 12, year 2024')).toEqual(['0123456789']);
  });
});

describe('matchBoxes', () => {
  it('boxes just the matched part of a line, as fractions of the page', () => {
    // "Call 0801 now": the number starts 5 characters in, 4 long
    const [box] = matchBoxes([line('Call 0801 now')], /0801/g, 600, 800);
    // with a little extra at both ends, which start and end inside the line
    expect(box.x).toBeCloseTo((100 + 5 * 6 - 2) / 600, 3);
    expect(box.w).toBeCloseTo((4 * 6 + 4) / 600, 3);
    // from a little under the line to the top of the letters
    expect(box.y).toBeCloseTo((700 - 12 * 1.05 - 0.5) / 800, 3);
    expect(box.h).toBeGreaterThan(12 / 800);
  });

  it('uses measured letter widths when there are some', () => {
    // "iiWW": the two i are narrow, so the match on WW starts a tenth of the way along, not half. the extra at its
    // start is a third of an average letter, 100 / 4 / 3
    const run: TextRun = { ...line('iiWW', 100, 700, 100), reach: (n) => [0, 0.05, 0.1, 0.55, 1][n] };
    const [box] = matchBoxes([run], /WW/g, 600, 800);
    expect(box.x * 600).toBeCloseTo(100 + 10 - 100 / 12, 0);
    expect(box.x * 600 + box.w * 600).toBeCloseTo(200 + 0.5, 0);
  });

  it('follows a match across pieces of text, and reads pieces that meet as two words', () => {
    const runs = [line('Contact Ada', 100, 700, 66), line('Obi today', 166, 700, 54)];
    const boxes = matchBoxes(runs, /Ada Obi/g, 600, 800);
    expect(boxes).toHaveLength(2);
    expect(boxes[0].x).toBeLessThan(boxes[1].x);
  });

  it('boxes a match on each line it runs over', () => {
    const runs = [line('Ada', 100, 700), line('Obi', 100, 680)];
    expect(matchBoxes(runs, /Ada\s+Obi/g, 600, 800)).toHaveLength(2);
  });

  it('finds nothing where there is nothing, and keeps boxes on the page', () => {
    expect(matchBoxes([line('hello')], /xyz/g, 600, 800)).toEqual([]);
    const [edge] = matchBoxes([line('secret', 0, 5, 36)], /secret/g, 600, 800);
    expect(edge.x).toBeGreaterThanOrEqual(0);
    expect(edge.y).toBeGreaterThanOrEqual(0);
  });
});

describe('covered', () => {
  const mark = (x: number, y: number, w: number, h: number, page = 0): Mark => ({ id: `m${x}${y}${page}`, page, x, y, w, h });
  it('is true for a mark inside another on the same page only', () => {
    expect(covered(mark(0.2, 0.2, 0.1, 0.05), [mark(0.1, 0.1, 0.5, 0.3)])).toBe(true);
    expect(covered(mark(0.2, 0.2, 0.1, 0.05), [mark(0.1, 0.1, 0.5, 0.3, 1)])).toBe(false);
    expect(covered(mark(0.05, 0.2, 0.1, 0.05), [mark(0.1, 0.1, 0.5, 0.3)])).toBe(false);
  });
});
