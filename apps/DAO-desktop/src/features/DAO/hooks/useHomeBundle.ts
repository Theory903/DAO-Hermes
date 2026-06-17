import { useEffect } from 'react'

import { getHomeBundle } from '../api/space-api'
import { useAsync } from './useAsync'
import { useSpaceEvents } from './useSpaceEvents'

const HOME_RELOAD_EVENTS = new Set([
  'hitl_resolved',
  'hitl_pending',
  'drive_writeback',
  'drive_reused',
  'handoff',
  'workflow_run',
])

/** Home 6.0 bundle with SSE-driven refresh. */
export function useHomeBundle(spaceId: string) {
  const result = useAsync(() => getHomeBundle(spaceId), [spaceId])
  const { events } = useSpaceEvents(spaceId)

  useEffect(() => {
    if (!events.length) return
    const latest = events[0]
    if (HOME_RELOAD_EVENTS.has(latest.type)) {
      result.reload()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [events])

  return result
}
