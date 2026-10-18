// Pure logic of matrix-mode: the rain simulation and the answer reveal. No engine
// calls here, so it is unit-tested directly (tests/reveal.test.ts).

// Rain is repainted with $.ui.blit (up to ~60 shown a second), not with full
// ui.render redraws, which the engine folds to ten a second and looked jagged.
// Tune here: 33 ms is ~30 fps. Each frame ships columns*rows*12 bytes as base64.
export const FRAME_MS = 33

// Half-width katakana, U+FF66..U+FF9D: single-width BMP glyphs, as the movie used.
const GLYPH_FIRST = 0xff66
const GLYPH_COUNT = 0xff9d - 0xff66 + 1

const BG = 0x000000
const HEAD = 0xd8ffd8
const TRAIL = 0x00ff41
const FLASH = 0xffffff // a revealed character, the first instant
const TEXT = 0xb8ffc8 // a revealed character, settled: lighter than the rain so it reads

// Density knobs. The film's screen is nearly always full: several drops share a
// column, trails are long, and a drop restarts almost at once after it leaves.
const DROPS_PER_COLUMN = 3
const TRAIL_MIN = 10
const TRAIL_SPAN = 24
const RESPAWN_GAP = 0.3 // how far above the top a new drop waits, as a share of the height

// Reveal timeline. Lines build from the bottom up over BUILD_MS, each row's rain
// wiped as its line lands. Then the empty rows above the text are wiped upwards to
// the top of the screen (WIPE_MS in all, at most WIPE_MAX_STEP_MS a row), and
// HOLD_MS later the transcript returns. About three seconds in all.
const BUILD_MS = 2200
const WIPE_MS = 900
const WIPE_MAX_STEP_MS = 45
const HOLD_MS = 500
const JITTER_MS = 400 // spread within a line, so characters land one by one
const FLASH_MS = 160

export type Drop = { y: number; speed: number; length: number }

export type Rain = {
  columns: number
  rows: number
  // Advances one frame and returns its cells: [codePoint, fg, bg] triplets, row-major.
  step: () => Uint32Array
}

export type Reveal = {
  columns: number
  rows: number
  lineCount: number
  // When the reveal is over and the normal transcript should return.
  durationMs: number
  // Draws the reveal at `elapsedMs` over a rain frame, in place: rows already wiped
  // are black except for the characters landed so far; the rest keeps the rain.
  paint: (words: Uint32Array, elapsedMs: number) => void
}

export const encode = (words: Uint32Array): string => new Uint8Array(words.buffer).toBase64()

const randomGlyph = () => GLYPH_FIRST + Math.floor(Math.random() * GLYPH_COUNT)

const newDrop = (rows: number, isInitial: boolean): Drop => ({
  // the first fill spreads heads over the screen; later drops wait just above it
  y: isInitial ? Math.random() * rows * 1.2 : -Math.random() * rows * RESPAWN_GAP,
  speed: 0.25 + Math.random() * 0.75,
  length: TRAIL_MIN + Math.floor(Math.random() * TRAIL_SPAN),
})

// Scales a 0xRRGGBB colour by k (0..1): the trail fades towards black.
const scale = (rgb: number, k: number) => {
  const r = Math.round(((rgb >> 16) & 0xff) * k)
  const g = Math.round(((rgb >> 8) & 0xff) * k)
  const b = Math.round((rgb & 0xff) * k)

  return (r << 16) | (g << 8) | b
}

export const makeRain = (columns: number, rows: number): Rain => {
  const drops = Array.from({ length: columns }, () =>
    Array.from({ length: DROPS_PER_COLUMN }, () => newDrop(rows, true)),
  )
  const glyphs = Uint32Array.from({ length: columns * rows }, randomGlyph)
  // Brightness per cell for this frame: 0 dark, up to 1 along a trail, 2 a head.
  // Drops of one column overlap, so each cell keeps the brightest of them.
  const level = new Float32Array(columns * rows)

  const step = (): Uint32Array => {
    const words = new Uint32Array(columns * rows * 3)
    level.fill(0)

    for (let c = 0; c < columns; c++) {
      for (let k = 0; k < DROPS_PER_COLUMN; k++) {
        let drop = drops[c][k]
        // speed is in rows per 50 ms; scaling by the frame time keeps the fall
        // rate the same whatever FRAME_MS is (20 rows a second for the fastest drop)
        drop.y += drop.speed * (FRAME_MS / 50)
        if (drop.y - drop.length > rows) drop = drops[c][k] = newDrop(rows, false)

        const head = Math.floor(drop.y)

        for (let depth = 0; depth < drop.length; depth++) {
          const r = head - depth // depth 0 is the head, growing up the trail
          if (r < 0 || r >= rows) continue

          const i = r * columns + c
          const lit = depth === 0 ? 2 : 1 - depth / drop.length
          if (lit > level[i]) level[i] = lit
        }
      }
    }

    for (let i = 0; i < columns * rows; i++) {
      let glyph = 0x20
      let fg = BG

      if (level[i] > 0) {
        // the lit trail flickers: some glyphs change every frame
        if (Math.random() < 0.08) glyphs[i] = randomGlyph()
        glyph = glyphs[i]
        fg = level[i] >= 2 ? HEAD : scale(TRAIL, level[i])
      }

      words[i * 3] = glyph
      words[i * 3 + 1] = fg
      words[i * 3 + 2] = BG
    }

    return words
  }

  return { columns, rows, step }
}

// Code points a Raster cell cannot hold (it takes one printable width-1 BMP glyph).
const isWide = (cp: number) =>
  (cp >= 0x1100 && cp <= 0x115f) ||
  (cp >= 0x2e80 && cp <= 0xa4cf) ||
  (cp >= 0xac00 && cp <= 0xd7a3) ||
  (cp >= 0xf900 && cp <= 0xfaff) ||
  (cp >= 0xfe30 && cp <= 0xfe6f) ||
  (cp >= 0xff00 && cp <= 0xff60) ||
  (cp >= 0xffe0 && cp <= 0xffe6)

// One character as a cell's code point: itself, `?` when a cell cannot hold it
// (emoji, CJK), a space for a tab, or null when it takes no room (controls,
// combining marks, zero-width). A bad cell would make the engine refuse the tree.
export const toCell = (ch: string): number | null => {
  const cp = ch.codePointAt(0) ?? 0x20

  if (cp === 0x09) return 0x20
  if (cp < 0x20 || (cp >= 0x7f && cp < 0xa0)) return null
  if ((cp >= 0x300 && cp <= 0x36f) || (cp >= 0x200b && cp <= 0x200f)) return null
  if (cp === 0xfeff || (cp >= 0xfe00 && cp <= 0xfe0f)) return null
  if (cp > 0xffff || (cp >= 0xd800 && cp <= 0xdfff) || isWide(cp)) return 0x3f

  return cp
}

// The reveal is a plain-text preview: drop the markup that only means something
// once rendered. The real formatted message replaces it when the reveal ends.
export const stripMarkdown = (text: string): string =>
  text.replace(/\*\*|__|`/g, '').replace(/^#{1,6}\s+/gm, '')

// Wraps text to `width` cells, breaking at spaces (a long word breaks hard).
// Blank lines are kept as empty arrays.
export const wrapAnswer = (text: string, width: number): number[][] => {
  const lines: number[][] = []

  for (const raw of text.split('\n')) {
    const cells: number[] = []
    for (const ch of raw) {
      const cell = toCell(ch)
      if (cell !== null) cells.push(cell)
    }

    if (cells.length === 0) {
      lines.push([])
      continue
    }

    let start = 0
    while (start < cells.length) {
      let end = Math.min(start + width, cells.length)

      if (end < cells.length) {
        // look back for a space to break at; cells[end] is the first cell of the next line
        let brk = end
        while (brk > start && cells[brk] !== 0x20) brk--
        if (brk > start) end = brk
      }

      lines.push(cells.slice(start, end))
      start = end
      while (start < cells.length && cells[start] === 0x20) start++
    }
  }

  return lines
}

const collapse = (s: string) => stripMarkdown(s).replace(/\s+/g, ' ').trim()

// Is this transcript block the turn's final answer? The block's text is the
// answer as the transcript draws it, which can differ in markup, so compare the
// last 60 characters of each after stripping markup and whitespace.
export const isFinalBlock = (blockText: string, answer: string): boolean => {
  const b = collapse(blockText)
  const a = collapse(answer)

  return b !== '' && a !== '' && b.slice(-60) === a.slice(-60)
}

// Builds the reveal of `answer` on a rain grid of `columns` x `rows`: wrapped,
// bottom-aligned (the answer builds up from just above the prompt), and when it
// is taller than the grid only its last screenful is shown.
export const makeReveal = (answer: string, columns: number, rows: number): Reveal => {
  const width = Math.max(10, columns - 2)
  const lines = wrapAnswer(stripMarkdown(answer), width).slice(-rows)
  const top = rows - lines.length

  // glyph -1: no text in this cell. at: when a text cell lands. rowAt: when a whole
  // row's rain is wiped, so none shows between or under the text.
  const glyph = new Int32Array(columns * rows).fill(-1)
  const at = new Float32Array(columns * rows)
  const rowAt = new Float32Array(rows)
  const stepMs = (BUILD_MS - JITTER_MS) / Math.max(1, lines.length)
  let last = 0

  lines.forEach((line, li) => {
    const fromBottom = lines.length - 1 - li
    const base = fromBottom * stepMs
    rowAt[top + li] = base // blank lines inside the answer are wiped too

    line.forEach((cell, x) => {
      const col = 1 + x
      if (col >= columns) return

      const i = (top + li) * columns + col
      glyph[i] = cell
      at[i] = base + Math.random() * JITTER_MS
      if (at[i] > last) last = at[i]
    })
  })

  // Rows above the text are wiped upwards, one after another, once the top text
  // line has landed; an answer as tall as the screen has none (top is 0).
  const wipeStart = lines.length === 0 ? 0 : (lines.length - 1) * stepMs + JITTER_MS
  const wipeStep = top > 0 ? Math.min(WIPE_MAX_STEP_MS, WIPE_MS / top) : 0
  for (let r = top - 1; r >= 0; r--) rowAt[r] = wipeStart + (top - 1 - r) * wipeStep
  if (top > 0) last = Math.max(last, rowAt[0])

  const paint = (words: Uint32Array, elapsedMs: number) => {
    for (let r = 0; r < rows; r++) {
      if (elapsedMs < rowAt[r]) continue // this row's rain is still falling

      for (let c = 0; c < columns; c++) {
        const i = r * columns + c
        const isLanded = glyph[i] >= 0 && elapsedMs >= at[i]

        words[i * 3] = isLanded ? glyph[i] : 0x20
        words[i * 3 + 1] = isLanded ? (elapsedMs - at[i] < FLASH_MS ? FLASH : TEXT) : BG
        words[i * 3 + 2] = BG
      }
    }
  }

  return { columns, rows, lineCount: lines.length, durationMs: last + HOLD_MS, paint }
}
