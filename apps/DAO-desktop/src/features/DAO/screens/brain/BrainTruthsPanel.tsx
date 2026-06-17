import { useMemo, useState } from 'react'
import { Check, Copy, Search } from 'lucide-react'

import { UtilSideNavItem } from '@/app/util-page-nav'
import { cn } from '@/lib/utils'

import { getBrainEntity, listBrainEntities, type BrainEntitySummary } from '../../api/space-api'
import { useLeadName } from '../../lib/space-lead'
import { useSpaceContext } from '../../context/SpaceContext'
import { useAsync } from '../../hooks/useAsync'
import { CompanyEmpty, CompanyError, CompanyLoading } from '../_company-shell'
import { CompanyMarkdown } from './CompanyMarkdown'
import { formatRelative } from './format'
import { BRAIN_EMPTY } from './brain-copy'
import { BrainPanelGuide } from './BrainPanelGuide'
import { ObjectPrimitives } from '../../components/objects/ObjectPrimitives'

function formatConfidence(value?: number): string {
  if (value == null) return '—'
  return `${Math.round(value * 100)}%`
}

function confidenceTone(value?: number): 'high' | 'mid' | 'low' {
  if (value == null) return 'low'
  if (value > 0.7) return 'high'
  if (value > 0.4) return 'mid'
  return 'low'
}

function ConfidenceBar({ value }: { value?: number }) {
  if (value == null) return null
  const pct = Math.round(value * 100)
  return (
    <span className="DAO-brain-confidence" data-tone={confidenceTone(value)} title={`${pct}% confidence`}>
      <span className="DAO-brain-confidence-fill" style={{ width: `${pct}%` }} />
    </span>
  )
}

export function BrainTruthsPanel() {
  const space = useSpaceContext()
  const leadName = useLeadName()
  const [selectedSlug, setSelectedSlug] = useState<string | null>(null)
  const [filter, setFilter] = useState('')
  const [copied, setCopied] = useState(false)
  const entities = useAsync(() => listBrainEntities(space.id), [space.id])
  const list = entities.data?.entities ?? []

  const sorted = useMemo(
    () => [...list].sort((a, b) => (b.confidence ?? 0) - (a.confidence ?? 0)),
    [list],
  )
  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase()
    if (!q) return sorted
    return sorted.filter(
      (e) => e.title.toLowerCase().includes(q) || e.slug.toLowerCase().includes(q),
    )
  }, [sorted, filter])

  const active = selectedSlug ?? filtered[0]?.slug ?? null
  const detail = useAsync(
    () => (active ? getBrainEntity(space.id, active).catch(() => null) : Promise.resolve(null)),
    [space.id, active],
  )

  function selectEntity(entity: BrainEntitySummary) {
    setSelectedSlug(entity.slug)
    setCopied(false)
  }

  async function copyTruth() {
    if (!detail.data?.compiled_truth) return
    try {
      await navigator.clipboard.writeText(detail.data.compiled_truth)
      setCopied(true)
      setTimeout(() => setCopied(false), 1600)
    } catch {
      /* clipboard unavailable */
    }
  }

  if (entities.loading) {
    return <CompanyLoading label="Loading saved facts…" />
  }

  if (entities.error) {
    return <CompanyError message={entities.error} onRetry={entities.reload} />
  }

  if (list.length === 0) {
    return (
      <div className="DAO-brain-panel-stack">
        <BrainPanelGuide area="truths" />
        <CompanyEmpty
          description={BRAIN_EMPTY.description(leadName)}
          leadName={leadName}
          steps={[BRAIN_EMPTY.steps(leadName)[0]]}
          title="No saved facts yet"
        />
      </div>
    )
  }

  return (
    <div className="DAO-brain-panel-stack">
      <BrainPanelGuide area="truths" />
      <div className="DAO-company-split-layout DAO-util-page-content--tight h-full min-h-0">
      <aside aria-label="Saved facts" className="DAO-company-split-sidebar">
        <div className="DAO-company-split-sidebar-head">
          <p className="DAO-company-split-sidebar-label">Facts</p>
          <p className="DAO-company-split-sidebar-meta">
            {filter.trim() ? `${filtered.length} of ${list.length}` : `${list.length} total`}
          </p>
        </div>
        <div className="relative shrink-0 px-2 pb-2">
          <Search className="pointer-events-none absolute left-5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            className="w-full rounded-md border border-border/60 bg-background/40 py-2 pl-8 pr-3 text-sm outline-none focus:border-primary/40"
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Search facts…"
            type="search"
            value={filter}
          />
        </div>
        <div className="DAO-company-split-list DAO-util-scrollbar">
          {entities.error ? (
            <CompanyError message={entities.error} onRetry={entities.reload} />
          ) : filtered.length === 0 ? (
            <p className="px-2 text-sm text-muted-foreground">No facts match your search.</p>
          ) : (
            filtered.map((entity) => (
              <UtilSideNavItem
                active={active === entity.slug}
                hint={entity.slug}
                key={entity.slug}
                onClick={() => selectEntity(entity)}
              >
                <span className="flex w-full flex-col gap-1.5">
                  <span className="flex items-center justify-between gap-2">
                    <span className="min-w-0 truncate font-medium">{entity.title}</span>
                    {typeof entity.confidence === 'number' ? (
                      <span className="shrink-0 font-mono text-[0.625rem] text-muted-foreground">
                        {formatConfidence(entity.confidence)}
                      </span>
                    ) : null}
                  </span>
                  <ConfidenceBar value={entity.confidence} />
                </span>
              </UtilSideNavItem>
            ))
          )}
        </div>
      </aside>

      <main className="DAO-company-split-main">
        <div className="DAO-company-split-detail DAO-util-scrollbar">
          {!active ? (
            <CompanyEmpty
              description="Choose a fact from the list to read the full summary."
              title="Select a fact"
            />
          ) : detail.loading ? (
            <CompanyLoading label="Loading truth…" />
          ) : detail.error ? (
            <CompanyError message={detail.error} onRetry={detail.reload} />
          ) : detail.data ? (
            <article className="DAO-company-detail-card">
              <header className="DAO-company-detail-head">
                <div className="min-w-0">
                  <h2 className="DAO-company-detail-title">{detail.data.title}</h2>
                  <p className="DAO-company-detail-slug">{detail.data.slug}</p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <span
                    className={cn(
                      'DAO-company-pill',
                      confidenceTone(detail.data.confidence) === 'high' && 'DAO-company-pill--reused',
                    )}
                  >
                    {formatConfidence(detail.data.confidence)} confidence
                  </span>
                  {detail.data.compiled_truth ? (
                    <button
                      aria-label={copied ? 'Copied' : 'Copy truth'}
                      className="DAO-brain-copy-btn"
                      onClick={copyTruth}
                      type="button"
                    >
                      {copied ? (
                        <Check className="size-3.5" strokeWidth={2} />
                      ) : (
                        <Copy className="size-3.5" strokeWidth={1.8} />
                      )}
                    </button>
                  ) : null}
                </div>
              </header>

              {detail.data.updated_at ? (
                <p className="DAO-company-detail-meta">
                  Updated {formatRelative(detail.data.updated_at)}
                </p>
              ) : null}

              <section>
                <h3 className="DAO-util-section-label">Summary</h3>
                {detail.data.compiled_truth ? (
                  <CompanyMarkdown content={detail.data.compiled_truth} />
                ) : (
                  <p className="DAO-company-detail-prose text-muted-foreground">
                    Dream Cycle will compile this entity overnight.
                  </p>
                )}
              </section>

              {detail.data.drive_refs?.length ? (
                <section>
                  <h3 className="DAO-util-section-label">Related files</h3>
                  <div className="DAO-brain-chip-row">
                    {detail.data.drive_refs.map((ref) => (
                      <span className="DAO-brain-chip" key={ref}>
                        {ref.split('/').pop() ?? ref}
                      </span>
                    ))}
                  </div>
                </section>
              ) : null}

              {detail.data.id ? (
                <section>
                  <h3 className="DAO-util-section-label">Company memory</h3>
                  <ObjectPrimitives
                    missingLabel="Run backfill or wait for Dream Cycle to link this fact."
                    sourceId={detail.data.id}
                    sourceTable="brain_entities"
                    spaceId={space.id}
                  />
                </section>
              ) : null}
            </article>
          ) : (
            <CompanyEmpty
              description="This entity could not be loaded."
              title="Unavailable"
            />
          )}
        </div>
      </main>
      </div>
    </div>
  )
}
