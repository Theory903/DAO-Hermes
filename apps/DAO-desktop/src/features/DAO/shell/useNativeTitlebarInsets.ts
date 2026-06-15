import { useSyncExternalStore } from 'react'

import {
  TITLEBAR_EDGE_INSET,
  TITLEBAR_FALLBACK_WINDOW_BUTTON_X,
} from '@/app/shell/titlebar'

import { useElectronWindowState } from './useElectronWindowState'

/** macOS traffic-light cluster width + breathing room after the lights. */
const MACOS_TRAFFIC_CLUSTER_WIDTH = 52
const BRAND_AFTER_TRAFFIC_GAP = 10

function subscribeFullscreen(cb: () => void) {
  document.addEventListener('fullscreenchange', cb)
  return () => document.removeEventListener('fullscreenchange', cb)
}

function readViewportFullscreen() {
  return document.fullscreenElement != null
}

export type NativeTitlebarInsets = {
  /** Right edge — clears Win/Linux window controls overlay. */
  paddingRight: string
  /** Brand slot only — clears macOS traffic lights when windowed; 0 in fullscreen. */
  brandInsetLeft: string
  isFullscreen: boolean
}

/** Clearance for OS traffic lights (macOS) and min/max/close overlay (Win/Linux). */
export function useNativeTitlebarInsets(): NativeTitlebarInsets {
  const windowState = useElectronWindowState()
  const viewportFullscreen = useSyncExternalStore(subscribeFullscreen, readViewportFullscreen, () => false)
  const isFullscreen = windowState.isFullscreen || viewportFullscreen
  const nativeRight = windowState.nativeOverlayWidth

  const paddingRight = isFullscreen
    ? `${TITLEBAR_EDGE_INSET}px`
    : nativeRight > 0
      ? `${nativeRight}px`
      : `${TITLEBAR_EDGE_INSET}px`

  if (isFullscreen) {
    return { paddingRight, brandInsetLeft: `${TITLEBAR_EDGE_INSET}px`, isFullscreen: true }
  }

  const traffic = windowState.windowButtonPosition
  if (traffic) {
    const trafficClear =
      (traffic.x ?? TITLEBAR_FALLBACK_WINDOW_BUTTON_X) +
      MACOS_TRAFFIC_CLUSTER_WIDTH +
      BRAND_AFTER_TRAFFIC_GAP
    const brandInsetLeft = Math.max(TITLEBAR_EDGE_INSET, trafficClear)
    return { paddingRight, brandInsetLeft: `${brandInsetLeft}px`, isFullscreen: false }
  }

  return { paddingRight, brandInsetLeft: `${TITLEBAR_EDGE_INSET}px`, isFullscreen: false }
}
