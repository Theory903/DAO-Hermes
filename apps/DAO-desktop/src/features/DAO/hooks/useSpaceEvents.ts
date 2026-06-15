import { useEffect, useMemo, useState } from 'react'

import { spaceEventsUrl } from '../api/space-api'
import type { CommandSnapshot } from '../api/types'
import { buildCommandFloorState, type CommandFloorState } from '../lib/command-floor'
import type { SpaceEventPayload } from '../api/types'

export type SpaceFeedEvent = {
  id: string
  type: string
  text: string
  reused?: boolean
  payload?: Record<string, unknown>
  fromDept?: string
  toDept?: string
  dept?: string
  ts: number
}

function summarizeEvent(parsed: SpaceEventPayload): string {
  const payload = parsed.payload ?? {}
  return (
    (payload.summary as string) ||
    (payload.subject as string) ||
    (payload.text as string) ||
    (payload.path as string) ||
    parsed.type.replace(/_/g, ' ')
  )
}

function isReusedEvent(type: string): boolean {
  return type === 'drive_reused' || type === 'research_memory_reused'
}

function parseEvent(data: string): SpaceFeedEvent | null {
  try {
    const parsed = JSON.parse(data) as SpaceEventPayload
    if (parsed.type === 'connected') return null
    const payload = parsed.payload ?? {}
    return {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      type: parsed.type,
      text: summarizeEvent(parsed),
      reused: isReusedEvent(parsed.type),
      payload,
      fromDept: typeof payload.from_dept === 'string' ? payload.from_dept : undefined,
      toDept: typeof payload.to_dept === 'string' ? payload.to_dept : undefined,
      dept:
        (typeof payload.dept === 'string' && payload.dept) ||
        (typeof payload.department === 'string' && payload.department) ||
        (typeof payload.produced_by_dept === 'string' && payload.produced_by_dept) ||
        undefined,
      ts: Date.now(),
    }
  } catch {
    return null
  }
}

/** SSE hook for GET /api/v1/spaces/{id}/events */
export function useSpaceEvents(spaceId: string | null, maxEvents = 40) {
  const [live, setLive] = useState(false)
  const [events, setEvents] = useState<SpaceFeedEvent[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!spaceId) {
      setLive(false)
      return
    }

    let es: EventSource | null = null
    setError(null)

    try {
      es = new EventSource(spaceEventsUrl(spaceId))
      es.onopen = () => setLive(true)
      es.onerror = () => {
        setLive(false)
        setError('Event stream disconnected')
      }
      es.onmessage = (event) => {
        const parsed = parseEvent(event.data)
        if (!parsed) return
        setEvents((prev) => [parsed, ...prev].slice(0, maxEvents))
      }
    } catch (err) {
      setLive(false)
      setError(err instanceof Error ? err.message : 'Failed to open event stream')
    }

    return () => {
      es?.close()
      setLive(false)
    }
  }, [spaceId, maxEvents])

  return { live, events, error }
}

export function useCommandFloor(
  events: SpaceFeedEvent[],
  snapshot?: CommandSnapshot | null,
): CommandFloorState {
  return useMemo(() => buildCommandFloorState(events, snapshot), [events, snapshot])
}

/** Recent delegation / handoff hints for Chat surface. */
export function useDelegationHints(events: SpaceFeedEvent[], limit = 3) {
  return useMemo(
    () =>
      events
        .filter((event) => event.type === 'handoff' && event.fromDept && event.toDept)
        .slice(0, limit)
        .map((event) => ({
          id: event.id,
          text: `→ ${event.toDept} Lead`,
          detail: event.text,
        })),
    [events, limit],
  )
}

export function useRecentReused(events: SpaceFeedEvent[], limit = 3) {
  return useMemo(() => events.filter((event) => event.reused).slice(0, limit), [events, limit])
}
