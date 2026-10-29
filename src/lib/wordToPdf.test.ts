import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import fontkit from '@pdf-lib/fontkit';
import JSZip from 'jszip';
import { evaluateContent, faceFor, FACES, fileOf, firstFamily, formatCounter, isOldWindowsPicture, plainBullets, readCounters, standIn, textDocx, textInset, type Family } from '@/lib/wordToPdf';

describe('standIn', () => {
  it('matches word’s own fonts to the stand-in with the same widths', () => {
    expect(standIn('Calibri')).toBe('SansC');
    expect(standIn('Calibri Light')).toBe('SansC');
    expect(standIn('Aptos')).toBe('SansC');
    expect(standIn('Cambria')).toBe('Caladea');
    expect(standIn('Arial')).toBe('Arimo');
    expect(standIn('Times New Roman')).toBe('Tinos');
    expect(standIn('Courier New')).toBe('Cousine');
  });

  it('sorts other fonts into serif, sans and mono', () => {
    expect(standIn('Georgia')).toBe('Tinos');
    expect(standIn('PT Serif')).toBe('Tinos');
    expect(standIn('Noto Sans')).toBe('Arimo');
    expect(standIn('Segoe UI')).toBe('Arimo');
    expect(standIn('Consolas')).toBe('Cousine');
  });

  it('falls back on the font table’s kind for names it doesn’t know', () => {
    expect(standIn('Fancy Book', 'roman')).toBe('Tinos');
    expect(standIn('Code Thing', 'modern')).toBe('Cousine');
    expect(standIn('Whatever', 'swiss')).toBe('Arimo');
  });
});

describe('faceFor', () => {
  it('uses a real italic when there is one, and fakes bold on it like browsers do', () => {
    expect(faceFor('Arimo', false, true)).toEqual({ family: 'Arimo', style: 'Italic', skew: 0, fakeBold: false });
    expect(faceFor('Arimo', true, true)).toEqual({ family: 'Arimo', style: 'Italic', skew: 0, fakeBold: true });
  });

  it('slants the upright face when there’s no italic', () => {
    expect(faceFor('Caladea', false, true)).toEqual({ family: 'Caladea', style: 'Regular', skew: 0.25, fakeBold: false });
    expect(faceFor('Cousine', true, true)).toEqual({ family: 'Cousine', style: 'Bold', skew: 0.25, fakeBold: false });
  });
});

describe('formatCounter', () => {
  it('writes list numbers the way word does', () => {
    expect(formatCounter(3, 'decimal')).toBe('3');
    expect(formatCounter(7, 'decimal-leading-zero')).toBe('07');
    expect(formatCounter(1, 'lower-alpha')).toBe('a');
    expect(formatCounter(27, 'lower-alpha')).toBe('aa');
    expect(formatCounter(28, 'upper-alpha')).toBe('BB');
    expect(formatCounter(4, 'lower-roman')).toBe('iv');
    expect(formatCounter(1994, 'upper-roman')).toBe('MCMXCIV');
    expect(formatCounter(5, 'disc')).toBe('•');
  });
});

describe('list markers', () => {
  it('reads computed counter values', () => {
    expect(readCounters('docx-num-1-0 1 docx-num-1-1 0')).toEqual([
      ['docx-num-1-0', 1],
      ['docx-num-1-1', 0],
    ]);
    expect(readCounters('docx-num-2-0')).toEqual([['docx-num-2-0', null]]);
    expect(readCounters('none')).toEqual([]);
  });

  it('works out the text of a numbered ::before', () => {
    const counters = new Map([
      ['docx-num-1-0', 2],
      ['docx-num-1-1', 1],
    ]);
    expect(evaluateContent('counter(docx-num-1-0) ".\\9 "', counters)).toBe('2.\t');
    expect(evaluateContent('"" counter(docx-num-1-1, lower-roman) ")"', counters)).toBe('i)');
    expect(evaluateContent('counter(docx-num-1-0) "." counter(docx-num-1-1) "\\9 "', counters)).toBe('2.1\t');
  });

  it('turns symbol font bullets into real ones', () => {
    expect(plainBullets(evaluateContent('"\\f0b7\\9 "', new Map()))).toBe('•\t');
    expect(plainBullets('\uf0a7')).toBe('▪');
    expect(plainBullets('\uf0e3')).toBe('•');
    expect(plainBullets('o')).toBe('o');
  });

  it('takes the first font from a css list', () => {
    expect(firstFamily('"Times New Roman", serif')).toBe('Times New Roman');
    expect(firstFamily('Calibri')).toBe('Calibri');
  });
});

describe('shapes', () => {
  it('reads a text box inset in points, keeping word’s default for sides left out', () => {
    expect(textInset(null)).toEqual([7.2, 3.6, 7.2, 3.6]);
    expect(textInset('0,0,0,0')).toEqual([0, 0, 0, 0]);
    expect(textInset('5.76pt,2.88pt,5.76pt,2.88pt')).toEqual([5.76, 2.88, 5.76, 2.88]);
    expect(textInset('0,,0')).toEqual([0, 3.6, 0, 3.6]);
    expect(textInset('.1in,1mm')[0]).toBeCloseTo(7.2);
    expect(textInset('.1in,1mm')[1]).toBeCloseTo(2.835, 2);
    // a bare number is in emu
    textInset('91440,45720').forEach((side, i) => expect(side).toBeCloseTo([7.2, 3.6, 7.2, 3.6][i]));
  });

  it('spots emf and wmf pictures', () => {
    const emf = new Uint8Array(108);
    emf.set([1, 0, 0, 0]);
    emf.set([0x20, 0x45, 0x4d, 0x46], 40);
    expect(isOldWindowsPicture(emf)).toBe(true);
    expect(isOldWindowsPicture(new Uint8Array([0xd7, 0xcd, 0xc6, 0x9a, 0, 0]))).toBe(true);
    expect(isOldWindowsPicture(new Uint8Array([1, 0, 9, 0, 0, 3]))).toBe(true);
    expect(isOldWindowsPicture(new Uint8Array([0x89, 0x50, 0x4e, 0x47]))).toBe(false);
    // the same start as an emf, without its signature
    emf.set([0, 0, 0, 0], 40);
    expect(isOldWindowsPicture(emf)).toBe(false);
  });
});

describe('text documents', () => {
  it('puts each line in its own paragraph, with tabs and blank lines kept', async () => {
    const file = await textDocx('Notes & <ideas>\r\nName:\tAda\n\nEnd\u0007', 'notes');
    expect(file.name).toBe('notes.docx');
    const xml = await (await JSZip.loadAsync(await file.arrayBuffer())).file('word/document.xml')!.async('string');
    expect(xml).toContain('<w:p><w:r><w:t xml:space="preserve">Notes &amp; &lt;ideas&gt;</w:t></w:r></w:p>');
    expect(xml).toContain('<w:t xml:space="preserve">Name:</w:t><w:tab/><w:t xml:space="preserve">Ada</w:t>');
    expect(xml).toContain('<w:p/><w:p><w:r><w:t xml:space="preserve">End</w:t></w:r></w:p>');
  });
});

describe('bundled fonts', () => {
  const faces = Object.entries(FACES).flatMap(([family, styles]) => styles.map((style) => ({ family: family as Family, style })));

  it.each(faces)('$family $style is there, with naira and nigerian letters', ({ family, style }) => {
    const url = fileOf(family, style);
    expect(url).toBeTruthy();
    const font = fontkit.create(readFileSync(new URL(`../..${url}`, import.meta.url)));
    // caladea doesn't have them, the converter falls back to another stand-in for those
    const needed = family === 'Caladea' ? ['•', '–', '“'] : ['₦', 'ẹ', 'ọ', 'ṣ', 'ɓ', 'ɗ', 'ị', '•', '–', '“'];
    for (const ch of needed) expect(font.hasGlyphForCodePoint(ch.codePointAt(0)!), ch).toBe(true);
  });
});
