import { useEffect, useState } from 'react'

import { Button } from '@/components/ui/button'

import { mergeSpaceObjects, searchMemory } from '../../api/space-api'
import type { MemorySearchHit } from '../../api/types'
import { CompanyBanner } from '../../screens/_company-shell'

type ObjectMergeFormProps = {
  spaceId: string
  objectId: string
  objectTitle: string
  onMerged: (survivorId: string) => void
}

export function ObjectMergeForm({ spaceId, objectId, objectTitle, onMerged }: ObjectMergeFormProps) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [debounced, setDebounced] = useState('')
  const [hits, setHits] = useState<MemorySearchHit[]>([])
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(query.trim()), 250)
    return () => window.clearTimeout(timer)
  }, [query])

  useEffect(() => {
    if (!open) return
    let cancelled = false
    setLoading(true)
    void searchMemory(spaceId, { q: debounced || undefined, limit: 12 })
      .then((res) => {
        if (cancelled) return
        setHits(res.objects.filter((hit) => hit.id !== objectId))
      })
      .catch(() => {
        if (!cancelled) setHits([])
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [spaceId, debounced, open, objectId])

  async function mergeInto(survivor: MemorySearchHit) {
    setBusy(true)
    setError(null)
    setMessage(null)
    try {
      const res = await mergeSpaceObjects(spaceId, objectId, survivor.id)
      setMessage(`Merged into “${survivor.title}”.`)
      onMerged(res.survivor_id)
      setOpen(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Merge failed')
    } finally {
      setBusy(false)
    }
  }

  if (!open) {
    return (
      <section className="DAO-object-section">
        <Button onClick={() => setOpen(true)} size="sm" type="button" variant="outline">
          Merge duplicate…
        </Button>
      </section>
    )
  }

  return (
    <section className="DAO-object-section DAO-object-merge">
      <h3 className="DAO-util-section-label">Merge into survivor</h3>
      <p className="DAO-object-merge__hint">
        Archive “{objectTitle}” and keep one canonical object. Requires admin role.
      </p>
      {error ? <CompanyBanner tone="warn">{error}</CompanyBanner> : null}
      {message ? <CompanyBanner tone="ok">{message}</CompanyBanner> : null}
      <input
        className="DAO-object-create-input"
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search survivor object…"
        type="search"
        value={query}
      />
      <ul className="DAO-object-merge__hits">
        {loading ? <li className="DAO-object-empty">Searching…</li> : null}
        {!loading && hits.length === 0 ? (
          <li className="DAO-object-empty">No other objects match.</li>
        ) : null}
        {hits.map((hit) => (
          <li key={hit.id}>
            <button
              className="DAO-object-merge__pick"
              disabled={busy}
              onClick={() => void mergeInto(hit)}
              type="button"
            >
              <span className="DAO-object-merge__pick-title">{hit.title}</span>
              <span className="DAO-company-pill">{hit.object_type}</span>
            </button>
          </li>
        ))}
      </ul>
      <Button disabled={busy} onClick={() => setOpen(false)} size="sm" type="button" variant="ghost">
        Cancel
      </Button>
    </section>
  )
}
