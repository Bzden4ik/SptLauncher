import React, { useEffect, useRef } from 'react'
import { ambientAudio } from '../audio/AmbientAudio'

/** Oscilloscope rendering of the ambient track's waveform. */
export default function SignalScope({ muted }: { muted?: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let raf = 0
    let w = 0, h = 0
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    const resize = () => {
      const r = canvas.getBoundingClientRect()
      w = Math.max(1, r.width); h = Math.max(1, r.height)
      canvas.width = Math.floor(w * dpr); canvas.height = Math.floor(h * dpr)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }
    resize()
    const ro = new ResizeObserver(resize); ro.observe(canvas)

    const N = 128
    let phase = 0
    const draw = () => {
      ctx.clearRect(0, 0, w, h)
      const mid = h / 2

      // baseline
      ctx.strokeStyle = 'rgba(150,178,205,0.10)'
      ctx.lineWidth = 1
      ctx.beginPath(); ctx.moveTo(0, mid); ctx.lineTo(w, mid); ctx.stroke()

      const wave = ambientAudio.readWave(N)
      phase += 0.05

      ctx.beginPath()
      for (let i = 0; i < N; i++) {
        const x = (i / (N - 1)) * w
        let v: number
        if (wave.length && !muted) v = wave[i]
        else v = Math.sin(i * 0.25 + phase) * 0.04 // idle ripple when silent/muted
        const y = mid - v * (h * 0.42)
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y)
      }
      ctx.strokeStyle = muted ? 'rgba(127,166,196,0.35)' : 'rgba(242,167,59,0.9)'
      ctx.lineWidth = 1.4
      ctx.shadowColor = muted ? 'transparent' : 'rgba(242,167,59,0.6)'
      ctx.shadowBlur = muted ? 0 : 6
      ctx.stroke()
      ctx.shadowBlur = 0

      raf = requestAnimationFrame(draw)
    }
    raf = requestAnimationFrame(draw)
    return () => { cancelAnimationFrame(raf); ro.disconnect() }
  }, [muted])

  return <canvas ref={ref} className="scope-canvas" />
}
