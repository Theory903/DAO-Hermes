import { useEffect, useState } from 'react'

import { getSpaceBySlug } from '../api/space-api'
import type { DAOSpace } from '../api/types'

export function useSpace(slug: string) {
  const [space, setSpace] = useState<DAOSpace | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    getSpaceBySlug(slug)
      .then(s => {
        if (!cancelled) {
          setSpace(s)
          setError(null)
        }
      })
      .catch(err => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load space')
          setSpace(null)
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [slug])

  return { space, loading, error, spaceId: space?.id ?? null }
}
