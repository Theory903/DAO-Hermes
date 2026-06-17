import { useMemo, useState } from 'react'
import { BookText, ChevronRight, FolderOpen, History, List, Search } from 'lucide-react'
import { Link } from 'react-router-dom'

import { UtilChipSwitch, UtilChipSwitchItem, UtilSideNavItem } from '@/app/util-page-nav'

import { getWiki, getWikiPage, type WikiPageSummary } from '../../api/space-api'
import { useLeadName } from '../../lib/space-lead'
import { useSpaceContext } from '../../context/SpaceContext'
import { useAsync } from '../../hooks/useAsync'
import { brainRoute } from '../../routes'
import { CompanyEmpty, CompanyError, CompanyLoading } from '../_company-shell'
import { CompanyMarkdown } from './CompanyMarkdown'
import { formatRelative } from './format'
import { BrainPanelGuide } from './BrainPanelGuide'
type WikiTab = 'browse' | 'index' | 'activity'

function PageRow({
  page,
  active,
  onSelect,
}: {
  page: WikiPageSummary
  active: boolean
  onSelect: () => void
}) {
  return (
    <UtilSideNavItem active={active} hint={page.page_key} onClick={onSelect}>
      <span className="flex w-full flex-col gap-0.5 text-left">
        <span className="truncate font-medium">{page.title}</span>
        {page.summary ? (
          <span className="line-clamp-2 text-[0.6875rem] text-muted-foreground">{page.summary}</span>
        ) : null}
        {page.updated_at ? (
          <span className="font-mono text-[0.625rem] text-muted-foreground">{formatRelative(page.updated_at)}</span>
        ) : null}
      </span>
    </UtilSideNavItem>
  )
}

export function BrainWikiPanel() {
  const space = useSpaceContext()
  const leadName = useLeadName()
  const [tab, setTab] = useState<WikiTab>('browse')
  const [selectedKey, setSelectedKey] = useState<string | null>(null)
  const [filter, setFilter] = useState('')

  const snapshot = useAsync(() => getWiki(space.id), [space.id])
  const pageDetail = useAsync(
    () =>
      selectedKey
        ? getWikiPage(space.id, selectedKey).catch(() => null)
        : Promise.resolve(null),
    [space.id, selectedKey],
  )

  const wiki = snapshot.data

  const filteredSections = useMemo(() => {
    if (!wiki) return []
    const q = filter.trim().toLowerCase()
    if (!q) return wiki.sections
    return wiki.sections
      .map((section) => ({
        ...section,
        pages: section.pages.filter(
          (p) =>
            p.title.toLowerCase().includes(q) ||
            p.page_key.toLowerCase().includes(q) ||
            (p.summary ?? '').toLowerCase().includes(q),
        ),
      }))
      .filter((s) => s.pages.length > 0)
  }, [wiki, filter])

  if (snapshot.loading) {
    return <CompanyLoading label="Loading wiki…" />
  }

  if (snapshot.error) {
    return <CompanyError message={snapshot.error} onRetry={snapshot.reload} />
  }

  if (!wiki?.initialized) {
    return (
      <div className="DAO-brain-panel-stack">
        <BrainPanelGuide area="wiki" />
        <CompanyEmpty
          description={`${leadName} creates linked wiki pages as you research. They appear here once the first page is saved.`}
          leadName={leadName}
          title="No wiki pages yet"
        />
      </div>
    )
  }

  return (
    <div className="DAO-brain-panel-stack">
      <BrainPanelGuide area="wiki" />
      <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <UtilChipSwitch aria-label="Wiki views">
          <UtilChipSwitchItem active={tab === 'browse'} onClick={() => setTab('browse')}>
            <List className="size-3.5" strokeWidth={1.6} />
            Browse
          </UtilChipSwitchItem>
          <UtilChipSwitchItem active={tab === 'index'} onClick={() => setTab('index')}>
            <BookText className="size-3.5" strokeWidth={1.6} />
            Index
          </UtilChipSwitchItem>
          <UtilChipSwitchItem active={tab === 'activity'} onClick={() => setTab('activity')}>
            <History className="size-3.5" strokeWidth={1.6} />
            Activity
          </UtilChipSwitchItem>
        </UtilChipSwitch>
        <Link
          className="ml-auto inline-flex items-center gap-1 text-xs text-muted-foreground no-underline hover:text-primary"
          to={brainRoute(space.slug, { view: 'drive', path: '/wiki/' })}
        >
          <FolderOpen className="size-3.5" strokeWidth={1.6} />
          Open in Drive
        </Link>
      </div>

      {tab === 'index' ? (
        <section className="DAO-company-card">
          {wiki.index_markdown ? (
            <CompanyMarkdown content={wiki.index_markdown} />
          ) : (
            <p className="text-sm text-muted-foreground">No index.md yet.</p>
          )}
        </section>
      ) : null}

      {tab === 'activity' ? (
        <section className="DAO-company-card">
          <p className="DAO-util-section-label">Recent log</p>
          {wiki.recent_log.length === 0 ? (
            <p className="mt-2 text-sm text-muted-foreground">No log entries yet.</p>
          ) : (
            <ul className="mt-3 space-y-2">
              {wiki.recent_log.map((line, i) => (
                <li
                  key={`${i}-${line.slice(0, 24)}`}
                  className="rounded-lg border border-border/60 bg-background/40 px-3 py-2 font-mono text-[11px] text-muted-foreground"
                >
                  {line}
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : null}

      {tab === 'browse' ? (
        <div className="DAO-company-split-layout DAO-util-page-content--tight min-h-[420px]">
          <aside aria-label="Wiki pages" className="DAO-company-split-sidebar">
            <div className="DAO-company-split-sidebar-head">
              <p className="DAO-company-split-sidebar-label">Pages</p>
              <p className="DAO-company-split-sidebar-meta">{wiki.stats.pages} total</p>
            </div>
            <div className="relative shrink-0 px-2 pb-2">
              <Search className="pointer-events-none absolute left-5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <input
                className="w-full rounded-md border border-border/60 bg-background/40 py-2 pl-8 pr-3 text-sm outline-none focus:border-primary/40"
                onChange={(e) => setFilter(e.target.value)}
                placeholder="Filter pages…"
                type="search"
                value={filter}
              />
            </div>
            <div className="DAO-company-split-list DAO-util-scrollbar">
              {filteredSections.length === 0 ? (
                <p className="px-2 text-sm text-muted-foreground">No pages match.</p>
              ) : (
                filteredSections.map((section) => (
                  <div key={section.id} className="mb-3">
                    <p className="DAO-util-section-label mb-1 px-2">{section.label}</p>
                    {section.pages.map((page) => (
                      <PageRow
                        key={page.page_key}
                        page={page}
                        active={selectedKey === page.page_key}
                        onSelect={() => setSelectedKey(page.page_key)}
                      />
                    ))}
                  </div>
                ))
              )}
            </div>
          </aside>

          <main className="DAO-company-split-main">
            <div className="DAO-company-split-detail DAO-util-scrollbar">
              {!selectedKey ? (
                <div className="flex h-full min-h-[280px] flex-col items-center justify-center gap-2 text-center">
                  <ChevronRight className="size-8 rotate-180 text-muted-foreground opacity-40" />
                  <p className="text-sm text-muted-foreground">Select a page to read</p>
                </div>
              ) : pageDetail.loading ? (
                <CompanyLoading label="Loading page…" />
              ) : pageDetail.data ? (
                <article className="DAO-company-detail-card">
                  <header className="DAO-company-detail-head">
                    <div>
                      <h2 className="DAO-company-detail-title">{pageDetail.data.title}</h2>
                      <p className="DAO-company-detail-slug">{pageDetail.data.path}</p>
                    </div>
                    {pageDetail.data.updated_at ? (
                      <time className="font-mono text-[11px] text-muted-foreground">
                        {formatRelative(pageDetail.data.updated_at)}
                      </time>
                    ) : null}
                  </header>
                  <CompanyMarkdown content={pageDetail.data.body || pageDetail.data.content} />
                </article>
              ) : (
                <CompanyEmpty description="This page could not be loaded." title="Unavailable" />
              )}
            </div>
          </main>
        </div>
      ) : null}
      </div>
    </div>
  )
}
