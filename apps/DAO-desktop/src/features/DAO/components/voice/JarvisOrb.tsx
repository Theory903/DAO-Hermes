import { useEffect, useRef } from 'react'

import { cn } from '@/lib/utils'

export type OrbState = 'idle' | 'listening' | 'thinking' | 'speaking'

/**
 * Audio-reactive "Jarvis" orb — a canvas visualizer that reacts to real audio:
 *  - speaking  → radial frequency spectrum from a Web Audio AnalyserNode tapped
 *                onto the live TTS audio element (true voice sync).
 *  - listening → reactive ring driven by `micLevel` (0..1).
 *  - thinking  → orbiting sweep.  idle → slow breathing core.
 */
export function JarvisOrb({
  state,
  audioEl,
  micLevel = 0,
  leadName,
  onClick,
  className,
  ariaLabel,
}: {
  state: OrbState
  audioEl?: HTMLAudioElement | null
  micLevel?: number
  leadName: string
  onClick?: () => void
  className?: string
  ariaLabel?: string
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const audioCtxRef = useRef<AudioContext | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const boundElRef = useRef<HTMLAudioElement | null>(null)

  const stateRef = useRef(state)
  stateRef.current = state
  const micRef = useRef(micLevel)
  micRef.current = micLevel

  useEffect(() => {
    if (!audioEl || boundElRef.current === audioEl) return
    try {
      const Ctor =
        window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
      if (!Ctor) return
      if (!audioCtxRef.current) audioCtxRef.current = new Ctor()
      const ctx = audioCtxRef.current
      void ctx.resume()
      const source = ctx.createMediaElementSource(audioEl)
      const analyser = ctx.createAnalyser()
      analyser.fftSize = 256
      analyser.smoothingTimeConstant = 0.82
      source.connect(analyser)
      analyser.connect(ctx.destination)
      analyserRef.current = analyser
      boundElRef.current = audioEl
    } catch {
      /* visualization is best-effort; audio still plays */
    }
  }, [audioEl])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const reduceMotion =
      typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

    const BARS = 72
    const freq = new Uint8Array(128)
    const smooth = new Array<number>(BARS).fill(0)
    const accent = parseRgb(getComputedStyle(canvas).color) ?? [171, 159, 242]
    let raf = 0
    let t = 0

    const draw = () => {
      t += reduceMotion ? 0 : 0.016
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      const size = canvas.clientWidth || 220
      if (canvas.width !== Math.round(size * dpr)) {
        canvas.width = Math.round(size * dpr)
        canvas.height = Math.round(size * dpr)
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, size, size)

      const cx = size / 2
      const cy = size / 2
      const st = stateRef.current
      const analyser = analyserRef.current

      const amps = new Array<number>(BARS)
      let overall = 0
      if (st === 'speaking' && analyser) {
        analyser.getByteFrequencyData(freq)
        const usable = Math.min(96, analyser.frequencyBinCount)
        for (let i = 0; i < BARS; i += 1) {
          const half = BARS / 2
          const idx = Math.floor((Math.abs(i - half) / half) * usable)
          amps[i] = (freq[idx] ?? 0) / 255
          overall += amps[i]
        }
        overall /= BARS
      } else if (st === 'listening') {
        const lvl = micRef.current
        for (let i = 0; i < BARS; i += 1) {
          const wobble = reduceMotion ? 0 : 0.18 * Math.sin(t * 4 + i * 0.5)
          amps[i] = Math.max(0, Math.min(1, lvl * 1.6 + wobble * (lvl > 0.02 ? 1 : 0.4) + 0.12))
        }
        overall = Math.max(lvl, 0.12)
      } else if (st === 'thinking') {
        for (let i = 0; i < BARS; i += 1) amps[i] = 0.18
        overall = 0.18
      } else {
        const breathe = reduceMotion ? 0.1 : 0.1 + 0.04 * Math.sin(t * 1.6)
        for (let i = 0; i < BARS; i += 1) amps[i] = breathe
        overall = breathe
      }

      for (let i = 0; i < BARS; i += 1) smooth[i] += (amps[i] - smooth[i]) * 0.35

      const baseR = size * 0.27
      const maxBar = size * 0.16

      const glow = baseR + maxBar * (0.35 + overall * 0.9)
      const halo = ctx.createRadialGradient(cx, cy, baseR * 0.2, cx, cy, glow)
      halo.addColorStop(0, withAlpha(accent, 0.32 + overall * 0.3))
      halo.addColorStop(1, withAlpha(accent, 0))
      ctx.fillStyle = halo
      ctx.beginPath()
      ctx.arc(cx, cy, glow, 0, Math.PI * 2)
      ctx.fill()

      const rot = reduceMotion ? 0 : t * 0.25
      ctx.lineCap = 'round'
      for (let i = 0; i < BARS; i += 1) {
        const a = (i / BARS) * Math.PI * 2 + rot
        const len = maxBar * smooth[i]
        const r0 = baseR + size * 0.012
        const r1 = r0 + len
        ctx.strokeStyle = withAlpha(accent, 0.5 + smooth[i] * 0.5)
        ctx.lineWidth = size * 0.012
        ctx.beginPath()
        ctx.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0)
        ctx.lineTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1)
        ctx.stroke()
      }

      const coreR = baseR * (0.94 + overall * 0.06)
      const core = ctx.createRadialGradient(cx - coreR * 0.3, cy - coreR * 0.3, coreR * 0.1, cx, cy, coreR)
      core.addColorStop(0, withAlpha(accent, 0.9))
      core.addColorStop(0.55, withAlpha(accent, 0.28))
      core.addColorStop(1, withAlpha(accent, 0.08))
      ctx.fillStyle = core
      ctx.beginPath()
      ctx.arc(cx, cy, coreR, 0, Math.PI * 2)
      ctx.fill()

      if (st === 'thinking' && !reduceMotion) {
        const grad = ctx.createConicGradient?.(t * 2.4, cx, cy)
        if (grad) {
          grad.addColorStop(0, withAlpha(accent, 0))
          grad.addColorStop(0.12, withAlpha(accent, 0.85))
          grad.addColorStop(0.2, withAlpha(accent, 0))
          grad.addColorStop(1, withAlpha(accent, 0))
          ctx.strokeStyle = grad as unknown as CanvasGradient
          ctx.lineWidth = size * 0.018
          ctx.beginPath()
          ctx.arc(cx, cy, baseR + size * 0.03, 0, Math.PI * 2)
          ctx.stroke()
        }
      }

      raf = window.requestAnimationFrame(draw)
    }

    raf = window.requestAnimationFrame(draw)
    return () => window.cancelAnimationFrame(raf)
  }, [])

  return (
    <button
      aria-label={ariaLabel ?? `Talk to ${leadName}`}
      className={cn('DAO-jarvis-orb', className)}
      data-state={state}
      onClick={onClick}
      type="button"
    >
      <canvas aria-hidden className="DAO-jarvis-orb__canvas" ref={canvasRef} />
      <span aria-hidden className="DAO-jarvis-orb__initial">
        {state === 'speaking' ? '' : leadName.slice(0, 1)}
      </span>
    </button>
  )
}

function parseRgb(value: string): [number, number, number] | null {
  const m = value.match(/rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)/i)
  if (m) return [Number(m[1]), Number(m[2]), Number(m[3])]
  if (value.startsWith('#')) {
    let hex = value.slice(1)
    if (hex.length === 3)
      hex = hex
        .split('')
        .map((ch) => ch + ch)
        .join('')
    return [parseInt(hex.slice(0, 2), 16), parseInt(hex.slice(2, 4), 16), parseInt(hex.slice(4, 6), 16)]
  }
  return null
}

function withAlpha(rgb: [number, number, number], alpha: number): string {
  const a = Math.max(0, Math.min(1, alpha))
  return `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${a})`
}
