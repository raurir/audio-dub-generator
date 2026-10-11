import { existsSync } from 'node:fs'
import { defineConfig } from 'vite'

// audio's browser bundle lazily imports optional @audio/* packages (extra codecs, neural models).
// Resolve the ones not installed to a stub that throws, so they only fail if actually used.
const STUB = '\0missing-audio-pkg:'
const optionalAudioPkgs = {
  name: 'optional-audio-pkgs',
  enforce: 'pre',
  resolveId(id) {
    const m = id.match(/^(@audio\/[^/]+)/)
    if (m && !existsSync(`node_modules/${m[1]}`)) return STUB + id
  },
  load(id) {
    if (id.startsWith(STUB)) return `throw new Error(${JSON.stringify(`${id.slice(STUB.length)} is not installed`)})`
  },
}

export default defineConfig({
  plugins: [optionalAudioPkgs],
  build: { target: 'esnext', chunkSizeWarningLimit: 4000 },
  optimizeDeps: { exclude: ['audio'] },
})
