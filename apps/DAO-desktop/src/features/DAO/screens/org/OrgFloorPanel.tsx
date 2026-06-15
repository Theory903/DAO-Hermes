import { useMemo } from 'react'
import { Activity, Crown, Zap } from 'lucide-react'

import { cn } from '@/lib/utils'

import { ReusedBadge } from '../../components/ReusedBadge'
import type { CommandSnapshot } from '../../api/types'
import { useSpaceContext } from '../../context/SpaceContext'
import { COMMAND_DEPTS } from '../../lib/command-floor'
import { useCommandFloor, useSpaceEvents } from '../../hooks/useSpaceEvents'
import { CompanyError } from '../_company-shell'

function laneStatusClass(status: string): string {
  if (status === 'reused') return 'DAO-company-lane-status--reused'
  if (status === 'active') return 'DAO-company-lane-status--active'
  if (status === 'needs_approval') return 'DAO-company-lane-status--pending'
  return ''
}

function laneCardClass(status: string, isIdle: boolean): string {
  const base = isIdle ? 'DAO-company-lane DAO-company-lane--idle' : 'DAO-company-lane'
  if (status === 'active') return `${base} DAO-company-lane--active`
  if (status === 'reused') return `${base} DAO-company-lane--reused`
  return base
}

function deptIndex(dept: string): number {
  return COMMAND_DEPTS.findIndex((lane) => lane.key === dept)
}

function HandoffConnector({ fromDept, toDept, subject }: { fromDept: string; toDept: string; subject: string }) {
  const fromIndex = deptIndex(fromDept)
  const toIndex = deptIndex(toDept)
  if (fromIndex < 0 || toIndex < 0) {
    return (
      <div className="DAO-company-handoff-chip">
        <span className="DAO-company-handoff-dept">{fromDept}</span>
        <span aria-hidden="true" className="DAO-company-handoff-arrow">
          ···
        </span>
        <span className="DAO-company-handoff-dept">{toDept}</span>
        <span className="DAO-company-handoff-subject">{subject}</span>
      </div>
    )
  }

  const left = ((Math.min(fromIndex, toIndex) + 0.5) / COMMAND_DEPTS.length) * 100
  const width = (Math.abs(toIndex - fromIndex) / COMMAND_DEPTS.length) * 100

  return (
    <div className="DAO-company-handoff-chip">
      <div aria-hidden="true" className="DAO-company-handoff-rail">
        <svg className="DAO-company-handoff-svg" preserveAspectRatio="none" viewBox="0 0 100 12">
          <line className="DAO-company-handoff-line" x1={left} x2={left + width} y1="6" y2="6" />
        </svg>
      </div>
      <div className="DAO-company-handoff-meta">
        <span className="DAO-company-handoff-dept">{fromDept}</span>
        <span className="DAO-company-handoff-arrow">handoff</span>
        <span className="DAO-company-handoff-dept">{toDept}</span>
        <span className="DAO-company-handoff-subject">{subject}</span>
      </div>
    </div>
  )
}

export function OrgFloorPanel({
  leadName,
  snapshot,
  pendingHitl,
}: {
  leadName: string
  snapshot: CommandSnapshot | null | undefined
  pendingHitl: number
}) {
  const space = useSpaceContext()
  const { live, events, error: sseError } = useSpaceEvents(space.id)
  const floor = useCommandFloor(events, snapshot)

  const activeLanes = useMemo(
    () => COMMAND_DEPTS.filter((d) => floor.statuses[d.key] !== 'idle').length,
    [floor.statuses],
  )

  return (
    <section className="DAO-company-floor space-y-4">
      <div aria-label="Floor summary" className="DAO-company-stat-strip">
        <div className="DAO-company-stat DAO-company-stat--active">
          <span className="DAO-company-stat-value">{activeLanes}</span>
          <span className="DAO-company-stat-label">active lanes</span>
        </div>
        <div className="DAO-company-stat">
          <span className="DAO-company-stat-value">{floor.handoffs.length}</span>
          <span className="DAO-company-stat-label">handoffs</span>
        </div>
        <div className={cn('DAO-company-stat', pendingHitl > 0 && 'DAO-company-stat--warn')}>
          <span className="DAO-company-stat-value">{pendingHitl}</span>
          <span className="DAO-company-stat-label">awaiting approval</span>
        </div>
        <div className="DAO-company-stat">
          <span className="DAO-company-stat-value inline-flex items-center gap-1">
            <Activity className="size-3.5" strokeWidth={1.8} />
            {events.length}
          </span>
          <span className="DAO-company-stat-label">live events</span>
        </div>
      </div>

      <div className="DAO-company-lead-strip">
        <article className="DAO-company-lead-card DAO-company-lead-card--hero">
          <span aria-hidden="true" className="DAO-company-lead-avatar DAO-company-lead-avatar--icon">
            <Crown size={18} strokeWidth={1.5} />
          </span>
          <div>
            <p className="DAO-company-lead-name">{leadName}</p>
            <p className="DAO-company-lead-role">AI Lead · orchestrating the floor</p>
          </div>
          {pendingHitl > 0 ? (
            <span className="DAO-company-pill DAO-company-pill--pending">{pendingHitl} awaiting approval</span>
          ) : (
            <span className="DAO-company-pill DAO-company-pill--ready">
              <Zap aria-hidden="true" size={12} />
              {live ? 'Live' : 'Ready'}
            </span>
          )}
        </article>
      </div>

      {sseError ? <CompanyError message={sseError} /> : null}

      {floor.handoffs.length > 0 ? (
        <div className="DAO-company-handoff-strip">
          <h2 className="DAO-util-section-label">Live handoffs</h2>
          <div className="DAO-company-handoff-list">
            {floor.handoffs.map((handoff) => (
              <HandoffConnector
                fromDept={handoff.fromDept}
                key={handoff.id}
                subject={handoff.subject}
                toDept={handoff.toDept}
              />
            ))}
          </div>
        </div>
      ) : null}

      <h2 className="DAO-util-section-label">Department lanes</h2>
      <div className="DAO-company-floor-grid">
        {COMMAND_DEPTS.map((dept) => {
          const tasks = floor.lanes[dept.key]
          const status = floor.statuses[dept.key]
          const isIdle = status === 'idle'
          return (
            <article className={laneCardClass(status, isIdle)} key={dept.key} style={{ borderLeftColor: dept.color }}>
              <header className="DAO-company-lane-head">
                <p className="DAO-company-dept-name">{dept.label}</p>
                <span className={cn('DAO-company-lane-status', laneStatusClass(status))}>
                  {status.replace(/_/g, ' ')}
                </span>
              </header>
              <div className="DAO-company-lane-tasks">
                {tasks.length === 0 ? (
                  <p className="DAO-company-lane-empty">{isIdle ? 'Idle — waiting for work' : 'Listening…'}</p>
                ) : (
                  tasks.map((task) => (
                    <div className="DAO-company-task-card" key={task.id}>
                      <div className="DAO-company-task-card-head">
                        <span className="DAO-company-feed-type">{task.eventType.replace(/_/g, ' ')}</span>
                        {task.reused ? <ReusedBadge pulse={false} /> : null}
                      </div>
                      <p className="DAO-company-task-card-text">{task.text}</p>
                    </div>
                  ))
                )}
              </div>
            </article>
          )
        })}
      </div>
    </section>
  )
}
