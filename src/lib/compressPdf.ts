import { PDFDocument } from 'pdf-lib'

export const MB = 1024 * 1024

export interface Attempt {
  quality: number
  scale: number
}

export const ATTEMPTS: Attempt[] = [
  { quality: 0.8, scale: 1.5 },
  { quality: 0.65, scale: 1.25 },
  { quality: 0.5, scale: 1 },
  { quality: 0.4, scale: 0.85 },
  { quality: 0.3, scale: 0.7 },
  { quality: 0.2, scale: 0.55 },
]

export interface FitResult {
  bytes: Uint8Array
  attempt: Attempt
  fits: boolean
}

export async function lightCompress(bytes: Uint8Array): Promise<Uint8Array> {
  const doc = await PDFDocument.load(bytes)
  return doc.save({ useObjectStreams: true })
}

export async function fitToTarget(
  targetBytes: number,
  encode: (attempt: Attempt) => Promise<Uint8Array>,
  attempts: Attempt[] = ATTEMPTS,
): Promise<FitResult> {
  let best: FitResult | null = null
  for (const attempt of attempts) {
    const bytes = await encode(attempt)
    const result = { bytes, attempt, fits: bytes.length <= targetBytes }
    if (result.fits) return result
    if (!best || bytes.length < best.bytes.length) best = result
  }
  return best as FitResult
}

export function chooseSmaller(original: Uint8Array, compressed: Uint8Array): Uint8Array {
  return compressed.length < original.length ? compressed : original
}

export function savedPercent(before: number, after: number): number {
  if (before <= 0 || after >= before) return 0
  return Math.round(((before - after) / before) * 100)
}

export async function buildPdfFromJpegs(
  pages: { jpeg: Uint8Array; width: number; height: number }[],
): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  for (const p of pages) {
    const image = await doc.embedJpg(p.jpeg)
    const page = doc.addPage([p.width, p.height])
    page.drawImage(image, { x: 0, y: 0, width: p.width, height: p.height })
  }
  return doc.save({ useObjectStreams: true })
}