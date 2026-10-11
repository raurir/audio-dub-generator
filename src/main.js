import { CHANNELS, FX_STRIP } from './channels.js'
import { Engine } from './engine.js'
import { PATTERNS, KEYS } from './patterns.js'
import { draw } from './visualiser.js'

const $ = id => document.getElementById(id)
const engine = new Engine(CHANNELS, FX_STRIP)

// ── Strip building ──────────────────────────────────────────

const fmt = {
  db: v => (v <= -40 ? '-∞' : `${v > 0 ? '+' : ''}${v.toFixed(1)}`),
  pan: v => (Math.abs(v) < 0.01 ? 'C' : `${v < 0 ? 'L' : 'R'}${Math.round(Math.abs(v) * 100)}`),
  pct: v => `${Math.round(v * 100)}%`,
}
const CHANNEL_SLIDERS = [
  { key: 'volume', label: 'Vol', min: -40, max: 6, step: 0.5, fmt: fmt.db },
  { key: 'pan', label: 'Pan', min: -1, max: 1, step: 0.01, fmt: fmt.pan },
  { key: 'send', label: 'Send', min: 0, max: 1.5, step: 0.01, fmt: fmt.pct },
]
const FX_SLIDERS = [
  { key: 'volume', label: 'Ret', min: -40, max: 6, step: 0.5, fmt: fmt.db },
  { key: 'feedback', label: 'Fdbk', min: 0, max: 1.1, step: 0.01, fmt: fmt.pct },
  { key: 'reverb', label: 'Verb', min: 0, max: 1.5, step: 0.01, fmt: fmt.pct },
]
const ECHO_TIMES = [[2, '1/8'], [3, '1/8.'], [4, '1/4'], [6, '1/4.']]

function buildStrip(def, index, { sliders, buttons, select }) {
  const el = document.createElement('div')
  el.className = 'strip'
  el.style.setProperty('--color', def.color)
  el.innerHTML = `
    <div class="name">
      <strong>${index ? `${index} ` : ''}${def.name}</strong>
      <div class="buttons">${buttons.map(b => `<button class="${b}" aria-pressed="false">${b[0].toUpperCase()}</button>`).join('')}</div>
      <select aria-label="${select.label}">${select.options.map(([v, l]) => `<option value="${v}">${l}</option>`).join('')}</select>
    </div>
    <div class="controls">
      ${sliders.map(s => `
        <label for="${def.id}-${s.key}">${s.label}</label>
        <input id="${def.id}-${s.key}" type="range" min="${s.min}" max="${s.max}" step="${s.step}" value="${def.defaults[s.key]}">
        <output>${s.fmt(def.defaults[s.key])}</output>`).join('')}
    </div>
    <canvas></canvas>`

  for (const s of sliders) {
    const input = el.querySelector(`#${def.id}-${s.key}`)
    input.oninput = () => {
      engine.set(def.id, s.key, +input.value)
      input.nextElementSibling.textContent = s.fmt(+input.value)
    }
    input.ondblclick = () => { input.value = def.defaults[s.key]; input.oninput() } // reset
  }
  for (const key of buttons) {
    const btn = el.querySelector(`.${key}`)
    btn.onclick = () => {
      const on = btn.getAttribute('aria-pressed') !== 'true'
      btn.setAttribute('aria-pressed', on)
      engine.set(def.id, key, on)
    }
  }
  const sel = el.querySelector('select')
  sel.value = select.value
  sel.onchange = () => select.onchange(sel.value)

  $('strips').append(el)
  return { el, canvas: el.querySelector('canvas'), select: sel }
}

const views = {}
CHANNELS.forEach((def, i) => {
  views[def.id] = buildStrip(def, i + 1, {
    sliders: CHANNEL_SLIDERS,
    buttons: ['mute', 'solo'],
    select: {
      label: 'Pattern',
      value: '',
      options: [['', 'Auto'], ...Object.keys(PATTERNS[def.id]).map(n => [n, n])],
      onchange: v => engine.lockPattern(def.id, v || null),
    },
  })
})
views.fx = buildStrip(FX_STRIP, null, {
  sliders: FX_SLIDERS,
  buttons: ['mute'],
  select: {
    label: 'Echo time',
    value: FX_STRIP.defaults.time,
    options: ECHO_TIMES.map(([v, l]) => [v, `Echo ${l}`]),
    onchange: v => engine.set('fx', 'time', +v),
  },
})

// ── Header controls ─────────────────────────────────────────

$('master').oninput = e => engine.master.gain.setTargetAtTime(10 ** (e.target.value / 20), engine.ctx.currentTime, 0.02)
$('bpm').oninput = e => { engine.setBpm(+e.target.value); $('bpm-out').textContent = e.target.value }
$('key').innerHTML = KEYS.map(k => `<option>${k}</option>`).join('')
$('key').value = engine.conductor.key
$('key').onchange = e => engine.setKey(e.target.value)

$('play').onclick = async () => {
  $('play').disabled = true
  $('status').textContent = 'Starting…'
  await engine.start()
  $('stop').disabled = false
}
$('stop').onclick = () => {
  engine.stop()
  $('play').disabled = false
  $('stop').disabled = true
  $('status').textContent = 'Stopped (tails ringing out)'
}

// Show what the conductor is doing; "Auto" options name the pattern currently playing
engine.onBar(({ bar, section, patterns, chord }) => {
  $('status').textContent = `Bar ${bar + 1} · Section ${section.index + 1} (${section.bar + 1}/${section.bars}) · ${chord}`
  for (const def of CHANNELS) views[def.id].select.options[0].textContent = `Auto (${patterns[def.id]})`
})

// ── Visualisers ─────────────────────────────────────────────

const frame = () => {
  for (const s of engine.strips) draw(views[s.def.id].canvas, s.analyser, s.def.color)
  draw(views.fx.canvas, engine.fx.analyser, FX_STRIP.color)
  requestAnimationFrame(frame)
}
frame()
