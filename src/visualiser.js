// Per-channel visualiser: log-spaced spectrum bars with the waveform traced over the top.

const BARS = 48

export function draw(canvas, analyser, color) {
  const dpr = devicePixelRatio || 1
  const w = canvas.clientWidth * dpr
  const h = canvas.clientHeight * dpr
  if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h }
  const g = canvas.getContext('2d')
  g.clearRect(0, 0, w, h)

  // Spectrum: bins grouped on a log scale from ~30 Hz to ~16 kHz
  const freq = (analyser._freq ??= new Uint8Array(analyser.frequencyBinCount))
  analyser.getByteFrequencyData(freq)
  const nyquist = analyser.context.sampleRate / 2
  const bin = hz => Math.min(freq.length - 1, Math.round(hz / nyquist * freq.length))
  const bw = w / BARS
  g.fillStyle = color
  for (let b = 0; b < BARS; b++) {
    const lo = bin(30 * (16000 / 30) ** (b / BARS))
    const hi = Math.max(lo + 1, bin(30 * (16000 / 30) ** ((b + 1) / BARS)))
    let v = 0
    for (let i = lo; i < hi; i++) v = Math.max(v, freq[i])
    const bh = (v / 255) * h
    g.globalAlpha = 0.35 + 0.5 * (v / 255)
    g.fillRect(b * bw + 1, h - bh, bw - 2, bh)
  }

  // Waveform
  const wave = (analyser._wave ??= new Float32Array(analyser.fftSize))
  analyser.getFloatTimeDomainData(wave)
  g.globalAlpha = 1
  g.strokeStyle = color
  g.lineWidth = 1.5 * dpr
  g.beginPath()
  for (let i = 0; i < wave.length; i++) {
    const x = (i / (wave.length - 1)) * w
    const y = h / 2 - wave[i] * (h / 2)
    i ? g.lineTo(x, y) : g.moveTo(x, y)
  }
  g.stroke()
}
