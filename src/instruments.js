// Real-time voices: each call schedules one note on the Web Audio clock at time `t`.

const midiToHz = m => 440 * 2 ** ((m - 69) / 12)

// Chord stab: detuned saw pairs spread L/R, through a lowpass with a plucky (or swelling) envelope
export function stab(ctx, out, t, notes, { vel = 1, dur = 0.3, attack = 0.004, bright = 1, filterDecay = 0.06 } = {}) {
  const filter = ctx.createBiquadFilter()
  filter.type = 'lowpass'
  filter.Q.value = 2
  filter.frequency.setValueAtTime(600 + 3200 * bright, t)
  filter.frequency.setTargetAtTime(300, t + attack, filterDecay)

  const amp = ctx.createGain()
  amp.gain.setValueAtTime(0, t)
  amp.gain.linearRampToValueAtTime(0.08 * vel, t + attack)
  amp.gain.setTargetAtTime(0, t + attack, dur * 0.35)
  filter.connect(amp).connect(out)

  const end = t + attack + dur * 0.35 * 7 // ~-60 dB
  const oscs = []
  notes.forEach((m, i) => {
    for (const side of [-1, 1]) {
      const osc = ctx.createOscillator()
      osc.type = 'sawtooth'
      osc.frequency.value = midiToHz(m)
      osc.detune.value = 7 * side
      const g = ctx.createGain()
      g.gain.value = i === 3 ? 0.5 : 1 // the 7th sits back
      const pan = ctx.createStereoPanner()
      pan.pan.value = 0.3 * side
      osc.connect(g).connect(pan).connect(filter)
      osc.start(t)
      osc.stop(end)
      oscs.push(osc)
    }
  })
  oscs[0].onended = () => amp.disconnect()
}

// Bass: round sine with a touch of triangle for definition, held for `dur` then released
export function bass(ctx, out, t, midi, { vel = 1, dur = 0.5 } = {}) {
  const f = midiToHz(midi)
  const filter = ctx.createBiquadFilter()
  filter.type = 'lowpass'
  filter.frequency.value = 600
  const amp = ctx.createGain()
  amp.gain.setValueAtTime(0, t)
  amp.gain.linearRampToValueAtTime(0.5 * vel, t + 0.005)
  amp.gain.setValueAtTime(0.5 * vel, t + dur)
  amp.gain.setTargetAtTime(0, t + dur, 0.05)
  filter.connect(amp).connect(out)

  const end = t + dur + 0.4
  const oscs = [['sine', 1], ['triangle', 0.3]].map(([type, level]) => {
    const osc = ctx.createOscillator()
    osc.type = type
    osc.frequency.value = f
    const g = ctx.createGain()
    g.gain.value = level
    osc.connect(g).connect(filter)
    osc.start(t)
    osc.stop(end)
    return osc
  })
  oscs[0].onended = () => amp.disconnect()
}

// Kick: sine with a fast pitch drop and a tiny noise click on the front
const noiseCache = new WeakMap()
function noise(ctx) {
  let buf = noiseCache.get(ctx)
  if (!buf) {
    buf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate)
    const d = buf.getChannelData(0)
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1
    noiseCache.set(ctx, buf)
  }
  return buf
}

export function kick(ctx, out, t, { vel = 1, pitch = 48, from = 160, decay = 0.4 } = {}) {
  const osc = ctx.createOscillator()
  osc.frequency.setValueAtTime(from, t)
  osc.frequency.exponentialRampToValueAtTime(pitch, t + 0.12)
  const amp = ctx.createGain()
  amp.gain.setValueAtTime(0, t)
  amp.gain.linearRampToValueAtTime(0.9 * vel, t + 0.002)
  amp.gain.setTargetAtTime(0, t + 0.002, decay)
  osc.connect(amp).connect(out)
  osc.start(t)
  osc.stop(t + decay * 7)
  osc.onended = () => amp.disconnect()

  const click = ctx.createBufferSource()
  click.buffer = noise(ctx)
  const cg = ctx.createGain()
  cg.gain.setValueAtTime(0.25 * vel, t)
  cg.gain.setTargetAtTime(0, t, 0.0015)
  click.connect(cg).connect(out)
  click.start(t)
  click.stop(t + 0.02)
  click.onended = () => cg.disconnect()
}

// Snare: bandpassed noise for the crack, plus a short pitched body
export function snare(ctx, out, t, { vel = 1 } = {}) {
  const src = ctx.createBufferSource()
  src.buffer = noise(ctx)
  const bp = ctx.createBiquadFilter()
  bp.type = 'bandpass'
  bp.frequency.value = 1800
  bp.Q.value = 0.8
  const ng = ctx.createGain()
  ng.gain.setValueAtTime(0.6 * vel, t)
  ng.gain.setTargetAtTime(0, t, 0.08)
  src.connect(bp).connect(ng).connect(out)
  src.start(t)
  src.stop(t + 0.6)
  src.onended = () => ng.disconnect()

  const body = ctx.createOscillator()
  body.type = 'triangle'
  body.frequency.setValueAtTime(190, t)
  body.frequency.exponentialRampToValueAtTime(160, t + 0.05)
  const bg = ctx.createGain()
  bg.gain.setValueAtTime(0.4 * vel, t)
  bg.gain.setTargetAtTime(0, t, 0.04)
  body.connect(bg).connect(out)
  body.start(t)
  body.stop(t + 0.3)
  body.onended = () => bg.disconnect()
}

// Hi-hat: highpassed noise; a short decay for closed, longer for open
export function hat(ctx, out, t, { vel = 1, decay = 0.02 } = {}) {
  const src = ctx.createBufferSource()
  src.buffer = noise(ctx)
  const hp = ctx.createBiquadFilter()
  hp.type = 'highpass'
  hp.frequency.value = 7000
  const g = ctx.createGain()
  g.gain.setValueAtTime(0.25 * vel, t)
  g.gain.setTargetAtTime(0, t, decay)
  src.connect(hp).connect(g).connect(out)
  src.start(t)
  src.stop(t + decay * 8)
  src.onended = () => g.disconnect()
}
