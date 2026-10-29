import { describe, it, expect } from 'vitest'
import { PDFDocument } from 'pdf-lib'
import {
  MB,
  lightCompress,
  fitToTarget,
  chooseSmaller,
  savedPercent,
  buildPdfFromJpegs,
  type Attempt,
} from './compressPdf'

const sized = (n: number) => new Uint8Array(n)

describe('fitToTarget', () => {
  const attempts: Attempt[] = [
    { quality: 0.8, scale: 1 },
    { quality: 0.5, scale: 1 },
    { quality: 0.2, scale: 1 },
  ]

  it('stops at the first attempt that fits', async () => {
    const sizes = [3 * MB, 0.9 * MB, 0.5 * MB]
    let calls = 0
    const result = await fitToTarget(MB, async () => sized(sizes[calls++]), attempts)
    expect(result.fits).toBe(true)
    expect(result.attempt.quality).toBe(0.5)
    expect(calls).toBe(2)
  })

  it('returns the smallest result when nothing fits', async () => {
    const sizes = [5 * MB, 3 * MB, 4 * MB]
    let calls = 0
    const result = await fitToTarget(MB, async () => sized(sizes[calls++]), attempts)
    expect(result.fits).toBe(false)
    expect(result.bytes.length).toBe(3 * MB)
  })
})

describe('chooseSmaller', () => {
  it('keeps the original when the result is larger', () => {
    const original = sized(100)
    expect(chooseSmaller(original, sized(150))).toBe(original)
  })

  it('uses the compressed file when it is smaller', () => {
    const compressed = sized(50)
    expect(chooseSmaller(sized(100), compressed)).toBe(compressed)
  })
})

describe('savedPercent', () => {
  it('computes the saving', () => {
    expect(savedPercent(1000, 250)).toBe(75)
  })

  it('returns 0 when nothing was saved', () => {
    expect(savedPercent(1000, 1200)).toBe(0)
  })
})

describe('lightCompress', () => {
  it('keeps the page count', async () => {
    const doc = await PDFDocument.create()
    doc.addPage()
    doc.addPage()
    const out = await lightCompress(await doc.save())
    expect((await PDFDocument.load(out)).getPageCount()).toBe(2)
  })
})

describe('buildPdfFromJpegs', () => {
  it('rejects invalid image data', async () => {
    await expect(
      buildPdfFromJpegs([{ jpeg: sized(10), width: 100, height: 100 }]),
    ).rejects.toThrow()
  })
})