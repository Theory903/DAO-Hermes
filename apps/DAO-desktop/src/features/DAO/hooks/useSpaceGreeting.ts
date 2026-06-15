import { useEffect, useMemo, useState } from 'react'

import { fetchAuthMe } from '@/lib/DAO-api'

import {
  readStoredChatGreeting,
  resolveSpaceGreeting,
  type SpaceGreeting,
} from '../lib/space-greeting'
import { useAsync } from './useAsync'

export function useSpaceGreeting(
  spaceId: string,
  leadName: string,
  briefing?: { greeting?: string | null; greeting_subline?: string | null } | null,
): SpaceGreeting {
  const me = useAsync(() => fetchAuthMe().catch(() => null), [])
  const [tick, setTick] = useState(0)

  useEffect(() => {
    const bump = () => setTick(v => v + 1)
    const onStorage = (event: StorageEvent) => {
      if (!event.key?.startsWith('DAO_home_greeting')) {
        return
      }
      bump()
    }
    window.addEventListener('storage', onStorage)
    window.addEventListener('DAO-greeting-updated', bump)
    return () => {
      window.removeEventListener('storage', onStorage)
      window.removeEventListener('DAO-greeting-updated', bump)
    }
  }, [])

  return useMemo(() => {
    const now = new Date()
    void tick
    const profile = me.data as {
      display_name?: string
      email?: string
      preferences?: { greeting?: { use_chat_opener?: boolean } }
    } | null
    return resolveSpaceGreeting({
      displayName: profile?.display_name ?? profile?.email?.split('@')[0],
      leadName,
      spaceId,
      now,
      chatGreeting: readStoredChatGreeting(spaceId, now),
      briefingGreeting: briefing?.greeting,
      briefingSubline: briefing?.greeting_subline,
      greetingPrefs: profile?.preferences?.greeting,
    })
  }, [briefing?.greeting, briefing?.greeting_subline, leadName, me.data, spaceId, tick])
}
