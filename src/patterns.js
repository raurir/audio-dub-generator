// Patterns and the conductor that strings them into an evolving song.
//
// Steps are 16ths, one bar per string: x = hit, o = soft hit, t = dub throw (hit + extra FX send), . = rest.
// `dur` is in beats, `w` is how likely the conductor is to pick it.

export const PATTERNS = {
  chords: {
    skank:  { steps: '....x.......x...', dur: 0.45, w: 4 },
    push:   { steps: '....x.......x.o.', dur: 0.4, w: 3 },
    bubble: { steps: '..o.x.o...o.x.o.', dur: 0.25, w: 2 },
    throw:  { steps: '....x.......t...', dur: 0.45, w: 2 },
    sparse: { steps: '............t...', dur: 0.5, w: 1 },
    swell:  { steps: 'x...............', dur: 4, attack: 0.6, filterDecay: 1.5, w: 1 },
  },
  kick: {
    'one-drop': { steps: '........x.......', w: 4 },
    rockers:    { steps: 'x.......x.......', w: 2 },
    steppers:   { steps: 'x...x...x...x...', w: 1 },
    off:        { steps: '................', w: 1 },
  },
  // Bass steps are chord tones: 1 root, 3 minor third, 5 fifth, 7 flat seventh, 8 octave
  bass: {
    'one-drop': { steps: '1.......1..5..3.', dur: 1.5, w: 3 },
    pulse:      { steps: '1.1...1.1.1...8.', dur: 0.4, w: 2 },
    walk:       { steps: '1...3...5...7...', dur: 0.9, w: 1 },
    sparse:     { steps: '1...............', dur: 3.5, w: 1 },
    off:        { steps: '................', w: 1 },
  },
  snare: {
    'one-drop': { steps: '........x.......', w: 3 },
    backbeat:   { steps: '....x.......x...', w: 2 },
    throw:      { steps: '........t.......', w: 2 },
    ghost:      { steps: '....x..o....x.o.', w: 1 },
    off:        { steps: '................', w: 1 },
  },
  hat: {
    eighths:    { steps: 'x.o.x.o.x.o.x.o.', w: 3 },
    offbeat:    { steps: '..x...x...x...x.', w: 2 },
    sixteenths: { steps: 'xoooxoooxoooxooo', w: 1 },
    off:        { steps: '................', w: 1 },
  },
  openhat: {
    offbeat:    { steps: '..x...x...x...x.', w: 1 },
    'and-4':    { steps: '..............x.', w: 2 },
    off:        { steps: '................', w: 3 },
  },
}

// Chord roots in semitones above the key; every chord is a minor 7th
export const PROGRESSIONS = [
  [0, 5, 7, 0],   // i  iv  v  i
  [0, 0, 5, 5],   // i  i   iv iv
  [0, 5, 0, 7],   // i  iv  i  v
  [0, 10, 5, 7],  // i  vii iv v
  [0, 8, 5, 7],   // i  vi  iv v
]

const SECTION_BARS = [4, 8, 8, 16]
const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
export const KEYS = NOTE_NAMES

const pick = list => list[Math.floor(Math.random() * list.length)]

// Weighted pick, biased away from what's playing now so sections actually change
function pickPattern(id, current) {
  const entries = Object.entries(PATTERNS[id]).map(([name, p]) => [name, name === current ? p.w * 0.25 : p.w])
  let r = Math.random() * entries.reduce((s, [, w]) => s + w, 0)
  for (const [name, w] of entries) if ((r -= w) <= 0) return name
  return entries[0][0]
}

export class Conductor {
  constructor() {
    this.key = 'A'
    this.locks = {} // channel id → pattern name chosen by hand
    this.reset()
  }

  reset() {
    this.bar = -1
    this.sectionCount = 0
    this.section = null
    this.progression = PROGRESSIONS[0]
  }

  // Advance one bar; starts a new section when the current one runs out
  nextBar() {
    this.bar++
    if (!this.section || this.section.bar >= this.section.bars - 1) this.newSection()
    else this.section.bar++
  }

  newSection() {
    const n = this.sectionCount++
    const prev = this.section?.patterns ?? {}
    let patterns, bars
    if (n === 0) {
      patterns = { chords: 'swell', kick: 'off', bass: 'off', snare: 'off', hat: 'off', openhat: 'off' } // intro: pads only
      bars = 4
    } else if (n === 1) {
      patterns = { chords: 'skank', kick: 'one-drop', bass: 'one-drop', snare: 'one-drop', hat: 'eighths', openhat: 'off' }
      bars = 8
    } else {
      patterns = Object.fromEntries(Object.keys(PATTERNS).map(id => [id, pickPattern(id, prev[id])]))
      bars = pick(SECTION_BARS)
      if (Math.random() < 0.4) this.progression = pick(PROGRESSIONS)
    }
    this.section = { index: n, bars, bar: 0, patterns }
  }

  pattern(id) {
    const name = this.locks[id] ?? this.section.patterns[id]
    return { name, ...PATTERNS[id][name] }
  }

  // Current chord as MIDI notes, voiced around A3 so changes move smoothly
  chord() {
    const deg = this.progression[this.section.bar % this.progression.length]
    let root = 57 + ((NOTE_NAMES.indexOf(this.key) - 9 + deg) % 12 + 12) % 12
    if (root > 62) root -= 12
    return [0, 3, 7, 10].map(iv => root + iv)
  }

  chordName() {
    return `${NOTE_NAMES[this.chord()[0] % 12]}m7`
  }

  // Slow brightness drift over a 32-bar cycle, so the stabs open and close over time
  brightness() {
    return 0.55 + 0.45 * Math.sin((this.bar / 32) * Math.PI * 2)
  }
}
