import { useCallback, useEffect, useState } from 'react'

export function useAsync<T>(loader: () => Promise<T>, deps: readonly unknown[]) {
  const [data, setData] = useState<T | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [version, setVersion] = useState(0)

  const reload = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setData(await loader())
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Request failed')
      setData(null)
    } finally {
      setLoading(false)
    }
  }, deps)

  useEffect(() => {
    void reload()
  }, [reload, version])

  return { data, loading, error, reload: () => setVersion(v => v + 1) }
}
