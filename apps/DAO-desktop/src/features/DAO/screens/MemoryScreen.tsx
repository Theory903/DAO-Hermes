import { useCallback, useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { BookText, Brain, FileText, HardDrive, Search, Sparkles } from 'lucide-react'

import { UtilChipSwitch, UtilChipSwitchItem } from '@/app/util-page-nav'

import { getMemoryTimeline, searchMemory } from '../api/space-api'
import type { MemorySearchHit } from '../api/types'
import { ObjectDetailSheet } from '../components/objects/ObjectDetailSheet'
import { useSpaceContext } from '../context/SpaceContext'
import { useAsync } from '../hooks/useAsync'
import { BRAIN_VIEW_COPY } from './brain/brain-copy'
import { BrainDrivePanel } from './brain/BrainDrivePanel'
import { BrainReportsPanel } from './brain/BrainReportsPanel'
import { BrainTruthsPanel } from './brain/BrainTruthsPanel'
import { BrainWikiPanel } from './brain/BrainWikiPanel'
import {
  CompanyEmpty,
  CompanyError,
  CompanyLoading,
  CompanyScroll,
  DAOCompanyShell,
} from './_company-shell'

type MemoryView = 'search' | 'truths' | 'wiki' | 'drive' | 'reports' | 'timeline'

const TYPE_FILTERS = [
  { key: '', label: 'All' },
  { key: 'document', label: 'Documents' },
  { key: 'project', label: 'Projects' },
  { key: 'decision', label: 'Decisions' },
  { key: 'event', label: 'Events' },
] as const

function parseMemoryView(raw: string | null): MemoryView {
  if (
    raw === 'truths' ||
    raw === 'wiki' ||
    raw === 'drive' ||
    raw === 'reports' ||
    raw === 'timeline'
  ) {
    return raw
  }
  return 'search'
}

export function MemoryScreen() {
  const space = useSpaceContext()
  const [searchParams, setSearchParams] = useSearchParams()
  const view = parseMemoryView(searchParams.get('view'))
  const objectParam = searchParams.get('object')

  const [query, setQuery] = useState('')
  const [debounced, setDebounced] = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const [selected, setSelected] = useState<MemorySearchHit | null>(null)

  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(query.trim()), 250)
    return () => window.clearTimeout(timer)
  }, [query])

  useEffect(() => {
    if (!objectParam) return
    setSelected({
      id: objectParam,
      space_id: space.id,
      object_type: 'object',
      title: 'Object',
      status: 'active',
    })
  }, [objectParam, space.id])

  const setView = useCallback(
    (next: MemoryView) => {
      const params = new URLSearchParams(searchParams)
      if (next === 'search') params.delete('view')
      else params.set('view', next)
      setSearchParams(params, { replace: true })
    },
    [searchParams, setSearchParams],
  )

  const openObject = useCallback(
    (hit: MemorySearchHit) => {
      setSelected(hit)
      const params = new URLSearchParams(searchParams)
      params.set('object', hit.id)
      setSearchParams(params, { replace: true })
    },
    [searchParams, setSearchParams],
  )

  const closeObject = useCallback(
    (open: boolean) => {
      if (open) return
      setSelected(null)
      const params = new URLSearchParams(searchParams)
      params.delete('object')
      setSearchParams(params, { replace: true })
    },
    [searchParams, setSearchParams],
  )

  const search = useAsync(
    () =>
      view === 'search'
        ? searchMemory(space.id, {
            q: debounced || undefined,
            object_type: typeFilter || undefined,
            limit: 40,
          })
        : Promise.resolve({ objects: [] as MemorySearchHit[], q: '' }),
    [space.id, debounced, typeFilter, view],
  )

  const timeline = useAsync(
    () =>
      view === 'timeline'
        ? getMemoryTimeline(space.id, { importance_gte: 5, limit: 50 })
        : Promise.resolve({ events: [] }),
    [space.id, view],
  )

  const onSearchChange = useCallback((value: string) => setQuery(value), [])

  const results = search.data?.objects ?? []

  const shellDescription = (() => {
    if (view === 'search') {
      return 'Search company knowledge — documents, projects, decisions, and timeline objects.'
    }
    if (view === 'timeline') {
      return 'High-importance events across the company graph.'
    }
    return BRAIN_VIEW_COPY[view].shellDescription
  })()

  return (
    <DAOCompanyShell
      title="Memory"
      description={shellDescription}
      searchHidden={view !== 'search'}
      searchPlaceholder="Search memory…"
      searchValue={query}
      onSearchChange={onSearchChange}
      tabs={
        <UtilChipSwitch aria-label="Memory views">
          <UtilChipSwitchItem active={view === 'search'} onClick={() => setView('search')} title="Graph search">
            <Search className="size-3.5" strokeWidth={1.6} />
            Search
          </UtilChipSwitchItem>
          <UtilChipSwitchItem active={view === 'truths'} onClick={() => setView('truths')} title={BRAIN_VIEW_COPY.truths.tabHint}>
            <Brain className="size-3.5" strokeWidth={1.6} />
            {BRAIN_VIEW_COPY.truths.tabLabel}
          </UtilChipSwitchItem>
          <UtilChipSwitchItem active={view === 'wiki'} onClick={() => setView('wiki')} title={BRAIN_VIEW_COPY.wiki.tabHint}>
            <BookText className="size-3.5" strokeWidth={1.6} />
            {BRAIN_VIEW_COPY.wiki.tabLabel}
          </UtilChipSwitchItem>
          <UtilChipSwitchItem active={view === 'drive'} onClick={() => setView('drive')} title={BRAIN_VIEW_COPY.drive.tabHint}>
            <HardDrive className="size-3.5" strokeWidth={1.6} />
            {BRAIN_VIEW_COPY.drive.tabLabel}
          </UtilChipSwitchItem>
          <UtilChipSwitchItem active={view === 'reports'} onClick={() => setView('reports')} title={BRAIN_VIEW_COPY.reports.tabHint}>
            <FileText className="size-3.5" strokeWidth={1.6} />
            {BRAIN_VIEW_COPY.reports.tabLabel}
          </UtilChipSwitchItem>
          <UtilChipSwitchItem active={view === 'timeline'} onClick={() => setView('timeline')} title="Company graph events">
            <Sparkles className="size-3.5" strokeWidth={1.6} />
            Timeline
          </UtilChipSwitchItem>
        </UtilChipSwitch>
      }
      filters={
        view === 'search' ? (
          <UtilChipSwitch aria-label="Object type filter">
            {TYPE_FILTERS.map((filter) => (
              <UtilChipSwitchItem
                key={filter.key || 'all'}
                active={typeFilter === filter.key}
                onClick={() => setTypeFilter(filter.key)}
              >
                {filter.label}
              </UtilChipSwitchItem>
            ))}
          </UtilChipSwitch>
        ) : null
      }
    >
      <CompanyScroll>
        {view === 'search' ? (
          <>
            {search.loading && results.length === 0 ? (
              <CompanyLoading label="Loading memory…" />
            ) : search.error ? (
              <CompanyError message={search.error} onRetry={search.reload} />
            ) : results.length === 0 ? (
              <CompanyEmpty
                title={debounced || typeFilter ? 'No matches' : 'No objects yet'}
                description={
                  debounced || typeFilter
                    ? 'Try a different term or clear the type filter.'
                    : 'Run graph backfill or complete agent work — artifacts index here automatically.'
                }
              />
            ) : (
              <ul className="DAO-memory-results">
                {results.map((hit) => (
                  <li key={hit.id}>
                    <button type="button" className="DAO-memory-result" onClick={() => openObject(hit)}>
                      <span className="DAO-memory-result__type">{hit.object_type}</span>
                      <span className="DAO-memory-result__title">{hit.title}</span>
                      {hit.drive_path ? (
                        <span className="DAO-memory-result__path">{hit.drive_path}</span>
                      ) : null}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </>
        ) : null}

        {view === 'truths' ? <BrainTruthsPanel /> : null}
        {view === 'wiki' ? <BrainWikiPanel /> : null}
        {view === 'drive' ? <BrainDrivePanel /> : null}
        {view === 'reports' ? <BrainReportsPanel /> : null}

        {view === 'timeline' ? (
          timeline.loading ? (
            <CompanyLoading label="Loading timeline…" />
          ) : timeline.error ? (
            <CompanyError message={timeline.error} onRetry={timeline.reload} />
          ) : (timeline.data?.events ?? []).length === 0 ? (
            <CompanyEmpty
              title="No timeline events"
              description="High-importance graph events appear here as work completes."
            />
          ) : (
            <ul className="DAO-memory-timeline">
              {(timeline.data?.events ?? []).map((event) => (
                <li key={event.id}>
                  <button
                    type="button"
                    className="DAO-memory-timeline__row"
                    onClick={() =>
                      openObject({
                        id: event.object_id,
                        space_id: space.id,
                        object_type: 'event',
                        title: event.event_type,
                        status: 'active',
                      })
                    }
                  >
                    <span className="DAO-memory-timeline__type">{event.event_type.replace(/_/g, ' ')}</span>
                    <span className="DAO-memory-timeline__importance">· {event.importance}</span>
                  </button>
                </li>
              ))}
            </ul>
          )
        ) : null}
      </CompanyScroll>

      <ObjectDetailSheet
        spaceId={space.id}
        objectId={selected?.id ?? objectParam}
        onOpenChange={closeObject}
        title={selected?.title}
      />
    </DAOCompanyShell>
  )
}
