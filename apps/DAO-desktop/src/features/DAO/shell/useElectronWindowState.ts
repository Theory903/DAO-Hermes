import { useEffect, useState } from 'react'
import { useStore } from '@nanostores/react'

import type { HermesConnection, HermesWindowState } from '@/global'
import { $connection } from '@/store/session'

const EMPTY_WINDOW_STATE: HermesWindowState = {
  isFullscreen: false,
  nativeOverlayWidth: 0,
  windowButtonPosition: null,
}

function windowStateFromConnection(connection: HermesConnection | null): HermesWindowState | null {
  if (!connection) return null
  return {
    isFullscreen: connection.isFullscreen,
    nativeOverlayWidth: connection.nativeOverlayWidth,
    windowButtonPosition: connection.windowButtonPosition,
  }
}

/** Live OS window chrome — traffic lights, fullscreen, native overlay width. */
export function useElectronWindowState(): HermesWindowState {
  const connection = useStore($connection)
  const [electronState, setElectronState] = useState<HermesWindowState | null>(null)

  useEffect(() => {
    const desktop = window.hermesDesktop
    if (!desktop) return

    const off = desktop.onWindowStateChanged?.((payload) => {
      setElectronState(payload)
    })

    return () => {
      off?.()
    }
  }, [])

  return electronState ?? windowStateFromConnection(connection) ?? EMPTY_WINDOW_STATE
}
