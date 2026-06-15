import { useStore } from '@nanostores/react'
import { useEffect, useRef, useState } from 'react'

import { ScrambleStatusText } from '@/components/scramble-status-text'
import { cn } from '@/lib/utils'
import { useScrambleTail } from '@/lib/scramble-text'
import { $desktopBoot } from '@/store/boot'
import { $gatewayState } from '@/store/session'

const PREFIX = 'CONN'
const TAIL = 'ECTING'

const TEXT_OUT_MS = 360
const POST_TEXT_HOLD_MS = 300
const OVERLAY_OUT_MS = 520
const PREVIEW_CONNECT_MS = 2600
const PREVIEW_REPLAY_MS = 1100

type Phase = 'live' | 'text-out' | 'overlay-out' | 'gone'

function forcedPreview(): boolean {
  if (!import.meta.env.DEV || typeof window === 'undefined') {
    return false
  }

  try {
    return new URLSearchParams(window.location.search).get('connecting') === '1'
  } catch {
    return false
  }
}

export function GatewayConnectingOverlay() {
  const gatewayState = useStore($gatewayState)
  const boot = useStore($desktopBoot)
  const [previewing] = useState(forcedPreview)
  const [phase, setPhase] = useState<Phase>('live')

  const connecting = gatewayState !== 'open' && !boot.error
  const scrambleActive = phase === 'live' && (previewing || connecting)
  const tail = useScrambleTail(TAIL, scrambleActive)

  const shownRef = useRef(false)

  if (previewing || connecting) {
    shownRef.current = true
  }

  useEffect(() => {
    if (phase !== 'live') {
      return
    }

    if (previewing) {
      const id = window.setTimeout(() => setPhase('text-out'), PREVIEW_CONNECT_MS)
      return () => window.clearTimeout(id)
    }

    if (gatewayState === 'open' && shownRef.current) {
      setPhase('text-out')
    }
  }, [phase, previewing, gatewayState])

  useEffect(() => {
    if (phase === 'text-out') {
      const id = window.setTimeout(() => setPhase('overlay-out'), TEXT_OUT_MS + POST_TEXT_HOLD_MS)
      return () => window.clearTimeout(id)
    }

    if (phase === 'overlay-out') {
      const id = window.setTimeout(() => setPhase('gone'), OVERLAY_OUT_MS)
      return () => window.clearTimeout(id)
    }

    if (phase === 'gone' && previewing) {
      const id = window.setTimeout(() => setPhase('live'), PREVIEW_REPLAY_MS)
      return () => window.clearTimeout(id)
    }
  }, [phase, previewing])

  if (boot.error && !previewing) {
    return null
  }

  if (phase === 'gone' && !previewing) {
    return null
  }

  if (!previewing && !connecting && !shownRef.current) {
    return null
  }

  const leaving = phase !== 'live'
  const overlayHidden = phase === 'overlay-out' || phase === 'gone'

  return (
    <div
      className={cn(
        'fixed inset-0 z-[1200] grid place-items-center bg-(--ui-chat-surface-background) transition-opacity duration-500 ease-out',
        overlayHidden ? 'pointer-events-none opacity-0' : 'opacity-100'
      )}
    >
      <ScrambleStatusText leaving={leaving} prefix={PREFIX} tail={tail} />
    </div>
  )
}
