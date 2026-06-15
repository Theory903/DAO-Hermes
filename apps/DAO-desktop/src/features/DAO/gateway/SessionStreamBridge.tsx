import { useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useRef } from 'react'
import { useLocation } from 'react-router-dom'
import { useStore } from '@nanostores/react'

import { useGatewayRequest } from '@/app/gateway/hooks/use-gateway-request'
import { onGatewayEvent } from '@/lib/gateway-event-hub'
import { useMessageStream } from '@/app/session/hooks/use-message-stream'
import { useSessionStateCache } from '@/app/session/hooks/use-session-state-cache'
import { $activeSessionId, $selectedStoredSessionId, setAwaitingResponse, setBusy, setMessages } from '@/store/session'

/**
 * Keeps chat stream deltas (incl. reasoning) updating session cache while the
 * user is on company routes (/space/...). DesktopController owns the same
 * cache when chat is mounted — this bridge only subscribes when chat is not.
 */
export function SessionStreamBridge() {
  const location = useLocation()
  // Only while company screens are mounted (DesktopController is unmounted).
  const companyRoute = location.pathname.startsWith('/space/')

  if (!companyRoute) {
    return null
  }

  return <SessionStreamBridgeInner />
}

function SessionStreamBridgeInner() {
  const queryClient = useQueryClient()
  const { requestGateway } = useGatewayRequest()
  const activeSessionId = useStore($activeSessionId)
  const selectedStoredSessionId = useStore($selectedStoredSessionId)
  const busyRef = useRef(false)

  const { activeSessionIdRef, sessionStateByRuntimeIdRef, updateSessionState } = useSessionStateCache({
    activeSessionId,
    busyRef,
    selectedStoredSessionId,
    setAwaitingResponse,
    setBusy,
    setMessages
  })

  const refreshHermesConfig = useCallback(async () => {
    try {
      await requestGateway('config.get', {})
    } catch {
      /* offline */
    }
  }, [requestGateway])

  const refreshSessions = useCallback(async () => {
    try {
      await requestGateway('session.list', { limit: 1, offset: 0 })
    } catch {
      /* offline */
    }
  }, [requestGateway])

  const hydrateFromStoredSession = useCallback(async () => {
    /* Full REST hydrate runs when DesktopController mounts on return to chat. */
  }, [])

  const { handleGatewayEvent } = useMessageStream({
    activeSessionIdRef,
    hydrateFromStoredSession,
    queryClient,
    refreshHermesConfig,
    refreshSessions,
    sessionStateByRuntimeIdRef,
    updateSessionState
  })

  useEffect(() => onGatewayEvent(handleGatewayEvent), [handleGatewayEvent])

  return null
}
