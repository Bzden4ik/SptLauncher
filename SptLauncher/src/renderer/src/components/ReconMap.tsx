import React, { useEffect, useRef } from 'react'
import { ambientAudio } from '../audio/AmbientAudio'

/**
 * Living reconnaissance chart. Animated topographic iso-lines built from a sum
 * of slow sines (cheap, organic), with mouse parallax and audio-reactive glow.
 * Pure canvas — runs at ~display rate, soft-degrades if anything fails.
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
    let w = 0, h = 0, dpr = Math.min(window.devicePixelRatio || 1, 2)

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

    const draw = (now: number) => {
      const t = (now - start) / 1000

      // ease parallax toward target
      mouse.current.x += (mouse.current.tx - mouse.current.x) * 0.05
      mouse.current.y += (mouse.current.ty - mouse.current.y) * 0.05
      const px = (mouse.current.x - 0.5)
      const py = (mouse.current.y - 0.5)

      // audio energy (smoothed)
      const e = ambientAudio.energy()
      energy += (e - energy) * 0.08

      ctx.clearRect(0, 0, w, h)

      // base wash
      const g = ctx.createLinearGradient(0, 0, 0, h)
      g.addColorStop(0, 'rgba(18,26,38,0.0)')
      g.addColorStop(1, 'rgba(8,12,20,0.0)')
      ctx.fillStyle = g
      ctx.fillRect(0, 0, w, h)

      // iso-lines (topographic ridges)
      const spacing = 26
      const count = Math.ceil(h / spacing) + 4
      const baseAmp = 16 + energy * 26
      const offX = px * 26
      const offY = py * 18

      for (let i = 0; i < count; i++) {
        const yBase = i * spacing - 40 + offY
        const phase = i * 0.55
        // a few "index contours" glow warmer
        const isIndex = i % 5 === 0
        ctx.beginPath()
        const stepX = 12
        for (let x = -20; x <= w + 20; x += stepX) {
          const nx = x + offX
          const y = yBase
            + Math.sin(nx * 0.006 + t * 0.25 + phase) * baseAmp
            + Math.sin(nx * 0.013 - t * 0.18 + phase * 1.7) * (baseAmp * 0.5)
            + Math.sin(nx * 0.0027 + t * 0.12) * (baseAmp * 0.7)
          if (x === -20) ctx.moveTo(x, y)
          else ctx.lineTo(x, y)
        }
        if (isIndex) {
          ctx.strokeStyle = `rgba(242,167,59,${0.05 + energy * 0.10})`
          ctx.lineWidth = 1.1
        } else {
          ctx.strokeStyle = `rgba(150,178,205,${0.045 + energy * 0.03})`
          ctx.lineWidth = 0.8
        }
        ctx.stroke()
      }

      // soft radial glow centred a touch above middle, pulsing with audio
      const cx = w * (0.5 + px * 0.04)
      const cy = h * (0.46 + py * 0.04)
      const rad = Math.min(w, h) * (0.42 + energy * 0.12)
      const rg = ctx.createRadialGradient(cx, cy, 0, cx, cy, rad)
      rg.addColorStop(0, `rgba(242,167,59,${0.05 + energy * 0.06})`)
      rg.addColorStop(0.5, 'rgba(242,167,59,0.015)')
      rg.addColorStop(1, 'rgba(0,0,0,0)')
      ctx.fillStyle = rg
      ctx.fillRect(0, 0, w, h)

      raf = requestAnimationFrame(draw)
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
