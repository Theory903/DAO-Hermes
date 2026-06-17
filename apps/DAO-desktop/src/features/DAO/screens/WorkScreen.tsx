import { useCallback, useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'

import { UtilChipSwitch, UtilChipSwitchItem } from '@/app/util-page-nav'
import { Sheet, SheetContent } from '@/components/ui/sheet'

import { getWorkBundle } from '../api/space-api'
import type { FocusCard } from '../api/types'
import { CreateObjectForm } from '../components/objects/CreateObjectForm'
import { ObjectPrimitives } from '../components/objects/ObjectPrimitives'
import { useSpaceContext } from '../context/SpaceContext'
import { useAsync } from '../hooks/useAsync'
import { spaceRoute } from '../routes'
import {
  CompanyEmpty,
  CompanyError,
  CompanyLoading,
  CompanyScroll,
  DAOCompanyShell,
} from './_company-shell'

type WorkView = 'focus' | 'streams' | 'operations' | 'activity'

const VIEWS: { key: WorkView; label: string }[] = [
  { key: 'focus', label: 'Focus' },
  { key: 'streams', label: 'Active work' },
  { key: 'operations', label: 'Operations' },
  { key: 'activity', label: 'Activity' },
]

function parseWorkView(raw: string | null): WorkView {
  if (raw === 'streams' || raw === 'operations' || raw === 'activity' || raw === 'focus') {
    return raw
  }
  return 'focus'
}

export function WorkScreen() {
  const space = useSpaceContext()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const view = parseWorkView(searchParams.get('view'))
  const objectId = searchParams.get('object')

  const setView = useCallback(
    (next: WorkView) => {
      const params = new URLSearchParams(searchParams)
      if (next === 'focus') params.delete('view')
      else params.set('view', next)
      setSearchParams(params, { replace: true })
    },
    [searchParams, setSearchParams],
  )

  const setObjectId = useCallback(
    (id: string | null) => {
      const params = new URLSearchParams(searchParams)
      if (id) params.set('object', id)
      else params.delete('object')
      setSearchParams(params, { replace: true })
    },
    [searchParams, setSearchParams],
  )

  const bundle = useAsync(() => getWorkBundle(space.id), [space.id])

  const handleFocusSelect = useCallback(
    (item: FocusCard) => {
      if (item.kind === 'hitl') {
        navigate(`${spaceRoute(space.slug, 'inbox')}?id=${encodeURIComponent(item.id)}`)
        return
      }
      const oid = item.object_id ?? (item.kind === 'decision' ? item.id : null)
      if (oid) setObjectId(oid)
    },
    [navigate, setObjectId, space.slug],
  )

  return (
    <DAOCompanyShell
      title="Work"
      description="What needs attention, what is running, and what shipped — from the company graph."
      searchHidden
      tabs={
        <UtilChipSwitch aria-label="Work view">
          {VIEWS.map((item) => (
            <UtilChipSwitchItem
              key={item.key}
              active={view === item.key}
              onClick={() => setView(item.key)}
            >
              {item.label}
            </UtilChipSwitchItem>
          ))}
        </UtilChipSwitch>
      }
    >
      <CompanyScroll>
        {bundle.loading ? (
          <CompanyLoading label="Loading work…" />
        ) : bundle.error ? (
          <CompanyError message={bundle.error} onRetry={bundle.reload} />
        ) : !bundle.data ? (
          <CompanyEmpty title="No work data" description="Backfill the company graph to populate this lens." />
        ) : (
          <div className="DAO-work-lens">
            {view === 'focus' ? (
              <WorkFocusPanel items={bundle.data.focus} onSelect={handleFocusSelect} />
            ) : null}
            {view === 'streams' ? (
              <WorkStreamsPanel
                streams={bundle.data.active_work}
                projects={bundle.data.projects}
                onReload={bundle.reload}
                onSelect={(id) => setObjectId(id)}
              />
            ) : null}
            {view === 'operations' ? (
              <WorkOperationsPanel operations={bundle.data.operations} onSelect={(id) => setObjectId(id)} />
            ) : null}
            {view === 'activity' ? (
              <WorkActivityPanel activity={bundle.data.activity} onSelect={(id) => setObjectId(id)} />
            ) : null}
          </div>
        )}
      </CompanyScroll>

      <Sheet open={objectId !== null} onOpenChange={(open) => !open && setObjectId(null)}>
        <SheetContent className="DAO-object-sheet" side="right">
          {objectId ? (
            <ObjectPrimitives
              objectId={objectId}
              onMerged={setObjectId}
              onSelectObject={setObjectId}
              spaceId={space.id}
            />
          ) : null}
        </SheetContent>
      </Sheet>
    </DAOCompanyShell>
  )
}

function WorkFocusPanel({
  items,
  onSelect,
}: {
  items: FocusCard[]
  onSelect: (item: FocusCard) => void
}) {
  if (items.length === 0) {
    return (
      <CompanyEmpty
        title="Focus queue is clear"
        description="Pending approvals and open decisions show up here."
      />
    )
  }
  return (
    <ul className="DAO-work-focus">
      {items.map((item) => {
        const hasObject = Boolean(item.object_id ?? (item.kind === 'decision' ? item.id : null))
        const isHitl = item.kind === 'hitl'
        return (
          <li key={item.id}>
            <button
              type="button"
              className="DAO-work-focus__card"
              onClick={() => onSelect(item)}
              disabled={!isHitl && !hasObject}
            >
              <span className="DAO-work-focus__kind">{item.kind}</span>
              <span className="DAO-work-focus__title">{item.title}</span>
              {item.context && item.context !== item.title ? (
                <p className="DAO-work-focus__context">{item.context}</p>
              ) : null}
              {isHitl ? (
                <span className="DAO-work-focus__hint">Opens Inbox →</span>
              ) : null}
            </button>
          </li>
        )
      })}
    </ul>
  )
}

function WorkStreamsPanel({
  streams,
  projects,
  onSelect,
  onReload,
}: {
  streams: Array<{ object_id: string; title: string; verb: string; object_type: string }>
  projects: Array<{ id: string; title: string; status: string }>
  onSelect: (id: string) => void
  onReload: () => void
}) {
  if (streams.length === 0 && projects.length === 0) {
    return (
      <>
        <CreateObjectForm onCreated={onReload} />
        <CompanyEmpty
          title="No active streams"
          description="Create a project or resolve a handoff to see outcome-named work here."
        />
      </>
    )
  }
  return (
    <div className="DAO-work-streams">
      <CreateObjectForm onCreated={onReload} />
      {streams.length > 0 ? (
        <section>
          <h3 className="DAO-util-section-label">Active streams</h3>
          <ul className="DAO-work-stream-list">
            {streams.map((stream) => (
              <li key={stream.object_id}>
                <button type="button" className="DAO-work-stream" onClick={() => onSelect(stream.object_id)}>
                  <span className="DAO-work-stream__verb">{stream.verb}</span>
                  <span className="DAO-work-stream__title">{stream.title}</span>
                  <span className="DAO-company-pill">{stream.object_type}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      {projects.length > 0 ? (
        <section>
          <h3 className="DAO-util-section-label">Projects</h3>
          <ul className="DAO-work-stream-list">
            {projects.map((project) => (
              <li key={project.id}>
                <button type="button" className="DAO-work-stream" onClick={() => onSelect(project.id)}>
                  <span className="DAO-work-stream__title">{project.title}</span>
                  <span className="DAO-company-pill">{project.status}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  )
}

function WorkOperationsPanel({
  operations,
  onSelect,
}: {
  operations: {
    verbs: Array<{ key: string; label: string }>
    lanes: Record<string, Array<{ object_id: string; title: string; headline: string }>>
  }
  onSelect: (id: string) => void
}) {
  return (
    <div className="DAO-work-operations">
      {operations.verbs.map((verb) => {
        const lane = operations.lanes[verb.key] ?? []
        return (
          <section key={verb.key} className="DAO-work-ops-column">
            <h3 className="DAO-work-ops-column__label">{verb.label}</h3>
            {lane.length === 0 ? (
              <p className="DAO-work-ops-empty">Quiet</p>
            ) : (
              <ul>
                {lane.map((item) => (
                  <li key={item.object_id}>
                    <button type="button" className="DAO-work-ops-card" onClick={() => onSelect(item.object_id)}>
                      <span className="DAO-work-ops-card__headline">{item.headline}</span>
                      <span className="DAO-work-ops-card__title">{item.title}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )
      })}
    </div>
  )
}

function WorkActivityPanel({
  activity,
  onSelect,
}: {
  activity: Array<{
    id: string
    object_id: string
    headline: string
    object_title: string
    importance: number
    at?: string | null
  }>
  onSelect: (id: string) => void
}) {
  if (activity.length === 0) {
    return <CompanyEmpty title="No recent activity" description="High-importance events appear in this feed." />
  }
  return (
    <ul className="DAO-work-activity">
      {activity.map((item) => (
        <li key={item.id}>
          <button type="button" className="DAO-work-activity__row" onClick={() => onSelect(item.object_id)}>
            <span className="DAO-work-activity__headline">{item.headline}</span>
            <span className="DAO-work-activity__title">{item.object_title}</span>
            <span className="DAO-work-activity__meta">· {item.importance}</span>
          </button>
        </li>
      ))}
    </ul>
  )
}
