// Mixer channels. `play` is called by the scheduler for every non-rest step of the channel's pattern.

import { stab, kick, bass, snare, hat } from './instruments.js'

export const CHANNELS = [
  {
    id: 'chords',
    name: 'Chords',
    color: '#5eead4',
    defaults: { volume: 0, pan: 0, send: 0.6 },
    insert(ctx) {
      const hp = ctx.createBiquadFilter()
      hp.type = 'highpass'
      hp.frequency.value = 180 // keep the stabs thin, out of the kick's way
      return hp
    },
    play(ctx, out, t, { vel, pattern, beat, conductor }) {
      stab(ctx, out, t, conductor.chord(), {
        vel,
        dur: pattern.dur * beat,
        attack: pattern.attack,
        filterDecay: pattern.filterDecay,
        bright: conductor.brightness(),
      })
    },
  },
  {
    id: 'kick',
    name: 'Kick',
    color: '#f9a8d4',
    defaults: { volume: 0, pan: 0, send: 0.1 },
    play(ctx, out, t, { vel }) {
      kick(ctx, out, t, { vel })
    },
  },
  {
    id: 'bass',
    name: 'Bass',
    color: '#a5b4fc',
    defaults: { volume: 0, pan: 0, send: 0.05 },
    play(ctx, out, t, { step, pattern, beat, conductor }) {
      const root = conductor.chord()[0] - 24 // two octaves under the chord
      bass(ctx, out, t, root + BASS_INTERVALS[step], { dur: pattern.dur * beat })
    },
  },
  {
    id: 'snare',
    name: 'Snare',
    color: '#fca5a5',
    defaults: { volume: -3, pan: 0, send: 0.35 },
    play(ctx, out, t, { vel }) {
      snare(ctx, out, t, { vel })
    },
  },
  {
    id: 'hat',
    name: 'Hat',
    color: '#bef264',
    defaults: { volume: -6, pan: 0.25, send: 0.1 },
    play(ctx, out, t, { vel }) {
      hat(ctx, out, t, { vel, decay: 0.02 })
    },
  },
  {
    id: 'openhat',
    name: 'Open hat',
    color: '#86efac',
    defaults: { volume: -8, pan: -0.2, send: 0.2 },
    play(ctx, out, t, { vel }) {
      hat(ctx, out, t, { vel, decay: 0.12 })
    },
  },
]

const BASS_INTERVALS = { 1: 0, 3: 3, 5: 7, 7: 10, 8: 12 }

// The shared FX return: its strip carries the echo and reverb controls
export const FX_STRIP = {
  id: 'fx',
  name: 'Dub FX',
  color: '#fbbf24',
  defaults: { volume: -4, feedback: 0.75, reverb: 0.6, time: 3 }, // time in 16ths: 3 = dotted 8th
}
