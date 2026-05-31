import React, { useEffect, useRef } from 'react'
import { ambientAudio } from '../audio/AmbientAudio'

/**
 * Living reconnaissance chart. Animated topographic iso-lines built from a sum
 * of slow sines, with mouse parallax and a subtle audio-reactive glow.
 *
 * The canvas paints an OPAQUE base every frame (not clearRect-to-transparent):
 * this is the background, and — crucially — it can never "accumulate" into a
 * bright bloom on a misbehaving GPU/driver. Frame-rate is capped so it stays
 * cheap under software rendering too.
 */
export default function ReconMap() {
  const ref = useRef<HTMLCanvasElement>(null)
  const mouse = useRef({ x: 0.5, y: 0.5, tx: 0.5, ty: 0.5 })

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

    const onMove = (e: MouseEvent) => {
      mouse.current.tx = e.clientX / window.innerWidth
      mouse.current.ty = e.clientY / window.innerHeight
    }
    window.addEventListener('mousemove', onMove)

    const start = performance.now()
    let energy = 0
    let last = 0
    const FRAME = 1000 / 30   // cap at ~30 fps

    const draw = (now: number) => {
      raf = requestAnimationFrame(draw)
      if (now - last < FRAME) return
      last = now

      const t = (now - start) / 1000
      mouse.current.x += (mouse.current.tx - mouse.current.x) * 0.06
      mouse.current.y += (mouse.current.ty - mouse.current.y) * 0.06
      const px = (mouse.current.x - 0.5)
      const py = (mouse.current.y - 0.5)

      const e = ambientAudio.energy()
      energy += (e - energy) * 0.08

      // 1) OPAQUE base — overwrites the previous frame entirely. No transparency,
      //    so nothing can build up frame-over-frame. Solid fill first as an
      //    absolute guarantee, then a dark gradient for depth.
      ctx.fillStyle = '#0b1019'
      ctx.fillRect(0, 0, w, h)
      const base = ctx.createLinearGradient(0, 0, 0, h)
      base.addColorStop(0, '#0f1722')
      base.addColorStop(0.55, '#0b1019')
      base.addColorStop(1, '#080b11')
      ctx.fillStyle = base
      ctx.fillRect(0, 0, w, h)

      // 2) iso-lines (faint, fixed low opacity)
      const spacing = 28
      const count = Math.ceil(h / spacing) + 4
      const baseAmp = 15 + energy * 18
      const offX = px * 24
      const offY = py * 16
      for (let i = 0; i < count; i++) {
        const yBase = i * spacing - 40 + offY
        const phase = i * 0.55
        const isIndex = i % 5 === 0
        ctx.beginPath()
        for (let x = -20; x <= w + 20; x += 14) {
          const nx = x + offX
          const y = yBase
            + Math.sin(nx * 0.006 + t * 0.22 + phase) * baseAmp
            + Math.sin(nx * 0.013 - t * 0.16 + phase * 1.7) * (baseAmp * 0.5)
            + Math.sin(nx * 0.0027 + t * 0.1) * (baseAmp * 0.7)
          x === -20 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)
        }
        ctx.strokeStyle = isIndex
          ? `rgba(242,167,59,${0.05 + energy * 0.05})`
          : `rgba(150,178,205,${0.05})`
        ctx.lineWidth = isIndex ? 1.1 : 0.8
        ctx.stroke()
      }
      // No radial glow fill — a full-screen translucent gradient was the source
      // of the bright "bloom" on some setups. The opaque base above is the only
      // fill, so the background stays reliably dark everywhere.
    }
    raf = requestAnimationFrame(draw)

    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
      window.removeEventListener('mousemove', onMove)
    }
  }, [])

  return <canvas ref={ref} className="recon-canvas" />
}
