import type { AudioSettings } from '@shared/types'
import { DEFAULT_AUDIO } from '@shared/types'

const STORE_KEY = 'audio'

type Listener = (s: AudioSettings) => void

class AmbientAudioController {
  private audio: HTMLAudioElement | null = null
  private ctx: AudioContext | null = null
  private analyser: AnalyserNode | null = null
  private source: MediaElementAudioSourceNode | null = null
  private gain: GainNode | null = null
  private blobUrl: string | null = null
  private loaded = false
  private starting = false
  private listeners = new Set<Listener>()
  private settings: AudioSettings = { ...DEFAULT_AUDIO }
  // Transient "duck while the game runs" flag. NOT persisted, NOT part of the
  // user's saved mute preference — it only silences output temporarily.
  private autoMuted = false
  private freqData: Uint8Array = new Uint8Array(0)
  private timeData: Uint8Array = new Uint8Array(0)

  // Public surface ---------------------------------------------------------

  get state(): AudioSettings { return this.settings }

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn)
    fn(this.settings)
    return () => this.listeners.delete(fn)
  }

  async init(): Promise<void> {
    if (this.loaded || this.starting) return
    this.starting = true

    // 1) Load saved settings
    try {
      const raw = await window.api.config.get(STORE_KEY)
      if (raw && typeof raw === 'object') {
        const r = raw as Partial<AudioSettings>
        this.settings = {
          volume:      typeof r.volume === 'number' ? clamp01(r.volume) : DEFAULT_AUDIO.volume,
          muted:       !!r.muted,
          initialized: !!r.initialized
        }
      }
    } catch {}

    // 2) Pull mp3 bytes via ipc and build a blob: URL
    try {
      const raw = await window.api.audio.loadTrack()
      const u8  = raw instanceof Uint8Array ? raw : new Uint8Array(raw as ArrayBuffer)
      const blob = new Blob([u8.buffer as ArrayBuffer], { type: 'audio/mpeg' })
      this.blobUrl = URL.createObjectURL(blob)
    } catch (e) {
      console.warn('[audio] track unavailable', e)
      this.starting = false
      return
    }

    // 3) Build the element + graph
    const a = new Audio()
    a.src = this.blobUrl!
    a.loop = true
    a.preload = 'auto'
    a.volume = this.settings.muted ? 0 : this.settings.volume
    this.audio = a

    // Build a WebAudio graph for the visualiser (optional — soft-fail).
    try {
      this.ctx = new AudioContext()
      this.source = this.ctx.createMediaElementSource(a)
      this.gain = this.ctx.createGain()
      this.gain.gain.value = this.settings.muted ? 0 : this.settings.volume
      this.analyser = this.ctx.createAnalyser()
      this.analyser.fftSize = 256
      this.analyser.smoothingTimeConstant = 0.82
      this.freqData = new Uint8Array(this.analyser.frequencyBinCount)
      this.timeData = new Uint8Array(this.analyser.fftSize)
      this.source.connect(this.gain)
      this.gain.connect(this.analyser)
      this.analyser.connect(this.ctx.destination)
    } catch (e) {
      console.warn('[audio] WebAudio graph not built', e)
    }

    this.loaded = true
    this.starting = false

    // Browsers (and Electron) block autoplay until first user gesture.
    // We try immediately; if it rejects, attachAutoplayUnlocker() will retry.
    this.tryPlay()
    this.attachAutoplayUnlocker()
    this.emit()
  }

  setVolume(v: number) {
    this.settings.volume = clamp01(v)
    // Setting volume implicitly unmutes if user dragged slider above 0.
    if (this.settings.volume > 0) this.settings.muted = false
    this.applyVolume()
    this.persist()
    this.emit()
    this.tryPlay()
  }

  setMuted(m: boolean) {
    this.settings.muted = m
    this.applyVolume()
    this.persist()
    this.emit()
  }

  toggleMute() { this.setMuted(!this.settings.muted) }

  // Auto-mute the ambient track while the game is running, without touching the
  // user's saved mute preference.
  //   start → silence only if the user hasn't already muted it
  //   exit  → lift only the auto-mute we applied (a pre-existing user mute stays)
  setGameRunning(running: boolean) {
    if (running) {
      if (!this.settings.muted) this.autoMuted = true
    } else {
      this.autoMuted = false
    }
    this.applyVolume()
    this.emit()
  }

  // Returns frequency bars in 0..1 range. Empty array if analyser unavailable.
  readBars(count: number): number[] {
    if (!this.analyser) return []
    this.analyser.getByteFrequencyData(this.freqData as any)
    const out: number[] = []
    const bin = Math.max(1, Math.floor(this.freqData.length / count))
    for (let i = 0; i < count; i++) {
      let sum = 0, n = 0
      for (let j = 0; j < bin; j++) { sum += this.freqData[i * bin + j] || 0; n++ }
      out.push((sum / n) / 255)
    }
    return out
  }

  // Returns time-domain waveform samples in -1..1 range (for an oscilloscope).
  // Empty array if analyser unavailable. `count` points, evenly downsampled.
  readWave(count: number): number[] {
    if (!this.analyser) return []
    this.analyser.getByteTimeDomainData(this.timeData as any)
    const out: number[] = []
    const step = Math.max(1, Math.floor(this.timeData.length / count))
    for (let i = 0; i < count; i++) {
      const v = this.timeData[i * step] ?? 128
      out.push((v - 128) / 128)
    }
    return out
  }

  // Overall energy 0..1 (mean of low/mid frequency bins) for reactive visuals.
  energy(): number {
    const bars = this.readBars(8)
    if (!bars.length) return 0
    return bars.reduce((a, b) => a + b, 0) / bars.length
  }

  // Internals --------------------------------------------------------------

  private applyVolume() {
    const silenced = this.settings.muted || this.autoMuted
    const v = silenced ? 0 : this.settings.volume
    if (this.audio) this.audio.volume = v
    if (this.gain && this.ctx) this.gain.gain.setTargetAtTime(v, this.ctx.currentTime, 0.05)
  }

  private async persist() {
    this.settings.initialized = true
    try { await window.api.config.set(STORE_KEY, this.settings) } catch {}
  }

  private emit() {
    for (const fn of this.listeners) fn({ ...this.settings })
  }

  private tryPlay() {
    if (!this.audio) return
    if (this.ctx?.state === 'suspended') this.ctx.resume().catch(() => {})
    this.audio.play().catch(() => { /* will be retried by autoplay unlocker */ })
  }

  private attachAutoplayUnlocker() {
    const unlock = () => {
      this.tryPlay()
      window.removeEventListener('pointerdown', unlock)
      window.removeEventListener('keydown', unlock)
    }
    window.addEventListener('pointerdown', unlock, { once: true })
    window.addEventListener('keydown', unlock, { once: true })
  }
}

function clamp01(n: number): number {
  if (Number.isNaN(n)) return 0
  return Math.max(0, Math.min(1, n))
}

export const ambientAudio = new AmbientAudioController()
