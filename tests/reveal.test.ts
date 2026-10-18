import { describe, expect, test } from 'claude-code/testing'

import { isFinalBlock, makeReveal, toCell, wrapAnswer } from '../hooks/rain'

const text = (cells: number[]) => String.fromCodePoint(...cells)

describe('toCell: only what a Raster cell can hold goes through', () => {
  test('keeps Latin, Polish and box drawing; swaps emoji and CJK for ?', () => {
    expect(toCell('a')).toBe(0x61)
    expect(toCell('ł')).toBe(0x142)
    expect(toCell('─')).toBe(0x2500)
    expect(toCell('😀')).toBe(0x3f)
    expect(toCell('漢')).toBe(0x3f)
  })

  test('drops controls and zero-width characters, turns a tab into a space', () => {
    expect(toCell('\u0007')).toBeNull()
    expect(toCell('​')).toBeNull()
    expect(toCell('́')).toBeNull()
    expect(toCell('\t')).toBe(0x20)
  })
})

describe('wrapAnswer', () => {
  test('breaks at spaces within the width and keeps blank lines', () => {
    const lines = wrapAnswer('one two three four\n\nfive', 9).map(text)

    expect(lines).toEqual(['one two', 'three', 'four', '', 'five'])
  })

  test('breaks a word longer than the width hard', () => {
    const lines = wrapAnswer('abcdefghij', 4).map(text)

    expect(lines).toEqual(['abcd', 'efgh', 'ij'])
  })
})

describe('makeReveal', () => {
  test('is bottom-aligned and builds from the bottom up', () => {
    const reveal = makeReveal('top line\nbottom line', 40, 10)
    const words = new Uint32Array(40 * 10 * 3)

    // 2 lines on a 10-row grid: they sit in rows 8 and 9, bottom row first.
    reveal.paint(words, 100000)
    const at = (row: number, col: number) => words[(row * 40 + col) * 3]
    expect(at(9, 1)).toBe('b'.codePointAt(0))
    expect(at(8, 1)).toBe('t'.codePointAt(0))
    expect(at(7, 1)).toBe(0x20) // above the text: wiped to black, no rain

    const early = new Uint32Array(40 * 10 * 3)
    reveal.paint(early, 0)
    // At time 0 the top line (built last) has not started.
    expect(early[(8 * 40 + 1) * 3]).toBe(0)
    expect(reveal.lineCount).toBe(2)
  })

  // A cell of "rain" the reveal must overwrite: glyph A, green.
  const RAIN = 0x41

  const rainFrame = (columns: number, rows: number) => {
    const words = new Uint32Array(columns * rows * 3)
    for (let i = 0; i < columns * rows; i++) words[i * 3] = RAIN

    return words
  }

  test('wipes the whole row as its line lands: no rain between or below the text', () => {
    const reveal = makeReveal('hi\nthere', 40, 10)
    const words = rainFrame(40, 10)

    // Time 0: the bottom row starts. Its far end is wiped though the text is short.
    reveal.paint(words, 0)
    expect(words[(9 * 40 + 30) * 3]).toBe(0x20)
    // The row above has not started: its rain is still falling.
    expect(words[(8 * 40 + 30) * 3]).toBe(RAIN)
  })

  test('wipes the rows above the text upwards to the very top, then nothing is left', () => {
    const reveal = makeReveal('hi\nthere', 40, 20)
    const words = rainFrame(40, 20)

    reveal.paint(words, reveal.durationMs)
    for (let i = 0; i < 40 * 20; i++) expect(words[i * 3]).not.toBe(RAIN)

    // Mid-wipe the rows nearest the text are black and the top still rains.
    const mid = rainFrame(40, 20)
    reveal.paint(mid, 1700)
    expect(mid[(17 * 40 + 30) * 3]).toBe(0x20)
    expect(mid[(0 * 40 + 30) * 3]).toBe(RAIN)
  })

  test('a short answer also ends in about three seconds', () => {
    const { durationMs } = makeReveal('a\nb\nc', 100, 40)

    expect(durationMs).toBeGreaterThan(2400)
    expect(durationMs).toBeLessThan(3400)
  })

  test('shows only the last screenful of a long answer', () => {
    const answer = Array.from({ length: 30 }, (_, i) => `line ${i}`).join('\n')
    const reveal = makeReveal(answer, 40, 10)

    expect(reveal.lineCount).toBe(10)
  })

  test('ends in about three seconds for a long answer', () => {
    const answer = Array.from({ length: 30 }, (_, i) => `line ${i}`).join('\n')
    const { durationMs } = makeReveal(answer, 40, 10)

    expect(durationMs).toBeGreaterThan(2000)
    expect(durationMs).toBeLessThan(3400)
  })
})

describe('isFinalBlock', () => {
  test('matches the answer despite markdown and whitespace, not another block', () => {
    const answer = 'Done.\n\nThe **rain** is `denser` now.'

    expect(isFinalBlock('Done.\n\nThe rain is denser now.', answer)).toBe(true)
    expect(isFinalBlock('Let me check the files first.', answer)).toBe(false)
    expect(isFinalBlock('', answer)).toBe(false)
  })
})
