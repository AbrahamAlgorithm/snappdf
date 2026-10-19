import { describe, expect, it } from 'vitest';
import { detectPage, flatSize, homography, isConvex, orderCorners, pageAspect, warp, type Pixels, type Quad } from '@/lib/scan';

// made-up photos of a page on a surface, with the page corners known, so detection can be measured

type RGB = [number, number, number];

// same numbers every run
function random(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// maps a photo point back onto the page (0 to 1 each way), the inverse of homography(1, 1, quad)
function toPage(quad: Quad) {
  const [a, b, c, d, e, f, g, h] = homography(1, 1, quad);
  const m = [a, b, c, d, e, f, g, h, 1];
  const inv = [
    m[4] * m[8] - m[5] * m[7],
    m[2] * m[7] - m[1] * m[8],
    m[1] * m[5] - m[2] * m[4],
    m[5] * m[6] - m[3] * m[8],
    m[0] * m[8] - m[2] * m[6],
    m[2] * m[3] - m[0] * m[5],
    m[3] * m[7] - m[4] * m[6],
    m[1] * m[6] - m[0] * m[7],
    m[0] * m[4] - m[1] * m[3],
  ];
  return (x: number, y: number) => {
    const z = inv[6] * x + inv[7] * y + inv[8];
    return { u: (inv[0] * x + inv[1] * y + inv[2]) / z, v: (inv[3] * x + inv[4] * y + inv[5]) / z };
  };
}

function photo({
  page,
  background,
  w = 300,
  h = 400,
  paper = [242, 240, 234],
  ruled = false,
  box = false,
  light = () => 1,
  seed = 1,
}: {
  page: Quad;
  background: (x: number, y: number) => RGB;
  w?: number;
  h?: number;
  paper?: RGB;
  ruled?: boolean;
  box?: boolean;
  light?: (x: number, y: number) => number;
  seed?: number;
}): Pixels {
  const rand = random(seed);
  const words = random(seed + 7);
  const inked = Array.from({ length: 40 * 30 }, () => words() < 0.7);
  const map = toPage(page);
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const { u, v } = map(x + 0.5, y + 0.5);
      let color: RGB;
      if (u >= 0 && u < 1 && v >= 0 && v < 1) {
        color = [...paper] as RGB;
        const row = v * 30;
        const inText = v > 0.1 && v < 0.85 && u > 0.1 && u < 0.9 && row % 1 > 0.35 && row % 1 < 0.65;
        if (ruled && row % 1 < 0.05) color = [175, 195, 228];
        if (inText && inked[Math.floor(row) * 30 + Math.floor(u * 30)] && (u * 90) % 1 < 0.5) color = [45, 45, 70];
        const onBox = u > 0.2 && u < 0.8 && v > 0.55 && v < 0.75 && (Math.abs(u - 0.2) < 0.006 || Math.abs(u - 0.8) < 0.006 || Math.abs(v - 0.55) < 0.006 || Math.abs(v - 0.75) < 0.006);
        if (box && onBox) color = [30, 30, 30];
      } else {
        color = background(x, y);
      }
      const shade = light(x, y);
      const i = (y * w + x) * 4;
      for (let c = 0; c < 3; c++) data[i + c] = color[c] * shade + (rand() - 0.5) * 14;
      data[i + 3] = 255;
    }
  }
  return { data, width: w, height: h };
}

const q = (...xy: number[]) => [0, 1, 2, 3].map((i) => ({ x: xy[i * 2], y: xy[i * 2 + 1] })) as Quad;

const cloth = (x: number, y: number): RGB => [62 + 6 * Math.sin(x * 0.9) * Math.sin(y * 0.9), 46, 42];
const wood = (x: number, y: number): RGB => {
  const grain = 18 * Math.sin(x * 0.12 + Math.sin(y * 0.03) * 3);
  return [168 + grain, 124 + grain, 84 + grain * 0.6];
};
const lightTable = (): RGB => [196, 196, 200];

// furthest any found corner is from the real one, as a share of the photo's diagonal
function cornerError(found: Quad | null, truth: Quad, w = 300, h = 400) {
  if (!found) return Infinity;
  const diag = Math.hypot(w, h);
  return Math.max(...found.map((p, i) => Math.hypot(p.x - truth[i].x, p.y - truth[i].y) / diag));
}

describe('detectPage', () => {
  const cases: [string, Parameters<typeof photo>[0]][] = [
    ['straight page on a dark cloth', { page: q(50, 60, 250, 60, 250, 340, 50, 340), background: cloth }],
    ['tilted page shot from an angle', { page: q(70, 55, 245, 75, 265, 350, 30, 330), background: cloth }],
    ['ruled notebook page with handwriting', { page: q(60, 40, 240, 50, 255, 360, 40, 365), background: cloth, ruled: true }],
    ['page on a wooden table', { page: q(45, 70, 235, 50, 260, 330, 55, 355), background: wood }],
    ['white page on a light grey table', { page: q(55, 60, 245, 65, 240, 345, 50, 340), background: lightTable }],
    ['page with a table drawn on it', { page: q(40, 50, 260, 50, 260, 350, 40, 350), background: cloth, box: true }],
    ['uneven lighting from one side', { page: q(60, 50, 250, 70, 240, 350, 45, 330), background: wood, light: (x) => 0.6 + 0.5 * (x / 300) }],
    ['a shadow across the bottom', { page: q(50, 60, 250, 60, 255, 345, 45, 340), background: cloth, light: (x, y) => (y > 260 && x < 200 ? 0.72 : 1) }],
    ['small page far away', { page: q(100, 130, 205, 135, 210, 275, 95, 270), background: wood }],
  ];

  it.each(cases)('finds the corners of a %s', (_, scene) => {
    const found = detectPage(photo(scene));

    expect(cornerError(found, scene.page)).toBeLessThan(0.02);
  });

  it('finds nothing in a photo with no page', () => {
    const found = detectPage(photo({ page: q(-10, -10, -9, -10, -9, -9, -10, -9), background: wood }));

    expect(found).toBeNull();
  });
});

describe('orderCorners', () => {
  it('puts any four corners in top left, top right, bottom right, bottom left order', () => {
    const corners = q(10, 10, 100, 12, 98, 150, 8, 140);
    const shuffled = [corners[2], corners[0], corners[3], corners[1]];

    expect(orderCorners(shuffled)).toEqual(corners);
  });
});

describe('isConvex', () => {
  it('spots a corner dragged inside the page', () => {
    expect(isConvex(q(0, 0, 100, 0, 100, 100, 0, 100))).toBe(true);
    expect(isConvex(q(0, 0, 100, 0, 30, 30, 0, 100))).toBe(false);
  });
});

describe('warp', () => {
  it('flattens a tilted page into a straight rectangle', () => {
    // left half of the page red, right half blue, seen at an angle
    const page = q(60, 40, 250, 70, 230, 360, 40, 330);
    const map = toPage(page);
    const w = 300;
    const h = 400;
    const data = new Uint8ClampedArray(w * h * 4);
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const { u, v } = map(x + 0.5, y + 0.5);
        const inside = u >= 0 && u < 1 && v >= 0 && v < 1;
        const color: RGB = !inside ? [0, 0, 0] : u < 0.5 ? [255, 0, 0] : [0, 0, 255];
        data.set([...color, 255], (y * w + x) * 4);
      }

    const size = flatSize(page, 1000);
    const flat = warp({ data, width: w, height: h }, page, size.width, size.height);

    const at = (fx: number, fy: number) => {
      const i = (Math.floor(fy * flat.height) * flat.width + Math.floor(fx * flat.width)) * 4;
      return [...flat.data.slice(i, i + 3)];
    };
    // every corner of the result is page, not the black around it, and the halves stay put
    for (const [fx, fy] of [
      [0.03, 0.03],
      [0.03, 0.97],
    ])
      expect(at(fx, fy)).toEqual([255, 0, 0]);
    for (const [fx, fy] of [
      [0.97, 0.03],
      [0.97, 0.97],
    ])
      expect(at(fx, fy)).toEqual([0, 0, 255]);
    expect(at(0.45, 0.5)).toEqual([255, 0, 0]);
    expect(at(0.55, 0.5)).toEqual([0, 0, 255]);
  });

  // corners of a 600 x 848 page photographed at an angle by a real perspective camera (chrome's 3d css),
  // in a 1800 x 2400 photo. measured, they look between 1.21 and 1.40 times taller than wide, the page is 1.41
  it.each([
    ['tipped back', q(277.0, 445.0, 1379.5, 359.9, 1626.0, 1967.6, 325.4, 2086.3)],
    ['turned sideways', q(362.5, 283.9, 1505.0, 387.6, 1346.4, 1866.8, 314.8, 1879.3)],
    ['tipped back and rotated', q(477.0, 414.7, 1507.7, 522.2, 1421.0, 2053.0, 171.1, 1894.1)],
  ])('works out the real shape of a page %s', (_, corners) => {
    expect(pageAspect(corners, 1800, 2400)).toBeCloseTo(600 / 848, 2);
    const { width, height } = flatSize(corners, 3000, { width: 1800, height: 2400 });
    expect(height / width).toBeCloseTo(848 / 600, 1);
  });

  it('keeps the page in proportion and caps its size', () => {
    expect(flatSize(q(0, 0, 200, 0, 200, 300, 0, 300), 1000)).toEqual({ width: 200, height: 300 });
    expect(flatSize(q(0, 0, 2000, 0, 2000, 3000, 0, 3000), 1500)).toEqual({ width: 1000, height: 1500 });
  });
});
