import { useCallback, useEffect, useRef, useState } from 'react'

import { listHitl, spaceEventsUrl } from '../api/space-api'
import type { HitlRequest } from '../api/types'

export type HitlPushEvent = {
  id: string
  summary: string
}

type UseHitlInboxOptions = {
  onPending?: (event: HitlPushEvent) => void
}

/** Pending HITL queue with live SSE sync from /spaces/{id}/events. */
export function useHitlInbox(spaceId: string | null, options: UseHitlInboxOptions = {}) {
  const onPendingRef = useRef(options.onPending)
  onPendingRef.current = options.onPending

  const [requests, setRequests] = useState<HitlRequest[]>([])
  const [loading, setLoading] = useState(Boolean(spaceId))
  const [error, setError] = useState<string | null>(null)
  const seenPendingRef = useRef<Set<string>>(new Set())

  const reload = useCallback(async () => {
    if (!spaceId) {
      setRequests([])
      setLoading(false)
      return
    }

    setLoading(true)
    try {
      const data = await listHitl(spaceId, 'pending')
      setRequests(data.requests)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load notifications')
    } finally {
      setLoading(false)
    }
  }, [spaceId])

  useEffect(() => {
    seenPendingRef.current.clear()
    void reload()
  }, [reload])

  useEffect(() => {
    if (!spaceId) return

    let es: EventSource | null = null

    try {
      es = new EventSource(spaceEventsUrl(spaceId))
      es.onmessage = (message) => {
        try {
          const parsed = JSON.parse(message.data) as { type?: string; payload?: Record<string, unknown> }
          if (parsed.type === 'connected') return

          if (parsed.type === 'hitl_pending') {
            const id = typeof parsed.payload?.id === 'string' ? parsed.payload.id : null
            const summary =
              (typeof parsed.payload?.summary === 'string' && parsed.payload.summary) ||
              'New approval waiting'

            if (id && !seenPendingRef.current.has(id)) {
              seenPendingRef.current.add(id)
              onPendingRef.current?.({ id, summary })
            }

            void reload()
            return
          }

          if (parsed.type === 'hitl_resolved') {
            const id = typeof parsed.payload?.id === 'string' ? parsed.payload.id : null
            if (id) seenPendingRef.current.delete(id)
            void reload()
          }
        } catch {
          // ignore malformed SSE payloads
        }
      }
    } catch {
      // EventSource unavailable
    }

    return () => es?.close()
  }, [spaceId, reload])

  return {
    requests,
    pendingCount: requests.length,
    loading,
    error,
    reload,
  }
}
