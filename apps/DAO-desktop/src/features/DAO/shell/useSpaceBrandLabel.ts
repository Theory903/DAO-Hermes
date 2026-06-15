import { useEffect, useState } from 'react'

import { useAuth } from '@/features/auth'
import { listSpaces } from '@/lib/DAO-api'

/** Resolve a human-readable Space name for the topbar brand. */
export function useSpaceBrandLabel(fallback = 'Space'): string {
  const { spaceId, spaceSlug } = useAuth()
  const [name, setName] = useState<string | null>(null)

  useEffect(() => {
    if (!spaceId) {
      setName(null)
      return
    }

    let cancelled = false

    listSpaces()
      .then(rows => {
        if (cancelled) return
        const match = rows.find(row => row.id === spaceId)
        setName(match?.name ?? null)
      })
      .catch(() => {
        if (!cancelled) setName(null)
      })

    return () => {
      cancelled = true
    }
  }, [spaceId])

  return name ?? spaceSlug ?? fallback
}
