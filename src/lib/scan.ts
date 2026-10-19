// finds the page in a photo and flattens it, like a scanner app. plain pixel maths, so it's tiny and works offline

export type Point = { x: number; y: number };
// top left, top right, bottom right, bottom left
export type Quad = [Point, Point, Point, Point];
export type Pixels = { data: Uint8ClampedArray; width: number; height: number };

// the page is looked for on a small copy of the photo, plenty to find the edges and quick on any phone
export const DETECT_SIZE = 400;

type Line = { t: number; rho: number; cos: number; sin: number; votes: number };

const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);

// box blur, run twice it's close to a gaussian. smooths out text and paper grain so only big edges stay
function blur(src: Float32Array, w: number, h: number, r: number) {
  const tmp = new Float32Array(w * h);
  const out = new Float32Array(w * h);
  const size = 2 * r + 1;
  for (let y = 0; y < h; y++) {
    const row = y * w;
    let sum = 0;
    for (let x = -r; x <= r; x++) sum += src[row + clamp(x, 0, w - 1)];
    for (let x = 0; x < w; x++) {
      tmp[row + x] = sum / size;
      sum += src[row + Math.min(x + r + 1, w - 1)] - src[row + Math.max(x - r, 0)];
    }
  }
  for (let x = 0; x < w; x++) {
    let sum = 0;
    for (let y = -r; y <= r; y++) sum += tmp[clamp(y, 0, h - 1) * w + x];
    for (let y = 0; y < h; y++) {
      out[y * w + x] = sum / size;
      sum += tmp[Math.min(y + r + 1, h - 1) * w + x] - tmp[Math.max(y - r, 0) * w + x];
    }
  }
  return out;
}

function quantile(values: Float32Array | number[], q: number) {
  const sorted = Float32Array.from(values).sort();
  return sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))] : 0;
}

function intersect(a: Line, b: Line, cx: number, cy: number): Point | null {
  const det = a.cos * b.sin - a.sin * b.cos;
  if (Math.abs(det) < 1e-6) return null;
  return { x: (a.rho * b.sin - a.sin * b.rho) / det + cx, y: (a.cos * b.rho - a.rho * b.cos) / det + cy };
}

// angle between two lines, 0 to 90 degrees
function lineAngle(a: Line, b: Line) {
  const d = Math.abs(a.t - b.t);
  return d > 90 ? 180 - d : d;
}

// sorts four points into top left, top right, bottom right, bottom left
export function orderCorners(points: Point[]): Quad {
  const cx = points.reduce((s, p) => s + p.x, 0) / 4;
  const cy = points.reduce((s, p) => s + p.y, 0) / 4;
  const around = [...points].sort((a, b) => Math.atan2(a.y - cy, a.x - cx) - Math.atan2(b.y - cy, b.x - cx));
  const first = around.reduce((best, p, i) => (p.x + p.y < around[best].x + around[best].y ? i : best), 0);
  return [0, 1, 2, 3].map((i) => around[(first + i) % 4]) as Quad;
}

export function quadArea(q: Quad) {
  let area = 0;
  for (let i = 0; i < 4; i++) area += q[i].x * q[(i + 1) % 4].y - q[(i + 1) % 4].x * q[i].y;
  return Math.abs(area) / 2;
}

// every turn goes the same way, so no corner is folded in
export function isConvex(q: Quad) {
  let sign = 0;
  for (let i = 0; i < 4; i++) {
    const a = q[i];
    const b = q[(i + 1) % 4];
    const c = q[(i + 2) % 4];
    const cross = (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x);
    if (Math.abs(cross) < 1e-9) return false;
    if (sign && Math.sign(cross) !== sign) return false;
    sign = Math.sign(cross);
  }
  return true;
}

/**
 * Looks for a page in the photo and returns its corners, or null when there's no clear page.
 * Finds strong straight edges, then picks the four that make the best page-shaped outline.
 */
export function detectPage({ data, width: w, height: h }: Pixels): Quad | null {
  const n = w * h;
  if (w < 32 || h < 32) return null;

  // 1. smooth each colour, a page on a coloured cloth can be the same brightness but a different colour
  const channels = [0, 1, 2].map((c) => {
    const ch = new Float32Array(n);
    for (let i = 0; i < n; i++) ch[i] = data[i * 4 + c];
    return blur(blur(ch, w, h, 2), w, h, 2);
  });

  // 2. how strong the edge is at each pixel and which way it faces, from the colour that changes most
  const gx = new Float32Array(n);
  const gy = new Float32Array(n);
  const mag = new Float32Array(n);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      let best = -1;
      for (const ch of channels) {
        const sx = ch[i - w + 1] + 2 * ch[i + 1] + ch[i + w + 1] - ch[i - w - 1] - 2 * ch[i - 1] - ch[i + w - 1];
        const sy = ch[i + w - 1] + 2 * ch[i + w] + ch[i + w + 1] - ch[i - w - 1] - 2 * ch[i - w] - ch[i - w + 1];
        const m = sx * sx + sy * sy;
        if (m > best) {
          best = m;
          gx[i] = sx;
          gy[i] = sy;
        }
      }
      mag[i] = Math.sqrt(best);
    }
  }

  // 3. thin the edges to one pixel, keeping only the peak across each edge
  const edges: number[] = [];
  for (let y = 2; y < h - 2; y++) {
    for (let x = 2; x < w - 2; x++) {
      const i = y * w + x;
      const m = mag[i];
      if (m < 30) continue;
      const a = ((Math.atan2(gy[i], gx[i]) * 180) / Math.PI + 180) % 180;
      const o = a < 22.5 || a >= 157.5 ? 1 : a < 67.5 ? w + 1 : a < 112.5 ? w : w - 1;
      if (m >= mag[i + o] && m >= mag[i - o]) edges.push(i);
    }
  }
  if (edges.length < 50) return null;
  const strong = quantile(
    edges.map((i) => mag[i]),
    0.9,
  );

  // 4. hough transform: every edge pixel votes for the lines it could sit on, facing the way its edge faces
  const cx = w / 2;
  const cy = h / 2;
  const maxRho = Math.ceil(Math.hypot(w, h) / 2);
  const rhoBins = 2 * maxRho + 1;
  const cos = new Float32Array(180);
  const sin = new Float32Array(180);
  for (let t = 0; t < 180; t++) {
    cos[t] = Math.cos((t * Math.PI) / 180);
    sin[t] = Math.sin((t * Math.PI) / 180);
  }
  const votes = new Float32Array(180 * rhoBins);
  for (const i of edges) {
    const x = (i % w) - cx;
    const y = Math.floor(i / w) - cy;
    let normal = Math.atan2(gy[i], gx[i]);
    if (normal < 0) normal += Math.PI;
    const t0 = Math.round((normal * 180) / Math.PI);
    const weight = Math.min(mag[i] / strong, 1);
    // real edges wobble, ruled lines or paper grain touching them can turn them several degrees
    for (let dt = -6; dt <= 6; dt++) {
      const t = (t0 + dt + 180) % 180;
      votes[t * rhoBins + Math.round(x * cos[t] + y * sin[t]) + maxRho] += weight;
    }
  }
  // pool each vote with its neighbours, an edge that drifts a pixel still adds up to one line
  const acc = new Float32Array(180 * rhoBins);
  for (let t = 0; t < 180; t++)
    for (let r = 1; r < rhoBins - 1; r++) {
      let sum = 0;
      for (let dt = -1; dt <= 1; dt++) {
        const row = ((t + dt + 180) % 180) * rhoBins;
        sum += votes[row + r - 1] + votes[row + r] + votes[row + r + 1];
      }
      acc[t * rhoBins + r] = sum / 3;
    }

  // 5. the strongest separate lines
  const minVotes = Math.min(w, h) * 0.12;
  const peaks: Line[] = [];
  for (let t = 0; t < 180; t++) {
    for (let r = 1; r < rhoBins - 1; r++) {
      const v = acc[t * rhoBins + r];
      if (v < minVotes) continue;
      let isPeak = true;
      for (let dt = -1; dt <= 1 && isPeak; dt++) {
        const tt = (t + dt + 180) % 180;
        for (let dr = -1; dr <= 1; dr++) if ((dt || dr) && acc[tt * rhoBins + r + dr] > v) isPeak = false;
      }
      if (isPeak) peaks.push({ t, rho: r - maxRho, cos: cos[t], sin: sin[t], votes: v });
    }
  }
  peaks.sort((a, b) => b.votes - a.votes);
  const lines: Line[] = [];
  for (const p of peaks) {
    if (lines.length >= 14) break;
    const near = lines.some((l) => {
      const d = Math.abs(l.t - p.t);
      // a line at 2 degrees and one at 178 face opposite ways, so their distances flip sign
      return d > 90 ? 180 - d < 6 && Math.abs(l.rho + p.rho) < 10 : d < 6 && Math.abs(l.rho - p.rho) < 10;
    });
    if (!near) lines.push(p);
  }
  if (lines.length < 4) return null;

  // 6. how much of a side runs along a real edge, facing the right way. sides off the photo don't count
  const sideScore = (p: Point, q: Point) => {
    const len = Math.hypot(q.x - p.x, q.y - p.y);
    const nx = -(q.y - p.y) / len;
    const ny = (q.x - p.x) / len;
    let total = 0;
    let count = 0;
    for (let s = 0; s < 32; s++) {
      const f = 0.04 + (0.92 * s) / 31;
      const x = p.x + (q.x - p.x) * f;
      const y = p.y + (q.y - p.y) * f;
      if (x < 2 || y < 2 || x > w - 3 || y > h - 3) continue;
      count++;
      let best = 0;
      for (let d = -2; d <= 2; d++) {
        const xi = Math.round(x + nx * d);
        const yi = Math.round(y + ny * d);
        if (xi < 1 || yi < 1 || xi > w - 2 || yi > h - 2) continue;
        const i = yi * w + xi;
        const m = mag[i];
        if (m < 1 || Math.abs((gx[i] * nx + gy[i] * ny) / m) < 0.8) continue;
        best = Math.max(best, Math.min(m / strong, 1));
      }
      total += best;
    }
    return count >= 8 ? total / count : null;
  };

  // 7. try every 4 lines as two pairs of opposite sides, keep the best page-shaped outline
  const imageArea = w * h;
  const minSide = Math.min(w, h) * 0.2;
  let best: { quad: Quad; score: number } | null = null;
  const pairings = [
    [0, 1, 2, 3],
    [0, 2, 1, 3],
    [0, 3, 1, 2],
  ];
  for (let a = 0; a < lines.length; a++)
    for (let b = a + 1; b < lines.length; b++)
      for (let c = b + 1; c < lines.length; c++)
        for (let d = c + 1; d < lines.length; d++) {
          const four = [lines[a], lines[b], lines[c], lines[d]];
          for (const [i1, i2, j1, j2] of pairings) {
            const [A, B, C, D] = [four[i1], four[i2], four[j1], four[j2]];
            if (lineAngle(A, B) > 35 || lineAngle(C, D) > 35 || lineAngle(A, C) < 45) continue;
            const points = [intersect(A, C, cx, cy), intersect(A, D, cx, cy), intersect(B, C, cx, cy), intersect(B, D, cx, cy)];
            if (points.some((p) => !p || p.x < -0.05 * w || p.y < -0.05 * h || p.x > 1.05 * w || p.y > 1.05 * h)) continue;
            const quad = orderCorners(points as Point[]);
            if (!isConvex(quad)) continue;
            const area = quadArea(quad) / imageArea;
            if (area < 0.05) continue;
            let ok = true;
            const scores: number[] = [];
            for (let k = 0; k < 4 && ok; k++) {
              const p = quad[k];
              const q = quad[(k + 1) % 4];
              const r = quad[(k + 2) % 4];
              if (Math.hypot(q.x - p.x, q.y - p.y) < minSide) ok = false;
              // page corners stay roughly square even when shot at an angle
              const v1x = p.x - q.x;
              const v1y = p.y - q.y;
              const v2x = r.x - q.x;
              const v2y = r.y - q.y;
              const angle = (Math.acos((v1x * v2x + v1y * v2y) / (Math.hypot(v1x, v1y) * Math.hypot(v2x, v2y))) * 180) / Math.PI;
              if (angle < 50 || angle > 130) ok = false;
              const s = sideScore(p, q);
              if (s !== null) {
                if (s < 0.35) ok = false;
                scores.push(s);
              }
            }
            if (!ok || scores.length < 3) continue;
            const support = scores.reduce((sum, s) => sum + s, 0) / scores.length;
            // clear edges matter most, a bigger outline wins a close call
            const score = support * (0.6 + 0.4 * area);
            if (!best || score > best.score) best = { quad, score };
          }
        }

  if (!best || best.score < 0.3) return null;
  // the found edge sits right on the border, nudge the corners just inside so no sliver of table shows
  const cxq = best.quad.reduce((s, p) => s + p.x, 0) / 4;
  const cyq = best.quad.reduce((s, p) => s + p.y, 0) / 4;
  return best.quad.map((p) => {
    const d = Math.hypot(cxq - p.x, cyq - p.y);
    return { x: p.x + ((cxq - p.x) * 2) / d, y: p.y + ((cyq - p.y) * 2) / d };
  }) as Quad;
}

// solves the 8 numbers that map the corners of a w x h rectangle onto a quad
export function homography(w: number, h: number, q: Quad) {
  const from = [
    [0, 0],
    [w, 0],
    [w, h],
    [0, h],
  ];
  const m: number[][] = [];
  for (let k = 0; k < 4; k++) {
    const [u, v] = from[k];
    const { x, y } = q[k];
    m.push([u, v, 1, 0, 0, 0, -u * x, -v * x, x]);
    m.push([0, 0, 0, u, v, 1, -u * y, -v * y, y]);
  }
  // gaussian elimination
  for (let col = 0; col < 8; col++) {
    let pivot = col;
    for (let row = col + 1; row < 8; row++) if (Math.abs(m[row][col]) > Math.abs(m[pivot][col])) pivot = row;
    [m[col], m[pivot]] = [m[pivot], m[col]];
    for (let row = 0; row < 8; row++) {
      if (row === col) continue;
      const f = m[row][col] / m[col][col];
      for (let k = col; k < 9; k++) m[row][k] -= f * m[col][k];
    }
  }
  return m.map((row, i) => row[8] / row[i]);
}

type Vec = [number, number, number];
const cross = (a: Vec, b: Vec): Vec => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a: Vec, b: Vec) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

/**
 * The page's real width divided by its height. A page shot at an angle looks shorter than it is, this undoes
 * that from the camera geometry (Zhang and He, "Whiteboard scanning and image enhancement"), taking the
 * middle of the photo as the middle of the lens.
 */
export function pageAspect(q: Quad, frameWidth: number, frameHeight: number) {
  const u0 = frameWidth / 2;
  const v0 = frameHeight / 2;
  const [m1, m2, m4, m3] = q.map((p): Vec => [p.x, p.y, 1]);
  const k2 = dot(cross(m1, m4), m3) / dot(cross(m2, m4), m3);
  const k3 = dot(cross(m1, m4), m2) / dot(cross(m3, m4), m2);
  const n2 = m2.map((v, i) => k2 * v - m1[i]) as Vec;
  const n3 = m3.map((v, i) => k3 * v - m1[i]) as Vec;
  // straight on, opposite sides stay parallel and there's nothing to undo
  if (Math.abs(n2[2]) > 1e-9 && Math.abs(n3[2]) > 1e-9) {
    const f2 =
      -(
        n2[0] * n3[0] -
        (n2[0] * n3[2] + n2[2] * n3[0]) * u0 +
        n2[2] * n3[2] * u0 * u0 +
        (n2[1] * n3[1] - (n2[1] * n3[2] + n2[2] * n3[1]) * v0 + n2[2] * n3[2] * v0 * v0)
      ) /
      (n2[2] * n3[2]);
    if (f2 > 0) {
      const length = (n: Vec) => ((n[0] - u0 * n[2]) ** 2 + (n[1] - v0 * n[2]) ** 2) / f2 + n[2] ** 2;
      return Math.sqrt(length(n2) / length(n3));
    }
  }
  return Math.hypot(n2[0], n2[1]) / Math.hypot(n3[0], n3[1]);
}

// the flat page size: the right shape for the page, as big as its longest sides, capped so it isn't huge
export function flatSize(q: Quad, maxSide: number, frame?: { width: number; height: number }) {
  const d = (a: Point, b: Point) => Math.hypot(b.x - a.x, b.y - a.y);
  let width = Math.max(d(q[0], q[1]), d(q[3], q[2]));
  let height = Math.max(d(q[0], q[3]), d(q[1], q[2]));
  const aspect = frame ? pageAspect(q, frame.width, frame.height) : NaN;
  // stretch whichever side came out too short, so no detail is lost
  if (aspect > 0.2 && aspect < 5) {
    if (width / height > aspect) height = width / aspect;
    else width = height * aspect;
  }
  const scale = Math.min(1, maxSide / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

// straightens the part of the photo inside the corners into a flat width x height image
export function warp(src: Pixels, q: Quad, width: number, height: number): Pixels {
  const [a, b, c, d, e, f, g, hh] = homography(width, height, q);
  const out = new Uint8ClampedArray(width * height * 4);
  const { data, width: sw, height: sh } = src;
  for (let v = 0; v < height; v++) {
    const vc = v + 0.5;
    for (let u = 0; u < width; u++) {
      const uc = u + 0.5;
      const z = g * uc + hh * vc + 1;
      // sample between the four nearest pixels
      const x = clamp((a * uc + b * vc + c) / z - 0.5, 0, sw - 1);
      const y = clamp((d * uc + e * vc + f) / z - 0.5, 0, sh - 1);
      const x0 = Math.floor(x);
      const y0 = Math.floor(y);
      const x1 = Math.min(x0 + 1, sw - 1);
      const y1 = Math.min(y0 + 1, sh - 1);
      const fx = x - x0;
      const fy = y - y0;
      const i00 = (y0 * sw + x0) * 4;
      const i10 = (y0 * sw + x1) * 4;
      const i01 = (y1 * sw + x0) * 4;
      const i11 = (y1 * sw + x1) * 4;
      const o = (v * width + u) * 4;
      for (let ch = 0; ch < 3; ch++) {
        const top = data[i00 + ch] + (data[i10 + ch] - data[i00 + ch]) * fx;
        const bottom = data[i01 + ch] + (data[i11 + ch] - data[i01 + ch]) * fx;
        out[o + ch] = top + (bottom - top) * fy;
      }
      out[o + 3] = 255;
    }
  }
  return { data: out, width, height };
}

// browser side: decode a photo (upright, the way it was taken) into pixels no bigger than maxSide
async function readPixels(photo: Blob, maxSide: number) {
  const bitmap = await createImageBitmap(photo, { imageOrientation: 'from-image' });
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('Could not get canvas context');
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  const natural = { width: bitmap.width, height: bitmap.height };
  bitmap.close();
  const pixels: Pixels = { data: ctx.getImageData(0, 0, canvas.width, canvas.height).data, width: canvas.width, height: canvas.height };
  canvas.width = 0;
  canvas.height = 0;
  return { pixels, scale, natural };
}

const scaleQuad = (q: Quad, s: number) => q.map((p) => ({ x: p.x * s, y: p.y * s })) as Quad;

// where the page is in a photo, in the photo's own pixels
export async function findPage(photo: Blob): Promise<Quad | null> {
  const { pixels, scale } = await readPixels(photo, DETECT_SIZE);
  const quad = detectPage(pixels);
  return quad && scaleQuad(quad, 1 / scale);
}

// the page inside the corners as a flat, straight-on jpeg
export async function flattenPage(photo: Blob, corners: Quad, maxSide = 2400): Promise<Blob> {
  // read a little bigger than the result so it stays sharp, but not the full 12mp
  const { pixels, scale } = await readPixels(photo, maxSide * 1.35);
  const quad = scaleQuad(corners, scale);
  const { width, height } = flatSize(quad, maxSide, pixels);
  const flat = warp(pixels, quad, width, height);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  canvas.getContext('2d')?.putImageData(new ImageData(flat.data as Uint8ClampedArray<ArrayBuffer>, width, height), 0, 0);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.92));
  canvas.width = 0;
  canvas.height = 0;
  if (!blob) throw new Error('Could not flatten the page');
  return blob;
}
