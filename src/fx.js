// Dub FX: a tape-ish ping-pong echo built from Web Audio nodes, and a spring + plate reverb
// whose impulse response is rendered once by the `audio` library.

import audio from 'audio'
import { spring } from '@audio/reverb-spring/audio'
import { plate } from '@audio/reverb-dattorro/audio'

// Bundlers can't follow the registry's dynamic import(spec), so register the FX up front.
// Explicit ids: the library names ops after the function, which minification renames.
audio.use(Object.assign(spring, { id: 'spring' }), Object.assign(plate, { id: 'plate' }))

// Ping-pong echo: input → L delay → R delay → (filters, saturation, feedback) → L delay …
// Each repeat alternates sides; the feedback loop is darkened and soft-clipped like tape,
// so feedback past 1 self-oscillates without blowing up.
export function createEcho(ctx) {
  const input = ctx.createGain()
  const output = ctx.createGain()
  const dL = ctx.createDelay(4)
  const dR = ctx.createDelay(4)
  const hp = ctx.createBiquadFilter()
  hp.type = 'highpass'
  hp.frequency.value = 250
  const lp = ctx.createBiquadFilter()
  lp.type = 'lowpass'
  lp.frequency.value = 2800
  const sat = ctx.createWaveShaper()
  sat.curve = Float32Array.from({ length: 1024 }, (_, i) => Math.tanh((i / 1023) * 4 - 2))
  const fb = ctx.createGain()
  const merger = ctx.createChannelMerger(2)

  input.connect(dL)
  dL.connect(merger, 0, 0)
  dL.connect(dR)
  dR.connect(merger, 0, 1)
  dR.connect(hp).connect(lp).connect(sat).connect(fb).connect(dL)
  merger.connect(output)

  // Slow wow on the delay time, for that wobbly tape feel
  const wow = ctx.createOscillator()
  wow.frequency.value = 0.3
  const wowDepth = ctx.createGain()
  wowDepth.gain.value = 0.0015
  wow.connect(wowDepth)
  wowDepth.connect(dL.delayTime)
  wowDepth.connect(dR.delayTime)
  wow.start()

  return {
    input,
    output,
    // Gliding the time (rather than jumping) gives the classic pitch-bend swoop on live changes
    setTime(sec) {
      for (const d of [dL, dR]) d.delayTime.setTargetAtTime(sec, ctx.currentTime, 0.15)
    },
    setFeedback(v) {
      fb.gain.setTargetAtTime(v, ctx.currentTime, 0.05)
    },
  }
}

// Spring into plate, rendered from a single impulse by the audio library
async function renderReverbIR(sampleRate) {
  const L = new Float32Array(Math.floor(sampleRate * 0.05))
  const R = new Float32Array(L.length)
  L[0] = R[0] = 1
  const [irL, irR] = await audio.from([L, R], { sampleRate })
    .spring({ decay: 0.8, tension: 0.4, damping: 0.35, mix: 1 })
    .plate({ decay: 0.9, damping: 0.4, mix: 0.7 })
    .read()
  let end = irL.length
  while (end > 1 && Math.abs(irL[end - 1]) < 1e-4 && Math.abs(irR[end - 1]) < 1e-4) end--
  return [irL.subarray(0, end), irR.subarray(0, end)]
}

export function createReverb(ctx) {
  const input = ctx.createGain()
  const output = ctx.createGain()
  const conv = ctx.createConvolver()
  input.connect(conv).connect(output)
  const ready = renderReverbIR(ctx.sampleRate).then(([L, R]) => {
    const buf = ctx.createBuffer(2, L.length, ctx.sampleRate)
    buf.copyToChannel(L, 0)
    buf.copyToChannel(R, 1)
    conv.buffer = buf
  })
  return { input, output, ready }
}
