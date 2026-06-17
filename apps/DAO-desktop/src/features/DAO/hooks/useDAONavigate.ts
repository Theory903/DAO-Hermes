import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'

import { spaceEventsUrl } from '../api/space-api'
import { spaceRoute, brainRoute } from '../routes'

type NavigatePayload = {
  screen?: string
  hitl_id?: string
  drive_path?: string
  href?: string
}

/** Follow Jarvis `DAO_navigate` tool via Command Center SSE (`ui.navigate`). */
export function useDAONavigate(spaceId: string | null, slug: string | null) {
  const navigate = useNavigate()

  useEffect(() => {
    if (!spaceId || !slug) return

    let es: EventSource | null = null
    try {
      es = new EventSource(spaceEventsUrl(spaceId))
      es.onmessage = (event) => {
        try {
          const parsed = JSON.parse(event.data) as { type?: string; payload?: NavigatePayload }
          if (parsed.type !== 'ui.navigate') return
          const payload = parsed.payload ?? {}
          const screen = (payload.screen ?? '').toLowerCase()

          if (payload.href) {
            navigate(payload.href)
            return
          }

          if (screen === 'chat') {
            navigate('/')
            return
          }

          if (screen === 'wiki' || screen === 'reports' || screen === 'drive' || screen === 'brain' || screen === 'memory') {
            const view =
              screen === 'brain' ? 'truths' : screen === 'memory' ? 'search' : screen
            navigate(
              brainRoute(slug, {
                view: view as 'wiki' | 'reports' | 'drive' | 'truths',
                path: payload.drive_path,
              }),
            )
            return
          }

          if (screen === 'command') {
            navigate(`${spaceRoute(slug, 'work')}?view=operations`)
            return
          }

          if (screen === 'org') {
            navigate(`${spaceRoute(slug, 'control')}?section=organization`)
            return
          }

          const base = spaceRoute(slug, screen === 'home' ? '' : screen)
          const params = new URLSearchParams()
          if (payload.hitl_id) params.set('hitl', payload.hitl_id)
          if (payload.drive_path) params.set('path', payload.drive_path)
          const qs = params.toString()
          navigate(qs ? `${base}?${qs}` : base)
        } catch {
          // ignore malformed events
        }
      }
    } catch {
      // EventSource unavailable
    }

    return () => {
      es?.close()
    }
  }, [navigate, slug, spaceId])
}
