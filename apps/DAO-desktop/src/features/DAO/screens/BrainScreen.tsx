import { useCallback, useMemo } from 'react'
import {
  ArrowUpRight,
  BookText,
  Brain,
  FileText,
  FolderOutput,
  HardDrive,
  LayoutGrid,
  Sparkles,
} from 'lucide-react'
import { useSearchParams } from 'react-router-dom'

import { UtilChipSwitch, UtilChipSwitchItem } from '@/app/util-page-nav'
import { Button } from '@/components/ui/button'
import { Codicon } from '@/components/ui/codicon'

import {
  getSpaceReports,
  getWiki,
  listBrainEntities,
} from '../api/space-api'
import { useLeadName } from '../lib/space-lead'
import { useSpaceContext } from '../context/SpaceContext'
import { useAsync } from '../hooks/useAsync'
import {
  CompanyEmpty,
  CompanyLoading,
  CompanyScroll,
  DAOCompanyShell,
} from './_company-shell'
import { BriefingCard } from './BriefingCard'
import { BrainDrivePanel } from './brain/BrainDrivePanel'
import { BrainReportsPanel } from './brain/BrainReportsPanel'
import { BrainTruthsPanel } from './brain/BrainTruthsPanel'
import { BrainWikiPanel } from './brain/BrainWikiPanel'
import { formatRelative } from './brain/format'

export type BrainView = 'overview' | 'truths' | 'wiki' | 'drive' | 'reports'

const VIEWS: Array<{ id: BrainView; label: string; icon: typeof Brain }> = [
  { id: 'overview', label: 'Overview', icon: LayoutGrid },
  { id: 'truths', label: 'Truths', icon: Brain },
  { id: 'wiki', label: 'Wiki', icon: BookText },
  { id: 'drive', label: 'Drive', icon: HardDrive },
  { id: 'reports', label: 'Reports', icon: FileText },
]

type Accent = 'purple' | 'blue' | 'amber' | 'green'

function parseBrainView(raw: string | null): BrainView {
  if (
    raw === 'truths' ||
    raw === 'wiki' ||
    raw === 'drive' ||
    raw === 'reports' ||
    raw === 'overview'
  ) {
    return raw
  }
  return 'overview'
}

function maxTimestamp(values: Array<string | null | undefined>): string | null {
  let best = 0
  let bestIso: string | null = null
  for (const value of values) {
    if (!value) continue
    const t = new Date(value).getTime()
    if (!Number.isNaN(t) && t > best) {
      best = t
      bestIso = value
    }
  }
  return bestIso
}

function MetricTile({
  accent,
  icon: Icon,
  value,
  label,
  hint,
  onClick,
}: {
  accent: Accent
  icon: typeof Brain
  value: number
  label: string
  hint: string
  onClick: () => void
}) {
  return (
    <button className="DAO-brain-metric" data-accent={accent} onClick={onClick} type="button">
      <span className="DAO-brain-metric-icon">
        <Icon className="size-4" strokeWidth={1.7} />
      </span>
      <span className="DAO-brain-metric-body">
        <span className="DAO-brain-metric-value">{value}</span>
        <span className="DAO-brain-metric-label">{label}</span>
      </span>
      <span className="DAO-brain-metric-hint">{hint}</span>
      <ArrowUpRight className="DAO-brain-metric-arrow size-4" strokeWidth={1.8} />
    </button>
  )
}

function SectionCard({
  accent,
  icon: Icon,
  title,
  blurb,
  count,
  cta,
  onClick,
  children,
}: {
  accent: Accent
  icon: typeof Brain
  title: string
  blurb: string
  count?: number
  cta: string
  onClick: () => void
  children?: React.ReactNode
}) {
  return (
    <button className="DAO-brain-section" data-accent={accent} onClick={onClick} type="button">
      <span className="DAO-brain-section-head">
        <span className="DAO-brain-section-icon">
          <Icon className="size-4" strokeWidth={1.7} />
        </span>
        <span className="DAO-brain-section-titles">
          <span className="DAO-brain-section-title">
            {title}
            {typeof count === 'number' && count > 0 ? (
              <span className="DAO-brain-section-count">{count}</span>
            ) : null}
          </span>
          <span className="DAO-brain-section-blurb">{blurb}</span>
        </span>
        <ArrowUpRight className="DAO-brain-section-arrow size-4" strokeWidth={1.8} />
      </span>
      {children ? <span className="DAO-brain-preview">{children}</span> : null}
      <span className="DAO-brain-section-cta">{cta}</span>
    </button>
  )
}

export function BrainScreen() {
  const space = useSpaceContext()
  const leadName = useLeadName()
  const [searchParams, setSearchParams] = useSearchParams()
  const view = parseBrainView(searchParams.get('view'))

  const setView = useCallback(
    (next: BrainView) => {
      setSearchParams(next === 'overview' ? {} : { view: next }, { replace: true })
    },
    [setSearchParams],
  )

  const entities = useAsync(
    () => listBrainEntities(space.id).catch(() => ({ entities: [] })),
    [space.id],
  )
  const wiki = useAsync(() => getWiki(space.id).catch(() => null), [space.id])
  const reports = useAsync(() => getSpaceReports(space.id).catch(() => null), [space.id])

  const loadingOverview = entities.loading && wiki.loading && reports.loading
  const entityList = entities.data?.entities ?? []
  const entityCount = entityList.length
  const wikiPages = wiki.data?.stats.pages ?? 0
  const wikiPageList = wiki.data?.pages ?? []
  const briefings = reports.data?.briefings ?? []
  const briefingCount = briefings.length
  const writebacks = reports.data?.writebacks ?? []
  const writebackCount = writebacks.length
  const totalKnowledge = entityCount + wikiPages + briefingCount + writebackCount

  const lastActivity = useMemo(
    () =>
      maxTimestamp([
        ...entityList.map((e) => e.updated_at),
        ...wikiPageList.map((p) => p.updated_at),
        ...briefings.map((b) => b.generated_at),
        ...writebacks.map((w) => w.created_at),
      ]),
    [entityList, wikiPageList, briefings, writebacks],
  )

  const topTruths = useMemo(
    () =>
      [...entityList]
        .sort((a, b) => (b.confidence ?? 0) - (a.confidence ?? 0))
        .slice(0, 3),
    [entityList],
  )
  const topPages = wikiPageList.slice(0, 3)
  const recentWritebacks = writebacks.slice(0, 3)
  const latestBriefing = briefings[0]

  const isEmpty = useMemo(
    () =>
      !loadingOverview &&
      entityCount === 0 &&
      !wiki.data?.initialized &&
      briefingCount === 0 &&
      writebackCount === 0,
    [loadingOverview, entityCount, wiki.data?.initialized, briefingCount, writebackCount],
  )

  function refreshAll() {
    entities.reload()
    wiki.reload()
    reports.reload()
  }

  const loading = entities.loading || wiki.loading || reports.loading

  return (
    <DAOCompanyShell
      description="Company knowledge — compiled truths, interlinked wiki, briefings, and worker artifacts."
      filters={
        <UtilChipSwitch aria-label="Brain views">
          {VIEWS.map(({ id, label, icon: Icon }) => (
            <UtilChipSwitchItem active={view === id} key={id} onClick={() => setView(id)}>
              <Icon className="size-3.5" strokeWidth={1.6} />
              {label}
            </UtilChipSwitchItem>
          ))}
        </UtilChipSwitch>
      }
      headerTrailing={
        <Button
          aria-label="Refresh"
          className="text-(--ui-text-tertiary) hover:bg-transparent hover:text-foreground"
          disabled={loading}
          onClick={refreshAll}
          size="sm"
          type="button"
          variant="ghost"
        >
          <Codicon name="refresh" size="0.875rem" spinning={loading} />
          Refresh
        </Button>
      }
      searchHidden
      title="Brain"
    >
      <CompanyScroll>
        {view === 'overview' ? (
          loadingOverview ? (
            <CompanyLoading label="Loading Brain…" />
          ) : isEmpty ? (
            <CompanyEmpty
              description={`Everything the company learns lands here: compiled truths, wiki pages, briefings, and Drive writebacks. Ask ${leadName} to start capturing knowledge.`}
              leadName={leadName}
              title="Brain is empty"
            />
          ) : (
            <div className="DAO-brain">
              <section className="DAO-brain-hero">
                <span aria-hidden="true" className="DAO-brain-hero-glow" />
                <span className="DAO-brain-hero-glyph">
                  <Brain className="size-6" strokeWidth={1.6} />
                </span>
                <div className="DAO-brain-hero-copy">
                  <h2 className="DAO-brain-hero-title">Company Brain</h2>
                  <p className="DAO-brain-hero-sub">
                    Compiled truths, an interlinked wiki, briefings, and every artifact{' '}
                    {leadName} produces — one searchable memory.
                  </p>
                </div>
                <div className="DAO-brain-hero-stat">
                  <span className="DAO-brain-hero-stat-value">{totalKnowledge}</span>
                  <span className="DAO-brain-hero-stat-label">knowledge items</span>
                  {lastActivity ? (
                    <span className="DAO-brain-hero-fresh">
                      <Sparkles className="size-3" strokeWidth={1.8} />
                      updated {formatRelative(lastActivity)}
                    </span>
                  ) : null}
                </div>
              </section>

              <div className="DAO-brain-metrics">
                <MetricTile
                  accent="purple"
                  hint="reused in preflight"
                  icon={Brain}
                  label="compiled truths"
                  onClick={() => setView('truths')}
                  value={entityCount}
                />
                <MetricTile
                  accent="blue"
                  hint="entities & concepts"
                  icon={BookText}
                  label="wiki pages"
                  onClick={() => setView('wiki')}
                  value={wikiPages}
                />
                <MetricTile
                  accent="amber"
                  hint="from your AI Lead"
                  icon={FileText}
                  label="briefings"
                  onClick={() => setView('reports')}
                  value={briefingCount}
                />
                <MetricTile
                  accent="green"
                  hint="written to Drive"
                  icon={FolderOutput}
                  label="artifacts"
                  onClick={() => setView('reports')}
                  value={writebackCount}
                />
              </div>

              <p className="DAO-util-section-label">Explore knowledge</p>
              <div className="DAO-brain-grid">
                <SectionCard
                  accent="purple"
                  blurb="Durable facts for never-do-twice reuse"
                  count={entityCount}
                  cta="Open truths"
                  icon={Brain}
                  onClick={() => setView('truths')}
                  title="Compiled truths"
                >
                  {topTruths.length > 0 ? (
                    topTruths.map((truth) => (
                      <span className="DAO-brain-preview-row" key={truth.slug}>
                        <span className="DAO-brain-preview-text">{truth.title}</span>
                        {typeof truth.confidence === 'number' ? (
                          <span className="DAO-brain-confidence" title={`${Math.round(truth.confidence * 100)}% confidence`}>
                            <span
                              className="DAO-brain-confidence-fill"
                              style={{ width: `${Math.round(truth.confidence * 100)}%` }}
                            />
                          </span>
                        ) : null}
                      </span>
                    ))
                  ) : (
                    <span className="DAO-brain-preview-empty">No truths compiled yet.</span>
                  )}
                </SectionCard>

                <SectionCard
                  accent="blue"
                  blurb="Interlinked entities, concepts & sources"
                  count={wikiPages}
                  cta="Open wiki"
                  icon={BookText}
                  onClick={() => setView('wiki')}
                  title="Company wiki"
                >
                  {topPages.length > 0 ? (
                    topPages.map((page) => (
                      <span className="DAO-brain-preview-row" key={page.page_key}>
                        <span className="DAO-brain-preview-text">{page.title}</span>
                        {page.updated_at ? (
                          <span className="DAO-brain-preview-meta">{formatRelative(page.updated_at)}</span>
                        ) : null}
                      </span>
                    ))
                  ) : (
                    <span className="DAO-brain-preview-empty">No wiki pages yet.</span>
                  )}
                </SectionCard>

                <SectionCard
                  accent="green"
                  blurb="Files, uploads & worker writebacks"
                  count={writebackCount}
                  cta="Browse Drive"
                  icon={HardDrive}
                  onClick={() => setView('drive')}
                  title="Drive"
                >
                  {recentWritebacks.length > 0 ? (
                    recentWritebacks.map((item) => (
                      <span className="DAO-brain-preview-row" key={item.object_id}>
                        <span className="DAO-brain-preview-text">
                          {item.path.split('/').pop() ?? item.path}
                        </span>
                        {item.produced_by_dept ? (
                          <span className="DAO-brain-preview-meta">{item.produced_by_dept}</span>
                        ) : null}
                      </span>
                    ))
                  ) : (
                    <span className="DAO-brain-preview-empty">No artifacts yet.</span>
                  )}
                </SectionCard>

                <SectionCard
                  accent="amber"
                  blurb="Morning briefings & space pulse"
                  count={briefingCount}
                  cta="Open reports"
                  icon={FileText}
                  onClick={() => setView('reports')}
                  title="Reports"
                >
                  {latestBriefing ? (
                    <span className="DAO-brain-preview-row">
                      <span className="DAO-brain-preview-text">Latest briefing</span>
                      <span className="DAO-brain-preview-meta">
                        {formatRelative(latestBriefing.generated_at)}
                      </span>
                    </span>
                  ) : (
                    <span className="DAO-brain-preview-empty">No briefings yet.</span>
                  )}
                </SectionCard>
              </div>

              {latestBriefing ? (
                <section className="DAO-company-card">
                  <p className="DAO-util-section-label mb-3">Latest briefing</p>
                  <BriefingCard
                    generatedAt={latestBriefing.generated_at}
                    leadName={leadName}
                    markdown={latestBriefing.markdown}
                  />
                </section>
              ) : null}
            </div>
          )
        ) : null}

        {view === 'truths' ? <BrainTruthsPanel /> : null}
        {view === 'wiki' ? <BrainWikiPanel /> : null}
        {view === 'drive' ? <BrainDrivePanel /> : null}
        {view === 'reports' ? <BrainReportsPanel /> : null}
      </CompanyScroll>
    </DAOCompanyShell>
  )
}
