// Real-time engine: a lookahead step scheduler driving the instruments, a channel mixer,
// and a shared dub FX bus (echo → reverb) fed by per-channel sends.
//
//   note → [insert] → fader → pan → analyser → master → limiter → out
//                                └→ send ─┐
//   throw notes ─────────────────────────→ fxIn → echo ─┬→ fxReturn → analyser → master
//                                           └→ reverb ←─┘ ↗

import { createEcho, createReverb } from './fx.js'
import { Conductor } from './patterns.js'

const LOOKAHEAD = 0.15 // seconds of audio scheduled ahead of the clock
const TICK_MS = 25
const dbToGain = db => (db <= -40 ? 0 : 10 ** (db / 20))

// Timers in a worker keep ticking when the tab is in the background
const TIMER_SRC = 'let id; onmessage = e => { clearInterval(id); if (e.data) id = setInterval(() => postMessage(0), e.data) }'

export class Engine {
  constructor(channels, fxDef) {
    const ctx = (this.ctx = new AudioContext())
    this.bpm = 72
    this.conductor = new Conductor()
    this.playing = false
    this.listeners = new Set()

    // Master
    this.master = ctx.createGain()
    const limiter = ctx.createDynamicsCompressor()
    limiter.threshold.value = -3
    limiter.knee.value = 0
    limiter.ratio.value = 20
    limiter.attack.value = 0.002
    limiter.release.value = 0.2
    this.master.connect(limiter).connect(ctx.destination)

    // FX bus
    this.fxIn = ctx.createGain()
    this.echo = createEcho(ctx)
    this.reverb = createReverb(ctx)
    const directToReverb = ctx.createGain()
    directToReverb.gain.value = 0.5
    this.reverbLevel = ctx.createGain()
    this.fxReturn = ctx.createGain()
    this.fxIn.connect(this.echo.input)
    this.fxIn.connect(directToReverb).connect(this.reverb.input)
    this.echo.output.connect(this.reverb.input)
    this.echo.output.connect(this.fxReturn)
    this.reverb.output.connect(this.reverbLevel).connect(this.fxReturn)
    const fxAnalyser = this.analyser()
    this.fxReturn.connect(fxAnalyser).connect(this.master)
    this.fx = { def: fxDef, analyser: fxAnalyser, state: { ...fxDef.defaults, mute: false } }

    // Channel strips
    this.strips = channels.map(def => {
      const input = ctx.createGain()
      const fader = ctx.createGain()
      const panner = ctx.createStereoPanner()
      const send = ctx.createGain()
      const analyser = this.analyser()
      const insert = def.insert?.(ctx)
      if (insert) input.connect(insert).connect(fader)
      else input.connect(fader)
      fader.connect(panner).connect(analyser).connect(this.master)
      panner.connect(send).connect(this.fxIn)
      return { def, input, fader, panner, send, analyser, state: { ...def.defaults, mute: false, solo: false } }
    })

    this.ready = this.reverb.ready
    this.timer = new Worker(URL.createObjectURL(new Blob([TIMER_SRC], { type: 'text/javascript' })))
    this.timer.onmessage = () => this.tick()
    this.apply()
  }

  analyser() {
    const a = this.ctx.createAnalyser()
    a.fftSize = 2048
    a.smoothingTimeConstant = 0.75
    return a
  }

  get beat() {
    return 60 / this.bpm
  }

  // ── Controls ──────────────────────────────────────────────

  set(id, key, value) {
    const target = id === 'fx' ? this.fx : this.strips.find(s => s.def.id === id)
    target.state[key] = value
    this.apply()
  }

  setBpm(bpm) {
    this.bpm = bpm
    this.apply()
  }

  setKey(key) {
    this.conductor.key = key
  }

  // Hand-pick a pattern for a channel, or `null` to let the conductor choose
  lockPattern(id, name) {
    if (name) this.conductor.locks[id] = name
    else delete this.conductor.locks[id]
  }

  apply() {
    const t = this.ctx.currentTime
    const anySolo = this.strips.some(s => s.state.solo)
    for (const { state, fader, panner, send } of this.strips) {
      const audible = !state.mute && (!anySolo || state.solo)
      fader.gain.setTargetAtTime(audible ? dbToGain(state.volume) : 0, t, 0.02)
      panner.pan.setTargetAtTime(state.pan, t, 0.02)
      send.gain.setTargetAtTime(state.send, t, 0.02)
    }
    // The FX return is solo-safe: soloing a channel still lets you hear its echoes
    const fx = this.fx.state
    this.fxReturn.gain.setTargetAtTime(fx.mute ? 0 : dbToGain(fx.volume), t, 0.02)
    this.reverbLevel.gain.setTargetAtTime(fx.reverb, t, 0.05)
    this.echo.setFeedback(fx.feedback)
    this.echo.setTime((fx.time * this.beat) / 4)
  }

  // ── Transport ─────────────────────────────────────────────

  async start() {
    await this.ready
    await this.ctx.resume()
    this.conductor.reset()
    this.step = 0
    this.nextTime = this.ctx.currentTime + 0.1
    this.playing = true
    this.timer.postMessage(TICK_MS)
  }

  // Stops the sequencer; echoes and reverb ring out
  stop() {
    this.playing = false
    this.timer.postMessage(0)
  }

  // Called with { bar, section, patterns, chord } as each bar starts playing
  onBar(fn) {
    this.listeners.add(fn)
  }

  tick() {
    while (this.playing && this.nextTime < this.ctx.currentTime + LOOKAHEAD) {
      this.schedule(this.step % 16, this.nextTime)
      this.nextTime += this.beat / 4
      this.step++
    }
  }

  schedule(step, t) {
    const { ctx, conductor } = this
    if (step === 0) {
      conductor.nextBar()
      const info = {
        bar: conductor.bar,
        section: { ...conductor.section },
        patterns: Object.fromEntries(this.strips.map(s => [s.def.id, conductor.pattern(s.def.id).name])),
        chord: conductor.chordName(),
      }
      setTimeout(() => this.listeners.forEach(fn => fn(info)), Math.max(0, (t - ctx.currentTime) * 1000))
    }
    for (const strip of this.strips) {
      const pattern = conductor.pattern(strip.def.id)
      const ch = pattern.steps[step]
      if (ch === '.') continue
      let out = strip.input
      if (ch === 't') out = this.throwNote(strip, t)
      strip.def.play(ctx, out, t, { step: ch, vel: ch === 'o' ? 0.55 : 1, pattern, beat: this.beat, conductor })
    }
  }

  // Dub throw: this note also goes straight into the FX bus, hard, bypassing the channel send
  throwNote(strip, t) {
    const note = this.ctx.createGain()
    const hit = this.ctx.createGain()
    hit.gain.value = 1.2
    note.connect(strip.input)
    note.connect(hit).connect(this.fxIn)
    setTimeout(() => note.disconnect(), (t - this.ctx.currentTime + 6) * 1000)
    return note
  }
}
